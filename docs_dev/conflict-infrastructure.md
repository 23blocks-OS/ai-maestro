# Infrastructure Conflict Analysis: origin/main vs feature/team-governance

Generated: 2026-02-20T02:35Z
Base commit: f0d6cee (v0.23.9)
origin/main HEAD: v0.24.9
Our branch HEAD: v0.23.17

## Summary

Origin/main underwent a **massive service-layer refactoring** (v0.24.0) that:
1. Extracted all API route business logic into `services/*.ts` files (24 new service files)
2. Added a **headless mode** (API-only, no Next.js) via `services/headless-router.ts`
3. Replaced `global.*` bridges with `services/shared-state.ts` / `shared-state-bridge.mjs`
4. Abstracted tmux operations behind `lib/agent-runtime.ts` (AgentRuntime interface)
5. Moved `tsx` from devDependencies to dependencies (server now runs via `tsx server.mjs`)

Our governance branch will have **3 CRITICAL conflicts** and **2 MODERATE issues** when merging.

---

## CRITICAL CONFLICTS

### C1: task-registry.ts / document-registry.ts - Sync-to-Async Signature Break

**Severity: CRITICAL - Will cause runtime errors**

Our branch changed these functions from **sync to async** (wrapping in `withLock()`):
- `createTask()`: `Task` -> `Promise<Task>`
- `deleteTask()`: `boolean` -> `Promise<boolean>`
- `updateTask()`: `Task | null` -> `Promise<Task | null>`
- `createDocument()`: `TeamDocument` -> `Promise<TeamDocument>`
- `deleteDocument()`: `boolean` -> `Promise<boolean>`
- `updateDocument()`: `TeamDocument | null` -> `Promise<TeamDocument | null>`

Origin/main created `services/teams-service.ts` (460 lines) that calls ALL of these functions **synchronously** (no `await`):
```typescript
// origin/main services/teams-service.ts line ~215
const task = createTask({...})  // NOT awaited
// line ~271
const result = updateTask(teamId, taskId, {...})  // NOT awaited
// line ~300
const deleted = deleteTask(teamId, taskId)  // NOT awaited
// line ~341
const document = createDocument({...})  // NOT awaited
```

**Impact:** After merge, `teams-service.ts` will call our async functions without `await`, getting `Promise` objects instead of values. Tasks/documents will silently fail to be created/updated/deleted through the teams-service path.

**Fix required:** Add `await` to all 6 call sites in `services/teams-service.ts` AND change the calling functions to be `async`.

### C2: team-registry.ts - Major Additions Not in origin/main's teams-service.ts

**Severity: CRITICAL - Governance validation bypassed**

Our branch added ~174 lines of governance logic to `lib/team-registry.ts`:
- `TeamValidationException` class
- `sanitizeTeamName()` function
- `validateTeamMutation()` function (enforces R1.3-R4.7 governance rules)
- `withLock()` integration for file-level locking

Origin/main's new `services/teams-service.ts` does NOT call any of these governance functions. It does basic validation only:
```typescript
// origin/main: teams-service.ts createNewTeam()
if (!name || typeof name !== 'string') {
  return { error: 'Team name is required', status: 400 }
}
```

**Impact:** The entire governance validation layer (closed team rules, COS invariants, uniqueness checks, multi-closed-team restrictions) is completely bypassed when requests go through `services/teams-service.ts` (which is what `headless-router.ts` uses).

**Fix required:** Integrate `validateTeamMutation()` calls into `services/teams-service.ts` for both `createNewTeam()` and `updateTeamById()`.

### C3: headless-router.ts Has Teams Routes But No Governance Routes

**Severity: CRITICAL - Governance API unreachable in headless mode**

`services/headless-router.ts` (1265 lines) maps ALL team routes:
- `GET/POST /api/teams`
- `GET/PUT/DELETE /api/teams/[id]`
- `GET/POST /api/teams/[id]/tasks`
- `PUT/DELETE /api/teams/[id]/tasks/[taskId]`
- `GET/POST /api/teams/[id]/documents`
- etc.

