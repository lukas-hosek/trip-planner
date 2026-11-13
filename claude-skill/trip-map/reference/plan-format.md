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
| `categories` | object | Kinds of places, keyed by an id you choose (lowercase, hyphens): `{ "castle": { "label": "Hrady", "color": "#575c93" } }`. Object order is the order of the filter buttons. |
| `tags` | object | Labels attached to places, keyed by id: `{ "sat": { "label": "Sobota", "itinerary": true } }`. Object order is the display order, so list days chronologically. |
| `places` | array | The places, in itinerary order. The position in the array is the number on the pin. |

### Category

| Field | Type | Meaning |
|---|---|---|
| `label` | string | Name of the category, for example "Vyhlídky". |
| `color` | `"#rrggbb"` | Pin and label colour. Pick from the palette below. |

### Tag

| Field | Type | Meaning |
|---|---|---|
| `label` | string | Text of the tag, up to about 30 characters. |
| `itinerary` | boolean, *optional* | `true` for a day of the itinerary ("Sobota", "Den 2"). Places with an itinerary tag get a dark ring on the map and appear under the "Náš plán" filter. |
| `color` | `"#rrggbb"`, *optional* | Text and outline colour (fill colour for itinerary tags). Without a colour, itinerary tags are dark and other tags grey. |

Filter buttons are shown for all itinerary tags and for every other tag used by at least two places.

## Place

| Field | Type | Meaning |
|---|---|---|
| `id` | string, *optional* | Short unique id (lowercase, hyphens), used in links to one place (`#bastei`). Made from the name if missing. |
| `name` | string | Name of the place. |
| `category` | string | Id of one of the plan's categories. |
| `lat`, `lng` | numbers | Latitude and longitude in decimal degrees (WGS84), 4–5 decimals. Verified, never guessed. |
| `tags` | array of strings, *optional* | Ids of the plan's tags, itinerary tag first. |
| `description` | string | 3–6 sentences about the place. A blank line (`\n\n`) starts a new paragraph. |
| `tip` | string, *optional* | Practical advice (getting there, parking, duration, tickets). Shown as "Jak na to". |
| `website` | URL, *optional* | The place's own website, for opening hours and prices: its official site or operator, a village's own site, the site of the inn or hut at a natural sight, or (for a lift, ferry or small museum without a site) its page on the official regional tourism portal. Shown as the first link, "Web". Leave it out when there's none; never use booking, review or aggregator sites. |
| `wikipedia` | array of URLs, *optional* | Wikipedia articles about the place, each checked to exist. Order: the plan's language first, then English, then the language of the country where the place is. For example, a Czech plan in Germany lists `https://cs.wikipedia.org/wiki/…`, then `https://en.wikipedia.org/wiki/…`, then `https://de.wikipedia.org/wiki/…`, leaving out any that don't exist. The app links to the first article. If the Commons photo can't be found, it shows the lead photo of the first article that has one. |
| `commons` | object | The place's photo on Wikimedia Commons; see below. Not shown as a link of its own. |
| `links` | array, *optional* | Extra links: `[{ "label": "Vstupenky", "url": "https://…" }]`. Links to Mapy.cz, Google Maps, Wikipedia and more photos are added automatically. |

### Commons photo

| Field | Type | Meaning |
|---|---|---|
| `file` | URL | The Commons file page of one good photo, copied exactly from Commons: `https://commons.wikimedia.org/wiki/File:…`. A real photo (not a map, drawing or logo), preferably landscape and at least about 1000 px wide. |
| `category` | URL, *optional* | The place's own Commons category, `https://commons.wikimedia.org/wiki/Category:…`. The "Další fotky" button opens it; without it, the button searches Commons for the place's name. |
| `subject` | string, *optional* | Only when Commons has no photo of the place itself and `file` shows a broader subject instead (the village, the town, the valley): its name, e.g. `"Bad Schandau"`. The photo credit then reads "Foto: Bad Schandau (Wikimedia Commons)". Leave `category` out in that case. |

## Colour palette

The colours are designed for a light background with white numbers on the pins; the app lightens them by itself in dark mode.

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
    "landmark": { "label": "Památky", "color": "#575c93" },
    "viewpoint": { "label": "Vyhlídky", "color": "#b0731c" }
  },
  "tags": {
    "saturday": { "label": "Sobota", "itinerary": true },
    "sunday": { "label": "Neděle", "itinerary": true },
    "free-entry": { "label": "Vstup zdarma", "color": "#2f7a4b" },
    "ticket": { "label": "Placený vstup", "color": "#5b6960" }
  },
  "places": [
    {
      "id": "prague-castle",
      "name": "Pražský hrad",
      "category": "landmark",
      "lat": 50.09083,
      "lng": 14.40056,
      "tags": ["saturday", "ticket"],
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
