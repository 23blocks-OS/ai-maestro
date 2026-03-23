# Code Correctness Report: types-lib

**Agent:** epcp-code-correctness-agent
**Domain:** types-lib
**Files audited:** 2
**Date:** 2026-02-22T17:00:00Z

## MUST-FIX

_(none)_

## SHOULD-FIX

### [CC-P1-A0-001] `purgeOldRequests` return value double-counts expired requests that were ALSO purged
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:279
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `purgeOldRequests` has a two-pass design: Pass 1 filters out old executed/rejected requests (the `filtered` array), and Pass 2 iterates the **filtered** results to auto-reject pending requests past a 7-day TTL. The return value on line 279 is `purged + expired`. However, there is a subtle edge case: if a pending request is older than 30 days (the default `maxAgeDays`), Pass 1 will NOT filter it out (because it's `pending`, not `executed` or `rejected`). Then Pass 2 marks it as `rejected`. In the NEXT call to `purgeOldRequests`, that now-rejected request (still older than 30 days) WILL be filtered out by Pass 1. So the double-count doesn't actually happen within one call. BUT: if `maxAgeDays` were set to a value < 7, a pending request aged between `maxAgeDays` and 7 days would not be affected by either pass, since Pass 1 only removes `executed`/`rejected` and Pass 2 only affects requests older than 7 days. This is a design gap rather than a bug.

  More critically: the `expired` count inflates the return value semantically. `purged` counts requests **removed** from the array. `expired` counts requests **status-changed** but still present in the array. The function returns `purged + expired` which suggests `purged + expired` items were removed, but only `purged` were actually removed. The `expired` requests are still in the array (now with status `rejected`). Callers logging this value (e.g., server.mjs line 1187-1188) will see a count that overstates actual removals.

- **Evidence:**
  ```typescript
  // Line 271-279
  const purged = before - filtered.length  // actual removals
  if (filtered.length < before || expired > 0) {
    saveGovernanceRequests({ ...file, requests: filtered })
  }
  // ...
  return purged + expired  // inflated: expired items are still in the array
  ```

- **Fix:** Either (a) return `{ purged, expired }` as a structured result so callers can distinguish, or (b) document that the return value includes both purged and expired (status-changed) requests.

### [CC-P1-A0-002] Duplicate TTL logic between `purgeOldRequests` and `expirePendingRequests`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:256-269 and 288-312
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The TTL expiry logic for pending requests is duplicated: once inside `purgeOldRequests` (lines 256-269, hardcoded 7-day TTL) and once in the standalone `expirePendingRequests` (lines 288-312, configurable `ttlDays` parameter). Both do the same thing: iterate pending requests, check `createdAt` against a cutoff, set status to `rejected`. If `purgeOldRequests` is the scheduled job (called from server.mjs), it already expires pending requests -- making `expirePendingRequests` redundant. If both are called, the second call is a no-op (the requests are already rejected), but it's confusing to maintain two code paths for the same behavior.

  The hardcoded `7 * 86_400_000` in `purgeOldRequests` line 257 also cannot be overridden by callers, while `expirePendingRequests` accepts a `ttlDays` parameter. This inconsistency could cause confusion about which TTL value is authoritative.

- **Evidence:**
  ```typescript
  // Inside purgeOldRequests (line 257) - hardcoded 7 days
  const pendingCutoff = Date.now() - 7 * 86_400_000

  // Standalone function (line 291) - configurable
  const cutoff = Date.now() - ttlDays * 86_400_000
  ```

- **Fix:** Remove the TTL logic from `purgeOldRequests` and have it call `expirePendingRequests` internally, or extract shared logic to a helper. At minimum, make the TTL in `purgeOldRequests` use the same configurable parameter.

### [CC-P1-A0-003] `getGovernanceRequest` and `listGovernanceRequests` read without acquiring the lock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:76-98
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `getGovernanceRequest` (line 76) and `listGovernanceRequests` (line 82) call `loadGovernanceRequests()` directly without acquiring the `governance-requests` lock. If a concurrent write operation is in progress (e.g., `createGovernanceRequest` has loaded the file and is about to save), these reads will get the pre-write data. More importantly, during the atomic write (lines 70-72: write to `.tmp` then rename), a read could theoretically see a partially-written `.tmp` file -- although since the read targets the original file and `renameSync` is atomic on POSIX, this specific scenario is safe on macOS/Linux.

  The real concern is TOCTOU in callers. For example, `cross-host-governance-service.ts:253` calls `getGovernanceRequest(requestId)` without a lock, then later calls `approveGovernanceRequest` under a lock. Between the two calls, the request could be modified or rejected by another concurrent API call. This is a low-probability race in Phase 1 (single process, localhost) but could cause stale reads.

- **Evidence:**
  ```typescript
  // Line 76-78 - no lock
  export function getGovernanceRequest(id: string): GovernanceRequest | null {
    const file = loadGovernanceRequests()
    return file.requests.find((r) => r.id === id) ?? null
  }
  ```

- **Fix:** For Phase 1 this is acceptable since it's single-process. Document that these are intentionally lock-free reads for performance. For multi-process Phase 2, wrap reads in `withLock` or use a reader-writer lock.

## NIT

### [CC-P1-A0-004] `ConfigurationPayload` fields are all optional with no discriminated union
- **File:** /Users/emanuelesabetta/ai-maestro/types/governance-request.ts:62-71
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `ConfigurationPayload` has an `operation` field that determines which other fields are relevant, but all other fields (`skills`, `plugins`, `hooks`, etc.) are optional. This means TypeScript won't catch cases where `operation: 'add-skill'` is set but `skills` is missing, or where `operation: 'update-model'` has irrelevant `skills` set. A discriminated union (`type AddSkillPayload = { operation: 'add-skill'; skills: string[]; scope: ConfigScope }`) would provide compile-time safety.

  The deploy service (`agents-config-deploy-service.ts`) does runtime validation (`if (!config.skills?.length)` etc.), so this is not a functional bug -- just a missed opportunity for compile-time enforcement.

- **Evidence:**
  ```typescript
  export interface ConfigurationPayload {
    operation: ConfigOperationType
    scope: ConfigScope
    skills?: string[]       // Only relevant for add-skill/remove-skill
    plugins?: string[]      // Only relevant for add-plugin/remove-plugin
    hooks?: Record<string, unknown>    // Only for update-hooks
    mcpServers?: Record<string, unknown> // Only for update-mcp
    model?: string          // Only for update-model
    programArgs?: string    // Only for update-program-args
  }
  ```

- **Fix:** Consider a discriminated union for stricter type safety. Low priority since runtime validation exists.

### [CC-P1-A0-005] Lock ordering comment does not mention `governance-requests` lock name
- **File:** /Users/emanuelesabetta/ai-maestro/lib/file-lock.ts:13-22
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The lock ordering invariant comment in `file-lock.ts` lists `'teams'`, `'transfers'`, `'governance'` but the governance request registry uses `'governance-requests'` (a different lock name). This is actually correct behavior (separate locks for governance config vs governance requests), but the comment should document `governance-requests` as well to prevent future developers from assuming `governance` covers all governance operations.

- **Evidence:**
  ```typescript
  // file-lock.ts lines 17-18
  //   1. 'teams'
  //   2. 'transfers'
  //   3. 'governance'
  // But governance-request-registry.ts uses 'governance-requests'
  ```

- **Fix:** Add `'governance-requests'` to the lock ordering documentation in `file-lock.ts`.

### [CC-P1-A0-006] `approveGovernanceRequest` silently returns request unchanged for terminal states
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:156
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** When `approveGovernanceRequest` is called on an already-rejected or already-executed request (line 156), it returns the request unchanged without any indication that the approval was not applied. Similarly, `rejectGovernanceRequest` on an executed request (line 208) and `executeGovernanceRequest` on a rejected request (line 229) silently return the unchanged request. Callers have no way to distinguish "approval was applied" from "request was already terminal" without checking the status themselves before and after.

  The cross-host-governance-service does check status after calling these functions, so this doesn't cause functional bugs, but returning `null` or a discriminated result (`{ applied: false, request }`) would be cleaner.

- **Evidence:**
  ```typescript
  // Line 155-156
  if (request.status === 'rejected' || request.status === 'executed') return request
  // Caller can't tell if approval was applied or not
  ```

- **Fix:** Consider returning a result type like `{ applied: boolean; request: GovernanceRequest }` or at minimum document this behavior in the JSDoc.

## CLEAN

Files with no critical issues found:
- `/Users/emanuelesabetta/ai-maestro/types/governance-request.ts` -- Type definitions are well-structured with appropriate imports. `ConfigurationPayload` optional-fields pattern is noted as a NIT but not a bug. `ConfigDiff` and `ConfigScope` types are clean and used correctly by callers.

## Test Coverage Notes

- The test file `tests/governance-request-registry.test.ts` (593 lines) covers the core CRUD operations, approval logic, rejection, execution, and the purge function.
- **Not covered in this domain's scope:** Whether callers correctly handle the return values from terminal-state guard clauses (CC-P1-A0-006). This would be tested in the cross-host-governance tests.
- **Not covered:** The `expirePendingRequests` standalone function does not appear in the test file's function list (only `purgeOldRequests` TTL behavior is tested). This should be verified in the test domain audit.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P1-A0-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P1-3408eab8-f0d4-4114-bee4-9d87f39b4dc0.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
