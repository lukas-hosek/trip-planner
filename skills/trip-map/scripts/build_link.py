#!/usr/bin/env python3
"""
Validates a trip plan JSON file and prints the link that opens it in TripMap.

Usage:
	python build_link.py plan.json [--base-url https://localhost:8443/] [--card card.html]

With --card, it writes a share card instead of printing the link: an HTML page with buttons
that open the plan, copy the link and download the JSON, in the browser's language (cs, en or de).

The link is <base URL>#plan=<data>, where <data> is the plan JSON (UTF-8, minified),
compressed with raw DEFLATE and encoded as base64url without padding.
The app (js/data/plan-link.js) decodes exactly this; keep both sides in sync.

Exit code 0: the link was printed or the card written (warnings may be listed above it).
Exit code 1: the plan has errors that would stop the app from opening it.
"""

import argparse
import base64
import collections
import html
import json
import math
import pathlib
import re
import statistics
import string
import sys
import zlib

DEFAULT_BASE_URL = "https://lukas-hosek.github.io/trip-planner/"
PLAN_FORMAT_NAME = "trip-plan"
SUPPORTED_VERSION = 1
# Longer links still work in browsers, but some chat apps and messengers cut them.
LINK_LENGTH_WARNING_THRESHOLD = 30_000
# The app refuses to unpack a link into more than this (MAXIMUM_PLAN_JSON_BYTES in js/data/plan-link.js).
MAXIMUM_PLAN_JSON_BYTES = 1_000_000
# The app's limits (js/data/plan-format.js); keep both in sync. Beyond the first three the app refuses the plan.
MAXIMUM_PLACE_COUNT = 300
MAXIMUM_CATEGORY_COUNT = 50
MAXIMUM_TAG_COUNT = 100
MAXIMUM_TAGS_PER_PLACE = 20
MAXIMUM_WIKIPEDIA_ARTICLES_PER_PLACE = 10
MAXIMUM_LINKS_PER_PLACE = 10
MAXIMUM_NAME_LENGTH = 150
MAXIMUM_LABEL_LENGTH = 80
MAXIMUM_PLAN_TEXT_LENGTH = 2_000
MAXIMUM_PLACE_TEXT_LENGTH = 5_000
MAXIMUM_URL_LENGTH = 2_000
# A place this far from the middle of all the others is probably a typo (or swapped lat/lng).
OUTLIER_DISTANCE_IN_KILOMETERS = 300
# The icons built into the app (PLACE_ICON_KEYS in js/data/place-icons.js); keep both in sync.
PLACE_ICON_KEYS = frozenset({
	"lodging", "camping", "restaurant", "cafe", "bar", "market",
	"airport", "train", "bus", "ferry", "car", "bike",
	"landmark", "museum", "castle", "church", "temple", "ruins", "event", "conference",
	"mountain", "trail", "viewpoint", "water", "beach", "park", "ski",
	"zoo", "amusement", "pool",
	"city", "astronomy", "observatory", "info", "star",
})

