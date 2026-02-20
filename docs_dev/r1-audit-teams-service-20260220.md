# Code Correctness Report: teams-service

**Agent:** epcp-code-correctness-agent
**Domain:** services/teams-service.ts
**Files audited:** 1 (plus 4 dependency files for contract verification)
**Date:** 2026-02-20T16:15:00Z

## Verification of Claimed Fixes

### Fix 1: Removed `if (requestingAgentId)` guard -- now always calls checkTeamAccess()
**Status: CONFIRMED**
All 12 call sites to `checkTeamAccess()` are unconditional (no if-guard). Verified at lines: 184, 211, 251, 290, 313, 364, 429, 458, 480, 518, 549, 585. The comment on each call site explicitly documents: "Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)".

### Fix 2: Defensive stripping of type/chiefOfStaffId in updateTeamById
**Status: CONFIRMED**
Line 207: `const { requestingAgentId, type: _type, chiefOfStaffId: _cos, ...updateFields } = params`
The `updateFields` rest object will contain only: `name?, description?, agentIds?, lastMeetingAt?, instructions?, lastActivityAt?`. The `type` and `chiefOfStaffId` fields are aliased to `_type` and `_cos` (unused), preventing them from reaching `updateTeam()`. TypeScript's structural typing confirms this -- `updateFields` is a strict subset of what `updateTeam` accepts.

### Fix 3: isValidUuid(id) check added to updateTeamById and deleteTeamById
**Status: CONFIRMED**
- `getTeamById` line 173: `if (!isValidUuid(id))`
- `updateTeamById` line 199: `if (!isValidUuid(id))`
- `deleteTeamById` line 240: `if (!isValidUuid(id))`
All three team-level ID-based functions have consistent UUID validation.

### Fix 4: listAllTeams returns all teams (documented as Phase 1 intentional)
**Status: CONFIRMED**
Line 121-124: `listAllTeams()` calls `loadTeams()` and returns all teams with no ACL filtering. This is a synchronous function with no `requestingAgentId` parameter, consistent with Phase 1 localhost-only design.

## ACL Check Ordering Verification

All write paths perform ACL check BEFORE any mutation:

| Function | Order | Correct |
|----------|-------|---------|
| updateTeamById | destructure -> ACL -> updateTeam | YES |
| deleteTeamById | getTeam -> ACL -> closed-team extra check -> deleteTeam | YES |
| createTeamTask | getTeam -> destructure -> ACL -> createTask | YES |
| updateTeamTask | getTeam -> destructure -> ACL -> getTask -> updateTask | YES |
| deleteTeamTask | getTeam -> ACL -> deleteTask | YES |
| createTeamDocument | getTeam -> destructure -> ACL -> createDocument | YES |
| updateTeamDocument | getTeam -> destructure -> ACL -> updateDocument | YES |
| deleteTeamDocument | getTeam -> ACL -> deleteDocument | YES |

## MUST-FIX

No must-fix issues found.

## SHOULD-FIX

### [CC-001] `as any` type assertion bypasses type safety in updateTeamDocument
- **File:** /Users/emanuelesabetta/ai-maestro/services/teams-service.ts:561
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `updates as any` cast at line 561 silences type checking between the `Record<string, unknown>` built at lines 555-559 and the `Partial<Pick<TeamDocument, ...>>` expected by `updateDocument()`. If a future developer adds a field with the wrong type to the `updates` object, the compiler will not catch it.
- **Evidence:**
  ```typescript
  // Line 555-559: builds Record<string, unknown>
  const updates: Record<string, unknown> = {}
  if (docFields.title !== undefined) updates.title = docFields.title
  if (docFields.content !== undefined) updates.content = docFields.content
  if (docFields.pinned !== undefined) updates.pinned = docFields.pinned
  if (docFields.tags !== undefined) updates.tags = docFields.tags
  // Line 561: cast to any
  const document = await updateDocument(teamId, docId, updates as any)
  ```
- **Fix:** Use a properly typed object instead of `Record<string, unknown>`:
  ```typescript
  const updates: Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>> = {}
  ```
  Or simply pass `docFields` directly (it already has the correct shape from destructuring).

### [CC-002] Non-unique messageId in notifyTeamAgents across concurrent agents
- **File:** /Users/emanuelesabetta/ai-maestro/services/teams-service.ts:632
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `messageId: \`meeting-${Date.now()}\`` is generated inside a `Promise.all()` map callback (line 618). Since `Promise.all` launches all promises concurrently, multiple agents will receive messages with the same (or near-identical) `Date.now()` value, producing duplicate messageIds. If any downstream system uses messageId for deduplication or idempotency, this will cause message loss.
- **Evidence:**
  ```typescript
  // Line 617-632
  const results = await Promise.all(
    agentIds.map(async (agentId: string) => {
      // ...
      const result = await notifyAgent({
        // ...
        messageId: `meeting-${Date.now()}`, // Same timestamp for all agents in batch
      })
    })
  )
  ```
- **Fix:** Include the agentId in the messageId to guarantee uniqueness:
  ```typescript
  messageId: `meeting-${Date.now()}-${agentId}`,
  ```

## NIT

### [CC-003] Missing UUID validation on taskId and docId parameters
- **File:** /Users/emanuelesabetta/ai-maestro/services/teams-service.ts (lines 353, 421, 510, 537, 577)
- **Severity:** NIT
- **Category:** security (defense-in-depth)
- **Confidence:** CONFIRMED (no path traversal risk -- IDs are used as array lookup keys, not file paths)
- **Description:** `taskId` and `docId` parameters are not validated with `isValidUuid()` at the service layer. While not exploitable (these IDs are used for `Array.find()` lookups, not file path construction), adding validation would be consistent with the pattern used for team IDs and catch invalid input earlier.
- **Fix:** Add `isValidUuid(taskId)` / `isValidUuid(docId)` checks at the top of each function that receives these parameters, consistent with the pattern in getTeamById/updateTeamById/deleteTeamById.

