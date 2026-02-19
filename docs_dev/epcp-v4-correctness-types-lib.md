# Code Correctness Report: types-lib

**Agent:** epcp-code-correctness-agent
**Domain:** types-lib (types/governance.ts, types/team.ts, lib/governance.ts, lib/file-lock.ts, lib/team-acl.ts, lib/rate-limit.ts)
**Files audited:** 6
**Date:** 2026-02-19T00:00:00Z

## MUST-FIX

### [CC-001] recordFailure() does not reset expired windows — allows stale count accumulation
- **File:** /Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts:36-40
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `recordFailure()` is called for a key whose window has expired, it reuses the stale entry (with stale `resetAt` and accumulated `count`) instead of creating a fresh entry. The `checkRateLimit()` function correctly deletes expired entries on check, but if `recordFailure()` is called *without* a preceding `checkRateLimit()` call (or with a timing edge where the entry expires between the check and the record), the stale entry is incremented. More critically: consider the sequence:
  1. 4 failures happen (count=4, resetAt=T+60s)
  2. Window expires (T+60s passes)
  3. `checkRateLimit()` is called → deletes expired entry → returns allowed
  4. Password is wrong → `recordFailure()` is called
  5. `recordFailure` creates a NEW entry with count=1, resetAt=now+60s ← **this is correct**

  But consider this alternate sequence where the caller calls recordFailure without checkRateLimit first (not currently happening in the codebase, but the API contract is fragile):
  1. 4 failures (count=4, resetAt=T+60s)
  2. Window expires
  3. `recordFailure()` called directly → entry still exists with count=4, `entry.resetAt` is in the past
  4. count becomes 5 — immediately rate-limited despite window having expired

  The current callers (password/route.ts, manager/route.ts, chief-of-staff/route.ts) all call `checkRateLimit` before `recordFailure`, so the expired entry is cleaned up first. However, this makes the `recordFailure` API **silently order-dependent** — any caller that calls `recordFailure` without first calling `checkRateLimit` gets wrong behavior. The function should be self-contained.
- **Evidence:**
```typescript
// lib/rate-limit.ts:36-40
export function recordFailure(key: string, windowMs: number = DEFAULT_WINDOW_MS): void {
  const now = Date.now()
  const entry = limits.get(key) || { count: 0, resetAt: now + windowMs }
  // BUG: If entry exists but entry.resetAt < now, this reuses the expired entry
  // instead of creating a fresh one
  limits.set(key, { count: entry.count + 1, resetAt: entry.resetAt })
}
```
- **Fix:** Add an expiry check at the start of `recordFailure`:
```typescript
export function recordFailure(key: string, windowMs: number = DEFAULT_WINDOW_MS): void {
  const now = Date.now()
  let entry = limits.get(key)
  // Reset expired windows so recordFailure is self-contained
  if (entry && now >= entry.resetAt) {
    entry = undefined
    limits.delete(key)
  }
  const current = entry || { count: 0, resetAt: now + windowMs }
  limits.set(key, { count: current.count + 1, resetAt: current.resetAt })
}
```

## SHOULD-FIX

