# Code Correctness Report: api-governance

**Agent:** epcp-code-correctness-agent
**Domain:** api-governance
**Files audited:** 6
**Date:** 2026-02-19T00:00:00Z

## MUST-FIX

### [CC-001] TOCTOU race in transfers/route.ts POST: team state can change between validation and createTransferRequest
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:63-95
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The POST handler reads team state (line 63: `loadTeams()`) and validates it (lines 64-86: fromTeam exists, agent is in fromTeam, toTeam exists, COS check, type check), then calls `createTransferRequest()` (line 95) which acquires a `'transfers'` lock internally. However, between the validation reads and the write, another request could modify the teams file (e.g., removing the agent from the team, deleting the team, or changing the team type from closed to open). The validation and creation are NOT atomic with respect to team state.
- **Evidence:**
```typescript
// Line 63-86: Reads and validates team state WITHOUT holding any lock
const teams = loadTeams()
const fromTeam = teams.find(t => t.id === fromTeamId)
// ... validation checks ...
if (fromTeam.type !== 'closed') { ... }

// Line 95: Creates transfer request — acquires 'transfers' lock but NOT 'teams' lock
const transferRequest = await createTransferRequest({ agentId, fromTeamId, toTeamId, requestedBy, note })
```
- **Fix:** Wrap the entire validation + creation in a `withLock('teams', ...)` block, or at minimum re-validate team state inside the `createTransferRequest` callback (which already holds the `'transfers'` lock). Alternatively, acquire both the `'teams'` and `'transfers'` locks before validation (always in the same order to avoid deadlocks).

### [CC-002] Lock release on early return in transfers/[id]/resolve/route.ts — lock leaks on early NextResponse returns inside try block
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:47-135
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The code acquires a `'teams'` lock on line 42 via `acquireLock('teams')`, with `releaseLock()` in a `finally` block on line 134. However, there are multiple early `return NextResponse.json(...)` statements inside the try block (lines 52, 59, 70, 84-87, 97). In Next.js App Router, returning a `NextResponse` from within a try block does NOT skip the finally — so the lock IS released. This is actually correct in JavaScript/TypeScript; `finally` always runs. **Upon deeper analysis: the lock is correctly released because `finally` runs on return.** Downgrading — this is NOT a bug.

**RETRACTED** — `finally` in JavaScript/TypeScript executes on `return`, `throw`, and normal completion. The lock release pattern is correct.

### [CC-003] Transfer resolve acquires 'teams' lock but resolveTransferRequest internally acquires 'transfers' lock — potential deadlock ordering issue
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:42,94
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The resolve handler acquires the `'teams'` lock (line 42), then inside the critical section calls `resolveTransferRequest()` (line 94) which internally acquires the `'transfers'` lock (transfer-registry.ts:98). Meanwhile, the POST handler in transfers/route.ts does NOT acquire the `'teams'` lock but does acquire the `'transfers'` lock (via `createTransferRequest`). If two concurrent requests are: (A) resolve acquiring teams->transfers, and (B) a hypothetical future handler acquiring transfers->teams, a deadlock would occur. Currently, no handler acquires locks in the reverse order (transfers->teams), so this is safe. However, the lock ordering is implicit and fragile.
- **Evidence:**
```typescript
// resolve/route.ts:42 — acquires 'teams' first
const releaseLock = await acquireLock('teams')
// resolve/route.ts:94 — then acquires 'transfers' inside
resolved = await resolveTransferRequest(id, ...)
// resolveTransferRequest uses withLock('transfers', ...)
```
- **Fix:** Document the required lock ordering (`teams` before `transfers`) as a comment in file-lock.ts and at both call sites. This prevents future developers from introducing deadlocks. Currently not a live bug but a maintenance hazard.

## SHOULD-FIX

