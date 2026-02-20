# Code Correctness Report: api-teams

**Agent:** epcp-code-correctness-agent
**Domain:** api-teams
**Files audited:** 9
**Date:** 2026-02-19T00:00:00Z

## MUST-FIX

### [CC-001] Path traversal in document-registry: no UUID validation on teamId
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/document-registry.ts`:23-25
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `docsFilePath()` function constructs a file path using `teamId` without any UUID validation, unlike `tasksFilePath()` in task-registry.ts which validates UUID format. A crafted `teamId` like `../../etc/passwd` could read/write arbitrary files relative to the TEAMS_DIR.
- **Evidence:**
  ```typescript
  // document-registry.ts:23-25 — NO validation
  function docsFilePath(teamId: string): string {
    return path.join(TEAMS_DIR, `docs-${teamId}.json`)
  }

  // Compare with task-registry.ts:24-29 — HAS validation
  function tasksFilePath(teamId: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId))
      throw new Error('Invalid team ID')
    return path.join(TEAMS_DIR, path.basename(`tasks-${teamId}.json`))
  }
  ```
- **Fix:** Add UUID validation and `path.basename()` defense-in-depth to `docsFilePath()`, matching the pattern from `tasksFilePath()`.

### [CC-002] Documents routes missing UUID validation on path parameters
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts`:10,25
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts`:10,28,56
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Both documents routes accept `id` (teamId) and `docId` without calling `isValidUuid()` to validate path parameters. All other team sub-routes (tasks, chief-of-staff, team CRUD) validate UUID format. Because `document-registry.ts` also lacks UUID validation (CC-001), malicious path parameters flow unchecked all the way to file system operations.
- **Evidence:**
  ```typescript
  // documents/route.ts:10 — no isValidUuid(id) check
  const { id } = await params
  const team = getTeam(id)  // getTeam reads teams.json, so id is used in memory lookup — safe
  // BUT:
  const documents = loadDocuments(id)  // id goes directly to docsFilePath(id) → file path

  // documents/[docId]/route.ts:10 — neither id nor docId validated
  const { id, docId } = await params
  ```
  Compare with tasks/route.ts which validates UUID:
  ```typescript
  // tasks/route.ts:15-17
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
  }
  ```
- **Fix:** Add `isValidUuid(id)` and `isValidUuid(docId)` validation at the start of all document route handlers. Import `isValidUuid` from `@/lib/validation`.

### [CC-003] Transfer route: alias lookup result unused, agent re-resolved by original `id`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:40-51
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `isValidUuid(id)` fails, the code looks up the agent by alias and stores it in `agentByAlias`, but then discards the result. It falls through and re-lookups the agent by `id` (the original non-UUID string) using `getAgent(id)` which searches by UUID only. If the alias lookup succeeded but the name differs from the UUID, `getAgent(id)` returns null and the code falls through to `getAgentByAlias(id)` again, duplicating work. More critically, if `isValidUuid(id)` fails and `getAgentByAlias(id)` also returns null, the early-return on line 44 fires — but if it succeeds, the code falls through to line 49 and does `getAgent(id)` on a non-UUID `id`, which will always return null, then does `getAgentByAlias(id)` again unnecessarily.
- **Evidence:**
  ```typescript
  // Lines 40-51:
  if (!isValidUuid(id)) {
    // Fall through to alias lookup if not a valid UUID
    const agentByAlias = getAgentByAlias(id)  // <-- result discarded
    if (!agentByAlias) {
      return NextResponse.json({ error: 'Invalid agent ID format and no matching alias found' }, { status: 400 })
    }
  }
  // Falls through here if agentByAlias found, but it's not used
  // Lines 49-51:
  let agent = getAgent(id)       // <-- always null for non-UUID id
  if (!agent) {
    agent = getAgentByAlias(id)   // <-- duplicate call
  }
  ```
- **Fix:** Use the `agentByAlias` result directly:
  ```typescript
  let agent: Agent | null = null
  if (isValidUuid(id)) {
    agent = getAgent(id)
  }
  if (!agent) {
    agent = getAgentByAlias(id)
  }
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  ```

## SHOULD-FIX

### [CC-004] Documents PUT uses `as any` type assertion to bypass type checking
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts`:36
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `updates` object is built as `Record<string, unknown>` then cast with `as any` when passed to `updateDocument()`. This defeats TypeScript's type checking. If someone adds a field with a wrong type, the compiler won't catch it.
- **Evidence:**
  ```typescript
  const updates: Record<string, unknown> = {}
  if (body.title !== undefined) updates.title = body.title
  // ...
  const document = await updateDocument(id, docId, updates as any)  // <-- unsafe cast
  ```
