/*
	Entry point: picks the plan to show (from a "#plan=…" link, the last opened one, or the demo),
	then builds the map and the UI and decides what to show first.
*/

import { setActivePlan } from "./data/active-plan.js";
import { getPlanKey, normalizePlan, PlanFormatError } from "./data/plan-format.js";
import { decodePlanFragment, hasPlanInFragment } from "./data/plan-link.js";
import {
	discardReplacedPlan,
	getLastOpenedPlanKey,
	getStoredPlan,
	listStoredPlans,
	markPlanBeingOpened,
	markPlanOpened,
	restoreReplacedPlan,
	savePlan,
	setLastOpenedPlanKey,
	takePlanThatFailedToOpen,
} from "./data/plan-store.js";
import { loadTranslations, translate, translatePage } from "./language/translations.js";
import { selectPlace } from "./state/app-state.js";
import { addBaseLayers, computePlacesBounds, createMap, fitMapToPlaces } from "./map/base-map.js";
import { addPlaceMarkers } from "./map/place-markers.js";
import { enableFocusOnSelectedPlace } from "./map/map-focus.js";
import { addUserLocationControl } from "./map/user-location.js";
import { trackSheetsCoveringMap } from "./ui/bottom-sheet.js";
import { initSidebar } from "./ui/sidebar.js";
import { initDetailCard } from "./ui/detail-card.js";
import { showMapNotice } from "./ui/map-notice.js";
import { initPlansPanel, openPlansDialog } from "./ui/plans-panel.js";
import { focusSettingControl, initSettingsPanel, SETTINGS_VIEW_NAME, takeSettingsReopenRequest } from "./ui/settings-panel.js";
import { initTheme } from "./ui/theme.js";
import { showPendingToast, showToast, showToastAfterReload } from "./ui/toast.js";
import { initUrlHashSync, readPlaceFromUrlHash } from "./ui/url-hash.js";
import { loadPlacePhotos } from "./services/place-photos.js";
import { isPhoneLayout } from "./utils/media-queries.js";

const APP_NAME = "TripMap";
// Shown on the very first visit and whenever no plan is stored.
const DEMO_PLAN_URL = "plans/spain-2026.json";
const LONG_TOAST_DURATION_IN_MILLISECONDS = 10_000;

startApp().catch(error => {
	console.error("The app could not start:", error);
	showMapNotice(translate("app.startFailed", { reason: error.message }));
});

async function startApp() {
	// Taken first, so a start that fails can't leave the request behind for some later reload.
	const changedSettingName = takeSettingsReopenRequest();
	registerServiceWorker();
	// Everything below shows text, so the language comes first.
	await loadTranslations();
	initTheme();
	translatePage();
	// Checked before any plan is touched, so a missing library is never blamed on the plan (see markPlanBeingOpened).
	if (!globalThis.L) {
		throw new Error(translate("app.mapLibraryMissing"));
	}
	const { plan, startupMessage, startupNotice } = await choosePlanToOpen();
	setActivePlan(plan);
	document.title = `${plan.name} · ${APP_NAME}`;
	// From here until markPlanOpened(), a hang or a crash is put down to the plan, and the next start skips it.
	markPlanBeingOpened(getPlanKey(plan.name));

	const placesBounds = computePlacesBounds(plan.places);
	const map = createMap("map", placesBounds);
	addBaseLayers(map);
	addPlaceMarkers(map);
	addUserLocationControl(map);

	// The detail card must subscribe before map focusing, so the card is visible when the map measures it.
	const detailCardElement = initDetailCard();
	enableFocusOnSelectedPlace(map, detailCardElement);
	const placeSheetElement = initSidebar();
	trackSheetsCoveringMap([placeSheetElement, detailCardElement]);
	if (isPhoneLayout()) {
		// The list sheet now covers the lower part of the map; the places should all be visible above it.
		fitMapToPlaces(map, placesBounds, { coveredHeightAtBottom: placeSheetElement.getBoundingClientRect().height });
	}
	initUrlHashSync();
	initPlansPanel({ placesBounds });
	initSettingsPanel();
	loadPlacePhotos(plan.places);

	showInitialPlace();
	markPlanOpened();

	showPendingToast();
	if (startupMessage) {
		showToast(startupMessage, LONG_TOAST_DURATION_IN_MILLISECONDS);
	}
	if (startupNotice) {
		showMapNotice(startupNotice.message, { actions: startupNotice.actions });
	}
	// A new language or unit system reloads the app; the user lands back where the change was made.
	if (changedSettingName) {
		openPlansDialog({ initialViewName: SETTINGS_VIEW_NAME });
		focusSettingControl(changedSettingName);
	}

	// A plan link pasted into the address bar of an open tab only changes the fragment, which doesn't reload the page.
	window.addEventListener("hashchange", () => {
		if (hasPlanInFragment(window.location.hash)) {
			window.location.reload();
		}
	});
}

/**
 * @returns {{ plan, startupMessage, startupNotice }}
 *   startupMessage (a toast) reports the outcome of a plan link or a plan that was skipped;
 *   startupNotice ({ message, actions }) stays until closed: the undo for a replaced plan, and the hint for iOS.
 */
