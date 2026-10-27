# B015 - Clearing a staged notice with backspaces also deletes what a person was typing

**Status:** Todo (found by reading code, 2026-10-27; not reproduced on a live agent)
**Type:** Bug
**Created:** 2026-10-27
**Found while:** comparing our delivery with lolad's (`internal/deliver`), which has the same weakness. Our dim-text handling was checked and is fine (below).

## What the code does

`lib/notification-service.ts` (about line 249) and `lib/chat-verify.mjs` (about line 62): when our text is seen staged in the input box, the retry presses BSpace `clearInputKeys(len)` times, which is `max(16, len + 16)` capped at 2000 (`lib/pane-readback.mjs:130`), then types again.

## The problem

The number of backspaces is a count, not "delete what we typed". If a person had started typing in that input box, our notice lands after their text, and the clear removes our text and 16 more characters of theirs. It also removes everything when the person's text was the only thing there and the notice did not arrive.

## Not a bug (checked)

The dim "previous prompt" hint in an empty Claude Code box: the chat path strips it (`stripDimPlaceholder` on `capture-pane -e`). The notification path captures without `-e`, so the hint is not stripped, but its needle is a per-message token, so an old dim hint cannot match a new message. The two paths are inconsistent; no wrong result found.

## To do

Reproduce on a live agent with typed text present; then clear exactly the length we typed (no +16), and skip the retry when the input box held text before our send. Add a test with person-typed text in the box.
