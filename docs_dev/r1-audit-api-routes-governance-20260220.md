# Code Correctness Report: API Routes (Governance + Messages)

**Agent:** epcp-code-correctness-agent
**Domain:** api-routes-governance-messages
**Files audited:** 8
**Date:** 2026-02-20T00:00:00Z

## MUST-FIX

### [CC-001] Missing JSON parse error handling in POST /api/messages
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/messages/route.ts`:34
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The POST handler calls `await request.json()` without a try/catch. If a client sends malformed JSON (e.g., empty body, invalid syntax), this throws an unhandled exception that bubbles up as a 500 Internal Server Error. Every other POST route in this audit (manager, password, transfers, resolve) wraps `request.json()` in a try/catch and returns a clean 400. The messages POST is the only one that doesn't.
- **Evidence:**
```typescript
// line 34
const body = await request.json()
```
- **Fix:** Wrap in try/catch like the other routes:
```typescript
let body
try { body = await request.json() } catch {
  return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
}
```

### [CC-002] Missing authentication on POST /api/governance/transfers (requestedBy from body)
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts`:50-67
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The transfers POST endpoint takes `requestedBy` from the request body and uses it for authorization decisions (line 67: `isManager(requestedBy)`). There is no `authenticateAgent()` call. Any client can set `requestedBy` to the manager's UUID and create transfer requests without proving they are that agent. The resolve endpoint (transfers/[id]/resolve) correctly uses `authenticateAgent()` to derive `resolvedBy` from auth headers, but the creation endpoint does not.
- **Evidence:**
```typescript
// line 50 - requestedBy comes from untrusted body
const { agentId, fromTeamId, toTeamId, requestedBy, note } = body

// line 67 - used for authorization decision
if (!isManager(requestedBy) && !isChiefOfStaffAnywhere(requestedBy)) {
  return NextResponse.json({ error: 'Only MANAGER or Chief-of-Staff can request transfers' }, { status: 403 })
}
```
- **Fix:** Add `authenticateAgent()` call. Use `auth.agentId` instead of `body.requestedBy` for the authorization check, or at minimum verify that `requestedBy === auth.agentId`.

### [CC-003] Missing authentication on POST /api/agents/[id]/transfer
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:12-31
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The agent transfer endpoint (move/clone agent to another host) has no authentication at all. Any localhost client can transfer any agent to any target host. While Phase 1 is localhost-only, the transfer operation communicates with external hosts (`targetHostUrl`), so a rogue process could exfiltrate agent data to an attacker-controlled host.
- **Evidence:**
```typescript
// No authenticateAgent() call, no auth headers checked
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const result = await transferAgent(id, body)
    ...
```
- **Fix:** Add authentication. At minimum, require governance password for transfers since they involve sending agent data to external hosts.

### [CC-004] Missing JSON parse error handling in POST /api/agents/[id]/transfer
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:18
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `await request.json()` is not wrapped in try/catch. Malformed JSON will produce an unhandled 500 error instead of a clean 400.
- **Evidence:**
```typescript
// line 18
const body = await request.json()
```
- **Fix:** Wrap in try/catch returning 400.

## SHOULD-FIX

### [CC-005] PATCH and DELETE on /api/messages lack authentication
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/messages/route.ts`:58-78
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The PATCH (mark-as-read, archive) and DELETE handlers accept an `agent` query parameter from the URL with no authentication. Any client can mark any agent's messages as read or delete them. POST correctly uses `authenticateAgent()`, but PATCH/DELETE do not. The agent identifier comes from the query string, not from verified auth headers.
- **Evidence:**
```typescript
// PATCH - line 58-66: no auth check
export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await updateMessage(
    searchParams.get('agent'),  // untrusted
    searchParams.get('id'),
    searchParams.get('action'),
  )
  ...
}

