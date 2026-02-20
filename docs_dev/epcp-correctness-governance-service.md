# Code Correctness Report: governance-service

**Agent:** epcp-code-correctness-agent
**Domain:** governance-service
**Files audited:** 7 (1 service + 6 API routes for comparison)
**Date:** 2026-02-20T00:00:00Z

## MUST-FIX

### [CC-001] Missing error handling in resolveTransferReq -- TeamValidationException and uncaught errors
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:313-432
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `resolveTransferReq` function has NO try/catch around its main logic. The original API route (`transfers/[id]/resolve/route.ts:181-188`) has:
  ```typescript
  catch (error) {
    if (error instanceof TeamValidationException) {
      return NextResponse.json({ error: error.message }, { status: error.code })
    }
    console.error('Error resolving transfer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  ```
  The service imports `TeamValidationException` (line 22) but never catches it. If `loadTeams()` or any downstream call throws `TeamValidationException`, it will propagate as an unhandled exception to the caller, potentially crashing the process in headless mode (no NextResponse wrapper to catch it).

  Additionally, unexpected errors (disk I/O, JSON parse failures) from `loadTeams`, `resolveTransferRequest`, `saveTeams` etc. inside the lock section are not caught and will propagate without a `ServiceResult` wrapper.
- **Evidence:** Lines 313-432 -- no try/catch anywhere in the function body. Compare with route at `transfers/[id]/resolve/route.ts:181-188`.
- **Fix:** Wrap the entire function body in try/catch. Catch `TeamValidationException` and return `{ error: error.message, status: error.code }`. Catch generic errors and return `{ error: 'Internal server error', status: 500 }`. Ensure the lock is still released via finally (the current `finally` at line 429 handles lock release, but other exceptions before `acquireLock` are unguarded).

### [CC-002] Missing error handling in createTransferReq -- duplicate check throws Error
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:233-308
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `createTransferReq` function calls `createTransferRequest()` at line 306 without a try/catch. The lib function `transfer-registry.ts:66-68` throws `new Error('A pending transfer request already exists...')` inside the lock if a duplicate is found (this is the authoritative duplicate check). The service does a pre-flight duplicate check (lines 300-304), but due to TOCTOU, the authoritative check inside the lock can still fire. When it does, the thrown Error will propagate unhandled.

  The original API route (`transfers/route.ts:139-142`) wraps everything in try/catch that returns 500 for unexpected errors.
- **Evidence:** Line 306: `const transferRequest = await createTransferRequest({ agentId, fromTeamId, toTeamId, requestedBy, note })` -- no try/catch.
  Lib source at `transfer-registry.ts:66-68`: `throw new Error('A pending transfer request already exists...')`
- **Fix:** Wrap the `createTransferRequest` call (or the entire function body) in try/catch. Return `{ error: error.message, status: 409 }` for duplicate errors, and `{ error: 'Internal server error', status: 500 }` for generic errors.

## SHOULD-FIX

### [CC-003] Missing `existingRequest` field in duplicate transfer 409 response
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:303
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The original API route (`transfers/route.ts:133`) returns `{ error: '...', existingRequest: duplicate }` in the 409 response for duplicate transfer requests. The service (line 303) only returns `{ error: '...' }` without the `existingRequest` field. This is a behavioral difference from the original API that could break clients relying on the `existingRequest` field.
- **Evidence:**
  Service line 303: `return { error: 'A transfer request for this agent between these teams already exists', status: 409 }`
  Route line 133: `return NextResponse.json({ error: '...', existingRequest: duplicate }, { status: 409 })`
- **Fix:** Add `existingRequest` to the `ServiceResult` data or extend the return type to include it. E.g., change the duplicate check to: `return { data: { existingRequest: duplicate }, error: '...', status: 409 }`

### [CC-004] Unused import: TeamValidationException
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:22
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `TeamValidationException` is imported from `@/lib/team-registry` but never referenced anywhere in the file. It should either be used in error handling (see CC-001) or removed to keep imports clean.
- **Evidence:** Line 22: `import { loadTeams, saveTeams, TeamValidationException } from '@/lib/team-registry'`
  Grep for `TeamValidationException` in the file body returns only this import line.
- **Fix:** If CC-001 is fixed by adding proper catch blocks, the import will be needed. If not, remove it.

### [CC-005] Notification fires inside lock section in resolveTransferReq
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:404-426
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** In the service, the `notifyAgent()` call at lines 415-425 is INSIDE the `try { ... } finally { releaseLock() }` block (the finally is at line 429-431). The fire-and-forget `.catch()` on the promise means it won't block, but the promise is created while the lock is held. If `notifyAgent` is slow, the lock is held unnecessarily.

  In the original API route (`transfers/[id]/resolve/route.ts:155-178`), the notification code is OUTSIDE the `finally { releaseLock() }` block (lock released at line 152, notification at lines 156-178). The service should match this pattern.
