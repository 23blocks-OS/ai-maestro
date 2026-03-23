# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-22-044429
**Pass:** 5
**Reports merged:** 10
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 26 |
| **SHOULD-FIX** | 58 |
| **NIT** | 34 |
| **Total** | 127 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


### [CC-P5-A2-001] G4 revocation skipped when team type changes from open to closed
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:347-369
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `updateTeam()` changes a team's type from `open` to `closed` without modifying `agentIds`, the G4 open-team revocation code does NOT run for existing members. The comment at line 349-350 says "MF-06: Always check when team is closed (not just when agentIds was explicitly provided), so that a type change to 'closed' also triggers revocation for existing members." However, the implementation at line 353 only processes "newly added" agents: `result2.agentIds.filter(aid => !previousAgentIds.includes(aid))`. When only the type changes (no agents added), `previousAgentIds` equals `result2.agentIds`, so `newlyAdded` is empty, and the `if (newlyAdded.length > 0)` guard at line 354 prevents any revocation.
- **Evidence:**
```typescript
// line 353-354
const newlyAdded = result2.agentIds.filter(aid => !previousAgentIds.includes(aid))
if (newlyAdded.length > 0) {
  // This block never runs when only type changes from open to closed
```
- **Fix:** When the type is changed to `closed`, revoke open-team memberships for ALL members of the team (not just newly added ones). The logic should check if the type changed from non-closed to closed, and if so, iterate over all `result2.agentIds` instead of just `newlyAdded`. Something like:
```typescript
const typeChangedToClosed = result2.type === 'closed' && previousType !== 'closed'
const agentsToCheck = typeChangedToClosed ? result2.agentIds : newlyAdded
if (agentsToCheck.length > 0) { ... }
```
Note: `previousType` needs to be captured before the update is applied (similar to `previousAgentIds`).


### [CC-P5-A3-001] Double-release of index throttle slot on early-return paths
- **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:434, 464, 585, 644, 655
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `runIndexDelta` calls `releaseSlot()` explicitly on early-return paths (lines 434, 464, 585, 644) AND in the catch block (line 655). However, the `releaseSlot` function returned by `acquireIndexSlot` is a closure that calls `releaseIndexSlot(agentId)` which decrements `activeIndexCount`. If an early return on line 434 executes `releaseSlot()`, and then the code path exits the try block, the `catch` block on line 654 does NOT execute (no error thrown). So the explicit calls are not doubled with catch in those paths. BUT: if `releaseSlot()` on line 644 is reached (the success path at end of try), and then somehow the return statement itself throws (extremely unlikely but possible with proxy/getter), both line 644 and 655 would fire. More critically, the pattern is fragile: the function has 4 separate explicit `releaseSlot()` calls plus the catch handler, making it easy for a future edit to miss one path or double-release. The correct pattern is to use a try/finally (like `withLock` does in file-lock.ts) to guarantee exactly-once release.
- **Evidence:**
  ```typescript
  // Line 401
  const releaseSlot = await acquireIndexSlot(agentId)
  try {
    // Line 434: early return calls releaseSlot()
    releaseSlot()
    return { ... }
    // Line 464: another early return calls releaseSlot()
    releaseSlot()
    return { ... }
    // Line 585: dry-run return calls releaseSlot()
    releaseSlot()
    return { ... }
    // Line 644: success return calls releaseSlot()
    releaseSlot()
    return { ... }
  } catch (error) {
    // Line 655: error path also calls releaseSlot()
    releaseSlot()
    return { ... }
  }
  ```
- **Fix:** Replace the try/catch with try/finally for the slot release, and remove all manual `releaseSlot()` calls:
  ```typescript
  const releaseSlot = await acquireIndexSlot(agentId)
  try {
    // ... all logic, early returns without releaseSlot() ...
  } catch (error) {
    // ... error handling without releaseSlot() ...
  } finally {
    releaseSlot()
  }
  ```

### [CC-P5-A3-002] agent-registry read-modify-write race conditions: no file locking
- **File:** /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts (multiple functions)
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Unlike `task-registry.ts` and `document-registry.ts` which use `withLock()` from `file-lock.ts` for all mutations, `agent-registry.ts` has NO locking for ANY of its read-modify-write operations. Functions like `createAgent`, `updateAgent`, `deleteAgent`, `linkSession`, `unlinkSession`, `renameAgent`, `updateAgentStatus`, `incrementAgentMetric`, `addSessionToAgent`, `removeSessionFromAgent`, `updateAgentMetrics`, and `updateAgentWorkingDirectory` all follow the pattern: `loadAgents()` -> modify in-memory array -> `saveAgents()`. Under concurrent API requests, two requests can load the same state, both modify it, and one overwrites the other's changes (lost update). This is particularly dangerous for operations like `deleteAgent` (hard=true) which reads, filters, and writes - a concurrent `createAgent` between the read and write would be silently lost.
- **Evidence:**
  ```typescript
  // createAgent (line 337) - no lock
  export function createAgent(request: CreateAgentRequest): Agent {
    const agents = loadAgents()  // READ
    // ... modifications ...
    agents.push(agent)
    saveAgents(agents)           // WRITE - may overwrite concurrent changes
    return agent
  }

  // Compare with task-registry.ts which correctly uses withLock:
  export function createTask(data: { ... }): Promise<Task> {
    return withLock('tasks-' + data.teamId, () => {  // LOCKED
      const tasks = loadTasks(data.teamId)
      // ...
      saveTasks(data.teamId, tasks)
      return task
    })
  }
  ```
- **Fix:** Wrap all mutating functions in `agent-registry.ts` with `withLock('agents', () => { ... })`. This matches the pattern already established by `task-registry.ts` and `document-registry.ts`.


### [CC-P5-A7-001] Unsafe type assertion on dynamic route params
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/[id]/page.tsx:23
- **Severity:** MUST-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `params.id` from `useParams()` has type `string | string[] | undefined` in Next.js App Router, but is blindly cast via `as string`. If the route were to match a catch-all segment (unlikely but possible during refactoring), or if `params` is somehow undefined, this would silently produce `undefined` or an array where a string is expected, leading to malformed API URLs like `/api/teams/undefined`.
- **Evidence:**
  ```typescript
  const params = useParams()
  const teamId = params.id as string  // line 23
  ```
- **Fix:** Use a runtime guard: `const teamId = typeof params.id === 'string' ? params.id : ''` and render an error state if empty. Alternatively, use `String(params.id)` with a null check.

### [CC-P5-A7-002] Missing AbortController in useTeam fetch — stale state updates on unmount
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:33-41
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `useTeam` does not use an AbortController for fetch cleanup. When `teamId` changes rapidly or the component unmounts, the `fetchTeam` call completes and calls `setTeam` / `setError` on an unmounted component. This is a React state-after-unmount bug that can cause memory leaks and unpredictable UI state. The sibling hook `useGovernance` correctly uses AbortController (line 125-128).
- **Evidence:**
  ```typescript
  // useTeam.ts:33-41 — no AbortController, no signal
  useEffect(() => {
    if (!teamId) {
      setTeam(null)
      setLoading(false)
      return
    }
    setLoading(true)
    fetchTeam().finally(() => setLoading(false))
  }, [teamId, fetchTeam])
  ```
  Compare with useGovernance.ts:124-128:
  ```typescript
  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal)
    return () => controller.abort()
  }, [agentId])
  ```
- **Fix:** Add an AbortController to the useEffect, pass `signal` to `fetchTeam`'s fetch calls, and abort on cleanup. Also add a stale-response guard similar to useGovernance line 93.


### [CC-P5-A6-001] cross-host-governance test missing mock for `@/lib/host-keys`
- **File:** tests/cross-host-governance.test.ts (entire file)
- **Severity:** MUST-FIX
- **Category:** mock-accuracy
- **Confidence:** CONFIRMED (traced imports in source, verified mock list in test, ran tests)
- **Description:** The source file `services/cross-host-governance-service.ts` imports `signHostAttestation` from `@/lib/host-keys` (line 30), which is used in `sendRequestToRemoteHost()` (line 489) and `notifyRemoteHostOfRejection()` (line 532). The test file does NOT mock `@/lib/host-keys`. This means the real `host-keys` module is loaded during tests, which reads Ed25519 key files from `~/.aimaestro/host-keys/`. The tests currently pass because `sendRequestToRemoteHost` is fire-and-forget (`.catch()`), so failures are silently swallowed. However, this is fragile:
  1. If `~/.aimaestro/host-keys/` does not exist on a CI machine, the test will generate real keys and write to disk (side effect in tests).
  2. The test that verifies "notifies source host on rejection of cross-host request via fetch" (line 542) exercises `notifyRemoteHostOfRejection`, which calls `signHostAttestation`. The test passes because `globalThis.fetch` is mocked, but the real `signHostAttestation` is called, touching the real filesystem.
- **Evidence:** No `vi.mock('@/lib/host-keys'` found in the file. Source imports: `import { signHostAttestation } from '@/lib/host-keys'` at cross-host-governance-service.ts:30.
- **Fix:** Add a mock for `@/lib/host-keys` in the mocks section:
  ```ts
  vi.mock('@/lib/host-keys', () => ({
    signHostAttestation: vi.fn(() => 'mock-sig'),
    getHostPublicKeyHex: vi.fn(() => 'mock-pubkey'),
    verifyHostAttestation: vi.fn(() => true),
  }))
  ```

### [CC-P5-A6-002] cross-host-governance test missing mock for `@/lib/manager-trust`
- **File:** tests/cross-host-governance.test.ts (entire file)
- **Severity:** MUST-FIX
- **Category:** mock-accuracy
- **Confidence:** CONFIRMED (traced imports in source, verified mock list in test)
- **Description:** The source file `services/cross-host-governance-service.ts` imports `shouldAutoApprove` from `@/lib/manager-trust` (line 34), which is called inside `receiveCrossHostRequest()` at line 188. The test file does NOT mock `@/lib/manager-trust`. This means the real `manager-trust` module is loaded, which reads `~/.aimaestro/manager-trust.json` from the real filesystem. In the `receiveCrossHostRequest` tests, `shouldAutoApprove(request)` is called with the test request, and it reads from disk, returning `false` because the file either doesn't exist or doesn't match. The tests pass by coincidence (the default behavior when no trust file exists is to return `false`). This has two problems:
  1. Side effect: if `~/.aimaestro/manager-trust.json` doesn't exist, `loadManagerTrust()` creates it with defaults (writing to the real filesystem during tests).
  2. If a developer has a trust entry matching `host-remote` in their local file, the auto-approve path would be triggered, changing test behavior.
- **Evidence:** No `vi.mock('@/lib/manager-trust'` found in the file. Source imports: `import { shouldAutoApprove } from '@/lib/manager-trust'` at cross-host-governance-service.ts:34. No test verifies auto-approve behavior.
- **Fix:** Add a mock for `@/lib/manager-trust`:
  ```ts
  vi.mock('@/lib/manager-trust', () => ({
    shouldAutoApprove: vi.fn().mockReturnValue(false),
  }))
  ```

### [CC-P5-A6-003] cross-host-governance test missing mock for `@/lib/rate-limit`
- **File:** tests/cross-host-governance.test.ts (entire file)
- **Severity:** MUST-FIX
- **Category:** mock-accuracy
- **Confidence:** CONFIRMED (traced imports and verified in-memory state behavior)
- **Description:** The source file imports `checkRateLimit`, `recordFailure`, `resetRateLimit` from `@/lib/rate-limit` (line 31). These are used as guards in `submitCrossHostRequest`, `approveCrossHostRequest`, and `rejectCrossHostRequest`. The rate-limit module uses an in-memory `Map` that persists across tests within the same test file. While the module correctly skips `setInterval` cleanup in test mode (`process.env.NODE_ENV !== 'test'`), the in-memory `Map` is NOT cleared between tests. If a test runs multiple failed password attempts (e.g., the "rejects with 401" tests), the `recordFailure` calls accumulate in the shared Map. After 5 failed attempts across tests, subsequent tests could get rate-limited (429 instead of expected 401). This currently doesn't manifest because `vi.clearAllMocks()` in `beforeEach` doesn't clear the rate-limit Map, but the password test only runs once per `describe` block and the Map has a 60-second window that hasn't expired. However, this is a ticking time bomb:
  1. Adding more password-failure tests will trigger 429s unexpectedly.
  2. Running tests in different orders (randomized) could expose this.
- **Evidence:** No `vi.mock('@/lib/rate-limit'` in the file. The real rate-limit module uses `const limits = new Map<string, ...>()` at module scope, persisting across `beforeEach` calls. The password failure tests call `submitCrossHostRequest({ ...baseParams, password: 'wrong' })` which triggers `recordFailure('cross-host-gov-submit')`.
- **Fix:** Either mock `@/lib/rate-limit` or add a `resetRateLimit` call in `beforeEach`:
  ```ts
  vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
    recordFailure: vi.fn(),
    resetRateLimit: vi.fn(),
  }))
  ```


### [CC-P5-A5-001] CozoDB injection via wrong escaping convention in agents-graph-service.ts
- **File:** services/agents-graph-service.ts:68-69
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The local `escapeString()` function uses SQL-style double-single-quote escaping (`''`) for CozoDB queries. However, the canonical `escapeForCozo()` in `lib/cozo-utils.ts` uses backslash escaping (`\'`). This means `escapeString` does NOT properly escape single quotes for CozoDB. A user-supplied `name` parameter containing a single quote followed by CozoScript syntax could break out of the string literal and inject arbitrary CozoScript.
- **Evidence:**
  ```typescript
  // agents-graph-service.ts:68
  function escapeString(str: string): string {
    return str.replace(/'/g, "''")  // WRONG for CozoDB
  }

  // lib/cozo-utils.ts:20 (canonical)
  export function escapeForCozo(s: string | undefined | null): string {
    if (!s) return 'null'
    return "'" + s
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")      // Correct: backslash escape
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      + "'"
  }
  ```
  Used at 25+ locations (lines 385, 407, 442, 453, 464, 474, 486, 500, 514, 527, 547, 576, 584, 614, 645, 661, 697, 720, 731, 742, 752, 766, 783, 797, 805).
