/*
	The app settings (theme, language, units). They apply to every plan and live in localStorage.
	Only explicit choices are stored: a user who never picked one keeps following the browser and the system.
	js/apply-theme-before-paint.js reads the theme key too; keep the key and its values in sync with it.
*/

import { readItem, removeItem, writeItem } from "../utils/local-storage.js";

const THEME_STORAGE_KEY = "tripPlanner.theme";
const LANGUAGE_STORAGE_KEY = "tripPlanner.language";
const UNIT_SYSTEM_STORAGE_KEY = "tripPlanner.units";

export const THEME_CHOICES = { automatic: "automatic", light: "light", dark: "dark" };
export const UNIT_SYSTEMS = { metric: "metric", imperial: "imperial" };

// The countries that still measure distances in miles and feet.
const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);

export function getThemeChoice() {
	const storedTheme = readItem(THEME_STORAGE_KEY);
	return storedTheme === THEME_CHOICES.light || storedTheme === THEME_CHOICES.dark ? storedTheme : THEME_CHOICES.automatic;
}

export function setThemeChoice(themeChoice) {
	if (themeChoice === THEME_CHOICES.automatic) {
		removeItem(THEME_STORAGE_KEY);
	} else {
		writeItem(THEME_STORAGE_KEY, themeChoice);
	}
}

/** @returns the language code the user picked, or null to follow the browser */
export function getLanguageChoice() {
	return readItem(LANGUAGE_STORAGE_KEY);
}

/** @returns whether the choice was stored (a reload can only apply a stored one) */
export function setLanguageChoice(languageCode) {
	return writeItem(LANGUAGE_STORAGE_KEY, languageCode);
}

/** The user's choice, otherwise imperial for browsers set to a region that uses miles. */
export function getUnitSystem() {
	const storedUnitSystem = readItem(UNIT_SYSTEM_STORAGE_KEY);
	if (Object.values(UNIT_SYSTEMS).includes(storedUnitSystem)) {
		return storedUnitSystem;
	}
	return IMPERIAL_REGIONS.has(findBrowserRegion()) ? UNIT_SYSTEMS.imperial : UNIT_SYSTEMS.metric;
}

/** @returns whether the choice was stored (a reload can only apply a stored one) */
export function setUnitSystem(unitSystem) {
	return writeItem(UNIT_SYSTEM_STORAGE_KEY, unitSystem);
}

/** "US" for a browser set to en-US; null when the first browser language names no region (or isn't a valid tag). */
function findBrowserRegion() {
	try {
		const firstBrowserLanguage = navigator.languages?.[0] ?? navigator.language;
		return firstBrowserLanguage ? new Intl.Locale(firstBrowserLanguage).region ?? null : null;
	} catch {
		return null;
	}
}
