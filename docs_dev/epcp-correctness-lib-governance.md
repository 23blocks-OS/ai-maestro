# Code Correctness Report: lib-governance

**Agent:** epcp-code-correctness-agent
**Domain:** lib-governance
**Files audited:** 7
**Date:** 2026-02-16T20:31:00Z

## MUST-FIX

### [CC-001] forwardFromUI() bypasses governance message filter
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:360
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `forwardFromUI()` never calls `checkMessageAllowed()`. A closed-team member could forward a message to an agent outside their team, completely bypassing the governance messaging isolation (rules R6.1-R6.7). Only `sendFromUI()` (line 154) applies the filter. The `checkMessageAllowed` import at line 21 is used in `sendFromUI` but never in `forwardFromUI`.
- **Evidence:**
  ```typescript
  // sendFromUI (line 152-161) - HAS filter:
  if (fromAgent?.agentId && toResolved.agentId) {
    const filterResult = checkMessageAllowed({
      senderAgentId: fromAgent.agentId,
      recipientAgentId: toResolved.agentId,
    })
    if (!filterResult.allowed) {
      throw new Error(filterResult.reason || 'Message blocked by team governance policy')
    }
  }

  // forwardFromUI (line 360-533) - NO filter anywhere
  export async function forwardFromUI(options: ForwardFromUIOptions): Promise<...> {
    // ... resolves agents, builds message, routes ... but NEVER checks governance
  }
  ```
- **Fix:** Add `checkMessageAllowed()` check in `forwardFromUI()` after resolving both agents (around line 383), using the same pattern as `sendFromUI`.

### [CC-002] Governance filter silently skipped when recipient is unresolved
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:146-161
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When the recipient cannot be resolved to a registered agent, `toResolved.agentId` is set to empty string `''` (line 146). The governance filter guard at line 153 checks `toResolved.agentId` which is falsy for empty string, so the filter is SKIPPED entirely. This means messages to unresolved recipients bypass governance, even if the recipient name maps to an agent inside a closed team.
- **Evidence:**
  ```typescript
  // Line 145-146: unresolved recipients get empty agentId
  const toResolved: ResolvedAgent = toAgent || {
    agentId: '',  // Empty string is falsy
    alias: options.toAlias || toIdentifier,
    ...
  }

  // Line 153: guard is falsy when agentId is ''
  if (fromAgent?.agentId && toResolved.agentId) {  // '' is falsy -> filter skipped
    const filterResult = checkMessageAllowed(...)
  }
  ```
- **Fix:** Either (a) throw an error when recipient cannot be resolved in governance-enabled scenarios, or (b) attempt to resolve the recipient by name/alias before checking the filter, or (c) default to DENY when the recipient is unresolved and the sender is in a closed team.

## SHOULD-FIX

### [CC-003] saveGovernance() return value silently ignored in write operations
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:62-67, 87-91, 96-100
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `setPassword()`, `setManager()`, and `removeManager()` all call `saveGovernance()` which returns `false` on failure. None of them check this return value. If the file write fails (e.g., disk full, permission denied), the operation silently appears to succeed -- the `Promise<void>` resolves without error.
- **Evidence:**
  ```typescript
  // Line 62-67: setPassword ignores save result
  export async function setPassword(plaintext: string): Promise<void> {
    return withLock('governance', () => {
      const config = loadGovernance()
      config.passwordHash = bcrypt.hashSync(plaintext, BCRYPT_SALT_ROUNDS)
      config.passwordSetAt = new Date().toISOString()
      saveGovernance(config)  // return value ignored -- if false, caller never knows
    })
  }

  // Same pattern in setManager (line 87-91) and removeManager (line 96-100)
  ```
- **Fix:** Either throw an error inside `saveGovernance()` on failure (remove the try-catch-return-false pattern), or check the return value and throw in each caller.

### [CC-004] transfer-registry.ts uses `process.env.HOME || '~'` instead of `os.homedir()`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts:15
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** All other governance files use `os.homedir()` for the home directory path, but `transfer-registry.ts` uses `process.env.HOME || '~'`. The tilde `~` fallback is a bug because `path.join('~', '.aimaestro')` produces the literal string `~/.aimaestro` which is NOT expanded by Node.js -- only shells expand tildes. If `HOME` is unset (possible in some server environments), this would create a directory literally named `~` in the current working directory.
- **Evidence:**
  ```typescript
  // transfer-registry.ts:15 -- inconsistent and has broken fallback
  const AI_MAESTRO_DIR = path.join(process.env.HOME || '~', '.aimaestro')

  // governance.ts:18 -- correct pattern
  const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')

  // team-registry.ts:184 -- correct pattern
  const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
  ```
- **Fix:** Change to `path.join(os.homedir(), '.aimaestro')` and add `import os from 'os'`.

