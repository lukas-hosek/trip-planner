/* Must match the breakpoint used in the stylesheets. */
const PHONE_LAYOUT_QUERY = "(max-width: 760px)";

export function isPhoneLayout() {
	return window.matchMedia(PHONE_LAYOUT_QUERY).matches;
}

/** Calls the listener with true or false whenever the window crosses into or out of the phone layout. */
export function onPhoneLayoutChange(listener) {
	window.matchMedia(PHONE_LAYOUT_QUERY).addEventListener("change", changeEvent => listener(changeEvent.matches));
}

export function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
