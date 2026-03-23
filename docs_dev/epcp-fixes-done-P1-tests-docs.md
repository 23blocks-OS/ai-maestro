# EPCP Fixes Done - Pass 1 - Domain: tests-docs

Generated: 2026-02-22T17:23:00Z

## Issues Fixed

### MF-004 (documentation/claims): Test count "836" discrepancy
**Status:** DONE (no file change needed)
**Action:** The "836" number in commit messages comes from vitest's test count which includes parameterized/dynamically-generated tests. The static `it()` count via grep is ~628. This is informational only -- no documentation file needs changing. Future commit messages should clarify: "vitest reports 836 runs due to parameterized tests; static it() count is ~628."

### SF-022 (tests/agent-config-governance-extended.test.ts:26): Stale test count in header
**Status:** DONE
**Actual counts by module:**
- Module 1 (skills service RBAC): 20 tests (was 15)
- Module 2 (config deploy service): 16 tests (was 12)
- Module 3 (cross-host configure-agent): 14 tests (was 15)
- Module 4 (config notifications): 6 tests (correct)
- Total: 56 tests (was "48 (15 + 12 + 15 + 6)")
**Fix:** Updated header comment to "Total: 56 tests (20 + 16 + 14 + 6)" and updated each module section header comment.

### SF-023 (tests/governance-endpoint-auth.test.ts:8): Stale test count in header
**Status:** DONE
**Actual count:** 12 `it()` blocks (header said 13).
**Fix:** Updated to "Coverage: 12 tests across 3 security fixes".

### NT-018 (tests/agent-config-governance-extended.test.ts:1220-1230): Module 4 mock-only comment
**Status:** DONE
**Fix:** Added comment above Module 4 describe block explaining that these tests verify mock call patterns and direct testing is deferred to a future config-notification-service.test.ts file.

### NT-019 (tests/agent-config-governance-extended.test.ts:303-310): makeAgentWithSubconscious return type
**Status:** DONE
**Fix:** Added comment above the factory function explaining why Record<string, unknown> is used (matches mocked getAgent signature).

### NT-020 (tests/governance-endpoint-auth.test.ts:220,255): vi.waitFor timing
**Status:** DONE
**Fix:** Added comment above the first vi.waitFor call: "vi.waitFor handles the fire-and-forget fetch timing. If flaky in CI, add { timeout: 5000 }."

## Files Modified
- `tests/agent-config-governance-extended.test.ts` -- SF-022, NT-018, NT-019
- `tests/governance-endpoint-auth.test.ts` -- SF-023, NT-020
