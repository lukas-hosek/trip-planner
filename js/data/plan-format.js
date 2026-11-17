/*
	Reads a trip plan in the JSON format produced by the Claude skill (see claude-skill/trip-map/reference/plan-format.md)
	and turns it into the shape the app works with.

	Validation is strict only where the map can't work without the data (a name, places, coordinates).
	Everything else is forgiving: an AI-written plan with a typo in a tag id should still open.
	Error messages are in Czech because they are shown to the user.
*/

import { isPlaceIconKey } from "./place-icons.js";

const PLAN_FORMAT_NAME = "trip-plan";
const SUPPORTED_PLAN_VERSION = 1;

// Used when a category has no valid colour; picked in order so neighbouring categories differ.
const FALLBACK_CATEGORY_COLORS = ["#b0731c", "#9c4a2f", "#575c93", "#2b7c7f", "#2f7a4b", "#8a4f7d", "#4a6fa5", "#7a6a2e"];
// Categories and tags that a place mentions but the plan doesn't define get this neutral grey.
const UNDEFINED_ITEM_COLOR = "#6f7a73";
const UNCATEGORIZED_CATEGORY_ID = "other";
const UNCATEGORIZED_CATEGORY_LABEL = "Ostatní";

/*
	Limits. A link can come from anyone, so a plan must not be able to grow until the app stops responding.
	Real plans stay far below them. Too many places, categories or tags refuse the plan; everything else is shortened.
	claude-skill/trip-map/scripts/build_link.py checks the same values; keep both in sync.
*/
const MAXIMUM_PLACE_COUNT = 300;
const MAXIMUM_CATEGORY_COUNT = 50;
const MAXIMUM_TAG_COUNT = 100;
const MAXIMUM_TAGS_PER_PLACE = 20;
const MAXIMUM_WIKIPEDIA_ARTICLES_PER_PLACE = 10;
const MAXIMUM_LINKS_PER_PLACE = 10;
const MAXIMUM_NAME_LENGTH = 150;
const MAXIMUM_LABEL_LENGTH = 80;
const MAXIMUM_PLAN_TEXT_LENGTH = 2000;
const MAXIMUM_PLACE_TEXT_LENGTH = 5000;
const MAXIMUM_URL_LENGTH = 2000;
// MediaWiki itself allows no longer titles.
const MAXIMUM_WIKI_PAGE_TITLE_LENGTH = 255;

export class PlanFormatError extends Error {
	constructor(message) {
		super(message);
		this.name = "PlanFormatError";
	}
}

/**
 * @returns {{ name, description, note, categories: Map, tags: Map, places: Array }}
 *   Categories have: id, label, color, iconKey (a key from place-icons.js, or null).
 *   Places have: id, name, category, tags, isPlanned, itineraryNumber (1, 2, … among the planned places, else null),
 *   iconKey (or null), latitude, longitude, description, tip, website,
 *   wikipediaArticles [{ language, title, url }], commons ({ fileTitle, categoryUrl, subject } or null),
 *   links [{ label, url }].
 */
export function normalizePlan(rawPlan) {
	if (!isPlainObject(rawPlan)) {
		throw new PlanFormatError("Plán musí být JSON objekt.");
	}
	if (rawPlan.format !== undefined && rawPlan.format !== PLAN_FORMAT_NAME) {
		throw new PlanFormatError(`Tohle není plán výletu (format „${cleanText(rawPlan.format, MAXIMUM_LABEL_LENGTH)}“).`);
	}
	const version = Number(rawPlan.version ?? SUPPORTED_PLAN_VERSION);
	if (version > SUPPORTED_PLAN_VERSION) {
		throw new PlanFormatError(`Plán je ve verzi ${version}, kterou tahle aplikace ještě nezná. Obnovte stránku, ať se načte nová verze aplikace.`);
	}

	const name = cleanText(rawPlan.name, MAXIMUM_NAME_LENGTH);
	if (!name) {
		throw new PlanFormatError("Plán nemá název (pole „name“).");
	}
	if (!Array.isArray(rawPlan.places) || rawPlan.places.length === 0) {
		throw new PlanFormatError("Plán neobsahuje žádná místa (pole „places“).");
	}
	if (rawPlan.places.length > MAXIMUM_PLACE_COUNT) {
		throw new PlanFormatError(`Plán má příliš mnoho míst (${rawPlan.places.length}, nejvýše ${MAXIMUM_PLACE_COUNT}).`);
	}

	const categories = normalizeCategories(rawPlan.categories);
	const tags = normalizeTags(rawPlan.tags);
	const usedPlaceIds = new Set();
	const places = rawPlan.places.map((rawPlace, index) => normalizePlace(rawPlace, index, { categories, tags, usedPlaceIds }));
	// Only the itinerary is numbered, in its own order, so the numbers read 1, 2, 3… along the trip.
	let itineraryNumber = 0;
	for (const place of places) {
		place.itineraryNumber = place.isPlanned ? ++itineraryNumber : null;
	}
	// Counted after the places, which add the categories and tags they use without the plan defining them.
	if (categories.size > MAXIMUM_CATEGORY_COUNT) {
		throw new PlanFormatError(`Plán má příliš mnoho kategorií (${categories.size}, nejvýše ${MAXIMUM_CATEGORY_COUNT}).`);
	}
	if (tags.size > MAXIMUM_TAG_COUNT) {
		throw new PlanFormatError(`Plán má příliš mnoho štítků (${tags.size}, nejvýše ${MAXIMUM_TAG_COUNT}).`);
	}

	return {
		name,
		description: cleanText(rawPlan.description, MAXIMUM_PLAN_TEXT_LENGTH),
		note: cleanText(rawPlan.note, MAXIMUM_PLAN_TEXT_LENGTH),
		categories: keepOnlyUsed(categories, places.map(place => place.category)),
		tags,
		places,
	};
}

