# Build & Test Report — 2026-03-22

## Build Result: FAILED

### Fatal Error

File: `services/headless-router.ts`, line 1314

```
Type error: Argument of type 'string | undefined' is not assignable to parameter of type 'string | null'.
  Type 'undefined' is not assignable to type 'string | null'.
```

The `updateGlobalMessage()` call at line 1314 passes `query.agent || undefined` but the function expects `string | null`, not `string | undefined`. Same pattern may apply to line 1317 (`removeMessage`).

Fix: change `|| undefined` to `|| null` for the relevant arguments on lines 1314 and 1317.

### Build Warnings (non-blocking, warnings only)

- Multiple `<img>` elements should use Next.js `<Image />` (LCP/bandwidth warnings)
- Several `useEffect`/`useCallback`/`useMemo` missing or unnecessary dependency array entries
- One `aria-expanded` accessibility warning on a `textbox` role element

---

## Test Result: PASSED

All 897 tests across 31 test files passed.

```
Test Files   31 passed (31)
Tests        897 passed (897)
Start at     17:05:40
Duration     4.95s (transform 3.02s, setup 0ms, import 3.87s, tests 8.88s, environment 2ms)
```

Some tests intentionally log errors to stderr (e.g., `initializeStartup > returns 500 on unexpected error`) — these are expected and tests still pass.

---

## Summary

| Step  | Result  | Notes                                                   |
|-------|---------|---------------------------------------------------------|
| Build | FAILED  | Type error in `services/headless-router.ts:1314`        |
| Tests | PASSED  | 897/897 tests pass across 31 files                      |

### Fix Needed

`/Users/emanuelesabetta/ai-maestro/services/headless-router.ts` line 1314 (and likely 1317):

Change `query.agent || undefined` → `query.agent || null` (and same for `query.id`, `query.action` if they have the same issue) to satisfy the `string | null` parameter type.
