/*
	Stored plans, kept in localStorage exactly as they were imported (the raw JSON),
	so sharing or exporting a plan later reproduces what the AI produced.
	A plan's key is its normalised name: importing a plan with the same name replaces the old one.

	If storage is unavailable (private mode, blocked site data), plans live in memory for this visit only.
*/

import { getPlanKey } from "./plan-format.js";

const PLANS_STORAGE_KEY = "tripPlanner.plans";
const LAST_OPENED_PLAN_STORAGE_KEY = "tripPlanner.lastOpenedPlanKey";

const memoryStorage = new Map();

/**
 * @returns stored plans, most recently saved first: [{ key, name, placeCount, savedAt, rawPlan }]
 */
export function listStoredPlans() {
	const storedPlans = readJson(PLANS_STORAGE_KEY);
	if (!Array.isArray(storedPlans)) {
		return [];
	}
	return storedPlans
		.filter(storedPlan => storedPlan?.key && storedPlan.rawPlan)
		.toSorted((first, second) => String(second.savedAt).localeCompare(String(first.savedAt)));
}

export function getStoredPlan(planKey) {
	return listStoredPlans().find(storedPlan => storedPlan.key === planKey) ?? null;
}

/**
 * @param rawPlan         the plan as imported
 * @param normalizedPlan  the same plan after normalizePlan(), for the name and the place count
 * @returns {{ key, wasReplaced }}  wasReplaced is true when a plan with the same name was already stored
 */
export function savePlan(rawPlan, normalizedPlan) {
	const key = getPlanKey(normalizedPlan.name);
	const otherPlans = listStoredPlans().filter(storedPlan => storedPlan.key !== key);
	const wasReplaced = otherPlans.length < listStoredPlans().length;
	const storedPlan = {
		key,
		name: normalizedPlan.name,
		placeCount: normalizedPlan.places.length,
		savedAt: new Date().toISOString(),
		rawPlan,
	};
	writeJson(PLANS_STORAGE_KEY, [storedPlan, ...otherPlans]);
	requestPersistentStorage();
	return { key, wasReplaced };
}

export function deleteStoredPlan(planKey) {
	writeJson(PLANS_STORAGE_KEY, listStoredPlans().filter(storedPlan => storedPlan.key !== planKey));
	if (getLastOpenedPlanKey() === planKey) {
		removeItem(LAST_OPENED_PLAN_STORAGE_KEY);
	}
}

export function getLastOpenedPlanKey() {
	return readItem(LAST_OPENED_PLAN_STORAGE_KEY);
}

export function setLastOpenedPlanKey(planKey) {
	writeItem(LAST_OPENED_PLAN_STORAGE_KEY, planKey);
}

/** Asks the browser not to evict stored plans under storage pressure; it may silently decline. */
function requestPersistentStorage() {
	navigator.storage?.persist?.().catch(() => {});
}

function readJson(storageKey) {
	try {
		return JSON.parse(readItem(storageKey) ?? "null");
	} catch {
		return null;
	}
}

function writeJson(storageKey, value) {
	writeItem(storageKey, JSON.stringify(value));
}

function readItem(storageKey) {
	try {
		return localStorage.getItem(storageKey);
	} catch {
		return memoryStorage.get(storageKey) ?? null;
	}
}

function writeItem(storageKey, value) {
	try {
		localStorage.setItem(storageKey, value);
	} catch (error) {
		console.warn("Plans could not be saved to localStorage, keeping them in memory:", error);
		memoryStorage.set(storageKey, value);
	}
}

function removeItem(storageKey) {
	try {
		localStorage.removeItem(storageKey);
	} catch {
		memoryStorage.delete(storageKey);
	}
}
