# F077 — A task records what was actually done (Result)

**Status:** Done (0.106.69)
**Type:** Feature
**Created:** 2026-11-05

## Description

Add a **Result** to a task: what was actually done, written when the task goes to `review` or
`completed` (by the agent or the person). The task detail shows it (editable in review and completed,
read-only otherwise), and a board card shows that a result is there.

Today (`types/task.ts`) a task records what was asked (`subject`, `description`) and a thread of
`comments`, but no single answer to "what was done". Outcomes live in comments or in the agent's chat.

From GitHub #776 (the "Tomelio" fork, commit 89080c3). Port the idea to the current Task model, not the
fork's diff.

## Why It's Needed

Reviewing a task means reading its whole thread or the agent's chat. "What did the team ship this week?"
has no answer without reading every chat.

## Business Case

- Review is a skim, not an investigation.
- Completed work becomes searchable and reportable (weekly summaries, judging agents by outcomes).
- F076 needs it: the agent's completion summary goes here.

## Implementation Plan

- `types/task.ts`: `result?: string | null`. Task registry and the teams/projects/agent board services pass
  it through; the API accepts it on update.
- `aimaestro-agent.sh` task commands and the agent-tasks skill: a way for an agent to set the result when it
  moves a task to review (`--result "…"`).
- UI: task detail field; a small indicator on the card.
- Tests: set, read, and that it survives a status change.
- Effort: S.
- GitHub: #776.
