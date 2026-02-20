# Code Correctness Report: headless-router

**Agent:** epcp-code-correctness-agent
**Domain:** headless-router (governance + teams integration)
**Files audited:** 2 (services/headless-router.ts, services/governance-service.ts)
**Date:** 2026-02-20T00:00:00Z

## MUST-FIX

### [CC-001] Missing `await` on async `updateTeamTask` — sends unresolved Promise to client
- **File:** services/headless-router.ts:1151
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `updateTeamTask` is declared `async` (teams-service.ts:336) returning `Promise<ServiceResult<...>>`. The router passes the unawaited Promise to `sendServiceResult()`, which checks `result.error` and `result.data` on a Promise object — both are `undefined` — so it sends `sendJson(res, 200, undefined)`. The client gets a 200 with `undefined` body and the task update may not complete before the response is sent.
- **Evidence:**
  ```typescript
  // headless-router.ts:1151
  sendServiceResult(res, updateTeamTask(params.id, params.taskId, { ...body, requestingAgentId }))
  // teams-service.ts:336
  export async function updateTeamTask(...): Promise<ServiceResult<{ task: any; unblocked?: any[] }>>
  ```
- **Fix:** Add `await`: `sendServiceResult(res, await updateTeamTask(params.id, params.taskId, { ...body, requestingAgentId }))`

### [CC-002] Missing `await` on async `deleteTeamTask` — sends unresolved Promise to client
- **File:** services/headless-router.ts:1155
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-001. `deleteTeamTask` is async (teams-service.ts:407). The unawaited Promise is passed to `sendServiceResult`, resulting in a 200 with `undefined` body.
- **Evidence:**
  ```typescript
  // headless-router.ts:1155
  sendServiceResult(res, deleteTeamTask(params.id, params.taskId, requestingAgentId))
  ```
- **Fix:** Add `await`: `sendServiceResult(res, await deleteTeamTask(params.id, params.taskId, requestingAgentId))`

### [CC-003] Missing `await` on async `createTeamTask` — sends unresolved Promise to client
- **File:** services/headless-router.ts:1164
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern. `createTeamTask` is async (teams-service.ts:288). Unawaited.
- **Evidence:**
  ```typescript
  // headless-router.ts:1164
  sendServiceResult(res, createTeamTask(params.id, { ...body, requestingAgentId }))
  ```
- **Fix:** Add `await`: `sendServiceResult(res, await createTeamTask(params.id, { ...body, requestingAgentId }))`

### [CC-004] Missing `await` on async `updateTeamDocument` — sends unresolved Promise to client
- **File:** services/headless-router.ts:1171
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern. `updateTeamDocument` is async (teams-service.ts:525). Unawaited.
- **Evidence:**
  ```typescript
  // headless-router.ts:1171
  sendServiceResult(res, updateTeamDocument(params.id, params.docId, body))
  ```
- **Fix:** Add `await`: `sendServiceResult(res, await updateTeamDocument(params.id, params.docId, body))`

### [CC-005] Missing `await` on async `deleteTeamDocument` — sends unresolved Promise to client
- **File:** services/headless-router.ts:1174
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern. `deleteTeamDocument` is async (teams-service.ts:568). Unawaited.
- **Evidence:**
  ```typescript
  // headless-router.ts:1174
  sendServiceResult(res, deleteTeamDocument(params.id, params.docId))
  ```
- **Fix:** Add `await`: `sendServiceResult(res, await deleteTeamDocument(params.id, params.docId, requestingAgentId))` (also add missing `requestingAgentId` — see CC-008)

### [CC-006] Missing `await` on async `createTeamDocument` — sends unresolved Promise to client
- **File:** services/headless-router.ts:1183
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern. `createTeamDocument` is async (teams-service.ts:459). Unawaited.
- **Evidence:**
  ```typescript
  // headless-router.ts:1183
  sendServiceResult(res, createTeamDocument(params.id, { ...body, requestingAgentId }))
  ```
- **Fix:** Add `await`: `sendServiceResult(res, await createTeamDocument(params.id, { ...body, requestingAgentId }))`

