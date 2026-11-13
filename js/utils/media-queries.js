/* Must match the breakpoint used in the stylesheets. */
const PHONE_LAYOUT_QUERY = "(max-width: 760px)";

export function isPhoneLayout() {
	return window.matchMedia(PHONE_LAYOUT_QUERY).matches;
}

export function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
