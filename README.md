# Tapestry Connectors

Community [Tapestry](https://usetapestry.com) connectors — site-specific feeds tuned beyond the built-in Blog Feed connector.

Inspired by [chockenberry/TapestryConnectors](https://github.com/chockenberry/TapestryConnectors).

## Connectors

| Connector | Version | Description |
|-----------|---------|-------------|
| [Polygon](Source/com.polygon.feed/) | 0.1.0 | Optimized Polygon.com RSS — dark icon, deduped intro, article layout |

## Install on iOS

**From a release package:**

1. Download `com.polygon.feed-v0.1.0.tapestry` from [Releases](https://github.com/newtosh/tapestry-connectors/releases) (or run `make package` locally).
2. AirDrop or save to iCloud Drive.
3. **Tapestry → Settings → Connectors → Add a Connector** → select the file.

**Updating:** bump `tapestry_version` in the connector's `version.json`, package a new `.tapestry`, and reinstall (or remove the old connector first if the integer version did not change).

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
make build      # regenerate icons + plugin-config
make package    # → Downloads/com.polygon.feed-v<semver>.tapestry
```

Requires Python 3 and Pillow (`pip install pillow`) when rebuilding icons.

## Project layout

```text
Source/                 Connectors (one folder per reverse-domain id)
Downloads/              Packaged .tapestry outputs (gitignored)
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