- **Fix:** Type the `updates` object correctly:
  ```typescript
  const updates: Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>> = {}
  ```
  This matches the `updateDocument` function signature exactly and eliminates the `as any`.

### [CC-005] Documents PUT missing team existence check before update
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts`:27-41
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The PUT handler for documents does not check if the team exists before attempting the update. The GET and POST handlers both verify team existence with `getTeam(id)`, but PUT skips this check. While `updateDocument` would return null if the document doesn't exist (because the docs file for a non-existent team wouldn't have documents), the error message would be "Document not found" instead of the more accurate "Team not found".
- **Evidence:**
  ```typescript
  // PUT handler — no getTeam(id) check
  const { id, docId } = await params
  const body = await request.json()
  // jumps straight to updateDocument without verifying team exists
  const document = await updateDocument(id, docId, updates as any)
  ```
- **Fix:** Add team existence check before calling `updateDocument`, consistent with GET/POST/DELETE handlers.

### [CC-006] Documents DELETE missing team existence check before deletion
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts`:52-62
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-005 but for DELETE. The DELETE handler does not check if the team exists before attempting to delete the document.
- **Evidence:**
  ```typescript
  // DELETE handler — no getTeam(id) check
  const { id, docId } = await params
  const deleted = await deleteDocument(id, docId)
  ```
- **Fix:** Add `getTeam(id)` check and return 404 "Team not found" if team doesn't exist, matching GET/POST pattern.

### [CC-007] Teams POST route does not validate `type` field before passing to createTeam
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`:21,36
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The POST route passes `body.type` directly to `createTeam()` without any type validation at the route level. While `validateTeamMutation` inside `createTeam` does validate the `type` field (R1.7), the route destructures it as `const { ..., type, ... } = body` and passes it through. This means `type` could be any value (number, object, etc.) and would only be caught deep in the validation logic. Route-level validation is best practice for defense-in-depth.
- **Evidence:**
  ```typescript
  const { name, description, agentIds, type, chiefOfStaffId } = body
  // No validation on `type` at route level
  const team = await createTeam({ name, description, agentIds: agentIds || [], type, chiefOfStaffId }, managerId, agentNames)
  ```
- **Fix:** Add type validation at the route level:
  ```typescript
  if (type !== undefined && type !== 'open' && type !== 'closed') {
    return NextResponse.json({ error: 'type must be "open" or "closed"' }, { status: 400 })
  }
  ```

### [CC-008] Transfer route SSRF: no hostname validation against registered hosts
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:96-97
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The transfer endpoint accepts any HTTP/HTTPS URL as `targetHostUrl`. While it validates protocol (http/https), there is no validation that the target hostname is a registered/known host. This allows SSRF-like requests to any internal or external host. The code has a TODO comment acknowledging this.
- **Evidence:**
  ```typescript
  // Line 96-97:
  // TODO Phase 2: Validate hostname against registered hosts in hosts.json
  console.log(`[agent-transfer] Transfer initiated to ${parsedUrl.hostname} for agent ${id}`)
  ```
- **Fix:** Validate `parsedUrl.hostname` against registered hosts from `hosts.json` before proceeding. At minimum, block requests to `localhost`, `127.0.0.1`, `0.0.0.0`, `169.254.x.x` (link-local), and private IP ranges unless they match a registered host.

### [CC-009] Transfer route: `targetHostId` in request body is destructured but never used
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:14-16,66
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `HostTransferRequest` interface declares `targetHostId` as a required field, and it's defined in the destructuring on line 66. However, it is never used anywhere in the function body. The interface says it's required (`targetHostId: string`), so callers must provide it, but the code ignores it.
- **Evidence:**
  ```typescript
  interface HostTransferRequest {
    targetHostId: string    // <-- declared as required
    // ...
  }
  // Line 66:
  const { targetHostUrl, mode, newAlias, cloneRepositories } = body  // targetHostId not destructured
  ```
- **Fix:** Either use `targetHostId` for hostname validation (see CC-008), or make it optional (`targetHostId?: string`) and document why it's not used yet.

### [CC-010] Documents POST does not validate `pinned` or `tags` field types
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts`:32-44
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The POST handler validates `title` is a string but passes `pinned` and `tags` from the request body without type validation. A caller could send `pinned: "yes"` (string) or `tags: 42` (number) and these would be stored as-is.
- **Evidence:**
  ```typescript
  const { title, content, pinned, tags } = body
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  // No validation that pinned is boolean or tags is string[]
  const document = await createDocument({
    teamId: id, title, content: content || '', pinned, tags,
  })
  ```
