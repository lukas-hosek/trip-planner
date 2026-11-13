/*
	A persistent note over the map, for conditions the user should keep in mind (offline map, a plan opened
	in the browser instead of the installed app). It can carry one action button and can be closed.
*/

export function showMapNotice(message, { actionLabel = null, onAction = null } = {}) {
	const noticeElement = document.getElementById("map-notice");
	noticeElement.replaceChildren();

	const messageElement = document.createElement("p");
	messageElement.textContent = message;
	noticeElement.append(messageElement);

	if (actionLabel && onAction) {
		const actionButton = document.createElement("button");
		actionButton.type = "button";
		actionButton.className = "map-notice-action";
		actionButton.textContent = actionLabel;
		actionButton.addEventListener("click", onAction);
		noticeElement.append(actionButton);
	}

	const closeButton = document.createElement("button");
	closeButton.type = "button";
	closeButton.className = "map-notice-close";
	closeButton.setAttribute("aria-label", "Zavřít upozornění");
	closeButton.textContent = "×";
	closeButton.addEventListener("click", hideMapNotice);
	noticeElement.append(closeButton);

	noticeElement.hidden = false;
}

export function hideMapNotice() {
	document.getElementById("map-notice").hidden = true;
}
