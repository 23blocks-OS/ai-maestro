# F046 - Plugin build: lock the upstream commits and show what changed

**Status:** Todo
**Type:** Feature
**Created:** 2026-10-28
**Source:** Security round, 2026-10-28. Repo `ai-maestro-plugins`.

## The idea

`build-plugin.sh` pulls the AMP scripts and skills from other repos at `ref: main`, by design (fixes flow without a manual copy). The built output is installed on every host.

## Why

A compromised upstream `main` would ship to every host with the next rebuild, and nobody would see it: the output diff is large and mixed with intended changes.

## Work

- Write the resolved commit SHA of every source to a lock file (for example `plugin.lock.json`), committed with the build output.
- Make the build print, and the rebuilding PR show, a diff of upstream changes between the old and new SHA for each source.
- Verify tag signatures where a source is pinned to a signed tag; report unsigned ones.
- Add a `--locked` mode that builds from the lock file only, for CI and installs.
- Keep `ref: main` as the default for the rebuild step; the lock makes it reviewable.
- Document the review step in CLAUDE.md (plugin section).
