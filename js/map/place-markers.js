/*
	Teardrop pins for all places, coloured by category: itinerary places carry their number, the others their icon.
	The pins restyle themselves when the selection or filter changes.
*/

import { getPlaces, placeMatchesFilter } from "../data/active-plan.js";
import { appState, selectPlace, subscribe, STATE_EVENTS } from "../state/app-state.js";
import { renderPlaceIcon } from "../ui/place-badge.js";
import { planColorStyle } from "../ui/tags.js";

const PIN_WIDTH_IN_PIXELS = 32;
const PIN_HEIGHT_IN_PIXELS = 42;
// The drop's tip, which marks the place's exact position.
const PIN_TIP_IN_PIXELS = [16, 41];
const DROP_PATH = "M16 40.5C14.6 37.6 3 25.8 3 15.5a13 13 0 0 1 26 0C29 25.8 17.4 37.6 16 40.5Z";
// Leaflet's own z-index offsets are small; 1000 is enough to lift one marker above all others.
const SELECTED_PIN_Z_INDEX_OFFSET = 1000;

export function addPlaceMarkers(map) {
	const markersByPlaceId = new Map();

	// Leaflet stacks markers by latitude, so pins further south are drawn in front, as on a printed map.
	for (const place of getPlaces()) {
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
		for (const place of getPlaces()) {
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
	return L.divIcon({
		className: "place-pin-anchor",
		html: renderPinHtml(place, {
			isSelected: place === appState.selectedPlace,
			isDimmed: !placeMatchesFilter(place, appState.activeFilterId),
		}),
		iconSize: [PIN_WIDTH_IN_PIXELS, PIN_HEIGHT_IN_PIXELS],
		iconAnchor: PIN_TIP_IN_PIXELS,
	});
}

/** The pin's markup; exported for the icon preview page (tools/icon-preview.html). */
export function renderPinHtml(place, { isSelected = false, isDimmed = false } = {}) {
	const cssClasses = ["place-pin"];
	if (place.isPlanned) {
		cssClasses.push("place-pin--planned");
	}
	if (isSelected) {
		cssClasses.push("place-pin--selected");
	}
	if (isDimmed) {
		cssClasses.push("place-pin--dimmed");
	}
	return `
		<div class="${cssClasses.join(" ")}" style="${planColorStyle(place.category.color)}">
			<svg class="place-pin-drop" viewBox="0 0 ${PIN_WIDTH_IN_PIXELS} ${PIN_HEIGHT_IN_PIXELS}" width="${PIN_WIDTH_IN_PIXELS}" height="${PIN_HEIGHT_IN_PIXELS}" aria-hidden="true">
				<path class="place-pin-halo" d="${DROP_PATH}"/>
				<path class="place-pin-body" d="${DROP_PATH}"/>
				${renderPinMark(place)}
			</svg>
			${place.itineraryNumber === null && place.iconKey ? renderPlaceIcon(place.iconKey, "place-pin-icon") : ""}
		</div>`;
}

/** The number or the plain dot, drawn inside the drop; an icon is laid over the drop instead (it's an image file). */
function renderPinMark(place) {
	if (place.itineraryNumber !== null) {
		return `<text class="place-pin-number" x="16" y="20.7" text-anchor="middle">${place.itineraryNumber}</text>`;
	}
	return place.iconKey ? "" : `<circle class="place-pin-dot" cx="16" cy="15.5" r="4"/>`;
}
