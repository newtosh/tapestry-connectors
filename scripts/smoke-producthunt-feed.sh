#!/usr/bin/env bash
# Smoke-check Product Hunt Atom shape, join keys, and optional GraphQL enrichment
# for com.producthunt.feed. Never prints PRODUCTHUNT_TOKEN or Authorization values.
set -euo pipefail

TOPIC="${1:-tech}"
FEED_URL="https://www.producthunt.com/feed?category=${TOPIC}"
TMP="/tmp/producthunt-feed-smoke-$$.xml"
UA="Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; de-de) AppleWebKit/531.22.7 (KHTML, like Gecko) NetNewsWire/3.2.7 Tapestry/1.3"

curl -fsSL -A "$UA" "$FEED_URL" -o "$TMP"

python3 - "$TMP" <<'PY'
import re
import sys
from pathlib import Path

xml = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
entries = re.findall(r"<entry\b[\s\S]*?</entry>", xml, flags=re.I)
if len(entries) < 3:
    raise SystemExit(f"expected multiple Atom entries, found {len(entries)}")

atom_ids = 0
rp_ids = 0
for entry in entries[:20]:
    if re.search(r"<id>[^<]*Post/\d+</id>", entry):
        atom_ids += 1
    if re.search(r"/r/p/\d+", entry):
        rp_ids += 1

if atom_ids == 0 and rp_ids == 0:
    raise SystemExit("no Post/<id> or /r/p/<id> join keys found in feed entries")

titles = [re.search(r"<title>([^<]+)</title>", e) for e in entries[:5]]
if any(t is None for t in titles):
    raise SystemExit("entry missing title")

print(f"ok feed entries={len(entries)} atom_post_ids={atom_ids} rp_ids={rp_ids}")
PY

if [[ -n "${PRODUCTHUNT_TOKEN:-}" ]]; then
	python3 - "$TMP" <<'PY'
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

xml = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
ids = []
for match in re.finditer(r"Post/(\d+)", xml):
    pid = match.group(1)
    if pid not in ids:
        ids.append(pid)
    if len(ids) >= 3:
        break
if not ids:
    raise SystemExit("no post ids available for enrichment smoke")

token = os.environ["PRODUCTHUNT_TOKEN"].strip()
if not token:
    raise SystemExit("PRODUCTHUNT_TOKEN is empty")

aliases = []
var_decls = []
variables = {}
for i, pid in enumerate(ids):
    var = f"id{i}"
    var_decls.append(f"${var}: ID!")
    aliases.append(
        f"p{i}: post(id: ${var}) {{ id name votesCount dailyRank thumbnail {{ url }} media {{ url type }} }}"
    )
    variables[var] = pid

query = "query EnrichPosts(" + ", ".join(var_decls) + ") {\n" + "\n".join(aliases) + "\n}"
body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
req = urllib.request.Request(
    "https://api.producthunt.com/v2/api/graphql",
    data=body,
    method="POST",
    headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "tapestry-connectors-smoke/1.0",
    },
)

with urllib.request.urlopen(req, timeout=30) as resp:
    status = resp.status
    remaining = resp.headers.get("X-Rate-Limit-Remaining")
    payload = json.loads(resp.read().decode("utf-8"))

if status == 429:
    raise SystemExit("enrichment smoke hit HTTP 429")
if status >= 400:
    raise SystemExit(f"enrichment smoke HTTP {status}")
if payload.get("errors") and not payload.get("data"):
    raise SystemExit("enrichment smoke GraphQL errors without data")

data = payload.get("data") or {}
https_media = 0
for i in range(len(ids)):
    node = data.get(f"p{i}") or {}
    thumb = ((node.get("thumbnail") or {}).get("url") or "")
    if thumb.startswith("https://"):
        https_media += 1
        continue
    media = node.get("media") or []
    for item in media:
        url = (item or {}).get("url") or ""
        if url.startswith("https://"):
            https_media += 1
            break

if https_media == 0:
    raise SystemExit("enrichment smoke found no https media URLs")

# Do not print token; remaining quota is safe.
print(f"ok enrichment posts={len(ids)} https_media={https_media} rate_remaining={remaining}")
PY
else
	echo "ok enrichment skipped (PRODUCTHUNT_TOKEN unset)"
fi

rm -f "$TMP"
