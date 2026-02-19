# Code Correctness Report: api-governance

**Agent:** epcp-code-correctness-agent
**Domain:** api-governance
**Files audited:** 6
**Date:** 2026-02-16T19:30:00Z

## MUST-FIX

### [CC-001] TOCTOU race in transfer resolve: team state read before lock, mutated after
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:39-93
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The resolve endpoint reads team state (`loadTeams()` at line 39) before entering the `updateTeam` lock. Between reading the team list and executing `updateTeam`, another concurrent request could modify the same teams. Specifically:
  1. `fromTeam.agentIds` is read at line 39, filtered at line 86, and written at line 87. If another request adds/removes agents from `fromTeam` in between, those changes are silently lost (last-write-wins).
  2. The `toTeam.agentIds.includes()` check at line 90 uses stale data -- the agent could already have been added by a concurrent approved transfer.
  3. The multi-closed-team constraint check (lines 70-83) uses the stale `teams` snapshot -- a concurrent transfer approval could violate the "one closed team per normal agent" invariant.
- **Evidence:**
  ```typescript
  // Line 39: snapshot taken OUTSIDE any lock
  const teams = loadTeams()
  const fromTeam = teams.find(t => t.id === transferReq.fromTeamId)
  // ... many lines of validation ...
  // Line 86-87: stale fromTeam.agentIds used for mutation
  const fromTeamAgentIds = fromTeam.agentIds.filter(aid => aid !== transferReq.agentId)
  await updateTeam(fromTeam.id, { agentIds: fromTeamAgentIds }, managerId)
  // Line 90-92: stale toTeam.agentIds used for mutation
  if (!toTeam.agentIds.includes(transferReq.agentId)) {
    const toTeamAgentIds = [...toTeam.agentIds, transferReq.agentId]
    await updateTeam(toTeam.id, { agentIds: toTeamAgentIds }, managerId)
  }
  ```
- **Fix:** The entire approve block (lines 60-93) should run inside a single `withLock('teams', ...)` call that re-reads team data after acquiring the lock, or `updateTeam` should accept a mutation callback rather than a flat `agentIds` array. At minimum, re-read `fromTeam` and `toTeam` from disk between the two `updateTeam` calls so the second write doesn't use stale data.

### [CC-002] Transfer resolve does not re-read transfer status inside lock -- double-approval possible
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:30-56
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The endpoint reads the transfer request at line 30 (`getTransferRequest(id)`) and checks `status !== 'pending'` at line 34. Then at line 53, `resolveTransferRequest` acquires a lock and writes. However, two concurrent POST requests can both read `status === 'pending'`, both pass validation, and both call `resolveTransferRequest`. While `resolveTransferRequest` itself has an internal guard (`if (requests[idx].status !== 'pending') return null` at transfer-registry.ts:101), the **team mutation at lines 86-93 runs unconditionally after `resolveTransferRequest` returns**. This means:
  - Request A: resolves transfer (approved), mutates teams
  - Request B: `resolveTransferRequest` returns `null` (already resolved)
  - But line 54 only checks `if (!resolved)` and returns 500 -- the team mutation at lines 86-93 has NOT run for request B because the early return at line 55 fires.

  Actually, re-reading: the early return at line 55 *does* prevent the mutation. So the double-resolve is correctly prevented by the inner lock + null check. **Downgrading this to NIT** -- the 500 status code for "already resolved by concurrent request" is misleading; it should be 409 Conflict.
- **Evidence:**
  ```typescript
  const resolved = await resolveTransferRequest(id, ...)
  if (!resolved) {
    // This fires for both "not found" and "already resolved by concurrent request"
    return NextResponse.json({ error: 'Failed to resolve transfer request' }, { status: 500 })
  }
  ```
- **Fix:** Distinguish between "not found" (already checked above, so this is the concurrent case) and return 409 instead of 500.

## SHOULD-FIX

