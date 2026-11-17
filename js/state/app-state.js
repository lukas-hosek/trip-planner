/*
	Shared application state with a tiny publish/subscribe mechanism.
	The map, the sidebar and the detail card never call each other directly;
	they only react to state changes, which keeps every module independent.
*/

import { FILTER_ALL_PLACES } from "../data/active-plan.js";

export const STATE_EVENTS = {
	selectedPlaceChanged: "selectedPlaceChanged",
	activeFilterChanged: "activeFilterChanged",
	userPositionChanged: "userPositionChanged",
	photosChanged: "photosChanged",
};

export const PHOTO_LOADING_STATUS = {
	loading: "loading",
	ready: "ready",
	unavailable: "unavailable",
};

export const appState = {
	selectedPlace: null,
	activeFilterId: FILTER_ALL_PLACES,
	/** { latitude, longitude, accuracyInMeters, receivedAt } or null before the first GPS fix. */
	userPosition: null,
	/** placeId -> { imageUrl, sourcePageUrl } */
	photosByPlaceId: new Map(),
	photoLoadingStatus: PHOTO_LOADING_STATUS.loading,
};

const listenersByEventName = new Map();

export function subscribe(eventName, listener) {
	if (!listenersByEventName.has(eventName)) {
		listenersByEventName.set(eventName, []);
	}
	listenersByEventName.get(eventName).push(listener);
}

function publish(eventName, payload) {
	for (const listener of listenersByEventName.get(eventName) ?? []) {
		listener(payload);
	}
}

/**
 * @param moveMap  true when the user picked the place (pin, list, arrow keys) and expects the map to follow;
 *                 false when the selection is set programmatically, e.g. on start-up.
 */
export function selectPlace(place, { moveMap = false } = {}) {
	appState.selectedPlace = place;
	publish(STATE_EVENTS.selectedPlaceChanged, { place, moveMap });
}

export function clearSelectedPlace() {
	selectPlace(null);
}

export function setActiveFilter(filterId) {
	appState.activeFilterId = filterId;
	publish(STATE_EVENTS.activeFilterChanged, filterId);
}

export function setUserPosition(userPosition) {
	appState.userPosition = userPosition;
	publish(STATE_EVENTS.userPositionChanged, userPosition);
}

export function setPlacePhotos(photosByPlaceId, photoLoadingStatus) {
	appState.photosByPlaceId = photosByPlaceId;
	appState.photoLoadingStatus = photoLoadingStatus;
	publish(STATE_EVENTS.photosChanged, photosByPlaceId);
}
