# Code Correctness Report: types-lib

**Agent:** epcp-code-correctness-agent
**Domain:** types-lib
**Files audited:** 9
**Date:** 2026-02-17T01:47:00Z

## MUST-FIX

### [CC-001] `saveTasks` return value silently ignored in `createTask` and `updateTask`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:123, 177
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `saveTasks()` returns `false` on write failure (line 54-57), but `createTask()` (line 123) and `updateTask()` (line 177) ignore this return value and return the task as if the save succeeded. This means a caller will believe their task was created/updated when it actually was not persisted to disk. The `deleteTask()` function at line 196 has the same issue but is slightly mitigated by returning a boolean.
- **Evidence:**
  ```typescript
  // line 48-57: saveTasks returns boolean
  export function saveTasks(teamId: string, tasks: Task[]): boolean {
    try {
      // ...
      return true
    } catch (error) {
      console.error(...)
      return false  // <-- failure return
    }
  }

  // line 122-124: createTask ignores return value
  tasks.push(task)
  saveTasks(data.teamId, tasks)  // <-- return value discarded
  return task                     // <-- caller thinks save succeeded
  ```
- **Fix:** Check the return value of `saveTasks()` and throw an error if it returns `false`. Since these functions are wrapped in `withLock`, an error will propagate correctly. Example: `if (!saveTasks(data.teamId, tasks)) throw new Error('Failed to persist tasks')`

### [CC-002] `forwardFromUI` missing `fromLabel` and `fromVerified` fields on `forwardedMessage`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:426-453
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `forwardedMessage` object built in `forwardFromUI()` is missing the `fromLabel` and `fromVerified` fields that the `Message` interface declares (see messageQueue.ts line 27 and 30). In `sendFromUI()`, these fields are populated (line 214, 217), but in `forwardFromUI()` they are omitted. This means forwarded messages will have `fromLabel: undefined` and `fromVerified: undefined` instead of the expected values. Since `fromVerified` is used by `applyContentSecurity()` and UI rendering, its absence could cause security checks to treat the sender as unverified.
- **Evidence:**
  ```typescript
  // sendFromUI sets these (lines 214, 217):
  fromLabel: options.fromLabel || fromAgent?.displayName,
  fromVerified: isFromVerified,

  // forwardFromUI omits them entirely (line 426-453):
  const forwardedMessage: Message = {
    // ... no fromLabel, no fromVerified
  }
  ```
- **Fix:** Add `fromLabel: fromResolved.displayName,` and `fromVerified: true,` to the `forwardedMessage` object (forwarded messages are always from a local verified agent, as confirmed by the `senderPublicKeyHex: 'verified'` comment on line 525).

## SHOULD-FIX

### [CC-003] `parseAMPAddress` in `lib/types/amp.ts` returns `organization` but route.ts local version returns `tenant` — inconsistent API
- **File:** /Users/emanuelesabetta/ai-maestro/lib/types/amp.ts:84-99
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The exported `parseAMPAddress()` in `lib/types/amp.ts` uses a simple regex `^([^@]+)@([^.]+)\.(.+)$` that returns `{ name, organization, provider }`. But the local `parseAMPAddress()` in `app/api/v1/route/route.ts` (lines 117-143) uses a more robust multi-part domain parser that returns `{ name, tenant, provider, scope }`. The amp.ts regex will fail on multi-level domains like `agent@myrepo.github.acme.aimaestro.local` because `.+` would capture everything after the first dot, not just the provider. The two functions have different signatures (organization vs tenant) and different parsing semantics.
- **Evidence:**
  ```typescript
  // lib/types/amp.ts:90 - simple regex, returns 'organization'
  const match = address.match(/^([^@]+)@([^.]+)\.(.+)$/)
  // For "agent@org.aimaestro.local":
  //   name="agent", organization="org", provider="aimaestro.local" ✓
  // For "agent@scope.org.aimaestro.local":
  //   name="agent", organization="scope", provider="org.aimaestro.local" ✗ WRONG

  // route.ts:117-143 - robust parser, returns 'tenant'
  // Correctly handles scope.tenant.provider format
  ```