- **Fix:** Add type validation:
  ```typescript
  if (pinned !== undefined && typeof pinned !== 'boolean') {
    return NextResponse.json({ error: 'pinned must be a boolean' }, { status: 400 })
  }
  if (tags !== undefined && (!Array.isArray(tags) || !tags.every(t => typeof t === 'string'))) {
    return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 400 })
  }
  ```

### [CC-011] Teams route POST: `agentIds` array elements not validated as strings
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`:27-29
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The POST handler checks that `agentIds` is an array but does not validate that each element is a string. A caller could send `agentIds: [1, null, {}]` and these would be passed to `createTeam`.
- **Evidence:**
  ```typescript
  if (agentIds && !Array.isArray(agentIds)) {
    return NextResponse.json({ error: 'agentIds must be an array' }, { status: 400 })
  }
  // No check that each element is a string
  const team = await createTeam({ ..., agentIds: agentIds || [] }, ...)
  ```
- **Fix:** Add element-type validation:
  ```typescript
  if (agentIds && (!Array.isArray(agentIds) || !agentIds.every(id => typeof id === 'string'))) {
    return NextResponse.json({ error: 'agentIds must be an array of strings' }, { status: 400 })
  }
  ```

### [CC-012] Team DELETE: security bypass when no `agentId` header is provided for closed team deletion
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts`:88-98
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The SR-002 closed team deletion guard checks `if (agentId && !isManager(agentId) && team.chiefOfStaffId !== agentId)`. Because `agentId` comes from `request.headers.get('X-Agent-Id') || undefined`, omitting the header makes `agentId` undefined, which makes the entire `if (agentId && ...)` condition false, bypassing the closed-team deletion restriction. Any request without `X-Agent-Id` can delete a closed team.
- **Evidence:**
  ```typescript
  const agentId = request.headers.get('X-Agent-Id') || undefined
  // ...
  if (team && team.type === 'closed') {
    if (agentId && !isManager(agentId) && team.chiefOfStaffId !== agentId) {
      // This block is SKIPPED when agentId is undefined
      return NextResponse.json({ error: 'Closed team deletion requires MANAGER or Chief-of-Staff authority' }, { status: 403 })
    }
  }
  ```
  This is consistent with the Phase 1 localhost-only model (web UI has no agentId and should be able to delete), but the comment says "SR-002 fix: Closed team deletion requires elevated authority" which implies it should protect against unauthorized deletion. The ACL check above already allows undefined agentId through, so the SR-002 guard is redundant for non-agent requests.
- **Fix:** Document this is intentional for Phase 1 (web UI acts as admin), or if the intent is to truly restrict closed team deletion, check for undefined agentId separately:
  ```typescript
  // Only agents with elevated authority can delete closed teams
  if (agentId !== undefined && !isManager(agentId) && team.chiefOfStaffId !== agentId) {
    return NextResponse.json({ error: '...' }, { status: 403 })
  }
  ```
  (Current behavior is technically correct for Phase 1 but the comment is misleading.)

## NIT

