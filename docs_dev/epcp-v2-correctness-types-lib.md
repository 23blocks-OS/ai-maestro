# Code Correctness Report: types-and-lib

**Agent:** epcp-code-correctness-agent
**Domain:** types-and-lib
**Files audited:** 10
**Date:** 2026-02-17T00:18:00Z

## MUST-FIX

### [CC-001] task-registry.ts: No file locking on write operations — race condition
- **File:** /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:95,132,179
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `createTask()`, `updateTask()`, and `deleteTask()` all perform read-modify-write sequences (`loadTasks` -> mutate -> `saveTasks`) without any file locking. Unlike `team-registry.ts`, `transfer-registry.ts`, and `governance.ts`, which all use `withLock()` from `@/lib/file-lock`, `task-registry.ts` does not import or use `withLock` at all. Two concurrent API requests to create/update/delete tasks on the same team will race: both read the same file, mutate independently, and the second write silently overwrites the first, losing data.
- **Evidence:**
  ```typescript
  // lib/task-registry.ts — NO withLock anywhere in this file
  export function createTask(data: { teamId: string; ... }): Task {
    const tasks = loadTasks(data.teamId)  // READ
    // ... build task ...
    tasks.push(task)                       // MUTATE
    saveTasks(data.teamId, tasks)          // WRITE — can overwrite concurrent changes
    return task
  }
  ```
  Compare with `team-registry.ts` which wraps every write in `withLock('teams', () => { ... })`.
- **Fix:** Import `withLock` from `@/lib/file-lock` and wrap `createTask`, `updateTask`, and `deleteTask` in `withLock('tasks-' + teamId, ...)`. This requires making them `async` (matching the pattern in `team-registry.ts`). Note: `wouldCreateCycle` is read-only and does not need locking.

## SHOULD-FIX

### [CC-002] team-registry.ts deleteTeam: No UUID validation on task file cleanup path
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:310
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `deleteTeam` constructs a task file path as `path.join(TEAMS_DIR, \`tasks-\${id}.json\`)` without validating that `id` is a proper UUID or applying `path.basename()`. While this is safe in practice because `deleteTeam` only reaches the `fs.unlinkSync` call if the `id` matched an existing team (which was created with `uuidv4()`), it lacks the defense-in-depth that `task-registry.ts:tasksFilePath()` provides (UUID regex + `path.basename()`). If the filter logic were ever refactored to allow deletion by criteria other than exact ID match, this could become a path traversal vulnerability.
- **Evidence:**
  ```typescript
  // team-registry.ts:310 — no validation
  const taskFile = path.join(TEAMS_DIR, `tasks-${id}.json`)
  try { if (fs.existsSync(taskFile)) fs.unlinkSync(taskFile) } catch {}

  // Compare: task-registry.ts:23-27 — validates UUID + uses path.basename()
  function tasksFilePath(teamId: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(teamId)) throw new Error('Invalid team ID')
    return path.join(TEAMS_DIR, path.basename(`tasks-${teamId}.json`))
  }
  ```
- **Fix:** Add the same UUID validation before constructing the task file path: `if (!/^[0-9a-f-]{36}$/i.test(id)) return true` or extract the validation pattern from `tasksFilePath` into a shared helper.

### [CC-003] message-filter.ts: COS not in agentIds would be invisible to the filter
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:52-54
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The message filter determines if an agent is in a closed team by checking `t.agentIds.includes(senderAgentId)` (line 52). If a COS is listed in `chiefOfStaffId` but NOT in `agentIds`, they would not appear in `senderTeams` and would be treated as "not in any closed team" — skipping all closed-team filter rules and falling through to the default allow at line 121. While `validateTeamMutation` (R4.6) auto-adds COS to `agentIds`, manual edits to the JSON file or data corruption could break this invariant.
- **Evidence:**
  ```typescript
  // message-filter.ts:52 — only checks agentIds membership
  const senderTeams = closedTeams.filter(t => t.agentIds.includes(senderAgentId))
  // ...
  // A COS not in agentIds would have senderTeams=[], senderInClosed=false
  // Then line 60 agentIsCOS() would be true, but line 73 checks agentIsCOS AFTER
  // the "neither in closed team" shortcut at line 63, so it would never reach step 4.
  ```
  Wait -- let me re-check. Line 60 `agentIsCOS` checks `closedTeams.some(t => t.chiefOfStaffId === id)`. And line 63 only short-circuits when BOTH sender and recipient are not in closed teams. If the recipient IS in a closed team, the filter proceeds to step 3 (manager check) then step 4 (COS check), which correctly uses `agentIsCOS()`. So the actual issue is narrower: a COS not in `agentIds` would only be affected if BOTH parties are outside any closed team, which would correctly allow the message. The real risk is in step 4 line 83: `senderTeams.some(team => team.agentIds.includes(recipientAgentId))` — if COS is not in `agentIds`, `senderTeams` is empty, so they can only reach manager and other COS, not their own team members.
- **Fix:** In the COS-specific logic (step 4), also derive COS teams from `closedTeams.filter(t => t.chiefOfStaffId === senderAgentId)` rather than relying solely on `senderTeams` (which comes from `agentIds`). Or add a defensive check in `loadTeams()` to repair COS not in agentIds.

