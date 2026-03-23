# P3 Fix Report: services/headless-router.ts

**Date:** 2026-02-22
**File:** `services/headless-router.ts`
**Issues Fixed:** 4/4

---

## SF-001: readRawBody missing rejected guard

**Lines:** 347-374 (after fix)

Added `let rejected = false` guard matching the `readJsonBody` pattern:
- `data` handler: early return if `rejected`; sets `rejected = true` before calling `reject()`
- `end` handler: wrapped in arrow function with `if (rejected) return` guard
- `error` handler: wrapped with `if (rejected) return` and sets `rejected = true` to prevent double reject

This prevents the `end` event from calling `resolve()` after `req.destroy()` has already triggered `reject()`.

---

## SF-010: Remote receive branch missing dedicated try/catch

**Lines:** 1361-1413 (after fix)

Wrapped the entire remote receive branch (`body?.fromHostId` path) in a dedicated `try/catch` block that:
- Catches any unexpected error from signature verification or `receiveCrossHostRequest()`
- Logs to console with `[Governance Requests] POST remote-receive error:` prefix
- Returns 500 with descriptive error message

This matches the pattern in the Next.js route at `app/api/v1/governance/requests/route.ts:27-63`.

---

## NT-001: Double URL parsing in handle()

**Lines:** 1864-1869 (after fix)

Replaced the two separate parse calls (`parse(req.url)` and `getQuery(req.url)`) with a single `new URL()` call. The query object is now built inline from `urlObj.searchParams`, eliminating the redundant second parse.

---

## NT-002: Deprecated url.parse() usage

**Lines:** 11 (import removed), 406-412 (getQuery updated), 1864-1869 (handle updated)

- Removed `import { parse } from 'url'` (line 12, no longer used)
- Updated `getQuery()` to use `new URL(url, 'http://localhost')` with `searchParams.forEach()`
- Updated `handle()` method to use `new URL()` directly (combined with NT-001 fix)

Verified `parse` is no longer referenced anywhere in the file (only `JSON.parse` remains).
