/*
	Escaping for the HTML snippets the UI builds with template strings.
	Plans arrive from links anyone can craft, so every string taken from a plan goes through escapeHtml.
*/

const HTML_ESCAPES = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;",
};

export function escapeHtml(value) {
	return String(value ?? "").replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}