// DELETE - line 71-78: no auth check
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await removeMessage(
    searchParams.get('agent'),  // untrusted
    searchParams.get('id'),
  )
  ...
}
```
- **Fix:** Add `authenticateAgent()` to PATCH and DELETE. If auth is present, ensure the agent identifier matches the authenticated agent. Otherwise, accept for system/UI (Phase 1 pattern).

### [CC-006] GET /api/messages lacks authentication for reading other agents' inboxes
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/messages/route.ts`:8-22
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The GET handler accepts an `agent` query parameter to read any agent's inbox. No authentication is performed. While Phase 1 is localhost-only, this means any process on the machine can read any agent's messages.
- **Evidence:**
```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await getMessages({
    agent: searchParams.get('agent'),  // no auth check
    ...
  })
```
- **Fix:** Consider adding optional auth — when auth headers are present, restrict agent param to the authenticated agent. Leave unauthenticated access for the web UI (Phase 1 pattern).

### [CC-007] POST /api/governance/manager rate limit key is global, not per-IP
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts`:24
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The rate limit key `'governance-manager-auth'` is the same for all clients. A single attacker hitting the rate limit locks out ALL clients (including the legitimate admin) from the password endpoint. Same issue in `/api/governance/password/route.ts`:25 with key `'governance-password-change'`.
- **Evidence:**
```typescript
// manager/route.ts:24
const rateCheck = checkRateLimit('governance-manager-auth')

// password/route.ts:25
const rateCheck = checkRateLimit('governance-password-change')
```
- **Fix:** Include a per-client identifier (e.g., IP from `request.headers.get('x-forwarded-for')` or `request.ip`) in the rate limit key. For Phase 1 localhost this is low risk, but becomes critical in Phase 2 with remote access.

### [CC-008] Inconsistent error response format in governance password route
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts`:35
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** When `currentPassword` is missing/invalid type, `recordFailure()` is called (line 34) but the response status is 400, not 401. This counts a missing field as a "failed password attempt" in the rate limiter. Sending 5 requests without `currentPassword` would lock out the password-change endpoint entirely. The rate limit should only be incremented after an actual password verification failure.
- **Evidence:**
```typescript
// line 33-36
if (!currentPassword || typeof currentPassword !== 'string') {
  recordFailure('governance-password-change')  // <-- counts missing field as brute force
  return NextResponse.json({ error: 'Invalid current password' }, { status: 400 })
}
```
- **Fix:** Move `recordFailure()` to after the `verifyPassword()` call only (line 38). Don't count validation failures as brute force attempts.

### [CC-009] Transfer resolve lock ordering: 'teams' lock acquired before 'transfers' lock inside resolveTransferRequest
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:74,126
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** The resolve endpoint acquires the `teams` lock at line 74, then calls `resolveTransferRequest()` which internally acquires the `transfers` lock (via `withLock('transfers', ...)`). If any other code path acquires these locks in the opposite order (transfers then teams), a deadlock can occur. The compensating action `revertTransferToPending()` at line 161 also acquires the `transfers` lock while `teams` lock is held. Since these are async promise-based locks, a true deadlock would hang the request forever (no timeout on acquireLock).
- **Evidence:**
```typescript
// line 74 - acquires teams lock
const releaseLock = await acquireLock('teams')
...
// line 126 - resolveTransferRequest acquires transfers lock internally
resolved = await resolveTransferRequest(id, ...)
...
// line 161 - revertTransferToPending also acquires transfers lock
await revertTransferToPending(id)
```
- **Fix:** Ensure consistent lock ordering across the codebase (always teams before transfers, or vice versa). Alternatively, add a timeout to `acquireLock()` to prevent infinite hangs. Document the lock ordering convention.

### [CC-010] Potential lock leak on early return inside try/finally in resolve route
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:84,91,102,118
- **Severity:** SHOULD-FIX (actually OK -- but documenting for clarity)
- **Category:** race-condition
- **Confidence:** CONFIRMED (no bug -- the try/finally correctly releases)
- **Description:** Multiple early `return NextResponse.json(...)` statements exist inside the `try` block that holds the teams lock (lines 84, 91, 102, 118). These are safe because the `finally` block at line 165 calls `releaseLock()`. However, this pattern is fragile -- any future modification that moves returns outside the try/finally or adds returns after `releaseLock()` could cause issues. The code is currently correct.
- **Evidence:** The `finally { releaseLock() }` at line 165-167 correctly covers all early returns.
- **Fix:** No immediate fix needed. Consider a comment noting that all early returns within the lock are covered by finally.

