# TSC & Test Results — 2026-03-15

## TypeScript Compilation (`npx tsc --noEmit`)

**Result: PASS (exit code 0, zero errors)**

No type errors detected across the entire codebase.

---

## Test Suite (`yarn test`)

**Result: ALL PASS**

| Metric | Value |
|--------|-------|
| Test Files | 31 passed (31 total) |
| Tests | 897 passed (897 total) |
| Failed | 0 |
| Duration | 5.00s (wall: 5.42s) |

### Breakdown by timing

| Phase | Duration |
|-------|----------|
| Transform | 2.57s |
| Import | 3.40s |
| Tests execution | 8.85s |
| Total wall time | 5.42s |

### Notable test files (by size)

- `tests/services/agents-core-service.test.ts` — 75 tests (4530ms)
- `tests/services/sessions-service.test.ts` — 60 tests (2446ms)

### stderr notes

Expected error log output from negative-path tests (initializeStartup error handling, getStartupInfo error handling). These are intentional — the tests verify proper error propagation.

---

## Summary

Both `tsc --noEmit` and `yarn test` pass cleanly with zero failures. The codebase on branch `feature/team-governance` compiles and tests without issues.
