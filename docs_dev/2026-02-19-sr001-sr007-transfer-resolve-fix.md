# Implementation Report: SR-001 and SR-007 Transfer Resolve Route Fixes
Generated: 2026-02-19T17:21:00Z

## Task
Fix two consistency bugs in the transfer resolve route:
- SR-001: Multi-closed-team constraint check ran AFTER resolveTransferRequest, leaving inconsistent state on constraint failure
- SR-007: saveTeams failure left transfer marked "approved" with no team mutations persisted

## TDD Summary

### Tests Written (5 total, 2 new for the bugs)
- `tests/transfer-resolve-route.test.ts::SR-001::rejects transfer BEFORE marking as approved` - Verifies constraint check runs before resolveTransferRequest
- `tests/transfer-resolve-route.test.ts::SR-001::allows approval when no conflict` - Verifies happy path still works
- `tests/transfer-resolve-route.test.ts::SR-001::allows rejection even with constraint` - Constraint only applies to approvals
- `tests/transfer-resolve-route.test.ts::SR-007::reverts transfer to pending on saveTeams failure` - Verifies compensating revert
- `tests/transfer-resolve-route.test.ts::SR-007::does not revert on success` - No spurious revert calls

### Implementation
- `lib/transfer-registry.ts` - Added `revertTransferToPending(id)` function to set transfer back to pending and clear resolved fields
- `app/api/governance/transfers/[id]/resolve/route.ts` - Restructured to move constraint check before resolveTransferRequest; added compensating revert on saveTeams failure

## Test Results
- New test file: 5 passed, 0 failed
- transfer-registry.test.ts: 9 passed, 0 failed (no regressions)
- governance.test.ts: 11 passed, 0 failed (no regressions)

## Changes Made
1. **SR-001 fix**: Moved multi-closed-team constraint check (lines 73-89 in new file) BEFORE `resolveTransferRequest` (line 94). Now if the constraint fails, `resolveTransferRequest` is never called and the transfer stays `pending`.
2. **SR-007 fix**: Added `await revertTransferToPending(id)` call at line 129 when `saveTeams` returns false. This reverts the transfer from `approved` back to `pending`.
3. **New function**: `revertTransferToPending(id)` in `lib/transfer-registry.ts` - uses `withLock('transfers', ...)` to atomically set status back to `pending` and clear `resolvedAt`, `resolvedBy`, and `rejectReason` fields.
4. **Import**: Added `revertTransferToPending` to the route's imports from `@/lib/transfer-registry`.
