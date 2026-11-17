/*
	The plans dialog ("My plans"), opened from the menu button next to the plan name: one list of all stored plans,
	each with its offline status and a ⋯ menu (share a link, export the JSON, save or release offline data, delete).
	The actions work for any stored plan, not only the open one. Below the list: importing a plan and the help;
	in the header, the app settings (settings-panel.js). All of them are views of this one dialog.
	Opening or importing another plan reloads the app with that plan.
*/

import { getActivePlan, getPlaces } from "../data/active-plan.js";
import { getPlanKey, normalizePlan, PlanFormatError, slugify } from "../data/plan-format.js";
import { encodePlanLink, extractRawPlanFromText, MAXIMUM_IMPORT_TEXT_LENGTH } from "../data/plan-link.js";
import { deleteStoredPlan, getStoredPlan, listStoredPlans, savePlan, setLastOpenedPlanKey } from "../data/plan-store.js";
import { formatDate, formatNumber, translate } from "../language/translations.js";
import { computePlacesBounds } from "../map/base-map.js";
import { deletePlanDownload, downloadPlanForOffline, getPlanDownloadSummary } from "../services/offline-download.js";
import { findPlacePhotos, loadPlacePhotos } from "../services/place-photos.js";
import { appState } from "../state/app-state.js";
import { escapeHtml } from "../utils/html.js";
import { isPhoneLayout } from "../utils/media-queries.js";
import { closeOpenMenu, initMenuKeyboard, isInOpenMenuOrTrigger, isMenuOpen, openMenu } from "./menu.js";
import { renderSettingsView, SETTINGS_VIEW_NAME } from "./settings-panel.js";
import { showToastAfterReload } from "./toast.js";

// The first tap on "Delete plan" only asks; the second one, within this time, deletes.
const DELETE_CONFIRMATION_TIMEOUT_IN_MILLISECONDS = 4000;

let elements = null;
let openPlanBounds = null;
// Offline status per plan key, as read from the plans' caches: see getPlanDownloadSummary().
const downloadSummariesByPlanKey = new Map();
// Downloads in progress: plan key -> percent. Kept here, so closing the dialog doesn't lose track of them.
const downloadProgressByPlanKey = new Map();
// The plan whose ⋯ menu is open, or null.
let menuPlanKey = null;
let resetDeleteConfirmationTimer = null;

/** @param options.placesBounds  bounds of the open plan's places, for its offline download */
export function initPlansPanel(options) {
	openPlanBounds = options.placesBounds;
	elements = {
		dialog: document.getElementById("plans-dialog"),
		listView: document.getElementById("plans-list-view"),
		importView: document.getElementById("plans-import-view"),
		helpView: document.getElementById("plans-help-view"),
		settingsView: document.getElementById("plans-settings-view"),
		storedPlanList: document.getElementById("stored-plan-list"),
		status: document.getElementById("plans-status"),
		menu: document.getElementById("plan-actions-menu"),
		importText: document.getElementById("import-text"),
		importError: document.getElementById("import-error"),
		importButton: document.getElementById("import-button"),
		importFileInput: document.getElementById("import-file-input"),
	};

	// Not the function itself: a click event has a "view" property of its own (the window).
	document.getElementById("plans-button").addEventListener("click", () => openPlansDialog());
	for (const closeButton of elements.dialog.querySelectorAll("[data-close-dialog]")) {
		closeButton.addEventListener("click", () => elements.dialog.close());
	}
	for (const backButton of elements.dialog.querySelectorAll("[data-show-list-view]")) {
		backButton.addEventListener("click", () => showView(elements.listView));
	}
	elements.dialog.addEventListener("click", handleDialogClick);
	// Esc closes an open menu (the ⋯ menu or a settings choice) first, and only the next Esc closes the dialog.
	// Cancelling the key stops the dialog's close request; the cancel event is only a fallback,
	// because browsers don't always let a page cancel it.
	elements.dialog.addEventListener("keydown", keyboardEvent => {
		if (keyboardEvent.key === "Escape" && isMenuOpen()) {
			keyboardEvent.preventDefault();
			closeOpenMenu({ returnFocus: true });
		}
	});
	elements.dialog.addEventListener("cancel", cancelEvent => {
		if (isMenuOpen()) {
			cancelEvent.preventDefault();
			closeOpenMenu({ returnFocus: true });
		}
	});
	elements.dialog.addEventListener("close", () => closeOpenMenu());

	elements.storedPlanList.addEventListener("click", handleStoredPlanClick);
	elements.menu.addEventListener("click", handleMenuClick);
	initMenuKeyboard(elements.menu);
	document.getElementById("show-import-button").addEventListener("click", showImportView);
	document.getElementById("show-help-button").addEventListener("click", () => showView(elements.helpView));
	document.getElementById("show-settings-button").addEventListener("click", () => showView(elements.settingsView));

	elements.importButton.addEventListener("click", () => importPlanFromText(elements.importText.value));
	document.getElementById("paste-from-clipboard-button").addEventListener("click", pasteFromClipboard);
	document.getElementById("choose-file-button").addEventListener("click", () => elements.importFileInput.click());
	elements.importFileInput.addEventListener("change", importPlanFromChosenFile);
}