### [CC-003] Unused import: TeamValidationException
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:8
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `TeamValidationException` is imported from `@/lib/team-registry` but never referenced anywhere in the file. The `updateTeam` calls can throw `TeamValidationException`, but the catch block at line 122 catches generic `error` and does not specifically handle it. This means a `TeamValidationException` (which carries a `code` property matching HTTP status codes) gets swallowed into a generic 500 response.
- **Evidence:**
  ```typescript
  import { loadTeams, updateTeam, TeamValidationException } from '@/lib/team-registry'
  // ... TeamValidationException never used in the file ...
  } catch (error) {
    console.error('Error resolving transfer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  ```
- **Fix:** Either remove the unused import, or add specific catch handling:
  ```typescript
  } catch (error) {
    if (error instanceof TeamValidationException) {
      return NextResponse.json({ error: error.message }, { status: error.code })
    }
    // ... generic 500
  }
  ```

### [CC-004] Cache in reachable endpoint never fully evicts stale entries when under 200 keys
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts:46-51
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The cache eviction at lines 46-51 only runs when `cache.size > 200`. If there are exactly 200 or fewer entries, stale entries are never cleaned up -- they just sit in memory with expired TTLs. While they won't be *served* (the TTL check at line 20 prevents that), they consume memory indefinitely in long-running server processes. With a 5-second TTL and typical usage patterns this is unlikely to be a practical problem, but it is a logic oversight.
- **Evidence:**
  ```typescript
  // Only evicts when size > 200 -- stale entries below that threshold persist forever in memory
  if (cache.size > 200) {
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (now >= entry.expiresAt) cache.delete(key)
    }
  }
  ```
- **Fix:** Run eviction unconditionally (or at least periodically, e.g., every 100 requests regardless of cache size), or use a max-age check on every cache.set().

### [CC-005] GET /api/governance exposes managerId without authentication
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts:5-14
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `GET /api/governance` endpoint returns `managerId` (a UUID) and `managerName` to any unauthenticated caller. While in Phase 1 (localhost-only), this is acceptable per the CLAUDE.md security model, this endpoint leaks which agent is the manager. If governance is meant to be protected by a password, exposing the manager identity without requiring the password partially undermines that protection. An attacker on localhost can enumerate agent UUIDs and know exactly which one to target.
- **Evidence:**
  ```typescript
  export async function GET() {
    const config = loadGovernance()
    // No password verification -- managerId exposed freely
    return NextResponse.json({
      hasPassword: !!config.passwordHash,
      hasManager: !!config.managerId,
      managerId: config.managerId,    // UUID leaked without auth
      managerName,                     // Name leaked without auth
    })
  }
  ```
- **Fix:** Consider only returning `hasPassword` and `hasManager` booleans publicly, and requiring password verification (via query param or header) to expose the actual `managerId` and `managerName`. Alternatively, document this as intentional for Phase 1.

### [CC-006] GET /api/governance/transfers has no authorization check -- any caller can list all transfers
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:12-35
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The GET endpoint for listing transfers has no authorization. Any caller can list all transfer requests for any team or agent by passing query parameters. The POST endpoint correctly checks `isManager` or `isChiefOfStaffAnywhere`, but GET has no such restriction. This means any agent (or UI component) can inspect the full transfer history, including pending requests, reject reasons, and who requested what.
- **Evidence:**
  ```typescript
  export async function GET(request: NextRequest) {
    // No auth check at all
    const teamId = request.nextUrl.searchParams.get('teamId')
    const agentId = request.nextUrl.searchParams.get('agentId')
    let requests = loadTransfers()
    // ... filter and return all matching transfers
  }
  ```
- **Fix:** Add authorization: require the caller to be the manager, a COS, or the agent being queried. Or accept this as intentional for Phase 1 localhost-only usage and add a TODO comment.

