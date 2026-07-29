#!/usr/bin/env bash
# Run on the Mac mini inside a clone of this repository.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "→ Pulling latest"
git pull --ff-only

if command -v make >/dev/null 2>&1 && [[ -f Makefile ]]; then
	echo "→ Building connector assets"
	make build
fi

CONNECTORS_DIR="$REPO_ROOT/Source"

cat <<EOF

Ready for Tapestry Loom.

Connectors folder (set once in Loom with ⌘F):
  $CONNECTORS_DIR

Then: ⌘R → Load to refresh after each git pull.

EOF

if [[ "${OPEN_LOOM:-}" == "1" ]]; then
	if [[ -d "/Applications/Tapestry Loom.app" ]]; then
		open -a "Tapestry Loom"
	elif [[ -d "/Applications/Loom.app" ]]; then
		open -a "Loom"
	fi
fi
