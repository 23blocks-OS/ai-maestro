# B011 - Agent status that is set and never cleared (wakes deferred or dropped)

**Status:** Done (0.62.0; open: single tool call > 15 min, shared-cwd state file, Codex Stop idle for 15 min)
**Type:** Bug
**Created:** 2026-10-07
**Found by:** read-only audit, 2026-10-07 (follow-up to #551, fixed in 0.60.2). All items are the auditor's reading of the code unless marked; items marked "inferred" depend on how Claude Code, Codex or Grok behave and were not observed. Verify each with a replayed event sequence before fixing.

State file: `~/.aimaestro/chat-state/<md5(cwd)>.json`, keyed by working directory. TTLs: idle and active 15 min (`HOOK_STATUS_TTL_MS`, `lib/session-idle.ts`), waiting_for_input and permission_request 24 h (`WAITING_STATE_TTL_MS`, `services/sessions-service.ts`), wake queue entries 10 min (`QUEUE_TTL_MS`, `lib/wake-queue.ts`).

## Findings

1. **Codex and Gemini still start "active"** (read). `sessionStartStatus` in the hook returns `active` for every agent but Claude and Grok. Codex's installed hooks are only Stop and SessionStart (`install-hooks.sh`), with no UserPromptSubmit or PostToolBatch, so a fresh Codex agent reads active until its first Stop, and after that reads idle for 15 minutes even during later turns, so wakes get typed into a busy pane.
2. **A deferred wake is dropped before the stuck state expires** (read). The wake queue drops entries at 10 minutes (`lib/wake-queue.ts`), the stuck "active" lasts 15 (`lib/session-idle.ts`), so the wake is lost before the status falls back to terminal recency.
3. **No clearing on interrupt, API error, crash or kill** (inferred). The hook registers only Notification, Stop, UserPromptSubmit, SessionStart and PostToolBatch. StopFailure, SessionEnd, SubagentStop and PreToolUse are not handled, so after Esc or Ctrl+C mid-turn, an API error or a kill, the status stays active for 15 minutes. Grok sends `StopFailure`, `StopCancelled` and `SessionEnd`, and Claude Code sends several of these too.
4. **An interrupted permission prompt shows "needs you" for up to 24 h** (inferred). If the user denies or presses Esc and no tool runs, PostToolBatch may not fire and `PostToolBatch` only clears blocked states.
5. **A long turn expires to idle** (read). Nothing refreshes "active" mid-turn, so a turn over 15 minutes with no hook events (a long build) falls back to terminal recency. With no terminal attached that reads as idle, and wakes inject into a busy agent.
6. **Agents sharing a working directory overwrite each other's state** (read). The state file is keyed by cwd.
7. **`SessionStart` with source `compact` writes active** (inferred). A manual `/compact` has no following Stop.
8. **A delayed `idle_prompt` can overwrite a newer `active`** (inferred). Hook processes can run out of order and the Notification handler writes unconditionally.
9. Low: `elicitation_dialog` counts as needs-you in `lib/agent-presence.ts` but the hook never sets it. A Stop block that returns active has no clear if the continuation is interrupted. Parsing: `isStopHookActive` uses truthiness, so the string `"false"` counts as active; `detectAgent` treats Codex without a `gpt-` model or `turn_id` as Claude; `source` is read in snake_case only.

## Plan

Build an event-replay test harness first (real captured sequences, the Grok ones are in `tests/fixtures/grok`), assert the status after every step, then fix item by item. Align the wake queue TTL with the status TTL. Register StopFailure, StopCancelled and SessionEnd where the program supports them.
