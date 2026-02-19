# Code Correctness Report: api-teams

**Agent:** epcp-code-correctness-agent
**Domain:** api-teams
**Files audited:** 6
**Date:** 2026-02-16T00:00:00Z

## MUST-FIX

### [CC-001] Path traversal via unsanitized teamId in task file paths
- **File:** /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:24 (called from app/api/teams/[id]/tasks/route.ts and app/api/teams/[id]/tasks/[taskId]/route.ts)
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `teamId` parameter is interpolated directly into a file path without any sanitization. While the `id` comes from the URL path parameter (Next.js dynamic route `[id]`), a crafted request to `/api/teams/../../etc/passwd/tasks` would produce a path like `~/.aimaestro/teams/tasks-../../etc/passwd.json`. The `getTeam(id)` check (which loads from the teams registry, not the filesystem) would return `null` and the route would 404 before reaching `loadTasks`/`saveTasks` — **BUT** this safety depends entirely on `getTeam` rejecting the ID. If team IDs were ever user-controlled strings (not UUIDs), or if a code path bypassed the `getTeam` check, files outside the teams directory could be read or written.
- **Evidence:**
  ```typescript
  // task-registry.ts:23-25
  function tasksFilePath(teamId: string): string {
    return path.join(TEAMS_DIR, `tasks-${teamId}.json`)
  }
  ```
  The API routes do call `getTeam(id)` first (which validates the ID exists as a UUID in teams.json), so this is currently protected by defense-in-depth. However, the `tasksFilePath` function itself is unsafe and could be misused by future callers.
- **Fix:** Validate that `teamId` matches a UUID pattern (`/^[0-9a-f-]{36}$/i`) in `tasksFilePath`, or use `path.basename()` to strip directory traversal characters: `path.join(TEAMS_DIR, \`tasks-${path.basename(teamId)}.json\`)`.

### [CC-002] DELETE /api/teams/[id] does not clean up associated task files
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts:71 and /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:302-310
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a team is deleted via `DELETE /api/teams/[id]`, the `deleteTeam` function in team-registry.ts only removes the team from `teams.json`. The corresponding task file (`tasks-{teamId}.json`) is never deleted, leading to orphaned files accumulating on disk. There is no garbage collection mechanism.
- **Evidence:**
  ```typescript
  // team-registry.ts:302-310
  export async function deleteTeam(id: string): Promise<boolean> {
    return withLock('teams', () => {
      const teams = loadTeams()
      const filtered = teams.filter(t => t.id !== id)
      if (filtered.length === teams.length) return false
      saveTeams(filtered)
      return true
    })
  }
  ```
  No call to `fs.unlinkSync(tasksFilePath(id))` or similar cleanup.
- **Fix:** In `deleteTeam`, after removing from `teams.json`, also delete the tasks file if it exists: `const taskFile = path.join(TEAMS_DIR, \`tasks-${id}.json\`); if (fs.existsSync(taskFile)) fs.unlinkSync(taskFile);`

## SHOULD-FIX

### [CC-003] POST /api/teams/[id]/chief-of-staff does not check team access (ACL bypass)
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts:6-65
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** All other team endpoints (`GET/PUT/DELETE /api/teams/[id]`, `GET/POST /api/teams/[id]/tasks`, `PUT/DELETE /api/teams/[id]/tasks/[taskId]`) call `checkTeamAccess()` to verify the requesting agent has permission. The chief-of-staff endpoint skips ACL entirely. It does require the governance password, which is a stronger form of authentication, but the inconsistency means any agent who obtains the password can modify COS assignments on teams they have no access to. For a closed team, this breaks the isolation model.
- **Evidence:**
  ```typescript
  // chief-of-staff/route.ts — no checkTeamAccess call anywhere
  export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    // ...password check...
    // ...no ACL check...
    const updated = await updateTeam(id, { chiefOfStaffId: agentId, type: 'closed', agentIds: newAgentIds }, managerId)
  ```
  Compare with `PUT /api/teams/[id]`:
  ```typescript
  const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })
  if (!access.allowed) { return NextResponse.json({ error: access.reason }, { status: 403 }) }
  ```
