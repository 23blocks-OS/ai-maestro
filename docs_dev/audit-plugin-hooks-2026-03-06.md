# Audit: AI Maestro Plugin Hook System — 2026-03-06

## Files Audited
- `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` (464 lines)
- `plugin/plugins/ai-maestro/hooks/hooks.json` (50 lines)
- `plugin/plugins/ai-maestro/.claude-plugin/plugin.json` (9 lines)
- `app/api/sessions/activity/update/route.ts`
- `app/api/messages/route.ts`
- `app/api/sessions/[id]/command/route.ts`
- `app/api/agents/route.ts`
- `services/headless-router.ts` (relevant routes)
- `services/sessions-service.ts` (broadcastActivityUpdate)

---

## CRITICAL Findings

### C1. Status Value Mismatch — Hook sends invalid statuses to activity update endpoint

**Severity: HIGH (silent data loss)**

The hook sends these `status` values via `broadcastStatusUpdate()` → `/api/sessions/activity/update`:
- `'waiting_for_input'` (line 338 of hook)
- `'permission_request'` (line 318 of hook)
- `'active'` (line 402 of hook)
- `'idle'` (line 391 of hook)

The Next.js route at `app/api/sessions/activity/update/route.ts` line 29 validates:
```
VALID_STATUSES = ['active', 'idle', 'busy', 'offline', 'error', 'waiting', 'stopped']
```

`'waiting_for_input'` and `'permission_request'` are NOT in this list. The endpoint returns 400 for these statuses. This means **every Notification and PermissionRequest hook invocation silently fails** to broadcast the status update via the Next.js route.

**Mitigating factor:** The headless router (`services/headless-router.ts` line 553-556) does NOT have this validation and calls `broadcastActivityUpdate()` directly, so headless mode is unaffected. But full mode (Next.js) loses these broadcasts.

**Also:** The hook catches the error silently (line 86-88 in `broadcastStatusUpdate()`), so users never see the failure.

### C2. readStdin timeout vs hooks.json timeout — potential double-resolution race

**Severity: MEDIUM**

The `readStdin()` function has a 5-second `setTimeout` (line 42) that resolves the promise with `{ timeout: true }`. The `hooks.json` also sets `"timeout": 5` (seconds) for every hook.

If stdin data arrives slowly (e.g., large input), both timeouts could fire at approximately the same time:
1. The 5s setTimeout resolves the promise with `{ timeout: true }` — the hook proceeds with no event data
2. Claude Code's 5s hook timeout kills the process

**The real risk:** The Promise in `readStdin` can resolve TWICE — once via setTimeout and once via the 'end' event. Node.js Promises only honor the first resolution, but the setTimeout is never cleared, so it fires even after 'end' resolves. This is not a crash bug but is sloppy — the setTimeout should be cleared on successful resolution.

**Recommendation:** Reduce the readStdin timeout to 3s (below the hook timeout) and clear the timeout on success.

### C3. PermissionRequest handled in code but NOT registered in hooks.json

**Severity: HIGH (dead code)**

The switch statement at line 260 handles `case 'PermissionRequest'` with 70 lines of logic (lines 260-329). However, `hooks.json` does NOT register a `PermissionRequest` hook. This means:

- Claude Code will never invoke this hook for PermissionRequest events
- The PermissionRequest code path is entirely dead code
- The state written (`status: 'permission_request'`) will never actually be written via this path

The `Notification` hook with `matcher: "idle_prompt|permission_prompt"` partially compensates — when a permission prompt occurs, the Notification handler (line 353) is invoked instead. But this means the detailed tool/option parsing in the PermissionRequest case (lines 263-315) is never executed.

---

## MODERATE Findings

### M1. index.json race condition on concurrent writes

**Severity: MEDIUM**

`writeState()` (lines 108-115) performs a read-modify-write cycle on `index.json`:
1. Read the file
2. Parse JSON
3. Add/update entry
4. Write back

If two hooks fire near-simultaneously for different cwds (e.g., SessionStart and InstructionsLoaded during startup), the second write will overwrite the first's changes to `index.json`. The per-cwd state files (`<hash>.json`) are safe since different cwds hash to different files, but `index.json` entries can be lost.

### M2. SessionStart setTimeout leaks — process may exit before callback fires

**Severity: MEDIUM**

At line 414-420, `SessionStart` schedules a `setTimeout` with 3000ms delay to check messages. But the hook process has already printed `'{}'` to stdout and the main function has completed. Node.js will keep the process alive for the timeout, but Claude Code's 5-second hook timeout may kill the process before the 3-second callback completes (since readStdin can take up to 5s, leaving 0s for the timeout callback).

In practice, readStdin likely resolves quickly (<100ms), so the 3s timeout should fire within the 5s hook timeout. But if stdin is slow, the setTimeout callback will never execute.

