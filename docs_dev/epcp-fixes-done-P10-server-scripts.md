# EPCP P10 Fix Report: Server, Scripts & CI

**Generated:** 2026-02-27T00:10:00Z
**Review Run:** c7f26c53 (Pass 10)
**Assigned files:** server.mjs, install-messaging.sh, update-aimaestro.sh, package.json, .github/workflows/ci.yml, plugins/amp-messaging/scripts/amp-inbox.sh

---

## Fixes Applied: 9/10 findings (1 no-action-needed)

### MUST-FIX (2/2 fixed)

| ID | File | Issue | Fix |
|----|------|-------|-----|
| MF-015 | server.mjs:61 | `unhandledRejection` handler missing `mkdirSync` for logs directory | Added `fs.mkdirSync(logsDir, { recursive: true })` guard matching the `uncaughtException` handler |
| MF-016 | server.mjs:490-492 | `removeAllListeners('close')` removes the early-close handler creating an unhandled gap | Re-register close/error handlers immediately after `removeAllListeners`; removed duplicate handlers that were registered later in the same `open` callback |

### SHOULD-FIX (5/5 fixed)

| ID | File | Issue | Fix |
|----|------|-------|-----|
| SF-052 | amp-inbox.sh:130 | `base64 -d` not portable on macOS <14 (uses `-D`) | Replaced with `openssl base64 -d -A` which works on all platforms |
| SF-053 | amp-inbox.sh:93-99 | Redundant if/else in count-only mode (both branches identical) | Simplified to single `echo "$COUNT"; exit 0` |
| SF-054 | server.mjs:616+ | Startup loopback fetch uses `localhost` which may fail in IPv6-only environments | Replaced all 5 occurrences of `http://localhost:${port}` with `http://127.0.0.1:${port}` |
| SF-055 | server.mjs:1211 | Host sync filters by deprecated `h.type === 'remote'` | Changed to `!isSelf(h.id) && h.enabled !== false` using existing `isSelf()` import |
| SF-057 | update-aimaestro.sh:75-79 | Box drawing characters misaligned (text not centered) | Centered all text lines in both header and footer boxes |

### NIT (2/3 -- 1 no-action-needed)

| ID | File | Issue | Fix |
|----|------|-------|-----|
| NT-039 | .github/workflows/ci.yml | No TypeScript type-checking step | Added `yarn tsc --noEmit` step to lint job |
| NT-040 | install-messaging.sh:65-71 | Box drawing characters misaligned | Measured and verified: alignment is already correct (5/6 and 15/16 padding for odd-length text). No changes needed -- finding is a false positive. |
| NT-042 | package.json:69 | tsx in dependencies not devDependencies | No action needed per finding itself ("Placement is intentional" -- tsx is a runtime dependency used by `yarn start`) |

---

## Files Modified

1. **server.mjs** -- MF-015, MF-016, SF-054, SF-055
2. **plugins/amp-messaging/scripts/amp-inbox.sh** -- SF-052, SF-053
3. **update-aimaestro.sh** -- SF-057
4. **.github/workflows/ci.yml** -- NT-039

## Files NOT Modified (no action needed)

- **install-messaging.sh** -- NT-040 verified as false positive (alignment already correct)
- **package.json** -- NT-042 intentional placement, no change
