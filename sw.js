/*
	Service worker: makes the app installable and usable offline.

	- App files (same origin): network first, so an online visit always gets the latest version
	  and local edits show up on reload; the cache answers when offline or when the network is too slow.
	- Map tiles, photos, Leaflet and fonts: cache first; they don't change.
	  Tiles and photos seen while browsing go to shared caches, which are trimmed when they grow too large.
	  "Stáhnout pro offline" (js/services/offline-download.js) keeps its files in one cache per plan;
	  those are only read here, never trimmed, and the app deletes them together with the plan.
	- Photo lookups (Wikimedia Commons and Wikipedia APIs): network first, cache as fallback.

	APP_SHELL_FILES must list every file the app loads. Bump APP_SHELL_VERSION whenever the list changes.
*/

const APP_SHELL_VERSION = 2;
const APP_SHELL_CACHE_PREFIX = "app-shell-v";
const APP_SHELL_CACHE = `${APP_SHELL_CACHE_PREFIX}${APP_SHELL_VERSION}`;
const LIBRARY_CACHE = "libraries";
const TILE_CACHE = "map-tiles";
const PHOTO_CACHE = "photos";
const PHOTO_LOOKUP_CACHE = "photo-lookups";
const CURRENT_CACHES = new Set([APP_SHELL_CACHE, LIBRARY_CACHE, TILE_CACHE, PHOTO_CACHE, PHOTO_LOOKUP_CACHE]);
// Caches written by js/services/offline-download.js, one per downloaded plan; keep the prefix in sync with it.
const DOWNLOADED_PLAN_CACHE_PREFIX = "downloaded-plan:";

const APP_SHELL_FILES = [
	"./",
	"index.html",
	"manifest.webmanifest",
	"css/theme.css",
	"css/layout.css",
	"css/components.css",
	"css/sidebar.css",
	"css/map.css",
	"css/detail-card.css",
	"css/plans-panel.css",
	"js/main.js",
	"js/data/active-plan.js",
	"js/data/plan-format.js",
	"js/data/plan-link.js",
	"js/data/plan-store.js",
	"js/map/base-map.js",
	"js/map/map-focus.js",
	"js/map/place-markers.js",
	"js/map/user-location.js",
	"js/services/offline-download.js",
	"js/services/place-photos.js",
	"js/state/app-state.js",
	"js/ui/detail-card.js",
	"js/ui/map-notice.js",
	"js/ui/plans-panel.js",
	"js/ui/sidebar.js",
	"js/ui/tags.js",
	"js/ui/toast.js",
	"js/ui/url-hash.js",
	"js/utils/geo-distance.js",
	"js/utils/html.js",
	"js/utils/media-queries.js",
	"plans/saske-svycarsko.json",
	"icons/icon.svg",
	"icons/icon-192.png",
	"icons/icon-512.png",
	"icons/icon-maskable-512.png",
	"icons/apple-touch-icon.png",
];

// The font files themselves differ per browser, so they are cached on first use instead.
const LIBRARY_FILES = [
	"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
	"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
	"https://unpkg.com/leaflet@1.9.4/dist/images/layers.png",
	"https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png",
	"https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap",
];

// On a weak mobile signal, waiting longer than this for fresh app files is worse than using cached ones.
const NETWORK_TIMEOUT_IN_MILLISECONDS = 2500;
// About 5000 tiles is 100–150 MB: room for several downloaded trips plus browsing.
const MAXIMUM_TILE_CACHE_ENTRIES = 5000;
const MAXIMUM_PHOTO_CACHE_ENTRIES = 500;
// Counting a cache's entries on every write would be slow; trimming every so many writes is enough.
const WRITES_BETWEEN_CACHE_TRIMS = 50;

const TILE_HOST_PATTERN = /(^|\.)tile\.opentopomap\.org$|^server\.arcgisonline\.com$/;
const LIBRARY_HOSTS = new Set(["unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"]);

const writeCountsByCacheName = new Map();

self.addEventListener("install", installEvent => {
	installEvent.waitUntil((async () => {
		const appShellCache = await caches.open(APP_SHELL_CACHE);
		// cache: "reload" skips the browser's HTTP cache, so a new version never stores stale files.
		await appShellCache.addAll(APP_SHELL_FILES.map(path => new Request(path, { cache: "reload" })));
		try {
			const libraryCache = await caches.open(LIBRARY_CACHE);
			await libraryCache.addAll(LIBRARY_FILES.map(url => new Request(url, { mode: "cors" })));
		} catch (error) {
			// A CDN being down shouldn't block the update; the files get cached on their next use instead.
			console.warn("Libraries could not be precached:", error);
		}
		await self.skipWaiting();
	})());
});

self.addEventListener("activate", activateEvent => {
	activateEvent.waitUntil((async () => {
		// Older app versions and caches this version no longer uses (e.g. renamed ones) are removed.
		const outdatedCaches = (await caches.keys())
			.filter(name => !CURRENT_CACHES.has(name) && !name.startsWith(DOWNLOADED_PLAN_CACHE_PREFIX));
		await Promise.all(outdatedCaches.map(name => caches.delete(name)));
		await self.clients.claim();
	})());
});

