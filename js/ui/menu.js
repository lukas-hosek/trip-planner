/*
	Drop-down menus: the ⋯ menu of a stored plan and the choices in the settings.
	A menu opens next to its button, takes the arrow keys, and gives the focus back to its button when it closes.
	One menu is open at a time.

	The menu adds no listeners outside itself: the dialog it sits in decides what a click elsewhere or Esc does,
	and closes the menu through closeOpenMenu() (see plans-panel.js).
*/

const MENU_GAP_IN_PIXELS = 4;
const MENU_VIEWPORT_MARGIN_IN_PIXELS = 8;
const MENU_ITEM_SELECTOR = "[role=menuitem], [role=menuitemradio]";

// { menuElement, triggerButton, onClose } while a menu is open, else null.
let openMenuState = null;

/** Lets the arrow keys, Home and End move through the menu's items; Tab leaves the menu and closes it. Call once per menu. */
export function initMenuKeyboard(menuElement) {
	menuElement.addEventListener("keydown", keyboardEvent => {
		const items = findMenuItems(menuElement);
		const currentIndex = items.indexOf(document.activeElement);
		let nextIndex = null;
		if (keyboardEvent.key === "ArrowDown") {
			nextIndex = (currentIndex + 1) % items.length;
		} else if (keyboardEvent.key === "ArrowUp") {
			nextIndex = (currentIndex - 1 + items.length) % items.length;
		} else if (keyboardEvent.key === "Home") {
			nextIndex = 0;
		} else if (keyboardEvent.key === "End") {
			nextIndex = items.length - 1;
		} else if (keyboardEvent.key === "Tab") {
			closeOpenMenu();
			return;
		}
		if (nextIndex !== null) {
			keyboardEvent.preventDefault();
			items[nextIndex].focus();
		}
	});
}

/**
 * Shows the menu (its items already rendered) next to the button that opens it, and focuses its checked or first item.
 * @param options.label  the menu's accessible name
 * @param options.onClose  called whenever the menu closes, however that happens
 * @param options.matchTriggerWidth  the menu is as wide as its button, like the list of a select
 * @param options.preferAbove  opens above the button when there is room, e.g. in a sheet at the bottom of a phone
 */
export function openMenu(menuElement, triggerButton, { label, onClose = null, matchTriggerWidth = false, preferAbove = false }) {
	closeOpenMenu();
	openMenuState = { menuElement, triggerButton, onClose };
	triggerButton.setAttribute("aria-expanded", "true");
	menuElement.setAttribute("aria-label", label);
	menuElement.style.width = matchTriggerWidth ? `${triggerButton.getBoundingClientRect().width}px` : "";
	menuElement.hidden = false;
	positionMenu(menuElement, triggerButton, preferAbove);
	const items = findMenuItems(menuElement);
	(items.find(item => item.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
}

/** @returns whether a menu was open (and is now closed) */
export function closeOpenMenu({ returnFocus = false } = {}) {
	if (openMenuState === null) {
		return false;
	}
	const { menuElement, triggerButton, onClose } = openMenuState;
	openMenuState = null;
	menuElement.hidden = true;
	triggerButton.setAttribute("aria-expanded", "false");
	if (returnFocus && triggerButton.isConnected) {
		triggerButton.focus();
	}
	onClose?.();
	return true;
}

/** @param menuElement  asks about this menu; without it, about any menu */
export function isMenuOpen(menuElement = null) {
	return openMenuState !== null && (menuElement === null || openMenuState.menuElement === menuElement);
}

/** A click there belongs to the open menu: it picks an item, or it is the menu's own button, which toggles the menu. */
export function isInOpenMenuOrTrigger(target) {
	return openMenuState !== null && (openMenuState.menuElement.contains(target) || openMenuState.triggerButton.contains(target));
}

function findMenuItems(menuElement) {
	return [...menuElement.querySelectorAll(MENU_ITEM_SELECTOR)];
}

/** Starts at the button's left edge, kept inside the screen; goes below or above the button, whichever fits (or is preferred). */
function positionMenu(menuElement, triggerButton, preferAbove) {
	const buttonRectangle = triggerButton.getBoundingClientRect();
	const menuRectangle = menuElement.getBoundingClientRect();
	const maximumLeft = window.innerWidth - menuRectangle.width - MENU_VIEWPORT_MARGIN_IN_PIXELS;
	const topBelow = buttonRectangle.bottom + MENU_GAP_IN_PIXELS;
	const topAbove = buttonRectangle.top - menuRectangle.height - MENU_GAP_IN_PIXELS;
	const fitsBelow = topBelow + menuRectangle.height <= window.innerHeight - MENU_VIEWPORT_MARGIN_IN_PIXELS;
	const fitsAbove = topAbove >= MENU_VIEWPORT_MARGIN_IN_PIXELS;
	const opensAbove = preferAbove ? fitsAbove || !fitsBelow : !fitsBelow;
	menuElement.style.left = `${Math.max(MENU_VIEWPORT_MARGIN_IN_PIXELS, Math.min(buttonRectangle.left, maximumLeft))}px`;
	menuElement.style.top = `${opensAbove ? Math.max(MENU_VIEWPORT_MARGIN_IN_PIXELS, topAbove) : topBelow}px`;
}
