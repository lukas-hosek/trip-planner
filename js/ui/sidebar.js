/* Sidebar: plan name and intro, filter chips and the numbered list of places. */

import {
	findPlaceById,
	getActivePlan,
	getFilterOptions,
	getPlaceNumber,
	getPlaces,
	hasItinerary,
	placeMatchesFilter,
} from "../data/active-plan.js";
import { appState, selectPlace, setActiveFilter, subscribe, STATE_EVENTS } from "../state/app-state.js";
import { escapeHtml } from "../utils/html.js";
import { prefersReducedMotion } from "../utils/media-queries.js";
import { planColorStyle, renderTags } from "./tags.js";

const DEFAULT_INTRO = "Klikni na špendlík nebo na místo v seznamu.";
const ITINERARY_INTRO = "Tmavě orámovaná místa jsou ve vašem plánu.";

export function initSidebar() {
	const filterChipsElement = document.getElementById("filter-chips");
	const placeListElement = document.getElementById("place-list");

	renderPlanHeader();

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

function renderPlanHeader() {
	const plan = getActivePlan();
	document.getElementById("plan-name").textContent = plan.name;
	document.getElementById("plan-intro").textContent =
		plan.description || [DEFAULT_INTRO, hasItinerary() ? ITINERARY_INTRO : ""].join(" ").trim();

	const noteElement = document.getElementById("plan-note");
	noteElement.textContent = plan.note;
	noteElement.hidden = !plan.note;
}

function renderFilterChips(filterChipsElement) {
	filterChipsElement.innerHTML = getFilterOptions().map(filterOption => {
		const isActive = filterOption.id === appState.activeFilterId;
		return `
			<button class="filter-chip" type="button" data-filter-id="${escapeHtml(filterOption.id)}" aria-pressed="${isActive}">
				${renderFilterSwatch(filterOption)}${escapeHtml(filterOption.label)}
			</button>`;
	}).join("");
}

/** Categories get a round swatch like their pins, tags a square one like their labels; "Vše" gets none. */
function renderFilterSwatch(filterOption) {
	if (filterOption.kind === "category") {
		return `<span class="filter-swatch filter-swatch--category" style="${planColorStyle(filterOption.color)}"></span>`;
	}
	if (filterOption.kind === "tag") {
		const itineraryClass = filterOption.isItinerary ? " filter-swatch--itinerary" : "";
		return `<span class="filter-swatch filter-swatch--tag${itineraryClass}" style="${planColorStyle(filterOption.color)}"></span>`;
	}
	if (filterOption.kind === "planned") {
		return `<span class="filter-swatch filter-swatch--planned"></span>`;
	}
	return "";
}

function renderPlaceList(placeListElement) {
	const visiblePlaces = getPlaces().filter(place => placeMatchesFilter(place, appState.activeFilterId));
	placeListElement.innerHTML = visiblePlaces.map(renderPlaceListItem).join("");
}

function renderPlaceListItem(place) {
	const isSelected = place === appState.selectedPlace;
	return `
		<li>
			<button class="place-list-item" type="button" data-place-id="${escapeHtml(place.id)}" aria-current="${isSelected}">
				<span class="place-number" style="${planColorStyle(place.category.color)}">${getPlaceNumber(place)}</span>
				<span>
					<span class="place-list-item-name">${escapeHtml(place.name)}</span>
					<span class="place-list-item-meta">
						<span>${escapeHtml(place.category.label)}</span>
						${renderTags(place.tags, { short: true })}
					</span>
				</span>
			</button>
		</li>`;
}

function scrollSelectedPlaceIntoView(placeListElement) {
	if (!appState.selectedPlace) {
		return;
	}
	const selectedItem = placeListElement.querySelector(`[data-place-id="${CSS.escape(appState.selectedPlace.id)}"]`);
	selectedItem?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}
