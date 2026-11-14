/*
	Finds a photo for each place:
	1. the Wikimedia Commons file chosen in the plan (the skill picks one for every place);
	2. if there is none, or it can't be found (a mistyped file name), the lead image of the first
	   Wikipedia article in the place's list that has one;
	3. otherwise the detail card shows a placeholder.
	Both come from the public MediaWiki APIs, which answer many titles in one request.
*/

import { PHOTO_LOADING_STATUS, setPlacePhotos } from "../state/app-state.js";

const COMMONS_API_HOST = "commons.wikimedia.org";
const THUMBNAIL_WIDTH_IN_PIXELS = 960;
const REQUEST_TIMEOUT_IN_MILLISECONDS = 7000;
// The API accepts at most 50 titles per request.
const MAXIMUM_TITLES_PER_REQUEST = 50;
// Redirects can chain; a small limit protects against redirect loops.
const MAXIMUM_REDIRECT_HOPS = 4;
// Every language is a request to another Wikipedia host. Real plans use two or three; a crafted one could name thousands.
const MAXIMUM_WIKIPEDIA_LANGUAGE_COUNT = 10;

/**
 * Publishes photosByPlaceId: placeId -> { imageUrl, sourcePageUrl, source: "commons" | "wikipedia", subject },
 * where subject names what a Commons photo shows when it isn't the place itself (e.g. the town).
 */
export async function loadPlacePhotos(places) {
	const photosByPlaceId = new Map();
	let failedLookupCount = 0;

	const placesWithCommonsFile = places.filter(place => place.commons?.fileTitle);
	if (placesWithCommonsFile.length > 0) {
		try {
			const findCommonsPhoto = await fetchCommonsPhotoLookup(placesWithCommonsFile.map(place => place.commons.fileTitle));
			for (const place of placesWithCommonsFile) {
				const photo = findCommonsPhoto(place.commons.fileTitle);
				if (photo) {
					photosByPlaceId.set(place.id, { ...photo, subject: place.commons.subject });
				}
			}
		} catch (error) {
			failedLookupCount++;
			console.warn("Wikimedia Commons photos could not be loaded:", error);
		}
	}

	const placesForWikipedia = places.filter(place => !photosByPlaceId.has(place.id) && place.wikipediaArticles.length > 0);
	const titlesByLanguage = new Map();
	for (const article of placesForWikipedia.flatMap(place => place.wikipediaArticles)) {
		if (!titlesByLanguage.has(article.language)) {
			titlesByLanguage.set(article.language, new Set());
		}
		titlesByLanguage.get(article.language).add(article.title);
	}

	// One lookup per language, all in parallel; a failing language doesn't spoil the others.
	const languages = [...titlesByLanguage.keys()].slice(0, MAXIMUM_WIKIPEDIA_LANGUAGE_COUNT);
	const lookupResults = await Promise.allSettled(languages.map(language => fetchWikipediaPhotoLookup(language, [...titlesByLanguage.get(language)])));
	const findWikipediaPhotoByLanguage = new Map();
	lookupResults.forEach((lookupResult, index) => {
		if (lookupResult.status === "fulfilled") {
			findWikipediaPhotoByLanguage.set(languages[index], lookupResult.value);
		} else {
			failedLookupCount++;
			console.warn(`Wikipedia photos (${languages[index]}) could not be loaded:`, lookupResult.reason);
		}
	});
	for (const place of placesForWikipedia) {
		// Articles are listed best-first; the first one that has an image wins.
		const firstPhotoFound = place.wikipediaArticles
			.map(article => findWikipediaPhotoByLanguage.get(article.language)?.(article.title))
			.find(Boolean);
		if (firstPhotoFound) {
			photosByPlaceId.set(place.id, { ...firstPhotoFound, subject: "" });
		}
	}

	const status = photosByPlaceId.size === 0 && failedLookupCount > 0 ? PHOTO_LOADING_STATUS.unavailable : PHOTO_LOADING_STATUS.ready;
	setPlacePhotos(photosByPlaceId, status);
}