### [CC-004] Shared rate-limit key 'governance-password' across password and manager endpoints allows cross-endpoint lockout
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts:19, /Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts:21
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Both the password change endpoint and the manager assignment endpoint use the same rate-limit key `'governance-password'`. This means 5 failed password attempts on the manager endpoint will also lock out the password change endpoint (and vice versa). An attacker (even on localhost) could intentionally fail 5 times on the manager endpoint to lock out the password change endpoint.
- **Evidence:**
```typescript
// password/route.ts:19
const rateCheck = checkRateLimit('governance-password')

// manager/route.ts:21
const rateCheck = checkRateLimit('governance-password')
```
- **Fix:** Use separate keys: `'governance-password-change'` and `'governance-manager-auth'`.

### [CC-005] Password endpoint returns 500 with internal error message when request.json() fails on malformed JSON
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts:7,45-50
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** If the request body is not valid JSON, `request.json()` on line 7 throws a SyntaxError. The catch block on line 45 catches it and returns a 500 with `error.message` (which will be something like "Unexpected token..."). This should be a 400 Bad Request, not 500.
- **Evidence:**
```typescript
// Line 7
const body = await request.json()
// ...
// Line 45-50
} catch (error) {
    console.error('Failed to set password:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set password' },
      { status: 500 }
    )
}
```
- **Fix:** Add a separate try/catch around `request.json()` that returns 400 on parse failure, or check if the error is a SyntaxError and return 400 in the outer catch.

### [CC-006] Same malformed JSON issue in manager/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts:8,54-59
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-005. `request.json()` failure returns 500 instead of 400.
- **Fix:** Same as CC-005.

### [CC-007] Same malformed JSON issue in transfers/route.ts POST
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:44,98-101
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-005. `request.json()` failure returns 500 instead of 400.
- **Fix:** Same as CC-005.

### [CC-008] Same malformed JSON issue in transfers/[id]/resolve/route.ts POST
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:20,163-168
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-005. `request.json()` failure returns 500 instead of 400.
- **Fix:** Same as CC-005.

### [CC-009] Transfer POST does not validate input types for string fields
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:47
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The check `!agentId || !fromTeamId || !toTeamId || !requestedBy` only checks truthiness. A caller passing `agentId: 123` (number) would pass this validation and proceed to use a number where a string is expected. The password endpoint correctly validates `typeof password !== 'string'`, but the transfers endpoint does not validate its string fields.
- **Evidence:**
```typescript
// Line 47: Only checks truthiness, not type
if (!agentId || !fromTeamId || !toTeamId || !requestedBy) {
```
- **Fix:** Add `typeof` checks: `typeof agentId !== 'string' || typeof fromTeamId !== 'string' || ...`

### [CC-010] Transfer resolve POST does not validate types of action and resolvedBy
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:23-28
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The resolve endpoint checks `!action || !resolvedBy` but does not verify they are strings. `resolvedBy` is passed to `isManager()` and `isChiefOfStaffAnywhere()` which do strict `===` comparisons, so a non-string value would fail authorization but with a confusing error message ("Only the source team COS or MANAGER can resolve this transfer" rather than "invalid input").
- **Fix:** Add `typeof action !== 'string' || typeof resolvedBy !== 'string'` check.

### [CC-011] Reachable endpoint does not validate agentId format
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts:12-15
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The agentId query parameter is used directly as a cache key and passed to `checkMessageAllowed()` without any format validation. While there is no direct injection vector (it is compared via `===` against stored IDs), extremely long or specially crafted agentId values could be used for cache poisoning (storing many entries in the in-memory Map). The cache eviction on line 47 helps, but an attacker could still create many cache entries within the 5s TTL.
- **Fix:** Validate that agentId matches UUID format (`/^[0-9a-f-]{36}$/i`) or add a cache size limit.