CARD_TEMPLATE_PATH = pathlib.Path(__file__).with_name("plan-card-template.html")
# The card's own text in the app's interface languages, with the app's wording (languages/*.json).
# The card is written in the fallback language and switches to the browser's language when it has it.
# Counts are plural objects by CLDR category, as in the app; the browser picks the category.
CARD_FALLBACK_LANGUAGE = "en"
CARD_TEXTS = {
	"en": {
		"locale": "en-GB",
		"openInApp": "Open in TripMap",
		"copyLink": "Copy link",
		"downloadJson": "Download JSON",
		"linkCopied": "Link copied.",
		"copyFailed": "The link couldn't be copied. Open the plan with the button above and copy the link from the address bar.",
		"iphoneHint": "On iPhone the link opens in the browser. To get the plan into the app on your home screen, copy the link, then in the app choose My plans → Import plan → Paste from clipboard.",
		"placeCount": {"one": "{count} place", "other": "{count} places"},
		"dayCount": {"one": "{count} day", "other": "{count} days"},
	},
	"cs": {
		"locale": "cs",
		"openInApp": "Otevřít v TripMap",
		"copyLink": "Kopírovat odkaz",
		"downloadJson": "Stáhnout JSON",
		"linkCopied": "Odkaz je ve schránce.",
		"copyFailed": "Odkaz se nepodařilo zkopírovat. Otevřete plán tlačítkem nahoře a zkopírujte odkaz z adresního řádku.",
		"iphoneHint": "Na iPhonu se odkaz otevře v prohlížeči. Do aplikace na ploše plán přenesete takto: zkopírujte odkaz a v aplikaci zvolte Moje plány → Importovat plán → Vložit ze schránky.",
		"placeCount": {"one": "{count} místo", "few": "{count} místa", "other": "{count} míst"},
		"dayCount": {"one": "{count} den", "few": "{count} dny", "other": "{count} dní"},
	},
	"de": {
		"locale": "de",
		"openInApp": "In TripMap öffnen",
		"copyLink": "Link kopieren",
		"downloadJson": "JSON herunterladen",
		"linkCopied": "Link kopiert.",
		"copyFailed": "Der Link konnte nicht kopiert werden. Öffnen Sie den Plan über die Schaltfläche oben und kopieren Sie den Link aus der Adresszeile.",
		"iphoneHint": "Auf dem iPhone öffnet sich der Link im Browser. Um den Plan in die App auf dem Home-Bildschirm zu holen, kopieren Sie den Link und wählen Sie in der App Meine Pläne → Plan importieren → Aus Zwischenablage einfügen.",
		"placeCount": {"one": "{count} Ort", "other": "{count} Orte"},
		"dayCount": {"one": "{count} Tag", "other": "{count} Tage"},
	},
}

