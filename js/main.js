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
import { selectPlace } from "./state/app-state.js";
import { addBaseLayers, computePlacesBounds, createMap } from "./map/base-map.js";
import { addPlaceMarkers } from "./map/place-markers.js";
import { enableFocusOnSelectedPlace } from "./map/map-focus.js";
import { addUserLocationControl } from "./map/user-location.js";
import { initSidebar } from "./ui/sidebar.js";
import { initDetailCard } from "./ui/detail-card.js";
import { showMapNotice } from "./ui/map-notice.js";
import { initPlansPanel } from "./ui/plans-panel.js";
import { showPendingToast, showToast, showToastAfterReload } from "./ui/toast.js";
import { initUrlHashSync, readPlaceFromUrlHash } from "./ui/url-hash.js";
import { loadPlacePhotos } from "./services/place-photos.js";

const APP_NAME = "TripMap";
// Shown on the very first visit and whenever no plan is stored.
const DEMO_PLAN_URL = "plans/spanelsko-2026.json";
const LONG_TOAST_DURATION_IN_MILLISECONDS = 10_000;

startApp().catch(error => {
	console.error("The app could not start:", error);
	showMapNotice(`Aplikaci se nepodařilo spustit: ${error.message}`);
});

async function startApp() {
	registerServiceWorker();
	// Checked before any plan is touched, so a missing library is never blamed on the plan (see markPlanBeingOpened).
	if (!globalThis.L) {
		throw new Error("Mapovou knihovnu se nepodařilo načíst. Zkontrolujte připojení a obnovte stránku.");
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
	initSidebar();
	initUrlHashSync();
	initPlansPanel({ placesBounds });
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
				startupMessage: `Plán „${plan.name}“ se nepodařilo uložit do prohlížeče. Zůstane otevřený jen do zavření stránky.`,
				startupNotice: null,
			};
		}
		setLastOpenedPlanKey(key);
		const savedMessage = wasReplaced ? `Plán „${plan.name}“ je aktualizovaný.` : `Plán „${plan.name}“ je uložený.`;
		const startupNotice = buildNoticeForPlanFromLink(plan, planLink, canBeRestored);
		// A replaced plan is announced by the notice that offers the undo; a toast saying the same would only cover it.
		return { plan, startupMessage: canBeRestored ? null : savedMessage, startupNotice };
	} catch (error) {
		console.error("The plan from the link could not be opened:", error);
		const reason = error instanceof PlanFormatError ? ` ${error.message}` : "";
		const { plan } = await openStoredPlanOrDemo();
		return { plan, startupMessage: `Plán z odkazu se nepodařilo otevřít.${reason}`, startupNotice: null };
	}
}

/** @returns {{ plan, startupMessage, startupNotice }} like choosePlanToOpen() */
async function openStoredPlanOrDemo() {
	// A plan that hung or crashed the app last time is skipped once, so the user gets to "Moje plány" and can delete it.
	const failedPlanKey = takePlanThatFailedToOpen();
	const failedPlan = failedPlanKey ? getStoredPlan(failedPlanKey) : null;
	const startupMessage = failedPlan
		? `Plán „${failedPlan.name}“ se minule nepodařilo otevřít, proto je otevřený jiný. Najdete ho v Moje plány.`
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
		throw new Error(`Ukázkový plán se nepodařilo načíst (HTTP ${response.status}).`);
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
		sentences.push(`Plán „${plan.name}“ je aktualizovaný podle odkazu.`);
		actions.push({ label: "Vrátit původní", onAction: restoreReplacedPlanAndReload });
	}
	if (isIosBrowserTab()) {
		sentences.push("Plán je uložený v tomhle prohlížeči. Máte-li aplikaci TripMap na ploše, zkopírujte odkaz a vložte ho v ní přes Moje plány → Importovat.");
		actions.push({ label: "Kopírovat odkaz", onAction: () => copyPlanLink(planLink) });
	}
	return actions.length > 0 ? { message: sentences.join(" "), actions } : null;
}

function restoreReplacedPlanAndReload() {
	const restoredPlanName = restoreReplacedPlan();
	if (restoredPlanName === null) {
		showToast("Původní verzi plánu se nepodařilo vrátit.");
		return;
	}
	showToastAfterReload(`Původní verze plánu „${restoredPlanName}“ je zpět.`);
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
		showToast("Odkaz je zkopírovaný. Teď otevřete aplikaci TripMap.");
	} catch {
		showToast("Odkaz se nepodařilo zkopírovat.");
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
