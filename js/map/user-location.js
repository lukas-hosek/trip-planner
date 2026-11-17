/*
	"My location" button: tracks the phone's GPS, draws a blue dot with an accuracy circle
	and publishes the position so the detail card can show distances.
	Browsers only allow this on https:// (or localhost) and only after the user agrees.
*/

import { setUserPosition } from "../state/app-state.js";
import { showToast } from "../ui/toast.js";
import { prefersReducedMotion } from "../utils/media-queries.js";

// Ask for real GPS rather than a coarse network-based position; we are on hiking trails.
const GEOLOCATION_OPTIONS = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 };
// A position older than this is shown greyed out, so the user knows it may be off.
const STALE_POSITION_AGE_IN_MILLISECONDS = 60_000;
// Close enough to see the surrounding paths when jumping to the user for the first time.
const ZOOM_ON_FIRST_FIX = 14;

const GEOLOCATION_ERROR = { permissionDenied: 1, positionUnavailable: 2, timeout: 3 };
// Leaflet draws the accuracy circle as SVG with inline colours, so it can't read the CSS variable; keep in sync with --color-user-location.
const USER_LOCATION_COLOR = "#1a73e8";

const CROSSHAIR_ICON_HTML = `<span class="icon icon--crosshair" aria-hidden="true"></span>`;

const USER_LOCATION_MARKER_HTML = `
	<div class="user-location-marker">
		<span class="user-location-pulse"></span>
		<div class="user-location-dot"></div>
	</div>`;

export function addUserLocationControl(map) {
	let geolocationWatchId = null;
	let latestPosition = null;
	// While following, every new GPS fix re-centres the map. Dragging the map stops it.
	let isFollowingUser = false;
	let positionMarker = null;
	let accuracyCircle = null;
	let locationButton = null;

	const LocationControl = L.Control.extend({
		options: { position: "topleft" },
		onAdd() {
			const controlContainer = L.DomUtil.create("div", "leaflet-bar leaflet-control");
			locationButton = L.DomUtil.create("button", "location-button", controlContainer);
			locationButton.type = "button";
			locationButton.id = "location-button";
			locationButton.title = "Moje poloha";
			locationButton.setAttribute("aria-label", "Ukázat moji polohu");
			locationButton.setAttribute("aria-pressed", "false");
			locationButton.innerHTML = CROSSHAIR_ICON_HTML;
			// Without this, a click on the button would also count as a click on the map below.
			L.DomEvent.disableClickPropagation(controlContainer);
			L.DomEvent.on(locationButton, "click", handleLocationButtonClick);
			return controlContainer;
		},
	});
	map.addControl(new LocationControl());
	map.on("dragstart", () => {
		isFollowingUser = false;
	});

	function handleLocationButtonClick() {
		const isAlreadyTracking = geolocationWatchId !== null && latestPosition;
		if (isAlreadyTracking) {
			isFollowingUser = true;
			centerMapOnUser({ isFirstFix: false });
			return;
		}
		if (!("geolocation" in navigator)) {
			showToast("Tenhle prohlížeč neumí zjistit polohu.");
			return;
		}
		if (!window.isSecureContext) {
			showToast("Poloha funguje jen na zabezpečené adrese (https). Otevřete mapu z webu, ne jako místní soubor.");
			return;
		}
		startTracking();
	}

	function startTracking() {
		locationButton.classList.add("location-button--searching");
		isFollowingUser = true;
		geolocationWatchId = navigator.geolocation.watchPosition(handleNewPosition, handlePositionError, GEOLOCATION_OPTIONS);
	}

	function stopTracking() {
		if (geolocationWatchId !== null) {
			navigator.geolocation.clearWatch(geolocationWatchId);
		}
		geolocationWatchId = null;
		isFollowingUser = false;
		locationButton.setAttribute("aria-pressed", "false");
	}

	function handleNewPosition(geolocationPosition) {
		const isFirstFix = latestPosition === null;
		latestPosition = {
			latitude: geolocationPosition.coords.latitude,
			longitude: geolocationPosition.coords.longitude,
			accuracyInMeters: geolocationPosition.coords.accuracy,
			receivedAt: Date.now(),
		};

		locationButton.classList.remove("location-button--searching");
		locationButton.setAttribute("aria-pressed", "true");
		drawPositionOnMap(latestPosition);
		setUserPosition(latestPosition);

		if (isFirstFix) {
			announceFirstFix(latestPosition);
		}
		if (isFollowingUser) {
			centerMapOnUser({ isFirstFix });
		}
	}

	function drawPositionOnMap({ latitude, longitude, accuracyInMeters }) {
		const coordinates = [latitude, longitude];
		if (positionMarker) {
			positionMarker.setLatLng(coordinates);
			accuracyCircle.setLatLng(coordinates).setRadius(accuracyInMeters);
			markPositionAsStale(false);
			return;
		}
		accuracyCircle = L.circle(coordinates, {
			radius: accuracyInMeters,
			color: USER_LOCATION_COLOR,
			weight: 1,
			fillColor: USER_LOCATION_COLOR,
			fillOpacity: .12,
			interactive: false,
		}).addTo(map);
		positionMarker = L.marker(coordinates, {
			interactive: false,
			keyboard: false,
			// The user's own position should never hide under a place pin.
			zIndexOffset: 2000,
			icon: L.divIcon({ className: "", html: USER_LOCATION_MARKER_HTML, iconSize: [18, 18], iconAnchor: [9, 9] }),
		}).addTo(map);
	}

	function announceFirstFix(position) {
		showToast(`Poloha zjištěna, přesnost asi ${Math.round(position.accuracyInMeters)} m.`, 3500);
	}

	function centerMapOnUser({ isFirstFix }) {
		if (!latestPosition) {
			return;
		}
		const coordinates = [latestPosition.latitude, latestPosition.longitude];
		if (isFirstFix && !prefersReducedMotion()) {
			map.flyTo(coordinates, Math.max(map.getZoom(), ZOOM_ON_FIRST_FIX), { duration: .6 });
			return;
		}
		// Follow-up fixes arrive every few seconds; a long fly animation each time would make the map feel jumpy.
		const zoom = isFirstFix ? Math.max(map.getZoom(), ZOOM_ON_FIRST_FIX) : map.getZoom();
		map.setView(coordinates, zoom, { animate: !prefersReducedMotion() });
	}

	function handlePositionError(geolocationError) {
		locationButton.classList.remove("location-button--searching");

		if (geolocationError.code === GEOLOCATION_ERROR.permissionDenied) {
			stopTracking();
			showToast("Přístup k poloze je zakázaný. Povolte ho v nastavení prohlížeče pro tuhle stránku a zkuste to znovu.", 8000);
			return;
		}

		// While tracking, short GPS outages (tunnel, deep gorge) are normal; only complain if we never had a fix.
		if (!latestPosition) {
			const message = geolocationError.code === GEOLOCATION_ERROR.timeout
				? "Poloha se zatím nenašla. Zkuste to venku nebo počkejte, až se chytí GPS."
				: "Polohu se nepodařilo zjistit. Zkontrolujte, že máte zapnuté určování polohy.";
			showToast(message);
			return;
		}
		if (Date.now() - latestPosition.receivedAt > STALE_POSITION_AGE_IN_MILLISECONDS) {
			markPositionAsStale(true);
		}
	}

	function markPositionAsStale(isStale) {
		const dotElement = positionMarker?.getElement()?.querySelector(".user-location-dot");
		dotElement?.classList.toggle("user-location-dot--stale", isStale);
	}
}