### [CC-012] Governance GET endpoint exposes managerId (UUID) without authentication
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts:12
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The GET endpoint returns the manager's UUID to any caller. While the code has a comment noting this is intentional for Phase 1, the managerId is a security-sensitive value because it is used as an authorization credential in other endpoints (transfers/route.ts uses `isManager(requestedBy)` where requestedBy is the managerId). Exposing it makes it easier for any local process to impersonate the manager.
- **Evidence:**
```typescript
// Line 12: Returns managerId to unauthenticated callers
managerId: config.managerId,
```
- **Fix:** For Phase 1 this is documented as accepted risk (localhost only). For Phase 2, remove managerId from the unauthenticated response or require auth.

## NIT

### [CC-013] Password max length not enforced
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts:10
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The password has a minimum length check (6 chars) but no maximum. bcrypt has a 72-byte input limit; passwords longer than 72 bytes are silently truncated. A user could set a 100-char password and not realize only the first 72 bytes are used.
- **Fix:** Add `password.length > 72` check or document the limitation.

### [CC-014] Transfer resolve notification uses toTeam?.name which could be undefined for rejected transfers
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:144
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** On line 144, `toTeam?.name || 'unknown'` is used in the approve notification branch. However, for approved transfers, toTeam is guaranteed to exist (checked on line 69-71). For rejected transfers, line 145 correctly avoids using toTeam. The `|| 'unknown'` fallback is unreachable for the approve path. This is not a bug, just dead code in the fallback.
- **Fix:** No action needed; the `|| 'unknown'` is defensive and harmless.

### [CC-015] Transfer resolve getTransferRequest called outside the 'teams' lock
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:31-37
- **Severity:** NIT
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** `getTransferRequest(id)` is called on line 31 before the teams lock is acquired on line 42. The transfer status check on line 35 (`transferReq.status !== 'pending'`) is done outside any lock. A concurrent resolve request could pass this check simultaneously. However, `resolveTransferRequest()` on line 94 re-checks `status !== 'pending'` inside the `'transfers'` lock (transfer-registry.ts:102), so the double-resolve is correctly prevented. The outer check is just an optimization to avoid acquiring the teams lock unnecessarily.
- **Fix:** Add a comment explaining the outer check is an optimization and the real guard is inside `resolveTransferRequest()`.

### [CC-016] Reachable endpoint cache does not account for governance/team changes
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts:7-8
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The 5-second cache means changes to team membership or governance roles take up to 5 seconds to reflect in the reachable agents list. This is documented behavior ("TTL of 5 seconds balances freshness with performance") and acceptable for Phase 1.
- **Fix:** Acceptable as-is. If needed, add a cache-busting query parameter or event-based invalidation.

### [CC-017] Transfer POST duplicate check has narrow TOCTOU window
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:89-93
- **Severity:** NIT
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `getPendingTransfersForAgent()` on line 89 reads the transfers file outside any lock, then `createTransferRequest()` on line 95 reads again inside the `'transfers'` lock. Two concurrent POST requests with the same parameters could both pass the duplicate check, then both create transfer requests. This is a minor issue because duplicate transfers are operationally harmless (the resolve endpoint handles them independently).
- **Fix:** Move the duplicate check inside `createTransferRequest()` under the lock, or accept as a minor edge case.

## CLEAN

Files with no issues beyond those listed above:
- `/Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts` — Clean, well-structured with periodic cleanup
- `/Users/emanuelesabetta/ai-maestro/lib/file-lock.ts` — Clean, correct mutex implementation for single-process

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 1 (CC-001; CC-002 retracted; CC-003 downgraded to documentation) |
| SHOULD-FIX | 9 (CC-004 through CC-012) |
| NIT | 5 (CC-013 through CC-017) |

**Key themes:**
1. **TOCTOU race in transfer creation** (CC-001) — validation and write not atomic with respect to team state
2. **Malformed JSON returns 500 instead of 400** across all 4 POST endpoints (CC-005 through CC-008)
3. **Missing input type validation** on transfer endpoints (CC-009, CC-010)
4. **Shared rate-limit key** causes cross-endpoint lockout (CC-004)
5. **Lock ordering undocumented** — currently safe but fragile (CC-003)