But it has **ZERO governance routes**. The following routes from our branch are completely missing:
- `/api/governance` (GET)
- `/api/governance/manager` (GET/PUT)
- `/api/governance/password` (POST/PUT)
- `/api/governance/reachable` (GET)
- `/api/governance/transfers/` (GET/POST)
- `/api/governance/transfers/[id]/resolve` (POST)

**Impact:** In headless mode (`MAESTRO_MODE=headless`), all governance endpoints return 404. Governance is fully nonfunctional without Next.js.

**Fix required:** Add governance route mappings to `headless-router.ts` and create a corresponding `services/governance-service.ts` to extract the business logic from the API routes.

---

## MODERATE ISSUES

### M1: notification-service.ts Refactored to Use AgentRuntime

**Severity: MODERATE - Our code still works but uses deprecated pattern**

Origin/main changed `lib/notification-service.ts`:
- Removed direct `execAsync('tmux ...')` calls
- Now imports `getRuntime()` from `@/lib/agent-runtime`
- Uses `runtime.sessionExists()` and `runtime.sendKeys()` instead

Our governance transfer route (`app/api/governance/transfers/[id]/resolve/route.ts`) imports `notifyAgent` from `@/lib/notification-service`. The function signature is **unchanged** (`notifyAgent(options: NotificationOptions): Promise<NotificationResult>`), so our import still works.

**Impact:** No immediate breakage. Our governance code calling `notifyAgent()` will work because the function's public API is stable. However, the internal implementation now goes through `AgentRuntime` rather than direct `execAsync`.

**Fix: None required for functionality.** The notifyAgent API is stable.

### M2: types/agent.ts and types/session.ts Have New Optional Fields

**Severity: LOW - Additive changes only**

New fields added on origin/main:
- `types/agent.ts`: `runtime?: 'tmux' | 'docker' | 'api' | 'direct'` (optional)
- `types/session.ts`: `socketPath?: string` (optional)

**Impact:** These are purely additive optional fields. Our governance code does not import from or depend on these specific interfaces. No breakage.

**Fix: None required.**

---

## INFORMATIONAL CHANGES

### I1: server.mjs Architecture Change

The server now:
- Uses `startServer(handleRequest)` pattern instead of `app.prepare().then()`
- Imports shared state from `services/shared-state-bridge.mjs` instead of using `global.*`
- Supports two modes: `full` (Next.js + UI) and `headless` (API-only)
- Replaced `node server.mjs` with `tsx server.mjs` in package.json scripts

**Impact on governance:** None. Our governance routes are Next.js API routes in `app/api/governance/`, which work in `full` mode. They are NOT available in `headless` mode (see C3).

### I2: CI Workflow Change

Single change: `mkdir -p data` added before `touch data/.help-build-success` in the build step.

**Impact on governance:** None. This is a pre-existing CI fix unrelated to governance.

### I3: package.json Changes

- Version bumped from 0.23.9 to 0.24.9
- `tsx` moved from devDependencies to dependencies
- New scripts: `headless`, `headless:prod`, `test:services`, `test:lib`
- New test separation: `tests/services/` directory with `teams-service.test.ts`

**Impact on governance:** Our governance tests in `tests/` need to coexist with the new `tests/services/` directory. No conflicts expected since our test files have different names.

### I4: New Service Layer (24 files)

Origin/main extracted API route logic into pure service functions:
```
services/
  agents-core-service.ts
  agents-chat-service.ts
  agents-directory-service.ts
  agents-docker-service.ts
  agents-docs-service.ts
  agents-graph-service.ts
  agents-memory-service.ts
  agents-messaging-service.ts
  agents-playback-service.ts
  agents-repos-service.ts
  agents-skills-service.ts
  agents-subconscious-service.ts
  agents-transfer-service.ts
  amp-service.ts
  config-service.ts
  domains-service.ts
  headless-router.ts
  help-service.ts
  hosts-service.ts
  marketplace-service.ts
  messages-service.ts
  sessions-service.ts
  shared-state-bridge.mjs
  shared-state.ts
  teams-service.ts
  webhooks-service.ts
```

