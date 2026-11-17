/*
	The place icons built into the app. Each is a standalone SVG file, icons/places/<key>.svg, editable in any SVG tool.
	A plan refers to an icon only by its key (in a category's or a place's "icon"), never with SVG of its own.
	An ES module can't list a folder, so the keys are written out here; keep the list in sync with the folder,
	the precache list in sw.js, claude-skill/trip-map/scripts/build_link.py and reference/plan-format.md.
	Keys are part of the plan format: never rename or remove one, stored plans refer to them.
*/

export const PLACE_ICON_KEYS = Object.freeze([
	"lodging", "camping", "restaurant", "cafe", "bar", "market",
	"airport", "train", "bus", "ferry", "car", "bike",
	"landmark", "museum", "castle", "church", "temple", "ruins", "event", "conference",
	"mountain", "trail", "viewpoint", "water", "beach", "park", "ski",
	"zoo", "amusement", "pool",
	"city", "astronomy", "observatory", "info", "star",
]);

const PLACE_ICON_KEY_SET = new Set(PLACE_ICON_KEYS);

export function isPlaceIconKey(key) {
	return PLACE_ICON_KEY_SET.has(key);
}

/** Relative to the page, like every other app file. */
export function getPlaceIconUrl(iconKey) {
	return `icons/places/${iconKey}.svg`;
}
