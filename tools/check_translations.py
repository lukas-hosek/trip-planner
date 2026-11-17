"""
Checks TripMap's interface translations (languages/). Run from anywhere:  python tools/check_translations.py

Errors (exit code 1):
- a language listed in languages/index.json has no .json or .svg file, or sw.js doesn't precache it (LANGUAGE_CODES);
- a language file isn't valid JSON, has a key the fallback language doesn't have, a plural entry without "other",
  or a text whose {placeholders} differ from the fallback's;
- the app uses a key (data-translate* in index.html, a dotted-key string in js/) that the fallback file lacks.
Warnings:
- a key the fallback has but another language lacks (the app shows the fallback's text there);
- a fallback key that nothing in the app uses.

The format and the conventions are described in .claude/skills/tripmap-lang/SKILL.md.
"""

import json
import pathlib
import re
import sys

REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parent.parent
LANGUAGES_DIRECTORY = REPOSITORY_ROOT / "languages"
PLURAL_CATEGORIES = {"zero", "one", "two", "few", "many", "other"}
PLACEHOLDER_PATTERN = re.compile(r"\{(\w+)\}")
HTML_ATTRIBUTE_PATTERN = re.compile(r'data-translate(?:-html|-aria-label|-title)?="([^"]+)"')
# "plans.menu.share": a quoted string made of dotted name segments.
KEY_LITERAL_PATTERN = re.compile(r'"([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)"')
# `settings.themes.${themeChoice}`: a key built at run time; every key under the prefix counts as used.
KEY_PREFIX_PATTERN = re.compile(r"`([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*)\.\$\{")
LANGUAGE_CODES_PATTERN = re.compile(r"const LANGUAGE_CODES = \[([^\]]*)\];")

errors = []
warnings = []


def main():
	language_index = read_json(LANGUAGES_DIRECTORY / "index.json")
	if language_index is None:
		return finish()
	language_codes = [language.get("code") for language in language_index.get("languages", [])]
	fallback_code = language_index.get("fallback")
	if fallback_code not in language_codes:
		errors.append(f'index.json: the fallback "{fallback_code}" is not one of the listed languages')
		return finish()

	check_service_worker(language_codes)
	translations_by_code = {}
	for code in language_codes:
		if not (LANGUAGES_DIRECTORY / f"{code}.svg").is_file():
			errors.append(f"languages/{code}.svg (the flag) is missing")
		translations = read_json(LANGUAGES_DIRECTORY / f"{code}.json")
		if translations is not None:
			translations_by_code[code] = flatten(translations, f"{code}.json")

	fallback_entries = translations_by_code.get(fallback_code)
	if fallback_entries is None:
		return finish()
	for code, entries in translations_by_code.items():
		if code != fallback_code:
			compare_with_fallback(code, entries, fallback_code, fallback_entries)
	check_key_usage(fallback_code, fallback_entries)
	return finish()


def read_json(path):
	relative_path = path.relative_to(REPOSITORY_ROOT).as_posix()
	if not path.is_file():
		errors.append(f"{relative_path} is missing")
		return None
	try:
		return json.loads(path.read_text(encoding="utf-8"))
	except json.JSONDecodeError as error:
		errors.append(f"{relative_path} is not valid JSON: {error}")
		return None


def flatten(group, file_name, prefix=""):
	"""@returns {dotted key: text or plural entry}"""
	entries = {}
	for name, value in group.items():
		key = f"{prefix}{name}"
		if isinstance(value, str):
			entries[key] = value
		elif isinstance(value, dict) and value and set(value) <= PLURAL_CATEGORIES:
			if "other" not in value:
				errors.append(f'{file_name}: plural entry "{key}" has no "other" form')
			entries[key] = value
		elif isinstance(value, dict):
			entries.update(flatten(value, file_name, f"{key}."))
		else:
			errors.append(f'{file_name}: "{key}" must be a text, a plural entry or a group')
	return entries


def placeholders(entry):
	texts = entry.values() if isinstance(entry, dict) else [entry]
	return {name for text in texts for name in PLACEHOLDER_PATTERN.findall(text)}


def compare_with_fallback(code, entries, fallback_code, fallback_entries):
	for key in fallback_entries.keys() - entries.keys():
		warnings.append(f'{code}.json lacks "{key}" (shown from {fallback_code}.json)')
	for key in entries.keys() - fallback_entries.keys():
		errors.append(f'{code}.json has "{key}", which {fallback_code}.json doesn\'t have')
	for key in entries.keys() & fallback_entries.keys():
		if placeholders(entries[key]) != placeholders(fallback_entries[key]):
			errors.append(
				f'{code}.json "{key}" uses placeholders {sorted(placeholders(entries[key]))}, '
				f"{fallback_code}.json uses {sorted(placeholders(fallback_entries[key]))}")


def check_service_worker(language_codes):
	match = LANGUAGE_CODES_PATTERN.search((REPOSITORY_ROOT / "sw.js").read_text(encoding="utf-8"))
	precached_codes = re.findall(r'"([^"]+)"', match.group(1)) if match else []
	if sorted(precached_codes) != sorted(language_codes):
		errors.append(f"sw.js LANGUAGE_CODES {precached_codes} doesn't match languages/index.json {language_codes}")


def check_key_usage(fallback_code, fallback_entries):
	groups = {key.split(".")[0] for key in fallback_entries}
	used_keys = set(HTML_ATTRIBUTE_PATTERN.findall((REPOSITORY_ROOT / "index.html").read_text(encoding="utf-8")))
	used_prefixes = set()
	for script_path in (REPOSITORY_ROOT / "js").rglob("*.js"):
		source = script_path.read_text(encoding="utf-8")
		used_keys.update(key for key in KEY_LITERAL_PATTERN.findall(source) if key.split(".")[0] in groups)
		used_prefixes.update(prefix for prefix in KEY_PREFIX_PATTERN.findall(source) if prefix.split(".")[0] in groups)

	for key in sorted(used_keys - fallback_entries.keys()):
		errors.append(f'the app uses "{key}", which {fallback_code}.json doesn\'t have')
	for prefix in sorted(used_prefixes):
		if not any(key.startswith(f"{prefix}.") for key in fallback_entries):
			errors.append(f'the app builds keys under "{prefix}.", but {fallback_code}.json has none')
	for key in sorted(fallback_entries.keys() - used_keys):
		if not any(key.startswith(f"{prefix}.") for prefix in used_prefixes):
			warnings.append(f'"{key}" in {fallback_code}.json is not used by the app')


def finish():
	for warning in sorted(warnings):
		print(f"warning: {warning}")
	for error in errors:
		print(f"error: {error}")
	print(f"{len(errors)} error(s), {len(warnings)} warning(s)")
	return 1 if errors else 0


if __name__ == "__main__":
	sys.exit(main())
