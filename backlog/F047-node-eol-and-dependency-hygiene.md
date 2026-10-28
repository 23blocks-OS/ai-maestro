# F047 - Dependency hygiene: Node end of life, scheduled audit, npm supply chain

**Status:** Todo
**Type:** Feature
**Created:** 2026-10-28
**Source:** Security round, 2026-10-28.

## The state

Node 20 is end of life. The 2026-10-21 Node security release covers only 22.23.4, 24.22.1 and 26.12.1. AI Maestro hosts still run Node 20 (one host's login shell has Node 16). Several npm worms went around in 2026.

## Why

An unpatched Node on every host, and installs that run arbitrary package scripts, are two cheap ways in.

## Work

- Node check in `update-aimaestro.sh`: warn (not block) on an end-of-life or unpatched Node, and say which version to move to.
- The same check in the dashboard (see F048).
- An `engines` field in `package.json` set to a supported range.
- Document the upgrade path per host type (nvm, system package, pm2 shebang and PATH quirks).
- A scheduled `yarn audit` in CI (weekly) that opens or updates one issue when findings exist.
- npm supply chain: where native modules allow, lockfile-only installs with `--ignore-scripts` and an explicit rebuild for the few that need it; a minimum release age before adopting new versions.
- Decide which of these are warnings and which fail CI.
