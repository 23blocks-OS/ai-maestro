# Merge Conflict Analysis: Task Routes

Generated: 2026-02-20

## Summary

The **origin/main** task routes are thin wrappers delegating to `services/teams-service.ts`. Our **feature/team-governance** branch has fat routes with inline governance logic (UUID validation, ACL checks, field validation). The service layer on origin/main already contains most of the same business logic but lacks governance features. Resolution requires merging our governance additions into the service layer.

---

## Architecture Comparison

| Aspect | origin/main | feature/team-governance (ours) |
|--------|-------------|-------------------------------|
| Route pattern | Thin wrapper -> service | Fat route with inline logic |
| Imports (tasks/route.ts) | `teams-service` only | `task-registry`, `team-registry`, `team-acl`, `validation` |
| Imports (tasks/[taskId]/route.ts) | `teams-service` only | `task-registry`, `team-registry`, `team-acl`, `validation` |
| UUID validation | None | `isValidUuid()` on all path params |
| ACL checks | None | `checkTeamAccess()` with X-Agent-Id header |
| JSON parse safety | None (implicit) | try/catch around `request.json()` |
| Field validation | In service layer | In route layer |
| createTask return | Sync (`Task`) | Async (`Promise<Task>`) via `withLock` |
| updateTask return | Sync (`{ task, unblocked }`) | Async (`Promise<{ task, unblocked }>`) via `withLock` |
| deleteTask return | Sync (`boolean`) | Async (`Promise<boolean>`) via `withLock` |

---

## Detailed Differences

### 1. `app/api/teams/[id]/tasks/route.ts` (GET + POST)

#### origin/main (26 lines)
- Imports: `listTeamTasks`, `createTeamTask` from `services/teams-service`
- GET: calls `listTeamTasks(id)`, returns `result.data` or `result.error`
- POST: calls `createTeamTask(id, body)`, returns `result.data` or `result.error`
- No try/catch, no UUID validation, no ACL, no field validation (all in service)

#### ours (109 lines)
- Imports: `loadTasks`, `resolveTaskDeps`, `createTask` from `lib/task-registry`; `getTeam` from `lib/team-registry`; `checkTeamAccess` from `lib/team-acl`; `isValidUuid` from `lib/validation`
- GET: UUID check -> team existence -> ACL check -> loadTasks -> resolveTaskDeps -> return
- POST: UUID check -> team existence -> ACL check -> JSON parse safety -> subject required check -> priority validation -> description validation -> assigneeAgentId validation -> blockedBy array validation -> `await createTask(...)` -> return 201

### 2. `app/api/teams/[id]/tasks/[taskId]/route.ts` (PUT + DELETE)

#### origin/main (33 lines)
- Imports: `updateTeamTask`, `deleteTeamTask` from `services/teams-service`
- PUT: calls `updateTeamTask(id, taskId, body)`, returns result
- DELETE: calls `deleteTeamTask(id, taskId)`, returns result
- No try/catch, no UUID validation, no ACL

#### ours (140 lines)
- Imports: `getTask`, `updateTask`, `deleteTask`, `wouldCreateCycle` from `lib/task-registry`; `getTeam` from `lib/team-registry`; `checkTeamAccess` from `lib/team-acl`; `isValidUuid` from `lib/validation`
- PUT: UUID check (id + taskId) -> team existence -> ACL -> task existence -> JSON parse safety -> priority validation -> description validation -> assigneeAgentId validation -> blockedBy cycle detection (self-ref + `wouldCreateCycle`) -> status enum validation -> build typed updates -> `await updateTask(...)` -> return `{ task, unblocked }`
- DELETE: UUID check (id + taskId) -> team existence -> ACL -> `await deleteTask(...)` -> return `{ success: true }`

---

## What Governance Logic Must Move Into Service

The following logic exists in our routes but NOT in `services/teams-service.ts` on origin/main:

### MUST add to service (governance features)
1. **UUID validation** (`isValidUuid`) on `teamId` and `taskId` -- prevents path traversal
2. **ACL checks** (`checkTeamAccess`) with `requestingAgentId` parameter -- enforces team access control
3. **JSON parse error handling** (try/catch on `request.json()`) -- stays in route (HTTP concern), not service
4. **Priority validation** (`typeof priority !== 'number' || priority < 0`) -- not in origin service
5. **Description type validation** (`typeof description !== 'string'`) -- not in origin service
6. **assigneeAgentId type validation** -- not in origin service
7. **Cycle detection** (`wouldCreateCycle`) -- already in origin service
8. **Status enum validation** -- already in origin service (uses `VALID_TASK_STATUSES`)
9. **Self-dependency check** (`depId === taskId`) -- not in origin service (only in our routes)

### Already in origin service (no action needed)
- Team existence check (`getTeam`)
- Task existence check (`getTask`)
- Subject required validation
- blockedBy array-of-strings validation
- Circular dependency check (`wouldCreateCycle`)
- Status enum validation

### Must stay in route (HTTP concerns)
- JSON parse error handling (try/catch `request.json()`)
- Reading `X-Agent-Id` from headers

---

## CRUD Signature Differences

### createTask (lib/task-registry.ts)

| | origin/main | ours |
|--|-------------|------|
| Return type | `Task` (sync) | `Promise<Task>` (async, `withLock`) |
| Null coalesce | `\|\|` for assigneeAgentId | `??` for assigneeAgentId and blockedBy |

The service on origin/main calls `createTask(...)` synchronously. Our route calls `await createTask(...)`. The service must be updated to `await` the result.

### updateTask (lib/task-registry.ts)

| | origin/main | ours |
|--|-------------|------|
| Return type | `{ task: Task \| null; unblocked: Task[] }` (sync) | `Promise<{ task: Task \| null; unblocked: Task[] }>` (async, `withLock`) |
| Timestamp clearing | No backward-movement clearing | Clears `completedAt` when moving away from completed; clears `startedAt` when moving to backlog/pending |

The service on origin/main calls `updateTask(...)` synchronously. Must become `await`.

### deleteTask (lib/task-registry.ts)

| | origin/main | ours |
|--|-------------|------|
| Return type | `boolean` (sync) | `Promise<boolean>` (async, `withLock`) |

Same shape, just async.

---

## Field Validation Differences

| Field | origin/main service | our routes |
|-------|-------------------|------------|
| `subject` | `!subject \|\| typeof !== 'string' \|\| !subject.trim()` | Same |
| `priority` | Not validated | `typeof !== 'number' \|\| priority < 0` |
| `description` | Not validated | `typeof !== 'string'` |
| `assigneeAgentId` | Not validated | `typeof !== 'string'` |
| `blockedBy` items type | Validated | Validated (same) |
| `blockedBy` self-ref | Not checked | `depId === taskId` check |
| `status` enum | Validated | Validated (same) |

---

## Resolution Strategy

To resolve the conflict, the service layer (`services/teams-service.ts`) should be updated to:

1. **Add UUID validation** calls at the top of each function (import `isValidUuid` from `lib/validation`)
2. **Add ACL check** accepting an optional `requestingAgentId` parameter (import `checkTeamAccess` from `lib/team-acl`)
3. **Add field validations** for priority, description, assigneeAgentId, self-dependency
4. **Make functions async** since `createTask`, `updateTask`, `deleteTask` now return Promises (due to `withLock`)
5. **Keep routes thin** -- routes extract HTTP concerns (headers, JSON parse) and pass to service

The route files should match origin/main's thin-wrapper pattern, with only these route-level concerns:
- Extracting path params
- Parsing JSON body (with try/catch)
- Reading `X-Agent-Id` header
- Calling service function with params
- Returning HTTP response from service result
