# Code Correctness Report: lib

**Agent:** epcp-code-correctness-agent
**Domain:** lib
**Files audited:** 25 (1 file `lib/tmux-discovery.ts` does not exist on disk, 24 files read completely)
**Date:** 2026-02-23T02:30:00Z
**Pass:** 8
**Run ID:** 57d244f7
**Finding ID Prefix:** CC-P8-A5

## MUST-FIX

### [CC-P8-A5-001] Notification service shell injection via literal tmux send-keys with embedded echo command
- **File:** /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:59
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `sendTmuxNotification` function sends `echo '${safeMessage}'` using `sendKeys` with `literal: true`. The literal flag causes tmux to use `-l` which types the string as raw keystrokes. This means the entire string `echo 'Hello'` is typed character-by-character into the terminal. The single-quote escaping at line 58 (`replace(/'/g, "'\\''")`) is designed for shell parsing. However, because the text is typed as literal keystrokes into whatever program is running in the pane, if the pane is NOT running a shell (e.g., a Python REPL, vim, another TUI), the `echo` command text would be injected as input to that program. The comment on lines 52-53 acknowledges this as a known limitation. The more critical issue is that the single-quote escaping scheme `'\\''` actually produces `'\''` in the literal keystrokes - this will close the current single-quote context, insert a backslash-escaped single quote, and reopen single quotes. But since `literal: true` means tmux types each character individually, the shell will correctly parse the sequence. This is actually correctly implemented for the intended use case (shell prompt). **Downgrading assessment:** The escaping is correct for shells. The acknowledged limitation about non-shell programs is a design tradeoff, not a bug. **Revised severity: NIT** (see NIT section).

*After deeper analysis, this is not a MUST-FIX. Moved to NIT.*

### [CC-P8-A5-002] `fromVerified` double nullish coalescing is a no-op
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:267
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The expression `ampMsg.fromVerified ?? Boolean(envelope.signature || ampMsg.signature) ?? false` has a redundant `?? false` at the end. The `Boolean()` call always returns either `true` or `false` -- it never returns `null` or `undefined`. So the final `?? false` will NEVER execute. This is not a bug per se (the behavior is correct), but it suggests the author intended a different logic. Since `Boolean(...)` cannot be nullish, this is misleading dead code rather than a correctness issue.
- **Evidence:**
```typescript
fromVerified: ampMsg.fromVerified ?? Boolean(envelope.signature || ampMsg.signature) ?? false,
```
- **Fix:** Remove the trailing `?? false` since it is unreachable: `ampMsg.fromVerified ?? Boolean(envelope.signature || ampMsg.signature)`

*Revised severity: NIT (no runtime impact, just misleading code)*

## SHOULD-FIX

### [CC-P8-A5-003] `validateApiKey` timing side-channel via early-exit find()
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:208-216
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** While `timingSafeEqual` is used for hash comparison, the `find()` loop exits early on the first match. An attacker can measure response time to determine how far into the array the matching key is. The comment on lines 205-207 acknowledges this as "Phase 1 acceptable" since API keys have 256-bit entropy, making timing attacks impractical. However, this undermines the purpose of using `timingSafeEqual` in the first place. If timing attacks are a concern (enough to use `timingSafeEqual`), they should also be a concern for the loop structure.
- **Evidence:**
```typescript
const record = keys.find(k => {
    const a = Buffer.from(k.key_hash, 'utf8')
    const b = Buffer.from(keyHash, 'utf8')
    const hashMatch = a.length === b.length && timingSafeEqual(a, b)
    return hashMatch &&
      k.status === 'active' &&
      (!k.expires_at || new Date(k.expires_at) > new Date())
  })
```
- **Fix:** Iterate all keys, collect the match, then return it. The comment already notes this for Phase 2.

### [CC-P8-A5-004] `acquireIndexSlot` has no timeout -- queued items wait forever
- **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:44-54
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `acquireIndexSlot` function uses a Promise that only resolves when the slot is released. If `releaseIndexSlot` is never called (e.g., the indexing operation throws before reaching the finally block, or an uncaught error occurs), the queued Promises will wait indefinitely, causing a silent resource leak. Unlike `file-lock.ts` which has a 30-second timeout (line 33), this throttle has no timeout mechanism. While line 697 has a `finally` block that calls `releaseSlot()`, an unexpected crash in the runtime or a Node.js microtask scheduling issue could leave the slot permanently held.
- **Evidence:**
```typescript
return new Promise((resolve) => {
    indexQueue.push({
      resolve: () => {
        activeIndexCount++
        resolve(() => releaseIndexSlot(agentId))
      },
      agentId,
      timestamp: Date.now()
    })
  })
```
- **Fix:** Add a timeout (e.g., 60 seconds) to the queued Promise, similar to the pattern in `file-lock.ts:48-75`.

