# Code Correctness Report: teams-service

**Agent:** epcp-code-correctness-agent
**Domain:** teams-service + API routes
**Files audited:** 8
**Date:** 2026-02-20T00:00:00Z

## MUST-FIX

### [CC-001] Document routes bypass governance ACL -- no requestingAgentId passed
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts`:6,19,39
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The GET, PUT, and DELETE handlers in `[docId]/route.ts` never extract `X-Agent-Id` from the request headers and never pass `requestingAgentId` to the service functions. This means all three operations on individual documents completely bypass the governance ACL for closed teams. Any agent (or any local process) can read, modify, or delete documents in a closed team.
- **Evidence:**
  - GET (line 6): `_request: NextRequest` -- request is unused, `getTeamDocument(id, docId)` called with only 2 args
  - PUT (line 24): No `request.headers.get('X-Agent-Id')` call. `body` is passed directly to `updateTeamDocument(id, docId, body)` without a `requestingAgentId` field
  - DELETE (line 39): `_request: NextRequest` -- request is unused, `deleteTeamDocument(id, docId)` called with only 2 args
- **Fix:** Extract `requestingAgentId` from request headers in all three handlers (matching the pattern used in every other route file). Pass it to the service function calls. For PUT, spread it into the params object. For GET and DELETE, pass as the 3rd argument.

### [CC-002] createTeam ignores `sanitized.type` auto-downgrade from validateTeamMutation
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:272-282
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `validateTeamMutation` auto-downgrades a closed team to open (because COS is null per the COS-closed invariant R1.3/R1.4 at line 130-131), it sets `sanitized.type = 'open'`. However, `createTeam` at line 278 uses `data.type ?? 'open'` and never checks `result.sanitized.type`. This means a team created with `type: 'closed'` and no `chiefOfStaffId` will be stored as `closed` instead of being auto-downgraded to `open`, violating the COS-closed invariant.
- **Evidence:**
  ```typescript
  // line 278 in createTeam -- does NOT use result.sanitized.type
  type: data.type ?? 'open',

  // Compare with updateTeam line 333-337 which DOES apply sanitized overrides:
  const finalUpdates = { ...updates, ...result.sanitized }
  teams[index] = { ...teams[index], ...finalUpdates, updatedAt: ... }
  ```
- **Fix:** In `createTeam`, apply `result.sanitized.type` and `result.sanitized.chiefOfStaffId` the same way `name` and `agentIds` are applied. Consistent pattern:
  ```typescript
  type: (result.sanitized.type as TeamType) ?? data.type ?? 'open',
  chiefOfStaffId: result.sanitized.chiefOfStaffId !== undefined
    ? (result.sanitized.chiefOfStaffId as string | undefined)
    : data.chiefOfStaffId,
  ```

## SHOULD-FIX

### [CC-003] ACL pattern is inverted: no requestingAgentId = full access to closed teams
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:183-188 (and lines 204, 272, 296, 348, 414, 444, 467, 506, 538, 575)
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The ACL check pattern throughout teams-service.ts is `if (requestingAgentId) { checkAccess... }`. This means if no `X-Agent-Id` header is sent, ALL checks are skipped. While this is documented as intentional for Phase 1 (web UI has no agent identity), it creates a trivial bypass: any curl request that omits the `X-Agent-Id` header gets full access to closed teams. The `team-acl.ts` already handles this case (line 42: `if (input.requestingAgentId === undefined) return { allowed: true }`), so the service-level guard is redundant but masks the security surface.
- **Fix:** Remove the `if (requestingAgentId)` guard in the service layer and always call `checkTeamAccess()`. The ACL module already returns `allowed: true` for undefined requestingAgentId. This removes the redundant bypass point and centralizes the policy decision. When Phase 2 adds authentication, only team-acl.ts needs updating.

### [CC-004] `listAllTeams` returns all teams including closed teams regardless of requester
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:121-124
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `listAllTeams()` takes no `requestingAgentId` parameter and returns every team unconditionally. A non-member agent can discover the existence and metadata (name, description, member list) of all closed teams. The route at `/api/teams/route.ts` line 7 passes no agent identity. This may be intentional for Phase 1 (sidebar needs to list all teams), but leaks closed team metadata that the per-team ACL is designed to protect.
- **Fix:** Accept `requestingAgentId` parameter and filter closed teams where the requester is not a member/COS/manager. Or, return a subset of fields (id, name, type) for closed teams the requester cannot access.

### [CC-005] Sync/async mismatch: `listAllTeams` is sync but route awaits nothing (harmless, but inconsistent)
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`:7
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `listAllTeams()` is synchronous (returns `ServiceResult`), but the route handler's `GET` function is marked `async` (line 6). This is not a bug (async functions that don't await anything still work), but creates an inconsistency with the pattern where all other service calls are awaited. More critically, `getTeamById()` and `listTeamTasks()` and `listTeamDocuments()` are also synchronous but their routes don't await them -- this is correct. However, `getTeamDocument()` (line 499 in the service) is synchronous, and the route at `[docId]/route.ts` line 10 correctly does not await it. All consistent, just worth documenting the sync vs. async map.
- **Fix:** No code change needed, but document which service functions are sync vs async to prevent future confusion. The current split is: sync = list/get operations, async = create/update/delete (because they use `withLock`).