### [CC-005] loadTeams() migration writes to disk without file lock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:194-221
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** `loadTeams()` contains a migration path (lines 206-214) that calls `saveTeams()` when teams lack a `type` field. This write is NOT protected by the `withLock('teams', ...)` mechanism. If two concurrent requests trigger `loadTeams()` simultaneously, both could attempt the migration write concurrently. While this specific case writes the same data and is unlikely to corrupt, it sets a dangerous precedent and could cause partial writes on slower filesystems.
- **Evidence:**
  ```typescript
  export function loadTeams(): Team[] {
    try {
      // ... load and parse ...
      let needsSave = false
      for (const team of teams) {
        if (!team.type) {
          team.type = 'open'
          needsSave = true
        }
      }
      if (needsSave) {
        saveTeams(teams)  // Write without lock!
      }
      return teams
    }
    // ...
  }
  ```
- **Fix:** Either (a) make `loadTeams()` async and wrap the migration in `withLock('teams', ...)`, or (b) move migration to a startup-only function that runs once, or (c) accept this as a one-time migration that's inherently safe for idempotent data.

### [CC-006] `isChiefOfStaffAnywhere` and `getClosedTeamsForAgent` load teams independently per call
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:47-63
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `checkMessageAllowed()`, lines 47-48 call `getClosedTeamsForAgent()` for both sender and recipient (each loads teams from disk). Then lines 58-63 call `isManager()` and `isChiefOfStaffAnywhere()` (each loads governance/teams from disk again). A single call to `checkMessageAllowed` triggers 4-6 separate file reads. If the teams file changes between these reads (e.g., a team is deleted mid-check), the function could make an inconsistent access control decision.
- **Evidence:**
  ```typescript
  // Each of these calls reads teams.json from disk independently:
  const senderTeams = getClosedTeamsForAgent(senderAgentId)      // reads teams.json
  const recipientTeams = getClosedTeamsForAgent(recipientAgentId) // reads teams.json
  // ...
  if (isManager(senderAgentId)) { ... }                          // reads governance.json
  if (isChiefOfStaffAnywhere(senderAgentId)) { ... }             // reads teams.json again
  ```
- **Fix:** Load teams once at the top of `checkMessageAllowed()` and pass the teams list to helper functions, or add a caching layer with short TTL.

## NIT

### [CC-007] `isMeshForwarded` field in MessageFilterInput is declared but never used
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:15
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `isMeshForwarded` boolean property is declared in `MessageFilterInput` but is never read inside `checkMessageAllowed()`. Mesh-forwarded detection relies solely on `senderAgentId === null` (line 42). The unused field is dead code that could confuse future maintainers.
- **Evidence:**
  ```typescript
  export interface MessageFilterInput {
    senderAgentId: string | null
    recipientAgentId: string
    isMeshForwarded?: boolean  // Declared but never referenced in checkMessageAllowed()
  }
  ```
- **Fix:** Remove `isMeshForwarded` from the interface, or use it explicitly in the mesh-forwarding check for clarity.

### [CC-008] Inconsistent variable naming: `AI_MAESTRO_DIR` vs `AIMAESTRO_DIR`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts:15 vs governance.ts:18 and team-registry.ts:184
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `transfer-registry.ts` uses `AI_MAESTRO_DIR` (with underscore between AI and MAESTRO) while `governance.ts` and `team-registry.ts` use `AIMAESTRO_DIR` (no underscore). This inconsistency is cosmetic but could cause confusion during maintenance.
- **Fix:** Standardize to one naming convention across all governance library files.

### [CC-009] `Team.type` is optional in the type definition but all governance code assumes it exists
- **File:** /Users/emanuelesabetta/ai-maestro/types/team.ts:19
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `Team.type` is declared as `type?: TeamType` (optional), but `governance.ts` filters `team.type === 'closed'` (lines 120, 129, 138) and `team-acl.ts` checks `team.type !== 'closed'` (line 48). The `loadTeams()` migration ensures runtime correctness, but the type definition doesn't reflect the invariant that `type` is always present after loading. TypeScript won't warn if new code omits the migration.
- **Fix:** Either make `type` required in the `Team` interface (since the migration guarantees it), or explicitly handle `undefined` in all comparison sites.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/lib/file-lock.ts -- Clean. Correct in-process mutex implementation with proper queue management, FIFO ordering, and error-safe `withLock` wrapper with try/finally.
- /Users/emanuelesabetta/ai-maestro/lib/team-acl.ts -- Clean. Correct decision order, handles all cases (web UI, not found, open, manager, COS, member, deny). Clear documentation.

## Test Coverage Assessment

Tests exist for:
- `tests/governance.test.ts` -- covers governance.ts
- `tests/message-filter.test.ts` -- covers message-filter.ts
- `tests/validate-team-mutation.test.ts` -- covers validateTeamMutation in team-registry.ts
- `tests/team-registry.test.ts` -- covers team-registry.ts CRUD
- `tests/transfer-registry.test.ts` -- covers transfer-registry.ts

No tests found for:
- `lib/message-send.ts` -- No unit tests for `sendFromUI` or `forwardFromUI`. The governance bypass in `forwardFromUI` (CC-001) would have been caught with a test that attempts to forward a message across closed-team boundaries.
- `lib/team-acl.ts` -- No dedicated unit tests (logic is simple enough that manual review suffices, but tests would prevent regression).
- `lib/file-lock.ts` -- No dedicated unit tests for the lock mechanism (concurrent access, queue ordering, error propagation).
