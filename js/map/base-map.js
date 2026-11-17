/*
	Creates the Leaflet map and its background tile layers.
	Tiles are cached by the service worker, so offline the map shows whatever was viewed or downloaded before;
	if tiles fail to load, a notice explains why parts of the map are blank.
*/

import { translate } from "../language/translations.js";
import { hideMapNotice, showMapNotice } from "../ui/map-notice.js";
import { isMetric } from "../utils/units.js";

const OPENSTREETMAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** The first layer is the default one, and the only one the offline download saves. nameKey is its label in the language files. */
export const BASE_LAYER_DEFINITIONS = [
	{
		nameKey: "map.layers.hiking",
		urlTemplate: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
		options: {
			subdomains: "abc",
			maxZoom: 17,
			attribution: `${OPENSTREETMAP_ATTRIBUTION}, SRTM | <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
		},
	},
	// OpenStreetMap's tile policy forbids bulk downloads, so this layer must never become the first one.
	{
		nameKey: "map.layers.basic",
		urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
		options: {
			maxZoom: 19,
			attribution: OPENSTREETMAP_ATTRIBUTION,
		},
	},
	{
		nameKey: "map.layers.aerial",
		urlTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
		options: {
			maxZoom: 18,
			attribution: "Imagery &copy; Esri",
		},
	},
];

/**
 * The offline download saves the default layer up to this zoom. While offline, the layer stretches
 * these tiles for deeper zooms instead of showing blank ones.
 */
export const HIGHEST_DOWNLOADED_ZOOM = 16;

// Space kept free around the places when the map shows all of them.
const FIT_PADDING_IN_PIXELS = 30;
// Below this span (in degrees, about 2 km) the map would zoom in absurdly far on a one-place plan.
const MINIMUM_BOUNDS_SPAN_IN_DEGREES = 0.02;
// A couple of failed tiles can be bad luck; several mean the server (or the network) is unreachable.
const FAILED_TILES_BEFORE_NOTICE = 3;

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
	// Leaflet's own zoom control has English tooltips, so the map gets one with translated ones.
	// It is added first, so it stays above the location button in the top-left corner.
	const map = L.map(containerElementId, { maxZoom: 17, zoomControl: false });
	L.control.zoom({ zoomInTitle: translate("map.zoomIn"), zoomOutTitle: translate("map.zoomOut") }).addTo(map);
	fitMapToPlaces(map, placesBounds);
	// Changing the units reloads the app, so the scale never has to switch while it is shown.
	L.control.scale({ metric: isMetric(), imperial: !isMetric(), position: "bottomleft" }).addTo(map);
	return map;
}

/** Shows all places, kept clear of whatever covers the bottom of the map (the list sheet on phones). */
export function fitMapToPlaces(map, placesBounds, { coveredHeightAtBottom = 0 } = {}) {
	map.fitBounds(placesBounds, {
		paddingTopLeft: [FIT_PADDING_IN_PIXELS, FIT_PADDING_IN_PIXELS],
		paddingBottomRight: [FIT_PADDING_IN_PIXELS, FIT_PADDING_IN_PIXELS + coveredHeightAtBottom],
	});
}

export function addBaseLayers(map) {
	// crossOrigin makes tiles CORS requests, which the service worker can cache at their real size
	// (opaque responses count as megabytes each against the storage quota).
	const tileLayers = BASE_LAYER_DEFINITIONS.map(layerDefinition =>
		L.tileLayer(layerDefinition.urlTemplate, { ...layerDefinition.options, crossOrigin: true }));
	const defaultLayer = tileLayers[0];
	// Leaflet reads maxNativeZoom every time it lays tiles out, so changing the option and redrawing is enough.
	function stretchDownloadedTilesWhileOffline() {
		defaultLayer.options.maxNativeZoom = navigator.onLine ? undefined : HIGHEST_DOWNLOADED_ZOOM;
	}
	stretchDownloadedTilesWhileOffline();
	defaultLayer.addTo(map);
	// The control shows the object's keys as the layers' labels.
	const tileLayersByLabel = Object.fromEntries(BASE_LAYER_DEFINITIONS.map((layerDefinition, index) => [translate(layerDefinition.nameKey), tileLayers[index]]));
	const layersControl = L.control.layers(tileLayersByLabel, null, { position: "topright" }).addTo(map);
	// Leaflet gives the button that opens the control a fixed English title.
	layersControl.getContainer().querySelector(".leaflet-control-layers-toggle")?.setAttribute("title", translate("map.layersTitle"));
	window.addEventListener("offline", () => {
		stretchDownloadedTilesWhileOffline();
		defaultLayer.redraw();
	});

	let failedTileCount = 0;
	for (const tileLayer of tileLayers) {
		tileLayer.on("tileerror", () => {
			failedTileCount++;
			if (failedTileCount === FAILED_TILES_BEFORE_NOTICE) {
				showMapNotice(translate(navigator.onLine ? "map.tilesUnavailable" : "map.offlineNotice"));
			}
		});
	}

	// Leaflet doesn't retry failed tiles by itself; once the connection is back, the visible layer reloads them.
	window.addEventListener("online", () => {
		failedTileCount = 0;
		hideMapNotice();
		stretchDownloadedTilesWhileOffline();
		tileLayers.filter(tileLayer => map.hasLayer(tileLayer)).forEach(tileLayer => tileLayer.redraw());
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