/** Plan names identify plans: importing a plan with a known name replaces the stored one. */
export function getPlanKey(planName) {
	return cleanText(planName).replace(/\s+/g, " ").toLocaleLowerCase("cs");
}

/**
 * Accepts "https://de.wikipedia.org/wiki/Basteibrücke", the mobile variant, percent-encoded titles,
 * and the short form "de:Basteibrücke". Returns null for anything else.
 */
function parseWikipediaReference(reference) {
	const text = cleanText(reference);
	if (text.length > MAXIMUM_URL_LENGTH) {
		return null;
	}
	const shortFormMatch = text.match(/^([a-z]{2,3}(?:-[a-z]+)?):([^/].*)$/i);
	if (shortFormMatch && !text.includes("//")) {
		return buildWikipediaArticle(shortFormMatch[1], shortFormMatch[2]);
	}

	const url = parseHttpUrl(text);
	const hostMatch = url?.hostname.match(/^([a-z]{2,3}(?:-[a-z]+)?)\.(?:m\.)?wikipedia\.org$/i);
	if (!hostMatch || !url.pathname.startsWith("/wiki/")) {
		return null;
	}
	try {
		return buildWikipediaArticle(hostMatch[1], decodeURIComponent(url.pathname.slice("/wiki/".length)));
	} catch {
		return null;
	}
}

