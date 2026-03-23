# EPCP Pass 6 Fixes: Domain api-governance

**Generated:** 2026-02-22T22:06:00
**Pass:** 6
**Domain:** api-governance
**Findings Fixed:** 16/16

---

## MUST-FIX Issues Fixed

### MF-010: Reachable endpoint -- replace regex with isValidUuid
**File:** `app/api/governance/reachable/route.ts`
- Replaced `/^[a-zA-Z0-9_-]+$/` regex with `isValidUuid(agentId)` from `@/lib/validation`
- Added import for `isValidUuid`
- Prevents cache pollution from arbitrary alphanumeric strings

### MF-011: Approve endpoint -- remove error message interpolation
**File:** `app/api/v1/governance/requests/[id]/approve/route.ts`
- Changed catch block from interpolating `(err as Error).message` to returning generic `'Internal server error'`
- Added `console.error('[Governance Approve] POST error:', err)` for internal logging

### MF-012: Reject endpoint -- remove error message interpolation
**File:** `app/api/v1/governance/requests/[id]/reject/route.ts`
- Same fix as MF-011: generic error response + `console.error` logging

### MF-013: Approve endpoint -- add UUID validation on id path param
**File:** `app/api/v1/governance/requests/[id]/approve/route.ts`
- Added `isValidUuid(id)` check after extracting path param
- Returns 400 with `'Invalid request ID format'` on failure

### MF-014: Reject endpoint -- add UUID validation on id path param
**File:** `app/api/v1/governance/requests/[id]/reject/route.ts`
- Added `isValidUuid(id)` check after extracting path param
- Returns 400 with `'Invalid request ID format'` on failure

---

## SHOULD-FIX Issues Fixed

### SF-024: Approve endpoint -- validate approverAgentId as string and UUID
**File:** `app/api/v1/governance/requests/[id]/approve/route.ts`
- Added `typeof body.approverAgentId !== 'string' || !isValidUuid(body.approverAgentId)` check
- Returns 400 with `'Invalid approverAgentId format'`

### SF-025: Reject endpoint -- validate rejectorAgentId as string and UUID
**File:** `app/api/v1/governance/requests/[id]/reject/route.ts`
- Added validation on both remote and local code paths
- Returns 400 with `'Invalid rejectorAgentId format'`

### SF-026: Sync endpoint -- change error message to not include fromHostId
**File:** `app/api/v1/governance/sync/route.ts`
- Changed `Unknown host: ${body.fromHostId}` to `'Unknown host'`
- Prevents information disclosure of host IDs

### SF-027: Trust endpoint -- add hostname format validation
**File:** `app/api/governance/trust/[hostId]/route.ts`
- Added regex validation: `/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,253}[a-zA-Z0-9]$/`
- Also handles single-character hostnames with `/^[a-zA-Z0-9]$/`
- Returns 400 with `'Invalid hostId format'`

### SF-028: Requests endpoint -- validate body.request is an object
**File:** `app/api/v1/governance/requests/route.ts`
- Added check: `if (!body.request || typeof body.request !== 'object' || Array.isArray(body.request))`
- Returns 400 with `'Missing or invalid request: must be an object'`

### SF-029: Governance GET -- wrap in try/catch
**File:** `app/api/governance/route.ts`
- Wrapped entire GET handler body in try/catch
- Added `console.error('[governance] GET error:', error)` and 500 response

### SF-030: Reject endpoint -- document routing decision and warn on dual auth
**File:** `app/api/v1/governance/requests/[id]/reject/route.ts`
- Added comment block documenting the two auth modes (host-signature vs password)
- Added `console.warn` when both password and host-signature are present

---

## NIT Issues Fixed

### NT-014: Manager endpoint -- remove single quotes around agentId in error
**File:** `app/api/governance/manager/route.ts`
- Changed `Agent '${agentId}' not found` to `Agent ${agentId} not found`

### NT-015: Requests endpoint -- move const declarations above POST function
**File:** `app/api/v1/governance/requests/route.ts`
- Moved `VALID_GOVERNANCE_REQUEST_STATUSES`, `VALID_GOVERNANCE_REQUEST_TYPES`, `VALID_REQUESTED_BY_ROLES`, and `HOSTNAME_RE` above `POST` function
- Removed duplicate declarations from between POST and GET functions

---

## Files Modified (8)

1. `app/api/governance/reachable/route.ts` -- MF-010
2. `app/api/v1/governance/requests/[id]/approve/route.ts` -- MF-011, MF-013, SF-024
3. `app/api/v1/governance/requests/[id]/reject/route.ts` -- MF-012, MF-014, SF-025, SF-030
4. `app/api/v1/governance/sync/route.ts` -- SF-026
5. `app/api/governance/trust/[hostId]/route.ts` -- SF-027
6. `app/api/v1/governance/requests/route.ts` -- SF-028, NT-015
7. `app/api/governance/route.ts` -- SF-029
8. `app/api/governance/manager/route.ts` -- NT-014

## TypeScript Status

All 8 modified files compile cleanly. Pre-existing TS errors in test files are unrelated to these changes.
