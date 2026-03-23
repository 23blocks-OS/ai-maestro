# Test Suite Results - Pass 3

**Date:** 2026-02-22
**Branch:** feature/team-governance
**Command:** `yarn test` (vitest run v4.0.18)
**Exit Code:** 0
**Duration:** 5.36s total (tests: 7.36s across parallel workers)

## Summary

| Metric | Value |
|--------|-------|
| **Test Files** | 30 passed (30 total) |
| **Tests** | 851 passed (851 total) |
| **Failed** | 0 |
| **Skipped** | 0 |

## Per-File Breakdown

| # | Test File | Tests | Duration |
|---|-----------|-------|----------|
| 1 | tests/host-keys.test.ts | 15 | 33ms |
| 2 | tests/task-registry.test.ts | 47 | 10ms |
| 3 | tests/services/teams-service.test.ts | 73 | 11ms |
| 4 | tests/transfer-resolve-route.test.ts | 12 | 13ms |
| 5 | tests/team-registry.test.ts | 24 | 14ms |
| 6 | tests/agent-registry.test.ts | 91 | 22ms |
| 7 | tests/agent-config-governance.test.ts | 16 | 23ms |
| 8 | tests/agent-config-governance-extended.test.ts | 56 | 34ms |
| 9 | tests/document-registry.test.ts | 27 | 9ms |
| 10 | tests/team-api.test.ts | 24 | 19ms |
| 11 | tests/cross-host-governance.test.ts | 39 | 73ms |
| 12 | tests/document-api.test.ts | 21 | 15ms |
| 13 | tests/governance-sync.test.ts | 16 | 22ms |
| 14 | tests/transfer-registry.test.ts | 9 | 6ms |
| 15 | tests/role-attestation.test.ts | 25 | 10ms |
| 16 | tests/use-governance-hook.test.ts | 10 | 7ms |
| 17 | tests/governance-peers.test.ts | 20 | 7ms |
| 18 | tests/governance-request-registry.test.ts | 30 | 9ms |
| 19 | tests/governance.test.ts | 13 | 6ms |
| 20 | tests/manager-trust.test.ts | 15 | 5ms |
| 21 | tests/content-security.test.ts | 19 | 3ms |
| 22 | tests/governance-endpoint-auth.test.ts | 12 | 5ms |
| 23 | tests/message-filter.test.ts | 27 | 3ms |
| 24 | tests/validate-team-mutation.test.ts | 18 | 3ms |
| 25 | tests/amp-auth.test.ts | 19 | 2ms |
| 26 | tests/agent-auth.test.ts | 8 | 2ms |
| 27 | tests/agent-utils.test.ts | 21 | 2ms |
| 28 | tests/amp-address.test.ts | 9 | 2ms |
| 29 | tests/services/sessions-service.test.ts | 60 | 2441ms |
| 30 | tests/services/agents-core-service.test.ts | 75 | 4545ms |

## Failures

None. All 851 tests passed.

## Slow Tests (>300ms)

| Test | File | Duration |
|------|------|----------|
| creates a local session successfully | tests/services/sessions-service.test.ts | 305ms |
| normalizes name to lowercase | tests/services/sessions-service.test.ts | 304ms |
| uses provided working directory | tests/services/sessions-service.test.ts | 302ms |
| registers a new agent when not found in registry | tests/services/sessions-service.test.ts | 302ms |
| skips registration when agent exists in registry | tests/services/sessions-service.test.ts | 303ms |
| persists session metadata | tests/services/sessions-service.test.ts | 302ms |
| initializes AMP for the session | tests/services/sessions-service.test.ts | 301ms |
| accepts valid session names with hyphens and underscores | tests/services/sessions-service.test.ts | 301ms |
| hibernates an active agent | tests/services/agents-core-service.test.ts | 1504ms |
| unpersists session after hibernate | tests/services/agents-core-service.test.ts | 1503ms |
| attempts graceful shutdown before kill | tests/services/agents-core-service.test.ts | 1503ms |

## Notes

- Deprecation warning present: `url.parse()` (DEP0169) - Node.js recommends WHATWG URL API
- `baseline-browser-mapping` data over two months old (cosmetic warning)
- Expected stderr output from corruption/error handling tests (not failures)