### [CC-004] Missing UUID validation on teamId in task/document sub-resource functions
- **File:** /Users/emanuelesabetta/ai-maestro/services/teams-service.ts (lines 282, 304, 351, 421, 450, 471, 510, 535, 577)
- **Severity:** NIT
- **Category:** security (defense-in-depth)
- **Confidence:** CONFIRMED (mitigated by downstream UUID validation in task-registry.ts:27 and document-registry.ts:25-26)
- **Description:** The sub-resource functions (listTeamTasks, createTeamTask, etc.) do not validate `teamId` format with `isValidUuid()` at the service layer. The underlying registries DO validate UUID format in their file path functions (task-registry.ts:27, document-registry.ts:25-26), so invalid teamIds will throw errors caught by try/catch blocks. However, the error messages from those throws would be generic ("Invalid team ID") rather than the 400 status the service layer returns.
- **Fix:** For consistency, add `isValidUuid(teamId)` at the top of each sub-resource function, matching the pattern in getTeamById/updateTeamById/deleteTeamById.

### [CC-005] notifyTeamAgents has no ACL check
- **File:** /Users/emanuelesabetta/ai-maestro/services/teams-service.ts:605-647
- **Severity:** NIT
- **Category:** security (design)
- **Confidence:** CONFIRMED (by design -- Phase 1 localhost-only, notifications are informational)
- **Description:** `notifyTeamAgents()` accepts arbitrary agentIds and teamName without any ACL check. Any caller can trigger notifications for any agent. This is acceptable in Phase 1 (localhost-only) but should be revisited in Phase 2 with remote access.
- **Fix:** Document this as a Phase 2 TODO, or add a check that the requesting caller has access to the team being notified about.

### [CC-006] Inconsistent use of `any` return types
- **File:** /Users/emanuelesabetta/ai-maestro/services/teams-service.ts (multiple)
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** All ServiceResult generics use `any` for team/task/document payloads: `ServiceResult<{ team: any }>`, `ServiceResult<{ task: any }>`, `ServiceResult<{ document: any }>`, `ServiceResult<{ tasks: any[] }>`, etc. This erases type information at the service boundary. Since `Team`, `Task`, and `TeamDocument` types exist in the registries, using them would provide compile-time guarantees.
- **Fix:** Import `Team`, `Task`, `TeamDocument` types and use them in ServiceResult generics. E.g., `ServiceResult<{ team: Team }>`.

## CLEAN

Functions with no issues found:
- `listAllTeams()` -- Simple, correct, intentionally unfiltered for Phase 1
- `createNewTeam()` -- Proper validation, governance context passed correctly, try/catch with TeamValidationException handling
- `getTeamById()` -- UUID validation, team existence check, unconditional ACL, correct order
- `updateTeamById()` -- UUID validation, defensive destructuring strips type/COS, unconditional ACL before mutation, governance context passed
- `deleteTeamById()` -- UUID validation, team existence check, unconditional ACL, extra closed-team authority check, correct order
- `listTeamTasks()` -- Team existence check, unconditional ACL, correct task resolution
- `createTeamTask()` -- Team existence check, destructuring extracts requestingAgentId, unconditional ACL before mutation, input validation (subject, blockedBy)
- `updateTeamTask()` -- Team existence check, destructuring, unconditional ACL, task existence check, cycle detection, status enum validation, all before mutation
- `deleteTeamTask()` -- Team existence check, unconditional ACL before mutation
- `listTeamDocuments()` -- Team existence check, unconditional ACL
- `createTeamDocument()` -- Team existence check, destructuring, unconditional ACL, title validation
- `getTeamDocument()` -- Team existence check, unconditional ACL, document existence check
- `deleteTeamDocument()` -- Team existence check, unconditional ACL before mutation

## Async/Await Verification

All 9 async functions properly await their registry calls:
- `createNewTeam` awaits `createTeam` (line 151)
- `updateTeamById` awaits `updateTeam` (line 219)
- `deleteTeamById` awaits `deleteTeam` (line 267)
- `createTeamTask` awaits `createTask` (line 332)
- `updateTeamTask` awaits `updateTask` (line 397)
- `deleteTeamTask` awaits `deleteTask` (line 434)
- `createTeamDocument` awaits `createDocument` (line 492)
- `updateTeamDocument` awaits `updateDocument` (line 561)
- `deleteTeamDocument` awaits `deleteDocument` (line 590)
- `notifyTeamAgents` awaits `Promise.all` (line 617)

No floating promises found.

## Security: requestingAgentId=undefined Bypass Analysis

**Finding: By design, not a vulnerability in Phase 1.**

When `requestingAgentId` is `undefined`, `checkTeamAccess()` returns `{ allowed: true }` at line 42 of team-acl.ts. This means:
- Web UI requests (no X-Agent-Id header) bypass all ACL checks
- This is documented and intentional for Phase 1 (localhost-only)
- The `deleteTeamById` function has an additional guard: closed team deletion REQUIRES `requestingAgentId` (line 258), so even web UI cannot delete closed teams without providing agent identity

The only concern: `updateTeamById` with `requestingAgentId=undefined` on a closed team will pass ACL (web UI allowed) and proceed with the update. This is consistent with the Phase 1 design where the web UI is fully trusted.

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 0 |
| SHOULD-FIX | 2 |
| NIT | 4 |
| CLEAN | 13 functions |

All 4 claimed fixes verified as correctly applied. No regressions introduced.
