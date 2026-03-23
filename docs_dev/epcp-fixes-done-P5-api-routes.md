# EPCP P5 Fixes Report: API Routes Domain

**Generated:** 2026-02-22T06:00:00Z
**Domain:** api-routes
**Pass:** 5

## Summary

| Severity | Assigned | Fixed |
|----------|----------|-------|
| MUST-FIX | 12 | 12 |
| SHOULD-FIX | 16 | 16 |
| NIT | 3 | 3 |
| **Total** | **31** | **31** |

## MUST-FIX Issues Fixed

### MF-012: JSON body guard in POST /api/webhooks
**File:** `app/api/webhooks/route.ts`
**Fix:** Wrapped `request.json()` in try/catch returning 400 for invalid JSON.

### MF-013: JSON body guard in PATCH /api/meetings/[id]
**File:** `app/api/meetings/[id]/route.ts`
**Fix:** Wrapped `request.json()` in try/catch returning 400 for invalid JSON.

### MF-014: JSON body guard in POST /api/meetings
**File:** `app/api/meetings/route.ts`
**Fix:** Wrapped `request.json()` in try/catch returning 400 for invalid JSON.

### MF-015: JSON body guard in POST /api/sessions/create
**File:** `app/api/sessions/create/route.ts`
**Fix:** Added inner try/catch around `request.json()` returning 400, before the outer try/catch.

### MF-016: JSON body guard in POST /api/sessions/restore
**File:** `app/api/sessions/restore/route.ts`
**Fix:** Added inner try/catch around `request.json()` returning 400, destructuring from parsed body.

### MF-017: JSON body guard in POST /api/organization
**File:** `app/api/organization/route.ts`
**Fix:** Added inner try/catch around `request.json()` returning 400.

### MF-018: JSON body guard in POST /api/sessions/[id]/command
**File:** `app/api/sessions/[id]/command/route.ts`
**Fix:** Added inner try/catch around `request.json()` returning 400.

### MF-019: JSON body guard in PATCH /api/sessions/[id]/rename
**File:** `app/api/sessions/[id]/rename/route.ts`
**Fix:** Separated `request.json()` from `Promise.all`, added try/catch returning 400.

### MF-020: JSON body guard in POST /api/sessions/activity/update
**File:** `app/api/sessions/activity/update/route.ts`
**Fix:** Added inner try/catch around `request.json()`, destructured from parsed body.

### MF-021: JSON body guard in POST /api/conversations/parse
**File:** `app/api/conversations/parse/route.ts`
**Fix:** Added inner try/catch around `request.json()` returning 400.

### MF-022: try/catch in POST and GET for governance requests
**File:** `app/api/v1/governance/requests/route.ts`
**Fix:** Wrapped POST `submitCrossHostRequest` and GET `listCrossHostRequests` in try/catch blocks. Also changed from `result.data ?? { error: result.error }` to explicit `if (result.error)` pattern (Pattern A) for consistency (also addresses SF-043).

### MF-023: Error check in exchange-peers route
**File:** `app/api/hosts/exchange-peers/route.ts`
**Fix:** Added `if (result.error)` check before accessing `result.data`.

## SHOULD-FIX Issues Fixed

### SF-034: Silent swallow of malformed JSON in POST /api/agents/[id]/docs
**File:** `app/api/agents/[id]/docs/route.ts`
**Fix:** Changed catch block to return 400 error when non-empty body fails JSON.parse.

### SF-035: Silent swallow of malformed JSON in POST /api/agents/[id]/graph/code
**File:** `app/api/agents/[id]/graph/code/route.ts`
**Fix:** Changed catch block to return 400 error when non-empty body fails JSON.parse.

### SF-036: NaN propagation in parseInt for depth parameter
**File:** `app/api/agents/[id]/graph/code/route.ts`
**Fix:** Added `|| 1` fallback after parseInt to handle NaN from non-numeric strings.

### SF-037: NaN propagation in parseInt for limit in docs route
**File:** `app/api/agents/[id]/docs/route.ts`
**Fix:** Added `|| 10` fallback after parseInt.

### SF-038: NaN propagation in parseInt for batchSize
**File:** `app/api/agents/[id]/index-delta/route.ts`
**Fix:** Added `|| 10` fallback after parseInt with explicit radix 10.

### SF-039: NaN propagation in timeout parameter
**File:** `app/api/agents/unified/route.ts`
**Fix:** Added `|| 3000` fallback after parseInt.

### SF-040: Error result not checked in GET /api/agents/unified
**File:** `app/api/agents/unified/route.ts`
**Fix:** Added `if (result.error)` check before returning data.

### SF-041: Unchecked JSON parse in agent import options
**File:** `app/api/agents/import/route.ts`
**Fix:** Wrapped `JSON.parse(optionsStr)` in try/catch returning 400.