## NIT

### [CC-011] GET /api/governance exposes managerId without authentication
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts`:12
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The governance GET endpoint returns `managerId` (a UUID) to any client. The comment on line 5 acknowledges this as intentional for Phase 1. However, exposing the manager UUID helps attackers craft the `requestedBy` field for CC-002.
- **Evidence:**
```typescript
// line 5 comment acknowledges this
// Phase 1: Intentionally exposes managerId for localhost-only usage.
return NextResponse.json({
  hasPassword: !!config.passwordHash,
  hasManager: !!config.managerId,
  managerId: config.managerId,  // exposed
  managerName,
})
```
- **Fix:** Phase 2 should gate this behind auth. For Phase 1, the comment is sufficient.

### [CC-012] GET /api/governance/reachable does not validate agentId exists in registry
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts`:20-21
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The regex validation at line 20 checks format (`^[a-zA-Z0-9_-]+$`) but doesn't check if the agentId actually exists. Querying with a non-existent agentId silently returns an empty `reachableAgentIds` array instead of a 404. This is arguably correct behavior (an unknown agent can reach nobody), but callers may not realize they misspelled an ID.
- **Evidence:**
```typescript
if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
  return NextResponse.json({ error: 'Invalid agentId format' }, { status: 400 })
}
// No existence check -- proceeds to compute reachable agents
```
- **Fix:** Consider returning 404 if the agent doesn't exist in the registry. Low priority since the current behavior is defensible.

### [CC-013] Reachable endpoint agentId format regex doesn't match UUID format
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts`:20
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The regex `^[a-zA-Z0-9_-]+$` accepts any alphanumeric+hyphen+underscore string. Other endpoints in this PR use `isValidUuid()` for agent IDs. The reachable endpoint accepts a broader format (which may be intentional if it needs to accept aliases), but this is inconsistent with the UUID validation pattern used elsewhere.
- **Evidence:**
```typescript
// reachable/route.ts uses broad regex
if (!/^[a-zA-Z0-9_-]+$/.test(agentId))

// transfers/route.ts uses strict UUID
if (!isValidUuid(agentId) || ...)
```
- **Fix:** If the `agentId` param is always a UUID, use `isValidUuid()` for consistency. If it can be an alias, document why the broader format is needed.

### [CC-014] Error message in manager POST leaks agent name existence
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts`:52
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The 404 error on line 52 includes the agentId in the message: `Agent '${agentId}' not found`. This allows enumeration of agent IDs. Low risk for Phase 1 localhost.
- **Evidence:**
```typescript
return NextResponse.json({ error: `Agent '${agentId}' not found` }, { status: 404 })
```
- **Fix:** Use a generic "Agent not found" message.

### [CC-015] Transfer POST error response includes full existing request object
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts`:133
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The 409 duplicate transfer response includes the full `existingRequest` object, which may contain internal IDs and timestamps. Not a security issue for Phase 1 but could leak internal state in Phase 2.
- **Evidence:**
```typescript
return NextResponse.json({
  error: 'A transfer request for this agent between these teams already exists',
  existingRequest: duplicate  // full transfer request object
}, { status: 409 })
```
- **Fix:** Return only `existingRequest.id` instead of the full object.

## CLEAN

Files with no issues found:
- None -- all files had at least minor observations.

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 4 |
| SHOULD-FIX | 6 |
| NIT | 5 |
| **Total** | **15** |

### Key Findings:
1. **CC-001** and **CC-004**: Missing JSON parse error handling (two POST routes).
2. **CC-002**: Transfer creation uses untrusted `requestedBy` from body for authorization.
3. **CC-003**: Agent transfer to external hosts has zero authentication.
4. **CC-005/CC-006**: Messages PATCH/DELETE/GET lack authentication.
5. **CC-008**: Rate limiter incremented on validation errors, not just real password failures.
6. **CC-009**: Potential lock ordering issue between 'teams' and 'transfers' locks.
