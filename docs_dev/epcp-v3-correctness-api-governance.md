# Code Correctness Report: api-governance

**Agent:** epcp-code-correctness-agent
**Domain:** api-governance
**Files audited:** 7
**Date:** 2026-02-17T00:00:00Z

## MUST-FIX

No must-fix issues found.

## SHOULD-FIX

### [CC-001] Transfer resolve: lock not released on early return before lock acquisition
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:31-37
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED (traced the code)
- **Description:** The `getTransferRequest(id)` call on line 31 and the status check on line 35 happen **before** the `acquireLock('teams')` on line 42. While this is functionally correct (it's a read-only early-exit optimization, and the real concurrency-safe check is inside `resolveTransferRequest` which uses its own 'transfers' lock), it creates a subtle TOCTOU window: between the pre-lock read and the post-lock `resolveTransferRequest`, a concurrent request could resolve the same transfer. The inner `resolveTransferRequest` handles this correctly by returning `null` on double-resolve, and the route returns 409. However, there is a wasted lock acquisition and team-loading cycle in the race case. This is a performance nit, not a correctness bug, because the second check inside `resolveTransferRequest` is authoritative.
- **Evidence:**
  ```typescript
  // Line 31-36: Pre-lock read (no lock held)
  const transferReq = getTransferRequest(id)
  if (!transferReq) { return 404 }
  if (transferReq.status !== 'pending') { return 409 }
  // Line 42: Lock acquired
  const releaseLock = await acquireLock('teams')
  // Line 75: Second check inside resolveTransferRequest (with 'transfers' lock)
  resolved = await resolveTransferRequest(id, ...)
  if (!resolved) { return 409 }  // handles race correctly
  ```
- **Fix:** Move the `getTransferRequest` call inside the lock section, or accept this as a deliberate optimization (the current pattern is safe but not optimal). Add a comment explaining the double-check pattern.

### [CC-002] Unbounded in-memory rate limit map growth in v1/route
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts`:70-100
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED (traced the code)
- **Description:** The rate limit cleanup on line 94 triggers only when `entry.count % 100 === 0` or `rateLimitMap.size > 500`. However, `entry.count` is per-agent and resets each window. If 500+ distinct agents each send fewer than 100 messages per window, cleanup never triggers (the `size > 500` check only fires on agent count increments that happen to coincide with a non-expired entry). In practice, the map entries expire after 60 seconds and each new request for that agent replaces the stale entry (line 83-84), so the actual memory growth is bounded by the number of unique agents that send at least one message per minute. For most deployments this is negligible, but in a mesh with many agents it could accumulate entries until a lucky cleanup triggers.
- **Evidence:**
  ```typescript
  // Line 83-84: stale entries are overwritten on next access
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(agentId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
  }
  // Line 94: cleanup only on count%100 or size>500
  if (entry.count % 100 === 0 || rateLimitMap.size > 500) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key)
    }
  }
  ```
- **Fix:** Add a periodic sweep (e.g., every N seconds via `setInterval`) or trigger cleanup on every Nth request regardless of per-agent count. Alternatively, use a `WeakRef`-based cache or a proper LRU.

### [CC-003] Reachable endpoint cache does not invalidate on governance/team changes
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts`:7-8, 43
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED (traced the code)
- **Description:** The reachable-agents cache has a 5-second TTL. When governance rules change (e.g., team type changed from open to closed, agent transferred between teams, COS role assigned), the cache can serve stale results for up to 5 seconds. During this window, an agent might see a recipient as reachable when they are no longer allowed to message them (or vice versa). The actual message delivery via `/api/v1/route` does its own `checkMessageAllowed` at send time, so the stale cache only affects UI display, not actual message delivery security. Still, this could confuse users.
- **Evidence:**
  ```typescript
  const CACHE_TTL_MS = 5_000  // 5 second stale window
  // No invalidation mechanism when governance/team data changes
  cache.set(agentId, { ids: reachableAgentIds, expiresAt: Date.now() + CACHE_TTL_MS })
  ```
- **Fix:** Either (a) expose a cache-invalidation function that governance/team mutation endpoints can call, or (b) accept the 5-second staleness and document it as expected behavior (since the enforcement happens at send time anyway).