- **Fix:** Add `checkTeamAccess` call, or document explicitly why password-only is intentional for this endpoint (e.g., "password is a superset of ACL — only managers know the password").

### [CC-004] GET /api/teams lists all teams without ACL filtering
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts:8-11
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `GET /api/teams` returns all teams regardless of the requester's identity. An agent not in a closed team can still see its name, description, member list, and all metadata. While `GET /api/teams/[id]` has ACL checks, the list endpoint leaks everything. This undermines closed-team isolation.
- **Evidence:**
  ```typescript
  export async function GET() {
    const teams = loadTeams()
    return NextResponse.json({ teams })
  }
  ```
  No `X-Agent-Id` header check, no `checkTeamAccess` filtering.
- **Fix:** Either filter the response to exclude closed teams that the requester isn't a member of, or redact sensitive fields (members, instructions) for non-member closed teams.

### [CC-005] GET /api/teams/names leaks all team and agent names without ACL
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts:9-16
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** This endpoint returns every team name and every agent name in the system. It's intended for collision checking in the "Create Team" dialog, but any requester (including non-member agents of closed teams) gets the full list. This leaks the membership structure indirectly (agent names reveal who exists in the system).
- **Evidence:**
  ```typescript
  export async function GET() {
    const teams = loadTeams()
    const agents = loadAgents()
    return NextResponse.json({
      teamNames: teams.map(t => t.name),
      agentNames: agents.map(a => a.name).filter(Boolean),
    })
  }
  ```
- **Fix:** This may be acceptable for Phase 1 (localhost-only), but should be documented as a known information leak for when remote access is added.

### [CC-006] Race condition: double-read of teams in chief-of-staff endpoint
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts:28-52
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The COS endpoint reads the team at line 28 (`getTeam(id)`) to check existence and build `newAgentIds`, then calls `updateTeam` which acquires the lock and reads the team again inside `withLock`. Between the first read and the lock acquisition, another request could modify the team's `agentIds`. The `newAgentIds` computed on line 51 is based on stale data.
- **Evidence:**
  ```typescript
  // Line 28: Read OUTSIDE the lock
  const team = getTeam(id)
  // ...
  // Line 51: Use stale team.agentIds to compute newAgentIds
  const newAgentIds = team.agentIds.includes(agentId) ? team.agentIds : [...team.agentIds, agentId]
  // Line 52: Pass to updateTeam which reads again INSIDE the lock
  const updated = await updateTeam(id, { chiefOfStaffId: agentId, type: 'closed', agentIds: newAgentIds }, managerId)
  ```
  If a concurrent request adds/removes an agent between lines 28 and 52, those changes are lost because `newAgentIds` overwrites the entire `agentIds` array.