**Impact:** Our governance code does NOT yet have a corresponding `services/governance-service.ts`. To maintain architectural consistency with origin/main's service-layer pattern, we should extract governance business logic from `app/api/governance/` routes into a `services/governance-service.ts` file.

### I5: AgentRuntime Abstraction

New `lib/agent-runtime.ts` provides:
- `AgentRuntime` interface with methods: `listSessions`, `sessionExists`, `sendKeys`, `capturePane`, etc.
- `TmuxRuntime` class implementing the interface
- Future runtime types: `docker`, `api`, `direct`

**Impact on governance:** None directly. Our governance code does not interact with tmux/sessions.

---

## MERGE STRATEGY RECOMMENDATIONS

### Priority Order of Fixes

1. **[C1] Fix sync-to-async break in teams-service.ts** - Must add `await` to 6 call sites and make wrapper functions `async`. This is the most likely source of silent runtime bugs.

2. **[C2] Integrate governance validation into teams-service.ts** - Add `validateTeamMutation()` calls to `createNewTeam()` and `updateTeamById()` in teams-service.ts, plus handle `TeamValidationException`.

3. **[C3] Add governance routes to headless-router.ts** - Create `services/governance-service.ts` and add route mappings. This can be deferred if headless mode is not immediately needed.

### Files Requiring Manual Merge Resolution

| File | Our Changes | Origin Changes | Conflict Type |
|------|-------------|----------------|---------------|
| `lib/task-registry.ts` | withLock, async, path validation | (unchanged on origin) | Clean merge |
| `lib/document-registry.ts` | withLock, async, path validation | (unchanged on origin) | Clean merge |
| `lib/team-registry.ts` | +174 lines governance logic | (unchanged on origin) | Clean merge |
| `services/teams-service.ts` | Does not exist on our branch | New file (460 lines) | **Must update post-merge** |
| `services/headless-router.ts` | Does not exist on our branch | New file (1265 lines) | **Must add governance routes** |
| `lib/notification-service.ts` | Not modified by us | Refactored to use AgentRuntime | Clean merge |
| `types/agent.ts` | Not modified by us | +3 lines (runtime field) | Clean merge |
| `types/session.ts` | Not modified by us | +3 lines (socketPath field) | Clean merge |
| `package.json` | Version 0.23.17 | Version 0.24.9 | **Version conflict** |

### Git Merge Prediction

The actual `git merge` should produce **zero textual conflicts** because our changes and origin/main's changes touch **different files** in most cases. The registries (`lib/team-registry.ts`, `lib/task-registry.ts`, `lib/document-registry.ts`) were NOT modified on origin/main, so our changes will apply cleanly.

However, the **semantic conflicts** (C1, C2, C3) will not be detected by git and require manual post-merge fixes to ensure correctness.

### Post-Merge Checklist

- [ ] Add `await` to 6 call sites in `services/teams-service.ts` (createTask, updateTask, deleteTask, createDocument, updateDocument, deleteDocument)
- [ ] Make the 6 wrapper functions in teams-service.ts `async`
- [ ] Add `validateTeamMutation()` calls in `createNewTeam()` and `updateTeamById()` in teams-service.ts
- [ ] Handle `TeamValidationException` in teams-service.ts (catch and return proper ServiceResult)
- [ ] Create `services/governance-service.ts` extracting logic from `app/api/governance/` routes
- [ ] Add governance route patterns to `services/headless-router.ts`
- [ ] Resolve version conflict in `package.json` (bump to 0.25.0 or similar)
- [ ] Run `yarn test` to verify all tests pass
- [ ] Run `yarn build` to verify build succeeds
