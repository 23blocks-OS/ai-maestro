# EPCP Fix Report: P6 lib-registries domain

**Generated:** 2026-02-22T22:09:00
**Pass:** 6
**Domain:** lib/ files (registries, rate-limit, auth, governance, sync)

## Summary

| Finding | File(s) | Severity | Status |
|---------|---------|----------|--------|
| MF-023 | lib/rate-limit.ts | MUST-FIX | FIXED |
| MF-024 | lib/document-registry.ts, lib/task-registry.ts, lib/agent-registry.ts | MUST-FIX | FIXED |
| SF-038 | lib/amp-auth.ts | SHOULD-FIX | FIXED |
| SF-039 | lib/amp-auth.ts | SHOULD-FIX | FIXED |
| SF-040 | lib/governance-request-registry.ts, lib/governance.ts, lib/governance-peers.ts, lib/manager-trust.ts | SHOULD-FIX | FIXED |
| NT-020 | lib/task-registry.ts, lib/document-registry.ts | NIT | FIXED |
| NT-021 | lib/index-delta.ts | NIT | FIXED |
| NT-022 | lib/governance-sync.ts | NIT | FIXED |

**Total: 8/8 issues fixed**

## Details

### MF-023: rate-limit.ts checkAndRecordAttempt naming clarity

`recordFailure()` renamed to `recordAttempt()` to reflect that `checkAndRecordAttempt` records EVERY allowed attempt (not just failures). Callers reset on success via `resetRateLimit()`. A deprecated `recordFailure` alias is exported for backward compatibility with existing callers in app/ and services/ directories.

**Files changed:**
- `lib/rate-limit.ts` -- renamed function, added clarifying comments, kept backward-compat alias

### MF-024: Atomic writes in document-registry, task-registry, agent-registry

All three registries now use the atomic write pattern: write to `.tmp.${process.pid}` then `renameSync` to final path. This prevents corruption if the process crashes mid-write.

**Files changed:**
- `lib/document-registry.ts` -- `saveDocuments()` uses atomic write
- `lib/task-registry.ts` -- `saveTasks()` uses atomic write
- `lib/agent-registry.ts` -- `saveAgents()` uses atomic write
- `tests/document-registry.test.ts` -- Added `renameSync` to fs mock
- `tests/task-registry.test.ts` -- Added `renameSync` to fs mock

### SF-038: amp-auth.ts cleanupExpiredKeys wrapped in withLock

`cleanupExpiredKeys()` now uses `withLock('amp-api-keys', ...)` to serialize its read-modify-write with other key operations. Changed from sync to async.

**Files changed:**
- `lib/amp-auth.ts` -- wrapped in withLock, changed to async

### SF-039: amp-auth.ts validateApiKey mutation documented

Added comment documenting that `validateApiKey` intentionally mutates the cached array in-place for `last_used_at` tracking, explaining why this is safe (debounced writes, hot path optimization).

**Files changed:**
- `lib/amp-auth.ts` -- added documenting comment

### SF-040: process.pid in temp file names for 4 registries

Added `process.pid` to temp file names in all 4 registries that were using fixed `.tmp` suffix, preventing multi-process race conditions on the same temp file.

**Files changed:**
- `lib/governance-request-registry.ts` -- `.tmp` -> `.tmp.${process.pid}`
- `lib/governance.ts` -- `.tmp` -> `.tmp.${process.pid}`
- `lib/governance-peers.ts` -- `.tmp` -> `.tmp.${process.pid}`
- `lib/manager-trust.ts` -- `.tmp` -> `.tmp.${process.pid}`

### NT-020: Deduplicate UUID regex via shared isValidUuid

Replaced inline UUID regex in `task-registry.ts` and `document-registry.ts` with `isValidUuid()` from `@/lib/validation`.

**Files changed:**
- `lib/task-registry.ts` -- import and use `isValidUuid`
- `lib/document-registry.ts` -- import and use `isValidUuid`

### NT-021: Guard against negative activeIndexCount

Added `Math.max(0, ...)` guard in `releaseIndexSlot()` to prevent double-release from driving the counter negative.

**Files changed:**
- `lib/index-delta.ts` -- added guard

### NT-022: Validate governance-sync response structure

Added basic field validation (`hostId`, `teams` array, `lastSyncAt`) on the JSON response from `requestPeerSync()` before casting to `GovernancePeerState`.

**Files changed:**
- `lib/governance-sync.ts` -- added field validation

## Test Results

- **30 test files passed**
- **867 tests passed**
- **0 failures**
- **Build: SUCCESS**