- **Fix:** Replace all uses of the local `escapeString()` with the canonical `escapeForCozo()` from `@/lib/cozo-utils`. Also update the template literals to not wrap in single quotes since `escapeForCozo` already wraps the result. Change patterns like `'${escapeString(name)}'` to `${escapeForCozo(name)}`.

### [CC-P5-A5-002] CozoDB injection via wrong escaping in agents-docs-service.ts list query
- **File:** services/agents-docs-service.ts:116
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `list` action in `queryDocs()` builds a CozoDB query using SQL-style single-quote escaping (`replace(/'/g, "''")`), which is the wrong convention for CozoDB (which uses backslash escaping `\'`). The `project` parameter comes from user input and is interpolated directly into the query string.
- **Evidence:**
  ```typescript
  // agents-docs-service.ts:113-117
  query = `
    ?[doc_id, file_path, title, doc_type, updated_at] :=
      *documents{doc_id, file_path, title, doc_type, project_path, updated_at},
      project_path = '${project.replace(/'/g, "''")}'
  `
  ```
- **Fix:** Use `escapeForCozo(project)` from `@/lib/cozo-utils` instead of manual escaping. Change to: `project_path = ${escapeForCozo(project)}`.

### [CC-P5-A5-003] CozoDB injection via wrong escaping in agents-graph-service.ts files query
- **File:** services/agents-graph-service.ts:950
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Same wrong escaping convention as CC-P5-A5-001, but in the `files` case of `queryCodeGraph()`. The `projectFilter` parameter is escaped with `''` instead of `\'`.
- **Evidence:**
  ```typescript
  // agents-graph-service.ts:948-951
  case 'files': {
    let query = `?[file_id, path, module, project_path] := *files{file_id, path, module, project_path}`
    if (projectFilter) {
      query += `, project_path = '${projectFilter.replace(/'/g, "''")}'`
    }
  ```
- **Fix:** Use `escapeForCozo(projectFilter)` from `@/lib/cozo-utils`.

### [CC-P5-A5-004] Shell injection risk via execSync with user-controlled cwd in agents-repos-service.ts
- **File:** services/agents-repos-service.ts:32-33
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `getGitRepoInfo()` calls `execSync('git config --get remote.origin.url', { cwd: dirPath })` where `dirPath` comes from `agent.workingDirectory` stored in the registry. While not directly user-controlled from HTTP input (it was set during agent creation), if an agent's `workingDirectory` contains shell metacharacters, the shell invocations in lines 32, 41, 48, 58 could be exploited. Furthermore, line 48 explicitly uses `shell: '/bin/bash'` which increases the risk. The `agents-docker-service.ts` validates `workingDirectory` before creating agents, but agents could be created through other paths (direct registry edits, imports) that skip validation.
- **Evidence:**
  ```typescript
  // agents-repos-service.ts:32
  remoteUrl = execSync('git config --get remote.origin.url', {
    cwd: dirPath, encoding: 'utf-8', timeout: 5000
  }).trim()

  // agents-repos-service.ts:48 -- explicit shell usage
  const remoteBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo ""', {
    cwd: dirPath, encoding: 'utf-8', timeout: 5000, shell: '/bin/bash'
  }).trim()
  ```
- **Fix:** Use `execFileSync` with array arguments instead of `execSync`. For the line 48 case that requires shell piping, validate `dirPath` against a safe pattern before use, or use `execFileSync('git', ['symbolic-ref', ...], { cwd: dirPath })` with a try/catch for the "not found" case.


### [CC-P5-A1-001] Missing JSON body guard in POST /api/webhooks
- **File:** app/api/webhooks/route.ts:22
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `POST` handler calls `await request.json()` without a try/catch guard. If the client sends malformed JSON (or an empty body), this will throw an unhandled exception and return a generic 500 error instead of a proper 400 response. Every other POST endpoint in this codebase wraps `request.json()` in try/catch (many annotated with CC-P2 fix IDs), but this one was missed.
- **Evidence:**
```typescript
// Line 22
export async function POST(request: Request) {
  const body = await request.json()   // <-- no try/catch
  const result = createNewWebhook(body)
```
- **Fix:** Wrap in try/catch like all other endpoints:
```typescript
let body
try { body = await request.json() } catch {
  return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
}
```

### [CC-P5-A1-002] Missing JSON body guard in PATCH /api/meetings/[id]
- **File:** app/api/meetings/[id]/route.ts:20
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `PATCH` handler calls `await request.json()` without a try/catch. Malformed JSON will crash the handler with a 500 instead of returning 400.
- **Evidence:**
```typescript
// Line 20
const body = await request.json()  // <-- no try/catch
const result = updateExistingMeeting(id, body)
```
- **Fix:** Wrap in try/catch consistent with rest of codebase.

### [CC-P5-A1-003] Missing JSON body guard in POST /api/meetings
- **File:** app/api/meetings/route.ts:12
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue: `await request.json()` without try/catch in the POST handler for meeting creation.
- **Evidence:**
```typescript
// Line 12
const body = await request.json()  // <-- no try/catch
const result = createNewMeeting(body)
```
- **Fix:** Wrap in try/catch consistent with rest of codebase.

### [CC-P5-A1-004] Missing JSON body guard in POST /api/sessions/create
- **File:** app/api/sessions/create/route.ts:6
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The POST handler calls `request.json()` without try/catch. While it has an outer try/catch, the error message is generic "Failed to create session" (500) rather than a proper 400 for malformed JSON.
- **Evidence:**
```typescript
// Line 6
const body = await request.json()  // <-- can throw on malformed JSON -> caught by outer catch -> 500
```
- **Fix:** Add inner try/catch around `request.json()` returning 400 for malformed JSON, consistent with other endpoints.

### [CC-P5-A1-005] Missing JSON body guard in POST /api/sessions/restore
- **File:** app/api/sessions/restore/route.ts:24
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The POST handler calls `request.json()` without specific try/catch for malformed JSON. It is caught by outer try/catch but returns generic 500.
- **Evidence:**
```typescript
// Line 24
const { sessionId, all } = await request.json()  // <-- no malformed-JSON guard
```
- **Fix:** Add inner try/catch returning 400 for invalid JSON.

### [CC-P5-A1-006] Missing JSON body guard in POST /api/organization
- **File:** app/api/organization/route.ts:20
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The POST handler calls `request.json()` without a specific guard. On malformed JSON, the outer catch returns 500 instead of 400.
- **Evidence:**
```typescript
// Line 20
const body = await request.json()  // <-- no guard
const { organization, setBy } = body
```
- **Fix:** Add inner try/catch returning 400 for invalid JSON.

### [CC-P5-A1-007] Missing JSON body guard in POST /api/sessions/[id]/command
- **File:** app/api/sessions/[id]/command/route.ts:24
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The POST handler calls `request.json()` without a specific guard. On malformed JSON, the outer catch returns 500 with generic message instead of 400.
- **Evidence:**
```typescript
// Line 24
const body = await request.json()  // <-- no guard
```
- **Fix:** Add inner try/catch returning 400.

### [CC-P5-A1-008] Missing JSON body guard in PATCH /api/sessions/[id]/rename
- **File:** app/api/sessions/[id]/rename/route.ts:21
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The PATCH handler destructures `request.json()` directly via `Promise.all`. On malformed JSON, the outer catch returns 500.
- **Evidence:**
```typescript
// Line 21
const [{ newName }, { id: oldName }] = await Promise.all([
  request.json(),  // <-- no guard
  params
])
```
- **Fix:** Add inner try/catch for `request.json()` returning 400.

### [CC-P5-A1-009] Missing JSON body guard in POST /api/sessions/activity/update
- **File:** app/api/sessions/activity/update/route.ts:13
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The POST handler destructures `request.json()` directly. On malformed JSON, the outer catch returns 500.
- **Evidence:**
```typescript
// Line 13
const { sessionName, status, hookStatus, notificationType } = await request.json()
```
- **Fix:** Add inner try/catch returning 400.

### [CC-P5-A1-010] Missing JSON body guard in POST /api/conversations/parse
- **File:** app/api/conversations/parse/route.ts:10
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The POST handler calls `request.json()` directly. On malformed JSON the outer catch returns 500 rather than 400.
- **Evidence:**
```typescript
// Line 10
const body = await request.json()  // <-- no guard
const { conversationFile } = body
```
- **Fix:** Add inner try/catch returning 400.


### [CC-P5-A0-001] Missing try/catch in POST and GET handlers for cross-host governance requests
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:56-57 and :75-80
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `POST` handler calls `submitCrossHostRequest(body)` at line 56 and `receiveCrossHostRequest(body.fromHostId, body.request)` at line 52 without a surrounding try/catch. Similarly, the `GET` handler calls `listCrossHostRequests(...)` at line 75 without a try/catch. If these service functions throw (e.g., file I/O error, JSON parse error in the service layer), the exception propagates unhandled, resulting in Next.js returning a generic 500 error without the structured `{ error: '...' }` JSON format that clients expect. All other route handlers in this domain have try/catch wrappers.
- **Evidence:**
```typescript
// POST handler - no try/catch around service calls
const result = await submitCrossHostRequest(body)
return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })

// GET handler - no try/catch around service call
const result = listCrossHostRequests({...})
return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
```
- **Fix:** Wrap the POST body (lines 17-57) and GET body (lines 65-80) in try/catch blocks that return `NextResponse.json({ error: '...' }, { status: 500 })`, matching the pattern used in `approve/route.ts` and `reject/route.ts`.

### [CC-P5-A0-002] Missing error check in exchange-peers route before accessing result.data
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/hosts/exchange-peers/route.ts:17
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `exchangePeers` service function embeds errors inside `result.data.error` rather than `result.error` (it always returns with `data` set). However, the route handler at line 17 directly passes `result.data` without checking `result.error`. While this currently works because `exchangePeers()` never returns `{ error: '...', status: 400 }` at the ServiceResult level, this is inconsistent with the ServiceResult contract used everywhere else. If the service function is refactored to use the standard pattern (returning `{ error: '...', status: 400 }` without `data`), `result.data` would be `undefined`, sending `undefined` as the JSON body, which crashes `NextResponse.json()`.
- **Evidence:**
```typescript
// exchange-peers/route.ts:17
const result = await exchangePeers(body)
return NextResponse.json(result.data, { status: result.status })
// Missing: if (result.error) { return NextResponse.json({ error: result.error }, ...) }
```
- **Fix:** Add the standard `if (result.error)` check before the success path, matching `hosts/route.ts` GET handler pattern.


### [CC-P5-A4-001] `resolveAgent` uses destructuring `split('@')` which silently drops segments for addresses with multiple `@` characters
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:488
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `resolveAgent()`, the `name@host` parsing uses `const [name, hostId] = identifier.split('@')`. If the identifier contains more than one `@` (e.g., `agent@host@extra` due to malformed input or AMP address format leaking in), `split('@')` returns 3+ elements but destructuring only captures the first two, silently discarding the rest. Critically, the sibling function `parseQualifiedName()` in `message-send.ts:56-63` uses `indexOf('@')` specifically to handle this edge case correctly. The inconsistency means the same identifier could resolve differently depending on which code path processes it.
- **Evidence:**
  ```typescript
  // messageQueue.ts:488 - uses split (BUG for multi-@ inputs)
  const [name, hostId] = identifier.split('@')

  // message-send.ts:57-62 - uses indexOf (CORRECT)
  const atIndex = qualifiedName.indexOf('@')
  if (atIndex > 0 && atIndex < qualifiedName.length - 1) {
    return { identifier: qualifiedName.substring(0, atIndex), hostId: qualifiedName.substring(atIndex + 1) }
  }
  ```
- **Fix:** Replace `const [name, hostId] = identifier.split('@')` with `indexOf`-based parsing consistent with `parseQualifiedName()`:
  ```typescript
  const atIndex = identifier.indexOf('@')
  const name = identifier.substring(0, atIndex)
  const hostId = identifier.substring(atIndex + 1)
  ```

### [CC-P5-A4-002] `convertAMPToMessage` never populates `fromVerified` field, causing unverified senders to appear as `undefined` instead of `false`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:192-250
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `Message` interface defines `fromVerified?: boolean` (line 30) which is expected to be `true` for registered agents and `false` for external/unverified agents. The `convertAMPToMessage()` function never sets this field in its return object (lines 223-249). Meanwhile, the old flat-format path in `collectMessagesFromAMPDir` does pass through `fromVerified: ampMsg.fromVerified` (line 338). This means AMP-format messages always have `fromVerified: undefined`, which downstream code checking `if (message.fromVerified)` would treat as falsy, but code checking `if (message.fromVerified === false)` would not match, potentially misclassifying verification status. The `MessageSummary` also lacks `fromVerified` in the AMP envelope path (line 311 vs line 338).
- **Evidence:**
  ```typescript
  // Line 223-249: convertAMPToMessage return object - NO fromVerified field
  return {
    id,
    from: fromName,
    fromAlias: fromName,
    fromLabel: fromAgent?.label || undefined,
    fromHost,
    // fromVerified is MISSING
    to: toName,
    ...
  }

  // Line 338: Old flat format DOES include it
  fromVerified: ampMsg.fromVerified,
  ```
- **Fix:** Add `fromVerified` to the return object in `convertAMPToMessage()`. Derive it from the AMP message metadata (e.g., `ampMsg.metadata?.fromVerified`, `ampMsg.local?.fromVerified`, or check if signature was verified). Also add `fromVerified: msg.fromVerified` to the summary block at line 311.


---

## SHOULD-FIX Issues


### [CC-P5-A2-002] recipientHostId not validated by verifier -- cross-target replay prevention ineffective
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/role-attestation.ts`:68-81
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `createRoleAttestation()` function supports an optional `recipientHostId` field to bind an attestation to a specific target host (preventing cross-target replay attacks, per the comment at line 104 of `types/governance.ts`). However, `verifyRoleAttestation()` does not check that `attestation.recipientHostId` matches the verifying host's own ID. The signature verification succeeds regardless of which host receives the attestation, because the signed data includes the recipientHostId but the verifier never compares it against itself. The caller in `services/amp-service.ts:779` also does not perform this check.
- **Evidence:**
```typescript
// role-attestation.ts:68-81
export function verifyRoleAttestation(
  attestation: HostAttestation,
  expectedHostPublicKeyHex: string,
): boolean {
  const attestationAge = Date.now() - new Date(attestation.timestamp).getTime()
  if (attestationAge > ATTESTATION_MAX_AGE_MS || attestationAge < 0) {
    return false
  }
  // No check: attestation.recipientHostId === currentHostId
  const data = buildAttestationData(attestation)
  return verifyHostAttestation(data, attestation.signature, expectedHostPublicKeyHex)
}
```
- **Fix:** Add an optional `expectedRecipientHostId` parameter to `verifyRoleAttestation()`. When provided, verify that `attestation.recipientHostId === expectedRecipientHostId`. If the attestation has a recipientHostId that doesn't match, return false. The caller in `amp-service.ts` should pass `getSelfHostId()` as this parameter.

