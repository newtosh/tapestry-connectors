---
title: Product Hunt Topic Feed Connector - Plan
type: feat
date: 2026-08-01
topic: producthunt-connector
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Product Hunt Topic Feed Connector - Plan

## Goal Capsule

- **Objective:** Ship a Product Hunt Tapestry connector that loads a topic Atom feed (default `tech`) with branded presentation, and optionally enriches items with screenshots via a developer API token while staying inside Product Hunt rate limits.
- **Product authority:** This Product Contract owns connector behavior, enrichment rules, topic configuration, and success criteria. Implementation design is deferred to `ce-plan`.
- **Open blockers:** None for requirements. Stretch enrichment (votes / day rank) depends on API complexity findings during planning or implementation.

---

## Product Contract

### Summary

A dedicated Product Hunt connector for Tapestry. Without a token it improves on the generic Blog Feed experience for PH topic feeds. With an optional developer token it attaches thumbnail and first gallery images that the Atom feed does not expose.

### Problem Frame

Product Hunt’s Atom topic feed (`/feed?category=…`) returns launches with title, tagline, maker, and discussion/link markup, but no media. Timeline cards are text-only. Product HTML pages are Cloudflare-protected, so Uncrate-style page scraping is unreliable. Product Hunt’s GraphQL API exposes `thumbnail` and `media` and is reachable with a personal developer token (verified in session).

### Key Decisions

- **Feed-first with optional API enrichment** (session-settled: user-directed — chosen over feed-only or API-only: works without a key; API unlocks screenshots when available). Governs R3–R7.
- **Never scrape product HTML for media** (session-settled: user-approved — chosen over page enrichment: Cloudflare challenges block reliable fetches). Governs R8.
- **v1 enrichment = thumbnail + first gallery image** (session-settled: user-directed — chosen over thumbnail-only or full meta: biggest visual win within a lean query). Governs R6.
- **Votes / day rank are stretch** (session-settled: user-directed — chosen over hard-required meta: include only if complexity/quota findings allow). Governs R9.
- **Configurable topic slug, default `tech`** (session-settled: user-directed — chosen over tech-hardcoded: reuse one connector across PH topics). Governs R2.
- **Developer Token pasted into connector settings** (session-settled: user-approved — chosen over in-app OAuth: personal connector; token already obtained). Governs R5.

### Requirements

**Connector identity and feed**

- R1. A dedicated connector exists with a unique reverse-domain id, Product Hunt branding (display name, icon, default color), and `item_style` appropriate for launch cards in the timeline.
- R2. The connector accepts a topic slug setting that defaults to `tech` and loads `https://www.producthunt.com/feed?category=<slug>`.
- R3. Without an API token, the connector still loads and renders feed items: product name, tagline, maker when present, discussion link, and product/outbound link, with branded feed identity (not the generic Blog Feed globe).

**Optional API enrichment**

- R4. An optional developer token setting enables GraphQL enrichment against Product Hunt’s API.
- R5. When the token is present and valid, each rendered item may include a hero image from the post thumbnail and, when available, the first gallery media image.
- R6. Enrichment uses the official API only (no product-page HTML fetch).
- R7. Enrichment respects Product Hunt rate limits (GraphQL complexity quota per 15 minutes). The connector must not hammer the API: prefer lean queries, bound work per refresh, and on HTTP 429 still return feed-only items rather than failing the whole load.
- R8. Invalid or missing tokens never break the feed path; items degrade to feed-only presentation.
- R9. Stretch (non-blocking for v1): when enrichment runs and quota allows, surface light meta such as vote count and/or day rank without displacing thumbnail + first gallery as the primary enrichment.

**Packaging and docs**

- R10. The connector is wired into the repo build/package list, README, and changelog release notes pattern used by other connectors.
- R11. README documents how to create a Product Hunt developer token and paste it into the connector setting.

### Actors