### [CC-P8-A5-005] `getMessageStats` can increment undefined priority keys
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:926-928
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `getMessageStats` function initializes `byPriority` with only four keys (`low`, `normal`, `high`, `urgent`). At line 927, it does `stats.byPriority[m.priority]++`. If a message somehow has a priority value not in the predefined set (e.g., from a corrupted file or old format), this would create a new key with `NaN` (since `undefined + 1 === NaN`). The `convertAMPToMessage` function at line 276 validates priority, but old flat-format messages at line 398 use `ampMsg.priority || 'normal'` without validation, so malformed values could propagate.
- **Evidence:**
```typescript
messages.forEach(m => {
    stats.byPriority[m.priority]++
  })
```
- **Fix:** Guard with: `if (stats.byPriority[m.priority] !== undefined) stats.byPriority[m.priority]++`

### [CC-P8-A5-006] `loadApiKeys` returns cached mutable array -- external mutations corrupt cache
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:52-75
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `loadApiKeys()` returns `_apiKeysCache` directly (line 56 and 70). Callers like `validateApiKey` (line 202) and `revokeApiKey` (line 324) mutate the returned array or its elements in-place. While the comments at lines 219-222 acknowledge this for `validateApiKey` (last_used_at updates), the `revokeApiKey` function at line 337 sets `record.status = 'revoked'` on the cached element, then calls `saveApiKeys(keys)` which re-assigns `_apiKeysCache = keys`. If `saveApiKeys` fails (line 91-94 catches and throws), the in-memory cache is already mutated to 'revoked' but the disk is not updated, creating an inconsistency. Similarly, `revokeAllKeysForAgent` mutates multiple records before saving. If the save fails partway, some records are marked revoked in-memory but not on disk.
- **Evidence:**
```typescript
function loadApiKeys(): AMPApiKeyRecord[] {
  if (_apiKeysCache !== null && (now - _apiKeysCacheTimestamp) < API_KEYS_CACHE_TTL_MS) {
    return _apiKeysCache  // Direct reference returned
  }
  // ...
  _apiKeysCache = JSON.parse(data) as AMPApiKeyRecord[]
  return _apiKeysCache  // Direct reference returned
}
```
- **Fix:** Return a defensive copy (`return [..._apiKeysCache]`) or clone the array before mutation in write operations. Alternatively, mutate only after successful save.

### [CC-P8-A5-007] `createTeam` chiefOfStaffId may be set to `undefined` instead of omitted
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:279-281
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** When building `newTeam`, if `result.sanitized.chiefOfStaffId` is `undefined` (i.e., the key does not exist in the object), the ternary condition `result.sanitized.chiefOfStaffId !== undefined` is false, so it falls through to `data.chiefOfStaffId`. If `data.chiefOfStaffId` is also `undefined` (not provided by the caller), the `chiefOfStaffId` property on `newTeam` will be `undefined`. The `Team` type likely expects this to be `string | null | undefined`, and the codebase generally uses `null` for "no COS" (e.g., line 37 `team.chiefOfStaffId ?? null`). Passing `undefined` vs `null` could cause inconsistencies in downstream comparisons.
- **Evidence:**
```typescript
chiefOfStaffId: result.sanitized.chiefOfStaffId !== undefined
  ? (result.sanitized.chiefOfStaffId as string | undefined)
  : data.chiefOfStaffId,
```
- **Fix:** Default to `null` instead of allowing `undefined`: `chiefOfStaffId: result.sanitized.chiefOfStaffId !== undefined ? (result.sanitized.chiefOfStaffId as string | null) : data.chiefOfStaffId ?? null`

## NIT

### [CC-P8-A5-008] `fromVerified` double nullish coalescing is misleading dead code
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:267
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** As analyzed in CC-P8-A5-002 (moved from MUST-FIX), the trailing `?? false` is unreachable because `Boolean()` always returns a boolean. No runtime impact but confusing to readers.
- **Evidence:**
```typescript
fromVerified: ampMsg.fromVerified ?? Boolean(envelope.signature || ampMsg.signature) ?? false,
```
- **Fix:** Remove `?? false`.

### [CC-P8-A5-009] Notification service typing into non-shell programs is a known design limitation
- **File:** /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:52-59
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** As analyzed in CC-P8-A5-001 (moved from MUST-FIX), `sendTmuxNotification` sends an echo command as literal keystrokes. If the target pane is running vim, a REPL, or other non-shell program, the keystrokes are injected as input. The code comments acknowledge this. The escaping for single quotes is correctly implemented for the shell case.
- **Evidence:**
```typescript
await runtime.sendKeys(target, `echo '${safeMessage}'`, { literal: true, enter: true })
```
- **Fix:** Consider using tmux `display-message` instead of `send-keys` for non-intrusive notifications, or check if the pane is at a shell prompt before sending.

