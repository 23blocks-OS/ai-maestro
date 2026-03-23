# P3 Governance Libs Fix Report

**Date:** 2026-02-22
**Pass:** 3
**Files modified:** 4

## Fixes Applied

### SF-002: Global rate-limit keys in cross-host governance (FIXED)
**File:** `services/cross-host-governance-service.ts`
- Line ~69: `checkRateLimit('cross-host-gov-submit')` -> `checkRateLimit(\`cross-host-gov-submit:${params.requestedBy}\`)`
- Line ~247: `checkRateLimit('cross-host-gov-approve')` -> `checkRateLimit(\`cross-host-gov-approve:${approverAgentId}\`)`
- Line ~318: `checkRateLimit('cross-host-gov-reject')` -> `checkRateLimit(\`cross-host-gov-reject:${rejectorAgentId}\`)`
- All corresponding `recordFailure()` and `resetRateLimit()` calls updated to match per-agent keys.

### SF-005: approveGovernanceRequest returns non-null for terminal states (FIXED)
**File:** `services/cross-host-governance-service.ts`
- Added pre-check in `approveCrossHostRequest` before calling `approveGovernanceRequest`:
  ```
  if (request.status === 'executed' || request.status === 'rejected') {
    return { error: `Request '${requestId}' is already ${request.status}`, status: 409 }
  }
  ```
- This prevents re-execution of finalized requests. The registry function itself still returns the unchanged request for terminal states (preserving null vs non-null distinction for "not found" vs "already finalized").

### SF-006: filter.type typed as string instead of GovernanceRequestType (FIXED)
**Files:** `lib/governance-request-registry.ts`, `services/cross-host-governance-service.ts`, `app/api/v1/governance/requests/route.ts`, `services/headless-router.ts`
- Changed `type?: string` to `type?: GovernanceRequestType` in both `listGovernanceRequests` and `listCrossHostRequests` signatures.
- Added proper casts in API route and headless-router callers (matching existing pattern for `status` field).

### NT-003: performRequestExecution silently returns on errors (DOCUMENTED)
**File:** `services/cross-host-governance-service.ts`
- Added comment block above `performRequestExecution` documenting the design limitation.

### NT-006: Redundant DEFAULT spread (FIXED)
**File:** `lib/governance-request-registry.ts`
- Removed `requests: []` override in two places (lines ~40 and ~61) since `DEFAULT_GOVERNANCE_REQUESTS_FILE` already has `requests: []`.

### NT-007: Empty catch block too silent (FIXED)
**File:** `lib/governance-request-registry.ts`
- Changed `catch { /* backup is best-effort */ }` to `catch (backupErr) { console.warn('[governance-requests] Failed to backup corrupted file:', backupErr) }`

## Summary
All 6 findings addressed: 4 SHOULD-FIX + 2 NIT across 4 files.
