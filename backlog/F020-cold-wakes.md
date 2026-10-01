# F020 — No cold wakes on a large context

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-30

## Description

A "cold wake" is an agent idle for more than an hour (past Claude Code's
one-hour cache on a subscription) that is then woken. Its whole context is
written to the cache again before it does anything. Fix: when an agent goes
idle with a large context, compact it first, so the wake re-writes ~30k
tokens, not ~800k. Then find what wakes idle agents and hold non-urgent
wake-ups so several arrive together.

## Why It's Needed

Measured on the 7 largest sessions: 12–64 cold wakes each, each
writing over 50k tokens, up to ~850k. Together they are **15–27% of each session's
cost**, the second-largest cost after re-reading the context.

## Business Case

A large, fleet-wide saving with no loss of intelligence. Only a fleet
manager can see and schedule idle agents and the wake-ups they receive.

## Implementation Plan

- Measure: `scripts/cost-breakdown.mjs` reports cold wakes per session.
  Add the trigger: match each wake to its cause (AMP push, the 5-minute
  inbox poll, a scheduled task, the user's prompt).
- Compact on idle: F016's trigger with presence = Ready for N minutes and
  context > budget. Same mechanism.
- Hold non-urgent wakes: deliver message notifications to an idle agent in
  batches, unless a message is urgent or the sender is waiting.
- Effort: M. Source: `docs/COST-OPTIMIZATION.md`.
