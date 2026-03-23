# EPCP Tests Outcome - Pass 5

**Date:** 2026-02-22 21:27:56 UTC
**Branch:** feature/team-governance
**Runner:** vitest v4.0.18
**Duration:** 5.78s (transform 2.50s, setup 0ms, import 3.58s, tests 7.35s)

## Summary

| Metric         | Value |
|----------------|-------|
| **Test Files** | 30 passed / 30 total |
| **Tests**      | 862 passed / 862 total |
| **Failures**   | 0 |
| **Skipped**    | 0 |

**Result: ALL 862 TESTS PASSED across 30 files. Zero failures.**

## Per-File Breakdown

| # | Test File | Tests | Time | Status |
|---|-----------|-------|------|--------|
| 1 | tests/host-keys.test.ts | 15 | 34ms | PASS |
| 2 | tests/document-registry.test.ts | 27 | 11ms | PASS |
| 3 | tests/task-registry.test.ts | 47 | 13ms | PASS |
| 4 | tests/services/teams-service.test.ts | 73 | 13ms | PASS |
| 5 | tests/agent-registry.test.ts | 91 | 26ms | PASS |
| 6 | tests/transfer-resolve-route.test.ts | 12 | 13ms | PASS |
| 7 | tests/agent-config-governance-extended.test.ts | 56 | 46ms | PASS |
| 8 | tests/cross-host-governance.test.ts | 40 | 67ms | PASS |
| 9 | tests/team-api.test.ts | 24 | 15ms | PASS |
| 10 | tests/governance-peers.test.ts | 20 | 5ms | PASS |
| 11 | tests/document-api.test.ts | 21 | 13ms | PASS |
| 12 | tests/governance.test.ts | 13 | 7ms | PASS |
| 13 | tests/agent-config-governance.test.ts | 16 | 17ms | PASS |
| 14 | tests/transfer-registry.test.ts | 9 | 5ms | PASS |
| 15 | tests/use-governance-hook.test.ts | 12 | 6ms | PASS |
| 16 | tests/role-attestation.test.ts | 27 | 7ms | PASS |
| 17 | tests/governance-sync.test.ts | 16 | 8ms | PASS |
| 18 | tests/governance-request-registry.test.ts | 34 | 10ms | PASS |
| 19 | tests/manager-trust.test.ts | 15 | 6ms | PASS |
| 20 | tests/governance-endpoint-auth.test.ts | 13 | 5ms | PASS |
| 21 | tests/content-security.test.ts | 19 | 3ms | PASS |
| 22 | tests/amp-auth.test.ts | 19 | 3ms | PASS |
| 23 | tests/message-filter.test.ts | 28 | 3ms | PASS |
| 24 | tests/validate-team-mutation.test.ts | 18 | 3ms | PASS |
| 25 | tests/agent-auth.test.ts | 8 | 3ms | PASS |
| 26 | tests/amp-address.test.ts | 9 | 2ms | PASS |
| 27 | tests/agent-utils.test.ts | 21 | 2ms | PASS |
| 28 | tests/services/sessions-service.test.ts | 60 | 2440ms | PASS |
| 29 | tests/services/agents-core-service.test.ts | 75 | 4547ms | PASS |
| 30 | (remaining tests) | -- | -- | PASS |

**Total: 862 tests, 30 files, 0 failures, 0 skipped**

## Failure Details

None. All 862 tests passed.

## Notes

- Two service test files (sessions-service and agents-core-service) are slower due to async timer-based tests (2.4s and 4.5s respectively).
- All stderr output observed is expected (testing error handling paths: corrupted JSON, permission denied, disk errors, etc.).
- No deprecation issues affecting tests (only a Node.js `url.parse()` warning unrelated to tests).
- Previous run stored in this file had 5 failures in `transfer-registry.test.ts` due to missing `renameSync` in fs mock. Those are now fixed.
