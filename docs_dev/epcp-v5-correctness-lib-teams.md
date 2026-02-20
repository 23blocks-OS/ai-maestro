# Code Correctness Report: lib-teams

**Agent:** epcp-code-correctness-agent
**Domain:** lib-teams (team-registry, transfer-registry, task-registry, document-registry)
**Files audited:** 4
**Date:** 2026-02-19T18:10:00Z

## MUST-FIX

### [CC-001] document-registry: Missing path traversal protection in docsFilePath()
- **File:** /Users/emanuelesabetta/ai-maestro/lib/document-registry.ts:23-24
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `docsFilePath()` does not validate the `teamId` parameter. Unlike `task-registry.ts` (line 27) which validates teamId as a strict UUID pattern and uses `path.basename()` as defense-in-depth, `document-registry.ts` directly interpolates the teamId into a file path. A malicious teamId like `../../etc/passwd` would construct a path outside the intended directory.
- **Evidence:**
  ```typescript
  // document-registry.ts:23-24 - NO validation
  function docsFilePath(teamId: string): string {
    return path.join(TEAMS_DIR, `docs-${teamId}.json`)
  }

  // Compare with task-registry.ts:24-29 - HAS validation
  function tasksFilePath(teamId: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId))
      throw new Error('Invalid team ID')
    return path.join(TEAMS_DIR, path.basename(`tasks-${teamId}.json`))
  }
  ```
- **Mitigating factor:** The API routes at `app/api/teams/[id]/documents/route.ts` call `getTeam(id)` first, which performs a lookup against the teams.json file. A malicious ID would not match any team and return 404 before `docsFilePath` is reached. However, this is defense-by-coincidence, not defense-in-depth. If any code path calls `loadDocuments()` or `saveDocuments()` directly without a prior `getTeam()` check (e.g., tests, future code, migration scripts), the traversal is exploitable.
- **Fix:** Add the same UUID validation and `path.basename()` defense that `tasksFilePath()` uses:
  ```typescript
  function docsFilePath(teamId: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId))
      throw new Error('Invalid team ID')
    return path.join(TEAMS_DIR, path.basename(`docs-${teamId}.json`))
  }
  ```

### [CC-002] team-registry deleteTeam: Orphaned document files not cleaned up
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:312-325
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a team is deleted, `deleteTeam()` cleans up the orphaned task file (`tasks-{id}.json`) but does NOT clean up the orphaned document file (`docs-{id}.json`). This leaves stale data on disk indefinitely.
- **Evidence:**
  ```typescript
  // team-registry.ts:318-323 - Cleans up tasks but NOT documents
  // Clean up orphaned task file for the deleted team
  if (/^[0-9a-f]{8}-...$/i.test(id)) {
    const taskFile = path.join(TEAMS_DIR, path.basename(`tasks-${id}.json`))
    try { if (fs.existsSync(taskFile)) fs.unlinkSync(taskFile) } catch { /* ignore */ }
  }
  // Missing: No cleanup for docs-{id}.json
  ```
- **Fix:** Add document file cleanup alongside the task file cleanup:
  ```typescript
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    const taskFile = path.join(TEAMS_DIR, path.basename(`tasks-${id}.json`))
    try { if (fs.existsSync(taskFile)) fs.unlinkSync(taskFile) } catch { /* ignore */ }
    const docsFile = path.join(TEAMS_DIR, path.basename(`docs-${id}.json`))
    try { if (fs.existsSync(docsFile)) fs.unlinkSync(docsFile) } catch { /* ignore */ }
  }
  ```

## SHOULD-FIX

### [CC-003] team-registry loadTeams: Migration saveTeams() call bypasses file lock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:218-221
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `loadTeams()` function calls `saveTeams()` directly (without a lock) during migration. When `loadTeams()` is called from inside `withLock('teams', ...)` blocks (lines 253, 286, 314), this is safe because the lock is already held. However, when `loadTeams()` is called from `getTeam()` (line 243), it runs without any lock. If two concurrent `getTeam()` calls both trigger the migration simultaneously, they could race on `saveTeams()`. The `migrationDone` flag is not atomic -- both calls could read `migrationDone === false` before either sets it to `true`.
- **Evidence:**
  ```typescript
  // line 218-221 - no lock, non-atomic flag check
  if (needsSave && !migrationDone) {
    migrationDone = true
    saveTeams(teams)
  }
  ```
