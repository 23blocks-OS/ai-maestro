# F076 — Tasks go to idle agents by themselves and come back for review

**Status:** Todo (design first)
**Type:** Feature
**Created:** 2026-11-05

## Description

Close the loop between the task board and the agents without a person handing out each task:

1. A task marked eligible (per team or per project, opt-in) and unblocked is offered to an idle agent that
   can do it.
2. The agent works it and **claims** it done with a summary (and evidence: commits, PR, test run).
3. The task moves to `review`, never to `completed`. A person (or a verifier gate) accepts it.
4. A task the agent cannot finish goes back to the backlog with a note, and is not re-offered in a loop.

Today a person assigns each task, watches the agent, and judges when it is done. The board already has
what this needs: statuses including `review` and `waiting`, assignees, `blockedBy`, comments, and
`[TASK <id>]` instructions delivered to an agent from its card (the agent-tasks skill).

Two GitHub issues propose the same capability from two sources, merged here:

- **#638** (Parkboard's Autopilot): tasks tagged for automatic pickup, worked in isolation, verified, and
  returned as a draft (PR or review task); direct-to-main only for explicitly trivial classes.
- **#779** (the "Hermes Maestro" fork, HMP/1): auto-dispatch to idle workers; the worker prints
  `###HMP/1 DONE <uuid> <summary>`; blocked work returns to the backlog. The fork's code is not usable as is
  (its service never starts, its BLOCKED path loops, its poller blocks); it saves design time only.

## Why It's Needed

A fleet that needs a person to give out every next task is limited by that person. This is the step from
"a dashboard of agents" to "an organization of agents" that the 3Metas company tool is built on.

## Business Case

- Strategic: the core promise of agent organizations (Juan's Dec 5 talk, the company tool).
- Throughput: agents stop idling between tasks while a person is busy.

## Implementation Plan

- **Design first** (this item's first deliverable): how a task becomes eligible, how an agent is chosen
  (idle per the single status source, right org/team, round robin), how completion is claimed, the
  guardrails, and how it shows on the board.
- Completion is a **claim**, not proof: whatever the signal (a marker in the transcript, an
  `aimaestro-agent.sh task done` call, the agent-tasks skill), it only moves the task to `review`. Terminal
  text can be spoofed by any text the agent reads.
- Read signals from the transcript stream, not a tmux poller; keep state on disk, not in memory.
- Guardrails: per-team opt-in, a limit of tasks in flight per agent, backoff and a person's gate after a
  block, never on agents that run outside AI Maestro.
- Uses F077 (a result on the task) for the agent's summary.
- Effort: L. Design S-M first, then a first slice for Claude Code agents only.
- Related: #638, #779, F070 (notify when long work finishes), F073 (wake on a task).
