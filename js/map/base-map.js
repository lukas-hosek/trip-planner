/*
	Creates the Leaflet map and its background tile layers.
	If tile servers can't be reached (offline, blocked network), it swaps in
	a simplified offline map so the pins still have some geographic context.
*/

import { addOfflineLayer } from "./offline-layer.js";

const OPENSTREETMAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const BASE_LAYER_DEFINITIONS = [
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

// A couple of failed tiles can be bad luck; several failures before any success means the server is unreachable.
const FAILED_TILES_BEFORE_FALLBACK = 3;
// Slow mobile connections need some patience before we give up on the real map.
const TILE_LOAD_TIMEOUT_IN_MILLISECONDS = 4500;

export function createMap(containerElementId, placesBounds) {
	const map = L.map(containerElementId, { minZoom: 9, maxZoom: 17 });
	map.fitBounds(placesBounds, { padding: [30, 30] });
	// Stops the user from accidentally panning far away from the region with no way back.
	map.setMaxBounds(placesBounds.pad(1.2));
	L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
	return map;
}

export function addBaseLayersWithOfflineFallback(map, { onOfflineFallback }) {
	const tileLayersByName = {};
	for (const layerDefinition of BASE_LAYER_DEFINITIONS) {
		tileLayersByName[layerDefinition.name] = L.tileLayer(layerDefinition.urlTemplate, layerDefinition.options);
	}

	const defaultTileLayer = tileLayersByName[BASE_LAYER_DEFINITIONS[0].name];
	defaultTileLayer.addTo(map);
	const layerSwitcher = L.control.layers(tileLayersByName, null, { position: "topright" }).addTo(map);

	let hasAnyTileLoaded = false;
	let failedTileCount = 0;
	let isOfflineMapShown = false;

	function switchToOfflineMap() {
		if (isOfflineMapShown) {
			return;
		}
		isOfflineMapShown = true;
		Object.values(tileLayersByName).forEach(tileLayer => map.removeLayer(tileLayer));
		// The switcher would only offer layers that can't load.
		map.removeControl(layerSwitcher);
		addOfflineLayer(map);
		onOfflineFallback();
	}

	defaultTileLayer.on("tileload", () => {
		hasAnyTileLoaded = true;
	});
	defaultTileLayer.on("tileerror", () => {
		failedTileCount++;
		if (!hasAnyTileLoaded && failedTileCount >= FAILED_TILES_BEFORE_FALLBACK) {
			switchToOfflineMap();
		}
	});
	setTimeout(() => {
		if (!hasAnyTileLoaded) {
			switchToOfflineMap();
		}
	}, TILE_LOAD_TIMEOUT_IN_MILLISECONDS);
}
