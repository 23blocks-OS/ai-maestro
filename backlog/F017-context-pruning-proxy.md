# F017 — Research: prune stale tool output before a request is sent

**Status:** Wontfix
**Type:** Feature
**Created:** 2026-09-29

## Description

A local proxy between Claude Code and the API (Claude Code supports
`ANTHROPIC_BASE_URL`) that, rarely and in bulk, replaces stale tool results
(old file dumps, long command output) with one-line stubs. Jev classifies
"is this still relevant to the current task?" per old tool result; Jev cannot
write summaries (it only classifies), so this is pruning, not summarising.

## Why It's Needed

Most of a long session's context is old tool output the model no longer needs,
re-read (and billed) on every step (see F016's measurement). Compaction
summarises everything; pruning could keep the conversation and drop only dead
weight.

## Business Case

Potentially large savings on long sessions without the information loss of a
full compaction. Research first: the risks may outweigh the gains.

## Implementation Plan (research questions)

- **Cache invalidation:** any change to the early context invalidates the prompt
  cache; the next request rewrites everything at 125% (2× for the 1-hour cache).
  Prune only in large, infrequent steps; measure break-even.
- **Correctness:** the model may still need a pruned result; tool_use /
  tool_result pairs must stay valid; test on recorded sessions offline.
- **Compared with F016** (Claude Code's own `/compact` at a budget): is pruning
  worth the complexity at all once F016 exists?
- Effort: research spike S; product M–L.

## Update 2026-09-29 (from F018's research)

- Measured on our largest transcripts: tool output is 34–48% of a session, but
  calls over 2k tokens are only 7–19% of it. Most of it is thousands of small
  results, which weakens the case for pruning big stale outputs.
- For NEW output there is a native alternative to a proxy: a `PostToolUse`
  hook can replace any tool's result before Claude sees it
  (`updatedToolOutput`). See F018.

## Decision 2026-09-30: Wontfix

Anthropic's cost guide (`anthropics/skills`, `claude-api/shared/cost-optimization.md` § 2.3):
- Clearing old tool results "is a context-window tool, not a savings lever".
  In the run measured for the platform docs, context editing cost more than it saved.
- On models that run the preserved-thinking check, a client-side prune of
  earlier turns invalidates every later thinking block, with no workaround.

Compaction (F016) is the supported way. See `docs/COST-OPTIMIZATION.md`.
