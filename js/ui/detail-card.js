/*
	Detail card for the selected place: photo, description, practical tip, links and distance from the user.
	On phones it is a bottom sheet that opens half-way and can be pulled up to full height.
*/

import { getPlaces, placeMatchesFilter } from "../data/active-plan.js";
import { translate } from "../language/translations.js";
import {
	appState,
	clearSelectedPlace,
	selectPlace,
	subscribe,
	PHOTO_LOADING_STATUS,
	STATE_EVENTS,
} from "../state/app-state.js";
import { distanceInKilometers } from "../utils/geo-distance.js";
import { escapeHtml } from "../utils/html.js";
import { formatDistance } from "../utils/units.js";
import { computeSheetStops, createBottomSheet } from "./bottom-sheet.js";
import { renderPlaceBadge } from "./place-badge.js";
import { planColorStyle, renderCategoryTag, renderTags } from "./tags.js";

// Rock towers drawn over the category colour while the photo loads or when there is none.
const ROCK_SILHOUETTE_SVG = `
	<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
		<path d="M0 250V170l30-8 6-52 22-6 4 58 26 4 8-90 26-8 6 96 24 2 10-60 30 4 4 70 20-4 6-110 28-6 8 118 22 6 12-56 26 2 6 62 28-2 10-84 24 4 2 90L400 176v74z" fill="rgba(0,0,0,.22)"/>
		<path d="M0 250v-40l40-6 30 10 50-12 40 14 60-10 50 12 60-8 70 10v30z" fill="rgba(0,0,0,.18)"/>
	</svg>`;

// What a tap on the sheet's handle does at each stop (half, full).
const DETAIL_SHEET_HANDLE_LABEL_KEYS = ["detail.expand", "detail.shrink"];

let elements = null;
let detailSheet = null;

export function initDetailCard() {
	elements = {
		card: document.getElementById("detail-card"),
		scrollArea: document.getElementById("detail-card-scroll-area"),
		photo: document.getElementById("detail-card-photo"),
		content: document.getElementById("detail-card-content"),
		closeButton: document.getElementById("detail-card-close"),
	};

	detailSheet = createBottomSheet(elements.card, {
		handleElement: elements.card.querySelector(".sheet-handle"),
		getSnapHeights: () => {
			const { half, full } = computeSheetStops();
			return [half, full];
		},
		getHandleLabel: snapIndex => translate(DETAIL_SHEET_HANDLE_LABEL_KEYS[snapIndex]),
	});

	elements.closeButton.addEventListener("click", clearSelectedPlace);
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
	if (elements.card.hidden) {
		// A freshly opened sheet starts half-way, so the map above still shows the place.
		detailSheet.snapTo(0, { animate: false });
	}
	elements.card.hidden = false;
	elements.scrollArea.scrollTop = 0;
}

function renderContent(place) {
	elements.content.innerHTML = `
		<div class="detail-card-heading">
			${renderPlaceBadge(place)}
			<h2>${escapeHtml(place.name)}</h2>
		</div>
		<div class="detail-card-tags">
			${renderCategoryTag(place.category)}
			${renderTags(place.tags)}
		</div>
		${renderParagraphs(place.description)}
		${place.tip ? `<p class="detail-card-tip"><span class="detail-card-tip-label">${escapeHtml(translate("detail.howTo"))}</span>${renderLineBreaks(place.tip)}</p>` : ""}
		<div class="detail-card-links">
			${buildLinks(place).map(link => `<a class="button button--small" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.label)} ↗</a>`).join("")}
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
				renderPhotoPlaceholder(place, translate("detail.photoFailed"));
			}
		});
		return;
	}

	const hasPhotoSource = place.commons?.fileTitle || place.wikipediaArticles.length > 0;
	let placeholderMessage = translate("detail.noPhoto");
	if (hasPhotoSource) {
		placeholderMessage = translate(appState.photoLoadingStatus === PHOTO_LOADING_STATUS.loading ? "detail.loadingPhoto" : "detail.photoFailed");
	}
	renderPhotoPlaceholder(place, placeholderMessage);
}

function renderPhotoPlaceholder(place, placeholderMessage) {
	elements.photo.innerHTML = `
		<div class="photo-placeholder" style="${planColorStyle(place.category.color)}">
			${ROCK_SILHOUETTE_SVG}
			<p>${escapeHtml(placeholderMessage)}</p>
			<a href="${escapeHtml(buildMorePhotosUrl(place))}" target="_blank" rel="noopener">${escapeHtml(translate("detail.photosOnCommons"))} ↗</a>
		</div>`;
}

/** A photo of something broader than the place (the town, the valley) says so, so nobody takes it for the place. */
function buildPhotoCredit(photo) {
	if (photo.source === "wikipedia") {
		return translate("detail.photoCreditWikipedia");
	}
	return photo.subject ? translate("detail.photoCreditWithSubject", { subject: photo.subject }) : translate("detail.photoCredit");
}

function renderDistanceFromUser(place) {
	if (!appState.userPosition) {
		return "";
	}
	const distance = formatDistance(distanceInKilometers(appState.userPosition, place));
	return ` · <span class="distance-from-user">${escapeHtml(translate("detail.distanceFromUser", { distance }))}</span>`;
}

function formatCoordinates({ latitude, longitude }) {
	const latitudeText = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? "N" : "S"}`;
	const longitudeText = `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? "E" : "W"}`;
	return `${latitudeText}, ${longitudeText}`;
}

/** The arrow keys page through the places; they respect the active filter, so paging through the itinerary stays within it. */
function selectNeighbourPlace(direction) {
	const places = getPlaces();
	const placesInFilter = places.filter(place => placeMatchesFilter(place, appState.activeFilterId));
	const candidates = placesInFilter.length > 0 ? placesInFilter : places;
	const currentIndex = candidates.indexOf(appState.selectedPlace);
	// Wrap around at both ends so paging never dead-ends.
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
		links.push({ label: translate("detail.links.website"), url: place.website });
	}
	links.push(
		{ label: translate("detail.links.mapyLabel"), url: buildMapyUrl(place) },
		{ label: "Google Maps", url: buildGoogleMapsUrl(place) },
	);
	if (place.wikipediaArticles.length > 0) {
		links.push({ label: translate("detail.links.wikipedia"), url: place.wikipediaArticles[0].url });
	}
	links.push({ label: translate("detail.links.morePhotos"), url: buildMorePhotosUrl(place) });
	return [...links, ...place.links];
}

/**
 * Mapy.cz in Czech, Mapy.com in the user's language elsewhere: each language file holds the address as a template.
 * The coordinates go in as text, so they keep their decimal point instead of being formatted like numbers.
 */
function buildMapyUrl(place) {
	return translate("detail.links.mapyUrl", { latitude: String(place.latitude), longitude: String(place.longitude) });
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
