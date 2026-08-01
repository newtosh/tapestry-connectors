# Product Hunt

Topic Atom feed for [Product Hunt](https://www.producthunt.com) with a branded icon. Optional Developer Token enrichment adds thumbnail and gallery images via the official GraphQL API (no product-page scraping).

## Settings

- **Topic slug(s)** — defaults to `tech`. Accepts multiple slugs separated by commas or spaces (e.g. `apple, developer-tools`), up to 5. Each topic is fetched as its own Atom feed (`https://www.producthunt.com/feed?category=<slug>`) — Product Hunt's feed endpoint has no native multi-topic filter — and merged/deduped/sorted by date. Enrichment is capped globally (not per topic), so adding topics doesn't increase GraphQL cost.
- **Developer Token** — optional. Paste a Personal Developer Token from a Product Hunt API application. Without a token, launch cards still load from the Atom feed (text + links only).
- **Show Matched Topic(s)** — off by default. When on, each card lists which of your configured topics it matched (useful once you're running multiple topics and a post shows up under more than one).

### Getting a Developer Token

1. Open [Product Hunt API Dashboard](https://www.producthunt.com/v2/oauth/applications) and create an application (Confidential is fine; redirect URI can be `https://localhost`).
2. Copy the **Developer Token**.
3. Paste it into this connector’s Developer Token setting in Tapestry.

Rate limits apply per application (GraphQL complexity quota). The connector uses lean queries, caps enrichments per refresh, and falls back to feed-only items on HTTP 429 or API errors. Never commit or share your token.

**More info:** [github.com/newtosh/tapestry-connectors](https://github.com/newtosh/tapestry-connectors)
