# Code Correctness Report: api-governance

**Agent:** epcp-code-correctness-agent
**Domain:** api-governance
**Files audited:** 6
**Date:** 2026-02-19T00:00:00Z

## MUST-FIX

_None found._

## SHOULD-FIX

### [CC-001] Missing UUID validation on `requestedBy` in transfers POST
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:52-68
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `requestedBy` field is validated for authority (`isManager`/`isChiefOfStaffAnywhere`) but never validated for UUID format via `isValidUuid()`. While the authority check effectively rejects non-existent agents (since only registered agents can hold those roles), the `requestedBy` value is stored verbatim in the transfer request on disk. A non-UUID string (e.g., path traversal attempt or very long string) would be persisted even though the authority check would fail. However, if a valid manager/COS agent has a UUID as its ID (which they do since getAgent uses UUID), this is mitigated. The inconsistency with `agentId`/`fromTeamId`/`toTeamId` (all UUID-validated) is the concern.
- **Evidence:**
```typescript
// Line 62: These are validated
if (!isValidUuid(agentId) || !isValidUuid(fromTeamId) || !isValidUuid(toTeamId)) {
  return NextResponse.json({ error: 'Invalid UUID format' }, { status: 400 })
}
// Line 68: requestedBy is NOT validated for UUID format
if (!isManager(requestedBy) && !isChiefOfStaffAnywhere(requestedBy)) {
```
- **Fix:** Add `!isValidUuid(requestedBy)` to the UUID validation check on line 62, or add a separate check before the authority verification.

### [CC-002] Missing UUID validation on `resolvedBy` in transfers resolve POST
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:33-36
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `resolvedBy` field is narrowed from `unknown` to `string` but never validated for UUID format. It is stored in the transfer request on disk via `resolveTransferRequest()`. Although the authority check at line 69-73 (`isSourceCOS` or `isGlobalManager`) ensures `resolvedBy` must match a real agent ID to pass, the value is persisted before this verification could be considered complete in all edge cases. Consistent UUID validation for all ID fields is a defense-in-depth best practice.
- **Evidence:**
```typescript
// Line 33: narrowed but not UUID-validated
const resolvedBy = typeof body.resolvedBy === 'string' ? body.resolvedBy : ''
// Line 36: checked for truthiness only
if (!action || !resolvedBy) {
  return NextResponse.json({ error: 'action and resolvedBy are required' }, { status: 400 })
}
// Line 21: transfer ID is validated
if (!isValidUuid(id)) {
```
- **Fix:** Add `if (!isValidUuid(resolvedBy))` check after line 36, returning a 400 error.

### [CC-003] `typeof requestedBy` not validated as string in transfers POST
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:50-58
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The code validates `typeof agentId`, `typeof fromTeamId`, and `typeof toTeamId` as strings on line 57, but `requestedBy` is only checked for truthiness on line 52 (`!requestedBy`). If `requestedBy` is a number or boolean (truthy but not a string), it would pass the truthiness check and be passed to `isManager()` and `isChiefOfStaffAnywhere()` which expect strings. While JavaScript's `===` comparison in those functions would reject non-string values (no match), the value could still propagate to `createTransferRequest()` which stores it.
- **Evidence:**
```typescript
// Line 52: only truthiness check
if (!agentId || !fromTeamId || !toTeamId || !requestedBy) {
// Line 57: type check for these three but NOT requestedBy
if (typeof agentId !== 'string' || typeof fromTeamId !== 'string' || typeof toTeamId !== 'string') {
```
- **Fix:** Add `typeof requestedBy !== 'string'` to the type check on line 57.

### [CC-004] Cache not invalidated when governance/teams config changes
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts:7-8
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The reachable agents cache has a 5-second TTL, which means after a governance change (e.g., changing team type from open to closed, or transferring an agent), the reachable list may serve stale data for up to 5 seconds. While the comment acknowledges this trade-off, this could cause user-visible inconsistency: a transfer is approved, but for 5 seconds the UI still shows the old reachable list. This is a known design trade-off documented in the code, but worth flagging.
- **Evidence:**
```typescript
// Line 7-8: 5-second TTL cache
const cache = new Map<string, { ids: string[]; expiresAt: number }>()
const CACHE_TTL_MS = 5_000
```
- **Fix:** Consider adding a cache-bust mechanism (e.g., export a `clearReachableCache()` function) that governance mutation endpoints can call after successful changes. Alternatively, accept the 5s staleness as documented.

### [CC-005] Error message in transfers resolve leaks internal team name
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:98-101
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When the multi-closed-team constraint check fails, the error message includes the name of the other closed team the agent is already in. In a governance system with messaging isolation, leaking team names across boundaries could reveal organizational structure to unauthorized parties. In Phase 1 (localhost-only) this is acceptable, but should be addressed before Phase 2.
- **Evidence:**
```typescript
return NextResponse.json({
  error: `Agent is already in closed team "${otherClosedTeam.name}" — normal agents can only be in one closed team`,
}, { status: 409 })
```
- **Fix:** For Phase 2, replace the team name with its ID or a generic message: `"Agent is already in another closed team — normal agents can only be in one closed team"`.