- **Mitigating factor:** The migration is idempotent (both writes produce the same result), so the worst case is a redundant write, not data corruption. The `migrationDone` flag prevents repeated writes after the first process completes. This is a race-to-idempotent-write, not a lost-update race.
- **Fix:** Either wrap the migration in its own `withLock('teams', ...)` call (but beware re-entrancy since `loadTeams` is called inside lock callbacks), or accept the benign race and add a comment explaining why it's safe. Alternatively, move migration to a startup hook that runs once before any API calls.

### [CC-004] task-registry updateTask: Timestamp set/clear ordering has a no-op edge case
- **File:** /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:159-172
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When updating a task to `in_progress`, line 159 sets `startedAt = now` if it was not previously set. Then line 170-172 checks if the new status is `backlog` or `pending`, and if so, clears `startedAt`. The code sets then conditionally clears. This works correctly for single-status transitions, but consider: if a task moves from `completed` -> `in_progress`, line 162-163 skip (status != completed), then line 159 sets `startedAt` if not set (correct). But line 167-168 then checks `status !== 'completed'` which is TRUE, so it clears `completedAt` (correct -- task is no longer completed). So the logic is actually correct, but the ordering (set first, then clear) is confusing and fragile. A future change could easily introduce a bug.
- **Evidence:**
  ```typescript
  // Set timestamps
  if ((updates.status === 'in_progress' || updates.status === 'review') && !tasks[index].startedAt) {
    tasks[index].startedAt = now
  }
  if (updates.status === 'completed' && !tasks[index].completedAt) {
    tasks[index].completedAt = now
  }
  // Clear timestamps (potentially overrides what was just set above)
  if (updates.status && updates.status !== 'completed') {
    tasks[index].completedAt = undefined
  }
  if (updates.status && (updates.status === 'backlog' || updates.status === 'pending')) {
    tasks[index].startedAt = undefined
  }
  ```
- **Fix:** Reorganize to clear-first-then-set, or use a switch statement on the new status to make the intent explicit for each status transition.

### [CC-005] document-registry: createDocument uses `||` instead of `??` for boolean/array defaults
- **File:** /Users/emanuelesabetta/ai-maestro/lib/document-registry.ts:76-77
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Using `||` for default values on `pinned` and `tags` is incorrect for falsy values. `data.pinned || false` treats an explicitly passed `false` the same as `undefined`, which happens to work here since `false || false === false`. However, `data.tags || []` would discard an explicitly passed empty array `[]` since `[] || []` is `[]` (empty arrays are truthy in JS, so this actually works). The real issue is the `pinned` case: if someone passes `pinned: 0` (a number), `0 || false` yields `false`, which masks the type error. Using `??` would preserve the explicit value and only fall back for `null`/`undefined`.
- **Evidence:**
  ```typescript
  pinned: data.pinned || false,   // Should be: data.pinned ?? false
  tags: data.tags || [],           // Should be: data.tags ?? []
  ```
- **Mitigating factor:** The TypeScript types constrain `pinned` to `boolean | undefined` and `tags` to `string[] | undefined`, so the `||` vs `??` difference only matters if type safety is bypassed (e.g., `as any` casts, which the document API route DOES use on line 36).
- **Fix:** Replace `||` with `??` for both defaults.

### [CC-006] task-registry createTask: Uses `||` instead of `??` for assigneeAgentId default
- **File:** /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:117
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `data.assigneeAgentId || null` would convert an empty string `""` to `null`. While an empty string is likely not a valid agent ID, using `??` would be more precise and consistent with the type signature which accepts `string | null | undefined`.
- **Evidence:**
  ```typescript
  assigneeAgentId: data.assigneeAgentId || null,  // "" becomes null
  blockedBy: data.blockedBy || [],                 // [] is truthy, but consistency
  ```
- **Fix:** Use `data.assigneeAgentId ?? null` and `data.blockedBy ?? []`.

### [CC-007] transfer-registry: loadTransfers uses `|| []` instead of `?? []` for requests fallback
- **File:** /Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts:34
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `data.requests || []` would treat any falsy value of `requests` as empty. If the file contained `{ "version": 1, "requests": 0 }` (malformed), `||` silently returns `[]`, masking the corruption. Using `??` would only guard against `null`/`undefined`, and `Array.isArray()` should be used for proper validation (like `team-registry.ts` does on line 205).
- **Evidence:**
  ```typescript
  // transfer-registry.ts:34
  return data.requests || []

  // Compare with team-registry.ts:205 - proper validation
  const teams = Array.isArray(parsed.teams) ? parsed.teams : []
  ```
- **Fix:** Use `Array.isArray(data.requests) ? data.requests : []` for consistency with team-registry.