/** @param options.initialViewName  SETTINGS_VIEW_NAME opens the app settings instead of the list of plans */
export function openPlansDialog({ initialViewName = null } = {}) {
	showStatus("");
	showView(initialViewName === SETTINGS_VIEW_NAME ? elements.settingsView : elements.listView);
	elements.dialog.showModal();
	refreshDownloadSummaries();
}

function showView(viewElement) {
	closeOpenMenu();
	if (viewElement === elements.listView) {
		renderStoredPlans();
	} else if (viewElement === elements.settingsView) {
		renderSettingsView();
	}
	for (const view of [elements.listView, elements.importView, elements.helpView, elements.settingsView]) {
		view.hidden = view !== viewElement;
	}
}

function showImportView() {
	elements.importText.value = "";
	showImportError("");
	showView(elements.importView);
	elements.importText.focus();
}

function handleDialogClick(clickEvent) {
	if (isMenuOpen() && !isInOpenMenuOrTrigger(clickEvent.target)) {
		// A click outside an open menu only closes the menu, even on the backdrop.
		closeOpenMenu();
		return;
	}
	// A click on the dimmed backdrop lands on the <dialog> element itself.
	if (clickEvent.target === elements.dialog) {
		elements.dialog.close();
	}
}

// ---------- stored plans ----------

function renderStoredPlans() {
	const openPlanKey = getOpenPlanKey();
	elements.storedPlanList.innerHTML = listStoredPlans().map(storedPlan => {
		const isOpen = storedPlan.key === openPlanKey;
		const savedDate = formatDate(storedPlan.savedAt);
		const metaText = [isOpen ? translate("plans.openPlan") : "", translate("plans.placeCount", { count: storedPlan.placeCount }), savedDate].filter(Boolean).join(" · ");
		return `
			<li class="stored-plan selectable-row" aria-current="${isOpen}">
				<button class="stored-plan-open" type="button" data-open-plan-key="${escapeHtml(storedPlan.key)}">
					<span class="stored-plan-name">${escapeHtml(storedPlan.name)}</span>
					<span class="stored-plan-meta">
						<span>${escapeHtml(metaText)}</span>
						<span class="stored-plan-status" data-status-plan-key="${escapeHtml(storedPlan.key)}"></span>
					</span>
				</button>
				<button class="icon-button" type="button" data-menu-plan-key="${escapeHtml(storedPlan.key)}"
					aria-haspopup="menu" aria-expanded="false" aria-controls="plan-actions-menu" aria-label="${escapeHtml(translate("plans.actionsLabel", { name: storedPlan.name }))}">
					<span class="icon icon--more" aria-hidden="true"></span>
				</button>
			</li>`;
	}).join("");
	for (const storedPlan of listStoredPlans()) {
		renderPlanStatus(storedPlan.key);
	}
}

/** Updates only the status chip, so a running download doesn't re-render the list under an open menu. */
function renderPlanStatus(planKey) {
	const statusElement = [...elements.storedPlanList.querySelectorAll("[data-status-plan-key]")]
		.find(element => element.dataset.statusPlanKey === planKey);
	if (!statusElement) {
		return;
	}
	const progress = downloadProgressByPlanKey.get(planKey);
	const summary = downloadSummariesByPlanKey.get(planKey);
	statusElement.className = "stored-plan-status";
	if (progress !== undefined) {
		statusElement.textContent = translate("plans.status.downloading", { percent: progress });
	} else if (summary?.isOutdated) {
		statusElement.classList.add("stored-plan-status--incomplete");
		statusElement.textContent = translate("plans.status.outdated");
	} else if (summary?.isComplete) {
		statusElement.classList.add("stored-plan-status--offline");
		statusElement.innerHTML = `<span class="icon icon--offline" aria-hidden="true"></span>${escapeHtml(translate("plans.status.offline"))}`;
	} else if (summary) {
		statusElement.classList.add("stored-plan-status--incomplete");
		statusElement.textContent = translate("plans.status.incomplete");
	} else {
		statusElement.textContent = "";
	}
}

