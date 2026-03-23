# EPCP Tests Outcome - Pass 4

**Date:** 2026-02-22
**Branch:** feature/team-governance
**Vitest:** v4.0.18

---

## Summary

| Metric | Value |
|--------|-------|
| **Test Files** | 30 passed / 30 total |
| **Tests** | 857 passed / 857 total |
| **Failed** | 0 |
| **Skipped** | 0 |
| **Duration** | 4.99s (tests: 7.33s) |
| **Build** | FAILED (1 TypeScript error) |

---

## Per-File Breakdown

| # | Test File | Tests | Duration | Status |
|---|-----------|-------|----------|--------|
| 1 | tests/host-keys.test.ts | 15 | 40ms | PASS |
| 2 | tests/task-registry.test.ts | 47 | 10ms | PASS |
| 3 | tests/services/teams-service.test.ts | 73 | 12ms | PASS |
| 4 | tests/transfer-resolve-route.test.ts | 12 | 13ms | PASS |
| 5 | tests/team-registry.test.ts | 24 | 12ms | PASS |
| 6 | tests/agent-config-governance-extended.test.ts | 56 | 29ms | PASS |
| 7 | tests/agent-registry.test.ts | 91 | 26ms | PASS |
| 8 | tests/agent-config-governance.test.ts | 16 | 24ms | PASS |
| 9 | tests/team-api.test.ts | 24 | 13ms | PASS |
| 10 | tests/cross-host-governance.test.ts | 39 | 64ms | PASS |
| 11 | tests/document-registry.test.ts | 27 | 11ms | PASS |
| 12 | tests/document-api.test.ts | 21 | 19ms | PASS |
| 13 | tests/role-attestation.test.ts | 25 | 7ms | PASS |
| 14 | tests/use-governance-hook.test.ts | 12 | 6ms | PASS |
| 15 | tests/governance-request-registry.test.ts | 34 | 9ms | PASS |
| 16 | tests/governance-sync.test.ts | 16 | 6ms | PASS |
| 17 | tests/governance-peers.test.ts | 20 | 5ms | PASS |
| 18 | tests/transfer-registry.test.ts | 9 | 6ms | PASS |
| 19 | tests/manager-trust.test.ts | 15 | 8ms | PASS |
| 20 | tests/governance.test.ts | 13 | 6ms | PASS |
| 21 | tests/content-security.test.ts | 19 | 3ms | PASS |
| 22 | tests/governance-endpoint-auth.test.ts | 12 | 5ms | PASS |
| 23 | tests/amp-auth.test.ts | 19 | 4ms | PASS |
| 24 | tests/message-filter.test.ts | 27 | 3ms | PASS |
| 25 | tests/agent-auth.test.ts | 8 | 3ms | PASS |
| 26 | tests/agent-utils.test.ts | 21 | 3ms | PASS |
| 27 | tests/validate-team-mutation.test.ts | 18 | 3ms | PASS |
| 28 | tests/amp-address.test.ts | 9 | 2ms | PASS |
| 29 | tests/services/sessions-service.test.ts | 60 | 2439ms | PASS |
| 30 | tests/services/agents-core-service.test.ts | 75 | 4533ms | PASS |

**Total:** 857 tests across 30 files

---

## Slow Tests (>300ms)

| Test File | Test Name | Duration |
|-----------|-----------|----------|
| tests/services/agents-core-service.test.ts | hibernates an active agent | 1502ms |
| tests/services/agents-core-service.test.ts | unpersists session after hibernate | 1504ms |
| tests/services/agents-core-service.test.ts | attempts graceful shutdown before kill | 1503ms |
| tests/services/sessions-service.test.ts | creates a local session successfully | 305ms |
| tests/services/sessions-service.test.ts | normalizes name to lowercase | 304ms |
| tests/services/sessions-service.test.ts | uses provided working directory | 302ms |
| tests/services/sessions-service.test.ts | registers a new agent when not found in registry | 303ms |
| tests/services/sessions-service.test.ts | skips registration when agent exists in registry | 303ms |
| tests/services/sessions-service.test.ts | persists session metadata | 302ms |
| tests/services/sessions-service.test.ts | initializes AMP for the session | 302ms |
| tests/services/sessions-service.test.ts | accepts valid session names with hyphens and underscores | 303ms |

---

## Build Result: FAILED

**TypeScript compilation error:**

```
./services/cross-host-governance-service.ts:315:5
Type error: This comparison appears to be unintentional because the types
'"pending" | "remote-approved" | "local-approved" | "dual-approved"' and '"executed"'
have no overlap.

  313 |   // If the pre-read status was already terminal (race with another approver), skip execution.
  314 |   const weTriggeredExecution =
> 315 |     preApprovalStatus !== 'executed' && preApprovalStatus !== 'rejected' && updated.status === 'executed'
       |     ^
  316 |
  317 |   if (weTriggeredExecution) {
  318 |     await performRequestExecution(updated)
```

**Root cause:** The `preApprovalStatus` variable's type is narrowed to `'pending' | 'remote-approved' | 'local-approved' | 'dual-approved'` but the code compares it against `'executed'` which is not in that union. TypeScript strict mode flags this as an impossible comparison.

**Build warnings (non-blocking):**
- 5 React Hook dependency warnings (useEffect missing deps)
- ~25 `<img>` vs `<Image />` warnings (next/image optimization)
- 3 Critical dependency warnings (dynamic imports in cerebellum, memory, huggingface)
