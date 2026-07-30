# Changelog

All notable changes to connectors in this repo are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [com.polygon.feed 0.1.12] - 2026-07-30

### Fixed

- Move writer byline into the body below the title (with leading/trailing line breaks). Annotations render above the feed name; body placement matches the intended Verge-like order while keeping post layout and the branded icon.

## [com.gearpatrol.feed 0.1.8] - 2026-07-30

### Fixed

- Move writer byline into the body below the title (with leading/trailing line breaks). Category stays as a separate annotation.

## [com.coolmaterial.steals.feed 0.2.10] - 2026-07-30

### Fixed

- Move writer byline into the body below the title (with leading/trailing line breaks). Category stays as a separate annotation.

## [com.gearpatrol.feed 0.1.7] - 2026-07-30

### Fixed

- Match Polygon byline handling: use a single writer annotation only. Pairing byline + category annotations was concatenated in the timeline (e.g. `by tbowe Audio`).

## [com.coolmaterial.steals.feed 0.2.9] - 2026-07-30

### Fixed

- Match Polygon byline handling: use a single writer annotation only (no category mashup).

## [com.polygon.feed 0.1.11] - 2026-07-30

### Fixed

- Revert article layout: restore post layout with the curated dark Polygon icon (article style falls back to the transparent site favicon).
- Show a single writer byline below the title via annotation (`by Writer`), not a duplicate synthetic site byline.

## [com.gearpatrol.feed 0.1.6] - 2026-07-30

### Fixed

- Revert article layout; restore post layout with branded icon and a single writer byline annotation below the title.

## [com.coolmaterial.steals.feed 0.2.8] - 2026-07-30

### Fixed

- Revert article layout; restore post layout with branded icon and a single writer byline annotation below the title.

## [com.polygon.feed 0.1.10] - 2026-07-30

### Fixed

- Use article layout with the RSS writer as `author` so bylines get native Verge-style spacing and smaller type (body paragraphs cannot match that typography).

## [com.gearpatrol.feed 0.1.5] - 2026-07-30

### Fixed

- Use article layout with the RSS writer as `author` for native byline spacing and size.

## [com.coolmaterial.steals.feed 0.2.7] - 2026-07-30

### Fixed

- Use article layout with the RSS writer as `author` for native byline spacing and size.

## [com.polygon.feed 0.1.9] - 2026-07-30

### Fixed

- Move writer bylines from the post header username into the body (below the title), matching Verge-style article cards.

## [com.gearpatrol.feed 0.1.4] - 2026-07-30

### Fixed

- Move writer bylines from the post header username into the body (below the title).

## [com.coolmaterial.steals.feed 0.2.6] - 2026-07-30

### Fixed

- Move writer bylines from the post header username into the body (below the title).

## [com.coolmaterial.steals.feed 0.2.5] - 2026-07-30

### Fixed

- Fix WordPress image URL normalization: size-suffix stripping used the height capture group instead of the file extension, producing broken URLs like `…/1-13394` instead of `…/1-13.png`.
- Reject image candidates that lack a valid file extension.

### Added

- Image search fallback (Brave/Bing) for editorial posts when Cloudflare blocks direct page fetches; ranks candidates by upload date folder and article relevance.
- Editorial enrichment fallbacks when article pages return 403: DuckDuckGo HTML snippets for body text, multi-user-agent retries, JSON-LD parsing.

### Changed

- Merged Cool Material editorial feed (`/feed/`) with steals feed (`/steals/feed/`) in one connector.
- Steal items use RSS-only parsing; junk Walmart nav links filtered from purchase-link extraction.

## [com.coolmaterial.steals.feed 0.2.2] - 2026-07-29

### Fixed

- Editorial feed disappearing after connector upgrade: fallback when conditional GET returns empty; correct steal-item detection in main loop.

## [com.coolmaterial.steals.feed 0.2.1] - 2026-07-29

### Fixed

- Steal vs editorial detection; trim junk purchase links from steal post bodies.

## [com.coolmaterial.steals.feed 0.2.0] - 2026-07-29

### Added

- Cool Material connector merging editorial features/partner posts with steals deals.

## [com.uncrate.feed 0.1.0] - 2026-07-29

### Added

- Uncrate connector for the FeedBurner RSS feed (`feeds.feedburner.com/uncrate`).
- Strips floated thumbnails and “Visit Uncrate for the full post” boilerplate from item bodies.
- Category labels via annotations; hero images from RSS enclosures.
- Dark circular branded icon (post layout).

## [com.polygon.feed 0.1.7] - 2026-07-29

### Fixed

- Use `post` layout with a Polygon feed identity (dark circular avatar) because `article` layout always calls `lookupIcon(polygon.com)` for the header icon — our hosted icon cannot override that.
- Approximate article card order: **Polygon** (author row + icon) → **title** → **by Writer** (annotation).
- Drop `service_name: Gaming` so the header is not prefixed with a category label.

## [com.polygon.feed 0.1.6] - 2026-07-29

### Fixed

- Restore `item_style: article` for site → title → byline layout (matching iOS article cards).
- Hide `service_name` in the header (`default_service_name_visibility: hidden`) so only "Polygon" shows, not "Gaming".
- Author is the RSS writer name only (no service username row).
- Circular dark icon (`#121212`) so Tapestry's round avatar mask does not show a white ring around a square light icon.
- Append `?v=<tapestry_version>` to the hosted icon URL to bust CDN/device cache.

## [com.polygon.feed 0.1.5] - 2026-07-29

### Changed

- Rebuild icon with dark background (`#121212`) now that post layout uses the author avatar path where contrast works.

## [com.polygon.feed 0.1.4] - 2026-07-29

### Fixed

- Switch to `item_style: post` so the timeline uses the author avatar (hosted icon) instead of `lookupIcon(polygon.com)`, which always returns the transparent wireframe favicon in article layout.
- Apply the Glass connector identity pattern: writer name in `identity.name`, branded `identity.avatar`, service label in `identity.username`.
- Fix missing spaces after inline HTML tags (e.g. `Battlefield 6has`).

### Changed

- Article layout dropped for now — Tapestry article style sources its header icon from the site domain, which cannot be overridden by connector config.

## [com.polygon.feed 0.1.3] - 2026-07-29

### Fixed

- Rebuild icon with a light background (`#F5F5F5`) so the badge stays visible on slate feed headers; `#121212` blended into the header and only the wireframe showed at preview size.
- Use feed-branded author (`Polygon` + hosted icon) and move writer names to an annotation so Tapestry does not replace avatars with scraped author photos.

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
