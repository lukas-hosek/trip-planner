/* Short, self-dismissing messages (location found, permission denied, plan imported, …). */

const DEFAULT_TOAST_DURATION_IN_MILLISECONDS = 6000;
// Switching or importing a plan reloads the app; the confirmation waits here for the new page.
const PENDING_TOAST_STORAGE_KEY = "tripPlanner.pendingToast";

let hideToastTimer = null;

export function showToast(message, durationInMilliseconds = DEFAULT_TOAST_DURATION_IN_MILLISECONDS) {
	const toastElement = document.getElementById("toast");
	toastElement.textContent = message;
	toastElement.hidden = false;

	// A new message restarts the countdown, otherwise it could vanish right after appearing.
	clearTimeout(hideToastTimer);
	hideToastTimer = setTimeout(() => {
		toastElement.hidden = true;
	}, durationInMilliseconds);
}

export function showToastAfterReload(message) {
	try {
		sessionStorage.setItem(PENDING_TOAST_STORAGE_KEY, message);
	} catch {
		// Without session storage the confirmation is simply skipped.
	}
}

export function showPendingToast() {
	try {
		const pendingMessage = sessionStorage.getItem(PENDING_TOAST_STORAGE_KEY);
		sessionStorage.removeItem(PENDING_TOAST_STORAGE_KEY);
		if (pendingMessage) {
			showToast(pendingMessage);
		}
	} catch {
		// Nothing pending can be read without session storage.
	}
}