### [CC-013] Teams names route missing error handling for loadTeams/loadAgents failures
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts`:10-18
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The GET handler calls `loadTeams()` and `loadAgents()` without a try/catch. While both functions internally handle errors and return empty arrays on failure, if they throw (e.g., from an unexpected error type), the route would return a 500 without a structured error response.
- **Evidence:**
  ```typescript
  export async function GET() {
    const teams = loadTeams()        // no try/catch
    const agents = loadAgents()
    return NextResponse.json({ ... })
  }
  ```
- **Fix:** Wrap in try/catch for consistency with other routes.

### [CC-014] Transfer route: `mode` field not validated before use
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:66,151
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `mode` field from the request body is typed as `'move' | 'clone'` in the interface, but it's destructured from an unvalidated JSON body. If a caller sends `mode: "delete"` or omits it, the code won't perform the move cleanup (line 151 check: `if (mode === 'move')`) and will succeed without error, defaulting to clone-like behavior silently.
- **Evidence:**
  ```typescript
  interface HostTransferRequest {
    mode: 'move' | 'clone'   // <-- TypeScript type, not runtime validation
  }
  // Line 66:
  const { targetHostUrl, mode, newAlias, cloneRepositories } = body
  // Line 151:
  if (mode === 'move') {  // silently skipped if mode is anything else
  ```
- **Fix:** Validate `mode` at runtime:
  ```typescript
  if (mode !== 'move' && mode !== 'clone') {
    return NextResponse.json({ error: 'mode must be "move" or "clone"' }, { status: 400 })
  }
  ```

### [CC-015] Inconsistent ACL check: documents routes don't use checkTeamAccess
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts`
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** All task routes use `checkTeamAccess()` to enforce ACL for closed teams, but document routes do not. Documents are team resources just like tasks, so they should have the same access control. An agent not on a closed team could read/modify its documents.
- **Evidence:**
  ```typescript
  // tasks/route.ts uses ACL:
  const agentId = request.headers.get('X-Agent-Id') || undefined
  const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })
  if (!access.allowed) { ... }

  // documents/route.ts does NOT check ACL — just checks team existence
  const team = getTeam(id)
  if (!team) { ... }
  // No checkTeamAccess() call
  ```
- **Fix:** Add `checkTeamAccess` to all document route handlers, matching the task routes pattern.

### [CC-016] Transfer route logs agent ID to console — potential info leak
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:97
- **Severity:** NIT
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The transfer route logs the target hostname and agent ID on every transfer attempt. In Phase 2+ with multi-user access, this could leak agent identifiers in server logs.
- **Evidence:**
  ```typescript
  console.log(`[agent-transfer] Transfer initiated to ${parsedUrl.hostname} for agent ${id}`)
  ```
- **Fix:** Use a structured logging approach or at minimum redact the agent ID in production.

### [CC-017] deleteTeam does not clean up orphaned documents file
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:317-324
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `deleteTeam` cleans up the orphaned task file (`tasks-{id}.json`) but does not clean up the orphaned documents file (`docs-{id}.json`). Over time, deleted teams leave stale document files on disk.
- **Evidence:**
  ```typescript
  // Line 318-323: only cleans up tasks file
  if (/^[0-9a-f]{8}-...$/i.test(id)) {
    const taskFile = path.join(TEAMS_DIR, path.basename(`tasks-${id}.json`))
    try { if (fs.existsSync(taskFile)) fs.unlinkSync(taskFile) } catch { /* ignore */ }
    // No cleanup of docs-${id}.json
  }
  ```
- **Fix:** Add document file cleanup alongside task file cleanup:
  ```typescript
  const docsFile = path.join(TEAMS_DIR, path.basename(`docs-${id}.json`))
  try { if (fs.existsSync(docsFile)) fs.unlinkSync(docsFile) } catch { /* ignore */ }
  ```

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` -- Well-structured ACL with clear decision order and good documentation
- `/Users/emanuelesabetta/ai-maestro/lib/validation.ts` -- Simple and correct UUID validation
- `/Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts` -- Clean implementation with proper expiry handling and periodic cleanup
