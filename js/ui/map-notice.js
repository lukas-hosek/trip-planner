/* A persistent note over the map, for conditions the user should keep in mind (e.g. offline map). */

export function showMapNotice(message) {
	const noticeElement = document.getElementById("map-notice");
	noticeElement.textContent = message;
	noticeElement.hidden = false;
}