async function refreshDownloadSummaries() {
	await Promise.all(listStoredPlans().map(storedPlan => refreshDownloadSummary(storedPlan.key)));
}

async function refreshDownloadSummary(planKey) {
	downloadSummariesByPlanKey.set(planKey, await getPlanDownloadSummary(planKey, readStoredPlaces(planKey)));
	renderPlanStatus(planKey);
}

/** The stored plan's places, or null when it can't be read (then its offline status can't be compared with it). */
function readStoredPlaces(planKey) {
	const storedPlan = getStoredPlan(planKey);
	if (!storedPlan) {
		return null;
	}
	try {
		return normalizePlan(storedPlan.rawPlan).places;
	} catch {
		return null;
	}
}

function handleStoredPlanClick(clickEvent) {
	const openButton = clickEvent.target.closest("[data-open-plan-key]");
	if (openButton) {
		openStoredPlan(openButton.dataset.openPlanKey);
		return;
	}
	const menuButton = clickEvent.target.closest("[data-menu-plan-key]");
	if (menuButton) {
		if (menuPlanKey === menuButton.dataset.menuPlanKey) {
			closeOpenMenu({ returnFocus: true });
		} else {
			openPlanMenu(menuButton);
		}
	}
}

function openStoredPlan(planKey) {
	if (planKey === getOpenPlanKey()) {
		elements.dialog.close();
		return;
	}
	setLastOpenedPlanKey(planKey);
	reloadApp();
}

// ---------- the ⋯ menu ----------

function openPlanMenu(triggerButton) {
	// Closed first, so the previous menu's onClose can't clear the plan key set below.
	closeOpenMenu();
	menuPlanKey = triggerButton.dataset.menuPlanKey;
	renderMenu();
	openMenu(elements.menu, triggerButton, {
		label: triggerButton.getAttribute("aria-label"),
		onClose: () => {
			clearTimeout(resetDeleteConfirmationTimer);
			menuPlanKey = null;
		},
	});
}

function renderMenu() {
	const summary = downloadSummariesByPlanKey.get(menuPlanKey);
	const isDownloading = downloadProgressByPlanKey.has(menuPlanKey);
	const items = [
		renderMenuItem("share", "share", translate("plans.menu.share")),
		renderMenuItem("export", "export", translate("plans.menu.export"), "JSON"),
	];
	// A complete download needs no repeat; an incomplete or outdated one can be finished.
	if (!isDownloading && !summary?.isComplete) {
		items.push(renderMenuItem("download", "download", translate("plans.menu.download")));
	}
	if (summary && !isDownloading) {
		items.push(renderMenuItem("release", "release", translate("plans.menu.release"), summary.byteCount === null ? "" : formatByteSize(summary.byteCount)));
	}
	items.push(`<div class="menu-separator" role="separator"></div>`);
	items.push(renderMenuItem("delete", "delete", translate("plans.menu.delete"), "", "menu-item--danger"));
	elements.menu.innerHTML = items.join("");
}

function renderMenuItem(action, iconName, label, note = "", extraClass = "") {
	const noteHtml = note ? `<small class="menu-item-note">${escapeHtml(note)}</small>` : "";
	return `
		<button class="menu-item ${extraClass}" type="button" role="menuitem" data-action="${action}">
			<span class="icon icon--${iconName}" aria-hidden="true"></span><span class="menu-item-label">${escapeHtml(label)}</span>${noteHtml}
		</button>`;
}

