---
name: trip-map
description: Exports a finished trip plan to TripMap, the user's interactive trip map app (an offline-capable web app at https://lukas-hosek.github.io/trip-planner/) as a plan JSON file plus a share card with a button that opens it. Use when the user has settled a trip itinerary and asks to export it, put it on a map, make a map or link of the plan, open it in TripMap or their trip app ("exportuj do mapy", "pošli plán do aplikace"), or update a plan exported earlier.
---

# TripMap export

TripMap shows a trip as colour-coded pins on a map, with a list of places and a detail card per place. It reads one JSON document per trip, the **plan**. A link, `https://lukas-hosek.github.io/trip-planner/#plan=…`, carries the whole plan compressed and stores it in the app. You deliver a **share card** (an HTML page whose buttons open the plan, copy the link and download the JSON), written by `scripts/build_link.py`, and the **JSON file**. Never write or edit the encoded part of a link by hand.

Read [reference/plan-format.md](reference/plan-format.md) for the fields, icons, palette and an example before writing a plan.

## Workflow

1. **Export what the conversation has settled.** If days or places are still open, say what's missing and ask whether to export anyway.

2. **List the places** in visiting order (day 1, then day 2…), then the alternatives the user wants to keep ("if there's time", "rainy day"). Itinerary places are numbered in array order; alternatives show an icon. Include accommodation only if the user wants it.

3. **Coordinates** are the core of the map: verify each, 4–5 decimals, at the place itself (for a long hike, the trailhead or main sight, and say which in `tip`). Never guess; if you can't verify a place, use the best position and say in its `tip` that it is approximate.

4. **Wikipedia articles.** List every article you have checked exists, in this order: the plan's language, English, then the language of the country the place is in (a Czech plan in Saxony: `cs.`, `en.`, `de.`). Skip missing ones and repeats. Never invent titles. The app links to the first and falls back to the first lead image when the Commons photo fails.

5. **Commons photo.** Every place gets `commons`:
   - `file`: one good photo's file page, found via the place's Commons category (Wikidata, or the Commons link on its Wikipedia article) and copied exactly, never constructed. A real photo, not a map, drawing, logo or old postcard; landscape, at least ~1000 px wide.
   - `category`: the place's own Commons category, if it has one.
   - If Commons has no photo of the place itself, use the closest broader subject (village, town, valley, range), set `subject` to its name and leave `category` out.

6. **Website**, so the user can check opening hours and prices. In order of preference: the place's own official site (or its operator's, or the village's or town's); for a natural sight, the site of its inn, hut or visitor centre if their hours matter; for a lift, ferry or small museum without a site, its page on the official regional tourism portal. Otherwise none, which is normal for viewpoints and trails. Never booking, review or aggregator sites, or Wikipedia. Prefer the version in the plan's language, and open it to check that it loads and is about the right place.

7. **Categories:** 3–6 kinds of places that fit the trip ("Vyhlídky", "Hrady a zámky", "Jídlo a pití"), each with a distinct palette colour and the best-fitting `icon`. Non-itinerary pins show only the icon, so it should say what the place is. Give a place its own `icon` only when it clearly differs from its category's (an airport in "Doprava", a church in "Památky").

8. **Tags.** Every tag is shown on its places. Only two kinds get a filter button:
   - **Itinerary tags** (`"itinerary": true`): one per day or part of the trip ("Sobota", "Den 2 · Út"), defined in chronological order. Every itinerary place gets its day tag; alternatives get none. They are always filterable.
   - **Filterable tags** (`"filterable": true`): groupings worth browsing by, such as an area several places share ("Rathen") or a trait the user would plan around ("Vstup zdarma", "Vhodné s dětmi"). Put one on every place it applies to (normally two or more), and don't repeat what the categories already group.

   All other tags are **info tags**: short notes up to ~30 characters ("Rezervace nutná", "Hrad zavřený"), coloured by meaning (see the palette) and reused across places where they fit.

9. **Texts**, in the language of the conversation. `description`: 3–6 sentences of concrete facts (what it is, history, what you'll see, why go), with no marketing filler. `tip`: getting there, parking, duration, tickets, best time. Plan `note`: when facts were checked, plus caveats.

10. **Build the share card.** Save the plan as `<trip-slug>.json` in the folder your environment offers files from (`/mnt/user-data/outputs/` in Claude, `/mnt/data/` in ChatGPT, otherwise the current directory), then run:

    ```
    python <this skill's directory>/scripts/build_link.py <trip-slug>.json --card <trip-slug>.html
    ```

    Fix every error and re-run. Read the warnings too: they usually point at real mistakes.

11. **Reply** with the share card first, then the JSON file, both shown or attached in the chat. Don't paste the link. Add a short summary: the number of places and days, and anything approximate or unverified (including photos of a broader subject).

    Only if you can't show files, run the script without `--card` and give the printed link exactly as a Markdown link: `[Otevřít plán v mapě](https://lukas-hosek.github.io/trip-planner/#plan=…)`. Add one line for iPhone users: a link opens in the browser, not in the home-screen app, so copy it, open the app and choose **My plans → Import plan → Paste from clipboard** (Czech **Moje plány → Importovat plán → Vložit ze schránky**, German **Meine Pläne → Plan importieren → Aus Zwischenablage einfügen**).

## Updating a plan

The app identifies plans by `name`. Keep exactly the same `name` to replace the stored version; a different name creates a separate plan.

## Without code execution

Give the plan as a ```json code block. The user pastes it into the app under **My plans → Import plan** (Czech **Moje plány → Importovat plán**, German **Meine Pläne → Plan importieren**).
