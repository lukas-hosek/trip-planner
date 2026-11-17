---
name: tripmap-icons
description: Draws or edits an icon for TripMap (icons/places/ or icons/ui/) so it matches the rest of the set. Use when adding, changing or reviewing an icon, or when a plan needs a place icon the app doesn't have yet.
---

# TripMap icons

TripMap's icons are one family: thin, rounded outline drawings on a 24 px grid, all equally heavy and equally large. This skill is the style guide that keeps them that way. Every rule below comes from the existing set; when in doubt, open a similar icon and copy how it is built.

Two folders, one style:

- `icons/places/<key>.svg`: place icons, drawn **white on the category colour**: 16 px inside the map pin, 15 px in the list badge. Plans refer to them by key.
- `icons/ui/<name>.svg`: interface icons, drawn **in the text colour** at 14–24 px (menu, close, share…).

The app draws every icon as a CSS mask (`.icon` in `css/components.css`). Only the shape counts; colours in the file are ignored. So an icon must work as a pure silhouette of its strokes.

## Format

Start from `template.svg` next to this file. Every file looks exactly like this:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
	<path d="…"/>
</svg>
```

- `viewBox="0 0 24 24"`, no `width`/`height`.
- **Outline only**: `fill="none"`, `stroke="currentColor"`, round caps and joins. Nothing is filled; a "solid" area is suggested by its outline.
- **One `<path>`** holding all subpaths. No `<circle>`, `<rect>`, `<g>`, transforms, ids, classes, `<text>`, `<style>`, gradients or clip paths.
- **Absolute coordinates on a 0.5 grid** for start points and corners (`M12 3`, `L4.5 18`). Relative segments are fine for repeated shapes (`h18`, `a2 2 0 0 1 4 0`).
- **No editor metadata.** Inkscape, Illustrator and Figma add namespaces (`inkscape:`, `sodipodi:`, `xmlns:xlink`), `<metadata>`, `<defs>`, ids and styles. Strip all of it, so the file stays a plain mask and diffs cleanly. Tabs for indentation, LF, final newline.

## Stroke weight

The weight is set by the size the icon is drawn at, so that all icons *look* equally heavy on screen:

| Where | Drawn at | `stroke-width` |
|---|---|---|
| Place icons (pin, badge) | 15–16 px, white on colour | **2.4** |
| Interface icons | 18–24 px | **2** |
| Chevrons | 18 px | 2.2 |
| Interface icons drawn at ≤ 14 px (the `offline` status) | 14 px | 2.4 |

The one deliberate exception is `more` (⋯) at **3.2**: its dots are zero-length strokes, and the stroke width *is* the dot size.

Never vary the weight inside one icon.

## Live area and optical size

- Keep every stroke within **2–22** on both axes (at least 2 px margin; the stroke's own half-width may reach 1 px further).
- Icons must look the same size next to each other, which means different shapes get different extents:
  - **Round** shapes (wheel, sun, circle signs) reach about **18 px** across: `M3 12a9 9 0 1 0 18 0…`.
  - **Square or upright** shapes (buildings, frames, cups) take about **16 px**: `M4 4h16v16H4Z` is the largest square.
  - **Wide** shapes (car, ferry, waves) use the full width (3–21) and less height.
  - **Tall, thin** shapes (a tower, a mast) may use the full height (2.5–21.5).
- Centre the visual weight, not the bounding box: a shape that is heavy at the bottom sits slightly higher.

## Construction idioms

Build icons the way the set already does:

- **Circles** are two arcs inside the path: `M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0` (start at the left edge, radius r, `2r` across). Small circles the same way: `M5.5 11.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0`.
- **Dots** are zero-length strokes: `M12 7.5h.01`. The round cap turns them into a dot as wide as the stroke.
- **Ground line**: buildings and landscapes stand on `y = 21`, often with an explicit ground stroke `M3 21h18` (`castle`, `church`, `landmark`, `city`).
- **Closed outlines** end with `Z`, so the corner joins cleanly.
- **Rounded corners** of frames use radius 2–3 (`a3 3 0 0 1 3-3`), never sharp 90° corners on large boxes.
- **Views**: straight-on front or side views only, never perspective or isometric.
- **Detail**: only what reads at 16 px. As a rule of thumb, at most about 6 subpaths, and never two parallel strokes closer than 2 px apart (they merge into a blob at small size).

## Meaning

- One clear concept per icon, recognisable without its label. Prefer the object people associate with the place (a fork and knife for a restaurant, a tent for camping) over an abstract sign.
- No letters or digits, no flags, no brand marks or logos, no emoji look-alikes, no religious symbols beyond the established ones (`church` has a cross because it means a church).
- It must not be mistaken for an existing icon. Close pairs to watch: `landmark` / `museum` / `temple`, `astronomy` / `observatory`, `water` / `pool`, `park` / `mountain`, `info` / `star`.
- For place icons, first ask whether an existing key already covers the idea. A new icon is worth it only for a kind of place that many trips have.

## Names

- Lowercase English, one word if possible (`ferry`, `ruins`); kebab-case otherwise (`chevron-down`).
- Place icons are named after the **kind of place** (`castle`, `beach`), interface icons after the **action or object** (`share`, `close`).
- **Place keys are part of the plan format: never rename or remove one.** Stored plans and shared links refer to them. To improve an icon, redraw the file and keep the key.

## Checklist for a new icon

**Place icon** `<key>`:

1. `icons/places/<key>.svg`, following everything above.
2. `PLACE_ICON_KEYS` in `js/data/place-icons.js`.
3. `PLACE_ICON_KEYS` in `sw.js` (the precache list; bump `APP_SHELL_VERSION`).
4. `PLACE_ICON_KEYS` in `skills/trip-map/scripts/build_link.py`.
5. The icon table in `skills/trip-map/reference/plan-format.md`: the key and a short English description of what the drawing shows ("a tent", "binoculars"), so the agent writing plans can pick it without seeing it.

**Interface icon** `<name>`:

1. `icons/ui/<name>.svg`.
2. `.icon--<name> { mask-image: url("../icons/ui/<name>.svg"); }` in `css/components.css`, next to the others.
3. `UI_ICON_NAMES` in `sw.js` (bump `APP_SHELL_VERSION`) and in `tools/icon-preview.js`.

Then check it visually.

## Visual check

1. Start the dev server (`.vscode/run_server.ps1` on Windows, `.vscode/run_server.sh` on Linux; see CLAUDE.md) if it isn't running.
2. Open `tools/icon-preview.html` at the URL the script prints (`https://localhost:8443/tools/icon-preview.html`). It shows every place icon in a pin, in a badge and at 24 px, and every interface icon at 18 and 24 px on a light and a dark panel.
3. Compare the new icon with its neighbours:
   - Same weight? The strokes look as heavy as the others in the pin.
   - Same size? Its extent matches icons of a similar shape.
   - Readable in the 16 px pin? Squint: it should still say what it is.
   - Not confused with another icon?
4. Open the file on its own in a browser too: it must show just the drawing, in black.

Quick format check from the repository root; each command should print nothing:

```bash
# Place icons without the place stroke width
rg --files-without-match 'stroke-width="2.4"' icons/places
# Files with more or fewer than one path
rg -c '<path' icons/places icons/ui | rg -v ':1$'
# Files with a fill other than none
rg -l 'fill="[^n]' icons/places icons/ui
```
