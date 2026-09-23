# F005 — Warn when a host's AMP scripts drift from the fleet

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-22

## Description

A host can run AMP client scripts (`amp-*.sh`, `amp-helper.sh`, `amp-statusline.sh` in `~/.local/bin`) that are weeks older than the rest of the fleet, and nothing tells anyone.

Seen on 2026-09-22: mac-mini was still running AMP scripts from before the 02-Sep identity fixes. Messages from 3m-hr were refused (403) until the v0.39.0 rollout at 20:50 replaced the scripts. Routing worked by 20:58, after 28 relayed messages. The drift went unnoticed for about three weeks. pas-lola asked for this item.

Wanted: every host reports the version or content hash of its installed AMP scripts, and the dashboard flags any host whose scripts don't match the built plugin (`plugin/plugins/ai-maestro/scripts/`) of the app version it runs, or don't match the other hosts.

## Why It's Needed

The fleet already checks the app version (`services/hosts-service.ts:226` fetches `/api/config`), but the app version and the installed scripts can drift apart. A host deployed with a raw `git reset + build + restart`, or one that missed `install-plugin.sh`, keeps its old scripts while reporting the new app version. The failure then shows up as a message delivery error on a *different* agent, which is the hardest place to diagnose it.

## Business Case

- Reliability: stale scripts cost about two days of debugging this time
- Support load: turns a cross-host mystery into one visible warning
- Risk: old scripts may lack identity or signing fixes (see the AMP identity integrity work)

## Implementation Plan

- `install-plugin.sh`: write a manifest (`~/.aimaestro/amp-scripts.json`) with a sha256 per installed script plus the plugin submodule commit
- `/api/config` (or `/api/v1/info`): expose that manifest
- `services/hosts-service.ts`: compare each host's manifest with the local built plugin and with the other hosts; mark mismatches
- UI: a warning badge on the host in Settings → Hosts; optionally an AMP note to the maestro agent when drift is first detected
- Effort: M
- Open question: compare against the local build (assumes this host is newest) or the fleet majority?
