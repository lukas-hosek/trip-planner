# TripMap

Installable, offline-capable Leaflet map for trip plans. Plans are JSON documents, written by Claude or ChatGPT through the skill in `skills/trip-map/`, opened from `#plan=…` links and stored in localStorage. The first visit shows a demo plan (Spain 2026: 21 places from Bilbao to Barcelona, in English). The interface is in Czech, English or German (the browser's language, else English; changeable in the app settings), and all its text comes from the language files in `languages/`. Plans keep the language they are written in. Code and comments are in English. Deployed to GitHub Pages at `https://lukas-hosek.github.io/trip-planner/`.

Plain HTML + CSS + native ES modules, **no build step and no npm**. Leaflet 1.9.4 comes from unpkg as a classic script (global `L`). ES modules don't load from `file://`, and GPS and the service worker need HTTPS or localhost.

## Dev server

- Serves the repo over HTTPS at `https://localhost/`, on the default HTTPS port 443, using Python's `http.server` and a locally trusted localhost certificate.
- Always use the scripts and never run `http.server` directly:
  - Start: `powershell -NoProfile -ExecutionPolicy Bypass -File .vscode/run_server.ps1`. It starts the server in the background and returns. If the server is already up, it only prints the URL.
  - Stop: `powershell -NoProfile -ExecutionPolicy Bypass -File .vscode/stop_server.ps1`.
- **Once the server is up, leave it running.** Don't stop or restart it. The user shuts it down. Edits to files show up on reload, with no restart needed (the service worker serves app files network-first).
- Logs: `.vscode/server/requests.log`. Certificates and the PID file are also in `.vscode/server/`.

## Structure

- `index.html` is the single page. It loads `css/*`, `js/apply-theme-before-paint.js` (a classic script in `<head>`, so a chosen theme never flashes) and `js/main.js`, and holds the markup of the plans dialog ("My plans", with its import, help and app settings views). Its text is only `data-translate*` keys.
- On phones the map fills the screen under the header; the place list and the detail card are bottom sheets over it (`js/ui/bottom-sheet.js`), and the filter row expands over the map.
- `sw.js` is the service worker (app shell precache, caches for tiles, photos and photo lookups). `manifest.webmanifest` and `icons/` make the app installable; the PNG icons are rendered from `icons/icon.svg` by `tools/render_icons.py`.
- `icons/ui/` and `icons/places/` hold one editable SVG per icon (interface icons, and the place icons that plans name by key). The app draws them as CSS masks (`.icon` in `components.css`), so they take the text colour. `tools/icon-preview.html` shows the whole set as the app draws it.
- `plans/spain-2026.json` is the demo plan.
- `languages/` holds the interface text: `index.json` (the languages and the fallback, English), one `<code>.json` per language and its flag `<code>.svg`. `tools/check_translations.py` checks the files against each other and against the keys the app uses.
- `css/` holds `theme.css` (design tokens, the dark theme under `[data-theme="dark"]`, and the dark-mode lift of plan colours passed as `--plan-color`), layout, `components.css` (the shared buttons, select buttons, icon buttons, menus, rows, boxed lists, segmented controls, theme swatches, flags, sheets, badges, chips and tags), and the sidebar, map, detail-card and plans-panel styles.
- `js/main.js` is the entry point. It loads the language and applies the theme first, then picks the plan (link, last opened, or demo) and wires the map and UI together. Switching plans, the language or the units reloads the page.
- `js/data/`: `plan-format.js` validates and normalizes plans; `plan-link.js` encodes and decodes `#plan=` links; `plan-store.js` keeps the stored plans; `active-plan.js` holds the open plan and the filter logic; `place-icons.js` lists the place icon keys; `app-settings.js` stores the theme, language and unit choices.
- `js/language/translations.js` loads the language files and provides `translate()`, `translatePage()` and locale-aware date and number formatting.
- `js/state/app-state.js` is shared state with publish/subscribe.
- `js/map/` covers the base map and tiles, pins, focusing on the selected place, and GPS location.
- `js/ui/` covers the sidebar, detail card, plans dialog and its app settings view (`settings-panel.js`), drop-down menus (`menu.js`), the theme (`theme.js`), bottom sheets, tags and place badges, toast, map notice, and URL hash sync.
- `js/services/` holds the photo lookup (the plan's Wikimedia Commons file, else a Wikipedia lead image) and the offline download of tiles and photos.
- `js/utils/` holds HTML escaping, distance maths, metric/imperial formatting (`units.js`), localStorage access and media queries.
- `skills/trip-map/` is the plan-export skill for Claude and ChatGPT: `SKILL.md`, `reference/plan-format.md`, and `scripts/build_link.py` (validates a plan, then prints its link or writes a share card from `scripts/plan-card-template.html`, which the assistant shows in the chat instead of the long link). The folder is named `skills/` because ChatGPT expects `skills/<name>/` inside the zip.
- `.claude/skills/` holds Claude Code skills for this repo, not part of the skill zip: `tripmap-icons/` (the style guide for drawing icons) and `tripmap-lang/` (the language file format and the translation conventions).
- `.localdoc/` holds local working documents (design handoffs, notes). It is not versioned.
- `.github/workflows/pages.yml` deploys to GitHub Pages (Source: GitHub Actions) and builds `trip-map-skill.zip` from the skill; the help text ("How do I create a plan?", `help.skillHtml` in `languages/*.json`) links to that zip.

## Keep in sync

- **New or renamed app files** must be added to `APP_SHELL_FILES` in `sw.js`; bump `APP_SHELL_VERSION` when the list changes. That includes a new interface icon (`UI_ICON_NAMES` in `sw.js`, plus its `.icon--<name>` class in `components.css`).
- **A new place icon** is a file in `icons/places/` and a key in `PLACE_ICON_KEYS` in `js/data/place-icons.js` and `sw.js`, in `build_link.py`, and in the icon table of `reference/plan-format.md` (with a short description of the drawing). Keys are part of the plan format: never rename or remove one.
- **A plan format change** touches `js/data/plan-format.js`, the skill (`reference/plan-format.md`, `SKILL.md`, `scripts/build_link.py`) and the demo plan. The link encoding and the plan size limit (`MAXIMUM_PLAN_JSON_BYTES`) live in both `plan-link.js` and `build_link.py`.
- **The plan limits** (`MAXIMUM_…` counts and text lengths) live in `js/data/plan-format.js`, `build_link.py` and the "Limits" section of `reference/plan-format.md`.
- **Per-plan download caches** (`downloaded-plan:<plan key>`) are written and deleted by `js/services/offline-download.js`; a summary entry written at the end of a download marks the plan as offline. The service worker only reads them. On activation it deletes nothing but its own old `app-shell-v…` caches, because the origin is shared with other GitHub Pages sites.
- **A new external host** (tiles, fonts, an API, a CDN) must be added to the Content-Security-Policy in `index.html`, or the browser blocks it.
- **Interface text** lives only in `languages/*.json`: a new or changed text gets its key in every language file, and the code calls `translate()` where the text is used (never in a module-level constant). Follow the `tripmap-lang` skill (`.claude/skills/tripmap-lang/`), and run `python tools/check_translations.py`. The interface always addresses the user formally (*vy* in Czech, *Sie* in German).
- **A new language** is `languages/<code>.json` and `languages/<code>.svg`, an entry in `languages/index.json`, and its code in `LANGUAGE_CODES` in `sw.js` (bump `APP_SHELL_VERSION`). Flags are `<img>` files in their own colours, the one exception to icons being masks.
- **The theme storage key and logic** live in both `js/apply-theme-before-paint.js` and `js/ui/theme.js` (plus the key in `app-settings.js`).
- Plans come from links anyone can craft: every plan string rendered into HTML goes through `escapeHtml`, and URLs and colours are validated and sizes limited in `plan-format.js`. Translated text that goes into an HTML template goes through `escapeHtml` too (`escapeHtml(translate(key, rawParameters))`).

## Conventions

- Follow `.editorconfig`: tabs, LF, UTF-8, final newline (Markdown uses 2 spaces).
- Use double quotes and explicit `.js` extensions in imports.
- Use clear, self-documenting code
- Use descriptive, unabbreviated names.
- Use short comments in non-trivial sections of the code. The comments should explain **why, not how**
- **Reuse UI elements.** Buttons, icon buttons, menus, list rows, badges and sheets have one shared definition in `css/components.css`, and shared markup helpers live in `js/ui/` (e.g. `tags.js`, `place-badge.js`). Use those, and add a modifier for a genuine variant instead of styling a new copy in a feature stylesheet. Feature stylesheets only position and size shared elements.
- **Icons** are SVG files drawn as `.icon` masks, never inline `<svg>` or characters like "×". New or changed icons follow the `tripmap-icons` skill (`.claude/skills/tripmap-icons/`).