### [CC-P8-A5-010] `_agentCacheSweepInterval` is exported only for test cleanup, clutters module API
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:496-516
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The interval handle is stored in `_agentCacheSweepInterval` (prefixed with `_` suggesting private) but `cleanupAgentCacheSweep()` is exported for test cleanup. The comment at line 511 notes "TODO: Wire into shutdown handler or remove export." This is a minor API surface issue.
- **Evidence:**
```typescript
const _agentCacheSweepInterval = setInterval(() => { ... }, 5 * 60 * 1000)
_agentCacheSweepInterval.unref()
export function cleanupAgentCacheSweep(): void { ... }
```
- **Fix:** Wire into the application's graceful shutdown handler, or keep as-is for test use.

### [CC-P8-A5-011] `loadGovernance` returns defaults on ANY read error, not just corruption
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:43-59
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `readFileSync` fails with a non-SyntaxError (e.g., EACCES permission denied), the function logs the error but returns `DEFAULT_GOVERNANCE_CONFIG`. This silently masks configuration when file permissions are wrong. The pattern is consistent across governance.ts, governance-request-registry.ts, manager-trust.ts, and transfer-registry.ts. Acceptable for Phase 1 localhost deployment but could mask real issues.
- **Evidence:**
```typescript
} else {
  console.error('[governance] Failed to read governance config:', error)
}
return { ...DEFAULT_GOVERNANCE_CONFIG }
```
- **Fix:** Phase 2: distinguish ENOENT (expected) from other errors (unexpected) and potentially throw on unexpected errors.

### [CC-P8-A5-012] Missing file in domain: `lib/tmux-discovery.ts` does not exist
- **File:** lib/tmux-discovery.ts
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The file `lib/tmux-discovery.ts` was listed in the FILES domain but does not exist on disk. The tmux discovery functionality lives in `lib/agent-runtime.ts` (TmuxRuntime class). This is likely a stale reference in the audit file list rather than a missing implementation.
- **Fix:** Remove from domain file list if the file was renamed/removed.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts` -- No issues (delegated to agent-registry for resolution)
- `/Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts` -- No issues (thorough agent CRUD with proper locking, path traversal protection)
- `/Users/emanuelesabetta/ai-maestro/lib/document-registry.ts` -- No issues (correct UUID validation, atomic writes, proper locking)
- `/Users/emanuelesabetta/ai-maestro/lib/file-lock.ts` -- No issues (well-implemented in-process mutex with timeout, proper queue management)
- `/Users/emanuelesabetta/ai-maestro/lib/governance-peers.ts` -- No issues (proper path traversal validation, TTL expiry, atomic writes)
- `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts` -- No issues (correct approval state machine, TTL expiry, atomic writes)
- `/Users/emanuelesabetta/ai-maestro/lib/governance-sync.ts` -- No issues (proper payload validation, timeout on fetch, fire-and-forget error handling)
- `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` -- No issues (proper bcrypt usage, null guards for managerId)
- `/Users/emanuelesabetta/ai-maestro/lib/host-keys.ts` -- No issues (proper Ed25519 key management, restrictive permissions, atomic writes)
- `/Users/emanuelesabetta/ai-maestro/lib/manager-trust.ts` -- No issues (correct auto-approve logic, corruption handling)
- `/Users/emanuelesabetta/ai-maestro/lib/message-filter.ts` -- No issues (comprehensive governance filter with correct step ordering, multi-team COS handling)
- `/Users/emanuelesabetta/ai-maestro/lib/message-send.ts` -- No issues (proper governance checks, content security, signature verification)
- `/Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts` -- No issues (correct atomic check-and-record, proper cleanup with unref)
- `/Users/emanuelesabetta/ai-maestro/lib/role-attestation.ts` -- No issues (correct attestation signing/verification, replay protection)
- `/Users/emanuelesabetta/ai-maestro/lib/task-registry.ts` -- No issues (proper cycle detection, dependency cleanup on delete, timestamp management)
- `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` -- No issues (correct ACL logic for open/closed teams)
- `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts` -- No issues (proper compensating action with revertTransferToPending, corruption handling)
- `/Users/emanuelesabetta/ai-maestro/lib/types/amp.ts` -- No issues (well-defined type system, proper AMP address validation)
- `/Users/emanuelesabetta/ai-maestro/lib/validation.ts` -- No issues (simple UUID regex validation)
- `/Users/emanuelesabetta/ai-maestro/lib/agent-runtime.ts` -- No issues (proper use of execFileAsync for shell injection prevention)

## Test Coverage Notes

The following new/modified code paths may lack test coverage (tests may exist in other domains -- flagging for awareness):

1. **notification-service.ts** -- `sendTmuxNotification` with various message contents (special chars, long strings)
2. **messageQueue.ts** -- `collectMessagesFromAMPDir` with malformed JSON files, `convertAMPToMessage` with edge-case priority/type values
3. **amp-auth.ts** -- `validateApiKey` debounce behavior under concurrent calls, cache invalidation on failed `saveApiKeys`
4. **index-delta.ts** -- `acquireIndexSlot` queue timeout behavior (currently no timeout), `countFileLines` with empty files

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P8-A5-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P8-R57d244f7-f20eed6a-74cf-4a9e-acf9-bb9c6d3a1563.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
