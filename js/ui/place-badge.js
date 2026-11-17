/*
	How a place is marked in the list and in the detail heading: a circle in its category's colour holding
	its itinerary number, or its icon when it isn't in the itinerary, or a plain dot when it has no icon.
	The pins on the map (js/map/place-markers.js) follow the same rule.
*/

import { getPlaceIconUrl } from "../data/place-icons.js";
import { planColorStyle } from "./tags.js";

/** The icon as a mask over the text colour (see .icon in components.css). The key is one of the app's own, never plan text. */
export function renderPlaceIcon(iconKey, extraClass = "") {
	return `<span class="icon ${extraClass}" style="mask-image: url(${getPlaceIconUrl(iconKey)})" aria-hidden="true"></span>`;
}

export function renderPlaceBadge(place) {
	let content = `<span class="place-badge-dot"></span>`;
	if (place.itineraryNumber !== null) {
		content = String(place.itineraryNumber);
	} else if (place.iconKey) {
		content = renderPlaceIcon(place.iconKey);
	}
	return `<span class="place-badge" style="${planColorStyle(place.category.color)}">${content}</span>`;
}
