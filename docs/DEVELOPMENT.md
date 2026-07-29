# Development

This repo is designed to be **cloned on your Mac** (Mac mini, laptop, etc.), with [Tapestry Loom](https://apps.apple.com/app/tapestry-loom/id6578414736) watching the `Source/` directory directly. No rsync or machine-specific sync scripts are required in the main workflow.

## Prerequisites

- macOS with [Tapestry Loom](https://apps.apple.com/app/tapestry-loom/id6578414736) installed
- Git
- Python 3 + [Pillow](https://pypi.org/project/pillow/) (only when rebuilding icons: `pip install pillow`)

## One-time setup (Mac mini)

```bash
git clone https://github.com/newtosh/tapestry-connectors.git
cd tapestry-connectors
./scripts/mac-mini-update.sh
```

In **Tapestry Loom**: **File → Select Connectors Folder…** (⌘F) → choose:

```text
/path/to/tapestry-connectors/Source
```

Select a connector in the sidebar, then **Verify** and **Load**.

## Daily workflow

1. Edit connectors on any machine (Mac, Linux, etc.) and **push to GitHub**.
2. On the Mac mini:

```bash
cd ~/path/to/tapestry-connectors
./scripts/mac-mini-update.sh
# or: git pull && make build
```

3. In Loom: **⌘R** → **Load**.

Optional — open Loom after update:

```bash
OPEN_LOOM=1 ./scripts/mac-mini-update.sh
```

## Build & package

```bash
make build      # all connectors in Makefile CONNECTORS list
make package    # → Downloads/*.tapestry for each
CONNECTOR_ID=com.uncrate.feed make build   # one connector only
```

Install the `.tapestry` file on iOS via **Settings → Connectors → Add a Connector**.

## Versioning

Each connector has `version.json`:

| Field | Purpose |
|-------|---------|
| `semver` | Human-readable release (`0.1.1`) — changelog, package filenames, `semver` in `plugin-config.json` (shown in Loom metadata) |
| `tapestry_version` | Integer `version` in `plugin-config.json` — Tapestry uses this to detect updates on reinstall (Loom shows this as `version`) |

Bump both when shipping a new release. See [CHANGELOG.md](../CHANGELOG.md).

## Optional: local machine overrides

Machine-specific configuration (SSH hosts, custom clone paths, legacy rsync) belongs **outside** this repo or in a gitignored `local/` directory. See [examples/remote-rsync/README.md](../examples/remote-rsync/README.md) if you prefer syncing from Linux instead of `git pull` on the Mac.