### [CC-P5-A2-003] Non-atomic write in saveTransfers -- crash can corrupt governance-transfers.json
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts`:56-60
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `saveTransfers()` writes directly to the target file using `writeFileSync()` instead of using the atomic temp-file-then-rename pattern used by every other save function in this domain (`saveGovernance`, `saveGovernanceRequests`, `saveManagerTrust`, `savePeerGovernance`, `saveTeams`). If the process crashes mid-write, the file will be left in a half-written, corrupt state.
- **Evidence:**
```typescript
// transfer-registry.ts:56-60
function saveTransfers(requests: TransferRequest[]): void {
  ensureDir()
  const data: TransfersFile = { version: 1, requests }
  writeFileSync(TRANSFERS_FILE, JSON.stringify(data, null, 2), 'utf-8')
  // Should be: write to .tmp then renameSync, like saveGovernance()
}
```
- **Fix:** Use the atomic write pattern:
```typescript
function saveTransfers(requests: TransferRequest[]): void {
  ensureDir()
  const data: TransfersFile = { version: 1, requests }
  const tmpFile = TRANSFERS_FILE + '.tmp'
  writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmpFile, TRANSFERS_FILE)
}
```
Note: `renameSync` must be imported from `'fs'` (it already imports `existsSync`, `copyFileSync`, etc. but not `renameSync`).

### [CC-P5-A2-004] handleGovernanceSyncMessage does not validate payload fields before type assertion
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-sync.ts`:185-189
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `handleGovernanceSyncMessage()` uses `as` to type-assert `message.payload` without validating that the expected fields (`managerId`, `managerName`, `teams`) actually exist and have the correct types. A malicious or buggy peer could send a payload missing these fields, and the code would proceed with `undefined` values silently stored to disk.
- **Evidence:**
```typescript
// governance-sync.ts:185-189
const { managerId, managerName, teams } = message.payload as {
  managerId: string | null
  managerName: string | null
  teams: PeerTeamSummary[]
}
```
Line 196 has a partial mitigation (`Array.isArray(teams) ? teams : []`), but `managerId` and `managerName` are not validated. If the payload is `{ teams: "not-an-array" }`, `managerId` and `managerName` would be `undefined`, which gets stored as-is (they are typed as `string | null` but could actually be `undefined`).
- **Fix:** Add runtime validation for the extracted fields, e.g.:
```typescript
const managerId = typeof message.payload.managerId === 'string' ? message.payload.managerId : null
const managerName = typeof message.payload.managerName === 'string' ? message.payload.managerName : null
const teams = Array.isArray(message.payload.teams) ? message.payload.teams : []
```


### [CC-P5-A3-003] amp-auth loadApiKeys/saveApiKeys has no file locking
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:50-90
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `loadApiKeys()` and `saveApiKeys()` perform unprotected read-modify-write sequences. Functions like `createApiKey`, `validateApiKey` (which saves last_used_at), `rotateApiKey`, and `revokeApiKey` all load, modify, and save without any locking. Concurrent key creation or rotation requests could lose data.
- **Evidence:**
  ```typescript
  // createApiKey (line 148)
  export function createApiKey(...): string {
    const apiKey = generateApiKey()
    const keys = loadApiKeys()     // READ (no lock)
    keys.push(record)
    saveApiKeys(keys)              // WRITE (no lock) - concurrent call may overwrite
    return apiKey
  }
  ```
- **Fix:** Use `withLock('amp-api-keys', ...)` around mutating operations, similar to how task-registry.ts and document-registry.ts protect their file operations.

### [CC-P5-A3-004] validateApiKey timing-safe comparison is partially defeated
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:191-199
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `validateApiKey` function uses `timingSafeEqual` for hash comparison (good), but it iterates through ALL keys with `Array.find()`, performing a timing-safe comparison for each. The `a.length === b.length` check on line 194 returns `false` early for length mismatches, leaking timing information about which keys have the same hash length. Since all SHA-256 hashes have the same length (prefixed with 'sha256:'), this specific issue is mitigated for the hash comparison. However, the overall pattern still reveals how many keys were checked before finding a match (via timing of the entire `find` call), which is a minor information leak.
- **Evidence:**
  ```typescript
  const record = keys.find(k => {
    const a = Buffer.from(k.key_hash, 'utf8')
    const b = Buffer.from(keyHash, 'utf8')
    const hashMatch = a.length === b.length && timingSafeEqual(a, b)
    return hashMatch &&
      k.status === 'active' &&
      (!k.expires_at || new Date(k.expires_at) > new Date())
  })
  ```
- **Fix:** Since all hashes have identical format ('sha256:' + 64 hex chars), the length check is always true for valid records. The timing leak from number-of-keys-scanned is minor for a localhost Phase 1 system. Consider iterating all keys regardless of match to prevent timing leaks in future phases, or accept this as a known Phase 1 limitation.

