/* Small HTML snippets for tags shared by the sidebar list and the detail card. */

import { getCategoryOf } from "../data/places.js";

const STATUS_KIND_TO_CSS_CLASS = {
	ok: "tag--ok",
	warning: "tag--warning",
	info: "tag--info",
};

export function renderCategoryTag(place) {
	const category = getCategoryOf(place);
	return `<span class="tag" style="color: ${category.color}">${category.label}</span>`;
}

/** The list is narrow, so it shows just the day; the detail card has room for "V plánu · Sobota". */
export function renderPlannedDayTag(place, { short = false } = {}) {
	const text = short ? place.plannedDay : `V plánu · ${place.plannedDay}`;
	return `<span class="tag tag--planned">${text}</span>`;
}

export function renderStatusTag(status) {
	return `<span class="tag ${STATUS_KIND_TO_CSS_CLASS[status.kind]}">${status.text}</span>`;
}
