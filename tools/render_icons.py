"""
Renders the app's PNG icons from icons/icon.svg with headless Microsoft Edge (Windows).
Run from the repository root after changing the SVG:  python tools/render_icons.py

- icon-192.png, icon-512.png: the SVG as drawn (rounded corners, transparent outside them).
- icon-maskable-512.png, apple-touch-icon.png: square and full-bleed; Android and iOS cut their own shape.
"""

import pathlib
import struct
import subprocess
import tempfile

EDGE_PATH = pathlib.Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS_DIRECTORY = REPOSITORY_ROOT / "icons"

# (file name, size in pixels, keep rounded corners)
ICON_VARIANTS = [
	("icon-192.png", 192, True),
	("icon-512.png", 512, True),
	("icon-maskable-512.png", 512, False),
	("apple-touch-icon.png", 180, False),
]

PAGE_TEMPLATE = """<!DOCTYPE html>
<html><head><style>
	html, body {{ margin: 0; background: transparent; }}
	svg {{ display: block; width: {size}px; height: {size}px; }}
	{extra_css}
</style></head><body>{svg}</body></html>"""


def render_icon(svg_source, file_name, size, keep_rounded_corners, work_directory):
	extra_css = "" if keep_rounded_corners else ".icon-shape { rx: 0; }"
	page_path = work_directory / f"{file_name}.html"
	page_path.write_text(PAGE_TEMPLATE.format(size=size, svg=svg_source, extra_css=extra_css), encoding="utf-8")
	output_path = ICONS_DIRECTORY / file_name
	subprocess.run([
		str(EDGE_PATH),
		"--headless=new",
		"--disable-gpu",
		"--hide-scrollbars",
		"--force-device-scale-factor=1",
		"--default-background-color=00000000",
		f"--user-data-dir={work_directory / 'edge-profile'}",
		f"--window-size={size},{size}",
		f"--screenshot={output_path}",
		page_path.as_uri(),
	], check=True, capture_output=True)
	width, height = read_png_size(output_path)
	if (width, height) != (size, size):
		raise RuntimeError(f"{file_name} came out {width}x{height}, expected {size}x{size}")
	print(f"{file_name}: {size}x{size}")


def read_png_size(png_path):
	header = png_path.read_bytes()[:24]
	return struct.unpack(">II", header[16:24])


def main():
	svg_source = (ICONS_DIRECTORY / "icon.svg").read_text(encoding="utf-8")
	with tempfile.TemporaryDirectory() as work_directory:
		for file_name, size, keep_rounded_corners in ICON_VARIANTS:
			render_icon(svg_source, file_name, size, keep_rounded_corners, pathlib.Path(work_directory))


if __name__ == "__main__":
	main()
