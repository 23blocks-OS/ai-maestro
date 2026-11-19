# B042 - The registry and the trust flag are written in place; an unreadable registry reads as empty

**Status:** Done (shipped in 0.106.226; spec: `docs/SPEC-ATOMIC-STATE-WRITES.md`)
**Type:** Bug
**Created:** 2026-11-18
**Source:** CamiloCaceres/lolad (MIT), reviewed 2026-11-18 at `2649a3f`.

## Description

- `saveAgents` (`lib/agent-registry.ts` line 212) truncates and rewrites `registry.json` (about 230 KB) in place. A stop in that window leaves it empty or cut short.
- `loadAgents` (line 154) returns `[]` on any error. The next "load, change, save" then writes a registry with only the changed agent. All other agents are lost.
- `trustProjectDirectory` (line 257) rewrites the whole `~/.claude.json` in place, while running Claude Code processes write the same file (lost updates, torn file).
- For an agent with its own login folder (`CLAUDE_CONFIG_DIR`), the trust flag goes to `~/.claude.json`, which that agent does not read, so it still stops at the trust dialog.

## Why It's Needed

Losing the registry loses every agent on the host. A torn `~/.claude.json` breaks every Claude Code session on the host. Four files in `lib/` already use temp file plus rename, each slightly differently.

## Business Case

Small change, removes the worst data-loss path in the product. Agents with separate logins (accounts and API keys per agent) start without a stuck dialog.

## Implementation Plan

See the spec: one `writeFileAtomicSync` helper (temp file in the same folder, fsync, rename, refuse symbolic links); `loadAgents` tells "no file" from "unreadable" and blocks saves while unreadable; a `last-good` copy; trust written to the agent's real config file with a re-read guard; Doctor check; crash test. Size S.
