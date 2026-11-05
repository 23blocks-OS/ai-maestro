# F072 — Create agent: show which programs each host can run, then offer to install the missing ones

**Status:** Todo (phase 2 only; phase 1 exists since F040)
**Type:** Feature
**Created:** 2026-11-03

## Description

When a person creates an agent, the program choice (Claude Code, Codex, Pi, Grok, …) reflects what the
chosen host has, using the F071 Doctor check.

**Phase 1, availability and hints: already built** (F040 step 4, tool readiness, `services/tool-readiness-service.ts`, `hooks/useToolReadiness.ts`, found 2026-11-05). The create and wake dialogs mark each tool on the chosen host ready, missing (with its install command) or broken. What follows describes it; only phase 2 is open.

**Phase 1 (done), as described:**
- Programs installed on the host are offered as today, with their version.
- Missing or broken ones are shown greyed out, with the reason ("not installed", "does not answer",
  "older than …") and the exact install command to copy.
- Changing the host in the dialog updates the list.

**Phase 2, one-click install.**
- An "Install" button next to a missing program runs that program's official installer on the host, shows
  its progress and result, then re-checks.
- A closed list of installers (one per program, fixed commands, no user input in the command), run
  through argv, never a shell string.
- Asks for confirmation first; says what will be downloaded and where it goes.
- Reports when it is done through the notification system (F070), since it can take minutes.

## Why It's Needed

Today a person picks a program the host may not have, and learns it only when the agent fails to start.
Setting up a new host means installing each program by hand from memory.

## Business Case

- Activation: a new host or a new user gets to a working agent without leaving the dashboard.
- Support: removes "the agent will not start" caused by a missing program.
- Positioning: AI Maestro runs many agent programs; making each one one click away shows that.

## Implementation Plan

- Phase 1: the create-agent dialog reads the host's report (`/api/diagnostics`, `details.programs` from
  F071) from that host directly, as the Doctor page does. Effort: S.
- Phase 2: `POST /api/programs/install` with `{ program }` from a closed list; runs on the host it is sent
  to; streams or polls progress; re-checks after. New write path: review it like the Doctor fixes
  (closed list, re-check, no user text in commands). Next and headless routes. Effort: M.
- Open questions: installers that need sudo or a login (Claude Code sign-in) must stop and say so, not
  hang; whether phase 2 is on by default or a host setting.
- Depends on F071; phase 2 uses F070 for the "done" notification.
