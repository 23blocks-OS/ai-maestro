# F048 - A security status view per host

**Status:** Todo (idea; not designed)
**Type:** Feature
**Created:** 2026-10-28
**Source:** Security round, 2026-10-28.

## The idea

A dashboard view that lists, for each host: Node version (with an end-of-life or unpatched flag), AI Maestro version, last update time, and open audit findings.

## Why

Hosts drift. Today the only way to learn that one runs an old Node or an old build is to log in. F005 is the same idea for AMP scripts.

## Work

- Each host reports these facts through the existing host info route, so remote hosts show the same data as the local one.
- The end-of-life list is a small file in the repo, updated with each Node release round.
- Open audit findings come from the last `yarn audit` result (F047) stored on the host.
- Status comes from the server feed, not computed in the view.
- Link each warning to its fix: the `update-aimaestro.sh` step.