- **Evidence:** Service: `notifyAgent()` at line 415 is between the lock acquire (line 339) and `finally { releaseLock() }` (line 429-431).
  Route: `notifyAgent()` at line 167 is after `finally { releaseLock() }` at line 152.
- **Fix:** Move the notification block (lines 404-426) to after the `finally { releaseLock() }` block. Store `fromTeam`, `toTeam`, and `resolved` in variables accessible outside the try block (like the API route does with its `let` declarations).

### [CC-006] `getGovernanceConfig` uses `??` but `managerId` is typed `string | null` -- subtle type difference from API route
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:50
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** The service uses `config.managerId ?? null` (line 50) while the API route uses `config.managerId` directly (line 12 of governance/route.ts). The `GovernanceConfig.managerId` type is `string | null` (from types/governance.ts:20). Using `?? null` is redundant -- if `managerId` is `null`, the result is already `null`. However, this could mask a future issue if the type changes to `string | undefined`, as `?? null` would coerce `undefined` to `null`, changing semantics.

  More importantly, if `managerId` is somehow `undefined` at runtime (malformed JSON), the API route would return `undefined` (truthy check `!!config.managerId` would be `false`), while the service would return `null`. This is a minor behavioral divergence.
- **Evidence:** Line 50: `managerId: config.managerId ?? null`
  API route line 12: `managerId: config.managerId`
- **Fix:** Use `config.managerId` directly to match the API route behavior exactly, or keep `?? null` but add a comment explaining why.

## NIT

### [CC-007] `any` types used in return signatures for transfer functions
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:208, 241, 316
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Three functions use `any` in their return type signatures:
  - `listTransferRequests` returns `ServiceResult<{ requests: any[] }>` (line 208)
  - `createTransferReq` returns `Promise<ServiceResult<{ success: boolean; request: any }>>` (line 241)
  - `resolveTransferReq` returns `Promise<ServiceResult<{ success: boolean; request: any }>>` (line 316)

  The `TransferRequest` type is available from `@/lib/transfer-registry` and should be used instead of `any` for proper type safety.
- **Evidence:** Lines 208, 241, 316 -- `any` in return type annotations.
- **Fix:** Import the `TransferRequest` type and use it: `ServiceResult<{ requests: TransferRequest[] }>`, `ServiceResult<{ success: boolean; request: TransferRequest }>`.

### [CC-008] `rejectReason` and `resolution` validation in createTransferReq is potentially dead code
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:266-275
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `createTransferReq` function validates `params.rejectReason` (lines 266-270) and `params.resolution` (lines 271-275), but these fields are never passed to `createTransferRequest()` at line 306 (which only accepts `agentId, fromTeamId, toTeamId, requestedBy, note`). The validation is carried over from the API route but serves no purpose since the values are discarded. The function signature (lines 233-241) includes `rejectReason` and `resolution` as optional params but they are never used.
- **Evidence:** Line 306: `const transferRequest = await createTransferRequest({ agentId, fromTeamId, toTeamId, requestedBy, note })` -- neither `rejectReason` nor `resolution` is passed.
  Lines 266-275: Validation of fields that are not forwarded.
- **Fix:** Remove `rejectReason` and `resolution` from the `createTransferReq` params and remove their validation (lines 266-275), OR if they were intended for future use, add a comment.

### [CC-009] Module-level cache (`reachableCache`) shared across requests -- no isolation between service consumers
- **File:** /Users/emanuelesabetta/ai-maestro/services/governance-service.ts:155-156
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `reachableCache` is module-level state (Map). This is identical to the original API route pattern. However, in the service layer, multiple callers (API route AND headless mode) will share this cache. This is likely the intended behavior for performance, but should be documented to avoid confusion. Cache entries are properly TTL-evicted.
- **Evidence:** Lines 155-156: `const reachableCache = new Map<...>()` at module scope.
- **Fix:** Add a comment noting that the cache is intentionally shared across all consumers of this service module.

## CLEAN

Files with no issues found:
- None -- all findings above apply to `/Users/emanuelesabetta/ai-maestro/services/governance-service.ts`

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 2 |
| SHOULD-FIX | 4 |
| NIT | 3 |
| **Total** | **9** |

The two MUST-FIX issues are both about missing error handling: `resolveTransferReq` has no try/catch at all (losing the `TeamValidationException` handling from the original route), and `createTransferReq` doesn't catch the duplicate-check `Error` thrown by the lib function. Both would result in unhandled exceptions propagating to callers in headless mode.
