# B032 — Agents with no tmux session: /term retries forever, and hibernated agents read as outside

**Status:** Done (0.106.71)
**Type:** Bug
**Created:** 2026-11-05

## Description

Reported by ai-maestro-app (GitHub #792).

1. `/term` closed a missing tmux session with 1011, which reads as "try again". The app's chat of an outside agent
   flickered once a second.
2. Every offline agent with no discovered tmux session got `standalone: true`, so about 40 hibernated agents on one
   host read like an outside agent that stopped (`runtime: null`). The app showed "runs outside AI Maestro" for them.
   `runtime` says only what runs now, and nothing remembered how an agent had run.

## Why It's Needed

The app cannot tell the two cases apart: dropping one breaks messaging a stopped outside agent, keeping both mislabels
every hibernated agent.

## Business Case

Correct status in the app; no reconnect loop on the server.

## Implementation Plan

- `/term` closes with 4004 `no_tmux_session`. Not 4000: the web client stops for good on 4000, and its limited retry
  is what recovers a tab that connects just before a waking agent's session appears.
- `session.lastRuntime` (`terminal`, `streaming`, `outside`, or null): what runs now, else what was last seen (kept in
  the registry as `lastRuntime`), else the setup (`runtimeMode`, or `terminal` with session history).
- `standalone` only for agents with no tmux session now or in their history, the same test the web uses for hibernated.
- Limit: an outside agent that stopped before this shipped reads as `terminal` until it next runs.
- Effort: S.
