# Tapestry Connectors

Community [Tapestry](https://usetapestry.com) connectors — site-specific feeds tuned beyond the built-in Blog Feed connector.

Inspired by [chockenberry/TapestryConnectors](https://github.com/chockenberry/TapestryConnectors).

## Connectors

| Connector | Version | Description |
|-----------|---------|-------------|
| [Polygon](Source/com.polygon.feed/) | 0.1.17 | Optimized Polygon.com RSS — branded icon, deduped intro, writer bylines |
| [Uncrate](Source/com.uncrate.feed/) | 0.1.3 | Optimized Uncrate RSS — summaries, purchase links, hero images |
| [Gear Patrol](Source/com.gearpatrol.feed/) | 0.1.13 | Gear Patrol RSS — summaries, retailer buy links, hero images |
| [Cool Material](Source/com.coolmaterial.steals.feed/) | 0.2.15 | Editorial + steals — summaries, hero images, buy links, deal prices |
| [Reactor](Source/com.reactor.feed/) | 0.1.2 | Optimized Reactor Mag RSS — branded icon, cleaned WordPress hero chrome, dek, bylines |
| [YT Playlist Feed](Source/com.newtosh.youtube.playlist/) | 0.1.4 | Community playlist/channel feeds — in-app privacy-enhanced embeds; separate from built-in YouTube |

## Install on iOS

**From a release package:**

1. Download a `.tapestry` file from **[Releases](https://github.com/newtosh/tapestry-connectors/releases)** (or run `make package` locally).
2. AirDrop or save to iCloud Drive.
3. **Tapestry → Settings → Connectors → Add a Connector** → select the file.

**Updating:** bump `tapestry_version` in the connector's `version.json`, package a new `.tapestry`, and reinstall (or remove the old connector first if the integer version did not change).

## Publishing a release

Merging a PR into `main` automatically runs the **Release** workflow: it packages every connector from `Makefile`, auto-bumps the patch on the latest `v*` tag (e.g. `v0.3.4` → `v0.3.5`), and publishes a GitHub release.

**Release notes** come from [`CHANGELOG.md`](CHANGELOG.md):

1. Prefer the section matching the tag — `## [0.3.5] - YYYY-MM-DD` for `v0.3.5`
2. Otherwise use `## [Unreleased]`
3. If neither has notes, the release still publishes with a short fallback plus the connector inventory

Before merging release-worthy work, add notes under `[Unreleased]` or under the exact next version heading. You can also run **Release** manually from **Actions** (optionally pass an explicit tag such as `v0.4.0`).

## Development (Mac mini + Loom)

Clone this repo on your Mac, point [Tapestry Loom](https://apps.apple.com/app/tapestry-loom/id6578414736) at `Source/`, and pull updates from git.

```bash
git clone https://github.com/newtosh/tapestry-connectors.git
cd tapestry-connectors
./scripts/mac-mini-update.sh
```

In Loom: **File → Select Connectors Folder…** (⌘F) → `…/tapestry-connectors/Source` (one-time).

Full workflow: **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**

```bash
# After pushing changes from any machine:
git pull && make build    # on the Mac mini
# Loom: ⌘R → Load
```

## Build from source

```bash
make build      # regenerate icons + plugin-config for all connectors
make package    # → Downloads/*.tapestry for each connector
```

Requires Python 3 and Pillow (`pip install pillow`) when rebuilding icons.

## Project layout

```text
Source/                 Connectors (one folder per reverse-domain id)
Downloads/              Packaged .tapestry outputs (gitignored)
.github/workflows/      CI build on PRs; release packaging on version tags
scripts/                Portable build + Mac mini update helpers
docs/                   Development guide
examples/remote-rsync/  Optional private rsync workflow (not used by default)
```

## References

- [Tapestry Connector API](https://github.com/TheIconfactory/Tapestry/blob/main/Documentation/API.md)
- [Connector authoring guide](https://usetapestry.com/connectors/)
- [Tapestry Loom](https://apps.apple.com/app/tapestry-loom/id6578414736) — Mac testing tool

## License

MIT — see [LICENSE](LICENSE).
