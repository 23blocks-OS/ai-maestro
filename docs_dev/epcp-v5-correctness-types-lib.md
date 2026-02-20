# Code Correctness Report: types-lib

**Agent:** epcp-code-correctness-agent
**Domain:** types-lib (types/governance.ts, types/team.ts, lib/governance.ts, lib/rate-limit.ts, lib/file-lock.ts, lib/team-acl.ts, lib/validation.ts)
**Files audited:** 7
**Date:** 2026-02-19T18:10:00Z

## MUST-FIX

_None found._

## SHOULD-FIX

### [CC-001] Non-atomic file writes in saveGovernance risk corruption on crash
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:63
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `saveGovernance()` calls `fs.writeFileSync(GOVERNANCE_FILE, ...)` directly. If the process crashes or is killed mid-write, the governance.json file can be left in a partially-written (corrupted) state. The file already has corruption detection and backup logic in `loadGovernance()` (lines 44-51), which proves this scenario is considered plausible. The standard safe pattern is write-to-temp-then-rename (atomic on POSIX).
- **Evidence:**
  ```typescript
  // line 63
  fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(config, null, 2), 'utf-8')
  ```
- **Fix:** Write to a temporary file in the same directory, then `fs.renameSync()` to the target path. This makes the write atomic. Note: this same pattern is missing in `lib/team-registry.ts:234` and `lib/transfer-registry.ts:45` (outside scope, but same issue).

### [CC-002] `loadGovernance` silently returns defaults on corruption without re-saving
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:42-56
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a `SyntaxError` is caught (corrupted JSON), the function backs up the corrupted file and returns defaults, but does NOT write the defaults back to `governance.json`. This means every subsequent call to `loadGovernance()` will re-read the corrupted file, hit the same error, and create a new backup file (each with a `Date.now()` suffix). The corruption state is persistent until an explicit `saveGovernance()` is called by some other code path.
- **Evidence:**
  ```typescript
  if (error instanceof SyntaxError) {
    console.error('[governance] CORRUPTION: ...')
    try {
      const backupPath = GOVERNANCE_FILE + '.corrupted.' + Date.now()
      fs.copyFileSync(GOVERNANCE_FILE, backupPath)
    } catch { /* backup is best-effort */ }
  }
  return { ...DEFAULT_GOVERNANCE_CONFIG }  // Does NOT call saveGovernance(DEFAULT_GOVERNANCE_CONFIG)
  ```
- **Fix:** After backing up the corrupted file, call `saveGovernance(DEFAULT_GOVERNANCE_CONFIG)` to heal the file. This matches the pattern already used in the "first-time initialization" path on lines 34-36.

### [CC-003] `verifyPassword` returns false when no password set -- may confuse callers
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:78-86
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `verifyPassword()` returns `false` both when (a) no password is set (`passwordHash === null`) and (b) when the password is wrong. Callers cannot distinguish "no password configured" from "wrong password". The caller at `/api/governance/password/route.ts` (line 23) works around this by checking `config.passwordHash` before calling `verifyPassword()`, but other future callers may not know to do this. The function's JSDoc says "Returns false if no password set" which documents the behavior, but the dual-meaning of `false` is still a contract smell.
- **Evidence:**
  ```typescript
  export async function verifyPassword(plaintext: string): Promise<boolean> {
    const config = loadGovernance()
    if (!config.passwordHash) {
      return false  // Same return value as "wrong password"
    }
    return bcrypt.compare(plaintext, config.passwordHash)
  }
  ```
- **Fix:** Consider returning a discriminated result like `{ valid: boolean; configured: boolean }` or `'no-password' | 'valid' | 'invalid'`. Alternatively, leave as-is since the JSDoc is clear and current callers are correct.

### [CC-004] `checkTeamAccess` returns `allowed: true` for non-existent teams
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-acl.ts:48-51
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When `getTeam(teamId)` returns `null`, the function returns `{ allowed: true }` with the comment "let the caller deal with 404." This is a permissive default that could mask bugs: if a caller forgets to check team existence separately, the ACL check will silently pass for any non-existent team ID. This is documented as intentional, but defensive design would prefer `allowed: false` for unknown entities.
- **Evidence:**
  ```typescript
  // 2. Team not found — let the caller deal with 404
  const team = getTeam(input.teamId)
  if (!team) {
    return { allowed: true }
  }
  ```
  VERIFIED: All current callers (`app/api/teams/[id]/route.ts`, `app/api/teams/[id]/tasks/route.ts`, `app/api/teams/[id]/tasks/[taskId]/route.ts`) DO check team existence before or after the ACL check, so this is not currently exploitable. But it's a fragile contract.
- **Fix:** Either return `{ allowed: true, reason: 'team-not-found' }` so callers can distinguish, or return `{ allowed: false, reason: 'team not found' }` and update callers to handle it.

## NIT

### [CC-005] `isValidUuid` regex accepts all UUID versions, not just v4
- **File:** /Users/emanuelesabetta/ai-maestro/lib/validation.ts:5-12
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The JSDoc says "Validates that a string is a valid UUID v4 format" but the regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` accepts any UUID (v1, v3, v4, v5, nil, etc.) since it doesn't check the version nibble (char 13 must be '4' for v4) or the variant bits (char 17 must be '8', '9', 'a', or 'b').
- **Evidence:**
  ```typescript
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  // Accepts: "00000000-0000-1000-0000-000000000000" (v1)
  // Accepts: "00000000-0000-0000-0000-000000000000" (nil UUID)
  ```
- **Fix:** Either fix the regex to enforce v4 (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`) or update the JSDoc to say "validates UUID-like format" since the function is used for path traversal prevention (where any hex format is sufficient).

