# F010 — Deliver AMP messages through Claude Code's own session inbox

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-23

## Description

Claude Code (v2.1.224+, all platforms, every provider and login) has built-in
cross-session messaging: each session binds an inbox socket
(`/tmp/cc-socks/<pid>.sock`, per-user; path exported as
`CLAUDE_CODE_MESSAGING_SOCKET`, token as `CLAUDE_CODE_MESSAGING_TOKEN`, and
listed in `~/.claude/sessions/<pid>.json` as `messagingSocketPath`). The docs
explicitly cover a script or hook posting into a session
(https://code.claude.com/docs/en/cross-session-messaging#the-sessions-inbox-socket).

Documented behaviour that fits AMP delivery exactly:
- An idle session **starts a new turn** with the message (wakes the agent);
  during a turn it is read between tool calls, never interrupting a tool.
- Each message is delivered, held or refused; the sender is told when a
  message is held, later delivered/denied/expired, or dropped (rate/queue).
- Not plan-gated (unlike Channels), never through Anthropic servers locally.
- A message cannot approve permissions or change configuration.

Spike: pin down the message line format against a throwaway session, deliver
one AMP notification through the socket, confirm an idle agent wakes and reads
it. If it holds up, make it the first delivery path for Claude Code agents,
with pane readback as the fallback (and the path for Codex and others).

## Why It's Needed

"Agents never read their messages" has been the longest-running delivery
problem. Typing into the tmux pane is unreliable (staged-but-unsubmitted text,
mid-render input); Channels, the proper push path, is still allowlist-gated
(Team/Enterprise `allowedChannelPlugins`) for custom plugins as of 2.1.281.

## Business Case

Reliable agent-to-agent messaging is core to the product (AMP). A documented,
plan-independent delivery path with honest delivered/held/refused outcomes
removes the biggest reliability complaint without waiting on Anthropic.

## Implementation Plan

- Resolve an agent's live session: `~/.claude/sessions/*.json` by cwd / name
  (AIM_AGENT_NAME) / pid of the tmux pane.
- `lib/notify/cc-inbox.ts`: connect only when the message is ready (30 s rule),
  optional auth line, send, read the outcome.
- Agents running with bypassed permissions hold inbound messages by default:
  write `"crossSessionInbound": "accept"` to the agent's settings (we already
  write `.claude/settings.local.json`).
- wake-chain: try cc-inbox first for Claude Code agents; keep pane readback.
- Risks: the message line format is **not documented** (only the auth line
  and the 30 s rule are) and may change; container/WSL-vs-Windows sessions
  cannot reach each other.
- Effort: M (spike S).
