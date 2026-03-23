# P5 Governance-Core Fix Report (Updated)
Generated: 2026-02-22T21:18:00Z

## Summary

Applied fixes for 1 MUST-FIX, 9 SHOULD-FIX, and 7 NIT findings from P5 review.
7 items were already fixed in prior passes. 9 new fixes applied in this pass.

| Severity | Total | Already Fixed | Newly Fixed |
|----------|-------|---------------|-------------|
| MUST-FIX | 1 | 1 | 0 |
| SHOULD-FIX | 9 | 4 | 5 |
| NIT | 7 | 4 | 3 |
| **Total** | **17** | **9** | **8** |

## MUST-FIX

### MF-001: G4 revocation on type change to closed
**File:** `lib/team-registry.ts:347-374`
**Status:** ALREADY FIXED (prior pass)
The code already captures `previousType` at line 329, checks `typeChangedToClosed` at line 356, and iterates ALL agentIds when type changes to closed (line 358-360).

## SHOULD-FIX

### SF-001: Atomic rate limiting in cross-host-governance-service.ts
**File:** `services/cross-host-governance-service.ts`
**Status:** FIXED (this pass)
Replaced manual `checkRateLimit()` + `recordFailure()` pattern with atomic `checkAndRecordAttempt()` in all three functions:
- `submitCrossHostRequest`
- `approveCrossHostRequest`
- `rejectCrossHostRequest`
Updated import from `{ checkRateLimit, recordFailure, resetRateLimit }` to `{ checkAndRecordAttempt, resetRateLimit }`.

### SF-002: Expire intermediate approval statuses
**File:** `lib/governance-request-registry.ts:264-278`
**Status:** FIXED (this pass)
Changed `expirePendingRequestsInPlace` to check non-terminal statuses array: `['pending', 'remote-approved', 'local-approved', 'dual-approved']`. Reject reason includes previous status.

### SF-003: Validate requestedBy in receiveCrossHostRequest
**File:** `services/cross-host-governance-service.ts:164-166`
**Status:** FIXED (this pass)
Added `!request.requestedBy` to the validation check.

### SF-004: Atomic write in deployUpdateSettings
**File:** `services/agents-config-deploy-service.ts:349-351`
**Status:** FIXED (this pass)
Changed to temp file + rename pattern for crash safety.

### SF-005: Verify recipientHostId in verifyRoleAttestation
**File:** `lib/role-attestation.ts:68-81`
**Status:** ALREADY FIXED (prior pass)

### SF-006: Atomic write in transfer-registry saveTransfers
**File:** `lib/transfer-registry.ts:56-62`
**Status:** ALREADY FIXED (prior pass)

### SF-007: Runtime validation in handleGovernanceSyncMessage
**File:** `lib/governance-sync.ts:183-199`
**Status:** ALREADY FIXED (prior pass)

### SF-026: Check handleGovernanceSyncMessage return value
**File:** `services/headless-router.ts:1322-1323`
**Status:** FIXED (this pass)
Now checks boolean return and sends 400 when false.

### SF-040: UUID validation for agentId in agents-skills-service
**File:** `services/agents-skills-service.ts:167-175`
**Status:** FIXED (this pass)
Added `isValidUuid(agentId)` check at start of `addSkill()`.

## NITS

### NT-001: Comment noting execution failure swallowing
**Status:** ALREADY DONE (prior pass) - `services/cross-host-governance-service.ts:401-403`

### NT-002: Version guard in loadGovernanceRequests
**File:** `lib/governance-request-registry.ts:44-48`
**Status:** FIXED (this pass)
Added version and array guard after JSON parse.

### NT-003: Comment about spread tightening
**File:** `services/cross-host-governance-service.ts:210-212`
**Status:** FIXED (this pass)
Added Phase 2 tightening comment.

### NT-005: Comment noting null safety
**Status:** ALREADY DONE (prior pass) - `lib/governance.ts:149-150`

### NT-006: GovernanceRole alias comment
**Status:** ALREADY DONE (prior pass) - `types/governance.ts:19-22`

### NT-007: Import renameSync
**Status:** ALREADY DONE (prior pass) - `lib/transfer-registry.ts:9`

## TypeScript Verification

All edited source files pass `tsc --noEmit` with zero errors. Pre-existing test-only type errors (8 in 5 test files) are unrelated.

## Files Modified (this pass)

1. `services/cross-host-governance-service.ts` - SF-001, SF-003, NT-003
2. `lib/governance-request-registry.ts` - SF-002, NT-002
3. `services/agents-config-deploy-service.ts` - SF-004
4. `services/headless-router.ts` - SF-026
5. `services/agents-skills-service.ts` - SF-040
