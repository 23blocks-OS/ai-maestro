# Fix Report: P1 Types-Lib Domain (governance-request-registry, file-lock)
Generated: 2026-02-22

## Fixes Applied

### SF-001: `purgeOldRequests` return value double-counts
- **File:** `lib/governance-request-registry.ts`
- **Fix:** Changed return type from `Promise<number>` to `Promise<PurgeResult>` where `PurgeResult = { purged: number, expired: number }`. Callers now get separate counts.
- **Caller updated:** `server.mjs:1186-1196` now destructures `result.purged` and `result.expired` separately.
- **Status:** DONE

### SF-002: Duplicate TTL logic between purgeOldRequests and expirePendingRequests
- **File:** `lib/governance-request-registry.ts`
- **Fix:** Extracted lock-free `expirePendingRequestsInPlace(requests, ttlDays)` helper. Both `purgeOldRequests` and `expirePendingRequests` now delegate to this single canonical implementation. Removed the inline 7-day TTL code from `purgeOldRequests`.
- **Status:** DONE

### SF-003: Lock-free reads undocumented
- **File:** `lib/governance-request-registry.ts`
- **Fix:** Added JSDoc to `getGovernanceRequest` and `listGovernanceRequests` explaining that lock-free reads are intentional for the single-process Phase 1 architecture.
- **Status:** DONE

### NT-001: ConfigurationPayload fields all optional without explanation
- **File:** `types/governance-request.ts`
- **Fix:** Added doc comment explaining that `operation` determines which fields are relevant, and runtime validation in `agents-config-deploy-service.ts` enforces required fields per operation.
- **Status:** DONE

### NT-002: Lock ordering comment missing governance-requests
- **File:** `lib/file-lock.ts`
- **Fix:** Added `'governance-requests'` as item 4 in the lock ordering invariant comment.
- **Status:** DONE

### NT-003: approveGovernanceRequest silently returns for terminal states
- **File:** `lib/governance-request-registry.ts`
- **Fix:** Added comment at the early return explaining that returning the unchanged request for terminal states is intentional, allowing callers to distinguish "not found" (null) from "already finalized" (non-null with terminal status).
- **Status:** DONE

## Files Modified
1. `lib/governance-request-registry.ts` - SF-001, SF-002, SF-003, NT-003
2. `types/governance-request.ts` - NT-001
3. `lib/file-lock.ts` - NT-002
4. `server.mjs` - SF-001 caller update
