/*
	Small HTML snippets for tags shared by the sidebar list and the detail card.
	Colours come from the plan and are passed as --plan-color; the stylesheets adapt them to dark mode.
*/

import { escapeHtml } from "../utils/html.js";

export function renderCategoryTag(category) {
	return `<span class="tag" style="${planColorStyle(category.color)}">${escapeHtml(category.label)}</span>`;
}

/**
 * Itinerary tags (days) are filled and, in the detail card, read "V plánu · Sobota";
 * the list is narrow, so it shows just the day.
 */
function renderTag(tag, { short = false } = {}) {
	if (tag.isItinerary) {
		const text = short ? tag.label : `V plánu · ${tag.label}`;
		return `<span class="tag tag--itinerary" style="${planColorStyle(tag.color)}">${escapeHtml(text)}</span>`;
	}
	return `<span class="tag" style="${planColorStyle(tag.color)}">${escapeHtml(tag.label)}</span>`;
}

export function renderTags(tags, options) {
	return tags.map(tag => renderTag(tag, options)).join("");
}

/** Inline style that hands a plan colour to the stylesheets; empty when the item has no colour of its own. */
export function planColorStyle(color) {
	return color ? `--plan-color: ${escapeHtml(color)}` : "";
}
