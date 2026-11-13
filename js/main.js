/*
	Entry point: picks the plan to show (from a "#plan=…" link, the last opened one, or the demo),
	then builds the map and the UI and decides what to show first.
*/

import { setActivePlan } from "./data/active-plan.js";
import { normalizePlan, PlanFormatError } from "./data/plan-format.js";
import { decodePlanFragment, hasPlanInFragment } from "./data/plan-link.js";
import { getLastOpenedPlanKey, getStoredPlan, listStoredPlans, savePlan, setLastOpenedPlanKey } from "./data/plan-store.js";
import { selectPlace } from "./state/app-state.js";
import { addBaseLayers, computePlacesBounds, createMap } from "./map/base-map.js";
import { addPlaceMarkers } from "./map/place-markers.js";
import { enableFocusOnSelectedPlace } from "./map/map-focus.js";
import { addUserLocationControl } from "./map/user-location.js";
import { initSidebar } from "./ui/sidebar.js";
import { initDetailCard } from "./ui/detail-card.js";
import { showMapNotice } from "./ui/map-notice.js";
import { initPlansPanel } from "./ui/plans-panel.js";
import { showPendingToast, showToast } from "./ui/toast.js";
import { initUrlHashSync, readPlaceFromUrlHash } from "./ui/url-hash.js";
import { loadPlacePhotos } from "./services/place-photos.js";

const APP_NAME = "TripMap";
// Shown on the very first visit and whenever no plan is stored.
const DEMO_PLAN_URL = "plans/saske-svycarsko.json";
const LONG_TOAST_DURATION_IN_MILLISECONDS = 10_000;

startApp().catch(error => {
	console.error("The app could not start:", error);
	showMapNotice(`Aplikaci se nepodařilo spustit: ${error.message}`);
});

async function startApp() {
	registerServiceWorker();
	const { plan, startupMessage, planLinkForInstalledApp } = await choosePlanToOpen();
	setActivePlan(plan);
	document.title = `${plan.name} · ${APP_NAME}`;

	const placesBounds = computePlacesBounds(plan.places);
	const map = createMap("map", placesBounds);
	addBaseLayers(map);
	addPlaceMarkers(map);
	addUserLocationControl(map, placesBounds);

	// The detail card must subscribe before map focusing, so the card is visible when the map measures it.
	const detailCardElement = initDetailCard();
	enableFocusOnSelectedPlace(map, detailCardElement);
	initSidebar();
	initUrlHashSync();
	initPlansPanel({ placesBounds });
	loadPlacePhotos(plan.places);

	showInitialPlace();
	showPendingToast();
	if (startupMessage) {
		showToast(startupMessage, LONG_TOAST_DURATION_IN_MILLISECONDS);
	}
	if (planLinkForInstalledApp) {
		suggestMovingPlanToInstalledApp(planLinkForInstalledApp);
	}

	// A plan link pasted into the address bar of an open tab only changes the fragment, which doesn't reload the page.
	window.addEventListener("hashchange", () => {
		if (hasPlanInFragment(window.location.hash)) {
			window.location.reload();
		}
	});
}

/**
 * @returns {{ plan, startupMessage, planLinkForInstalledApp }}
 *   startupMessage reports the outcome of a plan link; planLinkForInstalledApp is set when
 *   the link was opened in an iOS browser tab, whose storage the installed app can't see.
 */
async function choosePlanToOpen() {
	if (!hasPlanInFragment(window.location.hash)) {
		return { plan: await openStoredPlanOrDemo(), startupMessage: null, planLinkForInstalledApp: null };
	}

	const planLink = window.location.href;
	// Drop the plan from the address bar right away, so a reload doesn't import it again.
	history.replaceState(null, "", window.location.pathname + window.location.search);
	try {
		const rawPlan = await decodePlanFragment(planLink);
		const plan = normalizePlan(rawPlan);
		const { key, wasReplaced } = savePlan(rawPlan, plan);
		setLastOpenedPlanKey(key);
		return {
			plan,
			startupMessage: wasReplaced ? `Plán „${plan.name}“ je aktualizovaný.` : `Plán „${plan.name}“ je uložený.`,
			planLinkForInstalledApp: isIosBrowserTab() ? planLink : null,
		};
	} catch (error) {
		console.error("The plan from the link could not be opened:", error);
		const reason = error instanceof PlanFormatError ? ` ${error.message}` : "";
		return {
			plan: await openStoredPlanOrDemo(),
			startupMessage: `Plán z odkazu se nepodařilo otevřít.${reason}`,
			planLinkForInstalledApp: null,
		};
	}
}

async function openStoredPlanOrDemo() {
	const candidatePlans = [getStoredPlan(getLastOpenedPlanKey()), ...listStoredPlans()].filter(Boolean);
	for (const storedPlan of candidatePlans) {
		try {
			const plan = normalizePlan(storedPlan.rawPlan);
			setLastOpenedPlanKey(storedPlan.key);
			return plan;
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
	const { key } = savePlan(rawDemoPlan, plan);
	setLastOpenedPlanKey(key);
	return plan;
}

// Opens the place linked in the URL, if any. Otherwise the app starts on the map and list, with nothing selected.
function showInitialPlace() {
	const placeFromUrl = readPlaceFromUrlHash();
	if (placeFromUrl) {
		selectPlace(placeFromUrl, { moveMap: true });
	}
}

/**
 * On iOS, an app added to the home screen has its own storage, separate from Safari (and from in-app browsers),
 * so a plan opened from a link here doesn't reach the installed app. This offers the way across.
 */
function isIosBrowserTab() {
	const isAppleMobileDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
		|| (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
	const isInstalledApp = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
	return isAppleMobileDevice && !isInstalledApp;
}

function suggestMovingPlanToInstalledApp(planLink) {
	showMapNotice("Plán je uložený v tomhle prohlížeči. Máte-li aplikaci TripMap na ploše, zkopírujte odkaz a vložte ho v ní přes Moje plány → Importovat.", {
		actionLabel: "Kopírovat odkaz",
		onAction: async () => {
			try {
				await navigator.clipboard.writeText(planLink);
				showToast("Odkaz je zkopírovaný. Teď otevřete aplikaci TripMap.");
			} catch {
				showToast("Odkaz se nepodařilo zkopírovat.");
			}
		},
	});
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
