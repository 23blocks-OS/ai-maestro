# EPCP P8 Fix Report: lib modules domain

**Generated:** 2026-02-23T03:00:00Z
**Pass:** 8
**Domain:** lib modules (amp-auth, index-delta, messageQueue, team-registry, governance, notification-service)

---

## Summary

| Finding | Severity | Status | Fix Type |
|---------|----------|--------|----------|
| SF-034 | SHOULD-FIX | FIXED | Code change |
| SF-035 | SHOULD-FIX | FIXED | Code change |
| SF-036 | SHOULD-FIX | FIXED | Code change |
| SF-037 | SHOULD-FIX | FIXED | Code change |
| SF-038 | SHOULD-FIX | FIXED | Code change |
| NT-006 | NIT | FIXED | Code change |
| NT-007 | NIT | FIXED | Code change |
| NT-026 | NIT | FIXED | Code change |
| NT-027 | NIT | FIXED | Documentation only |
| NT-028 | NIT | FIXED | Documentation only |
| NT-029 | NIT | FIXED | Code change |
| NT-030 | NIT | NO-OP | No source references exist |

**Result: 11/12 fixed (1 was already resolved -- no source code references to remove)**

---

## Detailed Fixes

### SF-034: validateApiKey timing side-channel via early-exit find()
**File:** `lib/amp-auth.ts`
**Fix:** Replaced `keys.find()` (which exits early on first match) with a `for...of` loop that iterates ALL keys and only captures the first match without breaking. This eliminates the timing side-channel where an attacker could infer the position of a matching key by measuring response time.

### SF-035: acquireIndexSlot has no timeout -- queued items wait forever
**File:** `lib/index-delta.ts`
**Fix:** Added a 60-second timeout (`INDEX_SLOT_TIMEOUT_MS`) to the queued Promise in `acquireIndexSlot`. When the timeout fires, the entry is removed from the queue and the Promise rejects with a descriptive error. The timeout handle is cleared when the slot is acquired normally. Pattern matches `file-lock.ts:48-75`.

### SF-036: getMessageStats can increment undefined priority keys
**File:** `lib/messageQueue.ts`
**Fix:** Added `if (m.priority in stats.byPriority)` guard before incrementing. If a message has a priority value not in the predefined set (`low`, `normal`, `high`, `urgent`), it is silently skipped instead of producing `NaN`.

### SF-037: loadApiKeys returns cached mutable array
**File:** `lib/amp-auth.ts`
**Fix:** Split loading into two functions:
- `_loadApiKeysRaw()` -- internal, returns the raw cache reference (used only by `validateApiKey` for in-place `last_used_at` mutation per SF-039)
- `loadApiKeys()` -- public, returns `[..._loadApiKeysRaw()]` (defensive shallow copy)

This ensures external callers (createApiKey, rotateApiKey, revokeApiKey) cannot accidentally corrupt the cache, while the hot validation path still avoids unnecessary cloning.

### SF-038: createTeam chiefOfStaffId may be set to undefined instead of null
**File:** `lib/team-registry.ts`
**Fix:** Added `?? null` fallback to the chiefOfStaffId assignment in `createTeam`. When neither `result.sanitized.chiefOfStaffId` nor `data.chiefOfStaffId` is provided, the value now defaults to `null` (matching the codebase convention for "no COS assigned") instead of `undefined`.

### NT-006: Unused requestingAgentId passed to notifyTeamAgents
**File:** `app/api/teams/notify/route.ts`
**Fix:** Removed the `{ ...body, requestingAgentId: auth.agentId }` spread. `NotifyTeamParams` only defines `agentIds` and `teamName`; the extra property was silently ignored. Now passes `body` directly.

### NT-007: Deprecated recordFailure alias used instead of recordAttempt
**File:** `app/api/teams/[id]/chief-of-staff/route.ts`
**Fix:** Changed import from `recordFailure` to `recordAttempt` and updated the call site at line 45. `recordFailure` is a deprecated alias (renamed per MF-023).

### NT-026: fromVerified double nullish coalescing is misleading dead code
**File:** `lib/messageQueue.ts`
**Fix:** Removed the trailing `?? false` from line 267. `Boolean()` always returns a boolean, so the second nullish coalescing was unreachable dead code.

### NT-027: Notification service typing into non-shell programs (document only)
**File:** `lib/notification-service.ts`
**Fix:** Enhanced the existing comment in `sendTmuxNotification` to clearly label this as `NT-027: KNOWN LIMITATION` and suggest `tmux display-message` as a Phase 2 alternative.

### NT-028: _agentCacheSweepInterval exported only for test cleanup
**File:** `lib/messageQueue.ts`
**Fix:** Updated the JSDoc on `cleanupAgentCacheSweep()` to explicitly document that the export exists solely for test cleanup (NT-028), that `.unref()` handles production, and that a future graceful shutdown handler should call this function.

### NT-029: loadGovernance returns defaults on ANY read error
**File:** `lib/governance.ts`
**Fix:** Added `ENOENT` vs other error code distinction in the non-SyntaxError branch. `ENOENT` (race between `existsSync` and `readFileSync`) is handled by reinitializing defaults with a warning. All other errors (EACCES, EIO, etc.) are logged at error level with the error code for debugging.

### NT-030: Missing file reference lib/tmux-discovery.ts does not exist
**File:** N/A (no source code references)
**Fix:** Verified that no `.ts` source file references `tmux-discovery`. The stale reference exists only in `docs_dev/` audit reports (not tracked in git). No code change needed.

---

## Test Results

All 868 tests pass across 30 test files. No regressions introduced.

## Files Modified

1. `lib/amp-auth.ts` -- SF-034 (timing side-channel), SF-037 (defensive copy)
2. `lib/index-delta.ts` -- SF-035 (timeout for queued slots)
3. `lib/messageQueue.ts` -- SF-036 (priority guard), NT-026 (dead code), NT-028 (docs)
4. `lib/team-registry.ts` -- SF-038 (null default for chiefOfStaffId)
5. `lib/governance.ts` -- NT-029 (error code distinction)
6. `lib/notification-service.ts` -- NT-027 (documentation)
7. `app/api/teams/notify/route.ts` -- NT-006 (unused param)
8. `app/api/teams/[id]/chief-of-staff/route.ts` -- NT-007 (deprecated alias)