### [CC-006] `isChiefOfStaff` does not guard against null/empty agentId
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:124-128
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `isManager()` (line 118) has an explicit guard `if (!config.managerId || !agentId) return false` to prevent `null === null` from being true. However, `isChiefOfStaff()` lacks an equivalent guard. If `team.chiefOfStaffId` is `null` and `agentId` is passed as an empty string, `null === ''` would correctly return `false`, so this isn't a bug per se, but the inconsistency in defensive guards could cause confusion in maintenance.
- **Evidence:**
  ```typescript
  // isManager has the guard:
  if (!config.managerId || !agentId) return false

  // isChiefOfStaff does not:
  export function isChiefOfStaff(agentId: string, teamId: string): boolean {
    const team = getTeam(teamId)
    if (!team) return false
    return team.chiefOfStaffId === agentId  // No guard for null/empty
  }
  ```
  The `Team.chiefOfStaffId` type is `string | null | undefined` (line 20 of types/team.ts), so if `agentId` were somehow `null` at runtime (TypeScript notwithstanding), `null === null` would yield a false positive. But the `string` type annotation on `agentId` makes this unlikely in practice.
- **Fix:** Add `if (!agentId) return false` for consistency with `isManager()`, or add a comment explaining why it's safe without the guard.

### [CC-007] `file-lock.ts` has no deadlock detection or timeout
- **File:** /Users/emanuelesabetta/ai-maestro/lib/file-lock.ts:33-48
- **Severity:** NIT
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `acquireLock()` will wait forever if a lock is never released (e.g., if the critical section throws and the release function is never called outside a `try/finally`). The `withLock()` helper correctly uses `try/finally`, but direct `acquireLock()` users (like the resolve route at line 56) must manually ensure release. If a bug causes the `finally` block not to execute, all subsequent callers for that lock name will hang indefinitely. There is no timeout or deadlock detection.
- **Evidence:**
  ```typescript
  // acquireLock returns a promise that resolves only when the lock is freed
  return new Promise<() => void>((resolve) => {
    if (!locks.has(name)) {
      locks.set(name, [])
    }
    locks.get(name)!.push(() => {
      resolve(() => releaseLock(name))
    })
  })
  ```
  VERIFIED: The direct caller at `app/api/governance/transfers/[id]/resolve/route.ts:56-148` correctly wraps in `try/finally { releaseLock() }`, so this is not currently exploitable.
- **Fix:** Consider adding an optional timeout parameter to `acquireLock()` that rejects the promise after N seconds. This would prevent silent hangs in production if a bug is introduced later.

### [CC-008] `rate-limit.ts` recordFailure does not increment atomically with check
- **File:** /Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts:13-43
- **Severity:** NIT
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `checkRateLimit()` and `recordFailure()` are separate functions called in sequence. In a concurrent scenario (multiple requests hitting the same endpoint simultaneously), two requests could both pass `checkRateLimit()` when count=4 and maxAttempts=5, then both call `recordFailure()`, incrementing to 6. This means one extra attempt gets through beyond the configured limit. However, since this is Node.js single-threaded and the operations are synchronous, this race cannot actually occur in the current runtime. This is purely a design note for future refactoring.
- **Evidence:**
  ```typescript
  // In password route (line 25-31):
  const rateCheck = checkRateLimit('governance-password-change')  // count=4, allowed=true
  // ... other async work ...
  recordFailure('governance-password-change')  // count becomes 5
  // A concurrent request could slip through between check and record
  ```
- **Fix:** Not needed for Phase 1 (single-threaded, localhost). If this is ever used in a multi-process deployment, combine check+record into a single `checkAndRecord()` function.

### [CC-009] `Team.type` field should default to 'open' in the type definition
- **File:** /Users/emanuelesabetta/ai-maestro/types/team.ts:19
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `Team.type` is declared as `TeamType` (which is `'open' | 'closed'`) with no optionality marker. However, `checkTeamAccess` (team-acl.ts:54) checks `team.type !== 'closed'` rather than `team.type === 'open'`, which handles the case where `type` might be undefined at runtime (from old data without the field). This defensive check is good, but the type definition doesn't reflect the possibility of undefined. Pre-existing teams created before the governance feature may not have the `type` field in their JSON on disk.
- **Evidence:**
  ```typescript
  // types/team.ts:19 — type is required
  type: TeamType

  // team-acl.ts:54 — defensive check handles undefined
  if (team.type !== 'closed') {
    return { allowed: true }
  }
  ```
- **Fix:** Either make the field optional (`type?: TeamType`) and update the type to `TeamType | undefined`, or ensure a migration script populates `type: 'open'` for all existing teams on upgrade.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/types/governance.ts -- Clean. Types are well-defined with strict version discriminant. Default config constant is correct. TransferRequest interface covers all states.
- /Users/emanuelesabetta/ai-maestro/lib/validation.ts -- Functionally clean (NIT about JSDoc wording only). The regex correctly prevents path traversal which is its primary purpose.

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 0 |
| SHOULD-FIX | 4 |
| NIT | 5 |
| CLEAN | 2 |

**Overall assessment:** The code is well-structured with good defensive programming practices. The lock ordering documentation and enforcement is correct (VERIFIED: teams -> transfers ordering is consistent across all callers). Rate limiting, password hashing, and UUID validation are all correctly implemented. The main concerns are (1) non-atomic file writes risking corruption, (2) corruption recovery not healing the file, and (3) the permissive default for non-existent teams in the ACL check. None of these are currently exploitable given the Phase 1 localhost-only deployment model, but they should be addressed before any multi-user or remote deployment.
