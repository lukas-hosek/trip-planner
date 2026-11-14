/*
	"Stáhnout pro offline": fetches the map tiles around the plan's places and the place photos
	and keeps them in a cache of the plan's own, so the map works without signal on the trail.
	The service worker answers from that cache but never trims it; it is deleted together with the plan.

	Tile servers are run by volunteers and discourage bulk downloads, so this stays modest:
	an overview of the whole area, close-ups only around the places, a hard cap, and few parallel requests.
	Only the default (hiking) layer is downloaded.
*/

import { BASE_LAYER_DEFINITIONS, buildTileUrl, HIGHEST_DOWNLOADED_ZOOM } from "../map/base-map.js";
import { appState } from "../state/app-state.js";

// One cache per downloaded plan. sw.js finds the files by searching all caches and never deletes these.
const DOWNLOADED_PLAN_CACHE_PREFIX = "downloaded-plan:";

const OVERVIEW_ZOOM_LEVELS = [9, 10, 11, 12];
// The screen shows more than just the places' bounds, so the overview reaches this far beyond them (as a share of their size).
const OVERVIEW_PADDING_RATIO = .5;
// Overview zoom levels are added from the coarsest one until they would exceed this many tiles (large trips).
const OVERVIEW_TILE_BUDGET = 250;
const LOWEST_DETAIL_ZOOM = 13;
const DETAIL_RADIUS_IN_KILOMETERS = 1;
// A place takes about 50 close-up tiles, so this covers a plan of some 40 places.
const MAXIMUM_TILE_COUNT = 2000;
const PARALLEL_REQUEST_COUNT = 4;
const KILOMETERS_PER_DEGREE_OF_LATITUDE = 111.32;

/**
 * @param planKey     the stored plan's key; it names the cache the download goes to
 * @param onProgress  called with { completedCount, totalCount } after every finished file
 * @returns {{ totalCount, failedCount }}
 */
export async function downloadPlanForOffline(planKey, places, placesBounds, onProgress) {
	const tileUrls = listTileUrls(places, placesBounds);
	const photoUrls = [...appState.photosByPlaceId.values()].map(photo => photo.imageUrl);
	const urls = [...tileUrls, ...photoUrls];
	const planCache = await caches.open(DOWNLOADED_PLAN_CACHE_PREFIX + planKey);

	let completedCount = 0;
	let failedCount = 0;
	await runInParallel(urls, PARALLEL_REQUEST_COUNT, async url => {
		try {
			// A repeated download (after a weak signal, or of an updated plan) only fetches what is missing.
			if (!await planCache.match(url, { ignoreVary: true })) {
				// CORS mode, exactly as the map and the detail card load tiles and photos, so the stored copies can answer them.
				// The service worker serves the file from its own caches if the user has already seen it.
				const response = await fetch(url, { mode: "cors", credentials: "omit" });
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				await planCache.put(url, response);
			}
		} catch {
			failedCount++;
		}
		completedCount++;
		onProgress({ completedCount, totalCount: urls.length });
	});

	await removeTilesNoLongerNeeded(planCache, tileUrls);
	return { totalCount: urls.length, failedCount };
}

/** Removes the plan's offline map and photos; called when the plan is deleted. */
export async function deletePlanDownload(planKey) {
	try {
		// The Cache API only exists on https:// (or localhost).
		await globalThis.caches?.delete(DOWNLOADED_PLAN_CACHE_PREFIX + planKey);
	} catch (error) {
		console.warn("The plan's offline download could not be removed:", error);
	}
}

/**
 * After an updated plan is downloaded again, tiles around places it no longer has would stay forever.
 * Photos are left alone: which photos the plan needs comes from lookups that may have failed this time.
 */
async function removeTilesNoLongerNeeded(planCache, neededTileUrls) {
	const neededUrls = new Set(neededTileUrls);
	const tileOrigins = new Set(neededTileUrls.map(tileUrl => new URL(tileUrl).origin));
	for (const cachedRequest of await planCache.keys()) {
		if (tileOrigins.has(new URL(cachedRequest.url).origin) && !neededUrls.has(cachedRequest.url)) {
			await planCache.delete(cachedRequest);
		}
	}
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
	for (let zoom = LOWEST_DETAIL_ZOOM; zoom <= HIGHEST_DOWNLOADED_ZOOM; zoom++) {
		for (const place of places) {
			// Near a pole the box around a place spans the whole globe; once the cap is reached, no more boxes are worked out.
			if (tileKeys.size >= MAXIMUM_TILE_COUNT) {
				break;
			}
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
