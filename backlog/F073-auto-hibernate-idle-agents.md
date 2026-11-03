# F073 — Hibernate idle agents by rule, and wake them for a message or a task

**Status:** Todo (idea to shape)
**Type:** Feature
**Created:** 2026-11-03

## Description

Proposed by pas-lola (AMP, 2026-11-03) after mac-mini ran 34 idle Claude Code agents with 3.7 GB of swap
in use.

- A per-host rule: hibernate an agent that has been idle for more than N hours, except agents on an
  exclusion list.
- Wake a hibernated agent when an AMP message or a board instruction arrives for it, not only on its
  schedules or by hand.
- On wake, resume the agent's last conversation where that is safe, instead of starting a fresh one.

Today (0.106.65), from the code: hibernation is by hand only (Hibernate button or
`POST /api/agents/<id>/hibernate`: types `exit`, ends the tmux session, marks the agent offline). A wake
starts a new conversation (only the terminal/streaming mode switch resumes one). The agent's schedules wake
it; a new message or a board instruction does not, so mail waits until something else wakes it. That is
why nobody hibernates agents today.

## Why It's Needed

Hosts with many agents run every one of them all day, idle or not. Memory pressure slows every agent on
the host and gates the crews' own load checks.

## Business Case

- Cost and reliability: more agents per host before memory runs out.
- Retention: fleets of 30+ agents per host are the users who stay; they hit this first.

## Implementation Plan

- Wake on message: the delivery path (`lib/message-delivery.ts`, `lib/wake-chain.ts`) wakes an offline
  agent that has hibernation-wake turned on, then pushes the message. Same for board instructions.
- Rule: a host setting (idle hours, exclusions), run by the server; never hibernate an agent that runs
  outside AI Maestro, has a pending question, or is working.
- Resume: wake with the agent's last `claudeSessionId` when the conversation is recent enough.
- Open question: who sets the rule, the host owner or each agent's GM (per agent opt-out?).
- Effort: L. Split: wake on message first (it makes manual hibernation usable), then the rule.