## NIT

### [CC-006] Redundant truthiness check in reachable route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts:18
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Line 18 checks `agentId && typeof agentId === 'string'`, but `agentId` is already confirmed non-null/truthy by the check on line 14. The `typeof` check is also redundant because `request.nextUrl.searchParams.get()` always returns `string | null`, and the null case is already handled. The condition simplifies to just the regex test.
- **Evidence:**
```typescript
// Line 14: already checked non-null
if (!agentId) {
  return NextResponse.json({ error: 'agentId query parameter is required' }, { status: 400 })
}
// Line 18: agentId is guaranteed to be a non-empty string at this point
if (agentId && typeof agentId === 'string' && !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
```
- **Fix:** Simplify to `if (!/^[a-zA-Z0-9_-]+$/.test(agentId))`.

### [CC-007] `note` field in transfers POST not validated for type or length
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:50
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `note` field is destructured from the body and passed directly to `createTransferRequest()`. If a client sends `note: 12345` (number) or `note: {obj: true}` (object), it will be stored as-is in JSON. Similarly, there is no length limit, so a multi-megabyte string could be persisted.
- **Evidence:**
```typescript
const { agentId, fromTeamId, toTeamId, requestedBy, note } = body
// ...
const transferRequest = await createTransferRequest({ agentId, fromTeamId, toTeamId, requestedBy, note })
```
- **Fix:** Add `typeof note !== 'string'` check (when present) and a reasonable length limit (e.g., 1000 chars).

### [CC-008] `rejectReason` field in resolve route not length-limited
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:34
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `rejectReason` is narrowed to string type but has no maximum length validation. A client could send a very large string that gets persisted to disk.
- **Evidence:**
```typescript
const rejectReason = typeof body.rejectReason === 'string' ? body.rejectReason : undefined
```
- **Fix:** Add a length limit (e.g., `rejectReason?.slice(0, 1000)` or a validation check).

### [CC-009] `password` field not checked for `typeof` before length check
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts:13
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED (but low severity)
- **Description:** Actually, on re-reading, the check on line 13 does include `typeof password !== 'string'`. This is correct. However, the `currentPassword` field on line 33 is not type-checked: if `currentPassword` is a number (truthy), it would be passed to `verifyPassword()` which calls `bcrypt.compare()`. `bcrypt.compare` with a non-string would throw an error, which is caught by the outer try/catch. Not a real bug, but inconsistent with the `password` validation style.
- **Evidence:**
```typescript
// Line 33: currentPassword not type-checked
if (!currentPassword || !(await verifyPassword(currentPassword))) {
```
- **Fix:** Add `typeof currentPassword !== 'string'` to the check: `if (!currentPassword || typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword)))`.

### [CC-010] Redundant `agentId` format validation regex differs from UUID validation elsewhere
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts:18
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The reachable route validates `agentId` with regex `/^[a-zA-Z0-9_-]+$/` (alphanumeric + hyphens/underscores), while the transfers routes validate IDs with `isValidUuid()` (strict UUID format). This inconsistency means the reachable route accepts non-UUID agent IDs (e.g., session names), while transfers only accept UUIDs. This may be intentional (reachable might accept agent names), but the comment on `isValidUuid` says "Used for path parameter validation to prevent path traversal" -- the reachable route's regex also prevents path traversal but is looser.
- **Evidence:**
```typescript
// reachable/route.ts:18 - loose format
if (agentId && typeof agentId === 'string' && !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
// transfers/route.ts:62 - strict UUID
if (!isValidUuid(agentId) || !isValidUuid(fromTeamId) || !isValidUuid(toTeamId)) {
```
- **Fix:** Consider whether reachable should also use `isValidUuid()` for consistency, or document why it accepts a broader format.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts -- No issues. Clean GET handler, proper null handling with optional chaining.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts -- Minor nit (CC-009) only. Core logic is solid: rate limiting, bcrypt length validation, proper JSON error handling.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts -- No issues. Proper rate limiting, null-vs-string handling for agentId, agent existence validation, correct error responses.

## SUMMARY

| Severity | Count |
|----------|-------|
| MUST-FIX | 0 |
| SHOULD-FIX | 5 |
| NIT | 5 |
| **Total** | **10** |

**Overall assessment:** The code is well-structured with good error handling patterns throughout. The lock ordering is documented and followed correctly. The transfer resolve route's compensating action (revert to pending on saveTeams failure) is a solid pattern. The main gaps are consistency in input validation (some fields get UUID validation while others don't) and a few missing type/length checks on free-text fields. No critical bugs or race conditions found.
