# B023 — Orphan tmux sessions are registered in folders other agents own

**Status:** Todo
**Type:** Bug
**Created:** 2026-11-02

## Description

The one-folder-per-agent rule (#758, 0.106.61) is checked in `createAgent`, `updateAgent`, import and
session creation. The auto-registration of orphan tmux sessions (`createOrphanAgent` in
`services/agents-core-service.ts`) builds the agent record itself and does not go through
`createAgent`. A tmux session started by hand in a taken folder still gets an agent in that folder.
When the pane has no folder, it falls back to `process.cwd()`, the AI Maestro install folder.

Most of the sharing found on 2026-11-02 came from this path: six agents in the install folder on
Juan's Mac (one of them `zz-canary-exact-bar`, an auto-registered test session), three on mini-lola.

Related, smaller:
- Wake (`agents-core-service.ts`, `workingDirectory || defaultWorkingDirectory || process.cwd()`)
  starts an agent with no folder in the AI Maestro install folder. Seen 2026-11-02:
  `salesland-dev-3metas` (AMP-registered, no folder) was woken at 18:04 into the install folder and
  its conversation went into that folder's transcripts, while its repo is
  `~/3Metas/services/Infrastructure/salesland`. Its registry folder was set by hand the same day.
  A wake with no folder should refuse and ask for one.
- `POST /api/agents/register` falls back to `process.cwd()` when no folder is given.
- The OpenClaw auto-registration in `sessions-service.ts` now fails for a taken folder and logs a
  warning on every poll; the orphan path then registers the session as `claude-code`.

## Why It's Needed

Each shared folder mixes the agents' transcripts and memory, and they cannot be exported or moved
apart. The diagnostics check `shared-folders` shows them, but nothing stops new ones from this path.

## Business Case

Risk mitigation: agent portability depends on one folder per agent. Support load: "agent shows
offline" (#758) comes back each time a new sharer appears.

## Implementation Plan

- In `createOrphanAgent`: when `folderOwner(dir)` returns an agent, register the orphan without a
  workingDirectory (the session keeps its own), or skip it and log once. Decide which.
- Remove the `process.cwd()` fallbacks (wake, orphan agent, register endpoint, `linkSession` callers). Wake without a folder returns an error that asks for one.
- Log the OpenClaw registration failure once per session, not per poll.
- Test: an orphan session in a taken folder does not become a second owner.
- Effort: S.
