/*
	Sets the theme before the page is first drawn, so a theme the user picked never flashes the other one first.
	A classic script in <head>, because modules only run after the whole page has been parsed.
	js/ui/theme.js does the same once the app runs; keep the storage key, the values and the logic of both in sync.
*/
(() => {
	let themeChoice = null;
	try {
		themeChoice = localStorage.getItem("tripPlanner.theme");
	} catch {
		// Without storage the theme follows the system.
	}
	const isForced = themeChoice === "light" || themeChoice === "dark";
	const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	const theme = isForced ? themeChoice : systemTheme;
	document.documentElement.dataset.theme = theme;
	// The browser bar takes the colour of the theme-color meta whose media matches.
	for (const metaElement of document.querySelectorAll("meta[data-theme-color-for]")) {
		const metaTheme = metaElement.dataset.themeColorFor;
		metaElement.media = isForced ? (metaTheme === theme ? "all" : "not all") : `(prefers-color-scheme: ${metaTheme})`;
	}
})();
