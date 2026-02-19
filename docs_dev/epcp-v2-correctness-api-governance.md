# Code Correctness Report: api-governance

**Agent:** epcp-code-correctness-agent
**Domain:** api-governance
**Files audited:** 8
**Date:** 2026-02-17T00:20:00Z

## MUST-FIX

### [CC-001] `params` type mismatch in agent transfer route (non-Promise in Next.js 14.2)
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts:33
- **Severity:** MUST-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The route handler uses `{ params }: { params: { id: string } }` and accesses `params.id` synchronously at line 37. Every other `[id]` route in this codebase (40+ occurrences) uses `{ params }: { params: Promise<{ id: string }> }` with `const { id } = await params`. This project runs Next.js 14.2.35 where params is a Promise in App Router route handlers. Synchronous access works today because Next.js resolves it internally, but it emits a deprecation warning and will break in Next.js 15.
- **Evidence:**
  ```typescript
  // Line 31-37 of transfer/route.ts
  export async function POST(
    request: Request,
    { params }: { params: { id: string } }  // <-- non-Promise
  ) {
    try {
      let agent = getAgent(params.id)  // <-- synchronous access
  ```
  vs. all other routes:
  ```typescript
  // Example from resolve/route.ts line 14-19
  export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }  // <-- Promise
  ) {
    const { id } = await params  // <-- awaited
  ```
- **Fix:** Change type to `Promise<{ id: string }>` and add `const { id } = await params` at the top of the function. Also change `Request` to `NextRequest` for consistency.

### [CC-002] Transfer approval creates inconsistent state when destination team is deleted
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:63-73
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** At line 63, `resolveTransferRequest()` permanently marks the transfer as `'approved'` in `governance-transfers.json`. Then at line 72, the code checks if the destination team still exists. If it doesn't, it returns a 404 error. But the transfer request is already irreversibly marked as `'approved'` even though the team mutation was never performed. The transfer file now says "approved" but the agent was never actually moved. This is a TOCTOU-like issue within the critical section itself.
- **Evidence:**
  ```typescript
  // Line 63: marks transfer as 'approved' — writes to transfers file
  resolved = await resolveTransferRequest(id, action === 'approve' ? 'approved' : 'rejected', resolvedBy, rejectReason)

  // ...

  // Line 69-73: AFTER marking approved, checks if dest team exists
  toTeam = teams.find(t => t.id === transferReq.toTeamId)
  if (action === 'approve') {
    if (!toTeam) {
      // Returns error but transfer is already marked 'approved' in the file!
      return NextResponse.json({ error: 'Destination team no longer exists...' }, { status: 404 })
    }
  ```
- **Fix:** Move the destination team existence check BEFORE calling `resolveTransferRequest()`. The check at line 69 should happen before line 63. Alternatively, add a rollback step that reverts the transfer status back to 'pending' if the team mutation cannot be completed.

### [CC-003] `saveTeams()` return value ignored — silent data loss on write failure
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:117
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `saveTeams(teams)` returns `boolean` (true on success, false on write failure). At line 117, the return value is completely ignored. If the write fails (disk full, permissions issue), the transfer is marked as 'approved' in the transfers file but the team membership changes are lost. The response at line 148 reports `success: true` to the client.
- **Evidence:**
  ```typescript
  // Line 117: return value ignored
  saveTeams(teams)

  // saveTeams signature (team-registry.ts:224):
  export function saveTeams(teams: Team[]): boolean {
    try {
      // ... writeFileSync ...
      return true
    } catch (error) {
      console.error('Failed to save teams:', error)
      return false  // <-- this is silently swallowed
    }
  }
  ```
- **Fix:** Check the return value: `if (!saveTeams(teams)) { /* rollback transfer status or return 500 */ }`.

## SHOULD-FIX

### [CC-004] `error: 'message_blocked'` is not a valid `AMPErrorCode`
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts:574-575
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The governance message filter returns `error: 'message_blocked'` but this string is not in the `AMPErrorCode` union type defined in `lib/types/amp.ts:420-441`. The response object at line 573 is not typed as `AMPError` or `AMPRouteResponse` — it's an untyped object literal, so TypeScript doesn't catch this at compile time. Clients parsing errors by code will not recognize `'message_blocked'`.
- **Evidence:**
  ```typescript
  // Line 573-577 in route/route.ts
  return NextResponse.json({
    id: messageId, status: 'failed' as const,
    error: 'message_blocked',  // <-- not in AMPErrorCode union
    message: filterResult.reason || '...'
  }, { status: 403, headers: rateLimitHeaders })

  // AMPErrorCode (lib/types/amp.ts:420-441):
  export type AMPErrorCode =
    | 'invalid_request' | 'missing_field' | 'invalid_field'
    | 'unauthorized' | 'forbidden' | 'not_found'
    | 'name_taken' | 'rate_limited' | ...
    // 'message_blocked' is NOT here
  ```
- **Fix:** Either add `'message_blocked'` to the `AMPErrorCode` union, or use `'forbidden'` with a descriptive message. Also type the response as `AMPError` for compile-time safety.

