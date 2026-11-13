/* Detail card for the selected place: photo, description, practical tip, links and distance from the user. */

import { PLACES, getCategoryOf, getPlaceNumber, placeMatchesFilter } from "../data/places.js";
import {
	appState,
	clearSelectedPlace,
	selectPlace,
	subscribe,
	PHOTO_LOADING_STATUS,
	STATE_EVENTS,
} from "../state/app-state.js";
import { distanceInKilometers, formatDistance } from "../utils/geo-distance.js";
import { renderCategoryTag, renderPlannedDayTag, renderStatusTag } from "./tags.js";

// Sandstone towers drawn over the category colour while the photo loads or when there is none.
const SANDSTONE_SILHOUETTE_SVG = `
	<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
		<path d="M0 250V170l30-8 6-52 22-6 4 58 26 4 8-90 26-8 6 96 24 2 10-60 30 4 4 70 20-4 6-110 28-6 8 118 22 6 12-56 26 2 6 62 28-2 10-84 24 4 2 90L400 176v74z" fill="rgba(0,0,0,.22)"/>
		<path d="M0 250v-40l40-6 30 10 50-12 40 14 60-10 50 12 60-8 70 10v30z" fill="rgba(0,0,0,.18)"/>
	</svg>`;

let elements = null;

export function initDetailCard() {
	elements = {
		card: document.getElementById("detail-card"),
		scrollArea: document.getElementById("detail-card-scroll-area"),
		photo: document.getElementById("detail-card-photo"),
		content: document.getElementById("detail-card-content"),
		position: document.getElementById("detail-card-position"),
		closeButton: document.getElementById("detail-card-close"),
		previousButton: document.getElementById("detail-card-previous"),
		nextButton: document.getElementById("detail-card-next"),
	};

	elements.closeButton.addEventListener("click", clearSelectedPlace);
	elements.previousButton.addEventListener("click", () => selectNeighbourPlace(-1));
	elements.nextButton.addEventListener("click", () => selectNeighbourPlace(+1));
	document.addEventListener("keydown", handleKeyboardShortcuts);

	subscribe(STATE_EVENTS.selectedPlaceChanged, ({ place }) => {
		if (place) {
			showCardFor(place);
		} else {
			elements.card.hidden = true;
		}
	});
	subscribe(STATE_EVENTS.photosChanged, () => {
		if (appState.selectedPlace) {
			renderPhoto(appState.selectedPlace);
		}
	});
	subscribe(STATE_EVENTS.userPositionChanged, () => {
		// Only the distance line changes with every GPS fix; re-rendering the whole card would reset scrolling.
		const distanceElement = document.getElementById("distance-from-user");
		if (distanceElement && appState.selectedPlace) {
			distanceElement.innerHTML = renderDistanceFromUser(appState.selectedPlace);
		}
	});

	return elements.card;
}

function showCardFor(place) {
	renderPhoto(place);
	renderContent(place);
	elements.position.textContent = `${getPlaceNumber(place)} / ${PLACES.length}`;
	elements.card.hidden = false;
	elements.scrollArea.scrollTop = 0;
}

function renderContent(place) {
	const category = getCategoryOf(place);
	elements.content.innerHTML = `
		<div class="detail-card-heading">
			<span class="place-number" style="background: ${category.color}">${getPlaceNumber(place)}</span>
			<h2>${place.name}</h2>
		</div>
		<div class="detail-card-tags">
			${renderCategoryTag(place)}
			${place.plannedDay ? renderPlannedDayTag(place) : ""}
			${place.status ? renderStatusTag(place.status) : ""}
		</div>
		<p class="detail-card-description">${place.description}</p>
		<p class="detail-card-tip"><span class="detail-card-tip-label">Jak na to</span>${place.howToGetThere}</p>
		<div class="detail-card-links">
			<a href="${buildMapyCzUrl(place)}" target="_blank" rel="noopener">Mapy.cz ↗</a>
			<a href="${buildGoogleMapsUrl(place)}" target="_blank" rel="noopener">Google Maps ↗</a>
			<a href="${buildCommonsSearchUrl(place)}" target="_blank" rel="noopener">Další fotky ↗</a>
			<a href="${buildWikipediaUrl(place)}" target="_blank" rel="noopener">Wikipedie ↗</a>
		</div>
		<p class="detail-card-coordinates">
			${place.latitude.toFixed(4)}° N, ${place.longitude.toFixed(4)}° E<span id="distance-from-user">${renderDistanceFromUser(place)}</span>
		</p>`;
}

