# Compatibility Report: origin/main Service Layer vs feature/team-governance lib/ Files

Generated: 2026-02-20T02:35Z

## Summary

**CRITICAL INCOMPATIBILITY DETECTED.** Origin/main's `services/teams-service.ts` calls lib functions with signatures that differ fundamentally from our `feature/team-governance` branch. Merging will break compilation. There are also type-level incompatibilities in `types/team.ts` and missing/extra files in both branches.

---

## 1. Signature Mismatches (BREAKING)

### 1.1 `createTeam` -- INCOMPATIBLE

| Aspect | origin/main | feature/team-governance |
|--------|-------------|------------------------|
| **Signature** | `createTeam(data: { name, description?, agentIds }): Team` | `createTeam(data: { name, description?, agentIds, type?, chiefOfStaffId? }, managerId?, reservedNames?): Promise<Team>` |
| **Return** | `Team` (sync) | `Promise<Team>` (async, uses `withLock`) |
| **Extra params** | None | `managerId`, `reservedNames` |
| **Governance fields** | No `type`, no `chiefOfStaffId` | Has `type` (TeamType), `chiefOfStaffId` |

**Impact:** Origin's service calls `createTeam({ name, description, agentIds: agentIds || [] })` with NO `managerId` or `reservedNames`. It also does NOT `await` the result. If our lib is used, this will:
1. Get a `Promise<Team>` where a `Team` is expected (data corruption / runtime error)
2. Miss governance validation entirely (no `managerId` passed)

### 1.2 `updateTeam` -- INCOMPATIBLE

| Aspect | origin/main | feature/team-governance |
|--------|-------------|------------------------|
| **Signature** | `updateTeam(id, updates): Team \| null` | `updateTeam(id, updates, managerId?, reservedNames?): Promise<Team \| null>` |
| **Return** | `Team \| null` (sync) | `Promise<Team \| null>` (async, uses `withLock`) |
| **Updates type** | `Partial<Pick<Team, 'name' \| 'description' \| 'agentIds' \| 'lastMeetingAt' \| 'instructions' \| 'lastActivityAt'>>` | Same fields PLUS `'type' \| 'chiefOfStaffId'` |
| **Extra params** | None | `managerId`, `reservedNames` |

**Impact:** Origin's service calls `updateTeam(id, { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt })` with NO `managerId`. It does NOT `await`. Same breakage as createTeam.

### 1.3 `deleteTeam` -- INCOMPATIBLE

| Aspect | origin/main | feature/team-governance |
|--------|-------------|------------------------|
| **Signature** | `deleteTeam(id): boolean` (sync) | `deleteTeam(id): Promise<boolean>` (async, uses `withLock`) |
| **Cleanup** | No orphan cleanup | Cleans up task + doc files for deleted team |

**Impact:** Origin's service does `const deleted = deleteTeam(id)` without `await`. Will get a `Promise` (truthy) instead of the actual boolean -- delete will always appear to succeed even if team doesn't exist.

### 1.4 `createTask` -- INCOMPATIBLE

| Aspect | origin/main | feature/team-governance |
|--------|-------------|------------------------|
| **Return** | `Task` (sync) | `Promise<Task>` (async, uses `withLock`) |

### 1.5 `updateTask` -- INCOMPATIBLE

| Aspect | origin/main | feature/team-governance |
|--------|-------------|------------------------|
| **Return** | `{ task: Task \| null; unblocked: Task[] }` (sync) | `Promise<{ task: Task \| null; unblocked: Task[] }>` (async, uses `withLock`) |

### 1.6 `deleteTask` -- INCOMPATIBLE

| Aspect | origin/main | feature/team-governance |
|--------|-------------|------------------------|
| **Return** | `boolean` (sync) | `Promise<boolean>` (async, uses `withLock`) |

### 1.7 Document functions (`createDocument`, `updateDocument`, `deleteDocument`) -- INCOMPATIBLE

All three are **sync** on origin/main but **async (Promise)** on our branch due to `withLock`.

---

## 2. Type-Level Incompatibilities

### 2.1 `types/team.ts` -- Team interface

| Field | origin/main | feature/team-governance |
|-------|-------------|------------------------|
| `type` | **MISSING** | `type: TeamType` (required) |
| `chiefOfStaffId` | **MISSING** | `chiefOfStaffId?: string \| null` |

**Impact:** Our governance code (validateTeamMutation, loadTeams migration, UI components) depends on `type` and `chiefOfStaffId` existing on Team. Origin's Team interface does not have these fields.

### 2.2 `types/governance.ts` -- MISSING on origin/main

Our branch has `types/governance.ts` defining `TeamType` ('open' | 'closed'). Origin/main does not have this file at all.

