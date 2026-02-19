# Fix transfer-registry.test.ts

**Date:** 2026-02-17

## Changes Made

1. **Added `afterEach` to vitest import** (line 1): was used at line 70 but not imported, causing implicit global reference.
2. **Path computation verified**: both source (`lib/transfer-registry.ts:16`) and test (`tests/transfer-registry.test.ts:50`) already use `os.homedir()` consistently. No change needed.
3. **Added idempotency test**: `returns null when approving an already-approved transfer (idempotency)` -- creates a transfer, approves it, then attempts to approve again and asserts null is returned and original resolution is unchanged.

## Test Results

All 9 tests pass (was 8 before, now 9 with new idempotency test):

| Test | Result |
|------|--------|
| loadTransfers > returns empty array when no file exists | PASS |
| loadTransfers > reads existing transfers from disk | PASS |
| createTransferRequest > creates a pending transfer and persists it | PASS |
| getTransferRequest > returns a transfer by ID, or null if not found | PASS |
| getPendingTransfersForTeam > filters by fromTeamId and pending status | PASS |
| getPendingTransfersForAgent > filters by agentId and pending status | PASS |
| resolveTransferRequest > approves a pending transfer | PASS |
| resolveTransferRequest > rejects a pending transfer with rejectReason | PASS |
| resolveTransferRequest > returns null when approving already-approved (idempotency) | PASS |
