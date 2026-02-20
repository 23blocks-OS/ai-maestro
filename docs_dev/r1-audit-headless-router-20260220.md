# Code Correctness Report: headless-router

**Agent:** epcp-code-correctness-agent
**Domain:** headless-router
**Files audited:** 1 (services/headless-router.ts - 1435 lines)
**Date:** 2026-02-20T16:15:00Z

## MUST-FIX

_None found._

## SHOULD-FIX

### [CC-001] Governance resolve route falls back to body.resolvedBy when auth returns no agentId
- **File:** services/headless-router.ts:1132
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The resolve route uses `auth.agentId || body.resolvedBy`. When the web UI (system owner) calls this endpoint with no auth headers, `authenticateAgent` returns `{}` (no error, no agentId). The route then proceeds with `body.resolvedBy` from the untrusted request body. While this is intentional for the web UI case (system owner has no agent identity), it means any unauthenticated caller can set `resolvedBy` to any value. The comment says "prefer authenticated identity" but the fallback to body is permissive.
- **Evidence:**
  ```typescript
  // Line 1132
  const resolvedBy = auth.agentId || body.resolvedBy  // prefer authenticated identity
  ```
  Combined with agent-auth.ts lines 31-34:
  ```typescript
  // Case 1: No auth attempt at all → system owner / web UI
  if (!authHeader && !agentIdHeader) {
    return {}
  }
  ```
- **Fix:** Consider whether this is acceptable. If the resolve action should only be performed by identified agents or the system owner, the web UI could pass a sentinel value (e.g., `"system"`) and the route should reject requests with no resolvedBy at all. Alternatively, if the web UI is trusted (localhost-only), the current behavior is fine -- just document that this is intentional.

### [CC-002] POST /api/governance/transfers accepts requestedBy from untrusted body
- **File:** services/headless-router.ts:1142-1144
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `createTransferReq` route passes the raw body (including `requestedBy`) directly to the service without authenticating the caller. Any client can set `requestedBy` to any agent UUID. The service layer does validate that `requestedBy` is a manager or chief-of-staff, but an attacker who knows a manager's UUID could impersonate them. However, this matches the Next.js API route behavior (app/api/governance/transfers/route.ts also uses body.requestedBy without auth), so this is a pre-existing design choice, not a regression.
- **Evidence:**
  ```typescript
  // Lines 1142-1144
  { method: 'POST', pattern: /^\/api\/governance\/transfers$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await createTransferReq(body))
  }},
  ```
  The Next.js route at app/api/governance/transfers/route.ts also trusts body.requestedBy (validated as UUID + isManager/isChiefOfStaff check).
- **Fix:** Consider adding `authenticateAgent()` and deriving `requestedBy` from `auth.agentId`, consistent with how team routes derive `requestingAgentId`. This would be a new feature, not a regression fix.

### [CC-003] POST /api/governance/manager and /password lack agent authentication
- **File:** services/headless-router.ts:1111-1117
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `setManagerRole` and `setGovernancePassword` routes accept POST bodies without any `authenticateAgent()` call. These are sensitive governance operations (setting who is manager, setting the governance password). Any caller can invoke them. However, this matches the Next.js API routes (app/api/governance/manager/route.ts and app/api/governance/password/route.ts also lack auth), so this is a pre-existing design choice, not a regression in the headless router.
- **Evidence:**
  ```typescript
  // Lines 1111-1117
  { method: 'POST', pattern: /^\/api\/governance\/manager$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await setManagerRole(body))
  }},
  { method: 'POST', pattern: /^\/api\/governance\/password$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await setGovernancePassword(body))
  }},
  ```
- **Fix:** These routes should ideally use `authenticateAgent()` to verify the caller is authorized to change governance settings. But since this is consistent with the Next.js routes, it's a system-wide design issue, not a headless-router-specific bug.

## NIT

### [CC-004] GET /api/teams does not use authenticateAgent
- **File:** services/headless-router.ts:1307-1308
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `GET /api/teams` and `GET /api/governance/transfers` are the only team/governance list endpoints that don't use authenticateAgent. All other team CRUD routes do. This is likely intentional (listing teams is a read-only operation that doesn't need agent identity), but worth noting for consistency. The `listAllTeams()` function is synchronous and doesn't accept a requestingAgentId parameter.
- **Evidence:**
  ```typescript
  // Line 1307-1308
  { method: 'GET', pattern: /^\/api\/teams$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, listAllTeams())
  }},
  ```
- **Fix:** No action needed if listing teams is intended to be public. Document this as intentional.

### [CC-005] GET /api/teams/[id]/tasks/[taskId] returns 405 instead of implementing the route
- **File:** services/headless-router.ts:1154-1157
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The GET route for a single task returns a hardcoded 405 Method Not Allowed with a comment "GET single task not implemented in route". This is a stub that may confuse API consumers.
- **Evidence:**
  ```typescript
  // Lines 1154-1157
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)\/tasks\/([^/]+)$/, paramNames: ['id', 'taskId'], handler: async (_req, res, _params) => {
    // GET single task not implemented in route — taskId routes only have PUT/DELETE
    sendJson(res, 405, { error: 'Method not allowed' })
  }},
  ```
