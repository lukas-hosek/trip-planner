/* Short, self-dismissing messages (location found, permission denied, …). */

const DEFAULT_TOAST_DURATION_IN_MILLISECONDS = 6000;

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
