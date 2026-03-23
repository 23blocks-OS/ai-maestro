# Code Correctness Report: all-domains

**Agent:** epcp-code-correctness-agent
**Domain:** all-domains
**Files audited:** 7
**Date:** 2026-02-22T06:38:00Z
**Pass:** 7

## MUST-FIX

### [CC-P7-A0-001] Missing `await` on async `updateAgentById` in PATCH /metadata route (headless-router.ts)
- **File:** services/headless-router.ts:945
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `updateAgentById` is declared `async` (agents-core-service.ts:645) and returns `Promise<ServiceResult<...>>`. At line 945 in the headless-router's PATCH `/api/agents/[id]/metadata` handler, the call is made without `await`. This means `result` is a Promise object, not the resolved value. Consequently, `result.error` is always `undefined` (Promise objects don't have an `.error` property), so the handler always falls through to the success branch and sends `{ metadata: undefined }` because `result.data` is also undefined on the Promise.
- **Evidence:**
  ```typescript
  // Line 943-951
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (req, res, params) => {
    const metadata = await readJsonBody(req)
    const result = updateAgentById(params.id, { metadata })  // <-- MISSING await
    if (result.error) {
      sendJson(res, result.status, { error: result.error })
    } else {
      sendJson(res, 200, { metadata: result.data?.agent?.metadata })
    }
  }},
  ```
- **Fix:** Change line 945 to `const result = await updateAgentById(params.id, { metadata })`

### [CC-P7-A0-002] Missing `await` on async `updateAgentById` in DELETE /metadata route (headless-router.ts)
- **File:** services/headless-router.ts:953
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P7-A0-001 but in the DELETE `/api/agents/[id]/metadata` handler. The `updateAgentById` call at line 953 is missing `await`. The result is a Promise, so the handler always reaches the success branch and sends `{ success: true }` even if the underlying update failed.
- **Evidence:**
  ```typescript
  // Line 952-959
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const result = updateAgentById(params.id, { metadata: {} })  // <-- MISSING await
    if (result.error) {
      sendJson(res, result.status, { error: result.error })
    } else {
      sendJson(res, 200, { success: true })
    }
  }},
  ```
- **Fix:** Change line 953 to `const result = await updateAgentById(params.id, { metadata: {} })`

## SHOULD-FIX

### [CC-P7-A0-003] `getMetrics` (sync) called without `await` at GET /metrics in headless-router -- correct but inconsistent with PATCH
- **File:** services/headless-router.ts:734
- **Severity:** NIT (not a bug)
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `getMetrics` is declared as synchronous (`export function getMetrics(agentId: string): ServiceResult<any>` at agents-memory-service.ts:1101), so the call at line 734 without `await` is correct. Meanwhile `updateMetrics` is async and correctly uses `await` at line 738 after the diff fix. No action needed -- noting for completeness.

## NIT

_No nits found._

## Verification of All 14 Diff Changes

| # | File | Line (approx) | Function | Is async? | Await correct? |
|---|------|--------------|----------|-----------|----------------|
| 1 | app/api/agents/[id]/metrics/route.ts:35 | `updateMetrics` | Yes (line 1120 agents-memory-service.ts) | CORRECT |
| 2 | app/api/agents/[id]/route.ts:35 | `updateAgentById` | Yes (line 645 agents-core-service.ts) | CORRECT |
| 3 | app/api/agents/[id]/route.ts:57 | `deleteAgentById` | Yes (line 692 agents-core-service.ts) | CORRECT |
| 4 | app/api/agents/[id]/session/route.ts:22 | `linkAgentSession` | Yes (line 1096 agents-core-service.ts) | CORRECT |
| 5 | app/api/agents/normalize-hosts/route.ts:25 | `normalizeHosts` | Yes (line 145 agents-directory-service.ts) | CORRECT |
| 6 | app/api/agents/register/route.ts:15 | `registerAgent` | Yes (line 727 agents-core-service.ts) | CORRECT |
| 7 | app/api/agents/route.ts:54 | `createNewAgent` | Yes (line 602 agents-core-service.ts) | CORRECT |
| 8 | services/headless-router.ts:543 | `registerAgent` | Yes | CORRECT |
| 9 | services/headless-router.ts:594 | `normalizeHosts` | Yes | CORRECT |
| 10 | services/headless-router.ts:612 | `createNewAgent` | Yes | CORRECT |
| 11 | services/headless-router.ts:625 | `linkAgentSession` | Yes | CORRECT |
| 12 | services/headless-router.ts:738 | `updateMetrics` | Yes | CORRECT |
| 13 | services/headless-router.ts:972 | `updateAgentById` | Yes | CORRECT |
| 14 | services/headless-router.ts:980 | `deleteAgentById` | Yes | CORRECT |

All 14 diff changes are verified correct.

## Remaining Call Sites Audit (Checking for Other Missing `await`)

Audited all service function calls in the 7 domain files plus all agent-related calls in headless-router.ts:

| Call Site | Function | Sync/Async | Has await? | Status |
|-----------|----------|-----------|-----------|--------|
| headless-router.ts:428 | `getSystemConfig()` | sync | No | OK |
| headless-router.ts:431 | `getOrganization()` | sync | No | OK |
| headless-router.ts:435 | `setOrganizationName(body)` | sync | No | OK (need verify) |
| headless-router.ts:438 | `getSubconsciousStatus()` | sync | No | OK |
| headless-router.ts:441 | `getPtyDebugInfo()` | async | Yes | OK |
| headless-router.ts:443 | `getDockerInfo()` | async | Yes | OK |
| headless-router.ts:525 | `getUnifiedAgents(...)` | async | Yes | OK |
| headless-router.ts:532 | `getStartupInfo()` | sync | No | OK |
| headless-router.ts:535 | `initializeStartup()` | async | Yes | OK |
| headless-router.ts:539 | `proxyHealthCheck(...)` | async | Yes | OK |
| headless-router.ts:546 | `lookupAgentByName(...)` | sync | No | OK |
| headless-router.ts:581 | `getDirectory()` | sync | No | OK |
| headless-router.ts:584 | `lookupAgentByDirectoryName(...)` | sync | No | OK |
| headless-router.ts:587 | `syncDirectory()` | async | Yes | OK |
| headless-router.ts:591 | `diagnoseHosts()` | sync | No | OK |
| headless-router.ts:599 | `searchAgentsByQuery(...)` | sync | No | OK |
| headless-router.ts:601 | `listAgents()` | async | Yes | OK |
| headless-router.ts:621 | `getAgentSessionStatus(...)` | async | Yes | OK |
| headless-router.ts:629 | `sendAgentSessionCommand(...)` | async | Yes | OK |
| headless-router.ts:632 | `unlinkOrDeleteAgentSession(...)` | async | Yes | OK |
| headless-router.ts:641 | `wakeAgent(...)` | async | Yes | OK |
| headless-router.ts:645 | `hibernateAgent(...)` | async | Yes | OK |
| headless-router.ts:734 | `getMetrics(...)` | sync | No | OK |
| headless-router.ts:799 | `getSkillsConfig(...)` | sync | No | OK |
| headless-router.ts:824 | `listRepos(...)` | sync | No | OK |
| headless-router.ts:828 | `updateRepos(...)` | sync | No | OK |
| headless-router.ts:831 | `removeRepo(...)` | sync | No | OK |
| headless-router.ts:836 | `getPlaybackState(...)` | sync | No | OK |
| headless-router.ts:840 | `controlPlayback(...)` | sync | No | OK |
| headless-router.ts:866 | `createTranscriptExportJob(...)` | sync | No | OK |
| headless-router.ts:936 | `getAgentById(...)` | sync | No | OK |
| headless-router.ts:945 | `updateAgentById(...)` | **async** | **No** | **BUG** (CC-P7-A0-001) |
| headless-router.ts:953 | `updateAgentById(...)` | **async** | **No** | **BUG** (CC-P7-A0-002) |
| headless-router.ts:963 | `getAgentById(...)` | sync | No | OK |
| app/api/agents/[id]/route.ts:14 | `getAgentById(...)` | sync | No | OK |
| app/api/agents/[id]/metrics/route.ts:13 | `getMetrics(...)` | sync | No | OK |
| app/api/agents/route.ts:22 | `searchAgentsByQuery(...)` | sync | No | OK |
| app/api/agents/route.ts:29 | `listAgents()` | async | Yes | OK |
| app/api/agents/normalize-hosts/route.ts:17 | `diagnoseHosts()` | sync | No | OK |
| app/api/agents/[id]/session/route.ts:44 | `sendAgentSessionCommand(...)` | async | Yes | OK |
| app/api/agents/[id]/session/route.ts:77 | `getAgentSessionStatus(...)` | async | Yes | OK |
| app/api/agents/[id]/session/route.ts:99 | `unlinkOrDeleteAgentSession(...)` | async | Yes | OK |

## Handler `async` Keyword Verification

All handler functions in the 7 domain files are marked `async`:

- app/api/agents/register/route.ts: `POST` -- `export async function POST` -- OK
- app/api/agents/route.ts: `GET` -- `export async function GET` -- OK
- app/api/agents/route.ts: `POST` -- `export async function POST` -- OK
- app/api/agents/[id]/route.ts: `GET` -- `export async function GET` -- OK
- app/api/agents/[id]/route.ts: `PATCH` -- `export async function PATCH` -- OK
- app/api/agents/[id]/route.ts: `DELETE` -- `export async function DELETE` -- OK
- app/api/agents/[id]/session/route.ts: all 4 handlers -- `export async function` -- OK
- app/api/agents/normalize-hosts/route.ts: `GET` and `POST` -- both `export async function` -- OK
- app/api/agents/[id]/metrics/route.ts: `GET` and `PATCH` -- both `export async function` -- OK
- headless-router.ts: All route handlers use `async` arrow functions -- OK

## CLEAN

Files with no issues found:
- app/api/agents/register/route.ts -- No issues
- app/api/agents/route.ts -- No issues
- app/api/agents/[id]/route.ts -- No issues
- app/api/agents/[id]/session/route.ts -- No issues
- app/api/agents/normalize-hosts/route.ts -- No issues
- app/api/agents/[id]/metrics/route.ts -- No issues

Files with issues:
- services/headless-router.ts -- 2 MUST-FIX issues (CC-P7-A0-001, CC-P7-A0-002)

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (confirmed `updateAgentById` is async via grep of its declaration)
- [x] I categorized findings correctly:
      MUST-FIX = the missing awaits cause handlers to always return success with undefined data
- [x] My finding IDs use the assigned prefix: CC-P7-A0-001, -002
- [x] My report file uses the UUID filename: epcp-correctness-P7-268dc241-d7a9-437e-9c4d-1df761f34918.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (N/A -- tests not in domain)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