### [CC-005] Payload size check relies on `Content-Length` header which is spoofable
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts:302-308
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The size limit check at line 302-303 only inspects the `Content-Length` header. A malicious client can set `Content-Length: 100` but send a multi-megabyte body. The actual body is then fully parsed at line 311 via `request.json()` without any size validation. This is somewhat mitigated by Next.js's default body size limit (typically 1MB for API routes), but the explicit check gives a false sense of protection.
- **Evidence:**
  ```typescript
  // Line 302-303: only checks header, not actual body
  const contentLength = request.headers.get('Content-Length')
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {

  // Line 311: body fully parsed regardless of actual size
  const body = await request.json() as AMPRouteRequest
  ```
- **Fix:** After parsing the body, validate the serialized size: `if (JSON.stringify(body).length > MAX_PAYLOAD_SIZE)`. Alternatively, use `request.text()` first, check its `.length`, then `JSON.parse()`. The header check can remain as a fast-path optimization.

### [CC-006] Rate limiter cleanup only triggers every 100 checks per agent — unbounded growth from many agents
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts:93-98
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Expired entries are only cleaned up when `entry.count % 100 === 0` (line 94). If many unique agents each send < 100 messages per window, their expired entries are never cleaned. In a mesh network with many agents sending infrequent messages, `rateLimitMap` grows without bound until the process restarts. This is an in-memory map so it won't cause disk issues, but can cause gradual memory growth.
- **Evidence:**
  ```typescript
  entry.count++
  // Periodic cleanup: remove expired entries every 100 checks
  if (entry.count % 100 === 0) {  // <-- never reached for agents with <100 msgs
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key)
    }
  }
  ```
- **Fix:** Add a separate cleanup trigger: clean up on every Nth total request (not per-agent), e.g., use a global counter. Alternatively, clean up when the map exceeds a threshold (e.g., `if (rateLimitMap.size > 1000)`).

### [CC-007] Reachable agents cache uses string key but never invalidates on governance config changes
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts:7-8,42-43
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The in-memory cache for reachable agents has a 5-second TTL but caches by `agentId` only. If a governance change happens (e.g., manager role changes, team membership changes, COS reassignment), stale results are served for up to 5 seconds. The comment at line 5-6 acknowledges this tradeoff, so this is by design, but worth noting that governance mutations (which happen on the same server process) could immediately invalidate the cache instead of waiting for TTL.
- **Evidence:**
  ```typescript
  // Line 42-43: cache stores result keyed only by agentId
  cache.set(agentId, { ids: reachableAgentIds, expiresAt: Date.now() + CACHE_TTL_MS })
  ```
- **Fix:** Consider clearing the cache whenever governance mutations happen (e.g., export `clearReachableCache()` and call it from team-registry save operations). The 5s TTL is acceptable for Phase 1 but could cause confusion during rapid governance changes.

## NIT

### [CC-008] Agent transfer route uses `Request` instead of `NextRequest`
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts:32
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Uses `Request` instead of `NextRequest`. While this works (NextRequest extends Request), all other route handlers in the project use `NextRequest` for consistency and access to `nextUrl` helpers.
- **Evidence:**
  ```typescript
  export async function POST(
    request: Request,  // <-- should be NextRequest
  ```
- **Fix:** Change to `NextRequest` and add `import { NextRequest }` if not already imported. This is bundled with the CC-001 fix.

### [CC-009] Unnecessary `!.agent` variable in agent transfer response could be undefined
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts:143-156
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** `importResult.agent?.id` and `importResult.agent?.alias` use optional chaining correctly, but `importResult` is typed as `any` (from `response.json()`). If the target host's import API returns a different schema, these could silently be `undefined` without the caller knowing.
- **Evidence:**
  ```typescript
  newAgentId: importResult.agent?.id,      // could be undefined
  newAlias: importResult.agent?.alias,      // could be undefined
  ```
- **Fix:** Add type annotation for `importResult` or validate the shape before using it. Low risk since it's just informational in the response.

### [CC-010] Transfer POST route: `requestedBy` not validated as existing agent
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:47-53
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `requestedBy` field is validated for authority (must be MANAGER or COS) via `isManager(requestedBy)` and `isChiefOfStaffAnywhere(requestedBy)`, but there's no explicit check that `requestedBy` is a valid agent UUID that exists in the registry. If a random string is passed that happens to not be MANAGER or COS, it gets a clean 403. If somehow it IS the manager ID (unlikely but possible with ID collision), it creates a transfer with a bogus `requestedBy`. Low risk in Phase 1 localhost.
- **Evidence:**
  ```typescript
  // Line 47-53: checks authority but not existence
  if (!agentId || !fromTeamId || !toTeamId || !requestedBy) { ... }
  if (!isManager(requestedBy) && !isChiefOfStaffAnywhere(requestedBy)) { ... }
  // No getAgent(requestedBy) check
  ```
- **Fix:** Add `if (!getAgent(requestedBy)) return 404` before the authority check. Minor issue since the authority check effectively validates the ID.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts` -- Clean. Simple GET, proper null handling, intentional Phase 1 exposure documented.
- `/Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts` -- Clean. Proper password length validation, current password required for changes, bcrypt used correctly.
- `/Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts` -- Clean. Good null vs undefined distinction for agentId, proper auth flow, agent existence verified.
- `/Users/emanuelesabetta/ai-maestro/lib/message-filter.ts` -- Clean. Comprehensive algorithm with correct rule ordering, proper use of plural team membership for COS agents.
- `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts` -- Clean. All mutations use withLock, proper ISO timestamp comparison for cleanup.
- `/Users/emanuelesabetta/ai-maestro/lib/file-lock.ts` -- Clean. Correct queue-based lock implementation, proper handoff semantics.
