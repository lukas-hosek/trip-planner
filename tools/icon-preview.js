/*
	Renders tools/icon-preview.html: every place icon in a pin and a badge (with the app's own code),
	and every interface icon at the sizes the app uses. See .claude/skills/tripmap-icons/SKILL.md.
*/

import { PLACE_ICON_KEYS } from "../js/data/place-icons.js";
import { renderPinHtml } from "../js/map/place-markers.js";
import { renderPlaceBadge, renderPlaceIcon } from "../js/ui/place-badge.js";
import { escapeHtml } from "../js/utils/html.js";

// The category palette from claude-skill/trip-map/reference/plan-format.md, cycled so every icon is seen on several colours.
const SAMPLE_CATEGORY_COLORS = ["#575c93", "#2f7a4b", "#8a4f7d", "#4a6fa5", "#b0731c", "#9c4a2f", "#2b7c7f", "#7a6a2e", "#a83a4a"];

// Must match the .icon--… classes in css/components.css and the files in icons/ui/.
const UI_ICON_NAMES = [
	"menu", "close", "more", "chevron-down", "back",
	"share", "export", "download", "release", "delete",
	"import", "offline", "crosshair", "settings", "check",
];

renderPlaceIcons();
renderUiIcons();

function renderPlaceIcons() {
	document.getElementById("place-icons").innerHTML = PLACE_ICON_KEYS
		.map((iconKey, index) => renderPlaceIconSample(iconKey, SAMPLE_CATEGORY_COLORS[index % SAMPLE_CATEGORY_COLORS.length]))
		.join("");
}

function renderPlaceIconSample(iconKey, color) {
	// A place outside the itinerary, which is where the app shows icons.
	const samplePlace = { isPlanned: false, itineraryNumber: null, iconKey, category: { color } };
	return `
		<figure class="preview-icon">
			<div class="preview-icon-samples">
				${renderPinHtml(samplePlace)}
				${renderPlaceBadge(samplePlace)}
				${renderPlaceIcon(iconKey)}
			</div>
			<figcaption><code class="preview-icon-key">${escapeHtml(iconKey)}</code></figcaption>
		</figure>`;
}

function renderUiIcons() {
	const html = UI_ICON_NAMES.map(name => `
		<div class="preview-ui-icon">
			<div class="preview-ui-icon-sizes">
				<span class="icon icon--${name}" style="--icon-size: 18px"></span>
				<span class="icon icon--${name}" style="--icon-size: 24px"></span>
			</div>
			${name}
		</div>`).join("");
	document.getElementById("ui-icons-light").innerHTML = html;
	document.getElementById("ui-icons-dark").innerHTML = html;
}
