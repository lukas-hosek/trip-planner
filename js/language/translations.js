/*
	Interface text. Every string the app shows comes from a language file in languages/ (one JSON file per language),
	so a language can be edited or added without touching the code. The format and the conventions are described
	in the tripmap-lang skill (.claude/skills/tripmap-lang/).

	loadTranslations() must finish before anything is rendered; translate() called earlier only returns the key.
	This module does no work when it is imported, because tools/icon-preview.js imports modules that import it.
*/

import { getLanguageChoice } from "../data/app-settings.js";

const LANGUAGES_FOLDER = "languages/";
const LANGUAGE_INDEX_URL = `${LANGUAGES_FOLDER}index.json`;
// A code names files, so it is kept to the shape of a language tag ("cs", "pt-BR").
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;
// The categories Intl.PluralRules can return. A plural entry is an object with only these keys.
const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);
// Only keys with this suffix may carry markup (the help text). They take no parameters, so plan data never gets in.
const HTML_KEY_SUFFIX = "Html";

const ATTRIBUTE_TRANSLATIONS = [
	{ dataAttribute: "data-translate-aria-label", targetAttribute: "aria-label" },
	{ dataAttribute: "data-translate-title", targetAttribute: "title" },
];

let languages = [];
let fallbackLanguage = null;
let currentLanguage = null;
let currentTranslations = {};
let fallbackTranslations = {};
let pluralRules = null;
let numberFormat = null;
const reportedMissingKeys = new Set();

/**
 * Picks the language (the user's choice, else the first browser language the app has, else the fallback)
 * and loads its file. Never throws: whatever can't be loaded is logged, and the app goes on with what it has.
 */
export async function loadTranslations() {
	try {
		readLanguageIndex(await fetchJson(LANGUAGE_INDEX_URL));
	} catch (error) {
		console.error(`The language list ${LANGUAGE_INDEX_URL} could not be loaded:`, error);
		return;
	}

	let chosenLanguage = chooseLanguage();
	const [chosenTranslations, loadedFallbackTranslations] = await Promise.all([
		fetchLanguageFile(chosenLanguage),
		chosenLanguage === fallbackLanguage ? null : fetchLanguageFile(fallbackLanguage),
	]);
	fallbackTranslations = loadedFallbackTranslations ?? chosenTranslations ?? {};
	if (chosenTranslations) {
		currentTranslations = chosenTranslations;
	} else {
		// A broken file (most likely a hand edit) must not leave the app half in one language and half in keys.
		chosenLanguage = fallbackLanguage;
		currentTranslations = fallbackTranslations;
	}

	currentLanguage = chosenLanguage;
	const locale = getLocale();
	pluralRules = new Intl.PluralRules(locale);
	numberFormat = new Intl.NumberFormat(locale);
	document.documentElement.lang = currentLanguage.code;
}

/**
 * @param key  a dotted path into the language file, e.g. "plans.menu.share"
 * @param parameters  values for the {placeholders}; numbers are formatted for the language.
 *   A plural entry picks its form by parameters.count.
 * @returns the text in the current language, else in the fallback language, else the key itself
 */
export function translate(key, parameters = {}) {
	const currentEntry = findEntry(currentTranslations, key);
	const entry = currentEntry ?? findEntry(fallbackTranslations, key);
	if (entry === null) {
		reportMissingKey(key, "is missing from every language file");
		return key;
	}
	if (currentEntry === null) {
		reportMissingKey(key, `is missing from ${currentLanguage?.code}.json, so it is shown from ${fallbackLanguage?.code}.json`);
	}
	const text = typeof entry === "string" ? entry : choosePluralForm(entry, parameters.count);
	return fillPlaceholders(text, parameters);
}

/** Fills in the static text of index.html: elements marked with data-translate, data-translate-html and data-translate-<attribute>. */
export function translatePage(root = document) {
	for (const element of root.querySelectorAll("[data-translate]")) {
		element.textContent = translate(element.dataset.translate);
	}
	for (const element of root.querySelectorAll("[data-translate-html]")) {
		const key = element.dataset.translateHtml;
		if (key.endsWith(HTML_KEY_SUFFIX)) {
			// Language files are part of the app, so their markup is trusted.
			element.innerHTML = translate(key);
		} else {
			console.warn(`"${key}" is used as HTML but its name doesn't end in "${HTML_KEY_SUFFIX}"; shown as text.`);
			element.textContent = translate(key);
		}
	}
	for (const { dataAttribute, targetAttribute } of ATTRIBUTE_TRANSLATIONS) {
		for (const element of root.querySelectorAll(`[${dataAttribute}]`)) {
			element.setAttribute(targetAttribute, translate(element.getAttribute(dataAttribute)));
		}
	}
}

