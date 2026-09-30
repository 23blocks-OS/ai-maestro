# F016 — Context budget: agents compact before they get expensive

**Status:** Todo (step one shipped: the status line recommends /compact, v0.45.9)
**Type:** Feature
**Created:** 2026-09-29

## Description

A per-agent context budget. When an agent's conversation passes a threshold
(default 150k tokens, configurable per agent) and the agent is at a natural
stopping point (idle, turn finished), AI Maestro sends it Claude Code's own
`/compact`. Jev decides the timing ("is this a natural break in the task?") so
it never compacts mid-thought. Long-term memory keeps what the summary drops,
so the agent can recall it later.

## Why It's Needed

Measured 2026-09-29 on `vg-64` (observerhub/vg, Sonnet 5): a ~789k-token
conversation re-read on every step: 155 requests in 30 min, 122M cache-read
tokens, ~$0.35–0.69 per request, ~$110–215/hour, 98% of it re-reading history.
Claude Code only auto-compacts near the context limit, which on 1M-context
models is very late. Above 200k tokens every token costs double (long-context
pricing).

## Business Case

Direct cost control for a fleet: an agent kept under ~200k pays roughly 4–8×
less per step, and stays well inside subscription limits. Protects customers
from runaway sessions they never see, a strong reason to run agents under AI
Maestro.

## Implementation Plan

- Context size per agent: already reported by the status line to the metrics
  API; expose it in the agent header and the Memory/metrics views.
- Trigger: context > budget AND presence = Ready (hook state) → optional Jev
  check "natural break?" → inject `/compact` through the wake chain (confirmed
  delivery), at most once per N minutes per agent.
- Settings: per-agent budget (Skills or profile), fleet default, on/off.
- Alert (F013) when an agent keeps growing past 2× budget while Working.
- Effort: S–M.
