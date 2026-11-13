/* Moves the map to a place when the user selects it, keeping the pin clear of the detail card. */

import { subscribe, STATE_EVENTS } from "../state/app-state.js";
import { isPhoneLayout, prefersReducedMotion } from "../utils/media-queries.js";

// Zoom 12 shows the place together with its nearest neighbours and town names.
const MINIMUM_ZOOM_WHEN_FOCUSING = 12;
const FLY_ANIMATION_DURATION_IN_SECONDS = .6;

export function enableFocusOnSelectedPlace(map, detailCardElement) {
	subscribe(STATE_EVENTS.selectedPlaceChanged, ({ place, moveMap }) => {
		if (!place || !moveMap) {
			return;
		}
		// Wait one frame: the detail card may have just been shown, and we need its real size.
		requestAnimationFrame(() => focusMapOnPlace(map, place, detailCardElement));
	});
}

export function focusMapOnPlace(map, place, detailCardElement) {
	const targetZoom = Math.max(map.getZoom(), MINIMUM_ZOOM_WHEN_FOCUSING);
	const offsetInPixels = getOffsetForAreaCoveredByCard(map, detailCardElement);

	// Shifting the map centre by half of the covered area puts the pin in the middle of what stays visible.
	const pinPointInPixels = map.project([place.latitude, place.longitude], targetZoom);
	const shiftedCenter = map.unproject(pinPointInPixels.add(offsetInPixels), targetZoom);

	if (prefersReducedMotion()) {
		map.setView(shiftedCenter, targetZoom);
	} else {
		map.flyTo(shiftedCenter, targetZoom, { duration: FLY_ANIMATION_DURATION_IN_SECONDS });
	}
}

function getOffsetForAreaCoveredByCard(map, detailCardElement) {
	if (detailCardElement.hidden) {
		return L.point(0, 0);
	}
	const mapRectangle = map.getContainer().getBoundingClientRect();
	const cardRectangle = detailCardElement.getBoundingClientRect();

	// On phones the card is a bottom sheet covering the lower part; on desktop it covers the right edge.
	if (isPhoneLayout()) {
		const coveredHeight = Math.max(0, mapRectangle.bottom - cardRectangle.top);
		return L.point(0, coveredHeight / 2);
	}
	const coveredWidth = Math.max(0, mapRectangle.right - cardRectangle.left);
	return L.point(coveredWidth / 2, 0);
}