HEX_COLOR_PATTERN =re.compile(r"^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
WIKIPEDIA_URL_PATTERN = re.compile(r"^https://[a-z]{2,3}(-[a-z]+)?\.(m\.)?wikipedia\.org/wiki/.+")
COMMONS_FILE_URL_PATTERN = re.compile(r"^https://commons\.(m\.)?wikimedia\.org/wiki/(File|Image):.+\.\w+$", re.IGNORECASE)
COMMONS_CATEGORY_URL_PATTERN = re.compile(r"^https://commons\.(m\.)?wikimedia\.org/wiki/Category:.+", re.IGNORECASE)
HTTP_URL_PATTERN = re.compile(r"^https?://\S+$")


def validate_plan(plan):
	"""Returns (errors, warnings), each a list of human-readable messages."""
	errors = []
	warnings = []

	if not isinstance(plan, dict):
		return ["The plan must be a JSON object."], warnings
	if plan.get("format") != PLAN_FORMAT_NAME:
		warnings.append(f'"format" should be "{PLAN_FORMAT_NAME}".')
	version = plan.get("version", SUPPORTED_VERSION)
	if not isinstance(version, int) or version > SUPPORTED_VERSION:
		errors.append(f'"version" must be {SUPPORTED_VERSION}.')
	if not is_non_empty_string(plan.get("name")):
		errors.append('The plan has no "name".')
	warn_if_too_long(plan.get("name"), MAXIMUM_NAME_LENGTH, 'The plan\'s "name"', warnings)
	for field in ("description", "note"):
		warn_if_too_long(plan.get(field), MAXIMUM_PLAN_TEXT_LENGTH, f'The plan\'s "{field}"', warnings)

	category_ids = validate_definitions(plan.get("categories"), "category", errors, warnings, color_required=True)
	tag_ids = validate_definitions(plan.get("tags"), "tag", errors, warnings, color_required=False)

	places = plan.get("places")
	if not isinstance(places, list) or not places:
		errors.append('The plan has no "places".')
		return errors, warnings
	if len(places) > MAXIMUM_PLACE_COUNT:
		errors.append(f"The plan has {len(places)} places; the app accepts at most {MAXIMUM_PLACE_COUNT}.")

	seen_place_ids = set()
	used_category_ids = set()
	seen_place_names = set()
	place_count_by_tag_id = collections.Counter()
	coordinates = []
	places_without_website = []
	for index, place in enumerate(places, start=1):
		if not isinstance(place, dict):
			errors.append(f"Place {index} is not an object.")
			continue
		name = place.get("name")
		label = f'Place {index} ("{name}")' if is_non_empty_string(name) else f"Place {index}"
		if not is_non_empty_string(name):
			errors.append(f"{label} has no name.")
		elif name.strip().lower() in seen_place_names:
			warnings.append(f"{label}: another place has the same name.")
		else:
			seen_place_names.add(name.strip().lower())

		latitude, longitude = place.get("lat"), place.get("lng")
		if not is_coordinate(latitude, 90) or not is_coordinate(longitude, 180):
			errors.append(f'{label} needs numeric "lat" (-90..90) and "lng" (-180..180).')
		else:
			coordinates.append((label, latitude, longitude))

		place_id = place.get("id")
		if place_id is not None:
			if not is_non_empty_string(place_id) or not re.fullmatch(r"[a-z0-9-]+", place_id):
				warnings.append(f'{label}: "id" should use only lowercase letters, digits and hyphens.')
			elif place_id in seen_place_ids:
				warnings.append(f'{label}: "id" "{place_id}" is used twice; the app will rename one.')
			else:
				seen_place_ids.add(place_id)

		category = place.get("category")
		if not is_non_empty_string(category):
			warnings.append(f'{label} has no "category"; it will appear under "Other" ("Ostatní" in Czech).')
		else:
			used_category_ids.add(category)
			if category not in category_ids:
				warnings.append(f'{label}: category "{category}" is not defined in "categories"; it will be grey.')
		validate_icon(place.get("icon"), label, warnings)

		place_tags = place.get("tags", [])
		if not isinstance(place_tags, list):
			warnings.append(f'{label}: "tags" should be a list of tag ids.')
			place_tags = []
		warn_if_too_many(place_tags, MAXIMUM_TAGS_PER_PLACE, f'{label}: "tags"', warnings)
		for tag_id in place_tags:
			if not isinstance(tag_id, str):
				warnings.append(f'{label}: "tags" must contain tag ids (strings), not {json.dumps(tag_id, ensure_ascii=False)}.')
				continue
			if tag_id not in tag_ids:
				warnings.append(f'{label}: tag "{tag_id}" is not defined in "tags"; it will show its id as the label.')
			place_count_by_tag_id[tag_id] += 1

		if not is_non_empty_string(place.get("description")):
			warnings.append(f'{label} has no "description".')
		warn_if_too_long(name, MAXIMUM_NAME_LENGTH, f'Place {index}: "name"', warnings)
		for field in ("description", "tip"):
			warn_if_too_long(place.get(field), MAXIMUM_PLACE_TEXT_LENGTH, f'{label}: "{field}"', warnings)
		warn_if_too_many(as_list(place.get("wikipedia")), MAXIMUM_WIKIPEDIA_ARTICLES_PER_PLACE, f'{label}: "wikipedia"', warnings)
		warn_if_too_many(as_list(place.get("links")), MAXIMUM_LINKS_PER_PLACE, f'{label}: "links"', warnings)
		website = place.get("website")
		if website is None:
			places_without_website.append(name if is_non_empty_string(name) else f"place {index}")
		elif not isinstance(website, str) or not HTTP_URL_PATTERN.match(website):
			warnings.append(f'{label}: "website" must be an http(s) URL; it will be ignored.')
		elif len(website) > MAXIMUM_URL_LENGTH:
			warnings.append(f'{label}: "website" is longer than {MAXIMUM_URL_LENGTH} characters; it will be ignored.')
		for url in as_list(place.get("wikipedia")):
			if not isinstance(url, str) or not WIKIPEDIA_URL_PATTERN.match(url) or len(url) > MAXIMUM_URL_LENGTH:
				warnings.append(f'{label}: "{url}" is not a Wikipedia article URL (https://xx.wikipedia.org/wiki/Title); it will be ignored.')
		validate_commons(place.get("commons"), label, warnings)
		if "photo" in place:
			warnings.append(f'{label}: "photo" is no longer supported and will be ignored; choose a Commons file in "commons.file" instead.')
		for link in as_list(place.get("links")):
			if not isinstance(link, dict) or not isinstance(link.get("url"), str) or not HTTP_URL_PATTERN.match(link["url"]) or len(link["url"]) > MAXIMUM_URL_LENGTH:
				warnings.append(f'{label}: links need {{"label": …, "url": "https://…"}} with a URL of at most {MAXIMUM_URL_LENGTH} characters; an invalid one will be ignored.')
			else:
				warn_if_too_long(link.get("label"), MAXIMUM_LABEL_LENGTH, f'{label}: a link\'s "label"', warnings)

	# Like the app, count the categories and tags that places use without the plan defining them.
	category_count = len(category_ids | used_category_ids)
	if category_count > MAXIMUM_CATEGORY_COUNT:
		errors.append(f"The plan has {category_count} categories; the app accepts at most {MAXIMUM_CATEGORY_COUNT}.")
	tag_count = len(tag_ids | set(place_count_by_tag_id))
	if tag_count > MAXIMUM_TAG_COUNT:
		errors.append(f"The plan has {tag_count} tags; the app accepts at most {MAXIMUM_TAG_COUNT}.")
	for tag_id in sorted(tag_ids - set(place_count_by_tag_id)):
		warnings.append(f'Tag "{tag_id}" is defined but no place uses it.')
	for tag_id in sorted(find_filterable_info_tag_ids(plan.get("tags"))):
		if place_count_by_tag_id[tag_id] == 1:
			warnings.append(f'Tag "{tag_id}" is filterable but only one place uses it; its filter button would show just that place.')
	warnings.extend(find_coordinate_outliers(coordinates))
	if places_without_website:
		warnings.append(f"No website for: {', '.join(places_without_website)}. Fine for places that really have none (most natural sights).")
	return errors, warnings


def validate_commons(commons, label, warnings):
	if commons is None:
		warnings.append(f'{label} has no "commons" photo; the app will fall back to a Wikipedia lead image, if any.')
		return
	if not isinstance(commons, dict):
		warnings.append(f'{label}: "commons" must be an object {{"file": …, "category": …}}.')
		return
	file_url = commons.get("file")
	if not isinstance(file_url, str) or not COMMONS_FILE_URL_PATTERN.match(file_url) or len(file_url) > MAXIMUM_URL_LENGTH:
		warnings.append(f'{label}: "commons.file" must be a Commons file page URL (https://commons.wikimedia.org/wiki/File:Name.jpg).')
	category_url = commons.get("category")
	if category_url is not None and (not isinstance(category_url, str) or not COMMONS_CATEGORY_URL_PATTERN.match(category_url)):
		warnings.append(f'{label}: "commons.category" must be a Commons category URL (https://commons.wikimedia.org/wiki/Category:Name).')
	subject = commons.get("subject")
	if subject is not None and not is_non_empty_string(subject):
		warnings.append(f'{label}: "commons.subject" must be the name of what the photo shows, or be left out.')
	warn_if_too_long(subject, MAXIMUM_NAME_LENGTH, f'{label}: "commons.subject"', warnings)


def validate_icon(icon, label, warnings):
	"""An unknown icon key doesn't break the plan; the app just shows a plain dot instead."""
	if icon is None:
		return
	if not isinstance(icon, str) or icon.strip().lower() not in PLACE_ICON_KEYS:
		warnings.append(f'{label}: "icon" {json.dumps(icon, ensure_ascii=False)} is not one of the app icon keys (see reference/plan-format.md); it will show a plain dot.')


def validate_definitions(definitions, kind, errors, warnings, color_required):
	"""Checks the "categories" or "tags" object and returns the set of defined ids."""
	plural = "categories" if kind == "category" else "tags"
	if definitions is None:
		if kind == "category":
			warnings.append('The plan has no "categories".')
		return set()
	if not isinstance(definitions, dict):
		errors.append(f'"{plural}" must be an object keyed by id.')
		return set()
	for definition_id, definition in definitions.items():
		if not isinstance(definition, dict) or not is_non_empty_string(definition.get("label")):
			warnings.append(f'{kind.capitalize()} "{definition_id}" needs a "label".')
			continue
		warn_if_too_long(definition_id, MAXIMUM_LABEL_LENGTH, f'The id of {kind} "{definition["label"]}"', warnings)
		warn_if_too_long(definition["label"], MAXIMUM_LABEL_LENGTH, f'{kind.capitalize()} "{definition_id}": "label"', warnings)
		color = definition.get("color")
		if color is None:
			if color_required:
				warnings.append(f'{kind.capitalize()} "{definition_id}" has no "color"; the app will pick one.')
		elif not isinstance(color, str) or not HEX_COLOR_PATTERN.match(color):
			warnings.append(f'{kind.capitalize()} "{definition_id}": "color" should be a hex colour like "#b0731c".')
		if kind == "category":
			validate_icon(definition.get("icon"), f'Category "{definition_id}"', warnings)
		for flag in ("itinerary", "filterable"):
			value = definition.get(flag)
			if value is not None and not isinstance(value, bool):
				warnings.append(f'Tag "{definition_id}": "{flag}" must be true or false.')
	return set(definitions)


def find_filterable_info_tag_ids(tag_definitions):
	"""Ids of tags marked "filterable": true that are not itinerary tags (those are always filterable)."""
	if not isinstance(tag_definitions, dict):
		return set()
	return {
		tag_id for tag_id, definition in tag_definitions.items()
		if isinstance(definition, dict) and definition.get("filterable") is True and definition.get("itinerary") is not True
	}


def find_coordinate_outliers(coordinates):
	if len(coordinates) < 3:
		return []
	median_latitude = statistics.median(latitude for _, latitude, _ in coordinates)
	median_longitude = statistics.median(longitude for _, _, longitude in coordinates)
	warnings = []
	for label, latitude, longitude in coordinates:
		distance = distance_in_kilometers(latitude, longitude, median_latitude, median_longitude)
		if distance > OUTLIER_DISTANCE_IN_KILOMETERS:
			warnings.append(f"{label} is {distance:.0f} km from the other places. Check its coordinates (swapped lat/lng?).")
	return warnings


def distance_in_kilometers(latitude1, longitude1, latitude2, longitude2):
	earth_radius_in_kilometers = 6371
	latitude_delta = math.radians(latitude2 - latitude1)
	longitude_delta = math.radians(longitude2 - longitude1)
	haversine = (math.sin(latitude_delta / 2) ** 2
		+ math.cos(math.radians(latitude1)) * math.cos(math.radians(latitude2)) * math.sin(longitude_delta / 2) ** 2)
	return 2 * earth_radius_in_kilometers * math.asin(math.sqrt(haversine))


def minify_plan(plan):
	"""Returns the plan as the UTF-8 JSON bytes that travel in the link."""
	return json.dumps(plan, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def encode_plan(plan_json_bytes):
	compressor = zlib.compressobj(level=9, wbits=-15)  # negative wbits = raw DEFLATE, no zlib header
	compressed = compressor.compress(plan_json_bytes) + compressor.flush()
	return base64.urlsafe_b64encode(compressed).decode("ascii").rstrip("=")


def build_card(plan, plan_file_bytes, plan_file_name, link):
	"""Returns the share card HTML. Every plan string is escaped, since plans can come from anywhere."""
	texts = CARD_TEXTS[CARD_FALLBACK_LANGUAGE]
	place_count = len(plan["places"])
	tag_definitions = plan.get("tags") if isinstance(plan.get("tags"), dict) else {}
	day_count = sum(1 for definition in tag_definitions.values() if isinstance(definition, dict) and definition.get("itinerary") is True)
	summary_parts = [format_fallback_count(texts["placeCount"], place_count)]
	if day_count:
		summary_parts.append(format_fallback_count(texts["dayCount"], day_count))

	description = plan.get("description")
	description_html = f'<p class="description">{html.escape(description.strip())}</p>' if is_non_empty_string(description) else ""

	category_items = []
	category_definitions = plan.get("categories") if isinstance(plan.get("categories"), dict) else {}
	for definition in category_definitions.values():
		if not isinstance(definition, dict) or not is_non_empty_string(definition.get("label")):
			continue
		color = definition.get("color")
		dot_style = f' style="--category-color: {color}"' if isinstance(color, str) and HEX_COLOR_PATTERN.match(color) else ""
		category_items.append(f'<li class="category"><span class="category-dot"{dot_style}></span>{html.escape(definition["label"].strip())}</li>')
	categories_html = f'<ul class="categories">{"".join(category_items)}</ul>' if category_items else ""

	template = string.Template(CARD_TEMPLATE_PATH.read_text(encoding="utf-8"))
	# "</" would end the <script> element that holds the texts.
	card_texts_json = json.dumps({"languages": CARD_TEXTS}, ensure_ascii=False).replace("</", "<\\/")
	return template.substitute(
		fallback_language=CARD_FALLBACK_LANGUAGE,
		plan_name=html.escape(plan["name"].strip()),
		summary=html.escape(" · ".join(summary_parts)),
		place_count=place_count,
		day_count=day_count,
		description_html=description_html,
		categories_html=categories_html,
		plan_link=html.escape(link),
		plan_json_base64=base64.b64encode(plan_file_bytes).decode("ascii"),
		json_file_name=html.escape(plan_file_name),
		open_in_app_text=html.escape(texts["openInApp"]),
		copy_link_text=html.escape(texts["copyLink"]),
		download_json_text=html.escape(texts["downloadJson"]),
		iphone_hint_text=html.escape(texts["iphoneHint"]),
		card_texts_json=card_texts_json,
	)


def format_fallback_count(plural_texts, count):
	"""The count in the fallback language (English: one/other), shown until the card's script picks the browser's language."""
	return plural_texts["one" if count == 1 else "other"].replace("{count}", str(count))


def warn_if_too_long(text, maximum_length, what, warnings):
	if isinstance(text, str) and len(text.strip()) > maximum_length:
		warnings.append(f"{what} is {len(text.strip())} characters long; the app will cut it to {maximum_length}.")


def warn_if_too_many(items, maximum_count, what, warnings):
	if len(items) > maximum_count:
		warnings.append(f"{what} has {len(items)} entries; the app uses only the first {maximum_count}.")


def is_non_empty_string(value):
	return isinstance(value, str) and value.strip() != ""


def is_coordinate(value, maximum_absolute_value):
	return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and abs(value) <= maximum_absolute_value


def as_list(value):
	if value is None:
		return []
	return value if isinstance(value, list) else [value]


def main():
	parser = argparse.ArgumentParser(description="Validate a trip plan and print the link that opens it in TripMap.")
	parser.add_argument("plan_file", help="path to the plan JSON file")
	parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"app URL (default: {DEFAULT_BASE_URL})")
	parser.add_argument("--card", metavar="CARD_FILE", help="write a share card (HTML) here instead of printing the link")
	arguments = parser.parse_args()

	try:
		plan_file_bytes = pathlib.Path(arguments.plan_file).read_bytes()
		plan = json.loads(plan_file_bytes.decode("utf-8"))
	except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
		print(f"ERROR: cannot read the plan: {error}", file=sys.stderr)
		return 1

	errors, warnings = validate_plan(plan)
	plan_json_bytes = minify_plan(plan)
	if len(plan_json_bytes) > MAXIMUM_PLAN_JSON_BYTES:
		errors.append(f"The plan is {len(plan_json_bytes):,} bytes of JSON; the app accepts at most {MAXIMUM_PLAN_JSON_BYTES:,} in a link.")
	for warning in warnings:
		print(f"WARNING: {warning}")
	if errors:
		for error in errors:
			print(f"ERROR: {error}", file=sys.stderr)
		print("No link was built. Fix the errors and run again.", file=sys.stderr)
		return 1

	link = f"{arguments.base_url.split('#')[0]}#plan={encode_plan(plan_json_bytes)}"
	place_count = len(plan["places"])
	print(f"OK: \"{plan['name']}\", {place_count} places, link length {len(link)} characters.")
	if len(link) > LINK_LENGTH_WARNING_THRESHOLD:
		print("WARNING: the link is very long; some apps may cut it. Make sure the user also gets the JSON file.")
	if arguments.card:
		# The link stays out of the output on purpose: the card carries it, so nobody has to copy it by hand.
		card_html = build_card(plan, plan_file_bytes, pathlib.Path(arguments.plan_file).name, link)
		pathlib.Path(arguments.card).write_text(card_html, encoding="utf-8", newline="\n")
		print(f"Card written to {arguments.card}.")
		return 0
	print()
	print(link)
	return 0


if __name__ == "__main__":
	sys.exit(main())
