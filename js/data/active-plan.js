/*
	The plan currently shown on the map. main.js sets it once at start-up, before any UI is built;
	switching to another plan reloads the page, so it never changes while the UI is running.
*/

import { translate } from "../language/translations.js";

export const FILTER_ALL_PLACES = "all";
const FILTER_PLANNED_PLACES = "planned";
// Categories and tags may share ids ("castle" could be both), so filter ids say which one they mean.
const CATEGORY_FILTER_PREFIX = "category:";
const TAG_FILTER_PREFIX = "tag:";

let activePlan = null;

/** @param plan  a plan returned by normalizePlan() */
export function setActivePlan(plan) {
	activePlan = plan;
}

export function getActivePlan() {
	return activePlan;
}

export function getPlaces() {
	return activePlan.places;
}

export function findPlaceById(placeId) {
	return activePlan.places.find(place => place.id === placeId) ?? null;
}

export function hasItinerary() {
	return activePlan.places.some(place => place.isPlanned);
}

/** Filter chips in display order: all places, categories, the itinerary, then filterable tags that some place uses. */
export function getFilterOptions() {
	const filterOptions = [{ id: FILTER_ALL_PLACES, label: translate("plan.filterAll"), kind: "all", color: null }];
	for (const category of activePlan.categories.values()) {
		filterOptions.push({ id: CATEGORY_FILTER_PREFIX + category.id, label: category.label, kind: "category", color: category.color });
	}
	if (hasItinerary()) {
		filterOptions.push({ id: FILTER_PLANNED_PLACES, label: translate("plan.filterPlanned"), kind: "planned", color: null });
	}
	for (const tag of activePlan.tags.values()) {
		if (tag.isFilterable && activePlan.places.some(place => place.tags.includes(tag))) {
			filterOptions.push({ id: TAG_FILTER_PREFIX + tag.id, label: tag.label, kind: "tag", color: tag.color, isItinerary: tag.isItinerary });
		}
	}
	return filterOptions;
}

export function placeMatchesFilter(place, filterId) {
	if (filterId === FILTER_ALL_PLACES) {
		return true;
	}
	if (filterId === FILTER_PLANNED_PLACES) {
		return place.isPlanned;
	}
	if (filterId.startsWith(CATEGORY_FILTER_PREFIX)) {
		return place.category.id === filterId.slice(CATEGORY_FILTER_PREFIX.length);
	}
	if (filterId.startsWith(TAG_FILTER_PREFIX)) {
		const tagId = filterId.slice(TAG_FILTER_PREFIX.length);
		return place.tags.some(tag => tag.id === tagId);
	}
	return false;
}