- A1. **Reader** — consumes Product Hunt launches in Tapestry timeline (iOS) or Loom preview.
- A2. **Connector author** — configures topic slug and optional developer token; develops and packages the connector.

### Key Flows

- F1. **Subscribe without API token**
  - **Trigger:** Reader adds the Product Hunt connector with default or custom topic, no token.
  - **Steps:** Connector fetches the topic Atom feed → parses entries → renders branded cards with title, tagline, maker, links.
  - **Outcome:** Usable tech (or other topic) feed without screenshots.
  - **Covered by:** R1–R3

- F2. **Subscribe with API token**
  - **Trigger:** Reader pastes a developer token and refreshes.
  - **Steps:** Feed loads as in F1 → connector enriches items via GraphQL for thumbnail + first gallery image within rate limits → timeline shows media attachments.
  - **Outcome:** Same feed with screenshots when API data is available.
  - **Covered by:** R4–R8

- F3. **Rate limit or API failure**
  - **Trigger:** API returns 429 or errors during enrichment.
  - **Steps:** Connector stops or skips further enrichment for that refresh → still `processResults` with feed-parsed items.
  - **Outcome:** Timeline remains populated; media may be missing for some or all items that refresh.
  - **Covered by:** R7, R8

### Acceptance Examples

- AE1. **Feed works without token**
  - **Covers R3.**
  - **Given:** Topic `tech`, empty token.
  - **When:** Load runs in Loom.
  - **Then:** Multiple launch cards appear with Product Hunt branding, name, tagline, and links; no crash.

- AE2. **Screenshots with token**
  - **Covers R5, R6.**
  - **Given:** Valid developer token and topic `tech`.
  - **When:** Load runs in Loom.
  - **Then:** At least some recent items show a thumbnail and/or gallery image attachment sourced from the API (not scraped HTML).

- AE3. **Topic override**
  - **Covers R2.**
  - **Given:** Topic slug set to a non-tech category that has a working `/feed?category=` feed.
  - **When:** Load runs.
  - **Then:** Items reflect that topic’s feed, not hard-coded tech-only content.

- AE4. **429 does not empty the timeline**
  - **Covers R7, R8.**
  - **Given:** Token present but enrichment hits rate limit mid-refresh (or simulated).
  - **When:** Load completes.
  - **Then:** Feed items still appear; enrichment may be partial or absent for that refresh.

### Scope Boundaries

- No scraping of `producthunt.com` product/post HTML for images or meta.
- No full OAuth authorize/redirect flow inside Tapestry; Developer Token paste only for v1.
- No Product Hunt write actions (upvote, comment, follow).
- No multi-topic fan-in in one feed instance (one topic slug per feed).
- Stories/newsletter editorial RSS is out of scope (no reliable public feed found).

### Assumptions

- Topic Atom feeds remain publicly available at `https://www.producthunt.com/feed?category=<slug>` without authentication.
- GraphQL `thumbnail` / `media` remain available to developer tokens for public posts.
- Mapping Atom entries to API posts (via post id in feed links such as `/r/p/<id>`) is feasible; if not, planning must choose an alternate public lookup without scraping HTML.
- Personal use of one developer token under published rate limits is acceptable for this connector’s refresh patterns.

### Outstanding Questions

- OQ1. Exact Atom→API post identity mapping (feed embeds `/r/p/<id>`; confirm as the stable join key in planning).
- OQ2. Whether stretch meta (votes / day rank) fits a single lean batched query under the complexity budget; defer to planning findings.
- OQ3. Connector reverse-domain id spelling (`com.producthunt.feed` vs similar) — planning convention choice unless a conflict appears.

### Success Criteria

- Default tech topic feed is clearly better than Blog Feed on Atom alone (branding + clean card text).
- With a token, screenshots appear for enriched items without Cloudflare scraping.
- Missing/invalid token or API 429 never blanks the feed.
- Topic slug setting works for at least one non-default topic that PH exposes via Atom.
- Docs are enough for the author to recreate token setup and install the connector.
