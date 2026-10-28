# B018 - Installers for agent-identity and agent-files run from main with no checksum

**Status:** Todo
**Type:** Bug
**Created:** 2026-10-28
**Source:** Security round, 2026-10-28.

## What the code does

The `install.sh` of `agent-identity` and `agent-files` is run as `curl | bash`, from the `main` branch, with no pinned tag and no checksum.

## Why

Whoever can change `main` (or the path to it) runs code on every machine that installs. Nothing lets the user check what they got.

## Work

- Document install commands that name a release tag, not `main`.
- Publish a `SHA256SUMS` file with each release; show the verify step (download, check, then run) in the docs.
- Have `install.sh` refuse to run unpinned, or warn, unless a flag allows it.
- Update the skills and docs that quote the `curl | bash` line.
- A CI check that the pinned tag and the checksum file exist for each release.