### [CC-006] `as any` type cast in task route handlers
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts`:35
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts`:19
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Both task route files use `as any` to cast the spread body into the service parameter type. This disables TypeScript's type checking on the request body structure. Any misspelled or extra fields will pass through unchecked.
- **Evidence:**
  ```typescript
  // route.ts:35
  const result = await createTeamTask(id, { ...body, requestingAgentId } as any)
  // [taskId]/route.ts:19
  const result = await updateTeamTask(id, taskId, { ...body, requestingAgentId } as any)
  ```
- **Fix:** Type the body properly or use type-safe destructuring of known fields from the body before passing to the service (matching the pattern used in teams/route.ts for createNewTeam).

### [CC-007] updateTeamById passes `type` and `chiefOfStaffId` through despite route stripping them
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts`:35-36 and `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:198,201,214
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The PUT route at line 35 strips `type` and `chiefOfStaffId` from the body to prevent unauthorized governance mutations through the general update endpoint. However, `UpdateTeamParams` (service line 56-66) still includes `type?: TeamType` and `chiefOfStaffId?: string | null` in its interface, and `updateTeamById` destructures `requestingAgentId` out but passes the full remaining `updateFields` (which could include `type` and `chiefOfStaffId` from other callers) to `updateTeam`. The route-level stripping is correct, but any future caller of `updateTeamById` that doesn't strip these fields would bypass the governance restriction.
- **Fix:** Either remove `type` and `chiefOfStaffId` from `UpdateTeamParams` (forcing all governance changes through dedicated endpoints), or add defensive stripping inside `updateTeamById` itself rather than relying on callers.

## NIT

### [CC-008] `getTeamById` does not validate UUID format before calling `getTeam` but `updateTeamById` and `deleteTeamById` do not either
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:173 vs 198, 233
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `getTeamById` validates UUID format at line 173, but `updateTeamById` and `deleteTeamById` do not perform the same validation. While the underlying `loadTeams()`/`getTeam()` would not find a match for invalid IDs (preventing data corruption), the inconsistency means some endpoints return 400 for bad IDs while others return 404, which is a minor API inconsistency.
- **Fix:** Add `isValidUuid(id)` check to `updateTeamById` and `deleteTeamById` for consistency.

### [CC-009] `saveTeams` in team-registry.ts does NOT use atomic write pattern
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:240-250
- **Severity:** NIT
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `saveTeams` uses `fs.writeFileSync` directly, unlike `saveGovernance` (governance.ts:66-68) which uses the atomic temp-file-then-rename pattern. A crash during write could leave a corrupted teams.json file.
- **Fix:** Use the same atomic write pattern: write to `.tmp`, then `fs.renameSync`.

### [CC-010] Redundant `await` on `createTeam` in service -- withLock returns Promise but the service already awaits
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:151
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `createTeam` in team-registry returns `withLock(...)` which returns a Promise. The service layer `await`s it at line 151. This is correct. No issue here -- noting for documentation that the await is necessary.
- **Fix:** No fix needed. This is correct behavior.

### [CC-011] `notifyTeamAgents` references `agent.hostId` which may not exist on the Agent type
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:621
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** LIKELY (would need to check the Agent type definition)
- **Description:** `agent.hostId` is used on line 621 when constructing the notification options. If the Agent type does not have a `hostId` field (or if it's named differently, e.g., `host`), this would be `undefined` at runtime, which is handled by the optional `agentHost?` in NotificationOptions, so it's not a crash risk, but could silently skip remote agent notifications.
- **Fix:** Verify the Agent type has `hostId`. If the field is named differently, fix the property access.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts` -- No issues beyond CC-006
- `/Users/emanuelesabetta/ai-maestro/lib/validation.ts` -- Clean, simple UUID regex
- `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` -- Clean, well-documented ACL logic
- `/Users/emanuelesabetta/ai-maestro/lib/document-registry.ts` -- Clean, path traversal protection in place
