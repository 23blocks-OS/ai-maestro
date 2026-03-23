# Code Correctness Report: api-teams

**Agent:** epcp-code-correctness-agent
**Domain:** api-teams
**Files audited:** 9
**Date:** 2026-02-23T02:29:00Z
**Pass:** 8
**Run ID:** 57d244f7
**Finding ID Prefix:** CC-P8-A2

## MUST-FIX

(none)

## SHOULD-FIX

### [CC-P8-A2-001] blockedBy array elements not validated as strings at route level
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts`:65-73
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The route validates that `body.blockedBy` is an array (`Array.isArray`) but does not validate that each element is a string. The value is then passed directly into `CreateTaskParams` which declares `blockedBy?: string[]`. A client could send `blockedBy: [123, null, {}]` and it would pass route-level validation. The service layer (`createTeamTask` at teams-service.ts:323) does perform per-element validation, so this is not a runtime bug -- but it violates defense-in-depth at the route level and creates a type-safety gap where `unknown[]` is assigned to `string[]`.
- **Evidence:**
  ```typescript
  // tasks/route.ts line 65-73
  if (body.blockedBy !== undefined && !Array.isArray(body.blockedBy)) {
    return NextResponse.json({ error: 'blockedBy must be an array of strings' }, { status: 400 })
  }
  // ...
  ...(body.blockedBy !== undefined && { blockedBy: body.blockedBy }),  // unknown[] -> string[]
  ```
- **Fix:** Add element validation: `if (body.blockedBy !== undefined && (!Array.isArray(body.blockedBy) || !body.blockedBy.every((v: unknown) => typeof v === 'string')))`. Same issue exists in `[taskId]/route.ts`:46-57.

### [CC-P8-A2-002] blockedBy array elements not validated as strings at task update route level
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts`:46-57
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P8-A2-001 but in the PUT task update route. The route validates `Array.isArray(body.blockedBy)` but not that elements are strings. The service layer (`updateTeamTask` at teams-service.ts:376) validates individual elements, so runtime safety is preserved. But the route-level type contract is violated.
- **Evidence:**
  ```typescript
  // [taskId]/route.ts line 46-57
  if (body.blockedBy !== undefined && !Array.isArray(body.blockedBy)) {
    return NextResponse.json({ error: 'blockedBy must be an array of strings' }, { status: 400 })
  }
  // ...
  ...(body.blockedBy !== undefined && { blockedBy: body.blockedBy }),  // unknown[] -> string[]
  ```
- **Fix:** Add element validation matching CC-P8-A2-001 fix.

### [CC-P8-A2-003] String(null) converts null assigneeAgentId to literal "null" string
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts`:72
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The route whitelist converts `body.assigneeAgentId` via `String()`. If a client sends `assigneeAgentId: null` (a valid JSON value to unassign), `String(null)` produces the literal string `"null"`, which would be stored as an assignee ID. The task-registry then tries to resolve this as an agent ID and fails silently (no agent with id `"null"` exists), resulting in an unresolved assignee rather than a clear null/unassigned state.
- **Evidence:**
  ```typescript
  // tasks/route.ts line 72
  ...(body.assigneeAgentId !== undefined && { assigneeAgentId: String(body.assigneeAgentId) }),
  ```
- **Fix:** Handle null explicitly: `...(body.assigneeAgentId !== undefined && { assigneeAgentId: body.assigneeAgentId === null ? null : String(body.assigneeAgentId) })`. Same applies to `[taskId]/route.ts` line 56. Also check that `CreateTaskParams` and `UpdateTaskParams` accept `string | null` for `assigneeAgentId`.

### [CC-P8-A2-004] String(null) converts null assigneeAgentId to literal "null" string in task update route
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts`:56
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P8-A2-003 but in the PUT task update route. `String(body.assigneeAgentId)` when `body.assigneeAgentId` is `null` produces `"null"` string.
- **Evidence:**
  ```typescript
  // [taskId]/route.ts line 56
  ...(body.assigneeAgentId !== undefined && { assigneeAgentId: String(body.assigneeAgentId) }),
  ```
- **Fix:** Same as CC-P8-A2-003.

## NIT

### [CC-P8-A2-005] Unused requestingAgentId passed to notifyTeamAgents
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts`:22
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The notify route spreads `requestingAgentId: auth.agentId` into the params object, but `NotifyTeamParams` only defines `agentIds` and `teamName`. The extra property is silently ignored by the service function. This is not a bug (TypeScript allows extra properties in spread), but it is misleading -- it suggests the service uses the agent identity when it does not.
- **Evidence:**
  ```typescript
  // notify/route.ts line 22
  const result = await notifyTeamAgents({ ...body, requestingAgentId: auth.agentId })
  // NotifyTeamParams = { agentIds: string[]; teamName: string } -- no requestingAgentId
  ```
- **Fix:** Either remove the spread of `requestingAgentId`, or add `requestingAgentId?: string` to `NotifyTeamParams` and use it for audit logging.

### [CC-P8-A2-006] Deprecated recordFailure alias used instead of recordAttempt
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts`:5,42
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The chief-of-staff route imports and uses `recordFailure` from `@/lib/rate-limit`, which is a deprecated alias for `recordAttempt` (see rate-limit.ts:73-74). While functional, it should use the non-deprecated name.
- **Evidence:**
  ```typescript
  // chief-of-staff/route.ts line 5
  import { checkRateLimit, recordFailure, resetRateLimit } from '@/lib/rate-limit'
  // line 42
  recordFailure(rateLimitKey)
  // rate-limit.ts line 73-74
  /** @deprecated Use recordAttempt instead. Alias kept for backward compatibility. */
  export const recordFailure = recordAttempt
  ```
- **Fix:** Change import and usage from `recordFailure` to `recordAttempt`.

### [CC-P8-A2-007] Missing `export const dynamic = 'force-dynamic'` on chief-of-staff, notify routes
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts`, `/Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts`
- **Severity:** NIT
- **Category:** logic
- **Confidence:** POSSIBLE
- **Description:** These routes only export POST handlers, so Next.js treats them as dynamic by default (POST is not statically optimizable). Therefore `force-dynamic` is not strictly required. However, for consistency with the project convention (both `teams/route.ts` and `teams/names/route.ts` explicitly set it), it may be worth adding. The `[id]` segment routes are also correctly dynamic by virtue of their dynamic path segment.
- **Fix:** Consider adding `export const dynamic = 'force-dynamic'` for consistency, or document the convention that only GET-only routes without dynamic segments need it.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts` -- No issues. Auth on POST, no auth on GET (intentional Phase 1), proper JSON parse error handling, correct await on async service call.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts` -- No issues. UUID validation, auth, defense-in-depth stripping of `type`/`chiefOfStaffId` from PUT body, proper error handling on all 3 methods.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts` -- No issues. UUID validation, auth, JSON parse handling, correct async/sync patterns.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts` -- No issues. Dual UUID validation (id + docId), auth on all methods, proper error/status propagation.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts` -- No issues. Try/catch, force-dynamic, no auth (intentional Phase 1).

## Test Coverage Notes

- No test files were found in this domain for the API route handlers. All business logic is delegated to `services/teams-service.ts` which may be tested separately (outside this domain's scope).
- The chief-of-staff route has complex conditional logic (null COS removal, COS assignment, auto-rejection of pending governance requests) that would benefit from integration tests.
- The rate-limiting flow in chief-of-staff/route.ts (check -> verify -> record/reset) should have tests covering: rate limit hit, successful auth resets counter, failed auth increments counter.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P8-A2-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P8-R57d244f7-42ea92e3-72c8-4821-ab5a-df63082fc80e.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
