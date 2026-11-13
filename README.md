# TripMap

An interactive map for trip plans: numbered, colour-coded pins on a hiking map, a list of places, and a detail card per place with a photo, a description, a practical tip and links to the place's website, Mapy.cz, Google Maps and Wikipedia. You can filter by category and by day, see your GPS position and distances, and use it offline on the trail. The interface is in Czech.

Live at **https://lukas-hosek.github.io/trip-planner/**. The first visit opens a demo plan: 15 sights around Bad Schandau in Saxon Switzerland.

Plans are made with Claude. Plan a trip in a chat, then ask Claude to export it to the map. A [Claude skill](claude-skill/trip-map/SKILL.md) turns the plan into a JSON file and a link that opens it here.

## Using the app

- **Opening a plan:** open the link Claude gives you. The plan is saved in the browser, and the app reopens the last plan you used.
- **Moje plány:** tap the plan name at the top of the list. From there you can:
  - switch between stored plans, or delete them;
  - import a plan by pasting a link or JSON, or choosing a file;
  - share the open plan as a link, download its JSON, or download it for offline use.
- **Updating a plan:** a plan with the same name replaces the stored one, so you can just open the new link.
- **Installing:** use your browser's "Add to Home screen" / "Install app". On an iPhone, the home-screen app keeps its own storage, separate from Safari. Bring plans into it with **Moje plány → Importovat plán → Vložit ze schránky**.
- **Offline:**
  - The app, your plans, every map tile you've viewed and every photo you've opened stay available offline.
  - **Stáhnout pro offline** also downloads the map around every place (zoom 9–15) and all photos of the plan. That's a few hundred tiles.

## Creating plans with Claude

1. Zip the skill folder, so that `trip-map/` is the top folder inside the zip:

   ```sh
   python -m zipfile -c trip-map-skill.zip claude-skill/trip-map
   ```

2. In Claude, open **Settings → Capabilities**, turn on code execution and file creation, and upload the zip under **Skills**.
3. Plan a trip in a chat. When it's settled, ask Claude to export it ("Exportuj plán do mapy"). Claude does the following:
   - verifies the coordinates, websites and Wikipedia articles, and picks a photo on Wikimedia Commons;
   - writes the plan JSON;
   - runs `scripts/build_link.py` to validate it;
   - replies with a link to open it here.

The plan format is described in [claude-skill/trip-map/reference/plan-format.md](claude-skill/trip-map/reference/plan-format.md). In short:
- The plan has a `name`.
- `categories` and `tags` have colours, and a tag with `itinerary: true` marks a day of the plan.
- `places` hold coordinates, texts, the place's website, Wikipedia article URLs and a chosen Wikimedia Commons photo. If the photo can't be found, the app falls back to the lead image of the first Wikipedia article that has one.

A link carries the whole plan in its fragment: `#plan=` followed by the minified JSON, compressed with raw DEFLATE and encoded as base64url. The plan never reaches a server, and the 15-place demo makes a link of about 7 KB. To build one yourself:

```sh
python claude-skill/trip-map/scripts/build_link.py plans/saske-svycarsko.json --base-url https://localhost/
```

## Running it locally

Plain HTML, CSS and JavaScript modules, with no build step and no npm. [Leaflet](https://leafletjs.com) comes from a CDN.

ES modules don't load from `file://`, and GPS and the service worker need HTTPS or `localhost`, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

The service worker serves app files network-first, so edits show up on a normal reload.

## Deploying

GitHub Pages: in the repository's **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`. All paths are relative, so the app works under `/trip-planner/`.

## Structure

```
index.html            the single page
manifest.webmanifest  PWA manifest; icons/ holds the icons (PNGs rendered from icon.svg by tools/render_icons.py)
sw.js                 service worker: offline cache for the app, tiles, photos
plans/                the demo plan
css/                  theme tokens, layout, components, sidebar, map, detail card, plans dialog
js/
  main.js             entry point: picks the plan, builds the UI
  data/               plan format and validation, links, stored plans, the active plan
  state/              shared state with publish/subscribe
  map/                base map, pins, focusing, GPS location
  ui/                 sidebar, detail card, plans dialog, tags, toast, map notice, URL hash sync
  services/           photo lookup (Wikimedia Commons, Wikipedia), offline download
  utils/              HTML escaping, distance maths, media queries
claude-skill/trip-map/  the Claude skill: instructions, format reference, link builder
```

## Data sources

Map tiles from © OpenStreetMap contributors / OpenTopoMap and © Esri. Photos are loaded from Wikimedia Commons and Wikipedia. Demo place facts were checked in November 2026.