function handleMenuClick(clickEvent) {
	const menuItem = clickEvent.target.closest("[data-action]");
	if (!menuItem) {
		return;
	}
	const planKey = menuPlanKey;
	const action = menuItem.dataset.action;
	if (action === "delete") {
		handleDeleteClick(menuItem, planKey);
		return;
	}
	closeOpenMenu({ returnFocus: true });
	if (action === "share") {
		sharePlan(planKey);
	} else if (action === "export") {
		exportPlanAsJson(planKey);
	} else if (action === "download") {
		downloadForOffline(planKey);
	} else if (action === "release") {
		releaseOfflineData(planKey);
	}
}

// ---------- plan actions ----------

async function handleDeleteClick(menuItem, planKey) {
	if (!menuItem.classList.contains("menu-item--confirming")) {
		menuItem.classList.add("menu-item--confirming");
		menuItem.querySelector(".menu-item-label").textContent = translate("plans.menu.confirmDelete");
		clearTimeout(resetDeleteConfirmationTimer);
		resetDeleteConfirmationTimer = setTimeout(() => {
			menuItem.classList.remove("menu-item--confirming");
			menuItem.querySelector(".menu-item-label").textContent = translate("plans.menu.delete");
		}, DELETE_CONFIRMATION_TIMEOUT_IN_MILLISECONDS);
		return;
	}

	closeOpenMenu();
	const planName = getStoredPlan(planKey)?.name ?? "";
	deleteStoredPlan(planKey);
	// Waits for the plan's offline map to go too, so a reload right after can't cut the deletion short.
	await deletePlanDownload(planKey);
	downloadSummariesByPlanKey.delete(planKey);
	// Deleting the open plan leaves nothing to show; the reload opens another one (or the demo when none is left).
	if (planKey === getOpenPlanKey()) {
		showToastAfterReload(translate("plans.deleted", { name: planName }));
		reloadApp();
		return;
	}
	renderStoredPlans();
	showStatus(translate("plans.deleted", { name: planName }));
}

async function sharePlan(planKey) {
	const storedPlan = getStoredPlan(planKey);
	if (!storedPlan) {
		showStatus(translate("common.planNotFound"));
		return;
	}
	const planLink = await encodePlanLink(storedPlan.rawPlan);
	// On phones the system share sheet is the natural choice; on desktop, copying the link is what people expect.
	if (navigator.share && isPhoneLayout()) {
		try {
			await navigator.share({ title: storedPlan.name, url: planLink });
			return;
		} catch (error) {
			if (error.name === "AbortError") {
				return;
			}
		}
	}
	try {
		await navigator.clipboard.writeText(planLink);
		showStatus(translate("plans.linkCopied", { name: storedPlan.name }));
	} catch {
		showStatus(translate("common.linkCopyFailed"));
	}
}

function exportPlanAsJson(planKey) {
	const storedPlan = getStoredPlan(planKey);
	if (!storedPlan) {
		showStatus(translate("common.planNotFound"));
		return;
	}
	const planFile = new Blob([JSON.stringify(storedPlan.rawPlan, null, "\t") + "\n"], { type: "application/json" });
	const downloadLink = document.createElement("a");
	downloadLink.href = URL.createObjectURL(planFile);
	downloadLink.download = `${slugify(storedPlan.name) || "plan"}.json`;
	downloadLink.click();
	// The browser needs the URL until the download has started.
	setTimeout(() => URL.revokeObjectURL(downloadLink.href), 10_000);
}

async function downloadForOffline(planKey) {
	if (!navigator.serviceWorker?.controller) {
		showStatus(translate("plans.offlineNotReady"));
		return;
	}
	if (!navigator.onLine) {
		showStatus(translate("plans.downloadNeedsConnection"));
		return;
	}
	const storedPlan = getStoredPlan(planKey);
	if (!storedPlan) {
		showStatus(translate("common.planNotFound"));
		return;
	}

	downloadProgressByPlanKey.set(planKey, 0);
	renderPlanStatus(planKey);
	showStatus("");
	try {
		const { places, placesBounds, photoUrls } = await preparePlanForDownload(planKey, storedPlan);
		const { totalCount, failedCount } = await downloadPlanForOffline(planKey, places, placesBounds, photoUrls, ({ completedCount, totalCount }) => {
			downloadProgressByPlanKey.set(planKey, Math.floor(completedCount / totalCount * 100));
			renderPlanStatus(planKey);
		});
		showStatus(failedCount === 0
			? translate("plans.downloadComplete", { name: storedPlan.name })
			: translate("plans.downloadPartial", { name: storedPlan.name, count: failedCount, totalCount }));
	} catch (error) {
		console.error("The offline download failed:", error);
		showStatus(error instanceof PlanFormatError
			? translate("plans.planUnreadable", { name: storedPlan.name, reason: error.message })
			: translate("plans.downloadFailed"));
	} finally {
		downloadProgressByPlanKey.delete(planKey);
		await refreshDownloadSummary(planKey);
	}
}

