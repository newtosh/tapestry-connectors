# AGENTS.md

## Cursor Cloud specific instructions

This repo is **Tapestry Connectors** — four site-specific RSS connector plugins
(Polygon, Uncrate, Gear Patrol, Cool Material) for the Tapestry iOS app. Each
connector lives in `Source/<reverse-domain-id>/` (`plugin.js`, `plugin-config.json`,
`version.json`, `icon.png`). There is **no Node/npm project, no dev server, no
database, and no automated test suite** — the "application" here is the
Make/Python/Bash build pipeline that regenerates icons/config and packages
installable `.tapestry` files.

### Build / run / package (the only runnable flows on Linux)

Standard commands are documented in `README.md` and `docs/DEVELOPMENT.md`; the key
ones:

- `make build` — regenerate icons + `plugin-config.json` for all connectors.
- `make package` — build then zip each connector into `Downloads/*.tapestry`.
- `CONNECTOR_ID=com.uncrate.feed make build` — single connector.

### Non-obvious caveats

- **`make build` needs network access.** `scripts/build-icon.sh` downloads each
  connector's `logo_url` from `version.json` to render `icon.png` (text-based icons
  are the exception). Builds fail offline for logo-based connectors.
- **`make build` rewrites tracked files** (`icon.png`, and `plugin-config.json`'s
  `icon`/`version`/`semver` fields). Pillow version differences can produce tiny
  byte-only diffs in the PNGs; revert those (`git checkout -- Source/*/icon.png`)
  unless you intentionally changed an icon.
- **Pillow installs to the user site** (`pip install pillow` → `~/.local`, no
  `--break-system-packages` needed). This is the only Python dependency.
- **No lint and no tests exist.** CI (`.github/workflows/ci.yml`) only runs
  `make build`. For JS sanity you can `node --check Source/*/plugin.js`, but the
  connectors depend on Tapestry runtime globals and cannot execute standalone.
- **End-to-end connector testing (Verify/Load a feed) requires Tapestry Loom on
  macOS**, which is unavailable in this Linux VM. On Linux, verify changes via
  `make build`/`make package` and `node --check`.
