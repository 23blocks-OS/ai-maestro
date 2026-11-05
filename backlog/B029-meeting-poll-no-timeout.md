# B029 — The meeting chat's poll has no timeout and hides every error

**Status:** Done (0.106.69)
**Type:** Bug
**Created:** 2026-11-05

## Description

`hooks/useMeetingMessages.ts` polls `/api/messages/meeting` every 7 seconds with a plain `fetch` (no
timeout) and a bare `catch { /* Silently fail on poll errors */ }`.

- If the first request hangs, the meeting chat's loading state never ends.
- A hung request is never cancelled, and the 7-second interval keeps starting new ones on top of it.
- Any failure (server error, network) is invisible: the person cannot tell "no new messages" from "the
  chat stopped updating".

From GitHub #782 (the moltitobot-max fork, commit b9fc0b8). The request is to the dashboard's own host, so
a hang is rare; the fix is small.

## Why It's Needed

The meeting room is a view people demo and watch live. A chat that silently stops updating looks broken.

## Business Case

Reliability of a visible feature, at almost no cost.

## Implementation Plan

- Use `AbortSignal.timeout(…)` the way other hooks do (`hooks/useHosts.ts`, `hooks/useAgents.ts`), and skip a
  poll while the previous one is still running.
- On failure, log a warning and show a small "not updating, retrying" state after a few failures in a row;
  clear it on the next success.
- Effort: S.
- GitHub: #782.
