# B007 — Leftovers from the skills and prompts audit

**Status:** In Progress
**Type:** Bug
**Created:** 2026-10-01

## Description

Problems the 2026-10-01 skills and prompts audit (v0.47.0) found but did not
fix, because they live upstream or outside its scope:

- ~~**Upstream AMP scripts:** `amp-read.sh` rejected `msg-…` ids;
  `amp-security.sh` wrapped content in an all-caps "data only" marker.~~
  Fixed in v0.47.1 (claude-plugin #34, plugin 1.2.1).
- **Channel MCP server.** Its instructions need a bundle rebuild and a
  manifest version bump (`channels/amp-plugin`) before they change.
- **Voice.** The notification regex still expects the old
  `[MESSAGE] From:` pane format.
- **`scripts/remote-install.sh:1057`** checks for a script that was removed.
- ~~**agent-browser** was behind upstream.~~ Updated to upstream main in
  v0.47.1.
- **Agents CLI.** It cannot hard-delete an agent, although the server
  supports `?hard=true`.
- **lolabot.**
  - `tools/email-send.sh` hardcodes the assistant's address.
  - `tools/heic-convert.sh` hardcodes a transport path.
- **Factory.** lolabot-factory's deploy workflow fails before it starts
  (`startup_failure`), so the refreshed catalog isn't live.

## Why It's Needed

Each one either costs agents a wasted tool call or leaves stale behaviour in
place.

## Business Case

These are small, cheap fixes that keep v0.47.0's claim honest: every prompt
and skill current.

## Implementation Plan

- One small PR per repo. S each.
- Re-run `ai-maestro-plugins/evals/triggers` after any skill change.