- **Fix:** Move the `agentIds` computation inside `updateTeam` (or into `validateTeamMutation`'s sanitization logic, where R4.6 already auto-adds COS). Actually, R4.6 in `validateTeamMutation` (team-registry.ts:136-141) already handles auto-adding COS to agentIds. The route should not compute `newAgentIds` manually — just pass `{ chiefOfStaffId: agentId, type: 'closed' }` and let the validator handle it.

### [CC-007] `updateTeam` return type mismatch — `null` returned but route double-checks
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts:41-44
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `PUT /api/teams/[id]` route checks `if (!team)` after `updateTeam`, but `updateTeam` is declared as `Promise<Team | null>`. The route already validates team existence via `checkTeamAccess` (which calls `getTeam` internally at team-acl.ts:42). However, a team could be deleted between the ACL check and the `updateTeam` call (TOCTOU race). The `updateTeam` lock protects against concurrent writes but the team could be deleted by another request between the two calls. The null check on line 42 is therefore correct defense, but the race window exists.
- **Evidence:**
  ```typescript
  // Line 32-35: ACL check (reads team)
  const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })
  // ... team could be deleted here by another request ...
  // Line 41: updateTeam may return null
  const team = await updateTeam(id, { ... }, managerId)
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  ```
- **Fix:** This is acceptable as-is (the null check is correct), but be aware the ACL check reads stale data. Consider moving ACL into the `withLock` block for stronger consistency.

### [CC-008] Task creation does not validate priority range
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts:44-65
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `priority` field is passed directly to `createTask` without validating it is a number, or within a valid range. The `Task` type defines `priority?: number` but the API accepts any value (string, negative, NaN, Infinity, etc.). Similarly, `description` and `assigneeAgentId` are not validated.
- **Evidence:**
  ```typescript
  // tasks/route.ts:45 — destructured directly from body with no validation
  const { subject, description, assigneeAgentId, blockedBy, priority } = body
  // ...only subject and blockedBy are validated...
  const task = createTask({ teamId: id, subject: subject.trim(), description, assigneeAgentId, blockedBy, priority })
  ```
- **Fix:** Add validation: `if (priority !== undefined && (typeof priority !== 'number' || priority < 0))`. Same for `assigneeAgentId` (should be string if provided) and `description` (should be string if provided).

## NIT

### [CC-009] Inconsistent error logging — some endpoints log, some don't
- **File:** Multiple files
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `GET /api/teams/[id]` and `DELETE /api/teams/[id]` have no try/catch and don't log errors. The `GET` handler could throw if `request.headers.get` fails or `checkTeamAccess` throws unexpectedly. `DELETE` has no error handling at all — if `deleteTeam` throws (e.g., filesystem error), it would result in a 500 with no useful error message.
- **Evidence:**
  ```typescript
  // DELETE handler has no try/catch
  export async function DELETE(request: NextRequest, { params }: ...) {
    const { id } = await params
    // ...no try/catch...
    const deleted = await deleteTeam(id)
  ```
- **Fix:** Wrap all handlers in try/catch for consistency with the other endpoints.

### [CC-010] `agentId` variable shadowing in chief-of-staff route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts:13
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The variable `agentId` at line 13 represents the target agent to assign as COS (from request body). However, all other route files use `agentId` to mean the requesting agent (from `X-Agent-Id` header). This naming inconsistency could confuse future developers and lead to bugs if ACL checks are added later (using `agentId` which refers to the target, not the requester).
- **Evidence:**
  ```typescript
  // chief-of-staff/route.ts:13 — agentId = target COS
  const { agentId, password } = body
  // All other routes — agentId = requesting agent
  const agentId = request.headers.get('X-Agent-Id') || undefined
  ```
- **Fix:** Rename the body field to `targetAgentId` or `cosAgentId` for clarity.

### [CC-011] `loadAgents()` called on every GET /api/teams/names request
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts:11
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Both `loadTeams()` and `loadAgents()` read from disk (filesystem I/O) on every request. This endpoint is called "once when the Create Team dialog opens" (per the docstring), so it's not high-frequency. But if the dialog is opened frequently, or if the registry files are large, this could become a performance issue.
- **Fix:** Consider adding a short TTL cache (5-10s), consistent with the caching pattern described in CLAUDE.md for session data.

### [CC-012] `request.json()` can throw on malformed JSON but not all routes catch it
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts:36, /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts:12
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `request.json()` throws a `SyntaxError` if the request body is not valid JSON. The `PUT /api/teams/[id]` and `POST /api/teams/[id]/chief-of-staff` routes catch this via their outer try/catch and return 500. It would be more correct to return 400 (Bad Request) for malformed JSON.
- **Evidence:**
  ```typescript
  // Caught by the generic catch, returns 500
  const body = await request.json()  // throws SyntaxError for invalid JSON
  // ...
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '...' }, { status: 500 })
  }
  ```
- **Fix:** Add a specific catch for `SyntaxError` that returns 400, or parse JSON manually with a try/catch that returns 400 on failure.

## CLEAN

Files with no issues found beyond those listed above:
- All 6 files are covered by findings above. No file was completely clean.

## SUMMARY

| Severity | Count |
|----------|-------|
| MUST-FIX | 2 |
| SHOULD-FIX | 6 |
| NIT | 4 |
| **Total** | **12** |

**Key themes:**
1. **Security:** Path traversal risk in task file paths (CC-001), inconsistent ACL enforcement across endpoints (CC-003, CC-004, CC-005)
2. **Resource leaks:** Orphaned task files on team deletion (CC-002)
3. **Race conditions:** Stale data used outside locks (CC-006, CC-007)
4. **Input validation gaps:** Priority, description, assigneeAgentId not validated (CC-008)