### [CC-004] governance.ts verifyPassword: timing-safe comparison not used for password presence check
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:66-72
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** `verifyPassword()` returns `false` immediately when `config.passwordHash` is null (line 69), creating a timing difference between "no password set" and "wrong password". While `bcrypt.compareSync` itself is timing-safe, the early return reveals whether a password has been set at all. For a localhost-only Phase 1 application this is low risk, but it's a minor information leak.
- **Evidence:**
  ```typescript
  export function verifyPassword(plaintext: string): boolean {
    const config = loadGovernance()
    if (!config.passwordHash) {
      return false  // fast return — reveals "no password set"
    }
    return bcrypt.compareSync(plaintext, config.passwordHash)  // slow return
  }
  ```
- **Fix:** When no password is set, still run a dummy `bcrypt.compareSync` against a static hash to maintain constant timing. Or document this as an accepted risk for Phase 1.

## NIT

### [CC-005] task-registry.ts tasksFilePath: UUID regex allows invalid UUIDs
- **File:** /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:25
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The regex `/^[0-9a-f-]{36}$/i` matches any 36-character string of hex chars and hyphens, including strings like `------------------------------------` (36 hyphens) or `0000000000000000000000000000000000--`. A proper UUID v4 regex would enforce the `8-4-4-4-12` group pattern. This is extremely unlikely to be exploited in practice since team IDs are generated by `uuidv4()`.
- **Evidence:**
  ```typescript
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) throw new Error('Invalid team ID')
  ```
- **Fix:** Use a stricter UUID pattern: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`

### [CC-006] message-send.ts: `(s: any)` type annotation in session status check
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:306,510
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Two occurrences of `recipientFullAgent?.sessions?.some((s: any) => s.status === 'online')` use `any` type for the session parameter. Since `getAgent()` returns a typed agent with typed sessions, the `any` annotation suppresses type checking unnecessarily.
- **Evidence:**
  ```typescript
  // line 306 and line 510
  !recipientFullAgent?.sessions?.some((s: any) => s.status === 'online')
  ```
- **Fix:** Remove `any` annotation and let TypeScript infer the session type from the agent registry type, or use the proper `AgentSession` type.

### [CC-007] team-registry.ts: `updates as Record<string, unknown>` unsafe cast in updateTeam
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:284
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `validateTeamMutation` accepts `data` typed as `{ name?: string; type?: string; chiefOfStaffId?: string | null; agentIds?: string[] }`. The caller `updateTeam` casts its `updates` parameter with `as Record<string, unknown>`. This silences TypeScript but doesn't actually verify that extra properties (like `description`, `lastMeetingAt`, etc.) won't confuse the validator. Currently safe because the validator only reads known keys, but the cast defeats compile-time safety.
- **Evidence:**
  ```typescript
  const result = validateTeamMutation(teams, id, updates as Record<string, unknown>, managerId ?? null)
  ```
- **Fix:** Extract only the governance-relevant fields before passing to `validateTeamMutation`: `{ name: updates.name, type: updates.type, chiefOfStaffId: updates.chiefOfStaffId, agentIds: updates.agentIds }`.

### [CC-008] transfer-registry.ts cleanupOldTransfers: ISO string comparison for date cutoff
- **File:** /Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts:127
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The cleanup function compares ISO timestamps as strings: `(r.resolvedAt || r.createdAt) > cutoffStr`. While ISO 8601 strings in the same timezone (UTC) do sort lexicographically correctly, this is a pattern that can break subtly if timestamps ever include timezone offsets or non-standard formatting. All current code uses `new Date().toISOString()` which produces UTC strings, so this works today.
- **Evidence:**
  ```typescript
  const cutoffStr = cutoff.toISOString()
  const filtered = requests.filter(r => {
    if (r.status === 'pending') return true
    return (r.resolvedAt || r.createdAt) > cutoffStr
  })
  ```
- **Fix:** Consider using numeric comparison: `new Date(r.resolvedAt || r.createdAt).getTime() > cutoff.getTime()` for robustness.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/types/governance.ts` — Clean. Types are well-defined with strict version discriminant, null types explicit, optional fields marked correctly.
- `/Users/emanuelesabetta/ai-maestro/types/team.ts` — Clean. Comprehensive type definitions, proper use of discriminated unions for actions, all fields documented.
- `/Users/emanuelesabetta/ai-maestro/lib/file-lock.ts` — Clean. Correct in-process mutex implementation. Lock handoff logic is sound (held set maintained across waiters). `withLock` properly releases in `finally` block.
- `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` — Clean. Clear decision cascade, correct precedence (web UI > not found > open > manager > COS > member > deny). Imports match usage.

---

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 1 |
| SHOULD-FIX | 3 |
| NIT | 4 |
| CLEAN | 4 |

The single MUST-FIX (CC-001) is a concrete race condition in task-registry.ts where concurrent API requests can lose task data. All other registries in the codebase use `withLock` for this pattern, making this an oversight rather than a design choice.