### [CC-002] loadGovernance() silently returns defaults on disk corruption — data loss risk
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:42-50
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `governance.json` contains invalid JSON (SyntaxError), `loadGovernance()` logs an error but returns `DEFAULT_GOVERNANCE_CONFIG`. If any subsequent write operation (e.g., `setPassword`, `setManager`) runs, it will overwrite the corrupted file with defaults, silently discarding the `managerId`, `passwordHash`, and `passwordSetAt`. The comment says "Manual inspection required" but the code does not prevent the overwrite. In a corruption scenario, the next governance mutation will wipe all governance state.
- **Evidence:**
```typescript
// lib/governance.ts:42-50
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('[governance] CORRUPTION: governance.json contains invalid JSON — returning defaults...')
    } else {
      console.error('[governance] Failed to read governance config:', error)
    }
    return { ...DEFAULT_GOVERNANCE_CONFIG }
  }
```
- **Fix:** On SyntaxError, either throw (fail-fast, matching the project's stated philosophy) or at minimum backup the corrupted file before returning defaults:
```typescript
if (error instanceof SyntaxError) {
  // Backup corrupted file before it gets overwritten
  const backupPath = GOVERNANCE_FILE + '.corrupted.' + Date.now()
  try { fs.copyFileSync(GOVERNANCE_FILE, backupPath) } catch {}
  console.error('[governance] CORRUPTION: governance.json backed up to', backupPath)
}
```

### [CC-003] Transfer resolve route acquires 'teams' lock but resolveTransferRequest acquires 'transfers' lock — potential deadlock ordering issue
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:42,94
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** The resolve route acquires lock `'teams'` at line 42, then calls `resolveTransferRequest()` at line 94 which internally acquires lock `'transfers'` (confirmed in transfer-registry.ts:98). This creates a lock ordering of teams→transfers. If any other code path acquires transfers→teams, a deadlock will occur. Currently no such path exists, but this implicit lock ordering dependency is undocumented and fragile. Adding a new code path that does `withLock('transfers', () => { /* uses loadTeams with lock */ })` would deadlock.
- **Evidence:**
```typescript
// resolve/route.ts:42
const releaseLock = await acquireLock('teams')
// ...
// resolve/route.ts:94 — inside the 'teams' lock
resolved = await resolveTransferRequest(id, ...)
// transfer-registry.ts:98 — acquires 'transfers' lock inside
```
- **Fix:** Document the lock ordering invariant (teams before transfers) as a comment in `file-lock.ts`, or better yet, have the resolve route acquire both locks atomically via a multi-lock helper.

### [CC-004] isManager() and other read-only governance functions re-read governance.json on every call
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:106-109,112-116,119-124,127-134,137-142
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `isManager()`, `isChiefOfStaff()`, `isChiefOfStaffAnywhere()`, `getClosedTeamForAgent()`, and `getClosedTeamsForAgent()` each perform synchronous `fs.readFileSync` on every call. In the transfer resolve route, `isManager()` is called at line 56, then `getManagerId()` at line 75, then `isChiefOfStaffAnywhere()` at line 78 — that's 3 separate file reads of governance.json plus 2 reads of teams.json within the same request, all for data that cannot change within a single request (it's under lock). The `message-filter.ts` file already demonstrates the correct pattern: take a single snapshot and derive all checks from it.
- **Evidence:**
```typescript
// Each of these reads governance.json from disk:
export function isManager(agentId: string): boolean {
  const config = loadGovernance() // fs.readFileSync
  return config.managerId === agentId
}
export function isChiefOfStaffAnywhere(agentId: string): boolean {
  const teams = loadTeams() // fs.readFileSync
  return teams.some(...)
}
```
- **Fix:** Either accept the I/O cost (Phase 1 performance is not critical) or provide a `GovernanceSnapshot` pattern similar to what `message-filter.ts` does. At minimum, document that these functions are intentionally stateless for simplicity.

### [CC-005] verifyPassword() not protected by file lock — TOCTOU with setPassword()
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:71-79
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** `verifyPassword()` reads the governance config without holding the `'governance'` lock. If `setPassword()` is called concurrently (which acquires the lock), `verifyPassword()` could read a partially-written file or a stale hash. With synchronous `writeFileSync` this is unlikely to cause a partial read on macOS (writes up to PIPE_BUF are atomic), but the JSON could be stale — verifying against the old password while a new one is being set. This is a minor issue in Phase 1 (localhost, single user) but violates the locking discipline used by all other governance functions.
- **Evidence:**
```typescript
// lib/governance.ts:71 — no lock acquisition
export async function verifyPassword(plaintext: string): Promise<boolean> {
  const config = loadGovernance() // reads without lock
  if (!config.passwordHash) return false
  return bcrypt.compare(plaintext, config.passwordHash)
}
```
- **Fix:** Wrap in `withLock('governance', ...)` for consistency, or document why it's intentionally lockless.

## NIT

### [CC-006] GovernanceConfig.version typed as literal `1` but loadGovernance does not validate it
- **File:** /Users/emanuelesabetta/ai-maestro/types/governance.ts:17, /Users/emanuelesabetta/ai-maestro/lib/governance.ts:39-41
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `version` field is typed as literal `1` for "future schema migrations", but `loadGovernance()` casts `JSON.parse(data)` directly to `GovernanceConfig` without checking that `version === 1`. If a future version bumps the schema to version 2, old code will silently load it as version 1 and potentially corrupt data.
- **Evidence:**
```typescript
// types/governance.ts:17
version: 1  // Strict discriminant for future schema migrations

// lib/governance.ts:39-41
const parsed: GovernanceConfig = JSON.parse(data)  // No version check
return parsed
```
- **Fix:** Add `if (parsed.version !== 1) throw new Error('Unsupported governance config version: ' + parsed.version)` after parsing.

