/*
	"Moje plány" dialog, opened from the plan name at the top of the sidebar:
	the stored plans (open, delete), importing a new plan, and actions for the current plan
	(share a link, download the JSON, download the map for offline use).
	Opening or importing another plan reloads the app with that plan.
*/

import { getActivePlan, getPlaces } from "../data/active-plan.js";
import { getPlanKey, normalizePlan, PlanFormatError, slugify } from "../data/plan-format.js";
import { encodePlanLink, extractRawPlanFromText } from "../data/plan-link.js";
import { deleteStoredPlan, getStoredPlan, listStoredPlans, savePlan, setLastOpenedPlanKey } from "../data/plan-store.js";
import { downloadPlanForOffline } from "../services/offline-download.js";
import { loadPlacePhotos } from "../services/place-photos.js";
import { escapeHtml } from "../utils/html.js";
import { isPhoneLayout } from "../utils/media-queries.js";
import { showToastAfterReload } from "./toast.js";

// The first tap on "Smazat" only asks; the second one, within this time, deletes.
const DELETE_CONFIRMATION_TIMEOUT_IN_MILLISECONDS = 4000;

let elements = null;
let placesBounds = null;
let resetDeleteConfirmationTimer = null;

/** @param options.placesBounds  bounds of the current plan's places, for the offline download */
export function initPlansPanel(options) {
	placesBounds = options.placesBounds;
	elements = {
		dialog: document.getElementById("plans-dialog"),
		listView: document.getElementById("plans-list-view"),
		importView: document.getElementById("plans-import-view"),
		storedPlanList: document.getElementById("stored-plan-list"),
		actionsStatus: document.getElementById("plan-actions-status"),
		offlineDownloadButton: document.getElementById("offline-download-button"),
		importText: document.getElementById("import-text"),
		importError: document.getElementById("import-error"),
		importButton: document.getElementById("import-button"),
		importFileInput: document.getElementById("import-file-input"),
	};

	document.getElementById("plan-switcher").addEventListener("click", openPlansDialog);
	for (const closeButton of elements.dialog.querySelectorAll("[data-close-dialog]")) {
		closeButton.addEventListener("click", () => elements.dialog.close());
	}
	// A click on the dimmed backdrop lands on the <dialog> element itself.
	elements.dialog.addEventListener("click", clickEvent => {
		if (clickEvent.target === elements.dialog) {
			elements.dialog.close();
		}
	});

	elements.storedPlanList.addEventListener("click", handleStoredPlanClick);
	document.getElementById("show-import-button").addEventListener("click", showImportView);
	document.getElementById("import-back-button").addEventListener("click", showListView);
	document.getElementById("share-plan-button").addEventListener("click", sharePlan);
	document.getElementById("export-plan-button").addEventListener("click", exportPlanAsJson);
	elements.offlineDownloadButton.addEventListener("click", downloadForOffline);

	elements.importButton.addEventListener("click", () => importPlanFromText(elements.importText.value));
	document.getElementById("paste-from-clipboard-button").addEventListener("click", pasteFromClipboard);
	document.getElementById("choose-file-button").addEventListener("click", () => elements.importFileInput.click());
	elements.importFileInput.addEventListener("change", importPlanFromChosenFile);
}

function openPlansDialog() {
	showListView();
	elements.dialog.showModal();
}

function showListView() {
	renderStoredPlans();
	elements.importView.hidden = true;
	elements.listView.hidden = false;
}

function showImportView() {
	elements.importText.value = "";
	showImportError("");
	elements.listView.hidden = true;
	elements.importView.hidden = false;
	elements.importText.focus();
}

// ---------- stored plans ----------

function renderStoredPlans() {
	const currentPlanKey = getPlanKey(getActivePlan().name);
	elements.storedPlanList.innerHTML = listStoredPlans().map(storedPlan => {
		const isCurrent = storedPlan.key === currentPlanKey;
		const savedDate = new Date(storedPlan.savedAt).toLocaleDateString("cs-CZ");
		return `
			<li class="stored-plan" aria-current="${isCurrent}">
				<button class="stored-plan-open" type="button" data-open-plan-key="${escapeHtml(storedPlan.key)}">
					<span class="stored-plan-name">${escapeHtml(storedPlan.name)}</span>
					<span class="stored-plan-meta">${formatPlaceCount(storedPlan.placeCount)} · uloženo ${savedDate}${isCurrent ? " · otevřený" : ""}</span>
				</button>
				<button class="stored-plan-delete" type="button" data-delete-plan-key="${escapeHtml(storedPlan.key)}"
					aria-label="Smazat plán ${escapeHtml(storedPlan.name)}">Smazat</button>
			</li>`;
	}).join("");
}

function handleStoredPlanClick(clickEvent) {
	const openButton = clickEvent.target.closest("[data-open-plan-key]");
	if (openButton) {
		openStoredPlan(openButton.dataset.openPlanKey);
		return;
	}
	const deleteButton = clickEvent.target.closest("[data-delete-plan-key]");
	if (deleteButton) {
		handleDeleteClick(deleteButton);
	}
}

function openStoredPlan(planKey) {
	if (planKey === getPlanKey(getActivePlan().name)) {
		elements.dialog.close();
		return;
	}
	setLastOpenedPlanKey(planKey);
	reloadApp();
}

