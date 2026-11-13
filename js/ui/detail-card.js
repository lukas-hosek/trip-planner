/* Detail card for the selected place: photo, description, practical tip, links and distance from the user. */

import { getPlaceNumber, getPlaces, placeMatchesFilter } from "../data/active-plan.js";
import {
	appState,
	clearSelectedPlace,
	selectPlace,
	subscribe,
	PHOTO_LOADING_STATUS,
	STATE_EVENTS,
} from "../state/app-state.js";
import { distanceInKilometers, formatDistance } from "../utils/geo-distance.js";
import { escapeHtml } from "../utils/html.js";
import { planColorStyle, renderCategoryTag, renderTags } from "./tags.js";

// Rock towers drawn over the category colour while the photo loads or when there is none.
const ROCK_SILHOUETTE_SVG = `
	<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
		<path d="M0 250V170l30-8 6-52 22-6 4 58 26 4 8-90 26-8 6 96 24 2 10-60 30 4 4 70 20-4 6-110 28-6 8 118 22 6 12-56 26 2 6 62 28-2 10-84 24 4 2 90L400 176v74z" fill="rgba(0,0,0,.22)"/>
		<path d="M0 250v-40l40-6 30 10 50-12 40 14 60-10 50 12 60-8 70 10v30z" fill="rgba(0,0,0,.18)"/>
	</svg>`;

const PHOTO_FAILED_MESSAGE = "Fotku se nepodařilo načíst.";

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
	// In the capture phase, so the shortcuts are handled before Leaflet's own keyboard handler sees the key.
	document.addEventListener("keydown", handleKeyboardShortcuts, { capture: true });

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
	elements.position.textContent = `${getPlaceNumber(place)} / ${getPlaces().length}`;
	elements.card.hidden = false;
	elements.scrollArea.scrollTop = 0;
}

function renderContent(place) {
	elements.content.innerHTML = `
		<div class="detail-card-heading">
			<span class="place-number" style="${planColorStyle(place.category.color)}">${getPlaceNumber(place)}</span>
			<h2>${escapeHtml(place.name)}</h2>
		</div>
		<div class="detail-card-tags">
			${renderCategoryTag(place.category)}
			${renderTags(place.tags)}
		</div>
		${renderParagraphs(place.description)}
		${place.tip ? `<p class="detail-card-tip"><span class="detail-card-tip-label">Jak na to</span>${renderLineBreaks(place.tip)}</p>` : ""}
		<div class="detail-card-links">
			${buildLinks(place).map(link => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.label)} ↗</a>`).join("")}
		</div>
		<p class="detail-card-coordinates">
			${formatCoordinates(place)}<span id="distance-from-user">${renderDistanceFromUser(place)}</span>
		</p>`;
}

/** Blank lines in the plan's text start a new paragraph; single line breaks are kept. */
function renderParagraphs(text) {
	return text
		.split(/\n\s*\n/)
		.filter(paragraph => paragraph.trim())
		.map(paragraph => `<p class="detail-card-description">${renderLineBreaks(paragraph.trim())}</p>`)
		.join("");
}

function renderLineBreaks(text) {
	return escapeHtml(text).replace(/\n/g, "<br>");
}

function renderPhoto(place) {
	const photo = appState.photosByPlaceId.get(place.id);
	if (photo) {
		// All photos come from Wikimedia, which sends CORS headers; loading them in CORS mode lets the
		// service worker store them for offline use at their real size.
		elements.photo.innerHTML = `
			<img src="${escapeHtml(photo.imageUrl)}" alt="${escapeHtml(photo.subject || place.name)}" crossorigin="anonymous">
			<a class="photo-credit" href="${escapeHtml(photo.sourcePageUrl)}" target="_blank" rel="noopener">${escapeHtml(buildPhotoCredit(photo))}</a>`;
		// Offline, the photo is known from an earlier visit but the image itself may never have been stored.
		const imageElement = elements.photo.querySelector("img");
		imageElement.addEventListener("error", () => {
			// A late error from a photo that has been replaced meanwhile must not overwrite the current one.
			if (imageElement.isConnected) {
				renderPhotoPlaceholder(place, PHOTO_FAILED_MESSAGE);
			}
		});
		return;
	}

	const hasPhotoSource = place.commons?.fileTitle || place.wikipediaArticles.length > 0;
	let placeholderMessage = "K tomuhle místu fotka není.";
	if (hasPhotoSource) {
		placeholderMessage = appState.photoLoadingStatus === PHOTO_LOADING_STATUS.loading
			? "Načítám fotku…"
			: PHOTO_FAILED_MESSAGE;
	}
	renderPhotoPlaceholder(place, placeholderMessage);
}

function renderPhotoPlaceholder(place, placeholderMessage) {
	elements.photo.innerHTML = `
		<div class="photo-placeholder" style="${planColorStyle(place.category.color)}">
			${ROCK_SILHOUETTE_SVG}
			<p>${placeholderMessage}</p>
			<a href="${escapeHtml(buildMorePhotosUrl(place))}" target="_blank" rel="noopener">Fotky na Wikimedia Commons ↗</a>
		</div>`;
}

/** A photo of something broader than the place (the town, the valley) says so, so nobody takes it for the place. */
function buildPhotoCredit(photo) {
	if (photo.source === "wikipedia") {
		return "Foto: Wikipedie / Wikimedia Commons";
	}
	return photo.subject ? `Foto: ${photo.subject} (Wikimedia Commons)` : "Foto: Wikimedia Commons";
}

function renderDistanceFromUser(place) {
	if (!appState.userPosition) {
		return "";
	}
	const distance = formatDistance(distanceInKilometers(appState.userPosition, place));
	return ` · <span class="distance-from-user">od vás ${distance} vzdušnou čarou</span>`;
}

function formatCoordinates({ latitude, longitude }) {
	const latitudeText = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? "N" : "S"}`;
	const longitudeText = `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? "E" : "W"}`;
	return `${latitudeText}, ${longitudeText}`;
}

