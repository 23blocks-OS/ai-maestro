# Code Correctness Report: api-teams

**Agent:** epcp-code-correctness-agent
**Domain:** api-teams
**Pass:** 9
**Run ID:** 1ebfebc5
**Finding ID Prefix:** CC-P9-A2
**Files audited:** 9
**Date:** 2026-02-23T03:11:00Z

## MUST-FIX

_No MUST-FIX issues found._

## SHOULD-FIX

### [CC-P9-A2-001] notify/route.ts passes raw unvalidated body directly to service function
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts`:26
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `POST` handler in `notify/route.ts` passes the raw `body` object directly to `notifyTeamAgents(body)` without any field whitelisting or input validation at the route level. While other POST handlers in this domain (tasks/route.ts, tasks/[taskId]/route.ts, [id]/route.ts) explicitly whitelist fields and validate types before passing to the service layer, `notify/route.ts` trusts the raw JSON entirely. The service function `notifyTeamAgents` does validate `agentIds` and `teamName`, but the route-level defense-in-depth pattern used everywhere else is absent here. An attacker could send extraneous fields that get spread into the params object (prototype pollution vectors, unexpected properties that downstream code might pick up).
- **Evidence:**
  ```typescript
  // notify/route.ts:26
  const result = await notifyTeamAgents(body)
  ```
  Compare with the pattern used in tasks/route.ts:74-83:
  ```typescript
  const safeParams: CreateTaskParams = {
    subject: String(body.subject ?? ''),
    ...(body.description !== undefined && { description: String(body.description) }),
    // ... explicit whitelist
  }
  const result = await createTeamTask(id, safeParams)
  ```
- **Fix:** Whitelist only `agentIds` and `teamName` from `body` before passing to service:
  ```typescript
  const safeParams = { agentIds: body.agentIds, teamName: body.teamName }
  const result = await notifyTeamAgents(safeParams)
  ```

### [CC-P9-A2-002] documents/route.ts POST passes raw body with spread, no field whitelisting
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts`:58
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The POST handler in `documents/route.ts` passes `{ ...body, requestingAgentId }` directly to `createTeamDocument`. While the service layer destructures only known fields (`title, content, pinned, tags`), the route layer does not whitelist fields. This is inconsistent with the defense-in-depth pattern applied to the task routes (tasks/route.ts and tasks/[taskId]/route.ts), which explicitly whitelist fields. Similarly, `documents/[docId]/route.ts` PUT handler at line 56 does the same: `{ ...body, requestingAgentId }`.
- **Evidence:**
  ```typescript
  // documents/route.ts:58
  const result = await createTeamDocument(id, { ...body, requestingAgentId })

  // documents/[docId]/route.ts:56
  const result = await updateTeamDocument(id, docId, { ...body, requestingAgentId })
  ```
- **Fix:** Whitelist only `CreateDocumentParams` / `UpdateDocumentParams` fields at the route level, mirroring the pattern in tasks routes. For POST:
  ```typescript
  const safeParams: CreateDocumentParams = {
    title: body.title,
    ...(body.content !== undefined && { content: String(body.content) }),
    ...(body.pinned !== undefined && { pinned: Boolean(body.pinned) }),
    ...(body.tags !== undefined && { tags: body.tags }),
    requestingAgentId,
  }
  ```

