# F014 — Ambiguity-aware restore: when unsure an agent is alive, do nothing

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-25

## Description

On server start, restore currently treats `sessionExists === false` as dead and
re-wakes persisted agents. Add a third outcome:

- **confirmed dead** → re-wake (as today);
- **confirmed alive** → skip;
- **ambiguous** (tmux not answering, remote host unreachable, a session with
  the name but no matching program, a recent hook heartbeat with no session)
  → **leave it alone and report it** in the dashboard / stall alarm (F013).

## Why It's Needed

A duplicate agent (two sessions, two supervisors, double message handling) is
worse than a missing one. firstmate's reconcile rule: "ambiguous liveness reads
are left untouched to avoid duplicate supervisors"
(docs/benchmark/firstmate-comparison.md). Ours will eventually double-launch
something.

## Business Case

Reliability of restarts across a multi-host fleet; avoids hard-to-diagnose
duplicate work and conflicting commits.

## Implementation Plan

- `restoreSessions` (server.mjs / services): classify liveness with evidence
  (tmux answer, pane program, last hook event time, host reachability) into
  dead / alive / ambiguous; act only on the first two.
- Surface ambiguous agents (sidebar badge + F013 alarm).
- Tests for each evidence combination. Effort: S-M.