---

## 3. Files Present on One Branch Only

### Files on feature/team-governance but NOT origin/main:
| File | Purpose |
|------|---------|
| `lib/file-lock.ts` | `withLock()` for file-level locking (used by all registry write ops) |
| `lib/governance.ts` | Governance business rules engine |
| `lib/team-acl.ts` | Team access control lists |
| `lib/message-filter.ts` | Team-scoped message filtering |
| `lib/rate-limit.ts` | Rate limiting |
| `lib/validation.ts` | Input validation utilities |
| `lib/transfer-registry.ts` | Agent transfer records |
| `lib/tmux-discovery.ts` | Tmux session discovery |
| `types/governance.ts` | TeamType, governance types |

### Files on origin/main but NOT feature/team-governance:
| File | Purpose |
|------|---------|
| `lib/agent-runtime.ts` | Abstracted tmux operations (sessionExistsSync, killSessionSync, renameSessionSync) |
| `services/teams-service.ts` | Service layer for team API routes |

---

## 4. agent-registry.ts Changes on origin/main

Origin/main refactored `lib/agent-registry.ts` to use `lib/agent-runtime.ts` instead of inline `execSync('tmux ...')` calls. Key changes:
- Added import: `import { sessionExistsSync, killSessionSync, renameSessionSync } from '@/lib/agent-runtime'`
- Replaced all `require('child_process').execSync(...)` tmux calls with the new runtime functions
- Functions affected: `updateAgent()` (session rename), `killAgentSessions()`, `removeSessionFromAgent()`

Our branch does NOT have `lib/agent-runtime.ts`. If we take origin's agent-registry changes, we need the runtime module too.

---

## 5. Test Fixtures (origin/main)

Origin provides `tests/test-utils/fixtures.ts` with factory functions:

| Export | Description |
|--------|-------------|
| `resetFixtureCounter()` | Reset ID counter for test isolation |
| `makeAgent(overrides?)` | Create Agent with defaults |
| `makeAgentSession(overrides?)` | Create AgentSession |
| `makeSession(name?, overrides?)` | Create tmux Session |
| `makeTeam(overrides?)` | Create Team (NO `type` or `chiefOfStaffId` fields) |
| `makeTask(overrides?)` | Create Task |
| `makeDocument(overrides?)` | Create TeamDocument |
| `makeHost(overrides?)` | Create Host |
| `makeServiceResult(data?, error?, status?)` | Create ServiceResult wrapper |

**NOTE:** `makeTeam()` does NOT include `type` or `chiefOfStaffId` in its defaults -- it matches origin's Team interface, not ours. Our tests would need to add these fields via overrides.

---

## 6. Resolution Strategy

To merge origin/main's service layer with our governance enhancements, the following must happen:

1. **Make service layer governance-aware**: Origin's `teams-service.ts` must pass `managerId` and `reservedNames` to `createTeam`/`updateTeam`, and `await` all registry calls (since ours return Promises).

2. **Add `await` to all service calls**: Every call to `createTeam`, `updateTeam`, `deleteTeam`, `createTask`, `updateTask`, `deleteTask`, `createDocument`, `updateDocument`, `deleteDocument` must be `await`ed, and the service functions that call them must be `async`.

3. **Update Team type**: Merge our `type` and `chiefOfStaffId` fields into origin's `types/team.ts`.

4. **Add governance types**: Include `types/governance.ts` from our branch.

5. **Update test fixtures**: Add `type: 'open'` default to `makeTeam()` factory.

6. **Bring in file-lock.ts**: Origin removed it; we need it for concurrent access safety.

7. **Reconcile agent-registry.ts**: Either bring in `agent-runtime.ts` from origin (and adapt our branch's agent-registry), or keep our inline tmux calls.

---

## 7. Risk Assessment

| Risk | Severity | Description |
|------|----------|-------------|
| Sync/async mismatch | **CRITICAL** | All registry write functions return Promise on our branch, sync on origin. Service layer will silently get Promise objects instead of data. |
| Missing governance validation | **HIGH** | Origin's service creates/updates teams without governance checks (no managerId, no validateTeamMutation call). |
| Team type field missing | **HIGH** | Origin's Team interface lacks `type` and `chiefOfStaffId`. All governance UI/logic depends on these. |
| Path traversal protection removed | **MEDIUM** | Origin removed UUID validation from file path construction in task-registry and document-registry. Our branch has it. |
| Orphan cleanup removed | **LOW** | Origin's deleteTeam does not clean up task/doc files. Our branch does. |
| Timestamp management simplified | **LOW** | Origin removed backward-workflow timestamp clearing from updateTask. Our branch has complete timestamp lifecycle. |
