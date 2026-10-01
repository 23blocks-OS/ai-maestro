# F019 — Effort per agent

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-30

## Description

An effort setting on each agent's profile (`low` … `max`), passed to Claude
Code as `--effort` at launch. Default unchanged. It can be tried today
through the agent's `programArgs` (empty on all 94 agents).

## Why It's Needed

Effort is the first trade-off Anthropic's cost guide recommends, before
any model change. It keeps the same model and scales thinking and tool-call
depth. For research and knowledge work their curves are nearly flat:
`medium` matched `high`, and `low` cost a third to a half less for a few
points. Long coding is a real trade-off. Thinking itself is only 1–1.6% of
our cost, so the saving would come from fewer steps, each of which re-reads
the context.

## Business Case

Keeps the intelligence (same model) while cutting steps on agents that
don't need deep reasoning, such as hr and gm. A per-agent setting no single
Claude Code session offers.

## Implementation Plan

- Profile field `effort` → `--effort` in the launch command (where
  `programArgs` are applied today). UI in the agent profile. S.
- Trial: one knowledge agent at `medium` for a week, then the next. Compare
  requests per task and cost shares (`scripts/cost-breakdown.mjs`). You
  judge the quality; never trade accuracy silently.
- Changing effort mid-session restarts the cache on some models, so change
  it only at a session start or right after a compaction.
- Later: an agent re-runs a failed task at higher effort, which the guide
  measured at the higher setting's pass rate for a little over half the
  cost.
- Source: `docs/COST-OPTIMIZATION.md`.
