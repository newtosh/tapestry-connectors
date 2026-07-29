# Optional: Linux → Mac rsync workflow

The **recommended** workflow is a public git repo cloned on the Mac mini, with Loom pointing at `Source/`. See [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).

This folder is an **optional alternative** for developers who edit on Linux and push connector files over SSH instead of using `git pull` on the Mac. Copy these scripts to a **private, gitignored** location (e.g. `~/bin/tapestry-connectors-local/`) and customize `loom.env` there — do not commit hostnames or paths to the public repo.

## Setup

```bash
mkdir -p ~/bin/tapestry-connectors-local
cp examples/remote-rsync/* ~/bin/tapestry-connectors-local/
cp examples/remote-rsync/loom.env.example ~/bin/tapestry-connectors-local/loom.env
# Edit loom.env with your Mac mini Tailscale hostname and paths
```

Point `LOOM_PATH` at the **`Source/` directory inside your Mac mini clone**, e.g.:

```bash
LOOM_PATH='~/Developer/tapestry-connectors/Source'
```

Then rsync from your Linux clone:

```bash
rsync -avz --delete /path/to/tapestry-connectors/Source/ \
  user@macmini.tailnet:~/Developer/tapestry-connectors/Source/
```

The scripts in this folder are reference copies of that pattern; they are not invoked by the main `Makefile`.
