---
name: tripmap-lang
description: Writes or edits TripMap's interface text and its translations (languages/). Use when adding or changing any text the app shows, adding a language, or reviewing a translation.
---

# TripMap languages

Every text TripMap shows comes from a language file in `languages/`. The code holds only keys. Nothing in `index.html` or `js/` is written in a human language, apart from brand names, comments and the console. A language can be edited by hand, or added, without touching the code.

The interface language is separate from the plans. A plan's own texts (names, descriptions, tags) stay in the language they were written in.

## Files

```
languages/index.json      which languages exist, and the fallback
languages/<code>.json     the texts of one language
languages/<code>.svg      its flag, shown in the language menu
```

`languages/index.json`:

```json
{
	"fallback": "en",
	"languages": [
		{ "code": "cs", "name": "Čeština" },
		{ "code": "en", "name": "English", "locale": "en-GB" },
		{ "code": "de", "name": "Deutsch" }
	]
}
```

- `code` names both files and is matched against the browser's languages. It is a language tag: `de`, or `pt-BR` for a regional variant.
- `name` is the language's own name, as its speakers write it ("Deutsch", not "German"). The menu lists the languages in this order.
- `locale` (optional, defaults to `code`) is what `Intl` uses for dates, numbers, units and plural rules. English uses `en-GB`, to match its British flag and spelling.
- `fallback` is used in two cases:
  - nothing else matches the browser
  - a key is missing from another language

### How the app picks the language

1. The language chosen in the app settings, if it is still listed.
2. Otherwise, the browser's languages (`navigator.languages`) in the user's order. Each is tried as an exact `code`, then as its base language (`de-AT` → `de`).
3. Otherwise, the fallback.

Missing texts fall back one string at a time:
- **A key the chosen language lacks:** that one string appears in the fallback language. The console warns once per key.
- **A key the fallback lacks too:** the key itself appears (`plans.menu.share`).
- **A broken or missing language file:** the app runs fully in the fallback language, and the console names the file.

## Translation file format

```json
{
	"plans": {
		"title": "Moje plány",
		"placeCount": {
			"one": "{count} místo",
			"few": "{count} místa",
			"other": "{count} míst"
		},
		"deleted": "Plán „{name}“ je smazaný.",
		"menu": {
			"share": "Sdílet odkaz"
		}
	}
}
```

### Keys

- Groups follow the app's areas: `common`, `app`, `startup`, `planFormat`, `planLink`, `plan`, `sidebar`, `detail`, `map`, `location`, `notice`, `plans`, `import`, `help`, `settings`. The code addresses a text by its dotted key, e.g. `plans.menu.share`.
- Every segment is camelCase English and says what the text is for (`downloadNeedsConnection`), not what it says.
- Every file has the same keys in the same order as the fallback file. That keeps them easy to compare side by side.
- Text the app needs in several places has one key. For example, `common.close` serves every × button.

### Placeholders

`{name}` is replaced with a value the code passes in.
- Number values are formatted for the language ("1 234" in Czech, "1,234" in English).
- Coordinates and URLs are passed as text, so their decimal point stays.

Every translation of a key uses the same placeholders. The order may change to suit the language, but none may be dropped or renamed.

### Plurals

A text that depends on a count is an object with one form per plural category:

- **The browser decides the category.** The file never says which numbers belong to which category: the browser's built-in Unicode CLDR rules (`Intl.PluralRules`) decide that. The file only supplies the wording for each category the language uses.
- **Czech:** `one` (1), `few` (2–4), `many` (decimals only, so not needed for counts), `other` (0, 5 and up).
- **English and German:** `one` (1) and `other` (everything else).
- **`other` is required.** A category the entry lacks falls back to `other` in the same language. An entry may therefore have only `other` when the wording doesn't change (Czech `plans.downloadPartial`).
- **A new language:** look up its categories in the [CLDR plural rules chart](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html). Rules such as Polish `few` (2–4 and 22–24, but not 12–14) then need no code.
- **The count:** the code passes it as `count`, so plural texts use `{count}` for the number.

A plural object holds only category names as keys. Never name a group's key `one`, `few`, `other`, and so on.

### Markup

Keys ending in `Html` (only the help paragraphs, `help.*Html`) may contain `<a>` and `<strong>`. The app inserts them as HTML. They take no placeholders, so nothing from a plan can ever get into that HTML. Every other text is plain text: never put markup into it.

### URL templates

`detail.links.mapyUrl` is a URL with placeholders, because the map service differs per language:
- Czech uses Mapy.cz.
- Other languages use Mapy.com (`/en/`, `/de/`).

Keep the parameters `q`, `x`, `y`, `z` as they are.

### JSON style

Tabs, UTF-8, LF, a final newline. Write the real characters ("„“", "…", "→"), not `\u` escapes.

## Conventions

