#!/usr/bin/env bash
# Optional Linux → Mac rsync helper. Copy to a private directory outside this repo.
#
# Usage:
#   export TAPESTRY_REPO=/path/to/tapestry-connectors   # Linux clone
#   ./sync.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${LOOM_ENV:-$SCRIPT_DIR/loom.env}"
REPO_ROOT="${TAPESTRY_REPO:?Set TAPESTRY_REPO to your local clone path}"

if [[ ! -f "$ENV_FILE" ]]; then
	echo "Missing $ENV_FILE — copy loom.env.example and edit." >&2
	exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

: "${LOOM_HOST:?}"
: "${LOOM_SSH_USER:?}"
: "${LOOM_PATH:?}"

REMOTE="${LOOM_SSH_USER}@${LOOM_HOST}"

# Expand ~ on the remote Mac only
if [[ "$LOOM_PATH" == "~/"* ]]; then
	REMOTE_PATH="\$HOME/${LOOM_PATH:2}"
elif [[ "$LOOM_PATH" == "~" ]]; then
	REMOTE_PATH="\$HOME"
else
	REMOTE_PATH="$LOOM_PATH"
fi

echo "Syncing $REPO_ROOT/Source/ → ${REMOTE}:${REMOTE_PATH}/"
rsync -avz --delete --exclude='.gitkeep' \
	"$REPO_ROOT/Source/" \
	"${REMOTE}:${REMOTE_PATH}/"
