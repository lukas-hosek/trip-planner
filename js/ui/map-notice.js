/*
	A persistent note over the map, for conditions the user should keep in mind (offline map, a plan opened
	in the browser instead of the installed app, a plan replaced by a link). It can carry action buttons and can be closed.
*/

import { translate } from "../language/translations.js";

/** @param options.actions  buttons shown after the message: [{ label, onAction }] */
export function showMapNotice(message, { actions = [] } = {}) {
	const noticeElement = document.getElementById("map-notice");
	noticeElement.replaceChildren();

	const messageElement = document.createElement("p");
	messageElement.textContent = message;
	noticeElement.append(messageElement);

	for (const { label, onAction } of actions) {
		const actionButton = document.createElement("button");
		actionButton.type = "button";
		actionButton.className = "button button--primary button--small";
		actionButton.textContent = label;
		actionButton.addEventListener("click", onAction);
		noticeElement.append(actionButton);
	}

	const closeButton = document.createElement("button");
	closeButton.type = "button";
	closeButton.className = "icon-button map-notice-close";
	closeButton.setAttribute("aria-label", translate("notice.close"));
	closeButton.innerHTML = `<span class="icon icon--close" aria-hidden="true"></span>`;
	closeButton.addEventListener("click", hideMapNotice);
	noticeElement.append(closeButton);

	noticeElement.hidden = false;
}

export function hideMapNotice() {
	document.getElementById("map-notice").hidden = true;
}
