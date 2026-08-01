#!/usr/bin/env bash
# Smoke-check Reactor Mag RSS shape and body-cleaning heuristics for com.reactor.feed.
set -euo pipefail

FEED_URL="${1:-https://reactormag.com/feed/}"
TMP="/tmp/reactor-feed-smoke-$$.xml"

curl -fsSL -A "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; de-de) AppleWebKit/531.22.7 (KHTML, like Gecko) NetNewsWire/3.2.7 Tapestry/1.3" \
	"$FEED_URL" -o "$TMP"

python3 - "$TMP" <<'PY'
import re
import sys
from pathlib import Path

xml = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
items = re.findall(r"<item>(.*?)</item>", xml, re.S)
if not items:
    raise SystemExit("feed has no items")

junk_markers = (
    "post-hero-title",
    "quick-access",
    "appeared first on",
    "wp-block-more-from-category",
)


def clean_reactor_body(body_html: str) -> str:
    body = body_html
    body = re.sub(r"<post-hero\b[\s\S]*?</post-hero>", "", body, flags=re.I)
    body = re.sub(r'<div class="wp-block-more-from-category">[\s\S]*?</div>\s*</div>', "", body, flags=re.I)
    body = re.sub(r"<p[^>]*>\s*The post\s*<a[\s\S]*?appeared first on[\s\S]*?</p>", "", body, flags=re.I)
    body = re.sub(r"\[end-mark\]", "", body)
    body = re.sub(r"<p[^>]*>\s*</p>", "", body, flags=re.I)
    return re.sub(r"\n{3,}", "\n\n", body).strip()


checked = 0
heroes = 0
for item in items[:10]:
    content_match = re.search(
        r"<content:encoded><!\[CDATA\[(.*?)\]\]></content:encoded>",
        item,
        re.S,
    )
    if content_match is None:
        continue
    content = content_match.group(1)
    if "post-hero" not in content:
        continue

    checked += 1
    cleaned = clean_reactor_body(content)
    if not cleaned:
        raise SystemExit("cleaner produced empty body")
    for marker in junk_markers:
        if marker in cleaned:
            raise SystemExit(f"cleaned body still contains {marker}")
    if re.search(r"<post-hero\b", cleaned, re.I):
        raise SystemExit("cleaned body still contains post-hero")
    if re.search(r'class="[^"]*post-hero-title', cleaned):
        raise SystemExit("cleaned body still contains hero title")

    if re.search(r'<figure[^>]*post-hero-image[\s\S]*?<img[^>]+src="([^"]+)"', content, re.I):
        heroes += 1

if checked == 0:
    raise SystemExit("no post-hero items found to validate")

print(f"ok items={len(items)} cleaned={checked} heroes={heroes}")
PY

rm -f "$TMP"
