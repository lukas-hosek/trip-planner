/*
	Simplified map drawn purely from data bundled with the app: the Elbe, the German–Czech border
	and a few town labels. Used when map tiles can't be downloaded.
*/

import {
	ELBE_RIVER_LINES,
	GERMAN_CZECH_BORDER_LINES,
	TOWN_LABELS,
	RIVER_LABELS,
	COUNTRY_LABELS,
} from "../data/offline-geometry.js";

export function addOfflineLayer(map) {
	const offlineLayerGroup = L.layerGroup();

	for (const borderLine of GERMAN_CZECH_BORDER_LINES) {
		L.polyline(borderLine, { className: "offline-border", weight: 1.5, dashArray: "6 5", opacity: .8, interactive: false })
			.addTo(offlineLayerGroup);
	}

	for (const riverLine of ELBE_RIVER_LINES) {
		// A wide faint stroke under a thin solid one reads as a river valley rather than a road.
		L.polyline(riverLine, { className: "offline-river", weight: 9, opacity: .18, lineCap: "round", interactive: false })
			.addTo(offlineLayerGroup);
		L.polyline(riverLine, { className: "offline-river", weight: 3, opacity: .9, lineCap: "round", interactive: false })
			.addTo(offlineLayerGroup);
	}

	for (const town of TOWN_LABELS) {
		// Anchor offset puts the dot drawn by CSS (::before) exactly on the town's coordinates.
		addTextLabel(offlineLayerGroup, town, "offline-town-label", [3, 8]);
	}
	for (const riverLabel of RIVER_LABELS) {
		addTextLabel(offlineLayerGroup, riverLabel, "offline-river-label");
	}
	for (const countryLabel of COUNTRY_LABELS) {
		addTextLabel(offlineLayerGroup, countryLabel, "offline-country-label");
	}

	offlineLayerGroup.addTo(map);
	map.attributionControl.addAttribution("Řeka a hranice: Natural Earth");
}

function addTextLabel(layerGroup, { text, latitude, longitude }, cssClassName, iconAnchor) {
	const labelIcon = L.divIcon({
		className: "",
		html: `<span class="${cssClassName}">${text}</span>`,
		// iconSize null lets the label take its natural text width instead of a fixed box.
		iconSize: null,
		iconAnchor,
	});
	L.marker([latitude, longitude], { icon: labelIcon, interactive: false, keyboard: false }).addTo(layerGroup);
}