- **Fix:** Either (a) unify the two implementations so route.ts imports from amp.ts, or (b) document clearly that amp.ts `parseAMPAddress` only handles simple `name@org.provider` addresses. The field name mismatch (`organization` vs `tenant`) should be reconciled.

### [CC-004] `loadTeams` migration calls `saveTeams` without file lock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:206-215
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The migration path in `loadTeams()` calls `saveTeams()` directly (line 214), but `loadTeams()` is not wrapped in `withLock`. The comment on line 204 says "safe without lock because migration is append-only and convergent" -- this is partially correct (adding a default `type` field is idempotent), but the real risk is that two concurrent callers both detect `needsSave = true` and both call `saveTeams()` simultaneously, which performs `writeFileSync` on the same file. On most OSes this is atomic at the inode level, but not all. More importantly, if a concurrent `createTeam` or `updateTeam` call (which DO hold the lock) runs between the `readFileSync` and `writeFileSync` in `loadTeams`, the migration save will overwrite the concurrent mutation's changes.
- **Evidence:**
  ```typescript
  // line 194-222: loadTeams reads, migrates, writes WITHOUT lock
  export function loadTeams(): Team[] {
    // ...
    const data = fs.readFileSync(TEAMS_FILE, 'utf-8')
    // ... migration logic ...
    if (needsSave) {
      saveTeams(teams)  // No lock! Could race with createTeam/updateTeam
    }
    return teams
  }
  ```
- **Fix:** Either wrap the migration in `withLock('teams', ...)` (would require making `loadTeams` async, which has cascading effects), or perform the migration in a separate one-time startup function, or accept the race as documented but add a comment explaining the TOCTOU window.

### [CC-005] `checkMessageAllowed` uses agent ID string for recipient but callers pass alias as fallback
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:38, /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:158
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `checkMessageAllowed` expects `recipientAgentId` to be an agent UUID to check team membership via `t.agentIds.includes(recipientAgentId)` (line 53). But in `sendFromUI()` line 158, when the recipient is unresolved (e.g., remote), it falls back to `toResolved.alias || 'unknown'`. This alias string will never match any UUID in `agentIds`, so the filter will treat the recipient as "not in any closed team" and default to allowing the message. This could bypass the closed-team isolation rule (R6.5) if a closed-team member's alias is used instead of their UUID.
- **Evidence:**
  ```typescript
  // message-send.ts:158 - alias used as fallback
  recipientAgentId: toResolved.agentId || toResolved.alias || 'unknown',

  // message-filter.ts:53 - compared against UUIDs in agentIds
  const recipientTeams = closedTeams.filter(t => t.agentIds.includes(recipientAgentId))
  ```
- **Fix:** When the recipient cannot be resolved to a UUID, either (a) block the message with a clear error "unknown recipient", or (b) attempt to resolve the alias to a UUID before calling the filter, or (c) document that unresolved recipients bypass governance (which may be acceptable for remote/mesh targets).

### [CC-006] `updateTask` timestamp logic has a subtle bug with `completedAt` on re-completion
- **File:** /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:157-162
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Lines 157-162 set `startedAt` and `completedAt` only if not already set (`!tasks[index].startedAt`, `!tasks[index].completedAt`). But the `...updates` spread on line 150-154 has already been applied BEFORE these timestamp checks. So `tasks[index]` is the UPDATED object. If a task was previously completed (has `completedAt`), then moved back to `pending`, and then completed again, the `completedAt` will retain the OLD timestamp because `!tasks[index].completedAt` is false (it was never cleared). The `startedAt` has the same issue.
- **Evidence:**
  ```typescript
  // line 150-154: updates applied first
  tasks[index] = {
    ...tasks[index],
    ...updates,        // status changed to 'completed'
    updatedAt: now,
  }
  // line 160-162: completedAt only set if not already present
  if (updates.status === 'completed' && !tasks[index].completedAt) {
    tasks[index].completedAt = now  // WON'T run if task was previously completed
  }
  ```
