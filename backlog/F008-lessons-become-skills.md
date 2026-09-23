# F008 — Lessons become skills (procedural memory)

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-23

## Description

Long-term memory captures what is true (cards) and how things relate (the
entity graph), but not how to do things. A recurring workflow, a debugging path
that finally worked, or a correction the user keeps giving should become an
Agent Skill the agent loads: `SKILL.md` with the steps, the pitfalls, and
provenance (the memories and sessions it came from).

Flow: nightly, cluster recurring `pattern` / `corrected` / `fixed` cards by
entity and topic; when a cluster has enough weight (e.g. 3+ sessions), draft a
skill with the host's Claude (Haiku); Jev checks it against the evidence; the
draft waits for approval in the agent's Memory tab; approved skills are written
to the agent's skills folder.

## Why It's Needed

Procedural memory is the missing third kind of long-term memory
(docs/LONG-TERM-MEMORY.md, "Known limits"). Agent Beacon
(asymptote-labs/agent-beacon) already turns reviewed lessons into Agent Skills;
it is the natural output for "how to do X here".

## Business Case

Agents that improve their own skills from their own history compound in value
over months: the core promise of an agent that owns its work. Differentiates
from memory layers that only retrieve text.

## Implementation Plan

- `lib/memory/skills-from-memory.ts`: clustering, draft, Jev check, pending store.
- Memory tab: "Proposed skills" with approve/edit/reject.
- Writes to the agent's `.claude/skills/<slug>/SKILL.md` with frontmatter provenance.
- Effort: L. Depends on enough recurring memories (backfill must progress first).
