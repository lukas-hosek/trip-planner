/* Numbered, colour-coded pins for all places; they restyle themselves when the selection or filter changes. */

import { PLACES, getCategoryOf, getPlaceNumber, placeMatchesFilter } from "../data/places.js";
import { appState, selectPlace, subscribe, STATE_EVENTS } from "../state/app-state.js";

const PIN_SIZE_IN_PIXELS = 28;
// Leaflet's own z-index offsets are small; 1000 is enough to lift one marker above all others.
const SELECTED_PIN_Z_INDEX_OFFSET = 1000;

export function addPlaceMarkers(map) {
	const markersByPlaceId = new Map();

	for (const place of PLACES) {
		const marker = L.marker([place.latitude, place.longitude], {
			title: place.name,
			riseOnHover: true,
			icon: createPinIcon(place),
		});
		marker.on("click", () => selectPlace(place, { moveMap: true }));
		marker.addTo(map);
		markersByPlaceId.set(place.id, marker);
	}

	function refreshAllPins() {
		for (const place of PLACES) {
			const marker = markersByPlaceId.get(place.id);
			marker.setIcon(createPinIcon(place));
			// Keeps the selected pin on top where pins overlap at low zoom.
			marker.setZIndexOffset(place === appState.selectedPlace ? SELECTED_PIN_Z_INDEX_OFFSET : 0);
		}
	}

	subscribe(STATE_EVENTS.selectedPlaceChanged, refreshAllPins);
	subscribe(STATE_EVENTS.activeFilterChanged, refreshAllPins);
}

function createPinIcon(place) {
	const cssClasses = ["place-pin"];
	if (place.plannedDay) {
		cssClasses.push("place-pin--planned");
	}
	if (place === appState.selectedPlace) {
		cssClasses.push("place-pin--selected");
	}
	if (!placeMatchesFilter(place, appState.activeFilterId)) {
		cssClasses.push("place-pin--dimmed");
	}

	return L.divIcon({
		className: "place-pin-anchor",
		html: `<div class="${cssClasses.join(" ")}" style="background: ${getCategoryOf(place).color}">${getPlaceNumber(place)}</div>`,
		iconSize: [PIN_SIZE_IN_PIXELS, PIN_SIZE_IN_PIXELS],
		iconAnchor: [PIN_SIZE_IN_PIXELS / 2, PIN_SIZE_IN_PIXELS / 2],
	});
}
