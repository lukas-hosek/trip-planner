# Trip plan format (version 1)

One JSON object per trip. Unknown fields are ignored. Fields marked *optional* can be left out.

## Plan

| Field | Type | Meaning |
|---|---|---|
| `format` | `"trip-plan"` | Always this value. |
| `version` | `1` | Format version. |
| `name` | string | Trip name, shown at the top of the app, for example "Saské Švýcarsko" or "Řím 2027". **It identifies the plan**: a plan with the same name replaces the stored one. |
| `description` | string, *optional* | One or two sentences under the name: dates, the idea of the trip. |
| `note` | string, *optional* | Small print at the bottom of the list: when facts were checked, caveats. |
| `categories` | object | Kinds of places, keyed by an id you choose (lowercase, hyphens): `{ "castle": { "label": "Hrady", "color": "#575c93", "icon": "castle" } }`. Object order is the order of the filter buttons. |
| `tags` | object | Labels attached to places, keyed by id: `{ "sat": { "label": "Sobota", "itinerary": true } }`. Object order is the display order, so list days chronologically. |
| `places` | array | The places, in itinerary order. Places with an itinerary tag are numbered 1, 2, 3… in this order, on the pin and in the list; the other places show their icon instead. |

### Category

| Field | Type | Meaning |
|---|---|---|
| `label` | string | Name of the category, for example "Vyhlídky". |
| `color` | `"#rrggbb"` | Pin and label colour. Pick from the palette below. |
| `icon` | string, *optional* | Key of one of the app's icons (see [Icons](#icons)), shown in white on the pins of places outside the itinerary. A category whose id is itself an icon key (`"castle"`) gets that icon without it. |

### Tag

| Field | Type | Meaning |
|---|---|---|
| `label` | string | Text of the tag, up to about 30 characters. |
| `itinerary` | boolean, *optional* | `true` for a day of the itinerary ("Sobota", "Den 2"). Its places are numbered and ringed on the map. Always gets a filter button. |
| `filterable` | boolean, *optional* | `true` gives the tag a filter button (default `false`); see SKILL.md step 8. |
| `color` | `"#rrggbb"`, *optional* | Text and outline colour (fill colour for itinerary tags). Without a colour, itinerary tags are dark and other tags grey. |

## Place

| Field | Type | Meaning |
|---|---|---|
| `id` | string, *optional* | Short unique id (lowercase, hyphens), used in links to one place (`#bastei`). Made from the name if missing. |
| `name` | string | Name of the place. |
| `category` | string | Id of one of the plan's categories. |
| `icon` | string, *optional* | Icon key for this place only, when it differs from its category's: an airport in "Doprava" (`"airport"`), a church among "Památky" (`"church"`). |
| `lat`, `lng` | numbers | Latitude and longitude in decimal degrees (WGS84). |
| `tags` | array of strings, *optional* | Ids of the plan's tags, itinerary tag first. |
| `description` | string | 3–6 sentences about the place. A blank line (`\n\n`) starts a new paragraph. |
| `tip` | string, *optional* | Practical advice, shown under "Practical tips". |
| `website` | URL, *optional* | The place's own website (SKILL.md step 6), shown as the first link. |
| `wikipedia` | array of URLs, *optional* | Wikipedia articles (`https://xx.wikipedia.org/wiki/…`) in the order of SKILL.md step 4. |
| `commons` | object | The place's photo on Wikimedia Commons; see below. |
| `links` | array, *optional* | Extra links: `[{ "label": "Vstupenky", "url": "https://…" }]`. Links to Mapy.cz, Google Maps, Wikipedia and more photos are added automatically. |

### Commons photo

| Field | Type | Meaning |
|---|---|---|
| `file` | URL | A Commons file page: `https://commons.wikimedia.org/wiki/File:…`. |
| `category` | URL, *optional* | The place's own Commons category, `https://commons.wikimedia.org/wiki/Category:…`, opened by the "more photos" button. |
| `subject` | string, *optional* | Only when `file` shows a broader subject (village, town, valley): its name, e.g. `"Bad Schandau"`, used in the photo credit. |

## Icons

Places outside the itinerary show an icon instead of a number. A plan names one by its key. A place's icon is its own `icon`, else its category's `icon`, else the category id if that is a key, else a plain dot.

| Key | The icon shows |
|---|---|
| `lodging` | a bed with a pillow |
| `camping` | a tent |
| `restaurant` | a fork and a knife |
| `cafe` | a steaming cup |
| `bar` | a wine glass |
| `market` | a shopping basket |
| `airport` | a plane seen from above |
| `train` | the front of a train |
| `bus` | the front of a bus |
| `ferry` | a boat with a cabin |
| `car` | the front of a car |
| `bike` | a bicycle |
| `landmark` | a classical building with columns |
| `museum` | a framed picture |
| `castle` | a castle wall with battlements and a gate |
| `church` | a church with a cross |
| `temple` | a pagoda with tiered roofs |
| `ruins` | broken columns |
| `event` | a ticket |
| `conference` | a presentation screen with a chart |
| `mountain` | mountain peaks |
| `trail` | a signpost with two arrows |
| `viewpoint` | binoculars |
| `water` | waves |
| `beach` | a beach umbrella |
| `park` | a tree |
| `ski` | a snowflake |
| `zoo` | a paw print |
| `amusement` | a Ferris wheel |
| `pool` | a pool ladder over water |
| `city` | city buildings |
| `astronomy` | a sun with rays |
| `observatory` | a telescope on a tripod |
| `info` | an "i" in a circle |
| `star` | a star |

