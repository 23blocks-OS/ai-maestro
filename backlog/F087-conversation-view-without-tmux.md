# F087 — See the conversation of any agent, with or without tmux

**Status:** Todo (spec: [docs/SPEC-CONVERSATION-VIEW.md](../docs/SPEC-CONVERSATION-VIEW.md))
**Type:** Feature
**Created:** 2026-11-05

## Description

The chat view shows the conversation of an agent that runs outside AI Maestro in its own terminal, and of a hibernated
agent, from the same transcript files the chat already reads. It works in the dashboard and in the app, and updates
live while an outside agent works.

The data is already there. `GET /api/agents/[id]/chat` finds the transcript by the agent's folder, with no tmux
involved: tested 2026-11-05 on an outside agent, it returned that agent's live conversation up to the last few seconds.
What stops it:

- The screens show "hibernated" or "running outside tmux" before they reach the chat view (`app/page.tsx`).
- The chat's input assumes a pane. Live updates are not the problem: the `chatOnly` socket attaches no terminal and
  routes to other hosts.

What it can and cannot do:

- Works: full history, X-Ray, tool use and thinking, for every program with a transcript reader (Claude Code, Codex,
  Grok, Pi, Copilot).
- A message from the person goes through AMP, not the pane, so the agent sees it at its next turn. The view must say
  that, not look like a normal chat.
- Approval cards show but cannot be answered: there is no pane to press a key in. Say that the person at that terminal
  has to answer.

## Why It's Needed

Today an outside agent is a blank screen, and a hibernated one shows only Wake, though the whole conversation is on
disk. To follow an agent running in a terminal, a person has to be at that terminal.

## Business Case

- Retention: people who run agents in their own terminal, or in an IDE, get the dashboard and the app for free.
- It matches the rule that the conversation belongs to the agent, not to tmux, which devices also need (F082).

## Implementation Plan

- Server: small. Check the `chatOnly` path for each state, and prefer the agent's own session file. See the spec.
- Pick the transport from `session.runtime` and `session.lastRuntime`: pane for `terminal`, AMP for the others.
- UI: let those agents reach the chat view, read-only input state, and a clear note on how a message is delivered.
  Both `ChatView.tsx` and `MobileChatView.tsx`; read `docs/CHAT-ARCHITECTURE.md` first. The app is ai-maestro-app's.
- Multi-host: the transcript is on the agent's host, so the client asks that host.
- Pin the transcript with the agent's `claudeSessionId` where it has one: the folder lookup takes the newest file, so a
  second session in that folder would show as the agent's.
- Tests: an outside agent and a hibernated agent show history; new lines arrive without tmux; a message goes by AMP; an
  approval card shows as not answerable here.
- Effort: M.
- Related: #792 (B032), F082.
