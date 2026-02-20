# Code Correctness Report: governance-service (Round 2 - Independent Audit)

**Agent:** epcp-code-correctness-agent
**Domain:** governance-service
**Files audited:** 4
**Date:** 2026-02-20T17:00:00Z

## Files Audited

1. `services/governance-service.ts` (primary target)
2. `app/api/governance/transfers/route.ts` (comparison)
3. `app/api/governance/transfers/[id]/resolve/route.ts` (comparison)
4. `app/api/governance/route.ts` (comparison)

## MUST-FIX

### [CC-001] createTransferReq 409 response body is incompatible with sendServiceResult and API route contract
- **File:** `services/governance-service.ts:291`
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** When a duplicate transfer is found, the service returns:
  ```typescript
  return { data: { existingRequest: duplicate } as any, error: 'A transfer request...', status: 409 }
  ```
  Two problems:
  1. **`as any` cast** violates the declared return type `ServiceResult<{ success: boolean; request: TransferRequest }>`. The `data` field should contain `{ success, request }` but instead contains `{ existingRequest }`.
  2. **`sendServiceResult` behavior mismatch**: The headless router's `sendServiceResult()` (headless-router.ts:318-324) checks `if (result.error && !result.data)` -- since BOTH `error` and `data` are set, the condition is false, so it sends `result.data` (the `{ existingRequest: duplicate }` object) as the response body with status 409. The client never sees the error message string. The API route (transfers/route.ts:133) sends `{ error: '...', existingRequest: duplicate }` -- a flat object with both fields. These behaviors differ.
- **Evidence:**
  ```typescript
  // Service (line 291) -- sends data object without error message to client
  return { data: { existingRequest: duplicate } as any, error: '...', status: 409 }

  // API route (line 133) -- sends flat object with both error and existingRequest
  return NextResponse.json({ error: '...', existingRequest: duplicate }, { status: 409 })

  // sendServiceResult (headless-router.ts:318-324):
  if (result.error && !result.data) {   // false when both are set!
    sendJson(res, result.status || 500, { error: result.error })
  } else {
    sendJson(res, result.status || 200, result.data)  // sends { existingRequest: ... } without error
  }
  ```
- **Fix:** Either:
  (a) Remove the `data` field and only set `error`, then have the caller add `existingRequest` to the error response; or
  (b) Structure the ServiceResult so `data` includes `{ error: '...', existingRequest: duplicate }` and no top-level `error` is set, and the headless-router passes it through; or
  (c) Modify `sendServiceResult` to merge `error` into `data` when both are present. The cleanest fix is (a): `return { error: '...already exists', status: 409 }` and do NOT set `data`.

### [CC-002] createTransferReq 409 catch block loses the existingRequest
- **File:** `services/governance-service.ts:298-301`
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** When `createTransferRequest()` throws due to the inner (lock-protected) duplicate check, the catch block returns only `{ error: error.message, status: 409 }` without the `existingRequest` field. The API route at transfers/route.ts:133 returns `existingRequest: duplicate` for the pre-flight check, but neither the service's pre-flight path (CC-001 above) nor the inner-lock path provides it correctly via the ServiceResult pattern. The inner-lock duplicate path cannot provide the existing request because the thrown Error does not carry it.
- **Evidence:**
  ```typescript
  // Service catch (line 298-301)
  if (error instanceof Error && error.message.includes('pending transfer request already exists')) {
    return { error: error.message, status: 409 }
    // ^ No existingRequest field
  }
  ```
- **Fix:** Either have `createTransferRequest` include the duplicate request in the Error (e.g., custom exception class with a `duplicateRequest` property), or accept that the inner-lock duplicate path returns a simpler 409 without the existing request.

## SHOULD-FIX

### [CC-003] Missing rejectReason and resolution field length validation in createTransferReq
- **File:** `services/governance-service.ts:234-305`
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The API route (transfers/route.ts:82-91) validates `body.rejectReason` (max 500 chars) and `body.resolution` (max 500 chars) on POST to /api/governance/transfers. The service function `createTransferReq` does not validate these fields. While `rejectReason` and `resolution` are not part of the `createTransferRequest` params type and thus cannot be passed through, if the headless router passes raw body fields, they would be ignored silently. This is a minor inconsistency -- the real risk is if the service is ever extended to accept these fields.
- **Evidence:**
  ```typescript
  // API route validates (lines 82-91):
  if (body.rejectReason !== undefined && body.rejectReason !== null) { ... }
  if (body.resolution !== undefined && body.resolution !== null) { ... }

  // Service does NOT validate these fields
  ```
- **Fix:** Add validation for unexpected extra fields, or document that the service only accepts the fields declared in its params type and extra fields are ignored.

### [CC-004] resolveTransferReq: if revertTransferToPending throws, system is left inconsistent
- **File:** `services/governance-service.ts:400-404`
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `saveTeams()` returns false (disk full, permission error), the code calls `await revertTransferToPending(transferId)` at line 402. This function internally uses `withLock('transfers', ...)` which calls `readFileSync`/`writeFileSync`. If these disk operations ALSO fail (same disk-full condition), the revert throws an exception. The `finally` block releases the `'teams'` lock, and the outer `catch` returns a generic 500. But at this point the transfer is marked as 'approved' in the transfers file while the teams file was NOT updated -- an inconsistent state.
- **Evidence:**
  ```typescript
  const saved = saveTeams(teams)
  if (!saved) {
    await revertTransferToPending(transferId)  // Can throw if disk is also full
    return { error: '...transfer reverted to pending', status: 500 }
  }
  ```
