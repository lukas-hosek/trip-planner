/*
	The plan menu's offline download: fetches the map tiles around a plan's places and the place photos
	and keeps them in a cache of the plan's own, so the map works without signal on the trail.
	The service worker answers from that cache but never trims it; it is deleted together with the plan
	or by "Uvolnit offline data". Any stored plan can be downloaded, not only the open one.
	An updated plan (same name, so the same cache) keeps its data but shows it as outdated until it is downloaded again.

	Tile servers are run by volunteers and discourage bulk downloads, so this stays modest:
	an overview of the whole area, close-ups only around the places, a hard cap, and few parallel requests.
	Only the default (hiking) layer is downloaded.
*/

import { BASE_LAYER_DEFINITIONS, buildTileUrl, HIGHEST_DOWNLOADED_ZOOM } from "../map/base-map.js";

// One cache per downloaded plan. sw.js finds the files by searching all caches and never deletes these.
const DOWNLOADED_PLAN_CACHE_PREFIX = "downloaded-plan:";
/*
	Written into the plan's cache when a download finishes: only then does the plan count as offline.
	It lives in the same cache, so it goes with it. The app never requests this address, so it can't answer anything else.
*/
const DOWNLOAD_SUMMARY_URL = new URL("offline-download-summary.json", window.location.href).href;

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
 * @param photoUrls   the image URLs of the plan's photos (js/services/place-photos.js finds them)
 * @param onProgress  called with { completedCount, totalCount } after every finished file
 * @returns {{ totalCount, failedCount }}
 */
export async function downloadPlanForOffline(planKey, places, placesBounds, photoUrls, onProgress) {
	const tileUrls = listTileUrls(places, placesBounds);
	const urls = [...tileUrls, ...photoUrls];
	const planCache = await caches.open(DOWNLOADED_PLAN_CACHE_PREFIX + planKey);
	// Until this download finishes, the plan no longer counts as complete.
	await planCache.delete(DOWNLOAD_SUMMARY_URL);

	let completedCount = 0;
	let failedCount = 0;
	let byteCount = 0;
	await runInParallel(urls, PARALLEL_REQUEST_COUNT, async url => {
		try {
			// A repeated download (after a weak signal, or of an updated plan) only fetches what is missing.
			let response = await planCache.match(url, { ignoreVary: true });
			if (!response) {
				// CORS mode, exactly as the map and the detail card load tiles and photos, so the stored copies can answer them.
				// The service worker serves the file from its own caches if the user has already seen it.
				response = await fetch(url, { mode: "cors", credentials: "omit" });
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				await planCache.put(url, response.clone());
			}
			byteCount += await measureResponseSize(response);
		} catch {
			failedCount++;
		}
		completedCount++;
		onProgress({ completedCount, totalCount: urls.length });
	});

	await removeTilesNoLongerNeeded(planCache, tileUrls);
	const placesFingerprint = await computePlacesFingerprint(places);
	const summary = { byteCount, failedCount, placesFingerprint, completedAt: new Date().toISOString() };
	await planCache.put(DOWNLOAD_SUMMARY_URL, new Response(JSON.stringify(summary), { headers: { "Content-Type": "application/json" } }));
	return { totalCount: urls.length, failedCount };
}

/**
 * @param places  the stored plan's current places (null when the plan can't be read), to tell whether the download still matches them
 * @returns null when the plan has no offline data; otherwise { isComplete, isOutdated, byteCount, failedCount },
 *   where an interrupted download (or one from an older app version) has isComplete false and byteCount null,
 *   and isOutdated means the plan's places changed since the download (or it predates fingerprints), so isComplete is false too
 */
export async function getPlanDownloadSummary(planKey, places) {
	try {
		// The Cache API only exists on https:// (or localhost).
		const cacheName = DOWNLOADED_PLAN_CACHE_PREFIX + planKey;
		if (!globalThis.caches || !await caches.has(cacheName)) {
			return null;
		}
		const summaryResponse = await (await caches.open(cacheName)).match(DOWNLOAD_SUMMARY_URL);
		const summary = summaryResponse ? await summaryResponse.json() : null;
		if (!summary) {
			return { isComplete: false, isOutdated: false, byteCount: null, failedCount: null };
		}
		// An unreadable plan can't be compared; its status then rests on the download alone.
		const isOutdated = places !== null && summary.placesFingerprint !== await computePlacesFingerprint(places);
		return {
			isComplete: summary.failedCount === 0 && !isOutdated,
			isOutdated,
			byteCount: Number(summary.byteCount) || 0,
			failedCount: summary.failedCount,
		};
	} catch (error) {
		console.warn("The plan's offline status could not be read:", error);
		return null;
	}
}

/** Removes the plan's offline map and photos: "Uvolnit offline data", and when the plan is deleted. */
export async function deletePlanDownload(planKey) {
	try {
		// The Cache API only exists on https:// (or localhost).
		await globalThis.caches?.delete(DOWNLOADED_PLAN_CACHE_PREFIX + planKey);
	} catch (error) {
		console.warn("The plan's offline download could not be removed:", error);
	}
}

/**
 * Sums up what a download depends on: where the places are (the tiles) and which photos they name.
 * Other edits (descriptions, tags, colours) leave it unchanged, so they don't make the offline data look outdated.
 * Order doesn't matter, so reordering the itinerary doesn't either.
 */
async function computePlacesFingerprint(places) {
	const placeEntries = places.map(place => JSON.stringify([
		place.latitude,
		place.longitude,
		place.commons?.fileTitle ?? null,
		place.wikipediaArticles.map(article => article.url),
	])).toSorted();
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(placeEntries.join("\n")));
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
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

/** Content-Length when the server sends it (it is readable even for CORS responses), else the body's real size. */
async function measureResponseSize(response) {
	const contentLength = Number(response.headers.get("Content-Length"));
	if (contentLength > 0) {
		return contentLength;
	}
	return (await response.clone().blob()).size;
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
