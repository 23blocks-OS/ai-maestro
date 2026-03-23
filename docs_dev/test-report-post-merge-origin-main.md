# Test Report: Post-Merge Origin/Main

**Date:** 2026-02-22T10:51:21Z
**Branch:** feature/team-governance
**Runner:** vitest v4.0.18
**Duration:** 5.47s (tests: 7.30s)

## Summary

| Metric | Value |
|--------|-------|
| Test Files | 28 passed (28 total) |
| Tests | 780 passed (780 total) |
| Failed | 0 |
| Skipped | 0 |

## Result: ALL PASS

## Test Files Breakdown

| # | Test File | Tests | Time |
|---|-----------|-------|------|
| 1 | tests/host-keys.test.ts | 15 | 35ms |
| 2 | tests/document-registry.test.ts | 27 | 8ms |
| 3 | tests/task-registry.test.ts | 47 | 10ms |
| 4 | tests/services/teams-service.test.ts | 73 | 14ms |
| 5 | tests/governance.test.ts | 13 | 8ms |
| 6 | tests/team-registry.test.ts | 24 | 11ms |
| 7 | tests/agent-registry.test.ts | 91 | 26ms |
| 8 | tests/transfer-resolve-route.test.ts | 12 | 18ms |
| 9 | tests/team-api.test.ts | 24 | 13ms |
| 10 | tests/cross-host-governance.test.ts | 39 | 67ms |
| 11 | tests/document-api.test.ts | 21 | 14ms |
| 12 | tests/role-attestation.test.ts | 25 | 9ms |
| 13 | tests/governance-sync.test.ts | 16 | 7ms |
| 14 | tests/governance-request-registry.test.ts | 25 | 7ms |
| 15 | tests/governance-peers.test.ts | 20 | 6ms |
| 16 | tests/manager-trust.test.ts | 15 | 6ms |
| 17 | tests/transfer-registry.test.ts | 9 | 10ms |
| 18 | tests/agent-config-governance.test.ts | 16 | 4ms |
| 19 | tests/governance-endpoint-auth.test.ts | 12 | 5ms |
| 20 | tests/content-security.test.ts | 19 | 3ms |
| 21 | tests/message-filter.test.ts | 27 | 4ms |
| 22 | tests/amp-auth.test.ts | 19 | 3ms |
| 23 | tests/validate-team-mutation.test.ts | 18 | 3ms |
| 24 | tests/agent-auth.test.ts | 8 | 3ms |
| 25 | tests/agent-utils.test.ts | 21 | 3ms |
| 26 | tests/amp-address.test.ts | 9 | 2ms |
| 27 | tests/services/sessions-service.test.ts | 60 | 2455ms |
| 28 | tests/services/agents-core-service.test.ts | 75 | 4543ms |

## Slow Tests (>300ms)

- sessions-service.test.ts: createSession tests (~300ms each, 8 tests) -- tmux spawn delays
- agents-core-service.test.ts: hibernateAgent tests (~1500ms each, 3 tests) -- graceful shutdown timers

## Warnings

- `[DEP0169]` DeprecationWarning: `url.parse()` -- use WHATWG URL API instead
- `[baseline-browser-mapping]` data over two months old -- update recommended

## stderr Output (Expected)

All stderr output is from intentional error-path testing (corrupted JSON, invalid IDs, disk errors, etc.). No unexpected errors.
