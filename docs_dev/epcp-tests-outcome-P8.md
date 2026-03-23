# EPCP Tests Outcome - Pass 8 (Re-run)

**Date:** 2026-02-23T03:02:10Z
**Runner:** vitest v4.0.18
**Duration:** 5.44s (tests 7.34s across parallel workers)

## Summary

| Metric | Value |
|--------|-------|
| Test Files | 30 passed / 30 total |
| Tests | 868 passed / 868 total |
| Failed | 0 |
| Skipped | 0 |

## Result: ALL TESTS PASS

## Test Files Breakdown

| # | Test File | Tests | Duration |
|---|-----------|-------|----------|
| 1 | tests/host-keys.test.ts | 15 | 40ms |
| 2 | tests/task-registry.test.ts | 47 | 10ms |
| 3 | tests/document-registry.test.ts | 28 | 9ms |
| 4 | tests/team-registry.test.ts | 24 | 13ms |
| 5 | tests/transfer-resolve-route.test.ts | 12 | 11ms |
| 6 | tests/agent-registry.test.ts | 91 | 21ms |
| 7 | tests/agent-config-governance.test.ts | 16 | 26ms |
| 8 | tests/agent-config-governance-extended.test.ts | 56 | 33ms |
| 9 | tests/cross-host-governance.test.ts | 40 | 67ms |
| 10 | tests/team-api.test.ts | 24 | 13ms |
| 11 | tests/manager-trust.test.ts | 15 | 5ms |
| 12 | tests/document-api.test.ts | 21 | 15ms |
| 13 | tests/role-attestation.test.ts | 27 | 11ms |
| 14 | tests/use-governance-hook.test.ts | 12 | 7ms |
| 15 | tests/governance-request-registry.test.ts | 34 | 11ms |
| 16 | tests/governance-sync.test.ts | 16 | 11ms |
| 17 | tests/governance-peers.test.ts | 20 | 7ms |
| 18 | tests/transfer-registry.test.ts | 14 | 10ms |
| 19 | tests/governance-endpoint-auth.test.ts | 13 | 5ms |
| 20 | tests/content-security.test.ts | 19 | 3ms |
| 21 | tests/governance.test.ts | 13 | 6ms |
| 22 | tests/amp-auth.test.ts | 19 | 3ms |
| 23 | tests/message-filter.test.ts | 28 | 3ms |
| 24 | tests/validate-team-mutation.test.ts | 18 | 3ms |
| 25 | tests/agent-auth.test.ts | 8 | 2ms |
| 26 | tests/agent-utils.test.ts | 21 | 3ms |
| 27 | tests/amp-address.test.ts | 9 | 2ms |
| 28 | tests/services/sessions-service.test.ts | 60 | 2432ms |
| 29 | tests/services/agents-core-service.test.ts | 75 | 4537ms |
| 30 | tests/services/teams-service.test.ts | 73 | 16ms |

## Changes Since Previous Run

- Test files: 28 -> 30 (+2 new files)
- Tests: 780 -> 868 (+88 new tests)
- New test files added:
  - tests/agent-config-governance-extended.test.ts (56 tests)
  - tests/use-governance-hook.test.ts (12 tests)
- Existing files with increased test counts:
  - document-registry: 27 -> 28
  - cross-host-governance: 39 -> 40
  - role-attestation: 25 -> 27
  - governance-request-registry: 25 -> 34
  - message-filter: 27 -> 28
  - transfer-registry: 9 -> 14
  - governance-endpoint-auth: 12 -> 13

## Notes

- No failures or errors detected.
- All stderr output is expected (error-handling tests logging intentional failures).
- Slowest files: agents-core-service.test.ts (4.5s) and sessions-service.test.ts (2.4s) due to timer-based hibernate/wake tests.