/** Previous/next respects the active filter, so paging through "Náš plán" stays within the plan. */
function selectNeighbourPlace(direction) {
	const places = getPlaces();
	const placesInFilter = places.filter(place => placeMatchesFilter(place, appState.activeFilterId));
	const candidates = placesInFilter.length > 0 ? placesInFilter : places;
	const currentIndex = candidates.indexOf(appState.selectedPlace);
	// Wrap around at both ends so the pager never dead-ends.
	const neighbourIndex = (currentIndex + direction + candidates.length) % candidates.length;
	selectPlace(candidates[neighbourIndex], { moveMap: true });
}

function handleKeyboardShortcuts(keyboardEvent) {
	if (elements.card.hidden || keyboardEvent.target.closest("input, textarea, dialog")) {
		return;
	}
	if (keyboardEvent.key === "Escape") {
		clearSelectedPlace();
	} else if (keyboardEvent.key === "ArrowRight" || keyboardEvent.key === "ArrowLeft") {
		// A focused map (e.g. after a click on a pin) would also pan on these keys; with a card open they only page through the places.
		keyboardEvent.stopPropagation();
		selectNeighbourPlace(keyboardEvent.key === "ArrowRight" ? +1 : -1);
	}
}

/** The place's own website first (opening hours), then maps, Wikipedia and photos, then the plan's other links. */
function buildLinks(place) {
	const links = [];
	if (place.website) {
		links.push({ label: "Web", url: place.website });
	}
	links.push(
		{ label: "Mapy.cz", url: buildMapyCzUrl(place) },
		{ label: "Google Maps", url: buildGoogleMapsUrl(place) },
	);
	if (place.wikipediaArticles.length > 0) {
		links.push({ label: "Wikipedie", url: place.wikipediaArticles[0].url });
	}
	links.push({ label: "Další fotky", url: buildMorePhotosUrl(place) });
	return [...links, ...place.links];
}

function buildMapyCzUrl(place) {
	return `https://mapy.cz/turisticka?q=${place.latitude}%2C${place.longitude}&x=${place.longitude}&y=${place.latitude}&z=15`;
}

function buildGoogleMapsUrl(place) {
	return `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
}

/** The place's Commons category when the plan names one; otherwise a Commons search for its name. */
function buildMorePhotosUrl(place) {
	if (place.commons?.categoryUrl) {
		return place.commons.categoryUrl;
	}
	// Disambiguation suffixes like "(Sächsische Schweiz)" make Commons search worse, so they are dropped.
	const searchTerm = (place.wikipediaArticles[0]?.title ?? place.name).replace(/\s*\(.*\)$/, "");
	return `https://commons.wikimedia.org/w/index.php?title=Special:MediaSearch&type=image&search=${encodeURIComponent(searchTerm)}`;
}