/** @returns [{ code, name }] in the order of languages/index.json, for the language menu */
export function listLanguages() {
	return languages.map(({ code, name }) => ({ code, name }));
}

export function getLanguageCode() {
	return currentLanguage?.code ?? null;
}

export function getFlagUrl(languageCode) {
	return `${LANGUAGES_FOLDER}${languageCode}.svg`;
}

/** The locale for Intl (dates, numbers, units); undefined before loading, which Intl reads as the browser's own. */
export function getLocale() {
	return currentLanguage ? currentLanguage.locale ?? currentLanguage.code : undefined;
}

export function formatDate(date) {
	return new Date(date).toLocaleDateString(getLocale());
}

export function formatNumber(number, options) {
	return new Intl.NumberFormat(getLocale(), options).format(number);
}

// ---------- loading ----------

function readLanguageIndex(languageIndex) {
	languages = (Array.isArray(languageIndex?.languages) ? languageIndex.languages : [])
		.filter(language => typeof language?.code === "string" && LANGUAGE_CODE_PATTERN.test(language.code) && typeof language.name === "string")
		.map(({ code, name, locale }) => ({ code, name, locale: typeof locale === "string" ? locale : null }));
	if (languages.length === 0) {
		throw new Error("The list names no languages.");
	}
	fallbackLanguage = findLanguage(languageIndex.fallback) ?? languages[0];
}

function chooseLanguage() {
	const chosenLanguage = findLanguage(getLanguageChoice());
	if (chosenLanguage) {
		return chosenLanguage;
	}
	// The browser's languages in the user's order of preference; "de-AT" is served by "de" when there is no "de-AT".
	const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
	for (const browserLanguage of browserLanguages.filter(Boolean)) {
		const matchingLanguage = findLanguage(browserLanguage) ?? findLanguage(browserLanguage.split("-")[0]);
		if (matchingLanguage) {
			return matchingLanguage;
		}
	}
	return fallbackLanguage;
}

function findLanguage(languageCode) {
	if (typeof languageCode !== "string") {
		return null;
	}
	return languages.find(language => language.code.toLowerCase() === languageCode.toLowerCase()) ?? null;
}

/** @returns the language file's content, or null when it is missing or broken (the reason is logged) */
async function fetchLanguageFile(language) {
	const url = `${LANGUAGES_FOLDER}${language.code}.json`;
	try {
		return await fetchJson(url);
	} catch (error) {
		console.error(`The language file ${url} could not be loaded:`, error);
		return null;
	}
}

async function fetchJson(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	return response.json();
}

// ---------- lookup ----------

/** @returns a string, a plural entry, or null when the key leads nowhere (or to a whole group) */
function findEntry(translations, key) {
	let entry = translations;
	for (const keySegment of key.split(".")) {
		if (!isPlainObject(entry) || !Object.hasOwn(entry, keySegment)) {
			return null;
		}
		entry = entry[keySegment];
	}
	if (typeof entry === "string" || isPluralEntry(entry)) {
		return entry;
	}
	return null;
}

function isPluralEntry(entry) {
	return isPlainObject(entry) && typeof entry.other === "string" && Object.keys(entry).every(category => PLURAL_CATEGORIES.has(category));
}

/** The browser knows each language's plural rules (Czech 1 / 2–4 / 5+…); the file only gives the wording per category. */
function choosePluralForm(pluralEntry, count) {
	const category = typeof count === "number" && pluralRules ? pluralRules.select(count) : "other";
	return pluralEntry[category] ?? pluralEntry.other;
}

/** An unknown placeholder stays visible as {name}, so a mistake in a language file shows up instead of vanishing. */
function fillPlaceholders(text, parameters) {
	return text.replace(PLACEHOLDER_PATTERN, (placeholder, parameterName) => {
		if (!Object.hasOwn(parameters, parameterName)) {
			return placeholder;
		}
		const value = parameters[parameterName];
		return typeof value === "number" && numberFormat ? numberFormat.format(value) : String(value);
	});
}

function reportMissingKey(key, problem) {
	if (!reportedMissingKeys.has(key)) {
		reportedMissingKeys.add(key);
		console.warn(`Translation "${key}" ${problem}.`);
	}
}

function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
