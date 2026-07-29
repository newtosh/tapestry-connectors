# Polygon (Optimized) — v0.1.0

A Tapestry connector for [Polygon](https://www.polygon.com) that improves on the generic Blog Feed connector:

- Dark-background feed icon (180×180) for timeline contrast
- Removes duplicate intro text when RSS `<description>` repeats the first paragraph of `<content:encoded>`
- Uses `item_style: article` for long-form reading

## Versioning

| Field | Value | Purpose |
|-------|-------|---------|
| `version.json` → `semver` | `0.1.0` | Human-readable release (changelog, package filenames) |
| `version.json` → `tapestry_version` | `1` | Tapestry integer `version` in `plugin-config.json` — bump when publishing an update so iOS replaces the installed connector |
| `CHANGELOG.md` | repo root | Release notes |

Tapestry does not use semver in `plugin-config.json`; it uses an incrementing **integer**. Map semver bumps to that integer (e.g. `0.2.0` → `tapestry_version: 2`).

## Build & package

From the repo root:

```bash
make build     # regenerate icon + embed data URI in plugin-config
make package   # → Downloads/com.polygon.feed-v0.1.0.tapestry
```

See [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) for the Mac mini + Loom workflow.

## Feed URL

`https://www.polygon.com/rss/index.xml` (configured in `plugin-config.json`)
