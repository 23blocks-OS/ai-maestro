# Build & Test Audit — 2026-02-27

## Build Result: PASS

Command: `yarn build`
Duration: ~25.58s
Status: **PASSED** — No errors. All pages compiled successfully.

Notable output pages include:
- `/` (main dashboard)
- `/team-meeting`
- `/settings`
- `/teams`, `/teams/[id]`
- `/marketplace`, `/plugin-builder`
- `/immersive`, `/logos`, `/zoom`, `/zoom/agent`

First Load JS shared: 88.2 kB

---

## Test Result: PASS

Command: `yarn test`
Duration: ~5.78s (tests ran in ~9.02s across files)

| Metric       | Value  |
|--------------|--------|
| Test Files   | 31 passed (31 total) |
| Tests        | 897 passed (897 total) |
| Failures     | 0 |
| Start At     | 07:13:27 |

**All 897 tests passed across 31 test files.**

Notable: Some stderr output from `tests/services/agents-core-service.test.ts` showing expected error logging (e.g., `[Startup] Error: Error: fail`) — these are intentional error-path tests and the test suite still reports all 75 tests in that file as passing (including slow ones like hibernate/shutdown tests taking ~1500ms each).

---

## Summary

- Build: **PASS** (no errors, all routes compiled)
- Tests: **PASS** (897/897 tests passing, 31/31 test files passing)
- No failures or regressions detected.