/** What the download needs: the places, the area around them and the photo addresses. */
async function preparePlanForDownload(planKey, storedPlan) {
	if (planKey === getOpenPlanKey()) {
		// Looking the photos up again goes through the service worker, which keeps the answer for offline use
		// (on the very first visit the original lookup ran before the service worker was in control).
		await loadPlacePhotos(getPlaces());
		return {
			places: getPlaces(),
			placesBounds: openPlanBounds,
			photoUrls: [...appState.photosByPlaceId.values()].map(photo => photo.imageUrl),
		};
	}
	const plan = normalizePlan(storedPlan.rawPlan);
	const { photosByPlaceId } = await findPlacePhotos(plan.places);
	return {
		places: plan.places,
		placesBounds: computePlacesBounds(plan.places),
		photoUrls: [...photosByPlaceId.values()].map(photo => photo.imageUrl),
	};
}

async function releaseOfflineData(planKey) {
	const planName = getStoredPlan(planKey)?.name ?? "";
	await deletePlanDownload(planKey);
	await refreshDownloadSummary(planKey);
	showStatus(translate("plans.released", { name: planName }));
}

function showStatus(message) {
	elements.status.textContent = message;
}

// ---------- import ----------

async function pasteFromClipboard() {
	let clipboardText;
	try {
		clipboardText = await navigator.clipboard.readText();
	} catch {
		showImportError(translate("import.clipboardFailed"));
		elements.importText.focus();
		return;
	}
	elements.importText.value = clipboardText;
	await importPlanFromText(clipboardText);
}

async function importPlanFromChosenFile() {
	const chosenFile = elements.importFileInput.files[0];
	elements.importFileInput.value = "";
	if (!chosenFile) {
		return;
	}
	// Checked before reading, so a huge file chosen by mistake is never loaded into memory.
	if (chosenFile.size > MAXIMUM_IMPORT_TEXT_LENGTH) {
		showImportError(translate("import.fileTooLarge"));
		return;
	}
	const fileText = await chosenFile.text();
	elements.importText.value = fileText;
	await importPlanFromText(fileText);
}

async function importPlanFromText(text) {
	showImportError("");
	elements.importButton.disabled = true;
	try {
		const rawPlan = await extractRawPlanFromText(text);
		const normalizedPlan = normalizePlan(rawPlan);
		const { key, wasReplaced, wasSaved } = savePlan(rawPlan, normalizedPlan);
		if (!wasSaved) {
			// Opening the plan means reloading the app, and an unsaved plan wouldn't survive that.
			showImportError(translate("import.notSaved"));
			return;
		}
		setLastOpenedPlanKey(key);
		showToastAfterReload(translate(wasReplaced ? "common.planUpdated" : "common.planSaved", { name: normalizedPlan.name }));
		reloadApp();
	} catch (error) {
		if (!(error instanceof PlanFormatError)) {
			console.error("Plan import failed:", error);
		}
		showImportError(error instanceof PlanFormatError ? error.message : translate("import.failed"));
	} finally {
		elements.importButton.disabled = false;
	}
}

function showImportError(message) {
	elements.importError.textContent = message;
	elements.importError.hidden = !message;
}

// ---------- helpers ----------

function getOpenPlanKey() {
	return getPlanKey(getActivePlan().name);
}

/** Reloads without the URL fragment, so a stale "#place" or "#plan=…" doesn't come back. */
function reloadApp() {
	history.replaceState(null, "", window.location.pathname + window.location.search);
	window.location.reload();
}

/** "38 MB", "640 kB": rounded, because the figure only helps decide whether freeing the space is worth it. */
function formatByteSize(byteCount) {
	if (byteCount >= 1_000_000) {
		return formatNumber(Math.round(byteCount / 1_000_000), { style: "unit", unit: "megabyte" });
	}
	return formatNumber(Math.max(1, Math.round(byteCount / 1000)), { style: "unit", unit: "kilobyte" });
}
