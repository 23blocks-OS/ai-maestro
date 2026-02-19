# Code Correctness Report: lib-teams

**Agent:** epcp-code-correctness-agent
**Domain:** lib-teams (team-registry, transfer-registry, task-registry)
**Files audited:** 3
**Date:** 2026-02-19T00:00:00Z

## MUST-FIX

### [CC-001] `loadTeams()` migration calls `saveTeams()` without holding a lock — concurrent data race
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:206-215
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `loadTeams()` is a public, non-async function called from many places (API GET routes, within `withLock` callbacks, etc.). When the one-time migration detects a team without a `type` field (line 208), it calls `saveTeams(teams)` on line 214. However, `loadTeams()` does not acquire any lock. If two concurrent requests both call `loadTeams()` and both trigger the migration, they will race on `writeFileSync`. More critically, `loadTeams()` is called *inside* `withLock('teams', ...)` callbacks (e.g., `createTeam` line 247, `updateTeam` line 279). If the migration fires inside that callback, it calls `saveTeams()` which is fine because it's already under the lock. But if the migration fires from an *unlocked* call (e.g., `getTeam()` on line 237, or any API GET handler), it writes to disk without synchronization, potentially clobbering a concurrent locked write.
- **Evidence:**
```typescript
// line 237 — getTeam reads without lock, can trigger migration write
export function getTeam(id: string): Team | null {
  const teams = loadTeams()  // <-- migration may call saveTeams() here, no lock
  return teams.find(t => t.id === id) || null
}
```
- **Fix:** Move the migration to a dedicated `migrateTeamsFile()` function called once at startup (e.g., in `server.mjs`), or wrap the migration save in `withLock('teams', ...)`. Alternatively, since the migration is idempotent and converges to the same result, accept the race and document it clearly (the comment on line 204 partially does this, but "safe without lock because migration is append-only" is inaccurate -- it's a full file rewrite via `writeFileSync`, not append-only).

### [CC-002] `resolveTransferRequest()` acquires 'transfers' lock inside the 'teams' lock — potential deadlock if lock ordering is violated elsewhere
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:94
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** The resolve route acquires `acquireLock('teams')` on line 42, then calls `resolveTransferRequest(id, ...)` on line 94, which internally calls `withLock('transfers', ...)`. This establishes a lock ordering of teams -> transfers. If any other code path acquires 'transfers' first and then 'teams', a deadlock results. Currently, no such reversed ordering exists in the codebase, but this is fragile — any future code that loads transfers and then modifies teams within a lock could deadlock.
- **Evidence:**
```typescript
// resolve/route.ts line 42
const releaseLock = await acquireLock('teams')
// ... line 94
resolved = await resolveTransferRequest(id, ...)  // acquires 'transfers' lock inside 'teams' lock
```
- **Fix:** Document the required lock ordering (`teams` before `transfers`) in a comment at the top of both registry files. Alternatively, refactor `resolveTransferRequest` to accept a `skipLock` parameter when called from within an already-locked context, or consolidate both operations under a single composite lock name.

## SHOULD-FIX

### [CC-003] `loadTeams()` migration comment claims "append-only" but it's a full file rewrite
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:204
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The comment on line 204 says "safe without lock because migration is append-only and convergent". The migration is convergent (idempotent — adding `type: 'open'` to teams missing it always produces the same result). However, it is NOT append-only — `saveTeams()` does a full `writeFileSync` of the entire teams array. In a race scenario, a concurrent `withLock('teams', ...)` write could be overwritten by the migration save. The comment misleads future developers into thinking the operation is safe when it has a narrow but real race window.
- **Evidence:**
```typescript
// line 204 — misleading comment
// One-time idempotent migration: safe without lock because migration is append-only and convergent
```
- **Fix:** Update the comment to accurately describe why it's acceptable (idempotent convergent rewrite) or add proper locking.

### [CC-004] `updateTask` does not reset `completedAt` when task is moved back from 'completed' to another status
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/task-registry.ts`:156-162
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a task transitions to `completed`, `completedAt` is set (line 160-161). However, if the task is later moved *back* from `completed` to e.g. `in_progress`, `completedAt` is never cleared. This means:
  1. A re-opened task retains a stale `completedAt` timestamp
  2. If the task is completed again, the `!tasks[index].completedAt` check on line 160 prevents updating the timestamp, so it keeps the old one

  Similarly, `startedAt` (line 157-158) has the same pattern — if a task is reset to `pending`, `startedAt` is never cleared.
- **Evidence:**
```typescript
// line 156-162
if ((updates.status === 'in_progress' || updates.status === 'review') && !tasks[index].startedAt) {
  tasks[index].startedAt = now
}
if (updates.status === 'completed' && !tasks[index].completedAt) {
  tasks[index].completedAt = now
}
// Missing: clear completedAt when moving away from 'completed'
// Missing: clear startedAt when moving back to 'backlog'/'pending'
```
- **Fix:** Add logic to clear `completedAt` when status moves away from `completed`, and optionally clear `startedAt` when status moves back to `backlog`/`pending`:
```typescript
if (updates.status && updates.status !== 'completed') {
  tasks[index].completedAt = undefined
}
```

### [CC-005] `createTeam` uses `data.type || 'open'` which treats empty string as falsy — inconsistent with validated type
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:261
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** After `validateTeamMutation` has already validated that `data.type` is either 'open' or 'closed' (or undefined), line 261 uses `data.type || 'open'` to set the type. The `||` operator treats empty string `''` as falsy. Although the validator would reject `''` before reaching this line, this is a defensive coding concern — the idiomatic pattern should be `data.type ?? 'open'` (nullish coalescing) to only default on `null`/`undefined`.
- **Evidence:**
```typescript
// line 261
type: data.type || 'open',  // Should be: data.type ?? 'open'
```
- **Fix:** Change `||` to `??` for semantic correctness: `type: data.type ?? 'open'`

### [CC-006] `getTeam()` is not protected by a lock — stale read possible during concurrent writes
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:236-239
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `getTeam()` calls `loadTeams()` without acquiring the 'teams' lock. If a concurrent `createTeam`/`updateTeam`/`deleteTeam` is mid-write, `getTeam()` could read a partially-written file (though `writeFileSync` is atomic on most OS-level implementations, `readFileSync` during a concurrent `writeFileSync` on the same path could theoretically return truncated data on some filesystems). More practically, `getTeam()` reads are used in API routes to check existence before performing mutations — this is a classic TOCTOU pattern.
- **Evidence:**
```typescript
export function getTeam(id: string): Team | null {
  const teams = loadTeams()  // no lock
  return teams.find(t => t.id === id) || null
}
```
Used in API routes like `app/api/teams/[id]/route.ts` to check team existence before calling `updateTeam()`.
- **Fix:** For Phase 1 (single process, localhost), this is acceptable since `writeFileSync` is effectively atomic on macOS. Document this as a known limitation for multi-process deployments.

### [CC-007] Transfer requests not validated for duplicate pending transfers for the same agent+team pair
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts`:48-71
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `createTransferRequest()` does not check whether a pending transfer already exists for the same `agentId` + `fromTeamId` + `toTeamId` combination. Multiple identical pending transfers can be created, leading to confusion and potential double-execution if both are approved.
- **Evidence:**
```typescript
export async function createTransferRequest(params: {
  agentId: string
  fromTeamId: string
  toTeamId: string
  requestedBy: string
  note?: string
}): Promise<TransferRequest> {
  return withLock('transfers', () => {
    const requests = loadTransfers()
    // No duplicate check here
    const request: TransferRequest = { ... }
    requests.push(request)
    saveTransfers(requests)
    return request
  })
}
```
- **Fix:** Add a duplicate check at the beginning of the lock callback:
```typescript
const existing = requests.find(r =>
  r.agentId === params.agentId &&
  r.fromTeamId === params.fromTeamId &&
  r.toTeamId === params.toTeamId &&
  r.status === 'pending'
)
if (existing) throw new Error('A pending transfer for this agent already exists')
```

### [CC-008] `createTeam` does not pass `reservedNames` to `validateTeamMutation` when `reservedNames` is `undefined`
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:250
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `createTeam` correctly passes `reservedNames` to `validateTeamMutation` (line 250). However, `updateTeam` on line 286 does NOT pass `reservedNames` at all. If an agent name collision check is important for create, it should also be enforced on rename (update with a new `name`).
- **Evidence:**
```typescript
// createTeam line 250 — passes reservedNames
const result = validateTeamMutation(teams, null, data, managerId ?? null, reservedNames)

// updateTeam line 286 — does NOT pass reservedNames
const result = validateTeamMutation(teams, id, govFields, managerId ?? null)
```
- **Fix:** Add `reservedNames` parameter to `updateTeam()` and pass it through to `validateTeamMutation()`.

## NIT

### [CC-009] `loadTransfers()` silently swallows JSON parse errors
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts`:31-37
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** If the transfers file is corrupted (invalid JSON), `loadTransfers()` catches the error and returns `[]`, effectively losing all transfer data. While this is a reasonable defensive choice for read operations, it means corruption is invisible. A corrupted file will be silently overwritten on the next save.
- **Evidence:**
```typescript
try {
  const raw = readFileSync(TRANSFERS_FILE, 'utf-8')
  const data: TransfersFile = JSON.parse(raw)
  return data.requests || []
} catch {
  return []
}
```
- **Fix:** Add `console.error` logging before returning `[]` (similar to how `loadTeams` on line 219 logs the error).

### [CC-010] `resolveTaskDeps` calls `loadAgents()` on every invocation — no caching
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/task-registry.ts`:64
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `resolveTaskDeps()` calls `loadAgents()` on every invocation, which reads and parses `registry.json` from disk each time. When the task list is rendered frequently (e.g., the 5-second polling from `useTasks` hook), this causes unnecessary disk I/O. The agent registry has internal caching (`_cachedAgents`), so the actual impact is mitigated, but the intent could be clearer.
- **Evidence:**
```typescript
export function resolveTaskDeps(tasks: Task[]): TaskWithDeps[] {
  const agents = loadAgents()  // Disk read on every call
  ...
}
```
- **Fix:** This is acceptable given the agent registry's internal cache. No action needed, but consider documenting the caching assumption.

### [CC-011] `deleteTeam` task file cleanup uses `path.basename` defensively but the UUID regex already prevents traversal
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:313-314
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Line 313 validates the UUID format with a strict regex, and line 314 additionally uses `path.basename()`. The `path.basename` call is defense-in-depth, which is good practice, but the regex already makes it impossible for `id` to contain path separators. The redundancy is fine but could be documented as intentional.
- **Evidence:**
```typescript
if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
  const taskFile = path.join(TEAMS_DIR, path.basename(`tasks-${id}.json`))
```
- **Fix:** No change needed — defense-in-depth is appropriate. Optionally add a brief comment noting the intentional double-guard.

### [CC-012] `createTask` default status is 'pending' but 'backlog' is the first status in `TaskStatus`
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/task-registry.ts`:114
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** New tasks are created with `status: 'pending'` (line 114), skipping 'backlog' which is the first status in the `TaskStatus` enum. The CLAUDE.md describes 5 statuses: `backlog -> pending -> in_progress -> review -> completed`. The default of 'pending' means tasks skip the backlog phase. This may be intentional (tasks created via API are considered already triaged), but it's worth documenting.
- **Evidence:**
```typescript
// types/task.ts
export type TaskStatus = 'backlog' | 'pending' | 'in_progress' | 'review' | 'completed'

// task-registry.ts line 114
status: 'pending',  // Skips 'backlog'
```
- **Fix:** Consider accepting an optional `status` in `createTask` params (it's not currently in the function signature) or document why 'pending' is the right default.

### [CC-013] `validateTeamMutation` character class `[\w \-.&()]` allows underscore via `\w` — inconsistent with documentation
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:92
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The regex on line 92 uses `\w` which matches `[a-zA-Z0-9_]`. The error message on line 93 lists "underscores" explicitly, so this is intentionally allowed. However, `\w` also matches Unicode word characters in some regex engines (though JavaScript's `\w` is ASCII-only). The code is correct for Node.js, but worth noting.
- **Evidence:**
```typescript
if (/[^\w \-.&()]/.test(clean)) {
  return { valid: false, error: '...allowed: letters, numbers, spaces, hyphens, underscores, dots, ampersands, parentheses)', code: 400 }
}
```
- **Fix:** No change needed — JavaScript `\w` is ASCII-only, matching the documented character set.

## CLEAN

Files with no critical issues beyond those documented above:
- `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts` — Well-structured, proper lock usage, clean error handling. Minor issues: CC-007 (duplicate check), CC-009 (silent error swallow).
- `/Users/emanuelesabetta/ai-maestro/lib/task-registry.ts` — Good path traversal protection, proper lock usage per team. Minor issues: CC-004 (timestamp reset), CC-010 (agent reload), CC-012 (default status).
- `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts` — Comprehensive validation, good security patterns. Issues: CC-001 (migration race), CC-003 (misleading comment), CC-005 (|| vs ??), CC-008 (missing reservedNames on update).

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 2 |
| SHOULD-FIX | 6 |
| NIT | 5 |
| **Total** | **13** |