### [CC-P5-A3-005] saveAgents invalidates cache but concurrent loadAgents may use stale mtime
- **File:** /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts:192-208, 145-187
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** `saveAgents()` sets `_cachedAgents = null` and `_cachedMtimeMs = 0` to invalidate the cache. However, `loadAgents()` checks `stat.mtimeMs === _cachedMtimeMs`. If two `loadAgents()` calls happen in rapid succession (within the same filesystem tick where mtime doesn't change), the second call after a write might get a stale cached result if the write completed but the filesystem mtime granularity (typically 1ms on APFS, but can be coarser on some filesystems) hasn't advanced.
- **Evidence:**
  ```typescript
  // saveAgents (line 192)
  export function saveAgents(agents: Agent[]): boolean {
    // ...
    fs.writeFileSync(REGISTRY_FILE, data, 'utf-8')
    _cachedAgents = null    // Invalidate
    _cachedMtimeMs = 0
    return true
  }

  // loadAgents (line 145)
  export function loadAgents(): Agent[] {
    const stat = fs.statSync(REGISTRY_FILE)
    if (_cachedAgents && stat.mtimeMs === _cachedMtimeMs) {
      return _cachedAgents  // Could miss a concurrent write in same ms
    }
  }
  ```
- **Fix:** After invalidating cache in `saveAgents`, also set `_cachedAgents = agents` and `_cachedMtimeMs = stat.mtimeMs` (read stat after write) to eagerly populate the cache, avoiding the race window.

### [CC-P5-A3-006] resolveAlias does not handle multiple @ signs in name@host format
- **File:** /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts:998-999
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `resolveAlias` splits on `@` using `nameOrId.split('@')`, which for an input like `user@host@extra` would produce `['user', 'host', 'extra']`. The destructuring `const [name, hostId] = ...` takes only the first two elements, silently ignoring the rest. This could cause incorrect lookups if an email-style address (which contains `@`) is passed.
- **Evidence:**
  ```typescript
  if (nameOrId.includes('@')) {
    const [name, hostId] = nameOrId.split('@')
    const agent = getAgentByName(name, hostId)
    return agent?.id || null
  }
  ```
- **Fix:** Use `nameOrId.split('@', 2)` or `nameOrId.indexOf('@')` to split at the first `@` only, or validate that exactly one `@` exists.

### [CC-P5-A3-007] index-delta extractConversationMetadata reads entire file into memory
- **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:277-278
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `extractConversationMetadata` calls `fs.readFileSync(jsonlPath, 'utf-8')` which reads the entire file into memory. For large conversation files (which can grow to hundreds of MB), this can cause memory pressure or OOM. This contradicts the optimization comment at lines 10-11: "Single file read per conversation (no triple reads)". The function also has `countFileLines` (line 344) which uses a streaming approach, showing the authors are aware of the issue.
- **Evidence:**
  ```typescript
  function extractConversationMetadata(jsonlPath: string, projectPath: string): { ... } {
    const fileContent = fs.readFileSync(jsonlPath, 'utf-8')  // Entire file into memory
    const allLines = fileContent.split('\n').filter(line => line.trim())
    // Only uses first 50 lines for metadata and last 20 lines for timestamps
  }
  ```
- **Fix:** Use a streaming reader (like `countFileLines` does) or read only the first and last N kilobytes of the file, since the function only needs the first 50 and last 20 lines.


### [CC-P5-A7-003] Unsafe `error as Error` cast in useWebSocket
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useWebSocket.ts:170
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The catch block casts `error as Error`, but `new WebSocket()` can throw non-Error types (e.g., a DOMException or a string in some browsers). This would result in a type mismatch where `connectionError.message` is `undefined`.
- **Evidence:**
  ```typescript
  } catch (error) {
    console.error('Failed to create WebSocket:', error)
    setConnectionError(error as Error)  // line 170 — unsafe cast
    setStatus('error')
  }
  ```
- **Fix:** Use `setConnectionError(error instanceof Error ? error : new Error(String(error)))`.

### [CC-P5-A7-004] useTerminal returns `terminalRef.current` which does not trigger re-renders
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTerminal.ts:341
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The hook returns `terminal: terminalRef.current`. Since refs do not trigger re-renders, consumers that depend on `terminal` being non-null (e.g., TerminalView.tsx line 646: `{terminal && (...)}`) will not see the terminal until something else causes a re-render. In practice, `setIsReady(true)` in TerminalView triggers a re-render that picks up the ref value, but `useTerminal` callers who do not set their own state would see a permanently null `terminal`.
- **Evidence:**
  ```typescript
  return {
    terminal: terminalRef.current,  // line 341 — ref snapshot, not reactive
    initializeTerminal,
    ...
  }
  ```
- **Fix:** This is mitigated in practice by `isReady` state in TerminalView, but the hook's API is misleading. Consider adding a `terminal` state variable that is set alongside the ref, or document clearly that callers must trigger their own re-render.

### [CC-P5-A7-005] No exponential backoff for WebSocket reconnection
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useWebSocket.ts:154-159
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The reconnection uses a fixed 3-second delay (`WS_RECONNECT_DELAY = 3000`) for all attempts. This can cause server load spikes when many agents reconnect simultaneously after a server restart. The CLAUDE.md documents an exponential backoff strategy (`[100, 500, 1000, 2000, 5000]`) but the implementation does not follow it.
- **Evidence:**
  ```typescript
  const WS_RECONNECT_DELAY = 3000  // line 6
  // ...
  reconnectTimeoutRef.current = setTimeout(() => {
    connect()
  }, WS_RECONNECT_DELAY)  // lines 157-159 — fixed delay on every attempt
  ```
- **Fix:** Implement exponential backoff as documented: `const delay = Math.min(WS_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1), 30000)`.

### [CC-P5-A7-006] Modal dialogs in teams/page.tsx lack role="dialog" and aria-modal
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx:241-293 and 296-317
- **Severity:** SHOULD-FIX
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** The Create Team dialog (line 241) and Delete Confirmation dialog (line 296) are rendered as plain `<div>` elements with `fixed inset-0 z-50`. They lack `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and focus trap behavior. Screen readers cannot identify these as modal dialogs, and keyboard users can tab out of them into background content.
- **Evidence:**
  ```tsx
  {/* Create Team Dialog - line 241 */}
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4">
      {/* No role="dialog", no aria-modal, no aria-labelledby */}
  ```
- **Fix:** Add `role="dialog"` and `aria-modal="true"` to the outer backdrop div. Add `aria-labelledby` pointing to the `<h4>` heading. Implement focus trap (e.g., `react-focus-lock` or a custom hook).

### [CC-P5-A7-007] Create Team input lacks explicit `<label>` element
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx:252-262
- **Severity:** SHOULD-FIX
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** The team name `<input>` in the Create Team dialog uses `placeholder="Team name..."` as its only label. Screen readers need an explicit `<label htmlFor="...">` or `aria-label` to announce the input's purpose.
- **Evidence:**
  ```tsx
  <input
    type="text"
    value={newTeamName}
    onChange={...}
    placeholder="Team name..."  // line 256 — no label, no aria-label, no id
    className="..."
    autoFocus
  />
  ```
  Compare with GovernancePasswordDialog.tsx which correctly uses `<label htmlFor="governance-password">` (line 161).
- **Fix:** Add `id="create-team-name"` and a `<label htmlFor="create-team-name">` element, or at minimum add `aria-label="Team name"`.

### [CC-P5-A7-008] Connection status indicator uses color-only differentiation
- **File:** /Users/emanuelesabetta/ai-maestro/components/TerminalView.tsx:631-635
- **Severity:** SHOULD-FIX
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** The connection status indicator is a small colored dot (green for connected, red for disconnected) with no text label or `aria-label`. Users with color blindness cannot distinguish the states. Screen readers have no information to announce.
- **Evidence:**
  ```tsx
  <div
    className={`w-2 h-2 rounded-full flex-shrink-0 ${
      isConnected ? 'bg-green-500' : 'bg-red-500'
    }`}
  />
  ```
- **Fix:** Add `aria-label={isConnected ? 'Connected' : 'Disconnected'}` and `role="status"` to the dot element. Optionally add a `title` attribute for sighted users.

### [CC-P5-A7-009] Emoji-only buttons lack aria-labels in TerminalView header
- **File:** /Users/emanuelesabetta/ai-maestro/components/TerminalView.tsx:651-716
- **Severity:** SHOULD-FIX
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** Several buttons in the terminal header use emoji as their visible label on mobile (where the text span is hidden via `hidden md:inline`). Without an `aria-label`, screen readers read the raw emoji unicode or nothing. The buttons have `title` attributes (good for sighted hover) but screen readers typically don't announce `title` as label.
- **Evidence:**
  ```tsx
  {/* Line 656: Notes toggle — mobile only */}
  <button ... title={notesCollapsed ? "Show footer" : "Hide footer"}>
    📝  {/* No aria-label */}
  </button>

  {/* Line 700-701: Copy */}
  <button ... title="Copy selected text to clipboard">
    📋 <span className="hidden md:inline">Copy</span>  {/* No aria-label */}
  </button>

  {/* Lines 707-708, 714-715: Paste and Clear — same pattern */}
  ```
- **Fix:** Add `aria-label` to each button matching its `title` attribute. Example: `aria-label="Copy selected text to clipboard"`.

### [CC-P5-A7-010] N+1 fetch pattern in teams list page
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx:37-51
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The teams list page fetches all teams, then for each team makes 2 additional fetches (tasks + documents) resulting in 1 + 2N requests. With 10 teams, this is 21 HTTP requests on page load. This is documented as "Phase 1" but can cause noticeable load time and server load. The comment on line 36 acknowledges this.
- **Evidence:**
  ```typescript
  // Phase 1: Client-side count via full fetch. Phase 2: Add /api/teams/[id]/stats endpoint for efficient counts.
  const enriched = await Promise.all(
    teamsData.map(async (team) => {
      const [tasksRes, docsRes] = await Promise.all([
        fetch(`/api/teams/${team.id}/tasks`).catch(() => null),
        fetch(`/api/teams/${team.id}/documents`).catch(() => null),
      ])
  ```
- **Fix:** Implement the Phase 2 `/api/teams/[id]/stats` endpoint, or a bulk `/api/teams/stats` endpoint that returns all counts in a single request.


### [CC-P5-A6-004] governance-endpoint-auth test: broadcastGovernanceSync passthrough mock may break on new imports
- **File:** tests/governance-endpoint-auth.test.ts:87-93
- **Severity:** SHOULD-FIX
- **Category:** mock-accuracy
- **Confidence:** CONFIRMED (traced the mock strategy comment)
- **Description:** The governance-endpoint-auth test uses a passthrough mock for `@/lib/governance-sync` (lines 87-93) that keeps all real exports. This is documented with comment CC-P4-005 explaining the end-to-end mock strategy. However, the comment at line 86 warns: "If broadcastGovernanceSync adds new imports, add the corresponding mocks above." This creates a maintenance burden -- if governance-sync.ts adds a new dependency, these tests will fail with cryptic import errors rather than clear mock-missing errors.
- **Evidence:**
  ```ts
  vi.mock('@/lib/governance-sync', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>
    return { ...actual }
  })
  ```
- **Fix:** Consider adding a smoke test that verifies the mock list matches the actual imports. Alternatively, add the dependency list to a tracked comment that can be verified by a lint step.

### [CC-P5-A6-005] cross-host-governance test: no coverage for `receiveCrossHostRequest` auto-approve path
- **File:** tests/cross-host-governance.test.ts
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (searched for "auto" and "shouldAutoApprove" in test file -- no matches)
- **Description:** The `receiveCrossHostRequest` function in the source (cross-host-governance-service.ts:188-198) has an auto-approve path: when `shouldAutoApprove(request)` returns true, it automatically approves as `targetManager` and potentially executes the request. No test covers this path. This is a critical governance behavior -- auto-approval bypasses the dual-manager approval workflow.
- **Evidence:** Source code lines 188-198:
  ```ts
  if (shouldAutoApprove(request)) {
    const localManagerId = getManagerId()
    if (localManagerId) {
      const approvedRequest = await approveGovernanceRequest(request.id, localManagerId, 'targetManager')
      if (approvedRequest?.status === 'executed') {
        await performRequestExecution(approvedRequest)
      }
    }
  }
  ```
  No test sets `shouldAutoApprove` to return `true`.
- **Fix:** Add tests that verify:
  1. When `shouldAutoApprove` returns true and localManagerId exists, `approveGovernanceRequest` is called with `'targetManager'`.
  2. When auto-approval results in `'executed'` status, `performRequestExecution` is triggered.
  3. When `shouldAutoApprove` returns true but no local manager, no approval happens.

### [CC-P5-A6-006] cross-host-governance test: no coverage for `assign-cos`, `remove-cos`, `transfer-agent` execution paths
- **File:** tests/cross-host-governance.test.ts:612-678
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (only `add-to-team` and `remove-from-team` tested in performRequestExecution)
- **Description:** The `performRequestExecution` function handles 5 operation types: `add-to-team`, `remove-from-team`, `assign-cos`, `remove-cos`, `transfer-agent`. Only the first two are tested (lines 613-677). The `assign-cos` path has complex logic: COS-only-on-closed-teams check, G3 one-COS-per-agent check, auto-add to agentIds. The `transfer-agent` path handles fromTeamId/toTeamId with null checks. None of these paths are tested.
- **Evidence:** The test file has `performRequestExecution (via approve flow)` describe block with only 2 tests: `add-to-team` and `remove-from-team`.
- **Fix:** Add tests for `assign-cos` (R1.8 closed-team check, G3 one-COS check, auto-add), `remove-cos` (null COS), and `transfer-agent` (from/to with null teams).

### [CC-P5-A6-007] cross-host-governance test: `receiveCrossHostRequest` doesn't test CC-P1-002 sanitization
- **File:** tests/cross-host-governance.test.ts:330-396
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (source has security validation at lines 141-153, 173-179; tests don't cover these)
- **Description:** The source file has critical security validation (CC-P1-002) in `receiveCrossHostRequest`:
  1. Line 141-147: Validates `request.type` against `VALID_REQUEST_TYPES` whitelist
  2. Line 149-153: Validates `requestedByRole` against `VALID_ROLES` whitelist
  3. Line 155-158: Validates `request.sourceHostId === fromHostId` (CC-008)
  4. Line 173-179: Forces `status: 'pending'` and `approvals: {}` on received requests (prevents malicious pre-filled execution)
  None of these security validations have dedicated test coverage. The existing "missing required request fields" test (line 341) only tests for empty `id`/`type`/`agentId`, not for invalid type values or role values.
- **Evidence:** No test sends a request with `type: 'invalid-type'` or `requestedByRole: 'superuser'` or mismatched `sourceHostId`.
- **Fix:** Add tests for each CC-P1-002 guard:
  - Invalid request type returns 400
  - Invalid requestedByRole returns 400
  - Mismatched sourceHostId returns 400
  - Pre-filled `status: 'executed'` and `approvals` are stripped to `'pending'`/`{}`

### [CC-P5-A6-008] cross-host-governance test: `approveCrossHostRequest` doesn't test CC-010 (neither source nor target)
- **File:** tests/cross-host-governance.test.ts:402-493
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (source has guard at lines 241-243; no test for this path)
- **Description:** The source code has a guard at line 241-243: "Reject if this host is neither source nor target of the request." This returns 400 with error `'This host is neither source nor target of this request'`. No test covers this path.
- **Evidence:** No test creates a request where both `sourceHostId` and `targetHostId` are different from `getSelfHostId()` ('host-local').
- **Fix:** Add a test where `sourceHostId: 'host-alpha'` and `targetHostId: 'host-beta'` (neither is 'host-local').

### [CC-P5-A6-009] role-attestation test: no coverage for `recipientHostId` parameter in `createRoleAttestation`
- **File:** tests/role-attestation.test.ts
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (source has recipientHostId logic at lines 40-58; no test passes this parameter)
- **Description:** The source `createRoleAttestation` accepts an optional `recipientHostId` parameter (line 40). When provided, it's included in the attestation data string (format: `role|agentId|hostId|timestamp|recipientHostId`) and added to the returned attestation object (lines 55-57). The `buildAttestationData` function (lines 26-29) also handles this suffix. No test calls `createRoleAttestation` with a `recipientHostId` argument. The `buildValidAttestation` helper also does not support `recipientHostId` in its data string construction (line 90).
- **Evidence:** All calls to `createRoleAttestation` in tests use only 2 arguments: `createRoleAttestation('agent-id', 'role')`. Source signature: `export function createRoleAttestation(agentId: string, role: AgentRole, recipientHostId?: string)`.
- **Fix:** Add tests:
  1. `createRoleAttestation` with `recipientHostId` includes it in the attestation data and object.
  2. `verifyRoleAttestation` with a `recipientHostId`-bound attestation passes/fails correctly.

### [CC-P5-A6-010] message-filter test: no test for Step 5b (open-world sender to MANAGER/COS recipient)
- **File:** tests/message-filter.test.ts
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (traced source lines 174-181; no test covers open-world sender reaching MANAGER/COS inside closed team)
- **Description:** Source file `message-filter.ts` lines 174-181 implement Step 5b: an open-world agent (not in any closed team) can reach MANAGER and COS of closed teams. There is a test for the denial case (line 328: "denies an outside sender messaging a recipient inside a closed team"), which covers Step 6. But there is no test for the ALLOW case: open-world sender messaging MANAGER who is implicitly "in" a closed team, or messaging a COS. This code path at lines 176-181 is untested.
- **Evidence:** Source:
  ```ts
  // Step 5b: Open-world agents can reach MANAGER and COS (v2 Rules 62-63)
  if (agentIsManager(recipientAgentId)) { return { allowed: true } }
  if (agentIsCOS(recipientAgentId)) { return { allowed: true } }
  ```
  No test has `senderAgentId: OUTSIDE_SENDER, recipientAgentId: MANAGER` where OUTSIDE_SENDER is not in any closed team but MANAGER has `managerId` set.
- **Fix:** Add two tests:
  1. Open-world sender to MANAGER: allowed
  2. Open-world sender to COS: allowed

### [CC-P5-A6-011] governance-sync test: no coverage for `requestPeerSync` Ed25519 signing (SR-P2-002)
- **File:** tests/governance-sync.test.ts
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (source lines 224-238 add signature headers; test doesn't verify headers)
- **Description:** The source `requestPeerSync` function (governance-sync.ts:217-257) was updated with SR-P2-002 to include Ed25519 signature headers (`X-Host-Id`, `X-Host-Timestamp`, `X-Host-Signature`) on the GET request. The test for `requestPeerSync` (governance-sync.test.ts) verifies the URL, response parsing, and error handling, but does NOT verify that the signature headers are sent. The `@/lib/host-keys` is mocked in this test file (line 50-54), but no assertion checks that `signHostAttestation` was called or that headers include the signature.
- **Evidence:** Tests check `mockFetch.mock.calls[0][0]` (URL) but not `mockFetch.mock.calls[0][1].headers`.
- **Fix:** Add assertions that `signHostAttestation` was called with `gov-sync-read|...` format and that fetch headers include `X-Host-Id`, `X-Host-Timestamp`, `X-Host-Signature`.

### [CC-P5-A6-012] agent-config-governance test: missing mock for `@/lib/governance-sync`
- **File:** tests/agent-config-governance.test.ts
- **Severity:** SHOULD-FIX
- **Category:** mock-accuracy
- **Confidence:** LIKELY (the source `governance.ts` imports `broadcastGovernanceSync` from governance-sync, and governance is mocked but governance-sync may be transitively loaded)
- **Description:** The test mocks `@/lib/governance` but governance.ts itself imports `broadcastGovernanceSync` from `@/lib/governance-sync`. Since `@/lib/governance` is fully mocked in the test, the transitive import of governance-sync doesn't execute. However, if the mock structure changes (e.g., passthrough mock), the real governance-sync would load and attempt to import host-keys, hosts-config, etc., causing test failures. The test file does mock many modules but notably omits `@/lib/governance-sync`.
- **Evidence:** `vi.mock('@/lib/governance', ...)` is present but `vi.mock('@/lib/governance-sync', ...)` is not. Source `lib/governance.ts` line 16: `import { broadcastGovernanceSync } from '@/lib/governance-sync'`.
- **Fix:** Add `vi.mock('@/lib/governance-sync', () => ({ broadcastGovernanceSync: vi.fn() }))` for defensive robustness.


### [CC-P5-A5-005] No authorization checks in agents-messaging-service.ts
- **File:** services/agents-messaging-service.ts (entire file)
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** None of the messaging functions (listMessages, sendMessage, getMessage, updateMessage, deleteMessageById, forwardMessage, addAMPAddressToAgent, removeAMPAddressFromAgent, addEmailAddressToAgent, removeEmailAddressFromAgent) verify that the caller is authorized to act on behalf of the specified `agentId`. Any caller can read, send, update, or delete messages for any agent by providing the agent ID. The headless-router does not add auth checks for these routes either.
- **Evidence:**
  ```typescript
  // agents-messaging-service.ts:192 (listMessages)
  export async function listMessages(
    agentId: string,
    params: { box?: string; status?: any; priority?: any; from?: string; to?: string }
  ): Promise<ServiceResult<any>> {
    // No auth check -- any caller can list any agent's messages
    const { box = 'inbox', status, priority, from, to } = params
    ...
  }
  ```
- **Fix:** Add agent identity verification, either at the service layer (check that requesting agent matches target agent) or at the router layer (require authenticated identity for messaging endpoints).

### [CC-P5-A5-006] updateMetrics accepts arbitrary keys via rest spread
- **File:** services/agents-memory-service.ts:1119
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `updateMetrics()` destructures `body` with a rest spread `...metrics`, then passes the rest to `updateAgentMetrics()`. This means any arbitrary keys from the request body (beyond `action`, `metric`, `amount`) are forwarded as metric updates. Depending on `updateAgentMetrics()`'s implementation, this could allow overwriting unexpected agent properties.
- **Evidence:**
  ```typescript
  // agents-memory-service.ts:1119
  const { action, metric, amount, ...metrics } = body
  // ...
  const agent = updateAgentMetrics(agentId, metrics as UpdateAgentMetricsRequest)
  ```
- **Fix:** Explicitly whitelist allowed metric fields instead of using rest spread. Validate that `metrics` only contains expected keys.

### [CC-P5-A5-007] Missing null check on agent before accessing subconscious in triggerSubconsciousAction
- **File:** services/agents-subconscious-service.ts:73
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `triggerSubconsciousAction()`, `agentRegistry.getAgent(agentId)` is called at line 72, but there is no null check on the returned `agent` before calling `agent.getSubconscious()` at line 73. If `getAgent()` throws for an unknown agent, the error propagates without a friendly 404 response. If it returns null/undefined, calling `.getSubconscious()` would throw a TypeError.
- **Evidence:**
  ```typescript
  // agents-subconscious-service.ts:72-73
  const agent = await agentRegistry.getAgent(agentId)
  const subconscious = agent.getSubconscious()  // No null check on agent
  ```
  Compare with `getSubconsciousStatus()` at line 20 which does check: `if (!agent) { return { error: 'Agent not found', status: 404 } }`
- **Fix:** Add a null check after `getAgent()` and return a 404 `ServiceResult` if agent is not found, matching the pattern used in `getSubconsciousStatus()`.

### [CC-P5-A5-008] connectionString exposed in error messages in agents-graph-service.ts
- **File:** services/agents-graph-service.ts:314-319
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** In `indexDbSchema()`, when database introspection fails (line 300-301), the error message is passed through to the API response via `error instanceof Error ? error.message : 'Unknown error'`. The PostgreSQL `pg` library often includes connection details in error messages. This could leak the `connectionString` (which contains credentials) to the API caller.
- **Evidence:**
  ```typescript
  // agents-graph-service.ts:300-318
  const pool = new Pool({ connectionString })
  const dbSchema = await introspectDatabase(pool)
  // ...
  } catch (error) {
    console.error('[Graph Service] indexDbSchema Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
  ```
- **Fix:** Return a generic error message like `'Failed to connect to database'` instead of passing through the raw error message. Log the full error server-side only.

### [CC-P5-A5-009] Missing path validation for skill settings file access
- **File:** services/agents-skills-service.ts:189
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** In `getSkillSettings()` and `saveSkillSettings()`, the `agentId` parameter is used directly in a file path construction: `path.join(homeDir, '.aimaestro', 'agents', agentId, 'skill-settings.json')`. If `agentId` contains path traversal characters (e.g., `../../../etc/passwd`), it could read or write arbitrary files. The function uses `agentRegistry.getAgent(agentId)` which would likely reject invalid IDs, but the path is constructed before this validation in `getSkillSettings()`.
- **Evidence:**
  ```typescript
  // agents-skills-service.ts:188-192
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const settingsPath = path.join(homeDir, '.aimaestro', 'agents', agentId, 'skill-settings.json')
  try {
    const content = await fs.readFile(settingsPath, 'utf-8')
  ```
- **Fix:** Validate `agentId` against a UUID pattern (e.g., `/^[a-f0-9-]+$/`) before constructing the file path, or use `path.resolve()` and verify it stays within the expected directory.

### [CC-P5-A5-010] Potential infinite loop in background delta indexing
- **File:** services/agents-docs-service.ts:76-78
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `triggerBackgroundDocsDeltaIndexing()` at line 76 calls the same `/api/agents/${agentId}/docs` POST endpoint it is triggered from (inside `queryDocs()`). If the `search` action's background trigger results in another `search` action being processed, this could create infinite recursive HTTP requests. The function does check for `delta: true` in the body, but the endpoint receiving this request will go to `indexDocs()` which should not trigger another search. However, if any error handling or middleware re-routes this, infinite recursion is possible.
- **Evidence:**
  ```typescript
  // agents-docs-service.ts:76-78
  triggerBackgroundDocsDeltaIndexing(agentId, project || undefined).catch((err) => {
    console.error('[Docs Service] Background delta indexing failed:', err)
  })

  // agents-docs-service.ts:253-254 (the self-fetch)
  const response = await fetch(`${selfHost.url}/api/agents/${agentId}/docs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),  // { delta: true }
  })
  ```
- **Fix:** Add a guard to prevent re-triggering delta indexing when the request is already a delta indexing request. For example, pass a header like `X-No-Background-Trigger: true` and check for it in the search handler.

### [CC-P5-A5-011] amount=0 silently defaults to 1 in updateMetrics increment
- **File:** services/agents-memory-service.ts:1122
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `updateMetrics()`, when `action === 'increment'`, the amount defaults to 1 via `amount || 1`. If the caller passes `amount: 0` (e.g., to test without incrementing), it silently becomes 1. The `agents-docker-service.ts` had this same issue with `cpus` (CC-P4-009) and was fixed to use `!= null` instead of `||`.
- **Evidence:**
  ```typescript
  // agents-memory-service.ts:1122
  const success = incrementAgentMetric(agentId, metric as any, amount || 1)
  ```
- **Fix:** Use `amount != null ? amount : 1` or `amount ?? 1` to preserve intentional zero values.

### [CC-P5-A5-012] status parameter typed as `any` without validation in messages-service.ts
- **File:** services/agents-messaging-service.ts:196
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** In `listMessages()`, the `status` parameter is typed as `any` and passed directly to `listAgentInboxMessages()` without validation. Similarly, `priority` is typed as `any`. These should be constrained to known enum values to prevent unexpected behavior from arbitrary inputs.
- **Evidence:**
  ```typescript
  // agents-messaging-service.ts:195-196
  params: {
    box?: string
    status?: any
    priority?: any
    from?: string
    to?: string
  }
  ```
- **Fix:** Type `status` and `priority` to their actual allowed values (e.g., `'unread' | 'read' | 'archived'` for status, `'low' | 'normal' | 'high' | 'urgent'` for priority) and validate before passing through.


### [CC-P5-A1-011] Silent swallow of malformed JSON in POST /api/agents/[id]/docs
- **File:** app/api/agents/[id]/docs/route.ts:53-60
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The POST handler parses the body with `JSON.parse(text)` but catches parse errors silently and uses an empty object `{}` as the body. This means if a client sends syntactically-invalid JSON, the endpoint will proceed with defaults rather than informing the client of the parse error. This differs from the pattern used in other endpoints that return 400.
- **Evidence:**
```typescript
let body: any = {}
try {
  const text = await request.text()
  if (text && text.trim()) {
    body = JSON.parse(text)
  }
} catch {
  // Empty or invalid body - use defaults
}
```
- **Fix:** This appears intentional for empty-body support, but invalid (non-empty) JSON should return 400. Consider: if `text.trim()` is non-empty and `JSON.parse` fails, return 400.

### [CC-P5-A1-012] Silent swallow of malformed JSON in POST /api/agents/[id]/graph/code
- **File:** app/api/agents/[id]/graph/code/route.ts:42-50
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-P5-A1-011 -- invalid non-empty JSON body is silently treated as `{}`.
- **Evidence:**
```typescript
let body: any = {}
try {
  const text = await request.text()
  if (text && text.trim()) {
    body = JSON.parse(text)
  }
} catch {
  // Empty or invalid body - use defaults
}
```
- **Fix:** Distinguish between empty body (allowed) and malformed non-empty JSON (return 400).

### [CC-P5-A1-013] NaN propagation risk in parseInt for depth parameter
- **File:** app/api/agents/[id]/graph/code/route.ts:22
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `depth` parameter parsed with `parseInt(searchParams.get('depth') || '1', 10)` will correctly default to 1 when absent but will yield `NaN` if the user passes a non-numeric string like `?depth=abc`. The `|| '1'` fallback only triggers when the param is null/empty, not when `parseInt` returns `NaN`. This could propagate NaN to the service layer.
- **Evidence:**
```typescript
depth: parseInt(searchParams.get('depth') || '1', 10),
```
- **Fix:** Add NaN guard: `parseInt(searchParams.get('depth') || '1', 10) || 1`

### [CC-P5-A1-014] Potential NaN propagation in parseInt for limit in docs route
- **File:** app/api/agents/[id]/docs/route.ts:28
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** Same pattern: `parseInt(searchParams.get('limit') || '10', 10)` will yield NaN for non-numeric strings.
- **Evidence:**
```typescript
limit: parseInt(searchParams.get('limit') || '10', 10),
```
- **Fix:** Add NaN guard: `parseInt(...) || 10`

### [CC-P5-A1-015] Potential NaN propagation in parseInt for batchSize
- **File:** app/api/agents/[id]/index-delta/route.ts:22
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `parseInt(searchParams.get('batchSize')!)` can return NaN for non-numeric strings. The `|| undefined` fallback on the outer ternary would catch 0 as well, but NaN is falsy so it would become undefined. However, this is inconsistent with the explicit NaN guard applied to the limit parameter in the pending messages endpoint (CC-P3-005). Worth adding explicit NaN handling for consistency.
- **Evidence:**
```typescript
batchSize: searchParams.get('batchSize')
  ? parseInt(searchParams.get('batchSize')!)
  : undefined,
```
- **Fix:** Add explicit NaN guard similar to CC-P3-005 pattern.

### [CC-P5-A1-016] Potential NaN propagation in timeout parameter
- **File:** app/api/agents/unified/route.ts:19
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `parseInt(searchParams.get('timeout') || '3000', 10)` can return NaN for non-numeric strings like `?timeout=abc`.
- **Evidence:**
```typescript
timeout: parseInt(searchParams.get('timeout') || '3000', 10),
```
- **Fix:** Add NaN guard: `parseInt(...) || 3000`

### [CC-P5-A1-017] Error result not checked in GET /api/agents/unified
- **File:** app/api/agents/unified/route.ts:22
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The GET handler does not check `result.error` before returning. If the service returns an error, it will be included in `result.data` but with status 200. All other routes in this codebase check `result.error`.
- **Evidence:**
```typescript
const result = await getUnifiedAgents({...})
return NextResponse.json(result.data)  // <-- no error check
```
- **Fix:** Add error check consistent with other routes:
```typescript
if (result.error) {
  return NextResponse.json({ error: result.error }, { status: result.status })
}
```

### [CC-P5-A1-018] Unchecked JSON parse in agent import options
- **File:** app/api/agents/import/route.ts:23
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `optionsStr` from `formData.get('options')` is parsed with `JSON.parse(optionsStr)` without try/catch. If a user passes malformed JSON in the options field, this will throw and be caught by the outer catch returning 500 instead of a specific 400 error.
- **Evidence:**
```typescript
const options: AgentImportOptions = optionsStr ? JSON.parse(optionsStr) : {}
```
- **Fix:** Wrap in try/catch returning 400 with descriptive error about malformed options JSON.

### [CC-P5-A1-019] Logging user-controlled data to console
- **File:** app/api/conversations/parse/route.ts:13
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The endpoint logs `conversationFile` from the request body directly to console. While this is localhost-only (Phase 1), it could contain sensitive file paths and establishes a bad pattern for when remote access is added.
- **Evidence:**
```typescript
console.log('[Parse Conversation] Request for file:', conversationFile)
```
- **Fix:** Remove or reduce to debug-level logging that can be toggled.

### [CC-P5-A1-020] Inconsistent error response shape across API routes
- **File:** Multiple files
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** There is no consistent error response shape across the API. Some routes return `{ error: string }`, some return `{ success: false, error: string }`, some return `{ error: string, details: string }`, and the meetings routes use `result.data ?? { error: result.error }` which mixes data and error in the same response slot. This makes client-side error handling fragile. The meetings pattern is particularly problematic -- if `result.data` is `null` or `undefined`, the error is returned at 200-level status but with proper HTTP status code overridden by `result.status`.
- **Evidence:**
  - `app/api/agents/[id]/chat/route.ts` uses `{ success: false, error: ... }`
  - `app/api/agents/[id]/route.ts` uses `{ error: ... }`
  - `app/api/agents/[id]/skills/route.ts` uses `{ error: ..., details: ... }`
  - `app/api/meetings/[id]/route.ts` uses `result.data ?? { error: result.error }`
- **Fix:** Standardize error responses across all endpoints. The `result.data ?? { error }` pattern in meetings is the riskiest since it conflates success and error shapes.


### [CC-P5-A0-003] Missing error check in register-peer route before accessing result.data
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/hosts/register-peer/route.ts:17
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P5-A0-002 but for `registerPeer`. The service function always returns with `data` set (embedding errors inside `data.error`), so the route works correctly today. However, it deviates from the `ServiceResult` contract and is fragile against refactoring. Classified as SHOULD-FIX because `registerPeer` is less likely to be refactored to return errors at the top level given its complex response shape.
- **Evidence:**
```typescript
// register-peer/route.ts:17
const result = await registerPeer(body)
return NextResponse.json(result.data, { status: result.status })
```
- **Fix:** Add the standard `if (result.error)` check: `if (result.error) { return NextResponse.json({ error: result.error }, { status: result.status }) }`.

### [CC-P5-A0-004] SSRF potential in hosts/health endpoint -- no destination URL validation
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/hosts/health/route.ts:12-13
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `GET /api/hosts/health?url=<hostUrl>` endpoint proxies a health check request to any user-supplied URL via `checkRemoteHealth(hostUrl)`. The service validates URL format but does not restrict destination to prevent SSRF (Server-Side Request Forgery). An attacker on the local machine could use this to scan internal networks (e.g., `http://169.254.169.254/latest/meta-data/` for cloud metadata, `http://10.0.0.1:8080/admin` for internal services). Phase 1 is localhost-only which mitigates this, but if the server is exposed remotely (Phase 2+), this becomes a high-severity vulnerability.
- **Evidence:**
```typescript
// hosts/health/route.ts
export async function GET(request: NextRequest) {
  const hostUrl = request.nextUrl.searchParams.get('url') || ''
  const result = await checkRemoteHealth(hostUrl) // No URL destination validation
```
- **Fix:** Add URL destination validation in `checkRemoteHealth()`: reject `file://`, `ftp://`, private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x), and `localhost`. Only allow `http://` and `https://` with non-private destinations. Alternatively, restrict to URLs matching configured hosts only.

### [CC-P5-A0-005] Type assertion `as UpdateTaskParams` bypasses type safety
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts:27
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The route spreads unvalidated request body into a type-asserted `UpdateTaskParams`. The `as UpdateTaskParams` cast bypasses TypeScript's type checker, allowing any JSON payload to be passed through. If the service function `updateTeamTask` trusts the type assertion and doesn't validate fields internally, malformed data could corrupt task state.
- **Evidence:**
```typescript
const result = await updateTeamTask(id, taskId, { ...body, requestingAgentId } as UpdateTaskParams)
```
- **Fix:** Either validate the body fields before casting, or ensure `updateTeamTask` performs full runtime validation of all fields (if it already does, add a comment noting that the cast is safe because the service validates).

### [CC-P5-A0-006] Type assertion `as CreateTaskParams` bypasses type safety
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts:50
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-P5-A0-005 but for `createTeamTask`. The unvalidated body is type-asserted as `CreateTaskParams`.
- **Evidence:**
```typescript
const result = await createTeamTask(id, { ...body, requestingAgentId } as CreateTaskParams)
```
- **Fix:** Same as CC-P5-A0-005 -- validate body fields or ensure the service performs runtime validation.

### [CC-P5-A0-007] `any` type annotation on hosts.find callback parameter
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:36
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `.find((h: any) => h.id === hostId)` uses an explicit `any` type annotation. Since `getHosts()` returns `Host[]` and `Host` has an `id` property, the `any` annotation is unnecessary and suppresses type checking.
- **Evidence:**
```typescript
const knownHost = hosts.find((h: any) => h.id === hostId)
```
- **Fix:** Remove the `: any` annotation: `hosts.find(h => h.id === hostId)`. The `Host` type already has the `id` field.

### [CC-P5-A0-008] hostId in error message could leak host identifiers to unauthenticated callers
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:38
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The error message includes the user-supplied `hostId` value: `Unknown host: ${hostId}`. This is an information disclosure -- it confirms to an attacker that the host ID they tried is not in the system, helping enumerate valid host IDs. The hostId comes from the request body's `fromHostId` which was validated to match the `X-Host-Id` header, but at this point we already know the host is unknown, so reflecting the ID just confirms it.
- **Evidence:**
```typescript
return NextResponse.json({ error: `Unknown host: ${hostId}` }, { status: 403 })
```
- **Fix:** Use a generic message: `{ error: 'Unknown host' }` (without echoing the ID). The same pattern is used correctly in `reject/route.ts:37` which says just `'Unknown host'`.


### [CC-P5-A4-003] `convertAMPToMessage` uses `any` type for `ampMsg` parameter, bypassing all type safety
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:192
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `convertAMPToMessage(ampMsg: any)` takes an untyped parameter. This means any field access on `ampMsg` (e.g., `ampMsg.metadata?.status`, `ampMsg.local?.status`, `ampMsg.signature`, `ampMsg.sender_public_key`) is unchecked at compile time. Given the function already validates `envelope` and `payload` fields, a proper type (even a partial one like `{ envelope?: AMPEnvelope; payload?: AMPPayload; metadata?: { status?: string }; local?: { status?: string }; signature?: string; sender_public_key?: string }`) would catch field name typos and improve maintainability.
- **Evidence:**
  ```typescript
  function convertAMPToMessage(ampMsg: any): Message | null {
  ```
- **Fix:** Define an interface for the on-disk AMP message format and use it instead of `any`.

### [CC-P5-A4-004] `triggerOldDuplicateCleanup` deletes files matching `msg-*.json` which could catch legitimate messages
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:138
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The one-time cleanup function deletes ALL files matching `msg-*.json` pattern (line 138). However, the `generateMessageId()` function in `message-send.ts:68-73` generates IDs in the format `msg-{timestamp}-{random}`, which produces filenames like `msg-1708635600000-abc123.json`. This means files created by the current system also match the `msg-*.json` pattern. The cleanup is intended to remove "old-format dash copies" but the pattern is overly broad. The distinction between old and new format messages stored as files with `msg-` prefix is not clear.
- **Evidence:**
  ```typescript
  // line 138: cleanup pattern
  if (file.startsWith('msg-') && file.endsWith('.json')) {
    await fs.unlink(path.join(senderPath, file))
  }

  // message-send.ts:72: new message ID format
  return `msg-${timestamp}-${random}`
  ```
- **Fix:** The cleanup should use a more specific pattern to only match old-format duplicates, or check that the message content lacks certain fields that new messages have (like `envelope`). Alternatively, if underscore-format (`msg_*`) is the canonical storage format, only delete dash-format files that have a corresponding underscore-format sibling.

### [CC-P5-A4-005] `markMessageAsRead` and `archiveMessage` have TOCTOU race on file read/write
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:709-735, 757-782
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** Both `markMessageAsRead` and `archiveMessage` read a file, parse JSON, modify status, and write it back without any locking. If two concurrent requests modify the same message file (e.g., mark-as-read while another request archives), one write will overwrite the other. This is a classic TOCTOU (time-of-check-time-of-use) race condition. In a single-threaded Node.js server this is lower risk since the async operations would need to interleave at the `await` points, but it is still possible if two API requests arrive for the same message simultaneously.
- **Evidence:**
  ```typescript
  // markMessageAsRead: read → parse → modify → write (no lock)
  const content = await fs.readFile(messagePath, 'utf-8')
  const raw = JSON.parse(content)
  raw.metadata.status = 'read'
  await fs.writeFile(messagePath, JSON.stringify(raw, null, 2))
  ```
- **Fix:** Use atomic write (write to temp file + rename) or a simple file-lock mechanism to prevent concurrent modifications.

### [CC-P5-A4-006] `cleanupAgentCacheSweep` is exported but never called outside the module
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:457-460
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED (verified via grep)
- **Description:** The `cleanupAgentCacheSweep()` function is exported for shutdown/test cleanup, but grep shows it is never imported or called anywhere in the codebase. The interval `_agentCacheSweepInterval` is created at module load and `.unref()` is called so it won't prevent process exit, but in test environments this leaked interval could cause issues with test runners (e.g., vitest/jest complaining about open handles). The function exists but is dead code.
- **Evidence:**
  ```
  $ grep -r "cleanupAgentCacheSweep" → only found at lib/messageQueue.ts:457
  ```
- **Fix:** Either wire `cleanupAgentCacheSweep()` into the server shutdown handler and test teardown, or document that `.unref()` makes explicit cleanup unnecessary and remove the export.

### [CC-P5-A4-007] `hashApiKey` uses unsalted SHA-256, making it vulnerable to rainbow table attacks
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:100-102
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** API key hashes are stored using plain SHA-256 with no salt: `createHash('sha256').update(apiKey).digest('hex')`. While API keys have high entropy (32 random bytes = 256 bits), using unsalted hashes means that if two agents somehow receive the same key (impossible in practice due to entropy, but defense-in-depth applies), they would have the same hash. More importantly, if the key file is compromised, an attacker could use precomputed tables for the known `amp_live_sk_` prefix format to recover keys faster than with salted hashes. Industry best practice for credential storage is to use a salted hash (bcrypt, scrypt, argon2) or at minimum HMAC-SHA256 with a per-record salt.
- **Evidence:**
  ```typescript
  export function hashApiKey(apiKey: string): string {
    return 'sha256:' + createHash('sha256').update(apiKey).digest('hex')
  }
  ```
- **Fix:** For API keys with 256 bits of entropy, SHA-256 is technically sufficient for the threat model (brute force is infeasible). However, adding a per-record salt would be a low-cost defense-in-depth improvement. Consider: `HMAC-SHA256(salt, apiKey)` where salt is stored alongside the hash.

### [CC-P5-A4-008] `sendFromUI` passes `fromAgent?.agentId || null` to `checkMessageAllowed` but `fromAgent?.agentId` could be empty string
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:193
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** When the sender resolves but has no UUID (e.g., external agent resolved by alias only), `fromAgent?.agentId` could be an empty string `''`. The expression `fromAgent?.agentId || null` would correctly convert empty string to `null` (since `'' || null` evaluates to `null`), which then triggers the null-sender path in `checkMessageAllowed`. However, in `forwardFromUI` at line 437, the same pattern uses `fromResolved.agentId || null` where `fromResolved.agentId` is the result of `resolveAgentIdentifier(fromAgent)` which returns `agent.id` from the registry. If the registry has an agent with an empty `id` field (data corruption), this would pass an empty-string sender to the filter, which would bypass the null-sender check (Step 1 in message-filter.ts) but then proceed with `senderTeams = closedTeams.filter(t => t.agentIds.includes(''))`, which would correctly return no teams. So the empty-string case is handled, but inconsistently and accidentally.
- **Evidence:**
  ```typescript
  // line 193
  senderAgentId: fromAgent?.agentId || null,
  // line 437
  senderAgentId: fromResolved.agentId || null,
  ```
- **Fix:** Add explicit empty-string check: `senderAgentId: fromAgent?.agentId?.length ? fromAgent.agentId : null`


### [CV-P5-001] Claim: "agentHostMap field on Team type for multi-host team membership tracking"
- **Source:** CHANGELOG.md line 16, commit ccc1649
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The `agentHostMap?: Record<string, string>` field is declared on the `Team` interface in `types/team.ts:30`.
- **What's missing:** The field has a JSDoc comment `@planned Layer 3 -- not yet populated or consumed anywhere`. No code reads from or writes to `agentHostMap`. It is a dead type declaration.
- **Evidence:** `types/team.ts:29-30` -- `/** @planned Layer 3 -- not yet populated or consumed anywhere; will be used for cross-host team routing */ agentHostMap?: Record<string, string>`
- **Impact:** The CHANGELOG implies this field enables "multi-host team membership tracking," but it is purely a type stub with zero implementation. Consumers expecting it to have data will find it always `undefined`. Low impact because the field is optional and the code comment is honest about its status, but the CHANGELOG entry is misleading.

### [CV-P5-002] Claim: "configure-agent" as a cross-host governance request type
- **Source:** types/governance-request.ts line 20, cross-host-governance-service.ts
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The `configure-agent` type is defined in `GovernanceRequestType` (types/governance-request.ts:20), the `configuration` payload field exists (types/governance-request.ts:53), and `receiveCrossHostRequest` accepts it as a valid type (services/cross-host-governance-service.ts:143).
- **What's missing:** `submitCrossHostRequest` explicitly rejects it via IMPLEMENTED_TYPES allowlist (services/cross-host-governance-service.ts:94-96). `performRequestExecution` has a `default` case that logs a warning: "Request type 'configure-agent' execution is not yet implemented" (services/cross-host-governance-service.ts:441-443). The governance-endpoint-auth test explicitly verifies it is rejected (tests/governance-endpoint-auth.test.ts:290-294).
- **Evidence:** `services/cross-host-governance-service.ts:94` -- `const IMPLEMENTED_TYPES = ['add-to-team', 'remove-from-team', 'assign-cos', 'remove-cos', 'transfer-agent']` -- configure-agent is NOT in this list.
- **Impact:** A remote host can receive a `configure-agent` request but cannot submit one, and execution is a no-op. The type is scaffolded but not wired end-to-end.

### [CV-P5-003] Claim: "Layer 5 ... agent configuration governance enforcement" (CHANGELOG line 14, commit ccc1649)
- **Source:** CHANGELOG.md line 14: "Agent configuration governance (Layer 5): MANAGER/COS role enforcement on agent CRUD operations"
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** Role enforcement IS implemented on `createNewAgent`, `updateAgentById`, and `deleteAgentById` in `services/agents-core-service.ts:602-714`. When `requestingAgentId` is provided, governance checks are applied. Tests verify this (16 tests in agent-config-governance.test.ts).
- **What's missing:** The enforcement is **optional** -- if no `X-Agent-Id` / `Authorization` header is present, the code skips governance checks entirely (backward compat). The CHANGELOG says "Layer 5" but the actual code comments in headless-router.ts say "Layer 5: **optional** governance enforcement when agent identity is provided" (lines 606, 967, 975). This is by design for Phase 1 but the CHANGELOG doesn't mention the "optional" qualifier.
- **Evidence:** `services/agents-core-service.ts:604` -- `if (requestingAgentId) {` -- the entire governance enforcement is wrapped in a conditional that is false when no auth is provided.
- **Impact:** The governance can be bypassed by simply not sending auth headers. The code acknowledges this is Phase 1 behavior, but the CHANGELOG entry implies governance is always enforced. Low severity because the code is honest in comments and the test file title says "Layer 5" without claiming it's mandatory.

---


---

## Nits & Suggestions


### [CC-P5-A2-005] isChiefOfStaffAnywhere checks all teams but does not guard against null chiefOfStaffId matching
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance.ts`:147-152
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `isChiefOfStaffAnywhere()` has a null guard on `agentId` (line 148) but does not guard against `team.chiefOfStaffId` being null. If a closed team has `chiefOfStaffId: null` (which should not normally happen due to the G5 auto-downgrade rule, but could occur due to data corruption or race conditions), the comparison `null === agentId` would be false (since agentId is a non-empty string after the null guard), so there's no actual bug. However, this contrasts with `isChiefOfStaff()` which explicitly handles this by checking `team.chiefOfStaffId === agentId` after the null guard, where the same logic applies. Both are safe but the pattern is subtly different from `isManager` which explicitly checks `!config.managerId`.
- **Evidence:**
```typescript
// governance.ts:147-152
export function isChiefOfStaffAnywhere(agentId: string): boolean {
  const teams = loadTeams()
  return teams.some(
    (team) => team.type === 'closed' && team.chiefOfStaffId === agentId
  )
}
```
- **Fix:** No bug, but for consistency with the defensive pattern in `isManager()`, consider the explicit guard or a comment noting why it's safe.

### [CC-P5-A2-006] GovernanceRole type alias adds indirection without value
- **File:** `/Users/emanuelesabetta/ai-maestro/types/governance.ts`:19
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `GovernanceRole` is a type alias for `AgentRole` with a comment saying they are the same thing. The alias does not add semantic distinction or constraints. Callers that use `GovernanceRole` instead of `AgentRole` add indirection that makes the codebase harder to navigate.
- **Evidence:**
```typescript
export type GovernanceRole = AgentRole
```
- **Fix:** Consider removing `GovernanceRole` and using `AgentRole` directly everywhere. If kept for documentation purposes, ensure it's used consistently.

### [CC-P5-A2-007] Unused import: `renameSync` missing from transfer-registry.ts imports for atomic write fix
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts`:9
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The import statement imports `{ readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync }` from `'fs'` but does NOT include `renameSync`, which is needed if the atomic write fix (CC-P5-A2-003) is applied. This is not a current bug, but rather a note for the fix implementation.
- **Evidence:**
```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs'
```
- **Fix:** When applying CC-P5-A2-003, add `renameSync` to the import.


### [CC-P5-A3-008] Inconsistent error return patterns across registries
- **File:** /Users/emanuelesabetta/ai-maestro/lib/document-registry.ts:47, /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:48
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `saveDocuments` and `saveTasks` return `boolean` (true/false) to indicate success/failure, while `saveAgents` also returns boolean but `saveApiKeys` throws on failure. The inconsistent error handling patterns make it harder to reason about error propagation. Callers of `saveDocuments`/`saveTasks` ignore the return value in most cases (e.g., `createDocument` line 87, `createTask` line 126).
- **Evidence:**
  ```typescript
  // document-registry.ts - return value ignored
  documents.push(doc)
  saveDocuments(data.teamId, documents)  // return value not checked
  return doc

  // amp-auth.ts - throws on failure
  function saveApiKeys(keys: AMPApiKeyRecord[]): void {
    // ...
    throw new Error('Failed to save API key')
  }
  ```
- **Fix:** Choose a consistent pattern: either always throw on save failure (fail-fast), or always check return values. Given the CLAUDE.md preference for fail-fast, throwing is preferred.

### [CC-P5-A3-009] generateUniquePersonaName can return a duplicate when all names are used
- **File:** /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts:96-101
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When all persona names in the list are already used (`attempts >= names.length`), the function falls through and returns `names[index]` which IS a duplicate. The comment on line 125 acknowledges the similar issue for avatars ("Fallback if all 100 are used (unlikely)"), but the persona name function has no such comment or fallback logic.
- **Evidence:**
  ```typescript
  while (usedLabels.has(names[index]) && attempts < names.length) {
    index = (index + 1) % names.length
    attempts++
  }
  return names[index]  // May be a duplicate if all names are used
  ```
- **Fix:** When all names are used, append a numeric suffix (e.g., "Maria-2") to guarantee uniqueness, or log a warning.

### [CC-P5-A3-010] rate-limit check and record are not atomic
- **File:** /Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts:12-13
- **Severity:** NIT
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The comment on line 12 acknowledges that `check` and `record` are not atomic. Between `checkRateLimit` returning `{allowed: true}` and `recordFailure` being called, another concurrent request could also check and get `{allowed: true}`, allowing `maxAttempts + N` concurrent requests through. The comment correctly notes this is acceptable for Phase 1 single-process localhost.
- **Evidence:**
  ```typescript
  // Note: check and record are not atomic — acceptable for Phase 1 single-process localhost.
  // Phase 2: use atomic increment.
  ```
- **Fix:** Consider combining into a single `checkAndRecord` function that atomically checks and increments in one call, even for Phase 1. This is a simple change that eliminates the race.

### [CC-P5-A3-011] file-lock has no deadlock detection or timeout
- **File:** /Users/emanuelesabetta/ai-maestro/lib/file-lock.ts:74
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The comment on line 74 acknowledges "No deadlock detection or lock timeout." If a lock holder crashes (unhandled exception that escapes the finally block) or enters an infinite loop, all queued waiters will wait forever. The documented lock ordering convention (teams -> transfers -> governance) prevents deadlocks between different lock names, but a single stuck lock holder can still cause a hang.
- **Evidence:**
  ```typescript
  // Note: No deadlock detection or lock timeout.
  // Lock ordering convention: 'teams' before 'transfers' before 'governance'
  ```
- **Fix:** Add an optional timeout parameter to `acquireLock` / `withLock` that rejects the promise after a configurable duration (e.g., 30 seconds), preventing indefinite hangs. This is low priority for Phase 1 localhost.


### [CC-P5-A7-011] screenReaderMode explicitly disabled in useTerminal
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTerminal.ts:107
- **Severity:** NIT
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** `screenReaderMode: false` is explicitly set. While this is a reasonable default for a terminal emulator (xterm.js screen reader mode adds an overlay that can interfere with terminal interaction), it completely removes terminal content from the accessibility tree. A comment explaining this trade-off would be helpful.
- **Evidence:**
  ```typescript
  // Disable screen reader mode - accessibility tree handled via CSS pointer-events
  screenReaderMode: false,  // line 107
  ```
- **Fix:** The comment on line 106 partially explains, but could be more explicit about the trade-off: terminal content is inaccessible to screen readers by design, with copy/paste as the workaround.

### [CC-P5-A7-012] GovernancePasswordDialog has redundant state reset on close
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:26-33 and 36-43
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** State is reset both in the `useEffect` when `isOpen` becomes true (lines 26-33) and in `handleClose` (lines 39-42). The `useEffect` reset is sufficient since `isOpen` toggles before re-open. The `handleClose` reset is defensive (in case parent doesn't toggle `isOpen` immediately) but creates duplication.
- **Evidence:**
  ```typescript
  // Effect resets on open
  useEffect(() => {
    if (isOpen) {
      setPassword(''); setConfirmPassword(''); setError(null); setSubmitting(false)
    }
  }, [isOpen])

  // handleClose also resets
  const handleClose = useCallback(() => {
    if (submitting) return
    onClose()
    setPassword(''); setConfirmPassword(''); setError(null)
  }, [submitting, onClose])
  ```
- **Fix:** This is defensive and acceptable. No action needed, but a comment like "Defensive reset in case parent delays isOpen toggle" would clarify intent.

### [CC-P5-A7-013] localStorage reads use mount-only effects without storageId in deps
- **File:** /Users/emanuelesabetta/ai-maestro/components/TerminalView.tsx:498-508, 510-519
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Notes and prompt draft are loaded from localStorage using mount-only effects (empty deps `[]`) but keyed by `storageId`. In the tab-based architecture, each TerminalView is mounted once per agent and never re-mounts, so this is correct. However, if `storageId` were to change (e.g., `session.agentId` updated), the stale value would persist. The eslint-disable comments acknowledge this.
- **Evidence:**
  ```typescript
  useEffect(() => {
    const key = `agent-notes-${storageId}`
    const savedNotes = localStorage.getItem(key)
    if (savedNotes !== null) { setNotes(savedNotes) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  ```
- **Fix:** No action needed for current architecture. The comment adequately explains the design choice.

### [CC-P5-A7-014] RoleBadge default case uses String() conversion on exhausted type
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx:64-72
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `default` case in the switch handles a theoretically `never` type by converting with `String(role)`. This is good defensive coding (CC-P1-708 comment explains), but the explicit type assertion comment could also note that this default branch is unreachable unless `GovernanceRole` is extended without updating this component.
- **Evidence:**
  ```typescript
  default: {
    // CC-P1-708: Use String() instead of `as string` to convert the exhausted `never` type safely.
    const displayLabel = String(role).toUpperCase()
  ```
- **Fix:** No change needed. The defensive pattern is correct.

### [CC-P5-A7-015] TeamOverviewSection re-fetches repos on every section expand
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:74-93
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `AgentProfileTab.tsx`, the repos fetch effect depends on `expandedSections.repositories` but unlike `AgentProfile.tsx` (which has a `reposLoaded` guard on line 122), this component will re-fetch repos every time the section is collapsed and re-expanded.
- **Evidence:**
  ```typescript
  // AgentProfileTab.tsx:74
  useEffect(() => {
    if (!expandedSections.repositories) return
    // No reposLoaded guard — fetches on every expand
    const fetchRepos = async () => { ... }
    fetchRepos()
  }, [agent.id, baseUrl, expandedSections.repositories])
  ```
  vs AgentProfile.tsx:122:
  ```typescript
  useEffect(() => {
    if (!isOpen || !agentId || !expandedSections.repositories || reposLoaded) return
    // reposLoaded guard prevents re-fetch
  ```
- **Fix:** Add a `reposLoaded` state guard matching the pattern in AgentProfile.tsx.


### [CC-P5-A6-013] governance-endpoint-auth test: `buildLocalGovernanceSnapshot` imported but not tested directly
- **File:** tests/governance-endpoint-auth.test.ts:105
- **Severity:** NIT
- **Category:** test-correctness
- **Confidence:** CONFIRMED
- **Description:** The test imports `buildLocalGovernanceSnapshot` from governance-sync (line 105) but never uses it in any test. It's used internally by `broadcastGovernanceSync` but not tested directly in this file. The function is tested in `governance-sync.test.ts` instead. This is a dead import.
- **Evidence:** Line 105: `import { broadcastGovernanceSync, buildLocalGovernanceSnapshot } from '@/lib/governance-sync'`. grep for `buildLocalGovernanceSnapshot` in assertions: no matches.
- **Fix:** Remove the unused import: `import { broadcastGovernanceSync } from '@/lib/governance-sync'`.

### [CC-P5-A6-014] role-attestation test: `buildValidAttestation` does not include `recipientHostId` in data string
- **File:** tests/role-attestation.test.ts:90
- **Severity:** NIT
- **Category:** test-correctness
- **Confidence:** CONFIRMED
- **Description:** The `buildValidAttestation` helper constructs the data string as `${att.role}|${att.agentId}|${att.hostId}|${att.timestamp}` (line 90), which does not account for `recipientHostId`. If a test passes `recipientHostId` in overrides, the binding data would be wrong and verification would fail for the wrong reason. This is related to CC-P5-A6-009 (no `recipientHostId` test coverage) but is independently a test helper bug.
- **Evidence:** Line 90: `const dataStr = \`${att.role}|${att.agentId}|${att.hostId}|${att.timestamp}\``. Source `buildAttestationData` (line 27-28): adds `|${attestation.recipientHostId}` when present.
- **Fix:** Update `buildValidAttestation` to include recipientHostId in the data string when present:
  ```ts
  let dataStr = `${att.role}|${att.agentId}|${att.hostId}|${att.timestamp}`
  if (att.recipientHostId) dataStr += `|${att.recipientHostId}`
  ```

### [CC-P5-A6-015] cross-host-governance test: unused `mockExecuteGovernanceRequest` mock
- **File:** tests/cross-host-governance.test.ts:54,65,156
- **Severity:** NIT
- **Category:** test-correctness
- **Confidence:** CONFIRMED
- **Description:** `mockExecuteGovernanceRequest` is declared (line 54), wired into the mock factory (line 65), and has a default return value set (line 156), but is never asserted against in any test. The CC-003 fix removed the redundant `executeGovernanceRequest` call from the source code, so this mock is dead code.
- **Evidence:** Line 54: `const mockExecuteGovernanceRequest = vi.fn()`. grep for `mockExecuteGovernanceRequest` in `expect()`: no matches.
- **Fix:** Remove the `mockExecuteGovernanceRequest` declaration, mock entry, and default setup.

### [CC-P5-A6-016] governance-endpoint-auth test: SR-007 tests use `requestedByRole: 'manager' as const` but source also checks COS
- **File:** tests/governance-endpoint-auth.test.ts:258-343
- **Severity:** NIT
- **Category:** coverage-gap
- **Confidence:** CONFIRMED
- **Description:** The SR-007 type whitelist tests all use `requestedByRole: 'manager' as const` in `baseParams`. The source also accepts `'chief-of-staff'` as a role. While the type whitelist check is role-agnostic (it checks `params.type` regardless of role), testing only with `'manager'` means there's no coverage demonstrating that COS can also trigger the whitelist check. This is minor since the check is role-independent, but worth noting for completeness.
- **Evidence:** Line 261: `requestedByRole: 'manager' as const` used in all 5 SR-007 tests.
- **Fix:** Consider adding one test with `requestedByRole: 'chief-of-staff'` to demonstrate role-independence.

### [CC-P5-A6-017] agent-registry test: large test file with 60+ tests could benefit from describe nesting
- **File:** tests/agent-registry.test.ts (986 lines)
- **Severity:** NIT
- **Category:** test-correctness
- **Confidence:** CONFIRMED
- **Description:** The test file has 60+ tests in a flat structure. While tests are organized by function name in describe blocks, some describe blocks (e.g., `createAgent`) have many tests that could be further nested by category (success paths, error paths, edge cases). This is purely a readability/maintenance concern.
- **Evidence:** File is 986 lines with 60+ `it()` blocks.
- **Fix:** No functional change needed. Consider nesting describe blocks for large test groups.

### [CC-P5-A6-018] test-utils/fixtures.ts: `makeServiceResult` helper exists but is not used anywhere
- **File:** tests/test-utils/fixtures.ts:150-155
- **Severity:** NIT
- **Category:** test-correctness
- **Confidence:** LIKELY (searched for `makeServiceResult` across test files, no usage found)
- **Description:** The `makeServiceResult` factory function is exported but no test file imports or uses it. It may have been intended for future tests or was left behind after refactoring.
- **Evidence:** Line 150-155 in fixtures.ts defines `makeServiceResult`. No import of this function found in any test file.
- **Fix:** Either remove the unused factory or note it for future use.


### [CC-P5-A5-013] Dead code: unused `escapeForCozo` import in config-service.ts
- **File:** services/config-service.ts:34
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY (needs grep to confirm no usage within the file -- checked via readback, `escapeForCozo` IS used at line 787)
- **RETRACTED**: After reviewing the config-service.ts content, `escapeForCozo` is used at line 787 in `getConversationMessages()`. This finding is invalid.

### [CC-P5-A5-014] Inconsistent use of `any` type throughout services
- **File:** multiple files
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Many service functions use `ServiceResult<any>` instead of defining proper return types. While this works at runtime, it eliminates compile-time type checking for callers. Files affected include: agents-memory-service.ts, agents-graph-service.ts, agents-docs-service.ts, agents-messaging-service.ts, agents-subconscious-service.ts, config-service.ts, domains-service.ts.
- **Evidence:**
  ```typescript
  // agents-memory-service.ts:644
  ): Promise<ServiceResult<any>> {

  // agents-graph-service.ts:285
  ): Promise<ServiceResult<any>> {
  ```
- **Fix:** Define specific result type interfaces for each service function instead of using `any`.

### [CC-P5-A5-015] Redundant pattern: `readyState === 1` magic number in shared-state.ts
- **File:** services/shared-state.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED (from prior session review -- file uses `readyState === 1` instead of `WebSocket.OPEN`)
- **Description:** The shared state uses magic number 1 to check WebSocket ready state instead of the named constant `WebSocket.OPEN`. While functionally equivalent, the named constant is more readable and self-documenting.
- **Fix:** Use `WebSocket.OPEN` (or the equivalent constant from the WebSocket library) instead of `1`.

### [CC-P5-A5-016] Console.log in production code for playback service
- **File:** services/agents-playback-service.ts:47-49, 104-106
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The playback service uses `console.log()` for request tracing, which is fine for development but noisy in production. Other services use this pattern too, but the playback service is entirely placeholder code that logs on every request.
- **Fix:** Either gate behind a debug flag or remove logging from placeholder implementations.


### [CC-P5-A1-021] Redundant `details: result.error` in health proxy response
- **File:** app/api/agents/health/route.ts:29
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The error response includes both `error` and `details` with the same value from `result.error`. The `details` field is redundant.
- **Evidence:**
```typescript
return NextResponse.json(
  { error: result.error, details: result.error },  // <-- details === error
  { status: result.status }
)
```
- **Fix:** Remove `details` or provide actual details (e.g., stack trace in dev mode).

### [CC-P5-A1-022] Redundant `details: result.error` in register response
- **File:** app/api/agents/register/route.ts:19
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue: both `error` and `details` contain `result.error`.
- **Evidence:**
```typescript
return NextResponse.json(
  { error: result.error, details: result.error },
  { status: result.status }
)
```
- **Fix:** Remove redundant `details` field.

### [CC-P5-A1-023] Unused import `NextRequest` in several files
- **File:** app/api/agents/[id]/database/route.ts:1, app/api/agents/[id]/tracking/route.ts:1
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** `NextRequest` is imported but the `request` parameter is typed as `NextRequest` and used only to extract params. The import itself is used, but the `request` variable is never accessed for its NextRequest-specific features (like `nextUrl`). This is very minor.
- **Evidence:**
```typescript
import { NextRequest, NextResponse } from 'next/server'
// request is used only as a positional argument, never accessed
```
- **Fix:** Use `_request: NextRequest` or just `Request` type. Very minor.

### [CC-P5-A1-024] Missing top-level try/catch in several agent route handlers
- **File:** app/api/agents/[id]/amp/addresses/route.ts, app/api/agents/[id]/amp/addresses/[address]/route.ts, app/api/agents/[id]/email/addresses/route.ts, app/api/agents/[id]/email/addresses/[address]/route.ts, app/api/agents/[id]/metrics/route.ts
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** These thin-wrapper routes delegate to service functions but do not have top-level try/catch. If the service function throws an unexpected error (as opposed to returning a result with `.error`), the client will receive a generic Next.js 500 page. Other routes in this codebase have added top-level try/catch (annotated with CC-P3/CC-P4 fix IDs). This is minor since the service functions are designed to not throw, but for defense-in-depth consistency, adding a catch would be ideal.
- **Fix:** Add top-level try/catch like the pattern in `app/api/agents/route.ts`.


### [CC-P5-A0-009] Inconsistent error response patterns across routes
- **File:** Multiple files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Three different error response patterns exist across the routes in this domain:
  1. **Pattern A** (governance/trust, governance/manager, governance/password, transfers/resolve, teams/chief-of-staff, hosts/[id]): Direct `if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })` -- clean and explicit.
  2. **Pattern B** (v1/governance/requests, v1/governance/approve, v1/governance/reject): `return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })` -- compact but harder to read and hides the error/success branching.
  3. **Pattern C** (hosts/register-peer, hosts/exchange-peers): No error check at all -- relies on error being embedded in `result.data.error`.

  This inconsistency makes maintenance error-prone. Pattern A is the clearest and most defensive.
- **Fix:** Standardize on Pattern A across all routes for consistency.

### [CC-P5-A0-010] Missing UUID validation on path parameters in several routes
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/hosts/[id]/route.ts
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Several routes accept path parameters (`id`, `docId`, `taskId`) without UUID format validation at the route level. Compare with `governance/transfers/[id]/resolve/route.ts:22` and `teams/[id]/chief-of-staff/route.ts:14` which both validate `isValidUuid(id)`. The service layer may validate internally, but defense-in-depth at the route level is more consistent.
- **Evidence:**
```typescript
// teams/[id]/route.ts - no UUID validation on 'id'
const { id } = await params
const result = getTeamById(id, requestingAgentId)
// vs chief-of-staff/route.ts which does:
if (!isValidUuid(id)) {
  return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
}
```
- **Fix:** Add `isValidUuid(id)` checks to all route handlers that accept UUID path parameters, for consistency with the established pattern.

### [CC-P5-A0-011] Missing `export const dynamic = 'force-dynamic'` on several routes that read runtime state
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** POSSIBLE
- **Description:** Some GET routes read runtime state (governance config, agent list, team list) but don't export `dynamic = 'force-dynamic'`. Next.js may attempt to statically generate or cache these responses. Other routes like `hosts/route.ts`, `hosts/[id]/route.ts`, and `hosts/identity/route.ts` correctly set `export const dynamic = 'force-dynamic'`. While Next.js typically treats routes with dynamic imports or headers access as dynamic, explicit marking is safer.
- **Evidence:**
```typescript
// governance/route.ts - reads runtime governance config, no dynamic export
export async function GET() {
  const config = loadGovernance()
  ...
}

// hosts/route.ts - correctly marks as dynamic
export const dynamic = 'force-dynamic'
```
- **Fix:** Add `export const dynamic = 'force-dynamic'` to all GET routes that read runtime state from the filesystem.


### [CC-P5-A4-009] `notification-service.ts` uses emoji in notification format which may render incorrectly in some terminal emulators
- **File:** /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:74-76
- **Severity:** NIT
- **Category:** logic
- **Confidence:** POSSIBLE
- **Description:** The `formatNotification` function hardcodes emoji characters for priority indicators (lines 74-76). While modern terminals generally support Unicode/emoji, some minimal terminal environments or older tmux configurations may not render these correctly, producing garbled output in the agent's terminal.
- **Evidence:**
  ```typescript
  const priorityPrefix = priority === 'urgent' ? '\ud83d\udd34 [URGENT] '
    : priority === 'high' ? '\ud83d\udfe0 [HIGH] '
    : ''
  ```
- **Fix:** Consider making priority indicators configurable or using plain text alternatives like `[!!!]` and `[!!]`.

### [CC-P5-A4-010] Duplicate `ResolvedAgent` interface definitions across files
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:90-97, /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:42-49
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `ResolvedAgent` interface is defined in both `messageQueue.ts` (lines 90-97) and `message-send.ts` (lines 42-49). The definitions are nearly identical but `message-send.ts` omits `hostUrl` while `messageQueue.ts` includes it. This is fragile: if one definition is updated, the other may not be, leading to subtle type mismatches. The `message-send.ts` version is used for its own internal types, while it imports `resolveAgentIdentifier` from `messageQueue.ts` which returns the `messageQueue.ts` version.
- **Evidence:**
  ```typescript
  // messageQueue.ts:90-97
  interface ResolvedAgent {
    agentId: string
    alias: string
    displayName?: string
    sessionName?: string
    hostId?: string
    hostUrl?: string  // <-- present here
  }

  // message-send.ts:42-49
  interface ResolvedAgent {
    agentId: string
    alias: string
    displayName?: string
    sessionName?: string
    hostId?: string
    hostUrl?: string  // <-- also present actually
  }
  ```
- **Fix:** Export `ResolvedAgent` from `messageQueue.ts` and import it in `message-send.ts` instead of re-declaring.

### [CC-P5-A4-011] `getSelfHostName` is duplicated between `messageQueue.ts` and `message-send.ts`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:14-21, /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:78-85
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The function `getSelfHostName()` in `messageQueue.ts` (lines 14-21) and `getHostName()` in `message-send.ts` (lines 78-85) have identical implementations. This violates DRY and means bug fixes need to be applied in both places.
- **Evidence:**
  ```typescript
  // messageQueue.ts:14-21
  function getSelfHostName(): string {
    try {
      const selfHost = getSelfHost()
      return selfHost.name || getSelfHostId() || 'unknown-host'
    } catch {
      return getSelfHostId() || 'unknown-host'
    }
  }

  // message-send.ts:78-85
  function getHostName(): string {
    try {
      const selfHost = getSelfHost()
      return selfHost.name || getSelfHostId() || 'unknown-host'
    } catch {
      return getSelfHostId() || 'unknown-host'
    }
  }
  ```
- **Fix:** Extract to a shared utility (e.g., `lib/host-utils.ts`) and import in both files.

### [CC-P5-A4-012] `saveApiKeys` writes JSON without atomic write (write-to-temp + rename)
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:82
- **Severity:** NIT
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** `saveApiKeys` uses `fs.writeFileSync(API_KEYS_FILE, ...)` which is not atomic. If the process crashes mid-write (or Node is killed), the file could be left in a corrupt/truncated state, losing all API keys. Using write-to-temp-file + `fs.renameSync` would make this atomic on most filesystems.
- **Evidence:**
  ```typescript
  fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 })
  ```
- **Fix:** Write to `${API_KEYS_FILE}.tmp`, then `fs.renameSync(tmpPath, API_KEYS_FILE)`.


### [CV-P5-004] CHANGELOG test count says "169" -- verified correct
- **Severity:** N/A (informational, no issue)
- **Files affected:** CHANGELOG.md line 19
- **Expected:** 169 tests across 9 files
- **Found:** governance-peers(20) + governance-sync(15) + host-keys(15) + role-attestation(22) + governance-request-registry(25) + cross-host-governance(30) + manager-trust(15) + agent-config-governance(16) + governance-endpoint-auth(11) = 169. **CORRECT.**

---


---

## Source Reports

- `epcp-correctness-P5-3f94a374-3aa9-4cfb-9ef4-23f7b448906c.md`
- `epcp-correctness-P5-49bbb7ff-62db-4c4b-b71d-de8f7f6bb772.md`
- `epcp-correctness-P5-6c2565dd-5da0-477e-8b87-6190e8270403.md`
- `epcp-correctness-P5-95d3ae7b-07e6-4eef-8223-205835b28305.md`
- `epcp-correctness-P5-bcd48980-0bdd-4634-86fa-ae9e702ead6e.md`
- `epcp-correctness-P5-c740d838-4df0-4c2f-b837-2ecf81c9b94f.md`
- `epcp-correctness-P5-d47d0772-90c1-45bc-a972-3fbc8f09d84d.md`
- `epcp-correctness-P5-ea27aa6a-a6b4-4412-863c-c19ea713ca80.md`
- `epcp-claims-P5-e78553ca-bf52-4fba-b560-da5a24ad2307.md`
- `epcp-review-P5-560f7159-44ba-4c6a-8658-8141714272e3.md`

