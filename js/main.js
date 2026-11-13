/* Entry point: builds the map and the UI, then decides what to show first. */

import { PLACES } from "./data/places.js";
import { selectPlace } from "./state/app-state.js";
import { createMap, addBaseLayersWithOfflineFallback } from "./map/base-map.js";
import { addPlaceMarkers } from "./map/place-markers.js";
import { enableFocusOnSelectedPlace } from "./map/map-focus.js";
import { addUserLocationControl } from "./map/user-location.js";
import { initSidebar } from "./ui/sidebar.js";
import { initDetailCard } from "./ui/detail-card.js";
import { showMapNotice } from "./ui/map-notice.js";
import { initUrlHashSync, readPlaceFromUrlHash } from "./ui/url-hash.js";
import { loadPlacePhotos } from "./services/wikipedia-photos.js";

const OFFLINE_MAP_NOTICE = "Mapové podklady se nepodařilo načíst (jste offline?). Zobrazuji zjednodušenou mapu.";

const placesBounds = L.latLngBounds(PLACES.map(place => [place.latitude, place.longitude]));

const map = createMap("map", placesBounds);
addBaseLayersWithOfflineFallback(map, {
	onOfflineFallback: () => showMapNotice(OFFLINE_MAP_NOTICE),
});
addPlaceMarkers(map);
addUserLocationControl(map, placesBounds);

// The detail card must subscribe before map focusing, so the card is visible when the map measures it.
const detailCardElement = initDetailCard();
enableFocusOnSelectedPlace(map, detailCardElement);
initSidebar();
initUrlHashSync();

showInitialPlace();
loadPlacePhotos(PLACES);

// Opens the place linked in the URL, if any. Otherwise the app starts on the map and list, with nothing selected.
function showInitialPlace() {
	const placeFromUrl = readPlaceFromUrlHash();
	if (placeFromUrl) {
		selectPlace(placeFromUrl, { moveMap: true });
	}
}
