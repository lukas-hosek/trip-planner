# Saské Švýcarsko: 15 míst

An interactive map of 15 sights around Bad Schandau in Saxon Switzerland (and the Pravčická brána just across the Czech border), built for a weekend trip. Each pin opens a card with a photo, a short description in Czech, a practical tip, winter opening notes and links to Mapy.cz, Google Maps and Wikipedia. On a phone, the "my location" button shows where you are and how far each place is.

Plain HTML, CSS and JavaScript modules, with no build step. [Leaflet](https://leafletjs.com) is loaded from a CDN.

## Running it

ES modules don't load from `file://`, so serve the folder over HTTP:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

The GPS location only works over HTTPS (or on `localhost`). To use it on a phone, host the folder somewhere with HTTPS, for example GitHub Pages.

## Structure

```
index.html
css/        theme tokens, layout, components, sidebar, map, detail card
js/
  main.js        entry point
  data/          places and offline map geometry
  state/         shared state with publish/subscribe
  map/           base map, pins, focusing, GPS location, offline fallback
  ui/            sidebar, detail card, toast, URL hash sync
  services/      Wikipedia photo lookup
  utils/         distance maths, media queries
```

To add or edit a place, change `js/data/places.js`.

## Data sources

Map tiles from © OpenStreetMap contributors / OpenTopoMap and © Esri. Photos are loaded from Wikipedia / Wikimedia Commons. The offline fallback map uses Natural Earth data. Place facts were checked in November 2026.