### SF-042: Logging user-controlled data to console
**File:** `app/api/conversations/parse/route.ts`
**Fix:** Removed `console.log` that was logging user-supplied `conversationFile` path.

### SF-043: Inconsistent error response shape
**Files:** `app/api/v1/governance/requests/route.ts`, `app/api/hosts/exchange-peers/route.ts`, `app/api/hosts/register-peer/route.ts`
**Fix:** Standardized on Pattern A (`if (result.error)` explicit check) across all affected routes.

### SF-044: Missing error check in register-peer route
**File:** `app/api/hosts/register-peer/route.ts`
**Fix:** Added `if (result.error)` check before accessing `result.data`.

### SF-045: SSRF potential in hosts/health endpoint
**File:** `app/api/hosts/health/route.ts`
**Fix:** Added URL validation: rejects non-http/https schemes (blocks `file://`, etc.), returns 400 for invalid URLs.

### SF-046: Type assertion `as UpdateTaskParams` bypasses type safety
**File:** `app/api/teams/[id]/tasks/[taskId]/route.ts`
**Fix:** Replaced `as` cast with explicit field whitelisting of known UpdateTaskParams fields.

### SF-047: Type assertion `as CreateTaskParams` bypasses type safety
**File:** `app/api/teams/[id]/tasks/route.ts`
**Fix:** Replaced `as` cast with explicit field whitelisting of known CreateTaskParams fields.

### SF-048: `any` type on hosts.find callback
**File:** `app/api/v1/governance/requests/route.ts`
**Fix:** Removed `: any` annotation from `.find()` callback -- TypeScript infers the type from `getHosts()` return type.

### SF-049: hostId in error message leaking to callers
**File:** `app/api/v1/governance/requests/route.ts`
**Fix:** Changed error message from `Unknown host: ${hostId}` to generic `Unknown host`.

## NIT Issues Fixed

### NT-025: Missing top-level try/catch in agent route handlers
**File:** `app/api/agents/[id]/amp/addresses/route.ts`
**Fix:** Added top-level try/catch to both GET and POST handlers for defense-in-depth.

### NT-026: Missing UUID validation on path parameters
**Files:** `app/api/teams/[id]/route.ts`, `app/api/teams/[id]/tasks/route.ts`, `app/api/teams/[id]/tasks/[taskId]/route.ts`
**Fix:** Added `isValidUuid()` checks on all `id` and `taskId` path parameters, returning 400 for invalid format.

### NT-027: Missing `export const dynamic = 'force-dynamic'`
**Files:** `app/api/governance/route.ts`, `app/api/governance/trust/route.ts`, `app/api/governance/reachable/route.ts`, `app/api/v1/governance/requests/route.ts`
**Fix:** Added `export const dynamic = 'force-dynamic'` to all routes that read runtime state.

## Pass 5 Additional Fixes (2026-02-22)

### SF-044 (task numbering): Type guard for body.settings in skills settings PUT
**File:** `app/api/agents/[id]/skills/settings/route.ts`
**Fix:** Added type guard before `saveSkillSettings` call: rejects if `body.settings` is falsy, not an object, or an array. Returns 400.

### NT-039 (task numbering): Top-level try/catch for register route
**File:** `app/api/agents/register/route.ts`
**Fix:** Wrapped entire POST handler in top-level try/catch returning 500 on unexpected throws.

## Files Modified

1. `app/api/webhooks/route.ts`
2. `app/api/meetings/[id]/route.ts`
3. `app/api/meetings/route.ts`
4. `app/api/sessions/create/route.ts`
5. `app/api/sessions/restore/route.ts`
6. `app/api/organization/route.ts`
7. `app/api/sessions/[id]/command/route.ts`
8. `app/api/sessions/[id]/rename/route.ts`
9. `app/api/sessions/activity/update/route.ts`
10. `app/api/conversations/parse/route.ts`
11. `app/api/v1/governance/requests/route.ts`
12. `app/api/hosts/exchange-peers/route.ts`
13. `app/api/hosts/register-peer/route.ts`
14. `app/api/agents/[id]/docs/route.ts`
15. `app/api/agents/[id]/graph/code/route.ts`
16. `app/api/agents/[id]/index-delta/route.ts`
17. `app/api/agents/unified/route.ts`
18. `app/api/agents/import/route.ts`
19. `app/api/hosts/health/route.ts`
20. `app/api/teams/[id]/tasks/[taskId]/route.ts`
21. `app/api/teams/[id]/tasks/route.ts`
22. `app/api/agents/[id]/amp/addresses/route.ts`
23. `app/api/teams/[id]/route.ts`
24. `app/api/governance/route.ts`
25. `app/api/governance/trust/route.ts`
26. `app/api/governance/reachable/route.ts`
27. `app/api/agents/[id]/skills/settings/route.ts` (Pass 5)
28. `app/api/agents/register/route.ts` (Pass 5)
