# Code Correctness Report: governance-service

**Agent:** epcp-code-correctness-agent
**Domain:** governance-service
**Files audited:** 1
**Date:** 2026-02-20T16:14:00Z

## Verification of Claimed Fixes

### Fix 1: try/catch for TeamValidationException in resolveTransferReq
**VERIFIED at lines 332-445.** The outer try/catch wraps the entire function body. Line 440 catches `TeamValidationException` and returns `{ error: error.message, status: error.code }`. Line 443-444 catches generic errors as 500. The `finally` block at line 410-412 releases the lock. All correct.

### Fix 2: try/catch for duplicate Error in createTransferReq
**VERIFIED at lines 294-304.** The try/catch wraps the `createTransferRequest()` call. Line 299 checks `error instanceof Error && error.message.includes(...)` for the TOCTOU duplicate race. Falls through to generic 500 on line 303. Correct.

### Fix 3: Added existingRequest to 409 duplicate response
**VERIFIED at line 291.** The duplicate is returned as `{ existingRequest: duplicate }`. However, see SHOULD-FIX CC-001 below.

### Fix 4: Moved notification outside lock section in resolveTransferReq
**VERIFIED.** The `notifyAgent()` call is at lines 414-436, AFTER the `finally { releaseLock() }` block at lines 410-412. Team names are captured into `fromTeamName`/`toTeamName` variables inside the lock (lines 408-409) for use after release. Correct.

### Fix 5: Fixed ?? null to direct property access for managerId
**VERIFIED.** Line 362: `const managerId = getManagerId()` returns `string | null` directly. No `?? null` pattern. Correct.

### Fix 6: Removed dead rejectReason/resolution validation in createTransferReq
**VERIFIED.** No validation of `rejectReason` or `resolution` in `createTransferReq`. Only `note` is validated (lines 260-263). Correct -- these fields belong to the resolve endpoint only.

### Fix 7: Changed `any` types to TransferRequest in return signatures
**PARTIALLY VERIFIED.** Import on line 22: `import type { TransferRequest } from '@/types/governance'`. Return types on lines 240 and 313 correctly use `TransferRequest`. However, see CC-001 for a remaining `as any`.

---

## SHOULD-FIX

### [CC-001] `as any` type assertion hides mismatched 409 response shape
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:291
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The 409 duplicate response uses `as any` to force a `{ existingRequest: duplicate }` object into the `data` field, which is typed as `{ success: boolean; request: TransferRequest }`. This means callers expecting `data.success` and `data.request` will get `undefined` for those fields, and `data.existingRequest` is invisible to TypeScript.
- **Evidence:**
  ```typescript
  // Line 291
  return { data: { existingRequest: duplicate } as any, error: '...', status: 409 }
  // But the return type is:
  // ServiceResult<{ success: boolean; request: TransferRequest }>
  ```
- **Fix:** Either:
  (a) Broaden the return type to include the 409 case: `ServiceResult<{ success: boolean; request: TransferRequest } | { existingRequest: TransferRequest }>`, or
  (b) Return the duplicate in the `error` field as JSON-encoded data or as a separate top-level field on `ServiceResult`, or
  (c) Most pragmatically, return it as `{ data: { success: false, request: duplicate }, error: '...', status: 409 }` to match the declared type.

### [CC-002] Early returns before lock acquisition skip the outer try/catch -- but that's actually fine
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:333-335
- **Severity:** NIT (no action needed)
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Lines 333-335 (`getTransferRequest` + status check) are inside the outer try/catch but before the lock. These are read-only operations that don't need the lock. If `getTransferRequest` threw (e.g., JSON parse error), it would be caught by the outer catch at line 439. This is correct and robust. No issue.

### [CC-003] TOCTOU race between status check and lock acquisition
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:333-342
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The transfer request's status is checked at line 335 (`transferReq.status !== 'pending'`) BEFORE the lock is acquired at line 342. Another concurrent request could resolve the same transfer between line 335 and line 342. However, this is partially mitigated because `resolveTransferRequest` on line 377 returns `null` if already resolved (checking again inside the transfer-registry lock). The early check on line 335 is an optimization to avoid acquiring the teams lock unnecessarily, and the real protection is on line 377-378.
- **Fix:** This is acceptable as-is because line 377-378 handles the race. However, the error message on line 378 (`'Transfer already resolved'`) differs from line 335 (`'Transfer request is already resolved'`). These should be consistent for easier client-side handling.

### [CC-004] `revertTransferToPending` called while teams lock is held -- potential deadlock
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:402
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** On line 402, if `saveTeams` fails, `revertTransferToPending(transferId)` is called. Looking at the transfer-registry, `revertTransferToPending` uses `withLock('transfers', ...)` (a different lock name than `'teams'`). So this is NOT a same-lock deadlock. However, calling `revertTransferToPending` inside the teams lock means the teams lock is held while waiting for the transfers lock. If another code path holds the transfers lock and waits for the teams lock, this would deadlock. Need to verify no such inverse lock ordering exists elsewhere.
- **Fix:** Consider releasing the teams lock before reverting, or document the lock ordering invariant (teams lock is always acquired before transfers lock, never the reverse).

---

## NIT

### [CC-005] Inconsistent error messages for already-resolved transfer
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:335 vs 378
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Line 335: `'Transfer request is already resolved'` (status 409). Line 378: `'Transfer already resolved'` (status 409). Clients parsing error messages will see different strings for the same condition depending on timing.
- **Evidence:**
  ```typescript
  // Line 335
  if (transferReq.status !== 'pending') return { error: 'Transfer request is already resolved', status: 409 }
  // Line 378
  if (!resolved) return { error: 'Transfer already resolved', status: 409 }
  ```
- **Fix:** Use the same error message for both.

### [CC-006] Module-level mutable cache without eviction bound
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:156
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `reachableCache` is a module-level `Map` with TTL-based eviction (lines 194-197), but eviction only runs when a NEW entry is added (after the cache miss path). If 10,000 unique agentIds are queried once each and never queried again, the map grows to 10,000 entries and never shrinks (eviction won't run without new misses). In practice this is bounded by the number of agents, which is small, so this is a minor concern.
- **Fix:** Optionally add a max-size cap (e.g., `if (reachableCache.size > 500) reachableCache.clear()`).

### [CC-007] `console.log` in production code path
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:145-148
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Password set/change events are logged via `console.log` with timestamps. While this doesn't expose the password itself, it reveals when password operations occur, which could be information leakage in shared log environments.
- **Fix:** Use a proper logger with level filtering, or remove these logs.

---

## CLEAN

Files with no issues found:
- (none -- all findings are SHOULD-FIX or NIT, no MUST-FIX)

## Summary

The 7 claimed fixes are all correctly applied. The lock is properly released in all error paths via the `finally` block. The notification is correctly placed outside the lock. The `TeamValidationException` catch is properly structured. The only notable remaining issue is the `as any` on line 291 which hides a type mismatch in the 409 duplicate response. No MUST-FIX issues found.
