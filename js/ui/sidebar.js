/* Sidebar: category filter chips and the numbered list of places. */

import {
	CATEGORIES,
	FILTER_ALL_PLACES,
	FILTER_PLANNED_PLACES,
	PLACES,
	findPlaceById,
	getCategoryOf,
	getPlaceNumber,
	placeMatchesFilter,
} from "../data/places.js";
import { appState, selectPlace, setActiveFilter, subscribe, STATE_EVENTS } from "../state/app-state.js";
import { prefersReducedMotion } from "../utils/media-queries.js";
import { renderStatusTag, renderPlannedDayTag } from "./tags.js";

const FILTER_OPTIONS = [
	{ id: FILTER_ALL_PLACES, label: "Vše", swatchColor: null },
	...Object.entries(CATEGORIES).map(([categoryId, category]) => ({
		id: categoryId,
		label: category.label,
		swatchColor: category.color,
	})),
	{ id: FILTER_PLANNED_PLACES, label: "Náš plán", swatchColor: "var(--color-ink)" },
];

export function initSidebar() {
	const filterChipsElement = document.getElementById("filter-chips");
	const placeListElement = document.getElementById("place-list");

	// One listener on the container instead of one per button, because the buttons are re-rendered often.
	filterChipsElement.addEventListener("click", clickEvent => {
		const clickedChip = clickEvent.target.closest("button[data-filter-id]");
		if (clickedChip) {
			setActiveFilter(clickedChip.dataset.filterId);
		}
	});
	placeListElement.addEventListener("click", clickEvent => {
		const clickedItem = clickEvent.target.closest("button[data-place-id]");
		if (clickedItem) {
			selectPlace(findPlaceById(clickedItem.dataset.placeId), { moveMap: true });
		}
	});

	subscribe(STATE_EVENTS.activeFilterChanged, () => {
		renderFilterChips(filterChipsElement);
		renderPlaceList(placeListElement);
	});
	subscribe(STATE_EVENTS.selectedPlaceChanged, () => {
		renderPlaceList(placeListElement);
		scrollSelectedPlaceIntoView(placeListElement);
	});

	renderFilterChips(filterChipsElement);
	renderPlaceList(placeListElement);
}

function renderFilterChips(filterChipsElement) {
	filterChipsElement.innerHTML = FILTER_OPTIONS.map(filterOption => {
		const isActive = filterOption.id === appState.activeFilterId;
		const swatch = filterOption.swatchColor
			? `<span class="category-swatch" style="background: ${filterOption.swatchColor}"></span>`
			: "";
		return `<button class="filter-chip" type="button" id="filter-${filterOption.id}" data-filter-id="${filterOption.id}" aria-pressed="${isActive}">${swatch}${filterOption.label}</button>`;
	}).join("");
}

function renderPlaceList(placeListElement) {
	const visiblePlaces = PLACES.filter(place => placeMatchesFilter(place, appState.activeFilterId));
	placeListElement.innerHTML = visiblePlaces.map(renderPlaceListItem).join("");
}

function renderPlaceListItem(place) {
	const category = getCategoryOf(place);
	const isSelected = place === appState.selectedPlace;
	return `
		<li>
			<button class="place-list-item" type="button" data-place-id="${place.id}" aria-current="${isSelected}">
				<span class="place-number" style="background: ${category.color}">${getPlaceNumber(place)}</span>
				<span>
					<span class="place-list-item-name">${place.name}</span>
					<span class="place-list-item-meta">
						<span>${category.label}</span>
						${place.plannedDay ? renderPlannedDayTag(place, { short: true }) : ""}
						${place.status ? renderStatusTag(place.status) : ""}
					</span>
				</span>
			</button>
		</li>`;
}

function scrollSelectedPlaceIntoView(placeListElement) {
	if (!appState.selectedPlace) {
		return;
	}
	const selectedItem = placeListElement.querySelector(`[data-place-id="${appState.selectedPlace.id}"]`);
	selectedItem?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}
