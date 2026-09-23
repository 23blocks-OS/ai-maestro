# F007 — Measure whether recalled memory changes what an agent does

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-23

## Description

Since v0.42.0 every memory and entity injection is logged per agent
(`~/.aimaestro/agents/<id>/memory-recalls.jsonl`). Nothing yet says whether the
agent used it. Two measurements:

1. **Use in the next turn.** For each logged injection, read the agent's next
   assistant turn from the message index and ask the classifier whether it
   relied on, cited or acted consistently with the injected statement or relation.
2. **With / without.** A fixed set of questions and change requests per agent
   (IaC first: "redeploy 23blocks-api-authentication", "move products.public",
   "why was staging decommissioned?"), answered with memory recall on and off.
   Score: does the answer name the affected entities and the relevant history?

## Why It's Needed

Memory is on for the whole fleet to gather data. Whether it improves how agents
act is the claim the feature rests on, and it is unmeasured. The injection log
exists; the judgement does not.

## Business Case

Long-term memory is positioned as a critical differentiator (the only record of
an agent's work past Claude Code's 30-day deletion). Numbers from real agents
turn that from a claim into evidence for the site and for customers, and tell us
which agents should have the skill.

## Implementation Plan

- `lib/memory/use-eval.ts`: read `memory-recalls.jsonl` + next assistant turn
  from `messages`; one Jev call per injection ("did the reply use this?").
  Nightly, after consolidation; store per-memory `used_count`.
- `scripts/memory-eval.mjs`: the with/without harness; spawns `claude -p` in the
  agent's working directory twice per question (recall on/off via the skill
  switch), scores with Jev, writes a report.
- Memory tab: "recalled N times, used M" per memory; per-agent use rate.
- Effort: M. Open question: rubric for "used" beyond classifier judgement.