- **Always formal.** Czech uses *vy* ("Klikněte…", "Zkontrolujte…"), German *Sie* ("Klicken Sie…", "Prüfen Sie…"), never *ty* or *du*. English is plain and polite.
  - The one exception is an example of what the *user* writes to Claude (the help's "Exportuj plán do mapy" / "Exportiere den Plan in die Karte"). That is the user speaking, not the app.
- **British English** ("colour", "favourite"), dates as `en-GB` writes them.
- **Quotation marks around plan names** follow the language:
  - Czech and German: „…“
  - English: “…”
  - JSON field names quoted in validation messages ("name", "places", "lat", "lng") take the language's quotes, but their text stays literal, because they are field names.
- **`…`** (one character, not three dots) ends a label that leads to more input ("Importovat plán…", "Choose file…") and a running state ("Načítám fotku…").
- **Percent:** "45 %" with a space in Czech and German, "45%" in English.
- **Short labels where space is tight:**
  - the settings rows (Vzhled, Jazyk, Jednotky) and their 190 px controls
  - filter chips
  - menu items
  - the offline status in the plan list
- **Brand names stay** as they are: TripMap, Claude, Wikimedia Commons, OpenStreetMap, Google Maps. The code adds the " · " separators and the "↗" link arrows, so they never appear in translations, except where a separator is part of a template ("V plánu · {label}").
- **Labels quoted inside other texts** must match the quoted label's own translation exactly:
  - "Moje plány → ⋯ → Stáhnout offline data" in `map.offlineNotice`
  - "Moje plány → Importovat plán" in `startup.iosHint`
  - "Importovat plán → Vložit ze schránky" in `help.iphoneHtml`
  - Claude's own menu path in `help.skillHtml` uses the labels claude.ai shows in that language.

### Glossary

Use the same word for the same thing everywhere.

| Concept | cs | en | de |
|---|---|---|---|
| the plans dialog | Moje plány | My plans | Meine Pläne |
| the itinerary filter | Náš plán | Our plan | Unser Plan |
| plan | plán | plan | Plan |
| place | místo | place | Ort |
| tag (plan label) | štítek | tag | Schlagwort |
| category | kategorie | category | Kategorie |
| offline data | offline data | offline data | Offline-Daten |
| import a plan | Importovat plán | Import plan | Plan importieren |
| paste from clipboard | Vložit ze schránky | Paste from clipboard | Aus Zwischenablage einfügen |
| download offline data | Stáhnout offline data | Download offline data | Offline-Daten herunterladen |
| remove offline data | Uvolnit offline data | Remove offline data | Offline-Daten entfernen |
| app settings | Nastavení aplikace | App settings | App-Einstellungen |
| appearance (theme) | Vzhled | Appearance | Darstellung |
| automatic / light / dark | Automaticky / Světlý / Tmavý | Automatic / Light / Dark | Automatisch / Hell / Dunkel |
| language | Jazyk | Language | Sprache |
| units: metric / imperial | Jednotky: Metrické / Imperiální | Units: Metric / Imperial | Einheiten: Metrisch / Imperial |
| pin (map marker) | špendlík | pin | Stecknadel |
| practical tips (place) | Jak na to | Practical tips | Praktische Tipps |

A new language adds a column.

## In the code

- `translate(key, parameters)` from `js/language/translations.js` returns the text. Call it where the text is used, never in a module-level constant: the language is loaded at start-up, after the modules are imported.
- **HTML templates:** a translated text goes through `escapeHtml(translate(key, rawParameters))`. Escape the result, never the parameters; escaping them first would escape them twice.
- **Static text in `index.html`:** these attributes carry the keys, and `translatePage()` fills them in at start-up.
  - `data-translate="key"`: the element's text. The element must hold nothing else; put the text in its own `<span>` next to an icon.
  - `data-translate-html="…Html"`
  - `data-translate-aria-label="key"`
  - `data-translate-title="key"`
- **Plural texts:** pass `{ count }`.
- **Dates, numbers and units:** `formatDate()` and `formatNumber()` from the same module. Distances use `js/utils/units.js`. Never hard-code a decimal comma or a date order.
- **New interface text:** a new key in **every** language file, in the same place. If you can't translate it well, still add it in the fallback (English), so the other languages show English instead of the key.

## Adding a language

1. `languages/<code>.json`: a copy of the fallback file with every text translated, keeping the keys and their order.
2. `languages/<code>.svg`: the flag.
   - 3:2 or 2:1, with `preserveAspectRatio="none"`, so it fills the 24 × 16 px slot.
   - Plain shapes only; see `cs.svg` and `en.svg`.
   - Never an emoji flag: Windows has no flag glyphs and shows letters instead.
   - A language spoken in several countries takes the flag its users expect (English: the British flag).
3. `languages/index.json`: an entry with `code`, the language's own `name`, and a `locale` if the code alone isn't the right one for dates and numbers.
4. `sw.js`:
   - add the code to `LANGUAGE_CODES`, so the language works offline
   - bump `APP_SHELL_VERSION`
5. A column in the glossary above.
6. Run `python tools/check_translations.py`.
7. Walk through the app in the new language (below).

## Checking

`python tools/check_translations.py` reports:

- **Errors** (exit code 1):
  - a listed language without its `.json` or `.svg`
  - a language missing from `LANGUAGE_CODES`
  - invalid JSON
  - a key the fallback doesn't have
  - a plural entry without `other`
  - placeholders that differ from the fallback's
  - a key the app uses that the fallback lacks
- **Warnings:**
  - keys a language lacks (shown from the fallback)
  - fallback keys nothing uses

The script finds the keys the app uses in `index.html`'s `data-translate*` attributes and in `js/`. In `js/` it counts any quoted dotted string whose first segment is a group (`"plans.menu.share"`), and treats a template such as `` `settings.themes.${choice}` `` as using every key under that prefix.

The script can't judge tone, meaning, or whether a label fits. So walk through the app in the language with the dev server running (`powershell -NoProfile -ExecutionPolicy Bypass -File .vscode/run_server.ps1`, then `https://localhost/`):

- the list and the filters (on a phone width too, where the filter row wraps)
- the detail card with and without a photo
- My plans: the ⋯ menu, the delete confirmation, the offline statuses
- import: an empty text, `{}`, a broken link
- help
- the settings with their menus
- the map's tooltips

Look for text that is cut off, wraps badly, or still shows a key.
