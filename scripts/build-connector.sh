#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONNECTOR_ID="${CONNECTOR_ID:-com.polygon.feed}"
CONNECTOR_DIR="$REPO_ROOT/Source/$CONNECTOR_ID"
VERSION_FILE="$CONNECTOR_DIR/version.json"

if [[ ! -f "$VERSION_FILE" ]]; then
	echo "Missing $VERSION_FILE" >&2
	exit 1
fi

bash "$SCRIPT_DIR/build-icon.sh"

python3 <<PY
import base64
import json
from pathlib import Path

connector_dir = Path("$CONNECTOR_DIR")
version = json.loads((connector_dir / "version.json").read_text())
tapestry_version = int(version["tapestry_version"])
icon_png = connector_dir / "icon.png"

# Embed local PNG when requested (or when icon_url is missing). Useful before the
# GitHub-hosted icon exists on main, and avoids runtime fetches for avatars.
if version.get("icon_embed") or not version.get("icon_url"):
	if not icon_png.is_file():
		raise SystemExit(f"Missing {icon_png} for embedded icon")
	icon_url = "data:image/png;base64," + base64.b64encode(icon_png.read_bytes()).decode("ascii")
else:
	base_icon_url = version["icon_url"].split("?")[0]
	icon_url = f"{base_icon_url}?v={tapestry_version}"

resources_dir = connector_dir / "resources"
resources_dir.mkdir(parents=True, exist_ok=True)
(resources_dir / "icon-url.txt").write_text(icon_url, encoding="utf-8")

config_path = connector_dir / "plugin-config.json"
config = json.loads(config_path.read_text())
config["icon"] = icon_url
config["version"] = int(version["tapestry_version"])
config["semver"] = version["semver"]
config_path.write_text(json.dumps(config, indent=2) + "\n")

print(f"Built {connector_dir.name} v{version['semver']} (Tapestry version {config['version']})")
PY
