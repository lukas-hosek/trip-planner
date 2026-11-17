# TripMap

An installable, offline-capable Leaflet map for trip plans, deployed to GitHub Pages at https://lukas-hosek.github.io/trip-planner/.

- Plans are JSON documents. Claude or ChatGPT writes them with the skill in `skills/trip-map/`. The app opens them from `#plan=…` links and keeps them in localStorage. The first visit shows a demo plan.
- The interface is in Czech, English or German. Plans keep the language they were written in.
- Plain HTML, CSS and native ES modules: **no build step, no npm**. Leaflet 1.9.4 loads from unpkg as a classic script (global `L`).

## Dev environment

ES modules, GPS and the service worker need HTTPS, so the dev server is Python's `http.server` over HTTPS with an mkcert certificate, at `https://localhost:8443/`.

- Start it only through the scripts or the launch configuration below, never `http.server` directly. If it is already running, they just print the URL.
- **Once it is up, leave it running.** The user stops it. Edited files show up on reload (the service worker fetches app files network-first).
- `.vscode/` is versioned, except `.vscode/server/`: the log, the PID file and the certificate with its private key.

### Linux

- New machine: run `.vscode/setup_dev.sh` once. It makes the browsers (including Chromium's `~/.pki/nssdb`) trust mkcert's CA, creates the certificate and creates the Playwright environment. Run it again if the certificate is missing.
- VS Code: F5 ("Dev server") runs `.vscode/run_server.sh --blocking` and opens the page in the integrated browser. Stop ends it. Ctrl+Shift+B ("Pack trip-map skill") writes `dist/trip-map-skill.zip`.
- Terminal: `.vscode/run_server.sh` starts the server in the background. `.vscode/stop_server.sh` stops it.
- Python is `python3`. There is no `python` command.
- Browser tests use Playwright for Python in `~/.venvs/tripmap` (`~/.venvs/tripmap/bin/python`), which has its own Chromium. `/usr/bin/chromium` also works through `executable_path`.

### Windows

TODO: fill in when working on Windows again.

- Start: `powershell -NoProfile -ExecutionPolicy Bypass -File .vscode/run_server.ps1`. Stop: the same with `.vscode/stop_server.ps1`.
- These scripts exist only on the Windows machine so far; commit them from there. They still serve on port 443, and need moving to 8443, a setup script, and a launch configuration and build task like the Linux ones.

## Conventions

- **Readable code first.** Write self-documenting code with descriptive, unabbreviated names. Add short comments only where the code isn't obvious. Comments say why, not how.
- **Reuse, don't copy.** Buttons, menus, rows, badges, sheets and the other UI elements are defined once in `css/components.css`, and shared markup helpers live in `js/ui/`. For a genuine variant, add a modifier. Feature stylesheets only position and size shared elements.
- Formatting follows `.editorconfig` (tabs, LF). Use double quotes and explicit `.js` extensions in imports. Code and comments are in English.
- **Plans are untrusted input:** anyone can craft a link. Every plan string or translated text that goes into HTML passes through `escapeHtml`. `plan-format.js` validates URLs and colours and limits sizes.
- **The Pages origin is shared** with other sites. The service worker deletes only its own `app-shell-v…` caches. The per-plan offline caches (`downloaded-plan:<plan key>`) belong to `js/services/offline-download.js`.

Two Claude Code skills in `.claude/skills/` cover the specialised work:

- `tripmap-lang`: all interface text lives in `languages/*.json`, never in `index.html` or `js/`. The skill has the file format and the translation conventions. Use it whenever you add or change text the app shows.
- `tripmap-icons`: icons are SVG files drawn as CSS masks, never inline `<svg>` or characters like "×". The skill is the drawing style guide. Use it for any new or changed icon.

## Keep in sync

| When you change… | …also update |
|---|---|
| App files (add, rename) | `APP_SHELL_FILES` in `sw.js`, and bump `APP_SHELL_VERSION` |
| Interface icon (`icons/ui/`) | `.icon--<name>` in `css/components.css`; `UI_ICON_NAMES` in `sw.js` (bump the version) and in `tools/icon-preview.js` |
| Place icon (`icons/places/`) | `PLACE_ICON_KEYS` in `js/data/place-icons.js`, `sw.js` (bump the version) and `build_link.py`; the icon table in `reference/plan-format.md`. Keys are part of the plan format: never rename or remove one |
| Plan format | `js/data/plan-format.js`; the skill (`SKILL.md`, `reference/plan-format.md`, `build_link.py`); `plans/spain-2026.json` |
| Plan limits (`MAXIMUM_…`) | `js/data/plan-format.js`, `build_link.py`, "Limits" in `reference/plan-format.md` |
| Link encoding, `MAXIMUM_PLAN_JSON_BYTES` | `js/data/plan-link.js`, `build_link.py` |
| Interface text | Every `languages/<code>.json`, then run `tools/check_translations.py` |
| New language | `languages/<code>.json` and `<code>.svg`, `languages/index.json`, `LANGUAGE_CODES` in `sw.js` (bump the version) |
| Theme storage key or logic | `js/apply-theme-before-paint.js`, `js/ui/theme.js`, `js/data/app-settings.js` |
| External host (tiles, API, CDN) | The Content-Security-Policy in `index.html` |

The skill files are under `skills/trip-map/` (`build_link.py` is in `scripts/`).

## Project structure

| Path | Contents |
|---|---|
| `index.html` | The single page, including the markup of the plans dialog |
| `js/main.js` | Entry point: language and theme first, then the plan (from a link, the last opened, or the demo). Switching plan, language or units reloads the page |
| `js/data/` | Plan validation, `#plan=` links, plan storage, the active plan and filters, place icon keys, app settings |
| `js/map/` | Base map and tiles, pins, focus, GPS |
| `js/ui/` | Sidebar, detail card, plans dialog and settings, menus, bottom sheets (on phones), shared markup helpers |
| `js/services/` | Photo lookup (Wikimedia Commons, Wikipedia), offline download |
| `js/language/`, `languages/` | `translate()` and locale formatting; one JSON file and one flag per language, plus `index.json` |
| `js/state/`, `js/utils/` | Publish/subscribe app state; small helpers (escaping, distances, units, storage) |
| `css/` | `theme.css` (tokens, dark theme), `components.css` (shared elements), one stylesheet per feature |
| `icons/` | App icons (PNGs rendered from `icon.svg` by `tools/render_icons.py`), `ui/` and `places/` SVGs |
| `sw.js`, `manifest.webmanifest` | Service worker (app shell, tile and photo caches) and install manifest |
| `plans/spain-2026.json` | The demo plan |
| `skills/trip-map/` | The plan-export skill for Claude and ChatGPT (ChatGPT expects `skills/<name>/` in the zip) |
| `tools/` | `check_translations.py`, `render_icons.py`, `icon-preview.html` (the whole icon set as the app draws it) |
| `.github/workflows/pages.yml` | Deploys to Pages and builds `trip-map-skill.zip`, which the in-app help links to |
| `.localdoc/` | Local notes and design handoffs, not versioned |
