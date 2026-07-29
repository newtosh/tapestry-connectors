# Polygon (Optimized) — v0.1.1

A Tapestry connector for [Polygon](https://www.polygon.com) that improves on the generic Blog Feed connector:

- Dark-background feed icon (180×180) for timeline contrast
- Author avatars use the same icon (fixes invisible favicon in article preview headers)
- Removes duplicate intro text when RSS `<description>` repeats the first paragraph of `<content:encoded>`
- Uses `item_style: article` for long-form reading

## Versioning

Tapestry Loom shows connector metadata from `plugin-config.json`. There are **two** version fields:

| Loom / config field | Example | Purpose |
|---------------------|---------|---------|
| `semver` | `0.1.1` | Human-readable release (changelog, package filenames) |
| `version` | `2` | Tapestry integer — **must increment** on each published update so iOS replaces the installed connector |

Source of truth: `version.json` (`semver` + `tapestry_version`). Run `make build` to sync both into `plugin-config.json`.

Tapestry does not support semver in the `version` field; that key is always an incrementing integer (same pattern as built-in connectors — e.g. Blog Feed is at `version: 17`).

## Build & package

From the repo root:

```bash
make build     # regenerate icon + sync version fields in plugin-config
make package   # → Downloads/com.polygon.feed-v0.1.1.tapestry
```

See [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) for the Mac mini + Loom workflow.

## Feed URL

`https://www.polygon.com/rss/index.xml` (configured in `plugin-config.json`)