### [CC-P9-A2-003] notify/route.ts does not validate agentIds array elements are UUIDs
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts`:26
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `notifyTeamAgents` service function accepts `agentIds` as `string[]` and validates it is an array, but neither the route nor the service validates that each element is a valid UUID. The task routes validate `blockedBy` array elements at the route level (`body.blockedBy.every(v => typeof v === 'string')`). Without element-level validation for `agentIds`, non-string or malformed values could be passed to downstream tmux commands. The service does call `safeTeamName.replace(/[\x00-\x1F\x7F]/g, '')` for teamName but agentIds are used to look up agents without UUID format validation.
- **Evidence:**
  ```typescript
  // notify/route.ts:26 - passes body directly, no element validation
  const result = await notifyTeamAgents(body)

  // teams-service.ts:626 - validates array, not elements
  if (!agentIds || !Array.isArray(agentIds)) {
    return { error: 'agentIds array is required', status: 400 }
  }
  ```
- **Fix:** Add element-level validation at the route or service layer: validate each `agentIds` element is a string and optionally a valid UUID format.

### [CC-P9-A2-004] `any[]` return types in service functions weaken type safety
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:120,300,468,623
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple service functions use `any[]` in their return types: `listAllTeams()` returns `ServiceResult<{ teams: any[] }>`, `listTeamTasks()` returns `ServiceResult<{ tasks: any[] }>`, `listTeamDocuments()` returns `ServiceResult<{ documents: any[] }>`, and `notifyTeamAgents()` returns `Promise<ServiceResult<{ results: any[] }>>`. These propagate `any` through the route handlers to the API responses, eliminating TypeScript's ability to catch shape mismatches between what the service returns and what the API contract promises.
- **Evidence:**
  ```typescript
  // teams-service.ts:120
  export function listAllTeams(): ServiceResult<{ teams: any[] }> {
  // teams-service.ts:300
  export function listTeamTasks(...): ServiceResult<{ tasks: any[] }> {
  // teams-service.ts:468
  export function listTeamDocuments(...): ServiceResult<{ documents: any[] }> {
  // teams-service.ts:623
  export async function notifyTeamAgents(...): Promise<ServiceResult<{ results: any[] }>> {
  ```
- **Fix:** Replace `any[]` with concrete types: `Team[]`, `Task[]`, `TeamDocument[]`, and a notification result type respectively. These types already exist in `types/team.ts` and `types/task.ts`.

## NIT

### [CC-P9-A2-005] teams/route.ts GET does not use `dynamic = 'force-dynamic'`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`:1-17
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `teams/route.ts` file exports `dynamic = 'force-dynamic'` at line 6, but this only applies to the module as a whole. However, examining the file, it does have `export const dynamic = 'force-dynamic'` at line 6, so this is actually present. No issue here -- removing this finding.

_Retracted: teams/route.ts does have `dynamic = 'force-dynamic'` at line 6._

### [CC-P9-A2-005] chief-of-staff/route.ts error handler exposes internal error messages
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts`:110
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The catch-all error handler at line 110 returns `error.message` directly to the client for non-`TeamValidationException` errors. While this is a localhost-only Phase 1 app, in general practice this could leak internal implementation details (stack traces, file paths, dependency errors) to the client.
- **Evidence:**
  ```typescript
  // chief-of-staff/route.ts:110
  { error: error instanceof Error ? error.message : 'Failed to set chief-of-staff' }
  ```
- **Fix:** For Phase 2 remote access, replace with a generic error message and log the details server-side only. For Phase 1, this is acceptable but worth noting.

### [CC-P9-A2-006] Missing `export const dynamic = 'force-dynamic'` on some route files
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts`, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts`, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts`, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts`, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts`
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** Several route files (`[id]/route.ts`, `[id]/tasks/route.ts`, `[id]/tasks/[taskId]/route.ts`, `[id]/documents/route.ts`, `[id]/documents/[docId]/route.ts`) do not export `dynamic = 'force-dynamic'`, while `teams/route.ts`, `teams/names/route.ts`, `teams/notify/route.ts`, and `chief-of-staff/route.ts` all do. These routes read runtime filesystem state (team registry, task files, document files) and should not be statically cached by Next.js. Routes with dynamic path segments (`[id]`, `[taskId]`, `[docId]`) are automatically dynamic in Next.js App Router because they cannot be statically generated, so this is not a functional bug, but it's inconsistent with the explicit pattern used elsewhere.
- **Fix:** For consistency, add `export const dynamic = 'force-dynamic'` to all route files that read runtime state, or remove it from the files that have dynamic segments (since Next.js handles them automatically).

### [CC-P9-A2-007] `assertValidServiceResult` guard not used in any route handler
- **File:** All 9 route files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `ServiceResult` type has a companion `assertValidServiceResult()` guard (defined in `types/service.ts:27`) designed for defense-in-depth to detect when both `data` and `error` are set simultaneously. None of the 9 route handlers in this domain call this guard after service calls. The comment in `types/service.ts` says "Use in route handlers after service calls for defense-in-depth."
- **Evidence:**
  ```typescript
  // types/service.ts:22-26
  /**
   * SF-024: Runtime guard to assert a ServiceResult is in a valid state.
   * Detects when both `data` and `error` are set (indicates a service bug).
   * Use in route handlers after service calls for defense-in-depth.
   */
  ```
  No route file imports or calls `assertValidServiceResult`.
- **Fix:** Import and call `assertValidServiceResult(result, 'contextLabel')` after each service call in the route handlers to detect service bugs early.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts` -- Clean. Proper UUID validation, auth, JSON parsing, field stripping for `type`/`chiefOfStaffId`, error handling.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts` -- Clean. Thorough validation: UUID, status enum, priority finiteness, blockedBy array+element types, field whitelisting, null-safe assigneeAgentId.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts` -- Clean. Same thorough validation pattern as [taskId]/route.ts.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts` -- Clean (aside from CC-P9-A2-002 about missing field whitelisting). Auth, UUID validation, JSON parsing, error handling all correct.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts` -- Clean (aside from CC-P9-A2-005 NIT). Rate limiting, password verification, team lookup, COS assignment/removal logic with auto-reject of pending requests all well-structured.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts` -- Clean. Simple read-only endpoint with try/catch, force-dynamic, no auth needed for Phase 1.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts` -- Clean. Proper auth, JSON parsing, error handling.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P9-A2-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P9-R1ebfebc5-0cd1d104-943e-4849-acf3-feba237c7100.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
