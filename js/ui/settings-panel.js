/*
	The app settings, a view of the plans dialog (plans-panel.js shows it): theme, language and units, shared by all plans.
	A new theme applies at once. A new language or unit system reloads the app, so every text and number is drawn
	afresh; the reload brings the user back to this view (takeSettingsReopenRequest()).
*/

import { getUnitSystem, setLanguageChoice, setUnitSystem, THEME_CHOICES, UNIT_SYSTEMS } from "../data/app-settings.js";
import { getFlagUrl, getLanguageCode, listLanguages, translate } from "../language/translations.js";
import { escapeHtml } from "../utils/html.js";
import { isPhoneLayout } from "../utils/media-queries.js";
import { closeOpenMenu, initMenuKeyboard, isMenuOpen, openMenu } from "./menu.js";
import { getCurrentThemeChoice, setTheme } from "./theme.js";

export const SETTINGS_VIEW_NAME = "settings";

// Session storage: survives the reload that a new language or unit system needs, and nothing longer.
const REOPEN_SETTINGS_STORAGE_KEY = "tripPlanner.reopenSettings";
const RELOADING_SETTING_NAMES = { language: "language", units: "units" };

const THEME_CHOICE_ORDER = [THEME_CHOICES.automatic, THEME_CHOICES.light, THEME_CHOICES.dark];
const UNIT_SYSTEM_ORDER = [UNIT_SYSTEMS.metric, UNIT_SYSTEMS.imperial];

let elements = null;

export function initSettingsPanel() {
	elements = {
		themeButton: document.getElementById("theme-button"),
		themeMenu: document.getElementById("theme-menu"),
		languageButton: document.getElementById("language-button"),
		languageMenu: document.getElementById("language-menu"),
		unitSystemControl: document.getElementById("unit-system-control"),
	};

	elements.themeButton.addEventListener("click", () => toggleMenu(elements.themeMenu, elements.themeButton, translate("settings.themeMenu"), renderThemeMenu));
	elements.languageButton.addEventListener("click", () => toggleMenu(elements.languageMenu, elements.languageButton, translate("settings.languageMenu"), renderLanguageMenu));
	elements.themeMenu.addEventListener("click", handleThemeMenuClick);
	elements.languageMenu.addEventListener("click", handleLanguageMenuClick);
	initMenuKeyboard(elements.themeMenu);
	initMenuKeyboard(elements.languageMenu);
	elements.unitSystemControl.addEventListener("click", handleUnitSystemClick);
}

export function renderSettingsView() {
	renderThemeButton();
	renderLanguageButton();
	renderUnitSystemControl();
}

/** @returns the setting whose change reloaded the app ("language" or "units"), or null; asking forgets it */
export function takeSettingsReopenRequest() {
	try {
		const settingName = sessionStorage.getItem(REOPEN_SETTINGS_STORAGE_KEY);
		sessionStorage.removeItem(REOPEN_SETTINGS_STORAGE_KEY);
		return Object.values(RELOADING_SETTING_NAMES).includes(settingName) ? settingName : null;
	} catch {
		return null;
	}
}

/** Puts the focus back on the control the user changed before the reload. */
export function focusSettingControl(settingName) {
	if (settingName === RELOADING_SETTING_NAMES.language) {
		elements.languageButton.focus();
	} else if (settingName === RELOADING_SETTING_NAMES.units) {
		elements.unitSystemControl.querySelector("[aria-pressed=true]")?.focus();
	}
}

// ---------- theme ----------

function renderThemeButton() {
	const themeChoice = getCurrentThemeChoice();
	renderSelectButton(elements.themeButton, {
		settingLabel: translate("settings.theme"),
		valueLabel: translate(`settings.themes.${themeChoice}`),
		pictureHtml: renderThemeSwatch(themeChoice),
	});
}

function renderThemeMenu() {
	const currentThemeChoice = getCurrentThemeChoice();
	elements.themeMenu.innerHTML = THEME_CHOICE_ORDER.map(themeChoice => renderChoiceItem({
		isChecked: themeChoice === currentThemeChoice,
		dataAttributes: `data-theme-choice="${themeChoice}"`,
		pictureHtml: renderThemeSwatch(themeChoice),
		label: translate(`settings.themes.${themeChoice}`),
	})).join("");
}

