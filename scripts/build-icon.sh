#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONNECTOR_ID="${CONNECTOR_ID:-com.polygon.feed}"
CONNECTOR_DIR="$REPO_ROOT/Source/$CONNECTOR_ID"
VERSION_FILE="$CONNECTOR_DIR/version.json"
ICON_PNG="$CONNECTOR_DIR/icon.png"

if [[ ! -f "$VERSION_FILE" ]]; then
	echo "Missing $VERSION_FILE" >&2
	exit 1
fi

SIZE="${ICON_SIZE:-180}"
ICON_SHAPE="${ICON_SHAPE:-circle}"

read_version_field() {
	local key="$1"
	local default_value="${2-}"
	python3 -c "import json; v=json.load(open('$VERSION_FILE')); print(v.get('$key', '$default_value'))"
}

LOGO_URL="$(read_version_field logo_url)"
ICON_TEXT="$(read_version_field icon_text)"
ICON_TEXT_SCALE="$(read_version_field icon_text_scale 0.62)"
LOGO_SCALE="$(read_version_field logo_scale 0.72)"
LOGO_CROP="$(read_version_field logo_crop false)"
VERSION_BG_RGB="$(read_version_field icon_bg_rgb 18,18,18)"
BG_RGB="${ICON_BG_RGB:-$VERSION_BG_RGB}"

if [[ -z "$LOGO_URL" && -z "$ICON_TEXT" ]]; then
	echo "Missing logo_url or icon_text in $VERSION_FILE" >&2
	exit 1
fi

mkdir -p "$CONNECTOR_DIR/resources"

python3 <<PY
import io
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

bg = tuple(int(x) for x in "${BG_RGB}".split(","))
size = int("${SIZE}")
logo_url = "${LOGO_URL}"
icon_text = "${ICON_TEXT}"
icon_text_scale = float("${ICON_TEXT_SCALE}")
shape = "${ICON_SHAPE}"
logo_scale = float("${LOGO_SCALE}")
logo_crop = "${LOGO_CROP}".lower() in ("1", "true", "yes")

canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)
if shape == "circle":
	draw.ellipse((0, 0, size - 1, size - 1), fill=bg + (255,))
else:
	draw.rectangle((0, 0, size - 1, size - 1), fill=bg + (255,))

if icon_text:
	font_size = max(24, int(size * icon_text_scale))
	font = None
	for font_path in (
		"/usr/share/fonts/liberation/LiberationSerif-Regular.ttf",
		"/usr/share/fonts/TTF/DejaVuSerif.ttf",
		"/usr/share/fonts/dejavu/DejaVuSerif.ttf",
		"/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
		"/System/Library/Fonts/Supplemental/Times New Roman.ttf",
	):
		try:
			font = ImageFont.truetype(font_path, font_size)
			break
		except OSError:
			continue
	if font is None:
		font = ImageFont.load_default()

	text_bbox = draw.textbbox((0, 0), icon_text, font=font)
	text_width = text_bbox[2] - text_bbox[0]
	text_height = text_bbox[3] - text_bbox[1]
	text_x = (size - text_width) // 2 - text_bbox[0]
	text_y = (size - text_height) // 2 - text_bbox[1]
	draw.text((text_x, text_y), icon_text, fill=(255, 255, 255, 255), font=font)
else:
	with urllib.request.urlopen(
		urllib.request.Request(
			logo_url,
			headers={"User-Agent": "Mozilla/5.0 (compatible; TapestryConnectorBuild/1.0)"},
		),
	) as response:
		logo = Image.open(io.BytesIO(response.read())).convert("RGBA")

	if logo_crop:
		pixels = logo.load()
		width, height = logo.size
		background = pixels[0, 0]

		def is_content(pixel):
			red, green, blue, alpha = pixel
			if alpha < 32:
				return False
			return (
				abs(red - background[0])
				+ abs(green - background[1])
				+ abs(blue - background[2])
				> 30
			)

		min_x, min_y, max_x, max_y = width, height, 0, 0
		for y in range(height):
			for x in range(width):
				if is_content(pixels[x, y]):
					min_x = min(min_x, x)
					min_y = min(min_y, y)
					max_x = max(max_x, x)
					max_y = max(max_y, y)

		if max_x >= min_x and max_y >= min_y:
			logo = logo.crop((min_x, min_y, max_x + 1, max_y + 1))

	logo_max = int(size * logo_scale)
	logo.thumbnail((logo_max, logo_max), Image.Resampling.LANCZOS)
	x = (size - logo.width) // 2
	y = (size - logo.height) // 2
	canvas.paste(logo, (x, y), logo)

flatten = Image.new("RGB", (size, size), bg)
flatten.paste(canvas, mask=canvas.split()[3])

icon_path = Path("${ICON_PNG}")
icon_path.parent.mkdir(parents=True, exist_ok=True)
flatten.save(icon_path, "PNG")

print(f"Wrote {icon_path}")
PY
