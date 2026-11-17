/*
	Sidebar: plan name and intro, filter chips and the list of places.
	On phones the list is a bottom sheet over the map, and the filter row can be expanded over the map.
*/

import {
	findPlaceById,
	getActivePlan,
	getFilterOptions,
	getPlaces,
	hasItinerary,
	placeMatchesFilter,
} from "../data/active-plan.js";
import { appState, selectPlace, setActiveFilter, subscribe, STATE_EVENTS } from "../state/app-state.js";
import { escapeHtml } from "../utils/html.js";
import { isPhoneLayout, onPhoneLayoutChange, prefersReducedMotion } from "../utils/media-queries.js";
import { computeSheetStops, createBottomSheet } from "./bottom-sheet.js";
import { renderPlaceBadge } from "./place-badge.js";
import { planColorStyle, renderTags } from "./tags.js";

const DEFAULT_INTRO = "Klikni na špendlík nebo na místo v seznamu.";
const ITINERARY_INTRO = "Očíslovaná místa jsou ve vašem plánu.";
// What a tap on the list sheet's handle does at each stop (peek, half, full).
const LIST_SHEET_HANDLE_LABELS = ["Rozbalit seznam", "Zvětšit seznam", "Sbalit seznam"];
const LIST_SHEET_HALF_STOP_INDEX = 1;

/** @returns the list sheet's element, which the map must keep clear of on phones */
export function initSidebar() {
	const filterChipsElement = document.getElementById("filter-chips");
	const placeListElement = document.getElementById("place-list");
	const placeSheetElement = document.getElementById("place-sheet");

	renderPlanHeader();

	createBottomSheet(placeSheetElement, {
		handleElement: placeSheetElement.querySelector(".sheet-handle"),
		getSnapHeights: () => {
			const { peek, half, full } = computeSheetStops();
			return [peek, half, full];
		},
		getHandleLabel: snapIndex => LIST_SHEET_HANDLE_LABELS[snapIndex],
		initialSnapIndex: LIST_SHEET_HALF_STOP_INDEX,
	});
	const filterExpander = initFilterExpander(document.getElementById("sidebar-header"), filterChipsElement, document.getElementById("filter-expand-button"));

	// One listener on the container instead of one per button, because the buttons are re-rendered often.
	filterChipsElement.addEventListener("click", clickEvent => {
		const clickedChip = clickEvent.target.closest("button[data-filter-id]");
		if (clickedChip) {
			setActiveFilter(clickedChip.dataset.filterId);
			filterExpander.collapse();
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
		filterExpander.update();
		renderPlaceList(placeListElement);
	});
	subscribe(STATE_EVENTS.selectedPlaceChanged, () => {
		renderPlaceList(placeListElement);
		scrollSelectedPlaceIntoView(placeListElement);
	});

	renderFilterChips(filterChipsElement);
	filterExpander.update();
	renderPlaceList(placeListElement);
	return placeSheetElement;
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

/**
 * Phones show the filters as one swipeable row. When they don't fit, a button at its end
 * wraps them onto more lines; the header then grows over the map, so neither the map nor the list moves.
 */
function initFilterExpander(headerElement, filterChipsElement, expandButton) {
	let isExpanded = false;

	function update() {
		const isOverflowing = filterChipsElement.scrollWidth > filterChipsElement.clientWidth + 1;
		expandButton.hidden = !isPhoneLayout() || (!isExpanded && !isOverflowing);
		filterChipsElement.classList.toggle("filter-chips--overflowing", isPhoneLayout() && isOverflowing && !isExpanded);
	}

	function setExpanded(expanded) {
		headerElement.style.marginBottom = "";
		const collapsedHeight = headerElement.offsetHeight;
		isExpanded = expanded;
		headerElement.classList.toggle("sidebar-header--filters-expanded", expanded);
		if (expanded) {
			// A negative margin keeps the header's grid row at its collapsed height while the header itself grows.
			headerElement.style.marginBottom = `${collapsedHeight - headerElement.offsetHeight}px`;
		}
		expandButton.setAttribute("aria-expanded", String(expanded));
		expandButton.setAttribute("aria-label", expanded ? "Sbalit filtry" : "Zobrazit všechny filtry");
		update();
	}

	function collapse() {
		if (isExpanded) {
			setExpanded(false);
		}
	}

	expandButton.addEventListener("click", () => setExpanded(!isExpanded));
	// A tap anywhere outside the header (usually the map) puts the filters away.
	document.addEventListener("pointerdown", pointerEvent => {
		if (isExpanded && !headerElement.contains(pointerEvent.target)) {
			collapse();
		}
	});
	new ResizeObserver(() => {
		if (!isExpanded) {
			update();
		}
	}).observe(filterChipsElement);
	onPhoneLayoutChange(() => {
		collapse();
		update();
	});

	return { update, collapse };
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
			<button class="place-list-item selectable-row" type="button" data-place-id="${escapeHtml(place.id)}" aria-current="${isSelected}">
				${renderPlaceBadge(place)}
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