## NIT

### [CC-004] Password route logs password change timing information
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts`:26-28
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The password set/change route logs the exact ISO timestamp of password operations to `console.log`. While this is localhost-only (Phase 1), these timestamps could leak timing information about governance operations in log files. The governance config already stores `passwordSetAt`, so logging is redundant.
- **Evidence:**
  ```typescript
  console.log('[governance] Password changed at', new Date().toISOString())
  console.log('[governance] Password set at', new Date().toISOString())
  ```
- **Fix:** Remove the console.log statements or reduce to debug-level logging. The `passwordSetAt` field in the governance config already records this.

### [CC-005] Error message in password route may leak internal details
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts`:35
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The error handler returns `error.message` directly in the 500 response. If an internal error contains filesystem paths, bcrypt details, or other system information, it would be exposed to the client.
- **Evidence:**
  ```typescript
  { error: error instanceof Error ? error.message : 'Failed to set password' }
  ```
- **Fix:** Return a generic error message in production. The detailed error is already logged via `console.error`.

### [CC-006] Manager route error message may leak internal details
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts`:44
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-005. The manager route's catch block returns `error.message` to the client.
- **Evidence:**
  ```typescript
  { error: error instanceof Error ? error.message : 'Failed to set manager' }
  ```
- **Fix:** Return a generic error message in production.

### [CC-007] Transfer resolve notification uses `id` (transfer request ID) as `messageId`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:152
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `notifyAgent` call passes the transfer request UUID as `messageId`. This is semantically different from a message ID -- it is a transfer request ID. The `NotificationOptions.messageId` field documentation says "Message ID (for reference)" which implies an AMP message ID. This won't cause a bug (it's just used for display in the tmux notification), but it is semantically incorrect.
- **Evidence:**
  ```typescript
  notifyAgent({
    agentId: affectedAgent.id,
    agentName: affectedAgent.name,
    fromName: resolverName,
    subject,
    messageId: id,  // <-- this is a transfer request UUID, not a message ID
    priority: 'high',
    messageType: 'transfer-resolution',
  })
  ```
- **Fix:** Add a comment clarifying this is intentional (using transfer ID as reference), or prefix with `transfer:` to distinguish from AMP message IDs.

### [CC-008] `parseAMPAddress` does not validate empty name or tenant segments
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts`:117-143
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `parseAMPAddress` does not check for empty `name` (e.g., `@domain.tld`) or empty `tenant` (would be caught by `tenantParts.length === 0` only if there are fewer than 3 parts after `@`). Edge case: `@a.b.c` would return `{ name: '', tenant: 'a', provider: 'b.c' }` with an empty name. This is unlikely in practice but is not validated.
- **Evidence:**
  ```typescript
  const name = address.substring(0, atIndex)
  // name could be '' if address starts with '@'
  // No check: if (name.length === 0) return null
  ```
- **Fix:** Add `if (!name) return null` after extracting the name.

### [CC-009] `generateMessageId` uses `Math.random()` for message IDs
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts`:146-150
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `Math.random()` is not cryptographically secure. Message IDs are used for deduplication and reference but are not security-critical. However, since the file already imports `crypto`, using `crypto.randomBytes` or `crypto.randomUUID()` would be more robust with zero cost.
- **Evidence:**
  ```typescript
  function generateMessageId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 9)
    return `msg_${timestamp}_${random}`
  }
  ```
- **Fix:** Replace with `crypto.randomUUID()` or `crypto.randomBytes(8).toString('hex')` since `crypto` is already imported.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts` -- Clean, simple GET endpoint with proper null handling
- `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts` -- Well-structured with thorough input validation, duplicate detection, COS transfer prevention (R5.4), and proper authority checks

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 0 |
| SHOULD-FIX | 3 |
| NIT | 6 |

**Overall assessment:** The governance API routes are well-implemented with proper locking patterns (nested lock acquisition in consistent order prevents deadlocks), thorough input validation, and correct authority checks. The transfer approval flow correctly handles TOCTOU races via double-checking within locks. The message filter logic correctly handles all governance roles and team types. The main areas for improvement are cache invalidation, rate limit map hygiene, and minor security hardening of error messages.
