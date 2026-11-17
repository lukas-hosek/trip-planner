/*
	Stored plans, kept in localStorage exactly as they were imported (the raw JSON),
	so sharing or exporting a plan later reproduces what the AI produced.
	A plan's key is its normalised name: importing a plan with the same name replaces the old one.

	If storage is unavailable or full (blocked site data, quota), nothing is stored: savePlan() says so,
	and the callers tell the user.
*/

import { getPlanKey } from "./plan-format.js";
import { readItem, readJson, removeItem, writeItem, writeJson } from "../utils/local-storage.js";

const PLANS_STORAGE_KEY = "tripPlanner.plans";
const LAST_OPENED_PLAN_STORAGE_KEY = "tripPlanner.lastOpenedPlanKey";
// Set while a plan is being drawn. If it is still set at the next start, that plan hung or crashed the app.
const PLAN_BEING_OPENED_STORAGE_KEY = "tripPlanner.planBeingOpened";
// The version of a plan that a link has just replaced, kept so the replacement can be undone.
const REPLACED_PLAN_STORAGE_KEY = "tripPlanner.replacedPlan";

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
 * @param options.keepReplacedVersion  keep the stored plan this one replaces, so restoreReplacedPlan() can bring it back;
 *   for plans from links, which anyone can craft to carry the name of a plan the user already has
 * @returns {{ key, wasReplaced, wasSaved, canBeRestored }}  wasReplaced is true when a plan with the same name was already stored;
 *   wasSaved is false when the browser refused to store the plan; canBeRestored is true when a different earlier version was kept
 */
export function savePlan(rawPlan, normalizedPlan, { keepReplacedVersion = false } = {}) {
	const key = getPlanKey(normalizedPlan.name);
	const storedPlans = listStoredPlans();
	const replacedPlan = storedPlans.find(storedPlan => storedPlan.key === key) ?? null;
	const otherPlans = storedPlans.filter(storedPlan => storedPlan.key !== key);
	const storedPlan = {
		key,
		name: normalizedPlan.name,
		placeCount: normalizedPlan.places.length,
		savedAt: new Date().toISOString(),
		rawPlan,
	};

	// Opening the same link twice replaces a plan with itself; there is nothing to undo then.
	let canBeRestored = keepReplacedVersion && replacedPlan !== null
		&& JSON.stringify(replacedPlan.rawPlan) !== JSON.stringify(rawPlan)
		&& writeJson(REPLACED_PLAN_STORAGE_KEY, replacedPlan);
	let wasSaved = writeJson(PLANS_STORAGE_KEY, [storedPlan, ...otherPlans]);
	if (!wasSaved && canBeRestored) {
		// No room for both versions: the update matters more than the undo.
		removeItem(REPLACED_PLAN_STORAGE_KEY);
		canBeRestored = false;
		wasSaved = writeJson(PLANS_STORAGE_KEY, [storedPlan, ...otherPlans]);
	}
	if (wasSaved) {
		requestPersistentStorage();
	}
	return { key, wasReplaced: replacedPlan !== null, wasSaved, canBeRestored };
}

/**
 * Puts back the version kept by savePlan(…, { keepReplacedVersion: true }).
 * @returns the restored plan's name, or null when there was nothing to restore or it could not be stored
 */
export function restoreReplacedPlan() {
	const replacedPlan = readJson(REPLACED_PLAN_STORAGE_KEY);
	if (!replacedPlan?.key || !replacedPlan.rawPlan) {
		return null;
	}
	const otherPlans = listStoredPlans().filter(storedPlan => storedPlan.key !== replacedPlan.key);
	// The kept version is removed only after it is safely back among the plans.
	if (!writeJson(PLANS_STORAGE_KEY, [replacedPlan, ...otherPlans])) {
		return null;
	}
	removeItem(REPLACED_PLAN_STORAGE_KEY);
	return replacedPlan.name;
}

/** The undo is offered only right after a link replaced a plan; afterwards the kept version would just take up space. */
export function discardReplacedPlan() {
	removeItem(REPLACED_PLAN_STORAGE_KEY);
}

export function deleteStoredPlan(planKey) {
	writeJson(PLANS_STORAGE_KEY, listStoredPlans().filter(storedPlan => storedPlan.key !== planKey));
	if (getLastOpenedPlanKey() === planKey) {
		removeItem(LAST_OPENED_PLAN_STORAGE_KEY);
	}
	if (readJson(REPLACED_PLAN_STORAGE_KEY)?.key === planKey) {
		discardReplacedPlan();
	}
}

/** Call before drawing a plan and markPlanOpened() after it; see takePlanThatFailedToOpen(). */
export function markPlanBeingOpened(planKey) {
	writeItem(PLAN_BEING_OPENED_STORAGE_KEY, planKey);
}

export function markPlanOpened() {
	removeItem(PLAN_BEING_OPENED_STORAGE_KEY);
}

/**
 * @returns the key of the plan that was being drawn when the app last stopped (it hung, crashed, or the browser
 *   gave up on the page), or null. Asking forgets it, so the plan is skipped once and can be tried again.
 */
export function takePlanThatFailedToOpen() {
	const planKey = readItem(PLAN_BEING_OPENED_STORAGE_KEY);
	removeItem(PLAN_BEING_OPENED_STORAGE_KEY);
	return planKey;
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