### [CC-007] Password change does not invalidate existing manager session
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts:22
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When a password is changed via `POST /api/governance/password`, no existing sessions or tokens are invalidated. Since governance uses per-request password verification (no session tokens), this is not immediately exploitable. However, any cached governance state in other API routes (e.g., the reachable endpoint's cache) could momentarily use stale data. More importantly, there's no audit trail of password changes -- `passwordSetAt` is updated, but the old hash is silently overwritten.
- **Evidence:**
  ```typescript
  await setPassword(password)
  return NextResponse.json({ success: true })
  // No invalidation of anything, no audit log
  ```
- **Fix:** Consider logging password change events (at minimum to console.log with timestamp). The reachable cache uses governance data indirectly, but its 5-second TTL makes this low risk.

## NIT

### [CC-008] Resolve endpoint returns 500 for concurrent resolve (should be 409)
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:54-56
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** As noted in CC-002, if `resolveTransferRequest` returns `null` because a concurrent request already resolved the transfer, the endpoint returns HTTP 500 ("Failed to resolve transfer request"). This is misleading -- it's not a server error, it's a conflict. The transfer was already checked for existence at line 30 and for pending status at line 34, so the only way `resolved` is null is a concurrent modification.
- **Evidence:**
  ```typescript
  if (!resolved) {
    return NextResponse.json({ error: 'Failed to resolve transfer request' }, { status: 500 })
  }
  ```
- **Fix:** Return 409 Conflict with a more specific error message like "Transfer request was already resolved by another request".

### [CC-009] `agentId === null` check without undefined guard in manager route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts:23-26
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The check `if (agentId === null)` at line 23 uses strict equality, so `undefined` (missing field in JSON body) falls through to the `typeof agentId !== 'string'` check at line 28, which then returns a 400 error saying "agentId must be a non-empty string or null". This works correctly, but the error message is slightly confusing because `undefined` (field not sent) and `null` (explicitly sent) have different meanings. If a caller sends `{}` (no agentId field), they get the "must be a non-empty string or null" error, which is acceptable but not ideal.
- **Evidence:**
  ```typescript
  if (agentId === null) {     // Only catches explicit null, not undefined
    await removeManager()
    return NextResponse.json({ success: true, managerId: null })
  }
  if (typeof agentId !== 'string' || !agentId.trim()) {
    return NextResponse.json({ error: 'agentId must be a non-empty string or null' }, { status: 400 })
  }
  ```
- **Fix:** No change required -- behavior is correct. Optionally, add a comment clarifying the distinction.

### [CC-010] `status` query param on GET /api/governance/transfers not validated
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:16
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `status` query parameter is documented in the comment as accepting `'pending' | 'approved' | 'rejected'`, but no validation is performed. If a caller passes `?status=invalid`, the filter at line 27 simply returns an empty array (since no transfer has `status === 'invalid'`). This is not a bug -- it fails safely -- but it's a missed opportunity to return a 400 error for invalid status values.
- **Evidence:**
  ```typescript
  const status = request.nextUrl.searchParams.get('status') // 'pending', 'approved', 'rejected', or null for all
  // ... no validation ...
  if (status) {
    requests = requests.filter(r => r.status === status)
  }
  ```
- **Fix:** Optionally validate: `if (status && !['pending', 'approved', 'rejected'].includes(status)) return 400`.

### [CC-011] Notification service called with `messageType: 'notification'` which is in default skip list
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:115
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The transfer resolve endpoint calls `notifyAgent` with `messageType: 'notification'`. In `notification-service.ts:21`, the default skip list is `'system,heartbeat'`. Currently `'notification'` is NOT in the skip list, so this works. However, the naming is confusing and fragile -- if someone adds `'notification'` to `NOTIFICATION_SKIP_TYPES` (which would seem reasonable given the name), transfer resolution notifications would silently stop working. Consider using a more specific type like `'transfer-resolution'`.
- **Evidence:**
  ```typescript
  // In resolve/route.ts:115
  messageType: 'notification',

  // In notification-service.ts:21
  const NOTIFICATION_SKIP_TYPES = (process.env.NOTIFICATION_SKIP_TYPES || 'system,heartbeat').split(',')
  ```
- **Fix:** Use `messageType: 'transfer-resolution'` or `'governance'` instead of the generic `'notification'`.

## CLEAN

Files with no issues found:
- (none -- all files had at least one finding)

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 1 |
| SHOULD-FIX | 5 |
| NIT | 4 |
| **Total** | **10** |

The most critical issue is the TOCTOU race condition in the transfer resolve endpoint (CC-001), where team state is read outside any lock and then used for mutations that could conflict with concurrent requests. The security findings (CC-005, CC-006) are acceptable for Phase 1 localhost-only usage but should be addressed before any remote access is enabled.
