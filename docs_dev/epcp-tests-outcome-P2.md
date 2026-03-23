# EPCP Tests & Build Outcome - Pass 2

**Date:** 2026-02-22
**Branch:** feature/team-governance

---

## Test Summary

| Metric | Value |
|--------|-------|
| **Test Runner** | Vitest v4.0.18 |
| **Test Files** | 29 passed (29 total) |
| **Tests** | 841 passed (841 total) |
| **Failed** | 0 |
| **Skipped** | 0 |
| **Duration** | 5.35s (transform 2.28s, setup 0ms, import 3.20s, tests 7.33s) |
| **Result** | ALL PASSED |

No failing tests.

---

## Build Summary

| Metric | Value |
|--------|-------|
| **Builder** | Next.js 14.2.35 |
| **Duration** | 19.09s |
| **Result** | SUCCESS |
| **Errors** | 0 |

### Build Warnings (non-blocking)

1. **Critical dependency warnings** (dynamic imports, not errors):
   - `lib/cerebellum/voice-subsystem.ts` - request of a dependency is an expression
   - `lib/memory/claude-provider.ts` - request of a dependency is an expression
   - `@huggingface/transformers` - accessing import.meta directly unsupported

2. **React Hook warnings** (lint, not errors):
   - `app/companion/page.tsx:122:6` - useEffect missing dependency 'activeAgentId'
   - Other useEffect/useCallback dependency warnings in various components

3. **Deprecation warnings**:
   - `url.parse()` - use WHATWG URL API instead
   - `baseline-browser-mapping` - data over two months old

### Build Output

- Static pages: `/companion`, `/immersive`, `/logos`, `/marketplace`, `/plugin-builder`, `/settings`, `/team-meeting`, `/teams`, `/zoom`, `/zoom/agent`
- Dynamic routes: All API routes, `/teams/[id]`
- First Load JS shared: 88.2 kB

---

## Conclusion

All 841 tests pass across 29 test files. Production build succeeds with no errors. Only non-blocking warnings present (dynamic imports, React hook deps, deprecations).