### [CC-007] Missing `await` on async `updateTeamById` — sends unresolved Promise to client
- **File:** services/headless-router.ts:1192
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `updateTeamById` is async (teams-service.ts:198). Unawaited.
- **Evidence:**
  ```typescript
  // headless-router.ts:1192
  sendServiceResult(res, updateTeamById(params.id, { ...body, requestingAgentId }))
  ```
- **Fix:** Add `await`: `sendServiceResult(res, await updateTeamById(params.id, { ...body, requestingAgentId }))`

### [CC-008] Missing `await` on async `deleteTeamById` — sends unresolved Promise to client
- **File:** services/headless-router.ts:1196
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `deleteTeamById` is async (teams-service.ts:233). Unawaited.
- **Evidence:**
  ```typescript
  // headless-router.ts:1196
  sendServiceResult(res, deleteTeamById(params.id, requestingAgentId))
  ```
- **Fix:** Add `await`: `sendServiceResult(res, await deleteTeamById(params.id, requestingAgentId))`

### [CC-009] Missing `await` on async `createNewTeam` — sends unresolved Promise to client
- **File:** services/headless-router.ts:1204
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `createNewTeam` is async (teams-service.ts:131). Unawaited.
- **Evidence:**
  ```typescript
  // headless-router.ts:1204
  sendServiceResult(res, createNewTeam({ ...body, requestingAgentId }))
  ```
- **Fix:** Add `await`: `sendServiceResult(res, await createNewTeam({ ...body, requestingAgentId }))`

## SHOULD-FIX

### [CC-010] Missing X-Agent-Id extraction for DELETE /api/teams/:id/documents/:docId — governance ACL bypassed
- **File:** services/headless-router.ts:1173-1174
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `deleteTeamDocument` function accepts `requestingAgentId?: string` as a third parameter and uses it for governance ACL checks on closed teams. The router handler does NOT extract `X-Agent-Id` header for this route, unlike all other team mutation routes (tasks, team CRUD, etc.). This means closed-team document deletion governance ACL checks are silently bypassed.
- **Evidence:**
  ```typescript
  // headless-router.ts:1173-1174 — missing X-Agent-Id extraction
  { method: 'DELETE', ..., handler: async (_req, res, params) => {
      sendServiceResult(res, deleteTeamDocument(params.id, params.docId))
  }}
  // Compare with deleteTeamTask at 1153-1155 which DOES extract it:
  { method: 'DELETE', ..., handler: async (req, res, params) => {
      const requestingAgentId = getHeader(req, 'X-Agent-Id') || undefined
      sendServiceResult(res, deleteTeamTask(params.id, params.taskId, requestingAgentId))
  }}
  ```
- **Fix:** Extract `requestingAgentId` from the header and pass it:
  ```typescript
  handler: async (req, res, params) => {
      const requestingAgentId = getHeader(req, 'X-Agent-Id') || undefined
      sendServiceResult(res, await deleteTeamDocument(params.id, params.docId, requestingAgentId))
  }
  ```

### [CC-011] Missing X-Agent-Id extraction for PUT /api/teams/:id/documents/:docId — governance ACL bypassed
- **File:** services/headless-router.ts:1169-1171
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `updateTeamDocument` destructures `requestingAgentId` from `params` (teams-service.ts:537) for governance ACL. The router passes the raw body without injecting `requestingAgentId` from the header. Unless the client embeds it in the JSON body, the ACL check is skipped. Other mutation routes (createTeamDocument, updateTeamTask) DO inject it from the header.
- **Evidence:**
  ```typescript
  // headless-router.ts:1169-1171 — no X-Agent-Id injection
  handler: async (req, res, params) => {
      const body = await readJsonBody(req)
      sendServiceResult(res, updateTeamDocument(params.id, params.docId, body))
  }
  // Compare with createTeamDocument at 1180-1183 which DOES inject it:
  handler: async (req, res, params) => {
      const body = await readJsonBody(req)
      const requestingAgentId = getHeader(req, 'X-Agent-Id') || undefined
      sendServiceResult(res, createTeamDocument(params.id, { ...body, requestingAgentId }))
  }
  ```