function renderPhoto(place) {
	const photo = appState.photosByPlaceId.get(place.id);
	if (photo) {
		elements.photo.innerHTML = `
			<img src="${photo.imageUrl}" alt="${place.name}">
			<a class="photo-credit" href="${photo.sourcePageUrl}" target="_blank" rel="noopener">Foto: Wikipedie / Wikimedia Commons</a>`;
		return;
	}

	const placeholderMessage = appState.photoLoadingStatus === PHOTO_LOADING_STATUS.loading
		? "Načítám fotku…"
		: "Fotku se nepodařilo načíst.";
	elements.photo.innerHTML = `
		<div class="photo-placeholder" style="background: ${getCategoryOf(place).color}">
			${SANDSTONE_SILHOUETTE_SVG}
			<p>${placeholderMessage}</p>
			<a href="${buildCommonsSearchUrl(place)}" target="_blank" rel="noopener">Fotky na Wikimedia Commons ↗</a>
		</div>`;
}

function renderDistanceFromUser(place) {
	if (!appState.userPosition) {
		return "";
	}
	const distance = formatDistance(distanceInKilometers(appState.userPosition, place));
	return ` · <span class="distance-from-user">od vás ${distance} vzdušnou čarou</span>`;
}

/** Previous/next respects the active filter, so paging through "Náš plán" stays within the plan. */
function selectNeighbourPlace(direction) {
	const placesInFilter = PLACES.filter(place => placeMatchesFilter(place, appState.activeFilterId));
	const candidates = placesInFilter.length > 0 ? placesInFilter : PLACES;
	const currentIndex = candidates.indexOf(appState.selectedPlace);
	// Wrap around at both ends so the pager never dead-ends.
	const neighbourIndex = (currentIndex + direction + candidates.length) % candidates.length;
	selectPlace(candidates[neighbourIndex], { moveMap: true });
}

function handleKeyboardShortcuts(keyboardEvent) {
	if (elements.card.hidden || keyboardEvent.target.closest("input, textarea")) {
		return;
	}
	if (keyboardEvent.key === "Escape") {
		clearSelectedPlace();
	} else if (keyboardEvent.key === "ArrowRight") {
		selectNeighbourPlace(+1);
	} else if (keyboardEvent.key === "ArrowLeft") {
		selectNeighbourPlace(-1);
	}
}

function buildMapyCzUrl(place) {
	return `https://mapy.cz/turisticka?q=${place.latitude}%2C${place.longitude}&x=${place.longitude}&y=${place.latitude}&z=15`;
}

function buildGoogleMapsUrl(place) {
	return `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
}

function buildWikipediaUrl(place) {
	const articleTitle = place.wikipediaTitles.de[0];
	return `https://de.wikipedia.org/wiki/${encodeURIComponent(articleTitle.replace(/ /g, "_"))}`;
}

function buildCommonsSearchUrl(place) {
	// Disambiguation suffixes like "(Sächsische Schweiz)" make Commons search worse, so they are dropped.
	const searchTerm = (place.wikipediaTitles.de[0] ?? place.name).replace(/\s*\(.*\)$/, "");
	return `https://commons.wikimedia.org/w/index.php?title=Special:MediaSearch&type=image&search=${encodeURIComponent(searchTerm)}`;
}
