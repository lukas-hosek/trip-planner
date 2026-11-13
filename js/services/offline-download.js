/*
	"Stáhnout pro offline": requests the map tiles around the plan's places and the place photos,
	so the service worker stores them and the map works without signal on the trail.

	Tile servers are run by volunteers and discourage bulk downloads, so this stays modest:
	an overview of the whole area, close-ups only around the places, a hard cap, and few parallel requests.
	Only the default (hiking) layer is downloaded.
*/

import { BASE_LAYER_DEFINITIONS, buildTileUrl } from "../map/base-map.js";
import { appState } from "../state/app-state.js";

const OVERVIEW_ZOOM_LEVELS = [9, 10, 11, 12];
// The screen shows more than just the places' bounds, so the overview reaches this far beyond them (as a share of their size).
const OVERVIEW_PADDING_RATIO = .5;
// Overview zoom levels are added from the coarsest one until they would exceed this many tiles (large trips).
const OVERVIEW_TILE_BUDGET = 250;
const DETAIL_ZOOM_LEVELS = [13, 14, 15];
const DETAIL_RADIUS_IN_KILOMETERS = 1;
const MAXIMUM_TILE_COUNT = 1000;
const PARALLEL_REQUEST_COUNT = 4;
const KILOMETERS_PER_DEGREE_OF_LATITUDE = 111.32;

/**
 * @param onProgress  called with { completedCount, totalCount } after every finished request
 * @returns {{ totalCount, failedCount }}
 */
export async function downloadPlanForOffline(places, placesBounds, onProgress) {
	// Tiles and photos are requested in CORS mode, exactly as the map and the detail card load them, so the cached copies match.
	const requests = [
		...listTileUrls(places, placesBounds),
		...[...appState.photosByPlaceId.values()].map(photo => photo.imageUrl),
	];

	let completedCount = 0;
	let failedCount = 0;
	await runInParallel(requests, PARALLEL_REQUEST_COUNT, async url => {
		try {
			const response = await fetch(url, { mode: "cors", credentials: "omit" });
			if (!response.ok) {
				failedCount++;
			}
		} catch {
			failedCount++;
		}
		completedCount++;
		onProgress({ completedCount, totalCount: requests.length });
	});
	return { totalCount: requests.length, failedCount };
}

function listTileUrls(places, placesBounds) {
	const layerDefinition = BASE_LAYER_DEFINITIONS[0];
	const tileKeys = new Set();

	const overviewBounds = placesBounds.pad(OVERVIEW_PADDING_RATIO);
	for (const zoom of OVERVIEW_ZOOM_LEVELS) {
		const zoomTiles = listTilesInBox(overviewBounds.getSouth(), overviewBounds.getWest(), overviewBounds.getNorth(), overviewBounds.getEast(), zoom);
		if (tileKeys.size + zoomTiles.length > OVERVIEW_TILE_BUDGET) {
			break;
		}
		zoomTiles.forEach(tile => tileKeys.add(tile));
	}

	// Zoom level by zoom level, so if the cap is reached, every place still has its coarser close-ups.
	for (const zoom of DETAIL_ZOOM_LEVELS) {
		for (const place of places) {
			const latitudeRadius = DETAIL_RADIUS_IN_KILOMETERS / KILOMETERS_PER_DEGREE_OF_LATITUDE;
			const longitudeRadius = latitudeRadius / Math.cos(place.latitude * Math.PI / 180);
			const placeTiles = listTilesInBox(
				place.latitude - latitudeRadius, place.longitude - longitudeRadius,
				place.latitude + latitudeRadius, place.longitude + longitudeRadius,
				zoom,
			);
			for (const tile of placeTiles) {
				if (tileKeys.size >= MAXIMUM_TILE_COUNT) {
					break;
				}
				tileKeys.add(tile);
			}
		}
	}

	return [...tileKeys].map(tileKey => {
		const [z, x, y] = tileKey.split("/").map(Number);
		return buildTileUrl(layerDefinition, { x, y, z });
	});
}

/** @returns "z/x/y" keys of the tiles covering the box */
function listTilesInBox(south, west, north, east, zoom) {
	const minimumX = longitudeToTileX(west, zoom);
	const maximumX = longitudeToTileX(east, zoom);
	// Tile rows grow southwards, so the northern edge gives the smaller y.
	const minimumY = latitudeToTileY(north, zoom);
	const maximumY = latitudeToTileY(south, zoom);
	const tileKeys = [];
	for (let x = minimumX; x <= maximumX; x++) {
		for (let y = minimumY; y <= maximumY; y++) {
			tileKeys.push(`${zoom}/${x}/${y}`);
		}
	}
	return tileKeys;
}

function longitudeToTileX(longitude, zoom) {
	const tileCount = 2 ** zoom;
	return clampTileIndex(Math.floor((longitude + 180) / 360 * tileCount), tileCount);
}

/** Web Mercator, as used by all common tile servers. */
function latitudeToTileY(latitude, zoom) {
	const tileCount = 2 ** zoom;
	const latitudeInRadians = latitude * Math.PI / 180;
	const mercatorY = Math.log(Math.tan(latitudeInRadians) + 1 / Math.cos(latitudeInRadians));
	return clampTileIndex(Math.floor((1 - mercatorY / Math.PI) / 2 * tileCount), tileCount);
}

function clampTileIndex(index, tileCount) {
	return Math.min(Math.max(index, 0), tileCount - 1);
}

async function runInParallel(items, parallelCount, handleItem) {
	let nextIndex = 0;
	async function worker() {
		while (nextIndex < items.length) {
			const item = items[nextIndex++];
			await handleItem(item);
		}
	}
	await Promise.all(Array.from({ length: parallelCount }, worker));
}