function buildWikipediaArticle(language, rawTitle) {
	const title = rawTitle.replace(/_/g, " ").trim();
	if (!title || title.length > MAXIMUM_WIKI_PAGE_TITLE_LENGTH) {
		return null;
	}
	const normalizedLanguage = language.toLowerCase();
	return {
		language: normalizedLanguage,
		title,
		url: `https://${normalizedLanguage}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
	};
}

/**
 * The place's Wikimedia Commons photo: { "file": File page URL, "category": Category page URL,
 * "subject": what the photo shows when it isn't the place itself (e.g. the town) }.
 * A bare File or Category link is accepted too. Returns null when neither a file nor a category is usable.
 */
function parseCommonsReference(rawCommons) {
	const rawReference = isPlainObject(rawCommons) ? rawCommons : null;
	const fileTitle = parseCommonsPageTitle(rawReference ? rawReference.file : rawCommons, "File");
	const categoryTitle = parseCommonsPageTitle(rawReference ? rawReference.category : rawCommons, "Category");
	if (!fileTitle && !categoryTitle) {
		return null;
	}
	return {
		fileTitle,
		categoryUrl: categoryTitle ? buildCommonsPageUrl(categoryTitle) : null,
		subject: rawReference ? cleanText(rawReference.subject, MAXIMUM_NAME_LENGTH) : "",
	};
}

const COMMONS_NAMESPACE_ALIASES = {
	File: ["file", "image"],
	Category: ["category"],
};

/**
 * Accepts "https://commons.wikimedia.org/wiki/File:Name.jpg" (also mobile and percent-encoded), "File:Name.jpg",
 * and for files also a direct upload.wikimedia.org image URL. Returns "File:Name.jpg" / "Category:Name" or null.
 */
function parseCommonsPageTitle(reference, namespace) {
	let pageName = cleanText(reference);
	if (pageName.length > MAXIMUM_URL_LENGTH) {
		return null;
	}
	const url = parseHttpUrl(pageName);
	if (url) {
		pageName = "";
		if (/^commons\.(m\.)?wikimedia\.org$/i.test(url.hostname) && url.pathname.startsWith("/wiki/")) {
			pageName = decodeUrlPart(url.pathname.slice("/wiki/".length));
		} else if (namespace === "File" && url.hostname === "upload.wikimedia.org") {
			// /wikipedia/commons/a/ab/Name.jpg, or the thumbnail form /wikipedia/commons/thumb/a/ab/Name.jpg/960px-Name.jpg
			const fileNameMatch = url.pathname.match(/^\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
			pageName = fileNameMatch ? `File:${decodeUrlPart(fileNameMatch[1])}` : "";
		}
	}
	const separatorIndex = pageName.indexOf(":");
	const prefix = pageName.slice(0, separatorIndex).trim().toLowerCase();
	const title = pageName.slice(separatorIndex + 1).replace(/_/g, " ").trim();
	if (separatorIndex < 0 || !COMMONS_NAMESPACE_ALIASES[namespace].includes(prefix) || !title || title.length > MAXIMUM_WIKI_PAGE_TITLE_LENGTH) {
		return null;
	}
	return `${namespace}:${title}`;
}

function buildCommonsPageUrl(pageTitle) {
	const [namespace, ...titleParts] = pageTitle.split(":");
	return `https://commons.wikimedia.org/wiki/${namespace}:${encodeURIComponent(titleParts.join(":").replace(/ /g, "_"))}`;
}

function decodeUrlPart(urlPart) {
	try {
		return decodeURIComponent(urlPart);
	} catch {
		return "";
	}
}

function normalizeCategories(rawCategories) {
	const categories = new Map();
	for (const [index, [id, rawCategory]] of readDefinitions(rawCategories).entries()) {
		categories.set(id, {
			id,
			label: cleanText(rawCategory.label, MAXIMUM_LABEL_LENGTH) || id,
			color: parseColor(rawCategory.color) ?? FALLBACK_CATEGORY_COLORS[index % FALLBACK_CATEGORY_COLORS.length],
			// A category named like an icon ("castle") gets that icon without asking for it.
			iconKey: parseIconKey(rawCategory.icon) ?? parseIconKey(id),
		});
	}
	return categories;
}

function normalizeTags(rawTags) {
	const tags = new Map();
	for (const [id, rawTag] of readDefinitions(rawTags)) {
		const isItinerary = rawTag.itinerary === true;
		tags.set(id, {
			id,
			label: cleanText(rawTag.label, MAXIMUM_LABEL_LENGTH) || id,
			color: parseColor(rawTag.color),
			isItinerary,
			// Only days of the itinerary and tags the plan explicitly marks filterable get a filter chip.
			isFilterable: isItinerary || rawTag.filterable === true,
		});
	}
	return tags;
}

/** Categories and tags are normally an object keyed by id, but an array of { id, … } is accepted too. */
function readDefinitions(rawDefinitions) {
	if (Array.isArray(rawDefinitions)) {
		return rawDefinitions
			.filter(definition => isPlainObject(definition) && cleanText(definition.id))
			.map(definition => [cleanText(definition.id, MAXIMUM_LABEL_LENGTH), definition]);
	}
	if (isPlainObject(rawDefinitions)) {
		return Object.entries(rawDefinitions)
			.map(([id, definition]) => [cleanText(id, MAXIMUM_LABEL_LENGTH), isPlainObject(definition) ? definition : { label: definition }])
			.filter(([id]) => id);
	}
	return [];
}

function normalizePlace(rawPlace, index, { categories, tags, usedPlaceIds }) {
	const placeNumber = index + 1;
	if (!isPlainObject(rawPlace)) {
		throw new PlanFormatError(`Místo č. ${placeNumber} není platný objekt.`);
	}
	const name = cleanText(rawPlace.name, MAXIMUM_NAME_LENGTH);
	if (!name) {
		throw new PlanFormatError(`Místo č. ${placeNumber} nemá název.`);
	}
	const latitude = parseCoordinate(rawPlace.lat ?? rawPlace.latitude, 90);
	const longitude = parseCoordinate(rawPlace.lng ?? rawPlace.lon ?? rawPlace.longitude, 180);
	if (latitude === null || longitude === null) {
		throw new PlanFormatError(`Místo č. ${placeNumber} (${name}) nemá platné souřadnice („lat“ a „lng“).`);
	}

	const placeTags = findOrCreateTags(rawPlace.tags, tags);
	const category = findOrCreateCategory(cleanText(rawPlace.category, MAXIMUM_LABEL_LENGTH), categories);
	return {
		id: makeUniqueId(slugify(cleanText(rawPlace.id, MAXIMUM_LABEL_LENGTH)) || slugify(name) || `misto-${placeNumber}`, usedPlaceIds),
		name,
		category,
		tags: placeTags,
		isPlanned: placeTags.some(tag => tag.isItinerary),
		itineraryNumber: null,
		// A place's own icon overrides its category's (an airport among "Doprava").
		iconKey: parseIconKey(rawPlace.icon) ?? category.iconKey,
		latitude,
		longitude,
		description: cleanText(rawPlace.description, MAXIMUM_PLACE_TEXT_LENGTH),
		tip: cleanText(rawPlace.tip, MAXIMUM_PLACE_TEXT_LENGTH),
		website: parseHttpUrl(rawPlace.website)?.href ?? null,
		wikipediaArticles: toArray(rawPlace.wikipedia).map(parseWikipediaReference).filter(Boolean).slice(0, MAXIMUM_WIKIPEDIA_ARTICLES_PER_PLACE),
		commons: parseCommonsReference(rawPlace.commons),
		links: toArray(rawPlace.links).map(normalizeLink).filter(Boolean).slice(0, MAXIMUM_LINKS_PER_PLACE),
	};
}

function findOrCreateCategory(categoryId, categories) {
	const id = categoryId || UNCATEGORIZED_CATEGORY_ID;
	if (!categories.has(id)) {
		const label = categoryId || UNCATEGORIZED_CATEGORY_LABEL;
		categories.set(id, { id, label, color: UNDEFINED_ITEM_COLOR, iconKey: parseIconKey(id) });
	}
	return categories.get(id);
}

function findOrCreateTags(rawTagIds, tags) {
	const tagIds = [...new Set(toArray(rawTagIds).map(tagId => cleanText(tagId, MAXIMUM_LABEL_LENGTH)).filter(Boolean))]
		.slice(0, MAXIMUM_TAGS_PER_PLACE);
	return tagIds.map(tagId => {
		if (!tags.has(tagId)) {
			tags.set(tagId, { id: tagId, label: tagId, color: null, isItinerary: false });
		}
		return tags.get(tagId);
	});
}

function normalizeLink(rawLink) {
	const url = parseHttpUrl(isPlainObject(rawLink) ? rawLink.url : rawLink);
	if (!url) {
		return null;
	}
	const label = isPlainObject(rawLink) ? cleanText(rawLink.label, MAXIMUM_LABEL_LENGTH) : "";
	return { label: label || url.hostname.replace(/^www\./, ""), url: url.href };
}

/** A category nobody uses would only add an empty filter chip. */
function keepOnlyUsed(definitionsById, usedDefinitions) {
	const usedIds = new Set(usedDefinitions.map(definition => definition.id));
	return new Map([...definitionsById].filter(([id]) => usedIds.has(id)));
}

function parseCoordinate(value, maximumAbsoluteValue) {
	const number = typeof value === "string" ? Number(value.trim()) : value;
	if (typeof number !== "number" || !Number.isFinite(number) || Math.abs(number) > maximumAbsoluteValue) {
		return null;
	}
	return number;
}

/** A key of one of the app's icons, or null: an unknown key simply gets the plain dot, not an error. */
function parseIconKey(value) {
	const key = cleanText(value, MAXIMUM_LABEL_LENGTH).toLowerCase();
	return isPlaceIconKey(key) ? key : null;
}

/**
 * Colours end up inside style attributes, so only plain colour values are let through:
 * hex codes, or colour functions and names the browser accepts. var(), url() and the like are rejected.
 */
function parseColor(value) {
	const color = cleanText(value);
	if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) {
		return color;
	}
	const isPlainColorSyntax = /^([a-z]+|(rgb|hsl|hwb|lab|lch|oklab|oklch)a?\([\d\s.,%/+-]*\))$/i.test(color);
	if (isPlainColorSyntax && globalThis.CSS?.supports("color", color)) {
		return color;
	}
	return null;
}

function parseHttpUrl(value) {
	const text = cleanText(value);
	if (text.length > MAXIMUM_URL_LENGTH) {
		return null;
	}
	try {
		const url = new URL(text);
		return url.protocol === "https:" || url.protocol === "http:" ? url : null;
	} catch {
		return null;
	}
}

export function slugify(text) {
	return text
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function makeUniqueId(baseId, usedIds) {
	let id = baseId;
	for (let suffix = 2; usedIds.has(id); suffix++) {
		id = `${baseId}-${suffix}`;
	}
	usedIds.add(id);
	return id;
}

/** Text of a plan field, trimmed; "" for anything that isn't text. Text over the maximum length is cut and ends with "…". */
function cleanText(value, maximumLength = Infinity) {
	let text = "";
	if (typeof value === "string") {
		text = value.trim();
	} else if (typeof value === "number") {
		text = String(value);
	}
	return text.length > maximumLength ? `${text.slice(0, maximumLength - 1).trimEnd()}…` : text;
}

function toArray(value) {
	if (value === undefined || value === null) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
}

function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
