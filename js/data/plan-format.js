/*
	Reads a trip plan in the JSON format produced by the Claude skill (see claude-skill/trip-map/reference/plan-format.md)
	and turns it into the shape the app works with.

	Validation is strict only where the map can't work without the data (a name, places, coordinates).
	Everything else is forgiving: an AI-written plan with a typo in a tag id should still open.
	Error messages are in Czech because they are shown to the user.
*/

const PLAN_FORMAT_NAME = "trip-plan";
const SUPPORTED_PLAN_VERSION = 1;

// Used when a category has no valid colour; picked in order so neighbouring categories differ.
const FALLBACK_CATEGORY_COLORS = ["#b0731c", "#9c4a2f", "#575c93", "#2b7c7f", "#2f7a4b", "#8a4f7d", "#4a6fa5", "#7a6a2e"];
// Categories and tags that a place mentions but the plan doesn't define get this neutral grey.
const UNDEFINED_ITEM_COLOR = "#6f7a73";
const UNCATEGORIZED_CATEGORY_ID = "other";
const UNCATEGORIZED_CATEGORY_LABEL = "Ostatní";

export class PlanFormatError extends Error {
	constructor(message) {
		super(message);
		this.name = "PlanFormatError";
	}
}

/**
 * @returns {{ name, description, note, categories: Map, tags: Map, places: Array }}
 *   Places have: id, name, category, tags, isPlanned, latitude, longitude, description, tip, website,
 *   wikipediaArticles [{ language, title, url }], commons ({ fileTitle, categoryUrl, subject } or null),
 *   links [{ label, url }].
 */
export function normalizePlan(rawPlan) {
	if (!isPlainObject(rawPlan)) {
		throw new PlanFormatError("Plán musí být JSON objekt.");
	}
	if (rawPlan.format !== undefined && rawPlan.format !== PLAN_FORMAT_NAME) {
		throw new PlanFormatError(`Tohle není plán výletu (format „${cleanText(rawPlan.format)}“).`);
	}
	const version = Number(rawPlan.version ?? SUPPORTED_PLAN_VERSION);
	if (version > SUPPORTED_PLAN_VERSION) {
		throw new PlanFormatError(`Plán je ve verzi ${version}, kterou tahle aplikace ještě nezná. Obnovte stránku, ať se načte nová verze aplikace.`);
	}

	const name = cleanText(rawPlan.name);
	if (!name) {
		throw new PlanFormatError("Plán nemá název (pole „name“).");
	}
	if (!Array.isArray(rawPlan.places) || rawPlan.places.length === 0) {
		throw new PlanFormatError("Plán neobsahuje žádná místa (pole „places“).");
	}

	const categories = normalizeCategories(rawPlan.categories);
	const tags = normalizeTags(rawPlan.tags);
	const usedPlaceIds = new Set();
	const places = rawPlan.places.map((rawPlace, index) => normalizePlace(rawPlace, index, { categories, tags, usedPlaceIds }));

	return {
		name,
		description: cleanText(rawPlan.description),
		note: cleanText(rawPlan.note),
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
	if (!title) {
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
		subject: rawReference ? cleanText(rawReference.subject) : "",
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
	if (separatorIndex < 0 || !COMMONS_NAMESPACE_ALIASES[namespace].includes(prefix) || !title) {
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
			label: cleanText(rawCategory.label) || id,
			color: parseColor(rawCategory.color) ?? FALLBACK_CATEGORY_COLORS[index % FALLBACK_CATEGORY_COLORS.length],
		});
	}
	return categories;
}

function normalizeTags(rawTags) {
	const tags = new Map();
	for (const [id, rawTag] of readDefinitions(rawTags)) {
		tags.set(id, {
			id,
			label: cleanText(rawTag.label) || id,
			color: parseColor(rawTag.color),
			isItinerary: rawTag.itinerary === true,
		});
	}
	return tags;
}

/** Categories and tags are normally an object keyed by id, but an array of { id, … } is accepted too. */
function readDefinitions(rawDefinitions) {
	if (Array.isArray(rawDefinitions)) {
		return rawDefinitions
			.filter(definition => isPlainObject(definition) && cleanText(definition.id))
			.map(definition => [cleanText(definition.id), definition]);
	}
	if (isPlainObject(rawDefinitions)) {
		return Object.entries(rawDefinitions)
			.map(([id, definition]) => [id.trim(), isPlainObject(definition) ? definition : { label: definition }])
			.filter(([id]) => id);
	}
	return [];
}

function normalizePlace(rawPlace, index, { categories, tags, usedPlaceIds }) {
	const placeNumber = index + 1;
	if (!isPlainObject(rawPlace)) {
		throw new PlanFormatError(`Místo č. ${placeNumber} není platný objekt.`);
	}
	const name = cleanText(rawPlace.name);
	if (!name) {
		throw new PlanFormatError(`Místo č. ${placeNumber} nemá název.`);
	}
	const latitude = parseCoordinate(rawPlace.lat ?? rawPlace.latitude, 90);
	const longitude = parseCoordinate(rawPlace.lng ?? rawPlace.lon ?? rawPlace.longitude, 180);
	if (latitude === null || longitude === null) {
		throw new PlanFormatError(`Místo č. ${placeNumber} (${name}) nemá platné souřadnice („lat“ a „lng“).`);
	}

	const placeTags = findOrCreateTags(rawPlace.tags, tags);
	return {
		id: makeUniqueId(slugify(cleanText(rawPlace.id)) || slugify(name) || `misto-${placeNumber}`, usedPlaceIds),
		name,
		category: findOrCreateCategory(cleanText(rawPlace.category), categories),
		tags: placeTags,
		isPlanned: placeTags.some(tag => tag.isItinerary),
		latitude,
		longitude,
		description: cleanText(rawPlace.description),
		tip: cleanText(rawPlace.tip),
		website: parseHttpUrl(rawPlace.website)?.href ?? null,
		wikipediaArticles: toArray(rawPlace.wikipedia).map(parseWikipediaReference).filter(Boolean),
		commons: parseCommonsReference(rawPlace.commons),
		links: toArray(rawPlace.links).map(normalizeLink).filter(Boolean),
	};
}

function findOrCreateCategory(categoryId, categories) {
	const id = categoryId || UNCATEGORIZED_CATEGORY_ID;
	if (!categories.has(id)) {
		const label = categoryId || UNCATEGORIZED_CATEGORY_LABEL;
		categories.set(id, { id, label, color: UNDEFINED_ITEM_COLOR });
	}
	return categories.get(id);
}

function findOrCreateTags(rawTagIds, tags) {
	const tagIds = [...new Set(toArray(rawTagIds).map(cleanText).filter(Boolean))];
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
	const label = isPlainObject(rawLink) ? cleanText(rawLink.label) : "";
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
	try {
		const url = new URL(cleanText(value));
		return url.protocol === "https:" || url.protocol === "http:" ? url : null;
	} catch {
		return null;
	}
}

export function slugify(text) {
	return text
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
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

function cleanText(value) {
	if (typeof value === "string") {
		return value.trim();
	}
	return typeof value === "number" ? String(value) : "";
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
