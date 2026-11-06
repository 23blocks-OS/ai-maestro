# F088 — Wake agents that live outside AI Maestro when a message arrives (idea)

**Status:** Todo (idea to shape; food for thought from Juan, 2026-11-05)
**Type:** Feature
**Created:** 2026-11-05

## Description

Today a message wakes an agent only when AI Maestro can reach it: a tmux pane, a streaming session or a channel. An agent
in its own terminal sees a message at its next turn; one that stopped sees it when someone starts it. The idea: an **AMP
gateway** that wakes such agents when a message arrives, the way the email gateway turns mail into work for an agent.

Three different cases hide in "wake":

| Case | What exists | What is missing |
|---|---|---|
| Live, idle, in its own terminal | The AMP channel plugin injects a message into a running session. The hook tells it at its next turn. | Only sessions started with the channel; not on every plan. |
| Stopped, on a host with AI Maestro | The sweeper wakes only live sessions. | Start a run for the message. |
| Stopped, no AI Maestro at all | Files in the inbox; AMP works with nothing running. | A small thing that watches the inbox. |

## Why It's Needed

An agent that only answers when someone opens its terminal is not reachable. This is also what F073 (hibernate and wake) and
devices (F082) need: something that turns an arriving message into a run.

## Business Case

- It makes AMP useful outside AI Maestro: anyone can have an agent that answers, without our dashboard.
- Positioning: messages that wake agents, on any host, as email does for people.

## Implementation Plan

Thoughts, not a plan:

- **A one-turn run.** On a message, start the agent's program for one turn, resuming its own conversation
  (`claude -p --resume <id>`), let it handle the message, and exit. No tmux, no terminal. It reuses `resumableSessionId`, which
  already refuses a conversation that may be live.
- **A small gateway, outside AI Maestro.** A process that watches the inbox and runs a configured command per agent. It
  belongs with AMP (`agentmessaging/*`) and not in AI Maestro, so it works alone. AI Maestro can use it, or do the same in its
  sweeper.
- **Never a second copy.** If a person comes back to that terminal while a run is going, two processes share one conversation,
  which corrupts it. The lock has to be real, not a time window.
- **Who may wake it.** A wake starts a paid run with the agent's full powers, so this is a trust decision, the same as the
  email bridge's trust split (`docs/EMAIL-BRIDGE-TRUST-SPLIT-SPEC.md`): only signed senders on an allowlist, and never from unverified
  mail. A message's text is data. F042 (who may message whom) is the natural home for the rule.
- **Cost and storms.** Per the rules in F027: idempotent per message, batched, with a limit per hour.
- **Off by default.** An owner turns it on per agent.

Open: is this one gateway for AMP, email and devices, with each as an input? It may be the same shape: something arrives, a rule
decides, a run starts, the answer goes back the way it came.

- Related: F027, F073, F042, F082, F087, `tools/email-bridge`.
- Effort: unknown until shaped.
