# Changelog

All notable changes to this project are documented here.

Release notes are keyed by **repo release version** (the GitHub `v*` tag without the leading `v`). The Release workflow publishes notes from the section that matches the next tag, or from `[Unreleased]` if that section is missing.

Format (Keep a Changelog) — use a real `## [X.Y.Z] - YYYY-MM-DD` heading for each GitHub `vX.Y.Z` release (examples intentionally omit the `##` marker so they are not parsed):

```markdown
[Unreleased]

Added
- Notes that will ship in the next auto-release.

[X.Y.Z] - YYYY-MM-DD

Added
- Notes for that GitHub release.
```

Older entries below use per-connector headings and remain as history.

## [Unreleased]

## [0.3.5] - 2026-08-01

### Added

- Auto-release on merge to `main` (patch-bump from the latest `v*` tag, or an explicit tag via workflow dispatch).
- Release notes are parsed from this changelog: the section matching the release version, with fallback to `[Unreleased]`.

### Changed

- Release workflow reads the connector list from `Makefile` instead of a hardcoded copy.

## [com.newtosh.youtube.playlist 0.1.4] - 2026-07-30

### Changed

- Remove the temporary **Loaded N of M feed videos** diagnostic annotation (Loom + iOS confirmed the connector imports the full playlist; iOS then prunes older cards).

## [com.newtosh.youtube.playlist 0.1.3] - 2026-07-30

### Fixed

- Harden playlist loading: parse Atom `<entry>` blocks with `indexOf` (not global regex), coerce the feed body to a string, and fall back between raw XML and `xmlParse`.
- Use stock-style `sendRequest(feedUrl)` for the Atom document (custom headers only for HTML avatar pages).
- Add a visible **Loaded N of M feed videos** annotation on the newest item so we can tell connector parse count from app-side filtering.

## [com.newtosh.youtube.playlist 0.1.2] - 2026-07-30

### Fixed

- **Video Description** setting now appears in Edit Feed (choices need a separate `choices` list; the list had been incorrectly stuffed into `value`).
- Load all playlist videos by parsing Atom `<entry>` blocks directly from the feed XML.
- Namespace item URIs with `list=` so playlist items are not collapsed against the same watch URLs from the built-in YouTube Channel connector.

## [com.newtosh.youtube.playlist 0.1.1] - 2026-07-30

### Fixed

- Show the channel avatar on each post (feed identity with cached avatar), not the generic person placeholder.
- Return the full playlist Atom entry set: harden array parsing and fall back to raw `<entry>` extraction when `xmlParse` collapses repeats.
- Remove the redundant `youtube-nocookie.com` link-preview card under the thumbnail; timeline uses the thumbnail only, playback stays in the detail embed.

### Added

- **Video Description** setting: Short (default), Full, or Off.

## [com.newtosh.youtube.playlist 0.1.0] - 2026-07-30

### Added

- New **YT Playlist Feed** community connector (`com.newtosh.youtube.playlist`) — labeled separately from the built-in YouTube Channel connector — that accepts playlist URLs (stock `com.youtube` rejects them) via YouTube’s public `playlist_id` Atom feed.
- In-app detail embeds using Privacy Enhanced Mode (`youtube-nocookie.com`) plus `playsinline=1` / `rel=0` / `modestbranding=1` to prefer watching inside Tapestry instead of handing off to the YouTube app.
- Timeline thumbnail `MediaAttachment` plus a prefilled `LinkAttachment` so cards do not need Open Graph fetches.
- Optional channel URL support and toggles for privacy-enhanced embeds and video descriptions.

## [com.polygon.feed 0.1.17] - 2026-07-30

### Fixed

- Restore plain-text body bylines. Data-URI SVG byline images were dropped entirely by the timeline preview.

## [com.gearpatrol.feed 0.1.13] - 2026-07-30

### Fixed

- Restore plain-text body bylines after data-URI SVG images were dropped by the timeline preview.

## [com.coolmaterial.steals.feed 0.2.15] - 2026-07-30

### Fixed

- Restore plain-text body bylines after data-URI SVG images were dropped by the timeline preview.

## [com.polygon.feed 0.1.16] - 2026-07-30

### Fixed

- Render writer bylines as compact SVG images in the body so they stay below the title and read smaller than paragraph text, without switching to article layout (which breaks the dark branded icon).

## [com.gearpatrol.feed 0.1.12] - 2026-07-30

### Fixed

- Same compact SVG byline treatment for smaller below-title bylines with branded post-layout icons.

## [com.coolmaterial.steals.feed 0.2.14] - 2026-07-30

### Fixed

- Same compact SVG byline treatment for editorial posts.

## [com.polygon.feed 0.1.15] - 2026-07-30

### Fixed

- Stop trading icon vs byline: keep post layout + hosted dark feed avatar (only path for the branded icon), and put the writer byline in the body below the title (annotations render above the feed name). Wrapped in `<small>` as a best-effort size hint.

## [com.gearpatrol.feed 0.1.11] - 2026-07-30

### Fixed

- Same dual approach: post-layout branded avatar + body byline below the title.

## [com.coolmaterial.steals.feed 0.2.13] - 2026-07-30

### Fixed

- Same dual approach: post-layout branded avatar + body byline below the title on editorial posts.

## [com.polygon.feed 0.1.14] - 2026-07-30

### Fixed

- Restore v0.1.7/v0.1.11 post-layout pattern: feed identity with hosted dark avatar (article layout always uses transparent `lookupIcon(polygon.com)`). Writer byline via annotation.

## [com.gearpatrol.feed 0.1.10] - 2026-07-30

### Fixed

- Restore post layout with branded feed identity avatar and a single writer byline annotation.

## [com.coolmaterial.steals.feed 0.2.12] - 2026-07-30

### Fixed

- Restore post layout with branded feed identity avatar and a single writer byline annotation.

## [com.polygon.feed 0.1.13] - 2026-07-30

### Fixed

- Use article layout with the RSS writer as `item.author` so Tapestry renders the native smaller byline (body HTML cannot change timeline font size). Dropped `accountIdentity` to avoid a duplicate site byline.

## [com.gearpatrol.feed 0.1.9] - 2026-07-30

### Fixed

- Use article layout with the RSS writer as `item.author` for the native smaller byline.

## [com.coolmaterial.steals.feed 0.2.11] - 2026-07-30

### Fixed

- Use article layout with the RSS writer as `item.author` for the native smaller byline on editorial posts.

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
