#!/usr/bin/env python3
"""Extract a Keep-a-Changelog release section for GitHub release notes.

Looks for a heading matching the release tag, then falls back to [Unreleased]:

  ## [0.3.5] - 2026-08-01
  ## [v0.3.5] - 2026-08-01
  ## [Unreleased]

Usage:
  python3 scripts/extract-changelog-entry.py v0.3.5
  python3 scripts/extract-changelog-entry.py v0.3.5 --changelog CHANGELOG.md
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

HEADING_RE = re.compile(
	r"^##\s+\[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$",
	re.MULTILINE,
)
FENCE_RE = re.compile(r"^```.*?$.*?^```\s*$", re.MULTILINE | re.DOTALL)


def normalize_version(value: str) -> str:
	text = value.strip()
	if text.lower() == "unreleased":
		return "unreleased"
	if text.startswith("v") or text.startswith("V"):
		text = text[1:]
	return text


def strip_fenced_blocks(changelog: str) -> str:
	"""Remove markdown fenced code blocks so examples are not treated as sections."""
	return FENCE_RE.sub("", changelog)


def split_sections(changelog: str) -> list[tuple[str, str | None, str]]:
	"""Return (heading_label, date_or_none, body) for each ## [label] section."""
	changelog = strip_fenced_blocks(changelog)
	matches = list(HEADING_RE.finditer(changelog))
	sections: list[tuple[str, str | None, str]] = []
	for index, match in enumerate(matches):
		start = match.end()
		end = matches[index + 1].start() if index + 1 < len(matches) else len(changelog)
		body = changelog[start:end].strip()
		# Stop at a later H1 if present (defensive); bodies are usually just H2/H3.
		sections.append((match.group(1).strip(), match.group(2), body))
	return sections


def extract_entry(changelog: str, tag: str) -> tuple[str, str]:
	"""Return (source_label, body) for the tag, or raise SystemExit."""
	target = normalize_version(tag)
	sections = split_sections(changelog)
	if not sections:
		raise SystemExit("No ## [version] sections found in changelog")

	unreleased_body = None
	for label, _date, body in sections:
		normalized = normalize_version(label)
		if normalized == target:
			if not body:
				raise SystemExit(f"Changelog section [{label}] is empty")
			return label, body
		if normalized == "unreleased" and unreleased_body is None:
			unreleased_body = body

	if unreleased_body:
		if not unreleased_body.strip():
			raise SystemExit(
				f"No changelog section for {tag}, and [Unreleased] is empty. "
				f"Add ## [{target}] - YYYY-MM-DD or fill in ## [Unreleased]."
			)
		return "Unreleased", unreleased_body

	raise SystemExit(
		f"No changelog section for {tag}. "
		f"Add ## [{target}] - YYYY-MM-DD (or ## [Unreleased]) before releasing."
	)


def main() -> int:
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("tag", help="Release tag, e.g. v0.3.5")
	parser.add_argument(
		"--changelog",
		default="CHANGELOG.md",
		type=Path,
		help="Path to changelog (default: CHANGELOG.md)",
	)
	parser.add_argument(
		"--allow-unreleased-fallback",
		action="store_true",
		default=True,
		help="Use [Unreleased] when the exact version section is missing (default: true)",
	)
	parser.add_argument(
		"--require-exact",
		action="store_true",
		help="Require an exact version section; do not fall back to [Unreleased]",
	)
	args = parser.parse_args()

	if not args.changelog.is_file():
		raise SystemExit(f"Missing changelog: {args.changelog}")

	text = args.changelog.read_text(encoding="utf-8")
	if args.require_exact:
		target = normalize_version(args.tag)
		for label, _date, body in split_sections(text):
			if normalize_version(label) == target:
				if not body:
					raise SystemExit(f"Changelog section [{label}] is empty")
				sys.stdout.write(body + "\n")
				return 0
		raise SystemExit(f"No exact changelog section for {args.tag}")

	_label, body = extract_entry(text, args.tag)
	sys.stdout.write(body + "\n")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