function handleThemeMenuClick(clickEvent) {
	const menuItem = clickEvent.target.closest("[data-theme-choice]");
	if (!menuItem) {
		return;
	}
	closeOpenMenu({ returnFocus: true });
	if (menuItem.dataset.themeChoice !== getCurrentThemeChoice()) {
		setTheme(menuItem.dataset.themeChoice);
		renderThemeButton();
	}
}

function renderThemeSwatch(themeChoice) {
	return `<span class="theme-swatch theme-swatch--${themeChoice}" aria-hidden="true"></span>`;
}

// ---------- language ----------

function renderLanguageButton() {
	const currentLanguage = listLanguages().find(language => language.code === getLanguageCode());
	renderSelectButton(elements.languageButton, {
		settingLabel: translate("settings.language"),
		valueLabel: currentLanguage?.name ?? "",
		pictureHtml: currentLanguage ? renderFlag(currentLanguage.code) : "",
	});
}

/** Each language is listed under its own name, marked with its language, so screen readers pronounce it right. */
function renderLanguageMenu() {
	const currentLanguageCode = getLanguageCode();
	elements.languageMenu.innerHTML = listLanguages().map(language => renderChoiceItem({
		isChecked: language.code === currentLanguageCode,
		dataAttributes: `data-language-code="${escapeHtml(language.code)}" lang="${escapeHtml(language.code)}"`,
		pictureHtml: renderFlag(language.code),
		label: language.name,
	})).join("");
}

function handleLanguageMenuClick(clickEvent) {
	const menuItem = clickEvent.target.closest("[data-language-code]");
	if (!menuItem) {
		return;
	}
	closeOpenMenu({ returnFocus: true });
	const languageCode = menuItem.dataset.languageCode;
	if (languageCode !== getLanguageCode() && setLanguageChoice(languageCode)) {
		reloadIntoSettings(RELOADING_SETTING_NAMES.language);
	}
}

function renderFlag(languageCode) {
	return `<img class="flag" src="${escapeHtml(getFlagUrl(languageCode))}" alt="" width="24" height="16">`;
}

// ---------- units ----------

function renderUnitSystemControl() {
	const currentUnitSystem = getUnitSystem();
	elements.unitSystemControl.innerHTML = UNIT_SYSTEM_ORDER.map(unitSystem => `
		<button type="button" data-unit-system="${unitSystem}" aria-pressed="${unitSystem === currentUnitSystem}">
			${escapeHtml(translate(`settings.unitSystems.${unitSystem}`))}
		</button>`).join("");
}

function handleUnitSystemClick(clickEvent) {
	const button = clickEvent.target.closest("[data-unit-system]");
	if (button && button.dataset.unitSystem !== getUnitSystem() && setUnitSystem(button.dataset.unitSystem)) {
		reloadIntoSettings(RELOADING_SETTING_NAMES.units);
	}
}

// ---------- shared ----------

function toggleMenu(menuElement, triggerButton, label, renderItems) {
	if (isMenuOpen(menuElement)) {
		closeOpenMenu({ returnFocus: true });
		return;
	}
	renderItems();
	// On phones the settings are a sheet at the bottom of the screen, so the choices open upwards.
	openMenu(menuElement, triggerButton, { label, matchTriggerWidth: true, preferAbove: isPhoneLayout() });
}

/** A button that opens a list of choices: a picture (swatch or flag), the current choice and a chevron. */
function renderSelectButton(button, { settingLabel, valueLabel, pictureHtml }) {
	button.setAttribute("aria-label", translate("settings.currentValue", { setting: settingLabel, value: valueLabel }));
	button.innerHTML = `
		${pictureHtml}
		<span class="button-select-label">${escapeHtml(valueLabel)}</span>
		<span class="icon icon--chevron-down" aria-hidden="true"></span>`;
}

function renderChoiceItem({ isChecked, dataAttributes, pictureHtml, label }) {
	const checkHtml = isChecked ? `<span class="icon icon--check" aria-hidden="true"></span>` : "";
	return `
		<button class="menu-item" type="button" role="menuitemradio" aria-checked="${isChecked}" ${dataAttributes}>
			<span class="menu-item-check">${checkHtml}</span>${pictureHtml}<span class="menu-item-label">${escapeHtml(label)}</span>
		</button>`;
}

/** Reloads with the URL as it is, so the open place (#place) stays selected. */
function reloadIntoSettings(settingName) {
	try {
		sessionStorage.setItem(REOPEN_SETTINGS_STORAGE_KEY, settingName);
	} catch {
		// Without session storage the app simply starts on the map.
	}
	window.location.reload();
}
