# B026 — Pasted text shows twice in the chat, once with raw `<pasted_content>` tags

**Status:** Todo
**Type:** Bug
**Created:** 2026-11-03

## Description

When the person pastes a long text into the chat and sends it, a second card appears with the same text
wrapped in raw tags:

```
<pasted_content id="751d">
Hey, let's talk a little bit about the company tool. …
</pasted_content id="751d">
```

Seen on tct-gm (mac-mini) at 10:46 on 2026-11-03.

Cause, checked in tct-gm's transcript (`…/-Users-juancarlospelaez-agents-tct-gm/f23e9e78-….jsonl`, line
at 17:46:38Z): Claude Code (2.1.31x) now stores a pasted prompt as
`"\n\n<pasted_content id=\"751d\">\n…\n</pasted_content id=\"751d\">…"`. The chat:

1. draws that text as is, tags included, and
2. cannot match it to the text it sent, so the person's pending bubble is never confirmed and stays next
   to the transcript's copy: two cards.

Expected: one bubble with the pasted text, no tags.

## Why It's Needed

Pasting a brief or a document into an agent is common. Today it looks broken and as if it was sent twice,
so people may send it again.

## Business Case

Trust in the chat as the record of what was sent; less duplicate work for agents that get the same
brief twice.

## Implementation Plan

- `lib/chat-transcript.mjs`: unwrap `<pasted_content id="…">…</pasted_content id="…">` in user text (keep
  any text the person typed around it). Match the closing tag with or without the id.
- The pending-bubble reconciliation (send path, `docs/CHAT-ARCHITECTURE.md`): compare after the same
  unwrap and whitespace trim.
- Tests: a transcript fixture with a wrapped paste; the pending bubble reconciles.
- Related: B027 (queued messages), same root (Claude Code's new transcript lines).
- Effort: S. GitHub issue: #769.
