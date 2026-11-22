# F073 — Hibernate idle agents by rule, and wake them for a message or a task

**Status:** In Progress
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

**Done 2026-11-20 (0.106.254): wake on message.** `preferences.wakeOnMessage` (Agent Profile > Work Configuration >
"Wake for messages", or `PATCH /api/agents/<id>` with `{"preferences":{"wakeOnMessage":true}}`). `deliver()` in
`lib/message-delivery.ts` starts an asleep agent with `wakeAgent` before the wake chain; the wake queue types the
notice once the program settles. Off by default: each start is a new program using memory.

**Done 2026-11-21 (0.106.255): wake on board instruction.** The same setting. `handToAgent` in
`services/agent-tasks-service.ts` starts the asleep agent, waits for its first hook report (`waitUntilReady` in
`lib/session-idle.ts`), then types the instruction and marks the comment sent; forwarded instructions go the same way on
the agent's host.

**Done 2026-11-21 (0.106.256): hibernate when idle.** Per agent, not per host (it answers the open question below: each
agent opts in, so no host owner surprises another's agent): `preferences.hibernateAfterIdleHours` (1-168).
`services/idle-hibernate-service.ts` runs every 5 minutes; only Claude Code agents (the hook says idle), never while
working, asking, in a meeting, with wakes queued or streaming. Not done: resuming the last conversation, and the
`aimaestro-agent.sh` flags.

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
