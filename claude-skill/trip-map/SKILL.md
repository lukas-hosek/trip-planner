---
name: trip-map
description: Exports a finished trip plan to TripMap, the user's interactive trip map app (an offline-capable web app at https://lukas-hosek.github.io/trip-planner/) as a plan JSON file plus a link that opens it. Use when the user has settled a trip itinerary and asks to export it, put it on a map, make a map or link of the plan, open it in TripMap or their trip app ("exportuj do mapy", "pošli plán do aplikace"), or update a plan exported earlier.
---

# TripMap export

The user plans trips with you, then opens them in TripMap, their trip map app: colour-coded pins on a hiking map (numbered along the itinerary, with an icon for the other places), a list of places, a detail card per place (photo, description, practical tip, the place's website and other links), filters by category and by day, GPS location and offline use.

The app reads one JSON document per trip, the **plan**. You deliver it in two forms:

1. A **link**, `https://lukas-hosek.github.io/trip-planner/#plan=…`, which opens and stores the plan in the app. It is produced by `scripts/build_link.py` in this skill's directory. Never write or edit the encoded part by hand.
2. The **JSON file** itself, as a fallback the user can import in the app.

Read [reference/plan-format.md](reference/plan-format.md) for the full format, the colour palette and a complete example before writing a plan.

## Workflow

1. **Make sure the plan is settled.** Export what the conversation has agreed on. If the itinerary is clearly still open (days not decided, places still being compared), say what's missing and ask whether to export anyway.

2. **List the places.** Include every place the itinerary visits, in visiting order: day 1 first, then day 2, and so on. After them come the alternatives the user wanted to keep ("if there's time", "rainy day option"). The array order numbers the itinerary places on the map; alternatives show an icon instead. A typical plan has 5–30 places. Accommodation can be included if the user wants it.

3. **Get coordinates right.** They are the core of the map. Look each place up (web search, Wikipedia, the official site, OpenStreetMap) and use the coordinates of the place itself, to 4–5 decimals. For a long hike, use the main sight or the trailhead and say which in the `tip`. Never guess. If you can't verify a place, use the best available position and say in its `tip` that the position is approximate. Swapped latitude and longitude is a classic mistake: in Europe, latitude (`lat`) is the larger number.

4. **Find Wikipedia articles.** The place's "Wikipedie" link goes to the first article listed. If the Commons photo (step 5) can't be found, the app shows the lead image of the first listed article that has one. For each place, list every article below that you have checked exists, in this order:
   1. The Wikipedia in the plan's language, for example `cs.` for a plan written in Czech.
   2. English Wikipedia (`en.`).
   3. The Wikipedia of the country where the place is, for example `de.` for Germany or `it.` for Italy.

   For example, for a Czech plan in Saxony, list `cs.`, then `en.`, then `de.`. If there is no Czech article, the English one comes first. If there is only a German article, list just that one. Skip a language that repeats one already listed.

   Don't invent article titles; leaving an article out is better than listing a broken one.

5. **Choose a photo on Wikimedia Commons.** Every place gets `commons`, which the app uses to show its photo. It isn't shown as a link of its own.
   - Find the place on Commons (commons.wikimedia.org). The quickest route is the place's Commons category: Wikidata's "Commons category" property, or the "Wikimedia Commons" link on its Wikipedia article.
   - Pick one good photo of the place and give its file page as `file`, e.g. `https://commons.wikimedia.org/wiki/File:2015-05-13_Basteibrücke-.jpg`. Choose a real photo, not a map, drawing, logo or old postcard. Prefer landscape orientation (the card is wide and crops tall images) and at least about 1000 px wide.
   - If the place has its own Commons category, give it as `category`. The app's "Další fotky" button opens it.
   - If Commons has no photo of the place itself, use the closest broader subject it belongs to: the village, the town, the valley, the mountain range. Set `subject` to its name (e.g. `"Bad Schandau"`) so the app's photo credit says what the photo shows. Don't give the broader subject's category as `category`; leave `category` out.
   - Copy file names exactly from Commons; never construct or guess them. If a file name is wrong, the app falls back to the lead image of the first Wikipedia article with one, so a mistake costs the chosen photo but doesn't leave a blank.

6. **Add the website.** Every place that has a website of its own lists it as `website`, so the user can check opening hours, prices and closures. In order of preference:
   - The place's own official site: the castle, museum, spa, zoo or restaurant itself, its operator, or the village's or town's own site.
   - For a natural sight with an inn, a hut or a visitor centre whose opening hours matter, that facility's site.
   - For a place with opening hours or a timetable but no site of its own (a lift, a ferry, a small museum), its page on the official regional tourism portal.
   - Otherwise none. Most viewpoints, rocks and hiking spots have no website, and that's fine. Never use booking sites, review sites, aggregators or Wikipedia as `website`.

   If the site has a version in the plan's language, link that one. Open every website to check that it loads and is about the right place.

7. **Choose categories.** Use 3–6 kinds of places that make sense for this trip, for example "Vyhlídky", "Hrady a zámky", "Muzea", "Jídlo a pití", "Koupání". Give each a distinct colour from the palette in the reference and the best-fitting `icon` from the reference's icon list. Only the itinerary is numbered on the map; every other place shows its icon, so the icon should say at a glance what kind of place it is. Give a place its own `icon` only when it differs clearly from its category's (an airport among "Doprava", a church among "Památky").

8. **Choose tags.** Every tag is shown on its places. A tag gets a filter button in the app in exactly two cases:
   1. it is an itinerary tag (`"itinerary": true`), or
   2. it is explicitly marked `"filterable": true`.

   Every other tag can't be filtered by: leaving out `filterable` means `false`. How many places use a tag makes no difference.
   - **Itinerary tags**, one per day or part of a trip ("Sobota", "Den 2 · Út"), with `"itinerary": true`, defined in chronological order. Every place on the itinerary gets its day tag; alternatives get none. The app numbers the planned places in order, rings their pins and offers a "Náš plán" filter plus one filter per day. Itinerary tags are always filterable, so don't add `filterable` to them.
   - **Filterable tags** (`"filterable": true`) are groupings the user would actually want to browse the list by: a town or area that several places share ("Rathen", "Malá Strana"), or a trait they would plan around ("Vstup zdarma", "Vhodné s dětmi"). Only mark a tag filterable when filtering by it is genuinely useful. Put it on all the places it applies to, normally at least two, since a filter that shows a single place is pointless. Don't repeat what the categories already group.
   - **Info tags** are short practical labels of up to about 30 characters: opening hours, closures, "Rezervace nutná", "Hrad zavřený". They are notes about a place, not something to filter by, so they are not filterable. Colour them by meaning (see the palette) and reuse one tag across places where it fits.

9. **Write the texts** in the language of the conversation. The app's own interface is Czech.
   - `description`: 3–6 sentences of concrete, interesting facts: what it is, its history, what you'll see, why it's worth the visit. No marketing filler.
   - `tip`: practical advice, such as how to get there, parking, how long it takes, tickets, and the best time of day.
   - Plan `description`: one or two sentences introducing the trip (dates, idea). Plan `note`: when facts were checked, plus any caveat ("Otevírací doby si ověřte před cestou").

10. **Build the link.** Save the plan as `<trip-slug>.json`, then run:

    ```
    python <this skill's directory>/scripts/build_link.py <trip-slug>.json
    ```

    The script validates the plan and prints the link and its length, or a list of problems. Fix every error and re-run. Review the warnings; they usually point at real mistakes such as an undefined tag, a malformed Commons link or a place far away from all the others.

11. **Reply to the user** with:
    - The link as a Markdown link, copied exactly as the script printed it: `[Otevřít plán v mapě](https://lukas-hosek.github.io/trip-planner/#plan=…)`.
    - The JSON file as a downloadable attachment (save it to `/mnt/user-data/outputs/` when that directory exists).
    - One line for iPhone users. A link opens in the browser, not in the app on the home screen, so to get the plan there: copy the link, open the app, then **Moje plány → Importovat plán → Vložit ze schránky**.
    - A short summary: number of places, days, and anything approximate or unverified, including places whose photo shows a broader subject.

## Updating a plan

The app identifies plans by `name`. To update a plan exported earlier, keep exactly the same `name`: opening the new link replaces the stored version. A different name creates a separate plan.

## Without code execution

If you can't run the script, give the plan as a ```json code block. The user can paste it into the app under **Moje plány → Importovat plán**.