- **Fix:** Wrap `revertTransferToPending` in try/catch and log a critical error if the revert itself fails, noting the inconsistent state. Consider also logging the transfer ID so an operator can manually fix it.

### [CC-005] `resolved!` non-null assertion at line 438 is fragile
- **File:** `services/governance-service.ts:438`
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `resolved` is declared as `TransferRequest | null = null` at line 340. It is assigned at line 377 from `resolveTransferRequest()` which can return `null`. The null case early-returns at line 378. So at line 438, `resolved` should always be non-null when execution reaches that point. However, the `!` assertion is a maintenance hazard -- if someone refactors the early return away, it will silently produce undefined behavior.
- **Evidence:**
  ```typescript
  // Line 340
  let resolved: TransferRequest | null = null
  // Line 377-378
  resolved = await resolveTransferRequest(...)
  if (!resolved) return { error: 'Transfer already resolved', status: 409 }
  // Line 438 (after finally)
  return { data: { success: true, request: resolved! }, status: 200 }
  ```
- **Fix:** Either refactor to guarantee `resolved` is non-null via control flow (e.g., assign a default throw at the end of the try block), or add an explicit null check before line 438 as a safety guard.

### [CC-006] API route resolve endpoint uses authenticateAgent; service does not -- no validation that resolvedBy is the authenticated caller
- **File:** `services/governance-service.ts:310-313`
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The API route at `transfers/[id]/resolve/route.ts:27-33` authenticates the resolver via `authenticateAgent(Authorization, X-Agent-Id)` headers and uses the authenticated identity as `resolvedBy`. The service function accepts `resolvedBy` as a plain string parameter with no authentication. While the headless router does authenticate before calling the service (headless-router.ts:1128-1132), any direct caller of `resolveTransferReq` could pass an arbitrary `resolvedBy` without authentication. This is a defense-in-depth concern.
- **Evidence:**
  ```typescript
  // API route authenticates:
  const auth = authenticateAgent(request.headers.get('Authorization'), request.headers.get('X-Agent-Id'))

  // Service just accepts the string:
  export async function resolveTransferReq(
    transferId: string,
    params: { action?: string; resolvedBy?: string; rejectReason?: string }
  )
  ```
- **Fix:** Document that the service layer expects the caller to authenticate, or add a comment/JSDoc noting the authentication contract. Alternatively, accept a pre-authenticated agent context object instead of raw strings.

## NIT

### [CC-007] listTransferRequests is synchronous but all other service functions are async
- **File:** `services/governance-service.ts:205`
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `listTransferRequests` and `getGovernanceConfig` return `ServiceResult<T>` directly (not wrapped in `Promise`). All other functions return `Promise<ServiceResult<T>>`. This inconsistency means the headless router must handle both patterns. Currently `sendServiceResult` handles both because `await` on a non-Promise just returns the value. Not a bug, but inconsistent API surface.
- **Fix:** Either make all functions async for consistency, or document the intentional mix.

### [CC-008] `sendServiceResult` accepts `any` instead of `ServiceResult<unknown>`
- **File:** `services/headless-router.ts:318`
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `function sendServiceResult(res: ServerResponse, result: any)` -- the `any` type means TypeScript cannot catch misuse (e.g., passing a raw string or an object without `status`).
- **Fix:** Type as `ServiceResult<unknown>` or create a union type for the service result pattern.

### [CC-009] Cache eviction in getReachableAgents iterates full map on every uncached call
- **File:** `services/governance-service.ts:194-197`
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Every time a cache miss occurs, the code iterates all entries in `reachableCache` to evict stale ones. With many agents, this is O(n) on every uncached request. For Phase 1 localhost usage this is negligible, but the pattern doesn't scale.
- **Evidence:**
  ```typescript
  for (const [key, entry] of reachableCache) {
    if (now >= entry.expiresAt) reachableCache.delete(key)
  }
  ```
- **Fix:** Use a TTL-based Map library, or only evict periodically (e.g., every 100th call), or accept the cost as acceptable for Phase 1.

## CLEAN

Files with no issues found:
- `app/api/governance/route.ts` -- Simple GET endpoint, correctly returns governance config. No issues.
- `app/api/governance/transfers/route.ts` -- Well-structured with comprehensive validation (JSON parse safety, UUID validation, type checks, team validation, TOCTOU-safe duplicate handling). No issues.
- `app/api/governance/transfers/[id]/resolve/route.ts` -- Correct lock acquisition/release in finally, TeamValidationException caught, notifications outside lock, authentication via headers. No issues.

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 2 |
| SHOULD-FIX | 4 |
| NIT | 3 |
| **Total** | **9** |

### Key architectural observations:
1. **Lock safety is correct**: All early returns inside try-finally blocks properly release locks via the finally clause.
2. **Notification placement is correct**: All notifications are fired outside the lock section (after finally).
3. **Lock ordering is consistent**: `'teams'` -> `'transfers'` ordering is maintained throughout, matching the documented invariant.
4. **The service is not yet wired to the Next.js API routes**: Only the headless-router uses the service functions. The API routes still contain their own implementations. This duplication is a separate concern (not a correctness bug in the service itself).
