# R2 API-Teams Correctness Report: Verification of 17 Findings

**Date:** 2026-02-19
**Source report:** `docs_dev/epcp-v5-correctness-api-teams.md`
**Verifier:** Opus 4.6

---

## Summary

| Status | Count |
|--------|-------|
| FIXED | 16 |
| UNFIXED | 0 |
| PARTIAL | 1 |

---

## MUST-FIX

### CC-001 — Path traversal in document-registry: no UUID validation on teamId
**Status: FIXED**

`lib/document-registry.ts` lines 23-29 now contain:
```typescript
function docsFilePath(teamId: string): string {
  // Validate teamId is a strict UUID to prevent path traversal (CC-001)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId))
    throw new Error('Invalid team ID')
  // path.basename() as defense-in-depth against directory traversal
  return path.join(TEAMS_DIR, path.basename(`docs-${teamId}.json`))
}
```
Both UUID regex validation AND `path.basename()` defense-in-depth are present, matching the `tasksFilePath()` pattern exactly.

---

### CC-002 — Documents routes missing UUID validation on path parameters
**Status: FIXED**

**`app/api/teams/[id]/documents/route.ts`:**
- GET handler: `isValidUuid(id)` check at line 14 with 400 response.
- POST handler: `isValidUuid(id)` check at line 32 with 400 response.
- Import of `isValidUuid` from `@/lib/validation` confirmed at line 4.

**`app/api/teams/[id]/documents/[docId]/route.ts`:**
- GET handler: `isValidUuid(id) || !isValidUuid(docId)` check at line 14, labeled `// CC-002`.
- PUT handler: Same check at line 36, labeled `// CC-002`.
- DELETE handler: Same check at line 74, labeled `// CC-002`.
- Import of `isValidUuid` from `@/lib/validation` confirmed at line 4.

All 5 handlers across both files validate UUID format. Fix complete.

---

### CC-003 — Transfer route: alias lookup result unused, agent re-resolved by original `id`
**Status: FIXED**

`app/api/agents/[id]/transfer/route.ts` lines 39-46 now use a single-pass resolution:
```typescript
// CC-003 fix: Resolve agent by UUID or alias in a single pass, no duplicate lookups
let agent = isValidUuid(id) ? getAgent(id) : null
if (!agent) {
  agent = getAgentByAlias(id)
}
if (!agent) {
  return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
}
```
No discarded result, no duplicate `getAgentByAlias` call. Fix matches the suggested pattern exactly.

---

## SHOULD-FIX

### CC-004 — Documents PUT uses `as any` type assertion to bypass type checking
**Status: FIXED**

`app/api/teams/[id]/documents/[docId]/route.ts` line 46:
```typescript
// CC-004: Properly typed updates object instead of `as any`
const updates: Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>> = {}
```
The `as any` cast is gone. The `updates` object is now properly typed with `Partial<Pick<TeamDocument, ...>>`. `TeamDocument` type is imported at line 5.

---

### CC-005 — Documents PUT missing team existence check before update
**Status: FIXED**

`app/api/teams/[id]/documents/[docId]/route.ts` lines 39-43:
```typescript
// CC-005: Verify team exists before attempting update
const team = getTeam(id)
if (!team) {
  return NextResponse.json({ error: 'Team not found' }, { status: 404 })
}
```
Team existence check now present in PUT handler, consistent with GET/POST/DELETE.

---

### CC-006 — Documents DELETE missing team existence check before deletion
**Status: FIXED**

`app/api/teams/[id]/documents/[docId]/route.ts` lines 77-81:
```typescript
// CC-006: Verify team exists before attempting deletion
const team = getTeam(id)
if (!team) {
  return NextResponse.json({ error: 'Team not found' }, { status: 404 })
}
```
Team existence check now present in DELETE handler.

---

### CC-007 — Teams POST route does not validate `type` field before passing to createTeam
**Status: FIXED**

