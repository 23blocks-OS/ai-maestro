# B030 — A schedule run reports "success" without proof the prompt reached the agent

**Status:** Done (0.106.69)
**Type:** Bug
**Created:** 2026-11-05

## Description

Reported by pas-lola (AMP, 2026-11-04) from 3m-it on mac-mini: schedule `321452c2` (cron `0 8 * * 1-5`
America/Denver, prompt "Send day: read your AMP inbox now…") shows `lastStatus: success` at
2026-11-04T15:00:13Z, and on the manual trigger of 11-03, yet 3m-it says the prompt never reached its
session either time. 3m-support's schedule on the same host arrived on time.

What the code does (`lib/schedule-executor.ts` `runExecution`, lines ~148-160):

1. **Success means "keys sent", nothing more.** It calls `runtime.sendKeys(…, { literal: true, enter: true })`
   and then `completeExecution(executionId, 'success')`; the code says so ("For now, mark as success after
   sending … not yet implemented"). No read-back of the pane, unlike the chat and message paths, which prove
   submission with `deliverAndVerify` (`lib/chat-verify`) and fail when the text never left the input box.
2. **No copy-mode cancel.** The chat path calls `runtime.cancelCopyMode(sessionName)` first; a pane someone
   scrolled stays in copy mode and swallows the keystrokes.
3. **Apostrophes are corrupted.** The prompt is shell-escaped (`'` becomes `'\''`) before a literal send that
   passes the text to tmux verbatim through argv (`lib/agent-runtime.ts` `sendKeys`, "No escaping"). Every
   prompt with an apostrophe arrives altered: "Juan's" is typed as "Juan'\''s".

Not yet checked: which of these (or a busy agent, a staged prompt, a runtime-mode mismatch) stopped
3m-it's prompt. That needs 3m-it's pane and hook log around 15:00:13Z on 11-04.

Expected: a run is `success` only when the prompt is proven submitted; otherwise `failed` with the reason
(not delivered, pane in copy mode, bare shell, …), and the prompt arrives exactly as written.

## Why It's Needed

Schedules are how agents do recurring work on their own (agent-owned scheduling). A schedule that says
"success" while nothing happened is the false-positive delivery report the 0.36.x work removed from
messaging; nobody looks again because the status says it worked.

## Business Case

Reliability of autonomous, recurring work, and honest status: the crews' own gates read `lastStatus`.

## Implementation Plan

- In `runExecution`: cancel copy mode, then deliver through the same `deliverAndVerify` the chat REST path
  uses (`services/agents-chat-service.ts`); refuse a pane at a bare shell; mark `failed` with the reason when
  it is not submitted; keep the streaming-session branch as is.
- Drop the shell escaping (argv, `-l`).
- Tests: a prompt with an apostrophe arrives unchanged; a fake pane that never submits gives `failed`.
- Look at 3m-it's case with the fix's read-back logging to confirm the cause.
- Effort: S.
