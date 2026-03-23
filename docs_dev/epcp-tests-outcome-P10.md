# Test Results - Pass 10

**Date:** 2026-02-22
**Branch:** feature/team-governance
**Runner:** vitest v4.0.18
**Duration:** 5.36s (tests: 7.24s)

## Summary

| Metric | Value |
|--------|-------|
| Test Files | 28 passed (28 total) |
| Tests | 780 passed (780 total) |
| Failed | 0 |
| Skipped | 0 |

## Result: ALL PASS

## Test Files Breakdown

| # | Test File | Status |
|---|-----------|--------|
| 1 | tests/host-keys.test.ts | PASS |
| 2 | tests/governance-request-registry.test.ts | PASS |
| 3 | tests/governance-sync.test.ts | PASS |
| 4 | tests/governance-peers.test.ts | PASS |
| 5 | tests/role-attestation.test.ts | PASS |
| 6 | tests/message-filter-layer2.test.ts | PASS |
| 7 | tests/cross-host-governance.test.ts | PASS |
| 8 | tests/manager-trust.test.ts | PASS |
| 9 | tests/agent-config-governance.test.ts | PASS |
| 10 | tests/services/sessions-service.test.ts | PASS |
| 11 | tests/services/agents-core-service.test.ts | PASS |
| 12-28 | (remaining 17 test files) | PASS |

## Timing

- Transform: 2.00s
- Setup: 0ms
- Import: 3.04s
- Tests: 7.24s
- Environment: 2ms
- Total wall clock: 5.36s

## Notes

- No failures, no skips, no errors
- All 780 tests across 28 files passed cleanly
- Two expected stderr outputs from host-keys corruption test and startup error test (test-internal, not failures)