function handleDeleteClick(deleteButton) {
	if (!deleteButton.classList.contains("stored-plan-delete--confirming")) {
		resetDeleteConfirmations();
		deleteButton.classList.add("stored-plan-delete--confirming");
		deleteButton.textContent = "Opravdu smazat?";
		clearTimeout(resetDeleteConfirmationTimer);
		resetDeleteConfirmationTimer = setTimeout(resetDeleteConfirmations, DELETE_CONFIRMATION_TIMEOUT_IN_MILLISECONDS);
		return;
	}

	const planKey = deleteButton.dataset.deletePlanKey;
	const planName = getStoredPlan(planKey)?.name ?? "";
	deleteStoredPlan(planKey);
	// Deleting the open plan leaves nothing to show; the reload opens another one (or the demo when none is left).
	if (planKey === getPlanKey(getActivePlan().name)) {
		showToastAfterReload(`Plán „${planName}“ je smazaný.`);
		reloadApp();
		return;
	}
	renderStoredPlans();
}

function resetDeleteConfirmations() {
	for (const confirmingButton of elements.storedPlanList.querySelectorAll(".stored-plan-delete--confirming")) {
		confirmingButton.classList.remove("stored-plan-delete--confirming");
		confirmingButton.textContent = "Smazat";
	}
}

// ---------- current plan actions ----------

function getCurrentRawPlan() {
	return getStoredPlan(getPlanKey(getActivePlan().name))?.rawPlan ?? null;
}

async function sharePlan() {
	const rawPlan = getCurrentRawPlan();
	if (!rawPlan) {
		showActionsStatus("Plán se nepodařilo najít v úložišti.");
		return;
	}
	const planLink = await encodePlanLink(rawPlan);
	// On phones the system share sheet is the natural choice; on desktop, copying the link is what people expect.
	if (navigator.share && isPhoneLayout()) {
		try {
			await navigator.share({ title: getActivePlan().name, url: planLink });
			return;
		} catch (error) {
			if (error.name === "AbortError") {
				return;
			}
		}
	}
	try {
		await navigator.clipboard.writeText(planLink);
		showActionsStatus("Odkaz na plán je zkopírovaný. Kdo ho otevře, uvidí plán ve své aplikaci.");
	} catch {
		showActionsStatus("Odkaz se nepodařilo zkopírovat.");
	}
}

function exportPlanAsJson() {
	const rawPlan = getCurrentRawPlan();
	if (!rawPlan) {
		showActionsStatus("Plán se nepodařilo najít v úložišti.");
		return;
	}
	const planFile = new Blob([JSON.stringify(rawPlan, null, "\t") + "\n"], { type: "application/json" });
	const downloadLink = document.createElement("a");
	downloadLink.href = URL.createObjectURL(planFile);
	downloadLink.download = `${slugify(getActivePlan().name) || "plan"}.json`;
	downloadLink.click();
	// The browser needs the URL until the download has started.
	setTimeout(() => URL.revokeObjectURL(downloadLink.href), 10_000);
}

async function downloadForOffline() {
	if (!navigator.serviceWorker?.controller) {
		showActionsStatus("Offline režim ještě neběží. Obnovte stránku a zkuste to znovu.");
		return;
	}
	if (!navigator.onLine) {
		showActionsStatus("Jste offline. Stahovat jde jen s připojením k internetu.");
		return;
	}

	elements.offlineDownloadButton.disabled = true;
	showActionsStatus("Připravuji stahování…");
	try {
		// Looking the photos up again goes through the service worker, which keeps the answer for offline use
		// (on the very first visit the original lookup ran before the service worker was in control).
		await loadPlacePhotos(getPlaces());
		const { totalCount, failedCount } = await downloadPlanForOffline(getPlaces(), placesBounds, ({ completedCount, totalCount }) => {
			showActionsStatus(`Stahuji mapu a fotky… ${completedCount} / ${totalCount}`);
		});
		showActionsStatus(failedCount === 0
			? "Hotovo. Mapa okolí všech míst a fotky jsou uložené pro offline."
			: `Hotovo, ale ${failedCount} z ${totalCount} souborů se nestáhlo. Zkuste to znovu s lepším signálem.`);
	} finally {
		elements.offlineDownloadButton.disabled = false;
	}
}

function showActionsStatus(message) {
	elements.actionsStatus.textContent = message;
}

// ---------- import ----------

async function pasteFromClipboard() {
	try {
		const clipboardText = await navigator.clipboard.readText();
		elements.importText.value = clipboardText;
		await importPlanFromText(clipboardText);
	} catch (error) {
		if (error instanceof PlanFormatError) {
			showImportError(error.message);
			return;
		}
		showImportError("Schránku se nepodařilo přečíst. Vložte text do pole ručně.");
		elements.importText.focus();
	}
}

async function importPlanFromChosenFile() {
	const chosenFile = elements.importFileInput.files[0];
	elements.importFileInput.value = "";
	if (!chosenFile) {
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
		const { key, wasReplaced } = savePlan(rawPlan, normalizedPlan);
		setLastOpenedPlanKey(key);
		showToastAfterReload(wasReplaced
			? `Plán „${normalizedPlan.name}“ je aktualizovaný.`
			: `Plán „${normalizedPlan.name}“ je uložený.`);
		reloadApp();
	} catch (error) {
		if (!(error instanceof PlanFormatError)) {
			console.error("Plan import failed:", error);
		}
		showImportError(error instanceof PlanFormatError ? error.message : "Plán se nepodařilo načíst.");
	} finally {
		elements.importButton.disabled = false;
	}
}

function showImportError(message) {
	elements.importError.textContent = message;
	elements.importError.hidden = !message;
}

// ---------- helpers ----------

/** Reloads without the URL fragment, so a stale "#place" or "#plan=…" doesn't come back. */
function reloadApp() {
	history.replaceState(null, "", window.location.pathname + window.location.search);
	window.location.reload();
}

/** Czech plural: 1 místo, 2–4 místa, 5 a více míst. */
function formatPlaceCount(count) {
	if (count === 1) {
		return "1 místo";
	}
	return count >= 2 && count <= 4 ? `${count} místa` : `${count} míst`;
}