- **Fix:** Inject `requestingAgentId` from the header into the body:
  ```typescript
  const requestingAgentId = getHeader(req, 'X-Agent-Id') || undefined
  sendServiceResult(res, await updateTeamDocument(params.id, params.docId, { ...body, requestingAgentId }))
  ```

### [CC-012] Missing X-Agent-Id extraction for GET /api/teams/:id/documents/:docId — governance ACL bypassed
- **File:** services/headless-router.ts:1166-1167
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `getTeamDocument` accepts `requestingAgentId?: string` as a third parameter (teams-service.ts:499) and uses it for ACL on closed teams. The router does not extract or pass it.
- **Evidence:**
  ```typescript
  // headless-router.ts:1166-1167
  handler: async (_req, res, params) => {
      sendServiceResult(res, getTeamDocument(params.id, params.docId))
  }
  // teams-service.ts:499
  export function getTeamDocument(teamId: string, docId: string, requestingAgentId?: string)
  ```
- **Fix:** Extract X-Agent-Id and pass it as third argument:
  ```typescript
  handler: async (req, res, params) => {
      const requestingAgentId = getHeader(req, 'X-Agent-Id') || undefined
      sendServiceResult(res, getTeamDocument(params.id, params.docId, requestingAgentId))
  }
  ```

## NIT

_(none found)_

## CLEAN

### Governance routes (lines 1107-1135)
All 7 governance routes are correctly implemented:
- `GET /api/governance` — calls `getGovernanceConfig()` (sync) — correct, no await needed
- `POST /api/governance/manager` — calls `await setManagerRole(body)` (async) — correct
- `POST /api/governance/password` — calls `await setGovernancePassword(body)` (async) — correct
- `GET /api/governance/reachable` — calls `getReachableAgents(query.agentId || null)` (sync) — correct
- `POST /api/governance/transfers/:id/resolve` — calls `await resolveTransferReq(params.id, body)` (async) — correct
- `GET /api/governance/transfers` — calls `listTransferRequests({...})` (sync) — correct
- `POST /api/governance/transfers` — calls `await createTransferReq(body)` (async) — correct

Route patterns all match the governance-service.ts comment headers. Function signatures match. Route ordering is correct (`:id/resolve` before `/transfers`).

### Governance service (governance-service.ts)
- No issues found in the governance service itself. The ServiceResult pattern is used correctly throughout.
- Rate limiting, password verification, UUID validation, team access checks, lock acquisition/release — all correct.
- The `toTeam!` non-null assertion at line 388 is safe because it's guarded by `if (!toTeam) return` at line 356 inside the `action === 'approve'` block.

### Teams routes with correct X-Agent-Id extraction
The following team routes correctly extract X-Agent-Id:
- `PUT /api/teams/:id/tasks/:taskId` (line 1150)
- `DELETE /api/teams/:id/tasks/:taskId` (line 1154)
- `GET /api/teams/:id/tasks` (line 1158)
- `POST /api/teams/:id/tasks` (line 1163)
- `GET /api/teams/:id/documents` (line 1177)
- `POST /api/teams/:id/documents` (line 1182)
- `GET /api/teams/:id` (line 1186)
- `PUT /api/teams/:id` (line 1191)
- `DELETE /api/teams/:id` (line 1195)
- `POST /api/teams` (line 1203)

## SUMMARY

| Severity | Count | Details |
|----------|-------|---------|
| MUST-FIX | 9 | CC-001 through CC-009: Missing `await` on 9 async team-service calls. All send unresolved Promises to `sendServiceResult()`, resulting in 200 responses with `undefined` body. |
| SHOULD-FIX | 3 | CC-010 through CC-012: Missing X-Agent-Id extraction for 3 document routes, bypassing governance ACL on closed teams. |
| NIT | 0 | — |

**Root cause of MUST-FIX issues:** The governance PR added `await` to the 7 governance service calls and 0 of the existing teams-service calls. But 9 teams-service functions are async and need `await` too. This was likely an oversight — the teams routes were touched to add X-Agent-Id extraction but the existing `sendServiceResult(res, fn())` pattern was not updated to `sendServiceResult(res, await fn())`.
