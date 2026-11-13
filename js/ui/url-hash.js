/*
	Keeps the selected place in the URL (#bastei), so a link can point straight at one place
	and the browser's back/forward buttons work with manually edited hashes.
*/

import { findPlaceById } from "../data/active-plan.js";
import { hasPlanInFragment } from "../data/plan-link.js";
import { appState, selectPlace, subscribe, STATE_EVENTS } from "../state/app-state.js";

export function readPlaceFromUrlHash() {
	// "#plan=…" carries a whole plan to import; main.js handles it.
	if (hasPlanInFragment(window.location.hash)) {
		return null;
	}
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