### [CC-007] TeamType in types/team.ts re-exported from types/governance.ts creates coupling
- **File:** /Users/emanuelesabetta/ai-maestro/types/team.ts:11
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `types/team.ts` imports `TeamType` from `./governance`. This means the `Team` interface depends on `types/governance.ts`. While not a bug, it creates a coupling where the team type system depends on the governance type system. If governance types are ever split into a separate package, teams would need updating. The `TeamType = 'open' | 'closed'` definition is small enough to be defined in `team.ts` directly or in a shared `types/common.ts`.
- **Evidence:**
```typescript
// types/team.ts:11
import type { TeamType } from './governance'
```
- **Fix:** Minor — could define `TeamType` in team.ts or a shared file. Not urgent.

### [CC-008] file-lock.ts: double-release of lock is silently ignored but could cause subtle bugs
- **File:** /Users/emanuelesabetta/ai-maestro/lib/file-lock.ts:42-56
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** If a caller accidentally calls the release function twice (e.g., manual `acquireLock` usage in transfer resolve route), the second call to `releaseLock` will either wake a waiter prematurely or do a no-op `held.delete()` on an already-deleted name. The `withLock` wrapper prevents this, but direct `acquireLock` users (like the transfer resolve route) are vulnerable. A double-release could let two concurrent operations both proceed under what they believe is an exclusive lock.
- **Evidence:**
```typescript
// resolve/route.ts uses acquireLock directly
const releaseLock = await acquireLock('teams')
try { ... } finally { releaseLock() }
// If releaseLock() were called twice (coding error), it would wake the next waiter
// while the current holder still thinks it has the lock
```
- **Fix:** Add a guard in the release closure:
```typescript
let released = false
return Promise.resolve(() => {
  if (released) return
  released = true
  releaseLock(name)
})
```

### [CC-009] checkTeamAccess returns allowed:true for non-existent teams — may mask 404 bugs
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-acl.ts:47-50
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a team is not found, `checkTeamAccess` returns `{ allowed: true }` with the comment "let the caller deal with 404". This is intentional but means the ACL function never returns "team not found" — it always returns either allowed or denied. All callers must independently check team existence. If a caller forgets the existence check, they silently get access to a non-existent team's resources.
- **Evidence:**
```typescript
// lib/team-acl.ts:47-50
const team = getTeam(input.teamId)
if (!team) {
  return { allowed: true }  // Caller must handle 404 separately
}
```
- **Fix:** Consider adding a `teamExists: boolean` field to `TeamAccessResult` so callers can distinguish "allowed because open team" from "allowed because team not found". Not urgent — current callers all check existence.

### [CC-010] rate-limit cleanup interval uses setInterval without conditional module-scope guard
- **File:** /Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts:49-55
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `setInterval` cleanup runs at module import time as a side effect. While `.unref()` prevents it from blocking process exit, importing this module in a test environment will start a background timer. The `typeof setInterval !== 'undefined'` guard only protects against non-browser environments (not an issue in Node.js). In test environments, this could cause "open handles" warnings from vitest/jest.
- **Evidence:**
```typescript
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    // cleanup
  }, 5 * 60_000).unref()
}
```
- **Fix:** Guard with `if (typeof setInterval !== 'undefined' && process.env.NODE_ENV !== 'test')` or make the cleanup opt-in.

## CLEAN

Files with no issues found:
- (none — all files had at least one finding)

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 1 |
| SHOULD-FIX | 4 |
| NIT | 5 |
| **Total** | **10** |

The codebase is generally well-structured with clear separation of concerns. The governance pattern (file-based config + in-process locks + rate limiting) is appropriate for Phase 1 localhost deployment. The most important fix is CC-001 (rate limiter expired window bug) which could allow stale rate limit state if the API contract is not followed precisely.
