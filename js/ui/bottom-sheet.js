/*
	Bottom sheets for the phone layout: the list of places and the detail card slide up from the bottom of the screen
	and stop at fixed heights. In between they follow the finger and, when let go, settle on the nearest stop.
	Only the handle moves a sheet; the content always scrolls, so browsing the list never resizes it by accident.
	On wider screens the sheets do nothing, and the stylesheets show the sidebar list and the floating card.
*/

import { isPhoneLayout, onPhoneLayoutChange } from "../utils/media-queries.js";

// "Collapsed": the handle and the top of the first row peek out, so it's clear the sheet can be pulled up.
const PEEK_HEIGHT_IN_PIXELS = 78;
const HALF_HEIGHT_SHARE = .56;
// Fully open, a strip of map stays visible, so the user still sees where the sheet came from.
const GAP_ABOVE_FULL_SHEET_IN_PIXELS = 8;
// A flick faster than this goes on to the next stop instead of back to the nearest one.
const FLICK_VELOCITY_IN_PIXELS_PER_MILLISECOND = .4;
// Smaller movements on the handle count as a tap.
const DRAG_THRESHOLD_IN_PIXELS = 4;

/** The stop heights in pixels, measured from the space below the header. */
export function computeSheetStops() {
	const availableHeight = document.querySelector(".map-area").getBoundingClientRect().height;
	return {
		peek: PEEK_HEIGHT_IN_PIXELS,
		half: Math.round(availableHeight * HALF_HEIGHT_SHARE),
		full: Math.round(availableHeight - GAP_ABOVE_FULL_SHEET_IN_PIXELS),
	};
}

/**
 * @param sheetElement           the element with the .bottom-sheet class
 * @param options.handleElement  the .sheet-handle button
 * @param options.getSnapHeights returns the stop heights, lowest first
 * @param options.getHandleLabel returns the handle's label for a stop index (what a tap will do)
 * @param options.initialSnapIndex  the stop the sheet starts at
 */
