# F013 — Stall alarm: tell a human when an agent is stuck and nothing can confirm it

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-25

## Description

When AI Maestro cannot confirm that an agent received a wake or message, or an
agent has been blocked for too long, raise a loud, rate-limited alarm outside
the dashboard, so the stall never stays invisible.

Signals we already compute but only log or return in an API response:
- a wake/notification sent but not confirmed by pane readback;
- `blockedSessions` / pending wakes that never flush;
- an agent in "needs you" (permission / question) for longer than N minutes;
- an agent "working" with no hook event and no transcript growth for N minutes.

Delivery channels (each best-effort with a timeout, so a failing channel never
breaks anything): browser/OS notification, webhook, an AMP message to an
operator agent (e.g. Lola), optionally a phone push. Rate-limited per agent.

## Why It's Needed

We confirm delivery well and escalate to nobody. This week (0.45.x) agents sat
in "needs you" or stuck states that only showed if someone had the dashboard
open. firstmate's `inject_wedge_alarm` (docs/benchmark/firstmate-comparison.md)
is the model: pane-independent alert + durable marker + configurable channels
with `FM_WEDGE_ALARM_TIMEOUT_SECS`.

## Business Case

An autonomous fleet is only as good as its worst silent stall. Alerting turns
"I discovered hours later" into minutes, directly improving the core promise
(agents that keep working) and reducing babysitting.

## Implementation Plan

- `lib/stall-alarm.ts`: pure classifier over the activity feed + delivery
  results (thresholds per condition, env-configurable), rate limiter.
- Hook into the server's existing tick (no new watcher): the status feed and
  wake chain already produce the signals.
- Channels: `notification` (dashboard + OS via the browser), `webhook`, `amp`.
  Settings → Alerts to enable and pick thresholds.
- Effort: M.
