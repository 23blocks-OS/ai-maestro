# EPCP P2 Test Fixes Report

**Generated:** 2026-02-22T17:50:00
**Pass:** 2
**Issues fixed:** 5/5

---

## [NT-005] Missing test for type filter in listGovernanceRequests -- DONE

**File:** `tests/governance-request-registry.test.ts`
**Fix:** Added `it('filters by type', ...)` test that seeds 3 requests with different types (add-to-team, configure-agent, transfer-agent) and verifies `listGovernanceRequests({ type: ... })` returns only matching requests. Also verifies empty result for non-matching type.

## [NT-006] Missing tests for purgeOldRequests and expirePendingRequests -- DONE

**File:** `tests/governance-request-registry.test.ts`
**Fix:** Added 4 new tests in 2 describe blocks:
- `purgeOldRequests > purges old executed/rejected requests and returns PurgeResult` -- verifies terminal-state requests older than maxAgeDays are removed and PurgeResult has correct `purged` count
- `purgeOldRequests > also expires stale pending requests via 7-day TTL` -- verifies pending requests older than 7 days are auto-rejected during purge
- `expirePendingRequests > expires pending requests older than TTL days` -- verifies standalone TTL expiry, checks rejected status and TTL reason
- `expirePendingRequests > returns 0 when no pending requests exceed TTL` -- verifies no false positives

Also added `purgeOldRequests` and `expirePendingRequests` to the import list and updated the header comment from "25 tests across 8 functions" to "30 tests across 10 functions".

## [NT-010] governance-endpoint-auth.test.ts does not restore fetch stub -- DONE

**File:** `tests/governance-endpoint-auth.test.ts`
**Fix:**
1. Added `afterEach` to import: `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'`
2. Added afterEach block after beforeEach that calls `vi.unstubAllGlobals()` to restore the original `fetch` and prevent leaking the mock into other test files in the same vitest worker.

## [NT-011] uuid mock returns static value -- DONE

**File:** `tests/agent-config-governance-extended.test.ts`
**Fix:**
1. Replaced static `vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid-ext-001') }))` with incrementing counter: `let uuidExtCounter = 0; vi.mock('uuid', () => ({ v4: vi.fn(() => \`test-uuid-ext-\${String(++uuidExtCounter).padStart(3, '0')}\`) }))`
2. Added `uuidExtCounter = 0` reset in the `beforeEach` block so each test starts from `test-uuid-ext-001`

## [NT-013] Test count documentation discrepancy -- DONE

**File:** `tests/agent-config-governance.test.ts`
**Fix:** Added explanatory comment in the module-level docstring explaining why vitest reports ~836 tests while the actual test function count is ~628 (vitest counts each parameterized expansion separately), and that the CHANGELOG's "167 tests across 9 files" refers to the original count before extended test files were added.

---

## Test Results

All 4 modified files pass: **114 tests passed, 0 failed** (vitest run).

| File | Tests | Status |
|------|-------|--------|
| tests/governance-request-registry.test.ts | 30 | PASS |
| tests/governance-endpoint-auth.test.ts | 12 | PASS |
| tests/agent-config-governance-extended.test.ts | 56 | PASS |
| tests/agent-config-governance.test.ts | 16 | PASS |