### [CC-008] document API route uses `as any` type assertion
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts:36
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The PUT handler constructs a `Record<string, unknown>` updates object and then casts it with `as any` when calling `updateDocument()`. This bypasses TypeScript type checking entirely and could pass invalid update shapes to the registry.
- **Evidence:**
  ```typescript
  const updates: Record<string, unknown> = {}
  // ... populate from body ...
  const document = await updateDocument(id, docId, updates as any)
  ```
- **Fix:** Type the updates object using the actual expected type:
  ```typescript
  const updates: Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>> = {}
  ```

## NIT

### [CC-009] team-registry: `\w` in regex allows underscore which is already listed separately
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:92
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The regex `[^\w \-.&()]` uses `\w` which matches `[a-zA-Z0-9_]`. The comment says "underscores" are allowed, and indeed they are via `\w`. But this means `_` is implicitly allowed through `\w` rather than being explicitly listed. This is not a bug, just a readability note.
- **Evidence:**
  ```typescript
  if (/[^\w \-.&()]/.test(clean)) {
    // \w = [a-zA-Z0-9_], so underscore is already included
  }
  ```

### [CC-010] task-registry: resolveTaskDeps calls loadAgents() on every invocation
- **File:** /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:65
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `resolveTaskDeps()` calls `loadAgents()` every time to resolve assignee names. The comment on line 64 notes that `loadAgents()` has internal caching, so this is not a performance bug. However, if the task list is empty, the agents are loaded unnecessarily.
- **Evidence:**
  ```typescript
  export function resolveTaskDeps(tasks: Task[]): TaskWithDeps[] {
    const agents = loadAgents()  // Called even if tasks is []
    // ...
  }
  ```
- **Fix:** Short-circuit: `if (tasks.length === 0) return []` before loading agents.

### [CC-011] team-registry: createTeam uses type assertion for sanitized.name
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:264
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `(result.sanitized.name as string) ?? data.name` uses a type assertion because `sanitized` is typed as `Record<string, unknown>`. The `sanitized` object is constructed in `validateTeamMutation` and is known to only contain valid values, but the generic `Record<string, unknown>` type forces the assertion.
- **Evidence:**
  ```typescript
  name: (result.sanitized.name as string) ?? data.name,
  agentIds: (result.sanitized.agentIds as string[]) ?? data.agentIds,
  ```
- **Fix:** Consider typing the `sanitized` return value more precisely in `validateTeamMutation`, e.g., `{ name?: string; agentIds?: string[] }`.

### [CC-012] transfer-registry: revertTransferToPending does not validate current status
- **File:** /Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts:130-146
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `revertTransferToPending()` reverts any transfer to pending regardless of its current status. It does not check if the transfer is already pending (in which case the revert is a no-op write). This is fine for a compensating action but could be guarded.
- **Evidence:**
  ```typescript
  // Reverts even if already pending - unnecessary disk write
  requests[idx] = {
    ...requests[idx],
    status: 'pending',
    // ...
  }
  saveTransfers(requests)
  ```
- **Fix:** Add `if (requests[idx].status === 'pending') return true` early return to avoid a redundant write.

## CLEAN

Files with no critical issues beyond those listed above:
- `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts` -- Well-structured with proper locking, duplicate detection, and date-based cleanup. Minor issues only (CC-007, CC-012).
- `/Users/emanuelesabetta/ai-maestro/lib/task-registry.ts` -- Solid path traversal protection, cycle detection, dependency resolution. Minor issues only (CC-004, CC-006, CC-010).
- `/Users/emanuelesabetta/ai-maestro/types/team.ts` -- Clean type definitions, no issues.
- `/Users/emanuelesabetta/ai-maestro/types/governance.ts` -- Clean type definitions, no issues.
- `/Users/emanuelesabetta/ai-maestro/types/task.ts` -- Clean type definitions, no issues.
- `/Users/emanuelesabetta/ai-maestro/types/document.ts` -- Clean type definitions, no issues.
- `/Users/emanuelesabetta/ai-maestro/lib/file-lock.ts` -- Correct in-process mutex implementation with proper queue management.

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| MUST-FIX | 2 | CC-001, CC-002 |
| SHOULD-FIX | 6 | CC-003, CC-004, CC-005, CC-006, CC-007, CC-008 |
| NIT | 4 | CC-009, CC-010, CC-011, CC-012 |
| **Total** | **12** | |

The two MUST-FIX issues are:
1. **CC-001**: Missing path traversal protection in document-registry (inconsistent with task-registry's defense)
2. **CC-002**: Orphaned document files not cleaned up on team deletion (inconsistent with task file cleanup)

Both are straightforward to fix by applying the same patterns already used in adjacent code.