export function createBottomSheet(sheetElement, { handleElement, getSnapHeights, getHandleLabel, initialSnapIndex = 0 }) {
	let snapIndex = initialSnapIndex;
	let currentHeight = null;
	let drag = null;

	function applyHeight(height) {
		currentHeight = height;
		sheetElement.style.setProperty("--sheet-height", `${Math.round(height)}px`);
	}

	function snapTo(index, { animate = true } = {}) {
		const snapHeights = getSnapHeights();
		snapIndex = Math.min(Math.max(index, 0), snapHeights.length - 1);
		handleElement.setAttribute("aria-label", getHandleLabel(snapIndex));
		if (!isPhoneLayout()) {
			return;
		}
		if (!animate) {
			sheetElement.classList.add("bottom-sheet--dragging");
		}
		applyHeight(snapHeights[snapIndex]);
		if (!animate) {
			// Forces the new height to apply before the transition comes back.
			sheetElement.getBoundingClientRect();
			sheetElement.classList.remove("bottom-sheet--dragging");
		}
	}

	function startDrag(pointerY) {
		drag = {
			startY: pointerY,
			startHeight: currentHeight ?? sheetElement.getBoundingClientRect().height,
			lastY: pointerY,
			lastTime: performance.now(),
			velocity: 0,
		};
		sheetElement.classList.add("bottom-sheet--dragging");
	}

	function moveDrag(pointerY) {
		const snapHeights = getSnapHeights();
		const height = drag.startHeight + drag.startY - pointerY;
		applyHeight(Math.min(Math.max(height, snapHeights[0]), snapHeights.at(-1)));
		const now = performance.now();
		// Positive when moving up.
		drag.velocity = (drag.lastY - pointerY) / Math.max(1, now - drag.lastTime);
		drag.lastY = pointerY;
		drag.lastTime = now;
	}

	function endDrag() {
		sheetElement.classList.remove("bottom-sheet--dragging");
		snapTo(findStopToSettleOn(getSnapHeights(), currentHeight, drag.velocity));
		drag = null;
	}

	// ---------- the handle: drag with any pointer (finger, mouse, pen), or tap ----------

	let handleWasDragged = false;
	handleElement.addEventListener("pointerdown", pointerEvent => {
		if (!isPhoneLayout()) {
			return;
		}
		handleElement.setPointerCapture(pointerEvent.pointerId);
		handleWasDragged = false;
		startDrag(pointerEvent.clientY);
	});
	handleElement.addEventListener("pointermove", pointerEvent => {
		if (!drag) {
			return;
		}
		if (Math.abs(pointerEvent.clientY - drag.startY) > DRAG_THRESHOLD_IN_PIXELS) {
			handleWasDragged = true;
		}
		if (handleWasDragged) {
			moveDrag(pointerEvent.clientY);
		}
	});
	const finishHandleDrag = () => {
		if (!drag) {
			return;
		}
		if (handleWasDragged) {
			endDrag();
		} else {
			sheetElement.classList.remove("bottom-sheet--dragging");
			drag = null;
		}
	};
	handleElement.addEventListener("pointerup", finishHandleDrag);
	handleElement.addEventListener("pointercancel", finishHandleDrag);
	handleElement.addEventListener("click", () => {
		if (handleWasDragged) {
			handleWasDragged = false;
			return;
		}
		// From the top stop, a tap goes back to the bottom one.
		snapTo((snapIndex + 1) % getSnapHeights().length);
	});

	// ---------- layout changes ----------

	// The stops follow the space below the header, which also changes when the web font arrives and the header grows.
	new ResizeObserver(() => {
		if (!drag) {
			snapTo(snapIndex, { animate: false });
		}
	}).observe(document.querySelector(".map-area"));
	onPhoneLayoutChange(isPhone => {
		if (isPhone) {
			snapTo(snapIndex, { animate: false });
		} else {
			sheetElement.style.removeProperty("--sheet-height");
			currentHeight = null;
		}
	});
	snapTo(snapIndex, { animate: false });

	return {
		snapTo,
		get snapIndex() {
			return snapIndex;
		},
	};
}

/** The nearest stop, or after a flick the next stop in the flick's direction. */
function findStopToSettleOn(snapHeights, height, velocity) {
	if (velocity > FLICK_VELOCITY_IN_PIXELS_PER_MILLISECOND) {
		const higherIndex = snapHeights.findIndex(snapHeight => snapHeight > height + 1);
		return higherIndex === -1 ? snapHeights.length - 1 : higherIndex;
	}
	if (velocity < -FLICK_VELOCITY_IN_PIXELS_PER_MILLISECOND) {
		const lowerIndex = snapHeights.findLastIndex(snapHeight => snapHeight < height - 1);
		return lowerIndex === -1 ? 0 : lowerIndex;
	}
	let nearestIndex = 0;
	snapHeights.forEach((snapHeight, index) => {
		if (Math.abs(snapHeight - height) < Math.abs(snapHeights[nearestIndex] - height)) {
			nearestIndex = index;
		}
	});
	return nearestIndex;
}

/**
 * Publishes how much of the map the visible sheet covers as --sheet-covered-height,
 * so the map's scale and attribution can stay above it.
 */
export function trackSheetsCoveringMap(sheetElements) {
	const update = () => {
		const coveredHeight = isPhoneLayout()
			? Math.max(0, ...sheetElements.map(sheetElement => sheetElement.getBoundingClientRect().height))
			: 0;
		document.documentElement.style.setProperty("--sheet-covered-height", `${Math.round(coveredHeight)}px`);
	};
	const resizeObserver = new ResizeObserver(update);
	sheetElements.forEach(sheetElement => resizeObserver.observe(sheetElement));
	onPhoneLayoutChange(update);
	update();
}