- **Fix:** Either implement the GET handler or remove the route entry (a missing route would result in a 404, which is more accurate than 405 for a genuinely unimplemented endpoint).

## VERIFICATION SUMMARY

### Async/Await Correctness: ALL VERIFIED CORRECT

**teams-service functions:**
| Function | Service Signature | Router Call | Status |
|----------|------------------|-------------|--------|
| `listAllTeams` | sync (line 121) | no await (line 1308) | CORRECT |
| `createNewTeam` | async (line 131) | await (line 1321) | CORRECT |
| `getTeamById` | sync (line 171) | no await (line 1280) | CORRECT |
| `updateTeamById` | async (line 197) | await (line 1293) | CORRECT |
| `deleteTeamById` | async (line 238) | await (line 1305) | CORRECT |
| `listTeamTasks` | sync (line 282) | no await (line 1193) | CORRECT |
| `createTeamTask` | async (line 304) | await (line 1206) | CORRECT |
| `updateTeamTask` | async (line 351) | await (line 1169) | CORRECT |
| `deleteTeamTask` | async (line 421) | await (line 1181) | CORRECT |
| `listTeamDocuments` | sync (line 450) | no await (line 1255) | CORRECT |
| `createTeamDocument` | async (line 471) | await (line 1268) | CORRECT |
| `getTeamDocument` | sync (line 510) | no await (line 1218) | CORRECT |
| `updateTeamDocument` | async (line 535) | await (line 1231) | CORRECT |
| `deleteTeamDocument` | async (line 577) | await (line 1243) | CORRECT |
| `notifyTeamAgents` | async (line 605) | await (line 1152) | CORRECT |

**governance-service functions:**
| Function | Service Signature | Router Call | Status |
|----------|------------------|-------------|--------|
| `getGovernanceConfig` | sync (line 39) | no await (line 1109) | CORRECT |
| `setManagerRole` | async (line 61) | await (line 1113) | CORRECT |
| `setGovernancePassword` | async (line 109) | await (line 1117) | CORRECT |
| `getReachableAgents` | sync (line 159) | no await (line 1120) | CORRECT |
| `listTransferRequests` | sync (line 205) | no await (line 1136) | CORRECT |
| `createTransferReq` | async (line 234) | await (line 1144) | CORRECT |
| `resolveTransferReq` | async (line 310) | await (line 1133) | CORRECT |

### authenticateAgent Usage: ALL TEAM/DOC/TASK ROUTES VERIFIED

All 14 uses of `authenticateAgent` in the file follow the correct pattern:
1. Extract `Authorization` and `X-Agent-Id` headers via `getHeader(req, ...)`
2. Call `authenticateAgent(authHeader, agentIdHeader)`
3. Check `auth.error` and return 401 if present
4. Extract `auth.agentId` as `requestingAgentId` (or `resolvedBy` for governance resolve)
5. Pass to service function

**Routes using authenticateAgent (14 total):**
- POST /api/governance/transfers/{id}/resolve (line 1122)
- PUT /api/teams/{id}/tasks/{taskId} (line 1158)
- DELETE /api/teams/{id}/tasks/{taskId} (line 1171)
- GET /api/teams/{id}/tasks (line 1183)
- POST /api/teams/{id}/tasks (line 1195)
- GET /api/teams/{id}/documents/{docId} (line 1208)
- PUT /api/teams/{id}/documents/{docId} (line 1220)
- DELETE /api/teams/{id}/documents/{docId} (line 1233)
- GET /api/teams/{id}/documents (line 1245)
- POST /api/teams/{id}/documents (line 1257)
- GET /api/teams/{id} (line 1270)
- PUT /api/teams/{id} (line 1282)
- DELETE /api/teams/{id} (line 1295)
- POST /api/teams (line 1310)

### Direct X-Agent-Id reads (without authenticateAgent): NONE

Every `getHeader(req, 'X-Agent-Id')` in the file is used exclusively as the second argument to `authenticateAgent()`. There are zero cases where X-Agent-Id is read and used directly for identity purposes.

The only non-auth use of `X-Agent-Id` is in the export route response header (line 822) where it is a *response* header being set, not a request header being read.

### Routes that accept body.requestingAgentId or body.resolvedBy directly: 2 FOUND

1. **Line 1132:** `resolvedBy` falls back to `body.resolvedBy` when auth returns no agentId (see CC-001)
2. **Line 1142-1144:** `createTransferReq` passes full body including `requestedBy` without auth (see CC-002)

Both match the behavior of the corresponding Next.js API routes.

### Governance routes present and functional: ALL 7 PRESENT

- GET /api/governance (config)
- POST /api/governance/manager
- POST /api/governance/password
- GET /api/governance/reachable
- POST /api/governance/transfers/{id}/resolve
- GET /api/governance/transfers
- POST /api/governance/transfers

## CLEAN

Files with no issues found:
- services/headless-router.ts — All async/await patterns correct, all authenticateAgent patterns consistent, no direct X-Agent-Id reads, all governance routes present. Only design-level security suggestions (SHOULD-FIX) that match existing Next.js API route behavior.