/** @returns a function from a requested "File:…" title to { imageUrl, sourcePageUrl, source } or null */
async function fetchCommonsPhotoLookup(fileTitles) {
	const findPage = await fetchPagesByTitle(COMMONS_API_HOST, fileTitles, {
		prop: "imageinfo",
		iiprop: "url",
		iiurlwidth: String(THUMBNAIL_WIDTH_IN_PIXELS),
	});
	return function findCommonsPhoto(fileTitle) {
		const imageInfo = findPage(fileTitle)?.imageinfo?.[0];
		const imageUrl = imageInfo?.thumburl ?? imageInfo?.url;
		// Both addresses end up in the page, so only ordinary web addresses are taken from the answer.
		if (!isHttpsUrl(imageUrl) || !isHttpsUrl(imageInfo.descriptionurl)) {
			return null;
		}
		return { imageUrl, sourcePageUrl: imageInfo.descriptionurl, source: "commons" };
	};
}

/** @returns a function from a requested article title to { imageUrl, sourcePageUrl, source } or null */
async function fetchWikipediaPhotoLookup(language, articleTitles) {
	const wikipediaHost = `${language}.wikipedia.org`;
	const findPage = await fetchPagesByTitle(wikipediaHost, articleTitles, {
		prop: "pageimages",
		piprop: "thumbnail",
		pithumbsize: String(THUMBNAIL_WIDTH_IN_PIXELS),
	});
	return function findWikipediaPhoto(articleTitle) {
		const page = findPage(articleTitle);
		if (!isHttpsUrl(page?.thumbnail?.source)) {
			return null;
		}
		const sourcePageUrl = `https://${wikipediaHost}/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
		return { imageUrl: page.thumbnail.source, sourcePageUrl, source: "wikipedia" };
	};
}

/**
 * Asks a MediaWiki API about many pages (in requests of up to 50 titles) and returns a function
 * that maps a requested title to its page in the answers, or null if the page doesn't exist.
 */
async function fetchPagesByTitle(apiHost, titles, queryParameters) {
	const titleBatches = [];
	for (let start = 0; start < titles.length; start += MAXIMUM_TITLES_PER_REQUEST) {
		titleBatches.push(titles.slice(start, start + MAXIMUM_TITLES_PER_REQUEST));
	}
	const answers = await Promise.all(titleBatches.map(titleBatch => fetchQuery(apiHost, { ...queryParameters, titles: titleBatch.join("|") })));

	// The API answers with canonical titles; these maps lead from the title we asked for to the page it answered.
	const canonicalTitleByRequestedTitle = new Map();
	const pageByCanonicalTitle = new Map();
	for (const query of answers) {
		for (const { from, to } of [...(query.normalized ?? []), ...(query.redirects ?? [])]) {
			canonicalTitleByRequestedTitle.set(from, to);
		}
		for (const page of Object.values(query.pages ?? {})) {
			if (!("missing" in page) && !("invalid" in page)) {
				pageByCanonicalTitle.set(page.title, page);
			}
		}
	}

	return function findPage(requestedTitle) {
		let canonicalTitle = requestedTitle;
		for (let hop = 0; hop < MAXIMUM_REDIRECT_HOPS && canonicalTitleByRequestedTitle.has(canonicalTitle); hop++) {
			canonicalTitle = canonicalTitleByRequestedTitle.get(canonicalTitle);
		}
		return pageByCanonicalTitle.get(canonicalTitle) ?? null;
	};
}

function isHttpsUrl(value) {
	try {
		return typeof value === "string" && new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

async function fetchQuery(apiHost, parameters) {
	const apiUrl = new URL(`https://${apiHost}/w/api.php`);
	apiUrl.search = new URLSearchParams({
		action: "query",
		format: "json",
		// origin=* is what makes MediaWiki send CORS headers for anonymous browser requests.
		origin: "*",
		redirects: "1",
		...parameters,
	}).toString();

	const response = await fetchWithTimeout(apiUrl, REQUEST_TIMEOUT_IN_MILLISECONDS);
	if (!response.ok) {
		throw new Error(`${apiHost} answered HTTP ${response.status}`);
	}
	const { query = {} } = await response.json();
	return query;
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
