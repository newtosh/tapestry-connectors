#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONNECTOR_ID="${CONNECTOR_ID:-com.polygon.feed}"
CONNECTOR_DIR="$REPO_ROOT/Source/$CONNECTOR_ID"
OUT_DIR="$REPO_ROOT/Downloads"

bash "$SCRIPT_DIR/build-connector.sh"

SEMVER="$(python3 -c "import json; print(json.load(open('$CONNECTOR_DIR/version.json'))['semver'])")"
OUT_FILE="$OUT_DIR/${CONNECTOR_ID}-v${SEMVER}.tapestry"
STAGING="$(mktemp -d)"

trap 'rm -rf "$STAGING"' EXIT

cp "$CONNECTOR_DIR/plugin-config.json" "$CONNECTOR_DIR/plugin.js" "$CONNECTOR_DIR/README.md" "$STAGING/"
cp "$CONNECTOR_DIR/icon.png" "$STAGING/"
cp -r "$CONNECTOR_DIR/resources" "$STAGING/"
cp "$CONNECTOR_DIR/version.json" "$STAGING/"

for optional in ui-config.json discovery.json suggestions.json apps.json; do
	if [[ -f "$CONNECTOR_DIR/$optional" ]]; then
		cp "$CONNECTOR_DIR/$optional" "$STAGING/"
	fi
done

mkdir -p "$OUT_DIR"

python3 <<PY
import zipfile
from pathlib import Path

staging = Path("$STAGING")
out_file = Path("$OUT_FILE")

with zipfile.ZipFile(out_file, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(staging.rglob("*")):
        if path.is_file():
            zf.write(path, path.relative_to(staging))

print(f"Packaged {out_file} ({out_file.stat().st_size} bytes)")
PY

# Stable alias for latest build
cp "$OUT_FILE" "$OUT_DIR/${CONNECTOR_ID}.tapestry"

echo "Packaged $OUT_FILE"
echo "Also: $OUT_DIR/${CONNECTOR_ID}.tapestry"
