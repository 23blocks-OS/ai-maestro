# B027 — A message sent while the agent works shows as Queued and as delivered at once

**Status:** Todo
**Type:** Bug
**Created:** 2026-11-03

## Description

The person sends a message while the agent is busy. The chat then shows it twice: a "Queued" card, an
older agent reply below it, and the same message again as a normal "You" bubble. Seen on tct-gm
(mac-mini), "do you have any questions?" at 10:48 on 2026-11-03.

Likely cause, from tct-gm's transcript (`…/-Users-juancarlospelaez-agents-tct-gm/f23e9e78-….jsonl`):
Claude Code (2.1.31x) now writes its own queue lines:

- `{type:'queue-operation', operation:'enqueue', content}` when the message is queued;
- then either `operation:'remove', reason:'absorbed_mid_turn', commandUuid` (the agent read it mid-turn,
  with a `queued_command` attachment), or `operation:'dequeue'` **with no content** (it became the next
  turn, followed by a normal user line).

The 10:48 message went enqueue (17:48:02Z) → dequeue (17:48:05Z) → user line (17:48:05Z).
`lib/chat-transcript.mjs` synthesises `queue-operation` from the `queued_command` attachment (the shape it
was written for) and does not handle Claude Code's native lines, nor `dequeue`/`remove`. So the enqueue
is drawn as "Queued" and never cleared, and the user line is drawn as well. The queued card keeps the
enqueue time, so the agent reply that was streaming then sits between the two.

Expected: one bubble. "Queued" while it waits; when it is dequeued or absorbed, the same bubble becomes
delivered, in the place the agent actually read it.

## Why It's Needed

The person cannot tell whether the agent got the message, and the order of the conversation looks wrong.

## Business Case

Sending while an agent works is the normal way to steer it. A chat that shows it twice makes people resend
and doubt delivery, the problem the delivery-confirmation work (0.36.x) set out to remove.

## Implementation Plan

- `lib/chat-transcript.mjs`: read Claude Code's native `queue-operation` lines. Pair `enqueue` with the
  following `dequeue` (first in, first out) or with `remove` (by content); drop or mark the queued entry
  delivered when paired. Do not also synthesise one from the `queued_command` attachment for the same
  message (dedupe by content and time).
- The UI's nine readers of `queue-operation` (see the comment in `chat-transcript.mjs`): check they treat a
  delivered one as gone.
- Tests: fixtures for enqueue → dequeue → user line, and enqueue → remove + attachment; both give one
  bubble.
- Related: B026 (pasted text), same root.
- Effort: S-M. GitHub issue: #770.