self.addEventListener("fetch", fetchEvent => {
	const request = fetchEvent.request;
	if (request.method !== "GET") {
		return;
	}
	const url = new URL(request.url);

	if (url.origin === self.location.origin) {
		fetchEvent.respondWith(networkFirst(fetchEvent, APP_SHELL_CACHE, { isNavigation: request.mode === "navigate" }));
	} else if (TILE_HOST_PATTERN.test(url.hostname)) {
		fetchEvent.respondWith(cacheFirst(fetchEvent, TILE_CACHE, MAXIMUM_TILE_CACHE_ENTRIES));
	} else if (isPhotoLookupRequest(url)) {
		fetchEvent.respondWith(networkFirst(fetchEvent, PHOTO_LOOKUP_CACHE));
	} else if (LIBRARY_HOSTS.has(url.hostname)) {
		fetchEvent.respondWith(cacheFirst(fetchEvent, LIBRARY_CACHE));
	} else if (isPhotoRequest(request, url)) {
		fetchEvent.respondWith(cacheFirst(fetchEvent, PHOTO_CACHE, MAXIMUM_PHOTO_CACHE_ENTRIES));
	}
	// Anything else (map links, Wikipedia pages, …) goes straight to the network.
});

/** Wikimedia Commons and Wikipedia API queries that find the place photos. */
function isPhotoLookupRequest(url) {
	const isWikimediaApiHost = url.hostname === "commons.wikimedia.org" || url.hostname.endsWith(".wikipedia.org");
	return isWikimediaApiHost && url.pathname === "/w/api.php";
}

/**
 * Images shown in the detail card, plus photos fetched by "Stáhnout pro offline"
 * (served from upload. or thumb.wikimedia.org; a plain fetch() of those has no "image" destination).
 */
function isPhotoRequest(request, url) {
	return request.destination === "image" || url.hostname.endsWith(".wikimedia.org");
}

async function networkFirst(fetchEvent, cacheName, { isNavigation = false } = {}) {
	const request = fetchEvent.request;
	const cache = await caches.open(cacheName);
	const networkResponsePromise = fetch(request).then(response => {
		if (response.ok) {
			// Copies the response into the cache even if the cached version was already sent after the timeout.
			fetchEvent.waitUntil(cache.put(request, response.clone()));
		}
		return response;
	});
	// Keeps the worker alive until the network answers, so the cache gets refreshed either way.
	fetchEvent.waitUntil(networkResponsePromise.catch(() => {}));

	try {
		return await rejectAfterTimeout(networkResponsePromise, NETWORK_TIMEOUT_IN_MILLISECONDS);
	} catch {
		// Navigations may carry a query string; the app is the same page regardless.
		const cachedResponse = await cache.match(request, { ignoreSearch: isNavigation, ignoreVary: true })
			?? (isNavigation ? await cache.match("./") : undefined);
		return cachedResponse ?? networkResponsePromise;
	}
}

async function cacheFirst(fetchEvent, cacheName, maximumEntries = Infinity) {
	const request = fetchEvent.request;
	// Searches all caches, so tiles and photos downloaded for a plan are found in that plan's cache.
	const cachedResponse = await caches.match(request, { ignoreVary: true });
	// An opaque (no-cors) copy can't answer a CORS request; fetch a proper one instead.
	const isUsable = cachedResponse && !(cachedResponse.type === "opaque" && request.mode === "cors");
	if (isUsable) {
		return cachedResponse;
	}

	const networkResponse = await fetch(request);
	if (networkResponse.ok || networkResponse.type === "opaque") {
		const responseCopy = networkResponse.clone();
		fetchEvent.waitUntil((async () => {
			const cache = await caches.open(cacheName);
			await cache.put(request, responseCopy);
			await trimCacheNowAndThen(cacheName, maximumEntries);
		})());
	}
	return networkResponse;
}

/** Drops the oldest entries (Cache API keeps insertion order) once a cache grows past its limit. */
async function trimCacheNowAndThen(cacheName, maximumEntries) {
	if (!Number.isFinite(maximumEntries)) {
		return;
	}
	// The browser stops an idle worker and the counts start again from zero, so the first write after
	// every start trims too; otherwise a cache that fills slowly would never be trimmed.
	const earlierWriteCount = writeCountsByCacheName.get(cacheName) ?? 0;
	writeCountsByCacheName.set(cacheName, earlierWriteCount + 1);
	if (earlierWriteCount % WRITES_BETWEEN_CACHE_TRIMS !== 0) {
		return;
	}
	const cache = await caches.open(cacheName);
	const cachedRequests = await cache.keys();
	const excessCount = cachedRequests.length - maximumEntries;
	for (const cachedRequest of cachedRequests.slice(0, Math.max(0, excessCount))) {
		await cache.delete(cachedRequest);
	}
}

function rejectAfterTimeout(promise, timeoutInMilliseconds) {
	return new Promise((resolve, reject) => {
		const timeoutTimer = setTimeout(() => reject(new Error("Network timeout")), timeoutInMilliseconds);
		promise.then(
			value => {
				clearTimeout(timeoutTimer);
				resolve(value);
			},
			error => {
				clearTimeout(timeoutTimer);
				reject(error);
			},
		);
	});
}
