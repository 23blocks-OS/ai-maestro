# EPCP P5 Fixes: cross-host-governance.test.ts
Generated: 2026-02-22

## Summary

Fixed 4 issues in `tests/cross-host-governance.test.ts`. 40 tests passing.

## MUST-FIX

### MF-007: host-keys mock
**Status: Already present** (lines 89-93). Mock for `signHostAttestation`, `getHostPublicKeyHex`, `verifyHostAttestation` was added in a prior pass.

### MF-008: manager-trust mock
**Status: Already present** (lines 96-99). Mock for `shouldAutoApprove` was added in a prior pass.

### MF-009: rate-limit mock incomplete
**Status: FIXED.** The mock provided `checkRateLimit`, `recordFailure`, `resetRateLimit` but the source imports `checkAndRecordAttempt` and `resetRateLimit`. Added `checkAndRecordAttempt: vi.fn(() => ({ allowed: true, retryAfterMs: 0 }))` to the mock factory. This was causing 27 of 39 tests to fail with "No checkAndRecordAttempt export is defined on the @/lib/rate-limit mock".

Also fixed a stale assertion: the source error message for missing fields now includes `requestedBy` (from SF-003 P5 fix), so updated the test assertion from `'missing id, type, or payload.agentId'` to `'missing id, type, requestedBy, or payload.agentId'`.

## SHOULD-FIX

### SF-028: auto-approve test coverage
**Status: Already present** (lines 820-857). Two tests exist: one where `shouldAutoApprove` returns true (verifies `approveGovernanceRequest` called as `targetManager`), one where it returns false (verifies no approval).

### SF-029: missing operation types in performRequestExecution
**Status: Already present** (lines 703-813). Tests exist for `assign-cos`, `remove-cos`, and `transfer-agent`.

### SF-030: sanitization guard tests
**Status: FIXED (1 new test).** Three tests already existed (invalid type, sourceHostId mismatch, status/approvals stripped). Added missing test for **invalid requestedByRole** -- sends `requestedByRole: 'superadmin'` and verifies 400 rejection with `'Invalid requestedByRole'`.

### SF-031: neither-source-nor-target guard
**Status: Already present** (lines 917-931). Test exists where both `sourceHostId` and `targetHostId` differ from `getSelfHostId()`, verifying 400 rejection with `'neither source nor target'`.

## NITS

### NT-027: unused mockExecuteGovernanceRequest
**Status: Already removed** in a prior pass. Comment at line 57 confirms it: "NT-015: Removed unused mockExecuteGovernanceRequest".

## Test Results

- Total: 40 tests
- Passed: 40
- Failed: 0

## Changes Made

1. Added `checkAndRecordAttempt` to `@/lib/rate-limit` mock (was missing, caused 27 test failures)
2. Updated stale error message assertion for missing-fields validation
3. Added test for invalid `requestedByRole` sanitization guard
4. Updated header comment with accurate test count (40)
