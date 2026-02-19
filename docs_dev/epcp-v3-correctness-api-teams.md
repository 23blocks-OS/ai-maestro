# Code Correctness Report: api-teams

**Agent:** epcp-code-correctness-agent
**Domain:** api-teams
**Files audited:** 7
**Date:** 2026-02-17T00:00:00Z

## MUST-FIX

### [CC-001] Transfer route: SSRF via user-controlled `targetHostUrl`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:51-61
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `targetHostUrl` comes directly from the request body and is used to construct a `fetch()` call to an arbitrary URL (`${normalizedUrl}/api/agents/import`). The only validation is checking for empty string and auto-prepending `http://`. There is no allowlist check against known hosts (e.g., from `hosts.json`). An attacker on localhost can use this endpoint to:
  1. Probe internal network services (SSRF) by sending the exported agent data to any URL
  2. Exfiltrate agent data (including agent config, message history) to any external server
  3. Target internal services on non-standard ports

  While Phase 1 is localhost-only, this is still exploitable by any process on the machine or any website via CSRF (no CSRF protection exists).
- **Evidence:**
  ```typescript
  // Line 51-61: Only validates non-empty, no allowlist
  if (!targetHostUrl) {
    return NextResponse.json({ error: 'Target host URL required' }, { status: 400 })
  }
  let normalizedUrl = targetHostUrl.trim()
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `http://${normalizedUrl}`
  }
  normalizedUrl = normalizedUrl.replace(/\/+$/, '')

  // Line 95: Fetches arbitrary URL with exported agent data
  const importResponse = await fetch(`${normalizedUrl}/api/agents/import`, { ... })
  ```
- **Fix:** Validate `targetHostUrl` against known hosts from `hosts.json` (or `getHosts()`). Reject any URL not in the configured peer list. Example:
  ```typescript
  const peers = getPeerHosts()
  const isKnownPeer = peers.some(h => normalizedUrl.startsWith(h.url))
  if (!isKnownPeer) {
    return NextResponse.json({ error: 'Target host not in known hosts list' }, { status: 400 })
  }
  ```

### [CC-002] Transfer route: Self-fetch to own export API creates unnecessary network round-trip and potential failure
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:64-73
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The transfer route fetches its own `/api/agents/${agent.id}/export` endpoint via HTTP. This creates a self-referential HTTP request that:
  1. Depends on `getSelfHost().url` being correct and reachable (which may not be true if the server is behind NAT or the host config is wrong)
  2. Unnecessarily serializes the request through the full HTTP stack
  3. Can deadlock if the server's connection pool is exhausted or if the request handler is synchronous
  4. Will fail entirely if the self-host URL is incorrect (e.g., points to a Tailscale IP that's currently down)
- **Evidence:**
  ```typescript
  // Line 64-66
  const selfHost = getSelfHost()
  const exportResponse = await fetch(`${selfHost.url}/api/agents/${agent.id}/export`)
  ```
- **Fix:** Import and call the export logic function directly instead of doing an HTTP self-fetch. If the export route's handler is exported, call it directly. Otherwise, extract the export logic into a shared function.

### [CC-003] Transfer route: `mode` parameter not validated
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:48-49
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `mode` field is destructured from the request body and typed as `'move' | 'clone'` in the interface, but the actual runtime value is never validated. If a caller sends `mode: 'invalid'`, the code will silently skip the move-cleanup step (line 115 `if (mode === 'move')`) and return success, making the user think a clone was performed when the intent may have been a move. More critically, if `mode` is omitted entirely, the transfer succeeds with no cleanup, which could be confusing.
- **Evidence:**
  ```typescript
  // Line 13-19: Interface declares the type constraint
  interface HostTransferRequest {
    mode: 'move' | 'clone'
    // ...
  }

  // Line 48-49: Destructured but never validated at runtime
  const body: HostTransferRequest = await request.json()
  const { targetHostUrl, mode, newAlias, cloneRepositories } = body

  // Line 115: Only acts on 'move', anything else is silently ignored
  if (mode === 'move') {
  ```
- **Fix:** Add runtime validation:
  ```typescript
  if (mode !== 'move' && mode !== 'clone') {
    return NextResponse.json({ error: 'mode must be "move" or "clone"' }, { status: 400 })
  }
  ```

## SHOULD-FIX

### [CC-004] Teams GET route has no ACL check, unlike teams/[id] GET
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`:8-11
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `GET /api/teams` returns ALL teams including closed teams, with no ACL check. Meanwhile, `GET /api/teams/[id]` properly checks `checkTeamAccess()`. This means any agent can enumerate all closed teams and their member lists by calling the list endpoint, even though individual team access is restricted.
- **Evidence:**
  ```typescript
  // GET /api/teams - no ACL check
  export async function GET() {
    const teams = loadTeams()
    return NextResponse.json({ teams })
  }
  ```
  Compare with `GET /api/teams/[id]` which checks `checkTeamAccess()`.
- **Fix:** Either filter the teams list based on the requesting agent's access, or at minimum strip sensitive fields (agentIds, chiefOfStaffId, instructions) from closed teams the agent cannot access. The `X-Agent-Id` header is available on the request.

### [CC-005] POST /api/teams does not check ACL or require governance password
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`:14-45
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Any agent or web client can create teams, including closed teams with a chief-of-staff, without any authentication. The chief-of-staff endpoint (`POST /api/teams/[id]/chief-of-staff`) correctly requires the governance password, but team creation with `type: 'closed'` and `chiefOfStaffId` set does not.
- **Evidence:**
  ```typescript
  // Line 14-17: No password check, no ACL
  export async function POST(request: NextRequest) {
    try {
      const body = await request.json()
      const { name, description, agentIds, type, chiefOfStaffId } = body
  ```
- **Fix:** Either require governance password for creating closed teams, or strip `type` and `chiefOfStaffId` from the creation payload (similar to how PUT strips them at line 44 of `[id]/route.ts`), forcing users to use the dedicated password-protected COS endpoint after creation.

### [CC-006] Double team load in routes using both `getTeam()` and `checkTeamAccess()`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts`:13-21, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts`:13-21, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts`:13-21
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Several routes call `getTeam(id)` to check existence, then call `checkTeamAccess({ teamId: id })` which internally calls `getTeam(id)` again. This means two file reads of the same teams.json file per request. While not a bug, it's wasteful I/O that could cause inconsistency if the file changes between reads (TOCTOU).
- **Evidence:**
  ```typescript
  // teams/[id]/tasks/route.ts lines 13-21
  const team = getTeam(id)       // Read #1
  if (!team) { ... }
  const access = checkTeamAccess({ teamId: id, ... })  // Read #2 inside checkTeamAccess
  ```
  `checkTeamAccess` at `lib/team-acl.ts:42` calls `getTeam(input.teamId)` again.
- **Fix:** Refactor `checkTeamAccess` to accept an optional `team` parameter to avoid the second read, or add a caching layer for `loadTeams()`.

### [CC-007] PUT teams/[id] strips COS/type but does not strip them from `updateTeam` call
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts`:44-47
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The comment on line 43 states that `chiefOfStaffId` and `type` are stripped from generic PUT. The destructuring on line 44 indeed does not extract them. However, if the request body contains additional fields beyond what's destructured, those extra fields are silently ignored. This is correct behavior. BUT: the `updateTeam` function signature accepts `type` and `chiefOfStaffId` in its updates parameter. If someone later modifies line 44 to include those fields, there's no guard. Consider adding explicit `undefined` values or a validation comment.
- **Evidence:**
  ```typescript
  // Line 43-47
  // Strip chiefOfStaffId and type from generic PUT
  const { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt } = body
  const team = await updateTeam(id, { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt }, managerId)
  ```
- **Fix:** Add an explicit comment or defensive code like `const updates = { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt, type: undefined, chiefOfStaffId: undefined }` to make the stripping explicit and prevent accidental inclusion.

### [CC-008] Transfer route: `targetHostId` extracted but never used
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:49
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `targetHostId` field is defined in the `HostTransferRequest` interface and destructured from the body, but never used anywhere in the handler. It was likely intended for host validation (checking against known hosts), but that validation was never implemented.
- **Evidence:**
  ```typescript
  // Line 49: targetHostId destructured but never referenced
  const { targetHostUrl, mode, newAlias, cloneRepositories } = body
  // Note: targetHostId is in the interface but not destructured here either
  ```
  Actually, looking more carefully, `targetHostId` is in the interface (line 14) but not even destructured. The interface declares it as required, but the code ignores it entirely. If a client omits it, TypeScript won't catch it at runtime.
- **Fix:** Either use `targetHostId` for validation (matching against hosts.json), or remove it from the interface if it's not needed.

### [CC-009] Transfer route: `agent.id` used after `agent` possibly reassigned
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:39-42
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `agent` is declared with `let` and potentially reassigned when the alias lookup succeeds. This is fine functionally but uses `let` for a variable that should conceptually be assigned once. The `let` declaration also means `agent` loses its narrowed type after the `if (!agent)` check on line 44 in strict TypeScript analysis.
- **Evidence:**
  ```typescript
  let agent = getAgent(id)       // Line 39
  if (!agent) {
    agent = getAgentByAlias(id)  // Line 41 - reassignment
  }
  if (!agent) {                   // Line 44
    return NextResponse.json(...)
  }
  // agent is used after this point
  ```
- **Fix:** Minor refactor to use a single lookup:
  ```typescript
  const agent = getAgent(id) || getAgentByAlias(id)
  if (!agent) { ... }
  ```

## NIT

### [CC-010] POST /api/teams does not validate `type` at route level before delegation
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`:17
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `type` field from the request body is passed directly to `createTeam()`. While `validateTeamMutation()` inside `createTeam` validates it (R1.7), an early route-level check would provide a clearer error path. Currently, an invalid type will result in a `TeamValidationException` which is properly caught, so this is not a bug -- just a consistency observation since `name` is validated at the route level.
- **Evidence:**
  ```typescript
  const { name, description, agentIds, type, chiefOfStaffId } = body
  // name validated at route level (line 19-21)
  // agentIds validated at route level (line 23-25)
  // type NOT validated at route level, delegated to createTeam
  ```
- **Fix:** No action required -- validation happens in `validateTeamMutation`. Consider adding for consistency if desired.

### [CC-011] `request.json()` not wrapped in try-catch in some routes
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`:16, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts`:12, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts`:49, `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:48
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Several routes call `await request.json()` without a dedicated try-catch for malformed JSON. If the request body is not valid JSON, this throws an unhandled error that falls through to the generic catch block, returning a 500 error with a potentially confusing message like "Unexpected token..." instead of a clear 400 "Invalid JSON body". The `PUT /api/teams/[id]` route (line 42) correctly wraps this in its own try-catch.
- **Evidence:**
  ```typescript
  // teams/route.ts POST, line 16:
  const body = await request.json()  // Can throw on malformed JSON

  // Compare with teams/[id]/route.ts PUT, line 42 (correct):
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  ```
- **Fix:** Wrap `request.json()` calls in a try-catch that returns 400, matching the pattern in `PUT /api/teams/[id]`.

### [CC-012] `loadTeams()` migration writes without lock
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:206-215
- **Severity:** NIT
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** The one-time migration inside `loadTeams()` calls `saveTeams()` without going through `withLock()`. The comment says "safe without lock because migration is append-only and convergent" -- and this is likely true since it only adds a default `type: 'open'` to teams that lack it. However, if two requests trigger this migration simultaneously, one write could overwrite the other's (though both would produce the same result since the migration is idempotent). This is a very minor theoretical concern.
- **Evidence:**
  ```typescript
  // Line 204-215
  // One-time idempotent migration: safe without lock
  let needsSave = false
  for (const team of teams) {
    if (!team.type) { team.type = 'open'; needsSave = true }
  }
  if (needsSave) { saveTeams(teams) }  // No lock
  ```
- **Fix:** Acknowledged as safe by comment. No action needed unless concurrent access patterns change.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts` -- Clean, simple endpoint with proper filtering
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts` -- Well-implemented with cycle detection, proper validation of all fields, ACL checks, and correct error handling

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 3 |
| SHOULD-FIX | 6 |
| NIT | 3 |
| CLEAN | 2 |

**Critical issues:** The transfer route has an SSRF vulnerability (CC-001), a fragile self-fetch pattern (CC-002), and missing mode validation (CC-003). The teams list endpoint leaks closed team data (CC-004), and team creation allows bypassing COS password protection (CC-005).