- **Fix:** Either (a) clear `completedAt` and `startedAt` when status moves backward (e.g., to `pending` or `backlog`), or (b) always set `completedAt = now` when `status === 'completed'` regardless of prior value.

## NIT

### [CC-007] `parseQualifiedName` does not handle addresses with multiple `@` signs
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:46-51
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `parseQualifiedName` splits on `@` and checks if `parts.length === 2`. If a display name or malformed address contains multiple `@` signs (e.g., `user@org@host`), it would produce 3 parts and fall through to the else branch, treating the entire string as the identifier (including the `@` characters). This is unlikely in practice but worth noting.
- **Evidence:**
  ```typescript
  function parseQualifiedName(qualifiedName: string): { identifier: string; hostId: string | null } {
    const parts = qualifiedName.split('@')
    if (parts.length === 2) {
      return { identifier: parts[0], hostId: parts[1] }
    }
    return { identifier: qualifiedName, hostId: null }  // raw string with @ in it
  }
  ```
- **Fix:** Consider using `indexOf('@')` and `substring` for more predictable behavior with multiple `@` signs (consistent with the route.ts approach).

### [CC-008] `wouldCreateCycle` traverses "blocks" direction but checks for self-loop via `blockedBy` direction
- **File:** /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:204-221
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED (code is correct, but naming is confusing)
- **Description:** The `wouldCreateCycle` function checks whether adding `dependencyId` to `taskId`'s `blockedBy` would create a cycle. It does this by traversing from `dependencyId` following the "blocks" direction (line 217: tasks that have `currentId` in their `blockedBy`). This is CORRECT -- if you can reach `taskId` by following the "blocks" edges from `dependencyId`, adding the reverse edge would create a cycle. However, the variable name `blockers` on line 217 is confusing since it actually represents "tasks that this task blocks" (i.e., dependents), not blockers.
- **Evidence:**
  ```typescript
  // Line 217: 'blockers' is misleading - these are tasks BLOCKED BY currentId
  const blockers = tasks.filter(t => t.blockedBy.includes(currentId))
  ```
- **Fix:** Rename `blockers` to `dependents` or `blockedTasks` for clarity.

### [CC-009] `generateMessageId` uses `Math.random()` which is not cryptographically secure
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:57-59
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `generateMessageId()` uses `Math.random()` for the random portion of message IDs. While message IDs don't need to be cryptographically unpredictable (they're identifiers, not secrets), the `crypto` module is already imported in this file (line 17). Using `crypto.randomBytes()` or `crypto.randomUUID()` would be more robust and consistent with `transfer-registry.ts` which uses `randomUUID()`.
- **Evidence:**
  ```typescript
  import crypto from 'crypto'  // already imported
  // ...
  function generateMessageId(): string {
    const random = Math.random().toString(36).substring(2, 9)  // weak random
    return `msg-${timestamp}-${random}`
  }
  ```
- **Fix:** Use `crypto.randomBytes(6).toString('hex')` or `crypto.randomUUID().slice(0, 8)` for the random component.

### [CC-010] `AMP_RELAY_TTL_DAYS` parsed at module load time, not validated
- **File:** /Users/emanuelesabetta/ai-maestro/lib/types/amp.ts:26
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `parseInt(process.env.AMP_RELAY_TTL_DAYS || '7', 10)` will return `NaN` if the env var is set to a non-numeric string (e.g., `AMP_RELAY_TTL_DAYS=abc`). This `NaN` would silently propagate to relay TTL calculations.
- **Evidence:**
  ```typescript
  export const AMP_RELAY_TTL_DAYS = parseInt(process.env.AMP_RELAY_TTL_DAYS || '7', 10)
  // If AMP_RELAY_TTL_DAYS="abc" → parseInt("abc", 10) → NaN
  ```
- **Fix:** Add a fallback: `parseInt(...) || 7` or validate at startup.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/types/governance.ts` -- Well-structured types with clear documentation, proper discriminant version field, sensible defaults.
- `/Users/emanuelesabetta/ai-maestro/types/team.ts` -- Clean type definitions, exhaustive union types, good state machine modeling.
