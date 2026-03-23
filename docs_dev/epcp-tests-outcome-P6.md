# EPCP Tests Outcome - Pass 6

**Date:** 2026-02-22
**Branch:** feature/team-governance

## Summary
| Metric | Value |
|--------|-------|
| **Test Files** | 30 passed / 30 total |
| **Tests** | 867 passed / 867 total |
| **Failed** | 0 |
| **Build** | PASSED |

## Per-File Breakdown

| # | Test File | Tests | Duration |
|---|-----------|-------|----------|
| 1 | tests/host-keys.test.ts | 15 | 33ms |
| 2 | tests/task-registry.test.ts | 47 | 10ms |
| 3 | tests/services/teams-service.test.ts | 73 | 13ms |
| 4 | tests/transfer-resolve-route.test.ts | 12 | 11ms |
| 5 | tests/team-registry.test.ts | 24 | 12ms |
| 6 | tests/agent-config-governance.test.ts | 16 | 20ms |
| 7 | tests/agent-registry.test.ts | 91 | 22ms |
| 8 | tests/agent-config-governance-extended.test.ts | 56 | 25ms |
| 9 | tests/team-api.test.ts | 24 | 15ms |
| 10 | tests/cross-host-governance.test.ts | 40 | 64ms |
| 11 | tests/governance-sync.test.ts | 16 | 8ms |
| 12 | tests/document-api.test.ts | 21 | 14ms |
| 13 | tests/role-attestation.test.ts | 27 | 8ms |
| 14 | tests/transfer-registry.test.ts | 14 | 6ms |
| 15 | tests/use-governance-hook.test.ts | 12 | 8ms |
| 16 | tests/document-registry.test.ts | 27 | 11ms |
| 17 | tests/governance-request-registry.test.ts | 34 | 8ms |
| 18 | tests/manager-trust.test.ts | 15 | 5ms |
| 19 | tests/governance-peers.test.ts | 20 | 6ms |
| 20 | tests/governance.test.ts | 13 | 5ms |
| 21 | tests/content-security.test.ts | 19 | 4ms |
| 22 | tests/governance-endpoint-auth.test.ts | 13 | 5ms |
| 23 | tests/message-filter.test.ts | 28 | 3ms |
| 24 | tests/amp-auth.test.ts | 19 | 3ms |
| 25 | tests/agent-utils.test.ts | 21 | 2ms |
| 26 | tests/agent-auth.test.ts | 8 | 2ms |
| 27 | tests/amp-address.test.ts | 9 | 2ms |
| 28 | tests/validate-team-mutation.test.ts | 18 | 3ms |
| 29 | tests/services/sessions-service.test.ts | 60 | 2427ms |
| 30 | tests/services/agents-core-service.test.ts | 75 | 4544ms |
| | **TOTAL** | **867** | **7.30s** |

## Test Execution Summary

- **Vitest version:** v4.0.18
- **Total duration:** 5.38s (transform 2.19s, setup 0ms, import 3.39s, tests 7.30s)
- **All 867 tests passed with 0 failures**

## Build Result

**PASSED** - Next.js 14.2.35 production build completed successfully in 20.57s.

- 54 static pages generated
- 117+ API routes compiled
- Warnings only (no errors):
  - 3 critical dependency warnings (dynamic imports in voice-subsystem, claude-provider, huggingface)
  - Multiple `react-hooks/exhaustive-deps` warnings across components
  - Multiple `@next/next/no-img-element` warnings (using `<img>` instead of `<Image>`)
  - 1 `jsx-a11y/role-supports-aria-props` warning in MessageCenter.tsx

No TypeScript errors. No build failures.

## Notes

- stderr output from several tests is expected (testing error-handling paths for corrupted JSON, invalid team IDs, duplicate names, disk errors, etc.)
- Slowest files: agents-core-service (4.5s due to hibernate/wake timer waits), sessions-service (2.4s due to tmux session creation delays)
- Test count increased from 780 (previous pass) to 867 (+87 tests across 2 new files)
