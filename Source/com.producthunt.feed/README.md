# Product Hunt

Topic Atom feed for [Product Hunt](https://www.producthunt.com) with a branded icon. Optional Developer Token enrichment adds thumbnail and gallery images via the official GraphQL API (no product-page scraping).

## Settings

- **Topic slug** — defaults to `tech`. Loads `https://www.producthunt.com/feed?category=<slug>`.
- **Developer Token** — optional. Paste a Personal Developer Token from a Product Hunt API application. Without a token, launch cards still load from the Atom feed (text + links only).

### Getting a Developer Token

1. Open [Product Hunt API Dashboard](https://www.producthunt.com/v2/oauth/applications) and create an application (Confidential is fine; redirect URI can be `https://localhost`).
2. Copy the **Developer Token**.
3. Paste it into this connector’s Developer Token setting in Tapestry.

Rate limits apply per application (GraphQL complexity quota). The connector uses lean queries, caps enrichments per refresh, and falls back to feed-only items on HTTP 429 or API errors. Never commit or share your token.

**More info:** [github.com/newtosh/tapestry-connectors](https://github.com/newtosh/tapestry-connectors)