async function choosePlanToOpen() {
	if (!hasPlanInFragment(window.location.hash)) {
		// The undo for a replaced plan is offered only by the start that follows the link.
		discardReplacedPlan();
		return openStoredPlanOrDemo();
	}

	const planFragment = window.location.hash;
	const planLink = window.location.href;
	// Drop the plan from the address bar right away, so a reload doesn't import it again.
	history.replaceState(null, "", window.location.pathname + window.location.search);
	try {
		const rawPlan = await decodePlanFragment(planFragment);
		const plan = normalizePlan(rawPlan);
		const { key, wasReplaced, wasSaved, canBeRestored } = savePlan(rawPlan, plan, { keepReplacedVersion: true });
		if (!wasSaved) {
			return {
				plan,
				startupMessage: translate("startup.planNotSaved", { name: plan.name }),
				startupNotice: null,
			};
		}
		setLastOpenedPlanKey(key);
		const savedMessage = translate(wasReplaced ? "common.planUpdated" : "common.planSaved", { name: plan.name });
		const startupNotice = buildNoticeForPlanFromLink(plan, planLink, canBeRestored);
		// A replaced plan is announced by the notice that offers the undo; a toast saying the same would only cover it.
		return { plan, startupMessage: canBeRestored ? null : savedMessage, startupNotice };
	} catch (error) {
		console.error("The plan from the link could not be opened:", error);
		const startupMessage = error instanceof PlanFormatError
			? translate("startup.linkFailedWithReason", { reason: error.message })
			: translate("startup.linkFailed");
		const { plan } = await openStoredPlanOrDemo();
		return { plan, startupMessage, startupNotice: null };
	}
}

/** @returns {{ plan, startupMessage, startupNotice }} like choosePlanToOpen() */
async function openStoredPlanOrDemo() {
	// A plan that hung or crashed the app last time is skipped once, so the user gets to the plans dialog and can delete it.
	const failedPlanKey = takePlanThatFailedToOpen();
	const failedPlan = failedPlanKey ? getStoredPlan(failedPlanKey) : null;
	const startupMessage = failedPlan
		? translate("startup.planSkipped", { name: failedPlan.name })
		: null;

	const candidatePlans = [getStoredPlan(getLastOpenedPlanKey()), ...listStoredPlans()]
		.filter(storedPlan => storedPlan && storedPlan.key !== failedPlanKey);
	for (const storedPlan of candidatePlans) {
		try {
			const plan = normalizePlan(storedPlan.rawPlan);
			setLastOpenedPlanKey(storedPlan.key);
			return { plan, startupMessage, startupNotice: null };
		} catch (error) {
			console.warn(`Stored plan "${storedPlan.name}" could not be opened:`, error);
		}
	}

	const response = await fetch(DEMO_PLAN_URL);
	if (!response.ok) {
		throw new Error(translate("app.demoPlanFailed", { status: String(response.status) }));
	}
	const rawDemoPlan = await response.json();
	const plan = normalizePlan(rawDemoPlan);
	// If the demo can't be stored, nothing is lost: it is fetched again on the next visit.
	const { key } = savePlan(rawDemoPlan, plan);
	setLastOpenedPlanKey(key);
	return { plan, startupMessage, startupNotice: null };
}

// Opens the place linked in the URL, if any. Otherwise the app starts on the map and list, with nothing selected.
function showInitialPlace() {
	const placeFromUrl = readPlaceFromUrlHash();
	if (placeFromUrl) {
		selectPlace(placeFromUrl, { moveMap: true });
	}
}

/**
 * What the user should know, and can do, about a plan that has just arrived by link.
 * @returns {{ message, actions }} for showMapNotice(), or null when there is nothing to say
 */
function buildNoticeForPlanFromLink(plan, planLink, canBeRestored) {
	const sentences = [];
	const actions = [];
	if (canBeRestored) {
		// Anyone can craft a link that carries the name of a plan the user already has, so replacing it can be undone.
		sentences.push(translate("startup.planUpdatedByLink", { name: plan.name }));
		actions.push({ label: translate("startup.restoreOriginal"), onAction: restoreReplacedPlanAndReload });
	}
	if (isIosBrowserTab()) {
		sentences.push(translate("startup.iosHint"));
		actions.push({ label: translate("startup.copyLink"), onAction: () => copyPlanLink(planLink) });
	}
	return actions.length > 0 ? { message: sentences.join(" "), actions } : null;
}

function restoreReplacedPlanAndReload() {
	const restoredPlanName = restoreReplacedPlan();
	if (restoredPlanName === null) {
		showToast(translate("startup.restoreFailed"));
		return;
	}
	showToastAfterReload(translate("startup.originalRestored", { name: restoredPlanName }));
	window.location.reload();
}

/**
 * On iOS, an app added to the home screen has its own storage, separate from Safari (and from in-app browsers),
 * so a plan opened from a link here doesn't reach the installed app. Copying the link offers the way across.
 */
function isIosBrowserTab() {
	const isAppleMobileDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
		|| (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
	const isInstalledApp = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
	return isAppleMobileDevice && !isInstalledApp;
}

async function copyPlanLink(planLink) {
	try {
		await navigator.clipboard.writeText(planLink);
		showToast(translate("startup.linkCopied"));
	} catch {
		showToast(translate("common.linkCopyFailed"));
	}
}

function registerServiceWorker() {
	// Service workers only run on https:// (or localhost).
	if (!("serviceWorker" in navigator) || !window.isSecureContext) {
		return;
	}
	navigator.serviceWorker.register("./sw.js").catch(error => {
		console.warn("Service worker registration failed; the app won't work offline:", error);
	});
}
