/*
	Fetches a lead photo for each place from Wikipedia's public API.
	Using the article's lead image (instead of hard-coded image URLs) means photos stay valid
	when Wikipedia editors replace or rename files.
*/

import { PHOTO_LOADING_STATUS, setPlacePhotos } from "../state/app-state.js";

// German Wikipedia covers Saxon Switzerland best; English fills the gaps.
const WIKIPEDIA_LANGUAGES_IN_PRIORITY_ORDER = ["de", "en"];
const THUMBNAIL_WIDTH_IN_PIXELS = 960;
const REQUEST_TIMEOUT_IN_MILLISECONDS = 7000;
// Wikipedia redirects can chain; a small limit protects against redirect loops.
const MAXIMUM_REDIRECT_HOPS = 4;

export async function loadPlacePhotos(places) {
	const photosByPlaceId = new Map();
	try {
		for (const language of WIKIPEDIA_LANGUAGES_IN_PRIORITY_ORDER) {
			const placesStillWithoutPhoto = places.filter(place =>
				!photosByPlaceId.has(place.id) && place.wikipediaTitles[language]?.length > 0);
			if (placesStillWithoutPhoto.length === 0) {
				continue;
			}

			const allCandidateTitles = [...new Set(placesStillWithoutPhoto.flatMap(place => place.wikipediaTitles[language]))];
			const findPhotoByTitle = await fetchPhotoLookup(language, allCandidateTitles);

			for (const place of placesStillWithoutPhoto) {
				// Titles are listed best-first; the first one that has an image wins.
				const firstPhotoFound = place.wikipediaTitles[language].map(findPhotoByTitle).find(Boolean);
				if (firstPhotoFound) {
					photosByPlaceId.set(place.id, firstPhotoFound);
				}
			}
		}
		setPlacePhotos(photosByPlaceId, PHOTO_LOADING_STATUS.ready);
	} catch (error) {
		console.warn("Wikipedia photos could not be loaded:", error);
		// Keep whatever arrived before the failure (e.g. German photos when the English request failed).
		const status = photosByPlaceId.size > 0 ? PHOTO_LOADING_STATUS.ready : PHOTO_LOADING_STATUS.unavailable;
		setPlacePhotos(photosByPlaceId, status);
	}
}

/**
 * Asks for all titles in one request (the API accepts up to 50) and returns a function
 * that maps a requested title to { imageUrl, sourcePageUrl } or null.
 */
async function fetchPhotoLookup(language, articleTitles) {
	const wikipediaHost = `${language}.wikipedia.org`;
	const apiUrl = new URL(`https://${wikipediaHost}/w/api.php`);
	apiUrl.search = new URLSearchParams({
		action: "query",
		format: "json",
		// origin=* is what makes Wikipedia send CORS headers for anonymous browser requests.
		origin: "*",
		redirects: "1",
		prop: "pageimages",
		piprop: "thumbnail",
		pithumbsize: String(THUMBNAIL_WIDTH_IN_PIXELS),
		titles: articleTitles.join("|"),
	}).toString();

	const response = await fetchWithTimeout(apiUrl, REQUEST_TIMEOUT_IN_MILLISECONDS);
	if (!response.ok) {
		throw new Error(`Wikipedia API answered HTTP ${response.status}`);
	}
	const { query = {} } = await response.json();

	// The API answers with canonical titles; these maps lead from the title we asked for to the one it answered.
	const canonicalTitleByRequestedTitle = new Map();
	for (const { from, to } of [...(query.normalized ?? []), ...(query.redirects ?? [])]) {
		canonicalTitleByRequestedTitle.set(from, to);
	}
	const thumbnailUrlByCanonicalTitle = new Map();
	for (const page of Object.values(query.pages ?? {})) {
		if (page.thumbnail) {
			thumbnailUrlByCanonicalTitle.set(page.title, page.thumbnail.source);
		}
	}

	return function findPhotoByTitle(requestedTitle) {
		let canonicalTitle = requestedTitle;
		for (let hop = 0; hop < MAXIMUM_REDIRECT_HOPS && canonicalTitleByRequestedTitle.has(canonicalTitle); hop++) {
			canonicalTitle = canonicalTitleByRequestedTitle.get(canonicalTitle);
		}
		const imageUrl = thumbnailUrlByCanonicalTitle.get(canonicalTitle);
		if (!imageUrl) {
			return null;
		}
		const sourcePageUrl = `https://${wikipediaHost}/wiki/${encodeURIComponent(canonicalTitle.replace(/ /g, "_"))}`;
		return { imageUrl, sourcePageUrl };
	};
}

async function fetchWithTimeout(url, timeoutInMilliseconds) {
	const abortController = new AbortController();
	const abortTimer = setTimeout(() => abortController.abort(), timeoutInMilliseconds);
	try {
		return await fetch(url, { signal: abortController.signal });
	} finally {
		clearTimeout(abortTimer);
	}
}
