/*
	Light and dark theme. "Automatic" follows the system and keeps following it while the app runs;
	a theme picked in the settings applies at once, without a reload.
	The stylesheets only look at data-theme on <html>, which always holds the theme in use.
	js/apply-theme-before-paint.js sets the first one before the page is drawn; keep its logic in sync with applyTheme().
*/

import { getThemeChoice, setThemeChoice, THEME_CHOICES } from "../data/app-settings.js";

const DARK_SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

let currentThemeChoice = THEME_CHOICES.automatic;

export function initTheme() {
	applyTheme(getThemeChoice());
	window.matchMedia(DARK_SYSTEM_THEME_QUERY).addEventListener("change", () => {
		if (currentThemeChoice === THEME_CHOICES.automatic) {
			applyTheme(currentThemeChoice);
		}
	});
}

export function getCurrentThemeChoice() {
	return currentThemeChoice;
}

/** Stores the choice and applies it; it still applies when storage is blocked, just not after a reload. */
export function setTheme(themeChoice) {
	setThemeChoice(themeChoice);
	applyTheme(themeChoice);
}

function applyTheme(themeChoice) {
	currentThemeChoice = themeChoice;
	const isForced = themeChoice !== THEME_CHOICES.automatic;
	const systemTheme = window.matchMedia(DARK_SYSTEM_THEME_QUERY).matches ? THEME_CHOICES.dark : THEME_CHOICES.light;
	const theme = isForced ? themeChoice : systemTheme;
	document.documentElement.dataset.theme = theme;
	// The browser bar takes the colour of the theme-color meta whose media matches; the colours stay in index.html.
	for (const metaElement of document.querySelectorAll("meta[data-theme-color-for]")) {
		const metaTheme = metaElement.dataset.themeColorFor;
		metaElement.media = isForced ? (metaTheme === theme ? "all" : "not all") : `(prefers-color-scheme: ${metaTheme})`;
	}
}
