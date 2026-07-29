#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONNECTOR_DIR="$REPO_ROOT/Source/com.polygon.feed"
ICON_PNG="$CONNECTOR_DIR/icon.png"

BG_RGB="${ICON_BG_RGB:-18,18,18}"
LOGO_URL="${POLYGON_LOGO_URL:-https://www.polygon.com/public/build/images/favicon-96x96.png}"
SIZE="${ICON_SIZE:-180}"

mkdir -p "$CONNECTOR_DIR/resources"

python3 <<PY
import io
import urllib.request
from pathlib import Path

from PIL import Image

bg = tuple(int(x) for x in "${BG_RGB}".split(","))
size = int("${SIZE}")
logo_url = "${LOGO_URL}"

with urllib.request.urlopen(logo_url) as response:
    logo = Image.open(io.BytesIO(response.read())).convert("RGBA")

canvas = Image.new("RGBA", (size, size), bg + (255,))
logo_max = int(size * 0.72)
logo.thumbnail((logo_max, logo_max), Image.Resampling.LANCZOS)
x = (size - logo.width) // 2
y = (size - logo.height) // 2
canvas.paste(logo, (x, y), logo)

icon_path = Path("${ICON_PNG}")
icon_path.parent.mkdir(parents=True, exist_ok=True)
canvas.convert("RGB").save(icon_path, "PNG")

print(f"Wrote {icon_path}")
PY