## Limits

`build_link.py` reports these. The app refuses a plan with more than 300 places, 50 categories, 100 tags or 1 MB of JSON. Beyond the following it shortens the plan:


- per place: 20 tags, 10 Wikipedia articles, 10 extra links (the first ones are kept);
- names of the plan and of places, and `commons.subject`: 150 characters; labels and ids: 80; the plan's `description` and `note`: 2,000; a place's `description` and `tip`: 5,000 (longer texts are cut);
- URLs: 2,000 characters (a longer one is ignored).

## Colour palette

Categories (pick distinct ones):

| Colour | Hex |
|---|---|
| Ochre | `#b0731c` |
| Rust | `#9c4a2f` |
| Indigo | `#575c93` |
| Teal | `#2b7c7f` |
| Forest green | `#2f7a4b` |
| Plum | `#8a4f7d` |
| Steel blue | `#4a6fa5` |
| Olive | `#7a6a2e` |
| Crimson | `#a83a4a` |

Info tags (colour by meaning):

| Meaning | Hex | Example |
|---|---|---|
| Good news, open | `#2f7a4b` | "Otevřeno celý rok" |
| Check first, limited | `#a8641a` | "V zimě jen o víkendech" |
| Closed, not possible | `#b03a3a` | "Vyhlídka zavřená" |
| Neutral info | `#5b6960` | "Vstup 12 €" |

Itinerary tags usually have no colour.

## Example

```json
{
  "format": "trip-plan",
  "version": 1,
  "name": "Praha na víkend",
  "description": "Sobota a neděle v historickém centru, pěšky z Hradčan přes Malou Stranu na Petřín.",
  "note": "Otevírací doby ověřené v listopadu 2026.",
  "categories": {
    "landmark": { "label": "Památky", "color": "#575c93", "icon": "landmark" },
    "viewpoint": { "label": "Vyhlídky", "color": "#b0731c", "icon": "viewpoint" }
  },
  "tags": {
    "saturday": { "label": "Sobota", "itinerary": true },
    "sunday": { "label": "Neděle", "itinerary": true },
    "free-entry": { "label": "Vstup zdarma", "color": "#2f7a4b", "filterable": true },
    "ticket": { "label": "Placený vstup", "color": "#5b6960" }
  },
  "places": [
    {
      "id": "prague-castle",
      "name": "Pražský hrad",
      "category": "landmark",
      "lat": 50.09083,
      "lng": 14.40056,
      "tags": ["saturday", "free-entry"],
      "description": "Největší hradní komplex na světě a sídlo prezidenta. Uvnitř stojí katedrála svatého Víta, Starý královský palác a Zlatá ulička.\n\nStřídání stráží před hlavní branou je každou celou hodinu, v poledne s fanfárami.",
      "tip": "Nejlepší je přijít hned po otevření. Areál je zdarma, vnitřní expozice jsou na okruhovou vstupenku.",
      "website": "https://www.hrad.cz/",
      "wikipedia": ["https://cs.wikipedia.org/wiki/Pražský_hrad", "https://en.wikipedia.org/wiki/Prague_Castle"],
      "commons": {
        "file": "https://commons.wikimedia.org/wiki/File:Hradschin_Prag.jpg",
        "category": "https://commons.wikimedia.org/wiki/Category:Prague_Castle"
      }
    },
    {
      "id": "charles-bridge",
      "name": "Karlův most",
      "category": "landmark",
      "lat": 50.08647,
      "lng": 14.41144,
      "tags": ["saturday", "free-entry"],
      "description": "Gotický kamenný most přes Vltavu z let 1357–1402, dlouhý 516 metrů. Zdobí ho 30 soch a sousoší, dnes většinou kopií.",
      "tip": "Ráno před osmou je skoro prázdný.",
      "wikipedia": ["https://cs.wikipedia.org/wiki/Karlův_most", "https://en.wikipedia.org/wiki/Charles_Bridge"],
      "commons": {
        "file": "https://commons.wikimedia.org/wiki/File:Prague_07-2016_View_from_Petrinska_Tower_img2.jpg",
        "category": "https://commons.wikimedia.org/wiki/Category:Charles_Bridge"
      }
    },
    {
      "id": "petrin-tower",
      "name": "Petřínská rozhledna",
      "category": "viewpoint",
      "lat": 50.08353,
      "lng": 14.39509,
      "tags": ["sunday", "ticket"],
      "description": "Ocelová rozhledna z roku 1891, volně inspirovaná Eiffelovou věží. Na vyhlídkovou plošinu vede 299 schodů.",
      "tip": "Nahoru lanovkou z Újezdu, dolů pěšky sady.",
      "website": "https://prague.eu/cs/objevujte/petrinska-rozhledna/",
      "wikipedia": ["https://cs.wikipedia.org/wiki/Petřínská_rozhledna", "https://en.wikipedia.org/wiki/Petřín_Lookout_Tower"],
      "commons": {
        "file": "https://commons.wikimedia.org/wiki/File:Petřínskározhledna2016.jpg",
        "category": "https://commons.wikimedia.org/wiki/Category:Petřínská_rozhledna"
      }
    }
  ]
}
```
