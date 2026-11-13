/*
	Keeps the selected place in the URL (#bastei), so a link can point straight at one place
	and the browser's back/forward buttons work with manually edited hashes.
*/

import { findPlaceById } from "../data/places.js";
import { appState, selectPlace, subscribe, STATE_EVENTS } from "../state/app-state.js";

export function readPlaceFromUrlHash() {
	const placeId = decodeURIComponent(window.location.hash.slice(1));
	return placeId ? findPlaceById(placeId) : null;
}

export function initUrlHashSync() {
	subscribe(STATE_EVENTS.selectedPlaceChanged, ({ place }) => {
		const newUrl = place
			? `#${place.id}`
			: window.location.pathname + window.location.search;
		// replaceState instead of assigning location.hash: clicking through 15 places shouldn't flood the history.
		history.replaceState(null, "", newUrl);
	});

	window.addEventListener("hashchange", () => {
		const placeFromHash = readPlaceFromUrlHash();
		if (placeFromHash && placeFromHash !== appState.selectedPlace) {
			selectPlace(placeFromHash, { moveMap: true });
		}
	});
}
