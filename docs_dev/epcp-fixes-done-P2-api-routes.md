# P2 API Routes Fix Report
Generated: 2026-02-22

## Fixes Applied

### [SF-001] Remote receive path in governance requests POST lacks try/catch -- DONE
- File: `app/api/v1/governance/requests/route.ts`
- Wrapped the remote receive branch (lines 26-58) in a try/catch block that logs and returns 500 on unexpected errors, matching the local submission branch pattern.

### [SF-002] Config deploy route hardcodes 403 for all auth errors -- DONE
- File: `app/api/agents/[id]/config/deploy/route.ts`
- Changed `{ status: 403 }` to `{ status: auth.status || 401 }` on line 30, matching the pattern used by every other authenticated route.

### [NT-001] GET governance requests type param not validated -- DONE
- File: `app/api/v1/governance/requests/route.ts`
- Added `VALID_GOVERNANCE_REQUEST_TYPES` set with all 8 GovernanceRequestType values from `types/governance-request.ts`.
- Added validation check for the `type` query param before the try block, returning 400 with descriptive error on invalid values.
- Updated the `listCrossHostRequests` call to use the already-extracted `typeParam` variable.

### [NT-002] Chief-of-staff route does not validate cosAgentId with isValidUuid -- DONE
- File: `app/api/teams/[id]/chief-of-staff/route.ts`
- Added `if (!isValidUuid(cosAgentId))` check between the string-type guard and the `getAgent()` call (line 87), returning 400 with 'Invalid agent ID format'. The `isValidUuid` import was already present.

## Summary
4/4 issues fixed.
