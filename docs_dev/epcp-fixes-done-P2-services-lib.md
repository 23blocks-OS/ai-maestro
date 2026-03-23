# P2 Review Fixes -- Domain: services-lib
Generated: 2026-02-22

## Issues Fixed (8/8)

### [SF-003] Headless COS endpoint uses global rate limit key instead of per-team
- **File:** `services/headless-router.ts` (lines ~1588-1600)
- **Fix:** Extracted `rateLimitKey = \`governance-cos-auth:${teamId}\`` variable and used it for `checkRateLimit`, `recordFailure`, and `resetRateLimit` calls. Now each team has its own rate-limit bucket.

### [SF-004] readRawBody has no size limit
- **File:** `services/headless-router.ts` (line ~336)
- **Fix:** Added `MAX_RAW_BODY_SIZE = 50 * 1024 * 1024` (50MB) constant and a `totalSize` counter in the `data` handler. When exceeded, calls `req.destroy()` and rejects with a 413 error, matching the pattern from `readJsonBody`.

### [SF-005] registerAgent allows empty string agentId
- **File:** `services/agents-core-service.ts` (line ~812)
- **Fix:** Changed guard from `if (body.id && !isValidUuid(agentId))` to `if (body.id !== undefined && (!body.id || !isValidUuid(agentId)))` so empty strings (`""`) are properly rejected as invalid.

### [NT-003] Stale withLock docstring claims "No lock timeout"
- **File:** `lib/file-lock.ts` (line ~99)
- **Fix:** Updated docstring from "No deadlock detection or lock timeout" to "Lock acquisition times out after 30s by default (see DEFAULT_LOCK_TIMEOUT_MS)".

### [NT-004] Lock ordering comment omits governance-requests
- **File:** `lib/file-lock.ts` (line ~100)
- **Fix:** Updated ordering convention from `'teams' before 'transfers' before 'governance'` to `'teams' before 'transfers' before 'governance' before 'governance-requests'`.

### [NT-007] readJsonBody can call reject() multiple times
- **File:** `services/headless-router.ts` (lines ~314-320)
- **Fix:** Added `let rejected = false` flag. Set to `true` before calling `reject()` in the size-limit branch. Added early-return guard in `data`, `end`, and `error` handlers to skip if already rejected.

### [NT-008] sendServiceResult spreads result.data into error responses
- **File:** `services/headless-router.ts` (lines ~362-363)
- **Fix:** Changed error path from `{ error: result.error, ...(result.data || {}) }` to `{ error: result.error }` to avoid leaking internal state in error responses.

### [NT-009] Duplicate UUID validation regex
- **File:** `services/agents-skills-service.ts` (lines ~252, ~288)
- **Fix:** Added `import { isValidUuid } from '@/lib/validation'` and replaced both inline `UUID_PATTERN` regex usages with `isValidUuid(agentId)` calls.