### M3. InstructionsLoaded overwrites instructionFiles instead of appending

**Severity: LOW**

Line 445: `instructionFiles: input.files || []`

The comment says "Append loaded instruction files to any previously tracked ones" but the code replaces `prevState.instructionFiles` with `input.files`. If InstructionsLoaded fires multiple times (e.g., once for CLAUDE.md, once for .claude/rules/), only the last batch is preserved.

Should be: `instructionFiles: [...(prevState.instructionFiles || []), ...(input.files || [])]`

### M4. InstructionsLoaded state merge spreads `prevState` then overwrites fields

**Severity: LOW**

Lines 438-446 spread `prevState` first, then set specific fields. This means `prevState.sessionId`, `prevState.transcriptPath`, `prevState.agentId`, `prevState.agentType` are overwritten even if the new values are `undefined` (since the InstructionsLoaded event may not include these fields). This could erase previously-set session metadata.

### M5. Agent matching by workingDirectory is bidirectional — overly broad

**Severity: LOW**

Lines 63-64 (and identical code at 139-140, 189-193):
```js
if (cwd.startsWith(agentWd + '/')) return true;
if (agentWd.startsWith(cwd + '/')) return true;
```

The second check matches an agent whose workingDirectory is a *subdirectory* of the hook's cwd. This is backwards — if the hook runs from `/home/user` and an agent's workingDirectory is `/home/user/project`, that agent would match. This could cause misattribution when agents have nested working directories.

### M6. Duplicated agent-lookup logic

**Severity: LOW (maintenance)**

The agent lookup by cwd pattern is copy-pasted in three functions: `broadcastStatusUpdate` (line 59-66), `sendMessageNotification` (line 136-143), `checkUnreadMessages` (line 182-196). Should be extracted to a shared helper.

---

## MINOR Findings

### m1. debug.log grows unbounded

`debugLog()` appends to `hook-debug.log` on every hook invocation (line 248 logs all input). No rotation or size limit exists. Over time this file will grow very large.

### m2. MD5 hash for cwd — weak but acceptable

`hashCwd()` uses MD5 with 16-char hex (64 bits). Collision probability is low for typical use but MD5 is deprecated. SHA-256 would be more appropriate.

### m3. `process.exit(0)` in catch handler

Line 463: `process.exit(0)` — explicitly exiting with 0 on error means Claude Code never sees the failure. This is intentional (don't block Claude) but makes debugging harder since errors are silently swallowed.

### m4. `plugin.json` missing `description` field

The plugin manifest at `.claude-plugin/plugin.json` has only `name`, `version`, `author`, `homepage`, `license`. No `description` field. Depending on Claude Code's plugin system requirements, this may or may not be needed.

### m5. hooks.json — no `SessionEnd` hook

Claude Code supports `SessionEnd` events but the hook doesn't register for them. This means the state file will show `active` or `idle` forever after a session ends — stale state. A `SessionEnd` handler should write `status: 'offline'` to clean up.

### m6. hooks.json — no `SubagentCompleted` or `PreToolUse`/`PostToolUse` hooks

These are available Claude Code hook events that could provide richer state tracking. Not a bug, but a gap in observability.

### m7. Empty JSON output format

Line 458: `console.log('{}')` — This is the correct output format for hooks that don't want to override Claude's behavior. Verified correct.

---

## Endpoint Verification Summary

| Hook Function | Endpoint Called | Exists? | Notes |
|---|---|---|---|
| `broadcastStatusUpdate` | `GET /api/agents` | YES | `app/api/agents/route.ts` |
| `broadcastStatusUpdate` | `POST /api/sessions/activity/update` | YES | But rejects hook status values (C1) |
| `checkUnreadMessages` | `GET /api/agents` | YES | |
| `checkUnreadMessages` | `GET /api/messages?agent=...&box=inbox&status=unread` | YES | `app/api/messages/route.ts` |
| `sendMessageNotification` | `POST /api/sessions/{name}/command` | YES | `app/api/sessions/[id]/command/route.ts` |

All endpoints exist in both Next.js routes and headless router.

---

## Summary

| Severity | Count | IDs |
|---|---|---|
| CRITICAL/HIGH | 2 | C1, C3 |
| MODERATE | 6 | C2, M1-M5 |
| MINOR | 7 | m1-m7 |
| **Total** | **15** | |

**Top 3 action items:**
1. Fix C1: Add `'waiting_for_input'` and `'permission_request'` to `VALID_STATUSES` in the activity update route (or map them to existing statuses like `'waiting'`)
2. Fix C3: Either register `PermissionRequest` in `hooks.json` or remove the dead code from the hook script
3. Fix M3: Actually append instructionFiles instead of replacing them
