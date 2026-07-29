# Changelog

All notable changes to connectors in this repo are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [com.polygon.feed 0.1.2] - 2026-07-29

### Fixed

- Use a hosted HTTPS icon URL (GitHub raw) for `verify()`, feed preview, and author avatars. Loom/Tapestry does not apply data-URI icons in those runtime paths and was falling back to Polygon's transparent favicon.

## [com.polygon.feed 0.1.1] - 2026-07-29

### Fixed

- Set author `avatar` on every feed item so the timeline preview uses the dark-background Polygon icon instead of the transparent site favicon.
- Declare `provides_attachments: true` since enclosure images are supplied directly.
- Sync `semver` into `plugin-config.json` so Loom metadata shows the human-readable release alongside Tapestry's integer `version`.

## [com.polygon.feed 0.1.0] - 2026-07-29

### Added

- Polygon RSS connector with deduped intro text and conditional feed requests.
- Dark-background feed icon (180×180) for better contrast in the timeline.
- `version.json` semver metadata alongside Tapestry's integer `version` field.
