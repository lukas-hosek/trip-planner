/*
	Creates the Leaflet map and its background tile layers.
	Tiles are cached by the service worker, so offline the map shows whatever was viewed or downloaded before;
	if tiles fail to load, a notice explains why parts of the map are blank.
*/

import { hideMapNotice, showMapNotice } from "../ui/map-notice.js";

const OPENSTREETMAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** The first layer is the default one, and the only one "Stáhnout pro offline" downloads. */
export const BASE_LAYER_DEFINITIONS = [
	{
		name: "Turistická (OpenTopoMap)",
		urlTemplate: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
		options: {
			subdomains: "abc",
			maxZoom: 17,
			attribution: `${OPENSTREETMAP_ATTRIBUTION}, SRTM | <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
		},
	},
	{
		name: "Letecká (Esri)",
		urlTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
		options: {
			maxZoom: 18,
			attribution: "Imagery &copy; Esri",
		},
	},
];

/**
 * "Stáhnout pro offline" saves the default layer up to this zoom. While offline, the layer stretches
 * these tiles for deeper zooms instead of showing blank ones.
 */
export const HIGHEST_DOWNLOADED_ZOOM = 16;

// Below this span (in degrees, about 2 km) the map would zoom in absurdly far on a one-place plan.
const MINIMUM_BOUNDS_SPAN_IN_DEGREES = 0.02;
// A couple of failed tiles can be bad luck; several mean the server (or the network) is unreachable.
const FAILED_TILES_BEFORE_NOTICE = 3;

const OFFLINE_NOTICE = "Jste offline. Mapa se zobrazí jen tam, kde je uložená (Moje plány → Stáhnout pro offline).";
const TILES_UNAVAILABLE_NOTICE = "Mapové podklady se nepodařilo načíst. Zobrazuji jen uložené části mapy.";

/** Bounds around all places, grown to a minimum size so a single place doesn't end up at maximum zoom. */
export function computePlacesBounds(places) {
	const bounds = L.latLngBounds(places.map(place => [place.latitude, place.longitude]));
	const center = bounds.getCenter();
	const halfLatitudeSpan = Math.max(bounds.getNorth() - bounds.getSouth(), MINIMUM_BOUNDS_SPAN_IN_DEGREES) / 2;
	const halfLongitudeSpan = Math.max(bounds.getEast() - bounds.getWest(), MINIMUM_BOUNDS_SPAN_IN_DEGREES) / 2;
	return L.latLngBounds(
		[center.lat - halfLatitudeSpan, center.lng - halfLongitudeSpan],
		[center.lat + halfLatitudeSpan, center.lng + halfLongitudeSpan],
	);
}

export function createMap(containerElementId, placesBounds) {
	const map = L.map(containerElementId, { maxZoom: 17 });
	map.fitBounds(placesBounds, { padding: [30, 30] });
	L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
	return map;
}

export function addBaseLayers(map) {
	const tileLayersByName = {};
	for (const layerDefinition of BASE_LAYER_DEFINITIONS) {
		// crossOrigin makes tiles CORS requests, which the service worker can cache at their real size
		// (opaque responses count as megabytes each against the storage quota).
		tileLayersByName[layerDefinition.name] = L.tileLayer(layerDefinition.urlTemplate, { ...layerDefinition.options, crossOrigin: true });
	}
	const defaultLayer = tileLayersByName[BASE_LAYER_DEFINITIONS[0].name];
	// Leaflet reads maxNativeZoom every time it lays tiles out, so changing the option and redrawing is enough.
	function stretchDownloadedTilesWhileOffline() {
		defaultLayer.options.maxNativeZoom = navigator.onLine ? undefined : HIGHEST_DOWNLOADED_ZOOM;
	}
	stretchDownloadedTilesWhileOffline();
	defaultLayer.addTo(map);
	L.control.layers(tileLayersByName, null, { position: "topright" }).addTo(map);
	window.addEventListener("offline", () => {
		stretchDownloadedTilesWhileOffline();
		defaultLayer.redraw();
	});

	let failedTileCount = 0;
	for (const tileLayer of Object.values(tileLayersByName)) {
		tileLayer.on("tileerror", () => {
			failedTileCount++;
			if (failedTileCount === FAILED_TILES_BEFORE_NOTICE) {
				showMapNotice(navigator.onLine ? TILES_UNAVAILABLE_NOTICE : OFFLINE_NOTICE);
			}
		});
	}

	// Leaflet doesn't retry failed tiles by itself; once the connection is back, the visible layer reloads them.
	window.addEventListener("online", () => {
		failedTileCount = 0;
		hideMapNotice();
		stretchDownloadedTilesWhileOffline();
		Object.values(tileLayersByName).filter(tileLayer => map.hasLayer(tileLayer)).forEach(tileLayer => tileLayer.redraw());
	});
}

/** Leaflet's own rule for spreading tiles over the a/b/c servers; the offline download must request the same URLs. */
export function buildTileUrl(layerDefinition, { x, y, z }) {
	const subdomains = layerDefinition.options.subdomains ?? "";
	const subdomain = subdomains ? subdomains[Math.abs(x + y) % subdomains.length] : "";
	return layerDefinition.urlTemplate
		.replace("{s}", subdomain)
		.replace("{z}", z)
		.replace("{x}", x)
		.replace("{y}", y);
}