`app/api/teams/route.ts` lines 27-30:
```typescript
// CC-007: Validate type field is a known team type if provided
if (type !== undefined && type !== 'open' && type !== 'closed') {
  return NextResponse.json({ error: 'type must be "open" or "closed"' }, { status: 400 })
}
```
Route-level validation for the `type` field is present, matching the suggested fix exactly.

---

### CC-008 — Transfer route SSRF: no hostname validation against registered hosts
**Status: FIXED**

`app/api/agents/[id]/transfer/route.ts` lines 92-109:
```typescript
// CC-008 fix: Validate hostname against registered hosts in hosts.json to prevent SSRF.
const registeredHosts = getHosts()
const targetHostname = parsedUrl.hostname.toLowerCase()
const isRegisteredHost = registeredHosts.some(h => {
  try {
    const hostUrl = new URL(h.url)
    return hostUrl.hostname.toLowerCase() === targetHostname
  } catch {
    return false
  }
})
if (!isRegisteredHost) {
  return NextResponse.json(
    { error: 'Target host is not registered in hosts.json. Register the host before transferring agents.' },
    { status: 400 }
  )
}
```
The TODO comment is gone. Hostname is now validated against `hosts.json`. The `getHosts` function is imported at line 3.

---

### CC-009 — Transfer route: `targetHostId` in request body is destructured but never used
**Status: FIXED**

`app/api/agents/[id]/transfer/route.ts` line 15:
```typescript
targetHostId?: string // CC-009: Optional — reserved for Phase 2 hostname validation against hosts.json
```
The field is now optional (`?`) and documented as reserved for Phase 2. It is no longer destructured from the body (line 56 confirms: `const { targetHostUrl, mode, newAlias, cloneRepositories } = body`). Callers no longer need to provide it.

---

### CC-010 — Documents POST does not validate `pinned` or `tags` field types
**Status: FIXED**

`app/api/teams/[id]/documents/route.ts` lines 47-53:
```typescript
// Validate optional field types to prevent invalid data in storage
if (pinned !== undefined && typeof pinned !== 'boolean') {
  return NextResponse.json({ error: 'pinned must be a boolean' }, { status: 400 })
}
if (tags !== undefined && (!Array.isArray(tags) || !tags.every((t: unknown) => typeof t === 'string'))) {
  return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 400 })
}
```
Both `pinned` (boolean check) and `tags` (array of strings check) are validated. Fix matches suggested pattern.

---

### CC-011 — Teams route POST: `agentIds` array elements not validated as strings
**Status: FIXED**

`app/api/teams/route.ts` lines 32-35:
```typescript
// CC-011: Validate agentIds is an array of strings
if (agentIds && (!Array.isArray(agentIds) || !agentIds.every((id: unknown) => typeof id === 'string'))) {
  return NextResponse.json({ error: 'agentIds must be an array of strings' }, { status: 400 })
}
```
Array check now includes element-type validation. Fix matches suggested pattern.

---

### CC-012 — Team DELETE: security bypass when no `agentId` header is provided for closed team deletion
**Status: PARTIAL**

`app/api/teams/[id]/route.ts` lines 89-98:
```typescript
// SR-002 fix: Closed team deletion requires elevated authority (MANAGER or COS)
// checkTeamAccess allows any member for resource access, but deletion is destructive
const team = getTeam(id)
if (team && team.type === 'closed') {
  if (agentId && !isManager(agentId) && team.chiefOfStaffId !== agentId) {
    return NextResponse.json(
      { error: 'Closed team deletion requires MANAGER or Chief-of-Staff authority' },
      { status: 403 }
    )
  }
}
```
The code is functionally identical to what the report described. The guard still checks `if (agentId && ...)`, meaning requests without `X-Agent-Id` bypass the restriction. However, the report noted this is "technically correct for Phase 1" since the web UI (which has no agentId) should be able to delete teams. The report's fix suggestion was to either document this as intentional OR change the check. The Phase 1 comment at line 74 (`// Phase 1: localhost-only, no X-Agent-Id auth required`) addresses the documentation aspect, but the SR-002 comment at line 89 is still slightly misleading since it says "requires elevated authority" while actually allowing unauthenticated requests through. **Partially addressed**: the Phase 1 comment was added but the misleading SR-002 comment remains unchanged.

