#!/usr/bin/env bash
# Smoke-check the public YouTube playlist Atom feed shape this connector expects.
set -euo pipefail

PLAYLIST_ID="${1:-PLJtitKU0CAegwL_3j59S7_93IEzvhYcDR}"
FEED_URL="https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}"
TMP="/tmp/yt-playlist-smoke-$$.xml"

curl -fsSL -A "WhatsApp/2" "$FEED_URL" -o "$TMP"

python3 - "$PLAYLIST_ID" "$TMP" <<'PY'
import re
import sys

playlist_id = sys.argv[1]
xml = open(sys.argv[2], encoding="utf-8").read()
if playlist_id not in xml:
    raise SystemExit("feed missing playlist id")
ids = re.findall(r"<yt:videoId>([^<]+)</yt:videoId>", xml)
if not ids:
    raise SystemExit("feed has no yt:videoId entries")
titles = re.findall(r"<media:title>([^<]+)</media:title>", xml)
print(f"ok playlist={playlist_id} videos={len(ids)} sample={titles[0] if titles else ids[0]}")
PY

rm -f "$TMP"
