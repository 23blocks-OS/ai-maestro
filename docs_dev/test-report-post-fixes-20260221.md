# Test Report - Post-Fixes 2026-02-21

## TypeScript Compilation (`npx tsc --noEmit`)

**Result: 2 errors**

| File | Line | Error |
|------|------|-------|
| `tests/agent-config-governance.test.ts` | 86:58 | TS2556: A spread argument must either have a tuple type or be passed to a rest parameter. |
| `tests/transfer-resolve-route.test.ts` | 45:56 | TS2556: A spread argument must either have a tuple type or be passed to a rest parameter. |

Both errors are the same type: spread argument type mismatch (TS2556) in test files only.

---

## Test Suite (`yarn test`)

**Result: 2 test files failed, 25 passed (27 total)**
**Tests: 3 failed, 748 passed (751 total)**
**Duration: 4.89s**

### Failed Test Files

#### 1. `tests/cross-host-governance.test.ts` (2 failures out of 30 tests)

| Test | Error |
|------|-------|
| `receiveCrossHostRequest > returns requestId on success` | AssertionError: expected 400 to be 200. The function returns 400 instead of 200 on a valid request. Likely a validation issue in `receiveCrossHostRequest` — the test's request payload may not match current validation rules. |
| `receiveCrossHostRequest > handles duplicate request ID gracefully by skipping storage` | AssertionError: expected 400 to be 200. Same root cause — the request is being rejected with 400 before the duplicate-detection logic is reached. |

**Root cause hypothesis:** The `receiveCrossHostRequest` function's input validation was tightened (or the request schema changed) and these two tests are constructing payloads that no longer pass validation.

#### 2. `tests/governance-peers.test.ts` (1 failure out of 20 tests)

| Test | Error |
|------|-------|
| `savePeerGovernance > writes peer state to disk and can be read back` | `Error: [vitest] No "renameSync" export is defined on the "fs" mock.` The test mocks `fs` but does not include `renameSync`, which `lib/governance-peers.ts:67` now uses for atomic writes (write to `.tmp` then rename). |

**Root cause:** `governance-peers.ts` was updated to use atomic file writes (`writeFileSync` + `renameSync`) but the test's `vi.mock("fs")` was not updated to include `renameSync` in the mock.

---

## Summary

| Category | Status | Count |
|----------|--------|-------|
| TypeScript errors | WARN | 2 (test files only, TS2556 spread args) |
| Test files passed | PASS | 25/27 |
| Tests passed | PASS | 748/751 |
| Tests failed | FAIL | 3 (2 in cross-host-governance, 1 in governance-peers) |

### Recommended Fixes

1. **cross-host-governance.test.ts**: Update the request payloads in `returns requestId on success` and `handles duplicate request ID gracefully` to match the current validation schema of `receiveCrossHostRequest`.
2. **governance-peers.test.ts**: Add `renameSync` to the `vi.mock("fs")` mock in the `savePeerGovernance` test suite (use `importOriginal` pattern).
3. **TS2556 errors**: Fix the spread argument types in `agent-config-governance.test.ts:86` and `transfer-resolve-route.test.ts:45` by adding proper tuple typing or using rest parameters.