---

## NIT

### CC-013 — Teams names route missing error handling for loadTeams/loadAgents failures
**Status: FIXED**

`app/api/teams/names/route.ts` lines 10-23:
```typescript
export async function GET() {
  try {
    const teams = loadTeams()
    const agents = loadAgents()
    return NextResponse.json({
      teamNames: teams.map(t => t.name),
      agentNames: agents.map(a => a.name).filter(Boolean),
    })
  } catch (error) {
    console.error('[teams/names] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```
The entire function body is now wrapped in try/catch with structured error response.

---

### CC-014 — Transfer route: `mode` field not validated before use
**Status: FIXED**

`app/api/agents/[id]/transfer/route.ts` lines 58-61:
```typescript
// CC-014 fix: Runtime validation for mode — TypeScript types are not enforced at runtime
if (mode !== 'move' && mode !== 'clone') {
  return NextResponse.json({ error: 'mode must be "move" or "clone"' }, { status: 400 })
}
```
Runtime validation present, matching suggested fix exactly.

---

### CC-015 — Inconsistent ACL check: documents routes don't use checkTeamAccess
**Status: FIXED**

Both document route files contain a Phase 1 exemption comment:
- `app/api/teams/[id]/documents/route.ts` line 6: `// Phase 1: No checkTeamAccess — document routes rely on team existence check only. Phase 2: add ACL.`

The report noted this as a NIT-level inconsistency. The fix documented it as intentional for Phase 1 with a clear TODO for Phase 2. This is an acceptable resolution for a NIT — the design decision is now explicit rather than accidental.

---

### CC-016 — Transfer route logs agent ID to console — potential info leak
**Status: FIXED**

`app/api/agents/[id]/transfer/route.ts` line 112:
```typescript
// CC-016 fix: Redact agent ID from log to prevent info leakage in multi-user scenarios
console.log(`[agent-transfer] Transfer initiated to ${parsedUrl.hostname}`)
```
The agent ID (`for agent ${id}`) has been removed from the log message. Only the target hostname is logged.

---

### CC-017 — deleteTeam does not clean up orphaned documents file
**Status: FIXED**

`lib/team-registry.ts` lines 327-329:
```typescript
// CC-002: Also clean up orphaned document file for the deleted team
const docsFile = path.join(TEAMS_DIR, path.basename(`docs-${id}.json`))
try { if (fs.existsSync(docsFile)) fs.unlinkSync(docsFile) } catch { /* ignore */ }
```
Document file cleanup is now present alongside task file cleanup, with the same UUID validation guard and `path.basename()` protection. (Note: the comment says "CC-002" but should say "CC-017" — cosmetic issue only.)

---

## Final Tally

| Finding | Severity | Status |
|---------|----------|--------|
| CC-001 | MUST-FIX | FIXED |
| CC-002 | MUST-FIX | FIXED |
| CC-003 | MUST-FIX | FIXED |
| CC-004 | SHOULD-FIX | FIXED |
| CC-005 | SHOULD-FIX | FIXED |
| CC-006 | SHOULD-FIX | FIXED |
| CC-007 | SHOULD-FIX | FIXED |
| CC-008 | SHOULD-FIX | FIXED |
| CC-009 | SHOULD-FIX | FIXED |
| CC-010 | SHOULD-FIX | FIXED |
| CC-011 | SHOULD-FIX | FIXED |
| CC-012 | SHOULD-FIX | PARTIAL |
| CC-013 | NIT | FIXED |
| CC-014 | NIT | FIXED |
| CC-015 | NIT | FIXED |
| CC-016 | NIT | FIXED |
| CC-017 | NIT | FIXED |

**Result: 16/17 FIXED, 1/17 PARTIAL (CC-012 — Phase 1 intentional bypass documented but SR-002 comment still misleading)**
