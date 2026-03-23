# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-23-024029
**Pass:** 8
**Run ID:** 57d244f7
**Reports merged:** 12
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 11 |
| **SHOULD-FIX** | 56 |
| **NIT** | 42 |
| **Total** | 116 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


_No MUST-FIX issues found._


(none)


### [CC-P8-A3-001] SSRF allowlist only checks hostname, not port -- can reach internal services on known hosts
- **File:** app/api/hosts/health/route.ts:26-46
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The SSRF allowlist validates that the requested hostname matches a known host from `hosts.json`, but it does not validate the port. If a known host (e.g., `worker1.example.com`) is registered with URL `http://worker1.example.com:23000`, an attacker can craft a request to `http://worker1.example.com:6379` (Redis) or `http://worker1.example.com:5432` (PostgreSQL) and it will pass the allowlist check, allowing SSRF to arbitrary ports on known hosts.
- **Evidence:**
  ```typescript
  // Line 27-31: Only hostname is compared, port is ignored
  const requestHostname = parsed.hostname.toLowerCase()
  const isKnownHost = knownHosts.some(host => {
    try {
      const hostParsed = new URL(host.url)
      if (hostParsed.hostname.toLowerCase() === requestHostname) return true
    } catch { /* skip malformed host URLs */ }
  ```
- **Fix:** Also validate that the port (or port+protocol combination) matches the registered host URL. For example:
  ```typescript
  // Compare origin (protocol + hostname + port) instead of just hostname
  if (hostParsed.origin.toLowerCase() === parsed.origin.toLowerCase()) return true
  ```


### [CC-P8-A0-001] Missing try-catch in agents/[id]/route.ts — unhandled service throws crash the endpoint
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/route.ts:10-76
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The GET, PATCH, and DELETE handlers in this file have no outer try-catch. If `getAgentById()`, `updateAgentById()`, or `deleteAgentById()` throw an unexpected error (rather than returning a result with `.error`), the exception propagates uncaught to Next.js, resulting in a generic 500 with no structured JSON response. Other routes in this codebase (e.g., `chat/route.ts`, `docs/route.ts`, `export/route.ts`, `repos/route.ts`) consistently wrap their handlers in try-catch. This file is the primary CRUD endpoint for agents, making it high-traffic and high-impact.
- **Evidence:**
```typescript
// Line 10-25: GET handler — no try-catch
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
  const result = getAgentById(id)  // If this throws, unhandled
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
```
- **Fix:** Wrap each handler (GET, PATCH, DELETE) in a try-catch that returns a structured JSON 500 error, consistent with the pattern used in other routes.

### [CC-P8-A0-002] Missing try-catch in multiple graph/memory/tracking routes — service throws go unhandled
- **File:** Multiple files (see list below)
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Several route files have handlers that lack outer try-catch blocks. If the delegated service function throws (e.g., database connection failure, file system error), the exception goes unhandled. Affected files:
  - `app/api/agents/[id]/database/route.ts` — GET (line 9-24) and POST (line 30-45)
  - `app/api/agents/[id]/graph/code/route.ts` — GET (line 9-34), POST (line 40-68), DELETE (line 74-91)
  - `app/api/agents/[id]/graph/db/route.ts` — GET (line 9-31), POST (line 37-57), DELETE (line 63-80)
  - `app/api/agents/[id]/graph/query/route.ts` — GET (line 9-32)
  - `app/api/agents/[id]/hibernate/route.ts` — POST (line 9-36)
  - `app/api/agents/[id]/index-delta/route.ts` — POST (line 13-35)
  - `app/api/agents/[id]/memory/route.ts` — GET (line 9-24) and POST (line 30-50)
  - `app/api/agents/[id]/memory/consolidate/route.ts` — GET (line 13-28), POST (line 39-65), PATCH (line 75-101)
  - `app/api/agents/[id]/memory/long-term/route.ts` — GET (line 25-52), DELETE (line 61-78), PATCH (line 90-115)
  - `app/api/agents/[id]/messages/route.ts` — GET (line 9-32) and POST (line 38-58)
  - `app/api/agents/[id]/messages/[messageId]/route.ts` — all 4 handlers
  - `app/api/agents/[id]/metrics/route.ts` — GET (line 9-24) and PATCH (line 30-50)
  - `app/api/agents/[id]/search/route.ts` — GET (line 22-51) and POST (line 61-84)
  - `app/api/agents/[id]/session/route.ts` — all 4 handlers
  - `app/api/agents/[id]/tracking/route.ts` — GET (line 9-24) and POST (line 30-49)
  - `app/api/agents/[id]/wake/route.ts` — POST (line 9-45)
  - `app/api/agents/[id]/amp/addresses/[address]/route.ts` — GET, PATCH, DELETE (lines 13-77)
  - `app/api/agents/[id]/email/addresses/route.ts` — GET (line 9-25) and POST (line 31-52)
  - `app/api/agents/[id]/email/addresses/[address]/route.ts` — GET, PATCH, DELETE (lines 13-77)
  - `app/api/agents/by-name/[name]/route.ts` — GET (line 8-19)
  - `app/api/agents/unified/route.ts` — GET (line 13-26)
- **Evidence:** (representative example from `database/route.ts`)
```typescript
// Line 9-24: No try-catch
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  if (!isValidUuid(agentId)) { ... }
  const result = await getDatabaseInfo(agentId)  // If this throws, unhandled
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch to each handler that returns `{ error: 'Internal server error' }` with status 500. This is a widespread consistency issue. The routes that DO have try-catch (chat, docs, export, playback, repos, skills, subconscious, transfer, health, register, docker, import, metadata) demonstrate the intended pattern.


No MUST-FIX issues found.


(none)


### [CC-P8-A1-001] Approve route returns `{ error: undefined }` body on error paths instead of proper error object
- **File:** `app/api/v1/governance/requests/[id]/approve/route.ts`:38
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `approveCrossHostRequest` returns an error result (i.e., `result.data` is `undefined` and `result.error` is a string), line 38 uses the nullish coalescing operator `??` to produce the response body:
  ```typescript
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  ```
  This works correctly for error paths (when `result.data` is `undefined`, it falls through to `{ error: result.error }`). However, this pattern is fragile: if `result.data` were ever an empty object `{}` or an explicit falsy value like `null` or `0`, the error message would be silently swallowed. More importantly, if there is an error but `result.data` is also set (a possible bug in the service layer), the error is silently discarded.

  The same pattern appears in the reject route at line 86 and in the requests route at lines 79-82 and 121-124.

  **On further analysis:** The `ServiceResult<T>` type at `types/service.ts` defines `data` and `error` as both optional, so it is theoretically possible for a service to return `{ data: someObject, error: 'some error', status: 400 }`. In that case, the error would be swallowed because `data` is not `undefined`.

  Comparing to the `governance/trust/route.ts` pattern (lines 20-23, 41-44), which correctly branches on `result.error`:
  ```typescript
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
  ```
  The approve/reject routes should use this explicit branching pattern instead.

- **Evidence:**
  ```typescript
  // app/api/v1/governance/requests/[id]/approve/route.ts:38
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })

  // app/api/v1/governance/requests/[id]/reject/route.ts:72, 86
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  ```
- **Fix:** Replace the `??` pattern with explicit error branching:
  ```typescript
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
  ```
  Apply to all four occurrences: approve route line 38, reject route lines 72 and 86.


### [CC-P8-A5-001] Notification service shell injection via literal tmux send-keys with embedded echo command
- **File:** /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:59
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `sendTmuxNotification` function sends `echo '${safeMessage}'` using `sendKeys` with `literal: true`. The literal flag causes tmux to use `-l` which types the string as raw keystrokes. This means the entire string `echo 'Hello'` is typed character-by-character into the terminal. The single-quote escaping at line 58 (`replace(/'/g, "'\\''")`) is designed for shell parsing. However, because the text is typed as literal keystrokes into whatever program is running in the pane, if the pane is NOT running a shell (e.g., a Python REPL, vim, another TUI), the `echo` command text would be injected as input to that program. The comment on lines 52-53 acknowledges this as a known limitation. The more critical issue is that the single-quote escaping scheme `'\\''` actually produces `'\''` in the literal keystrokes - this will close the current single-quote context, insert a backslash-escaped single quote, and reopen single quotes. But since `literal: true` means tmux types each character individually, the shell will correctly parse the sequence. This is actually correctly implemented for the intended use case (shell prompt). **Downgrading assessment:** The escaping is correct for shells. The acknowledged limitation about non-shell programs is a design tradeoff, not a bug. **Revised severity: NIT** (see NIT section).

*After deeper analysis, this is not a MUST-FIX. Moved to NIT.*

### [CC-P8-A5-002] `fromVerified` double nullish coalescing is a no-op
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:267
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The expression `ampMsg.fromVerified ?? Boolean(envelope.signature || ampMsg.signature) ?? false` has a redundant `?? false` at the end. The `Boolean()` call always returns either `true` or `false` -- it never returns `null` or `undefined`. So the final `?? false` will NEVER execute. This is not a bug per se (the behavior is correct), but it suggests the author intended a different logic. Since `Boolean(...)` cannot be nullish, this is misleading dead code rather than a correctness issue.
- **Evidence:**
```typescript
fromVerified: ampMsg.fromVerified ?? Boolean(envelope.signature || ampMsg.signature) ?? false,
```
- **Fix:** Remove the trailing `?? false` since it is unreachable: `ampMsg.fromVerified ?? Boolean(envelope.signature || ampMsg.signature)`

*Revised severity: NIT (no runtime impact, just misleading code)*


### [CC-P8-A9-001] `portable_sed` passes all args to `sed` including the file, causing double file specification
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:322-325
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `portable_sed` function extracts the last argument as the file (for `.bak` removal) but then passes ALL arguments (`"$@"`) to `sed -i.bak`, which means `sed` receives the original arguments unmodified. The function is called like `portable_sed "s|foo|bar|" file.env` -- `sed -i.bak "s|foo|bar|" file.env` works. However, it's also called as `portable_sed "s|AIMAESTRO_API=.*|...|" .env` from `act3_clone_and_build` at line 1060. The issue: `sed -i.bak "$@"` means `sed` gets `-i.bak` as its FIRST flag, then all the original arguments. But `sed -i.bak` is the in-place flag, and then `"$@"` expands to the pattern + file. So `sed` receives `sed -i.bak s|pattern|replacement| file` -- this means sed interprets `-i.bak` as in-place edit with `.bak` suffix AND then it sees the pattern and file. On GNU sed, `-i.bak` is not valid (it expects `-i .bak` or `-i.bak` depending on version). On BSD sed, `sed -i.bak expr file` is also ambiguous.

  Actually, upon careful re-tracing: `sed -i.bak "$@"` expands to `sed -i.bak "s|pattern|" "file"`. On macOS BSD sed, this works as: in-place edit creating `.bak` backup, apply expression to file. On GNU sed, `-i.bak` means in-place with `.bak` suffix. So the command itself is correct. BUT: the `&& rm -f "${file}.bak"` uses the last argument, which works correctly. Let me re-check -- actually this works because `"$@"` doesn't include `-i.bak` (that's hardcoded). So `sed -i.bak "s|pattern|" "file"` is the final expansion. This is actually fine.

  **RETRACTED** -- On closer analysis, this function works correctly. The `-i.bak` flag is added by the function, `"$@"` expands to the caller's original arguments (pattern + file). The last argument extraction for cleanup is also correct.


### [CC-P8-A4-001] Missing error handling when `agentRegistry.getAgent()` throws for invalid agentId
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-docs-service.ts:60-61
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `queryDocs` calls `agentRegistry.getAgent(agentId)` and immediately calls `.getDatabase()` on the result without checking if the agent exists. If `agentRegistry.getAgent()` throws (invalid/unknown ID), the error propagates as an unhandled exception with no 404 response. The same pattern exists at lines 176-177 in `indexDocs` and lines 227-228 in `clearDocs`.
- **Evidence:**
```typescript
// Line 60-61
const agent = await agentRegistry.getAgent(agentId)
const agentDb = await agent.getDatabase()
```
- **Fix:** Wrap in try/catch or add null check: `if (!agent) return { error: 'Agent not found', status: 404 }` before calling `getDatabase()`. This pattern is correctly used in `agents-subconscious-service.ts` at line 19 and `agents-skills-service.ts` at line 264, but missing in `agents-docs-service.ts`.

### [CC-P8-A4-002] Missing error handling when `agentRegistry.getAgent()` throws in `getConversationMessages`
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-service.ts:779-780
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-P8-A4-001. `getConversationMessages` calls `agentRegistry.getAgent(agentId)` then immediately calls `.getDatabase()` without null-checking. While this is within a try/catch, the error message would be cryptic (e.g., "Cannot read properties of null (reading 'getDatabase')") rather than a clean 404.
- **Evidence:**
```typescript
// Lines 779-780
const agent = await agentRegistry.getAgent(agentId)
const agentDb = await agent.getDatabase()
```
- **Fix:** Add `if (!agent) return { error: 'Agent not found', status: 404 }` between lines 779 and 780.

### [CC-P8-A4-003] Potential CozoScript injection via unvalidated `limit` in docs list query
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-docs-service.ts:121
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `listLimit` variable is interpolated directly into a CozoScript query string without escaping or type validation. While `limit` defaults to 10 and is typed as `number` in the interface, JavaScript allows passing strings that coerce. If a caller passes a string like `"10; :rm documents"`, it could be injected into the CozoScript.
- **Evidence:**
```typescript
// Line 121
query += ` :order -updated_at :limit ${listLimit}`
```
Where `listLimit` comes from `limit || 50` and `limit` is a function parameter defaulting to 10.
- **Fix:** Force integer coercion: `const safeLimit = Math.max(1, Math.min(1000, Math.floor(Number(listLimit) || 50)))` before interpolation, or use `escapeForCozo(String(listLimit))`.


### [CV-P8-001] Claim: "ToxicSkills scan" (commit 9e4e2cf, Step 11)
- **Source:** Commit message 9e4e2cf, Step 11: "Edge cases: ... ToxicSkills scan"
- **Severity:** MUST-FIX (misleading claim)
- **Verification:** NOT IMPLEMENTED
- **Expected:** Deployed skills are scanned for malicious content via ToxicSkills before deployment.
- **Actual:** `agents-config-deploy-service.ts:162-165` contains a TODO comment: `// TODO(Phase 2): ToxicSkills scan not yet implemented. Deployed skills are NOT scanned for malicious content.` The file `lib/toxic-skills.ts` does not exist. No scan is performed.
- **Evidence:** `/Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts:162-165` -- explicit TODO, no implementation.
- **Impact:** Skills deployed via governance config are NOT scanned for malicious content. The commit message implies this safeguard exists when it does not. This is a security gap if governance config deployment is used to push untrusted skills.

---


---

## SHOULD-FIX Issues


### [CC-P8-A8-001] task-registry.test.ts: makeTaskCounter not reset in beforeEach
- **File:** /Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts:107-111
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `makeTaskCounter` variable (line 86) starts at 1000 and is used by the `makeTask()` helper to generate unique `task-${makeTaskCounter}` IDs. However, the `beforeEach` block (lines 107-111) does NOT reset `makeTaskCounter` to its initial value. This means if tests in a describe block use `makeTask()`, the IDs will continue incrementing across tests. The tests currently pass because they don't assert on exact `makeTask` helper IDs (they use `createTask` which goes through the uuid mock, or pass explicit overrides). But this is asymmetric with the `makeDocCounter` reset in document-registry.test.ts (line 100) and the `makeTeamCounter` reset in team-registry.test.ts (line 91), creating inconsistency and a latent bug if future tests rely on deterministic makeTask IDs.
- **Evidence:**
  ```typescript
  // line 86
  let makeTaskCounter = 1000

  // lines 107-111
  beforeEach(() => {
    fsStore = {}
    uuidCounter = 0
    vi.clearAllMocks()
    // NOTE: makeTaskCounter is NOT reset here
  })
  ```
- **Fix:** Add `makeTaskCounter = 1000` to the `beforeEach` block, consistent with the pattern in document-registry.test.ts and team-registry.test.ts.

### [CC-P8-A8-002] use-governance-hook.test.ts: Testing standalone replicas instead of actual hook code
- **File:** /Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:26-35
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The test file acknowledges (MF-027, lines 26-35) that it tests standalone function replicas rather than the actual `useGovernance` hook. If the hook's `submitConfigRequest` or `resolveConfigRequest` implementation drifts from these replicas, the tests will still pass while the real code is broken. The replicas are manually maintained copies of the hook logic, which is inherently fragile. The test file correctly documents this limitation, but it means the "API contract" tests cannot catch regressions in the actual hook code (e.g., if the endpoint path, body structure, or error handling changes in the hook but not the replica).
- **Evidence:**
  ```typescript
  // lines 26-35
  // MF-027 KNOWN LIMITATION: These tests exercise standalone replicas of the
  // hook's submitConfigRequest and resolveConfigRequest callbacks, NOT the actual
  // useGovernance hook. This means:
  //   1. The refresh() side-effect after successful operations is NOT tested.
  //   2. React state updates (loading, error) are NOT tested.
  //   3. Memoization via useCallback is NOT tested.
  ```
- **Fix:** Either (a) add `@testing-library/react` to enable testing the real hook, or (b) add a code comment/CI check that flags when `hooks/useGovernance.ts` changes without updating this test file. The current approach is not wrong per se, but it's a coverage gap that should be tracked.

### [CC-P8-A8-003] document-registry.test.ts: makeDoc helper does not match TeamDocument type for optional fields
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-registry.test.ts:79-91
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `makeDoc` helper sets `pinned: false` and `tags: []` as defaults, but the `TeamDocument` type (types/document.ts) defines these as optional (`pinned?: boolean`, `tags?: string[]`). While this doesn't cause test failures, it means tests using `makeDoc()` always have `pinned` and `tags` defined, so they never exercise the code path where these fields are `undefined`. The `createDocument` tests at lines 198-206 do test the defaults from the real function, but the `makeDoc` helper used for `loadDocuments`/`saveDocuments` tests masks the undefined case.
- **Evidence:**
  ```typescript
  // tests/document-registry.test.ts lines 79-91
  function makeDoc(overrides: Partial<TeamDocument> = {}): TeamDocument {
    return {
      id: `doc-helper-${++makeDocCounter}`,
      teamId: TEAM_1,
      title: 'Default Doc',
      content: 'Some content',
      pinned: false,       // TeamDocument says pinned?: boolean (optional)
      tags: [],            // TeamDocument says tags?: string[] (optional)
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      ...overrides,
    }
  }
  ```
- **Fix:** Consider adding a test case for `loadDocuments`/`saveDocuments` that uses a document without `pinned` and `tags` fields (i.e., `makeDoc({ pinned: undefined, tags: undefined })`) to verify round-trip behavior when these optional fields are absent.

### [CC-P8-A8-004] fixtures.ts: makeTask missing assigneeAgentId default
- **File:** /Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts:114-126
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `makeTask` factory in fixtures.ts does not set `assigneeAgentId` as a default, but the `Task` type defines `assigneeAgentId?: string | null`. This means tasks created via `makeTask()` will have `assigneeAgentId: undefined` (not `null`), which differs from the real `createTask` function in task-registry.ts (line 123: `assigneeAgentId: data.assigneeAgentId ?? null`). If a service test uses `makeTask()` and the production code checks `task.assigneeAgentId === null`, it would behave differently than expected because `undefined !== null`.
- **Evidence:**
  ```typescript
  // fixtures.ts lines 114-126
  export function makeTask(overrides: Partial<Task> = {}): Task {
    const n = nextId()
    return {
      id: `task-${n}`,
      teamId: 'team-1',
      subject: `Test Task ${n}`,
      status: 'pending' as TaskStatus,
      blockedBy: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      // NOTE: assigneeAgentId is missing — will be undefined, not null
      ...overrides,
    }
  }
  ```
  Compare with task-registry.test.ts makeTask (line 95): `assigneeAgentId: null` (explicit default).
- **Fix:** Add `assigneeAgentId: null` to the fixtures.ts `makeTask` factory to match the production code's behavior.


### [CC-P8-A2-001] blockedBy array elements not validated as strings at route level
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts`:65-73
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The route validates that `body.blockedBy` is an array (`Array.isArray`) but does not validate that each element is a string. The value is then passed directly into `CreateTaskParams` which declares `blockedBy?: string[]`. A client could send `blockedBy: [123, null, {}]` and it would pass route-level validation. The service layer (`createTeamTask` at teams-service.ts:323) does perform per-element validation, so this is not a runtime bug -- but it violates defense-in-depth at the route level and creates a type-safety gap where `unknown[]` is assigned to `string[]`.
- **Evidence:**
  ```typescript
  // tasks/route.ts line 65-73
  if (body.blockedBy !== undefined && !Array.isArray(body.blockedBy)) {
    return NextResponse.json({ error: 'blockedBy must be an array of strings' }, { status: 400 })
  }
  // ...
  ...(body.blockedBy !== undefined && { blockedBy: body.blockedBy }),  // unknown[] -> string[]
  ```
- **Fix:** Add element validation: `if (body.blockedBy !== undefined && (!Array.isArray(body.blockedBy) || !body.blockedBy.every((v: unknown) => typeof v === 'string')))`. Same issue exists in `[taskId]/route.ts`:46-57.

### [CC-P8-A2-002] blockedBy array elements not validated as strings at task update route level
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts`:46-57
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P8-A2-001 but in the PUT task update route. The route validates `Array.isArray(body.blockedBy)` but not that elements are strings. The service layer (`updateTeamTask` at teams-service.ts:376) validates individual elements, so runtime safety is preserved. But the route-level type contract is violated.
- **Evidence:**
  ```typescript
  // [taskId]/route.ts line 46-57
  if (body.blockedBy !== undefined && !Array.isArray(body.blockedBy)) {
    return NextResponse.json({ error: 'blockedBy must be an array of strings' }, { status: 400 })
  }
  // ...
  ...(body.blockedBy !== undefined && { blockedBy: body.blockedBy }),  // unknown[] -> string[]
  ```
- **Fix:** Add element validation matching CC-P8-A2-001 fix.

### [CC-P8-A2-003] String(null) converts null assigneeAgentId to literal "null" string
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts`:72
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The route whitelist converts `body.assigneeAgentId` via `String()`. If a client sends `assigneeAgentId: null` (a valid JSON value to unassign), `String(null)` produces the literal string `"null"`, which would be stored as an assignee ID. The task-registry then tries to resolve this as an agent ID and fails silently (no agent with id `"null"` exists), resulting in an unresolved assignee rather than a clear null/unassigned state.
- **Evidence:**
  ```typescript
  // tasks/route.ts line 72
  ...(body.assigneeAgentId !== undefined && { assigneeAgentId: String(body.assigneeAgentId) }),
  ```
- **Fix:** Handle null explicitly: `...(body.assigneeAgentId !== undefined && { assigneeAgentId: body.assigneeAgentId === null ? null : String(body.assigneeAgentId) })`. Same applies to `[taskId]/route.ts` line 56. Also check that `CreateTaskParams` and `UpdateTaskParams` accept `string | null` for `assigneeAgentId`.

### [CC-P8-A2-004] String(null) converts null assigneeAgentId to literal "null" string in task update route
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts`:56
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P8-A2-003 but in the PUT task update route. `String(body.assigneeAgentId)` when `body.assigneeAgentId` is `null` produces `"null"` string.
- **Evidence:**
  ```typescript
  // [taskId]/route.ts line 56
  ...(body.assigneeAgentId !== undefined && { assigneeAgentId: String(body.assigneeAgentId) }),
  ```
- **Fix:** Same as CC-P8-A2-003.


### [CC-P8-A3-002] `result.data ?? { error: result.error }` pattern can swallow errors when data is empty object
- **File:** app/api/meetings/[id]/route.ts:17, :43, :65
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The meetings GET/PATCH/DELETE handlers use `result.data ?? { error: result.error }` to produce the response body. The `??` (nullish coalescing) operator only falls through when `result.data` is `null` or `undefined`. If the service ever returns `{ data: {}, error: 'something', status: 500 }`, the response will be `{}` with status 500 -- the error message is completely lost. This is inconsistent with the standard `if (result.error)` pattern used in most other routes.
- **Evidence:**
  ```typescript
  // Line 17 - GET handler
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })

  // Line 43 - PATCH handler
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })

  // Line 65 - DELETE handler
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  ```
- **Fix:** Use the standard `if (result.error)` guard pattern used by all other routes:
  ```typescript
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
  ```

### [CC-P8-A3-003] Same `result.data ?? { error: result.error }` pattern in meetings list/create routes
- **File:** app/api/meetings/route.ts:11, :29
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P8-A3-002 but in the meetings list (GET) and create (POST) routes. Errors can be swallowed if `result.data` is an empty object.
- **Evidence:**
  ```typescript
  // Line 11 - GET handler
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })

  // Line 29 - POST handler
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  ```
- **Fix:** Use the standard `if (result.error)` guard pattern.

### [CC-P8-A3-004] Same `result.data ?? { error: result.error }` pattern in organization POST
- **File:** app/api/organization/route.ts:27
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P8-A3-002. The organization POST handler uses `result.data ?? { error: result.error }` which can swallow errors when `result.data` is a non-nullish falsy or empty value.
- **Evidence:**
  ```typescript
  // Line 27
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  ```
- **Fix:** Use the standard `if (result.error)` guard pattern.

### [CC-P8-A3-005] Non-null assertion on `result.data!` in multiple AMP v1 routes
- **File:** app/api/v1/health/route.ts:19, app/api/v1/info/route.ts:19, app/api/v1/messages/pending/route.ts:28,:43,:63, app/api/v1/register/route.ts:28, app/api/v1/route/route.ts:37
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple AMP v1 routes use `result.data!` (non-null assertion) after checking `result.error`. While the `if (result.error)` guard makes this logically safe in most cases, the non-null assertion bypasses TypeScript's null checking. If the service contract ever changes to return `{ data: undefined, error: undefined, status: 200 }`, these assertions would pass `undefined` to `NextResponse.json()`, which would return `null` as the body.
- **Evidence:**
  ```typescript
  // app/api/v1/health/route.ts:19
  return NextResponse.json(result.data!, {
    status: result.status,
    headers: result.headers
  })

  // app/api/v1/messages/pending/route.ts:28
  return NextResponse.json(result.data!, {
    status: result.status,
    headers: result.headers
  })
  ```
- **Fix:** Use `result.data ?? {}` or add an explicit check: `if (!result.data) return NextResponse.json({ error: 'No data' }, { status: 500 })`.

### [CC-P8-A3-006] hosts/identity GET does not check for error in result
- **File:** app/api/hosts/identity/route.ts:13-14
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `GET /api/hosts/identity` handler calls `getHostIdentity()` and returns `result.data` without checking `result.error`. If the service returns an error (e.g., missing organization config), the response will have `result.data` which could be `undefined`, returned with whatever status code the service set.
- **Evidence:**
  ```typescript
  // Lines 13-14
  const result = getHostIdentity()
  return NextResponse.json(result.data, { status: result.status })
  ```
- **Fix:** Add the standard error guard:
  ```typescript
  const result = getHostIdentity()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
  ```

### [CC-P8-A3-007] Inconsistent auth enforcement: meetings GET is unauthenticated but PATCH/DELETE require auth
- **File:** app/api/meetings/[id]/route.ts:7-18 vs :22-44
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `GET /api/meetings/[id]` handler does not require authentication, while `PATCH` and `DELETE` do (via `authenticateAgent`). Similarly, `GET /api/meetings` is unauthenticated. This means any local process can enumerate all meetings and read their details (including participants, meeting names, etc.) without authentication. While this is Phase 1 localhost-only, the inconsistency suggests this was an oversight rather than a deliberate design choice, especially since the PATCH/DELETE handlers explicitly reference "SF-013: Authenticate agent for write operations."
- **Evidence:**
  ```typescript
  // GET - no auth (line 7-18)
  export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const { id } = await params
    if (!isValidUuid(id)) { ... }
    const result = getMeetingById(id)
    return NextResponse.json(...)
  }

  // PATCH - has auth (line 22-44)
  export async function PATCH(...) {
    ...
    const auth = authenticateAgent(...)
    if (auth.error) { ... }
    ...
  }
  ```
- **Fix:** If the intent was to protect meetings behind auth, add `authenticateAgent` to the GET handlers as well. If read access should be open, document the rationale.


### [CC-P8-A0-003] SSRF risk in health proxy — no URL validation before fetching
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/health/route.ts:21-25
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `/api/agents/health` POST endpoint accepts a `url` parameter and proxies a fetch to it. While it validates the URL is a non-empty string, it does not validate the URL scheme (could be `file://`), destination (could target internal services like `http://169.254.169.254/` for cloud metadata), or format (could be `javascript:` or other schemes). In Phase 1 (localhost-only), the risk is lower, but this is a classic SSRF vector.
- **Evidence:**
```typescript
// Line 19-25
const { url } = body
if (!url || typeof url !== 'string') {
  return NextResponse.json({ error: 'url is required and must be a string' }, { status: 400 })
}
const result = await proxyHealthCheck(url)  // No scheme/destination validation
```
- **Fix:** Validate that the URL starts with `http://` or `https://`, and optionally block well-known internal IP ranges (169.254.x.x, 10.x.x.x, 127.x.x.x, ::1) unless the intended use requires them. The actual fetch logic is in the service layer, but the route should reject obviously dangerous inputs.

### [CC-P8-A0-004] minScore=0 is silently treated as undefined in search route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/search/route.ts:37
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `minScore` parameter uses `parseFloat(...) || undefined`. Since `parseFloat('0')` returns `0`, which is falsy, `0 || undefined` evaluates to `undefined`. A user explicitly requesting `minScore=0` (meaning "no minimum threshold") gets `undefined` instead. Compare with the `long-term/route.ts` at line 41, which correctly handles this: `const mc = parseFloat(...); return isNaN(mc) ? 0 : Math.max(0, Math.min(1, mc))`.
- **Evidence:**
```typescript
// Line 37
minScore: searchParams.get('minScore') ? parseFloat(searchParams.get('minScore')!) || undefined : undefined,
```
- **Fix:** Use `const val = parseFloat(searchParams.get('minScore')!); return isNaN(val) ? undefined : val` to correctly pass `0` when specified.

### [CC-P8-A0-005] parseInt fallback `|| undefined` silently drops valid value 0 for limit/startTs/endTs in search route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/search/route.ts:36,40-41
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same falsy-zero pattern as CC-P8-A0-004 but for `limit`, `startTs`, and `endTs`. `parseInt('0', 10) || undefined` yields `undefined` when the caller explicitly passes `0`. For `limit=0`, this could mean "no results requested" is silently converted to `undefined` (likely a default). For `startTs=0` (Unix epoch), the timestamp is silently dropped. While `limit=0` is a degenerate case, `startTs=0` and `endTs=0` are valid Unix timestamps.
- **Evidence:**
```typescript
// Line 36
limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) || undefined : undefined,
// Line 40-41
startTs: searchParams.get('startTs') ? parseInt(searchParams.get('startTs')!, 10) || undefined : undefined,
endTs: searchParams.get('endTs') ? parseInt(searchParams.get('endTs')!, 10) || undefined : undefined,
```
- **Fix:** Use `const val = parseInt(str, 10); return isNaN(val) ? undefined : val` pattern to correctly handle `0` values.

### [CC-P8-A0-006] maxConversations=0 silently becomes undefined in consolidate route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/memory/consolidate/route.ts:53-54
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same falsy-zero pattern. `parseInt(..., 10) || undefined` treats `0` as falsy.
- **Evidence:**
```typescript
// Line 53-54
maxConversations: searchParams.get('maxConversations')
  ? parseInt(searchParams.get('maxConversations')!, 10) || undefined
  : undefined,
```
- **Fix:** Use the NaN-check pattern: `const val = parseInt(str, 10); return isNaN(val) ? undefined : val`.

### [CC-P8-A0-007] Unsafe type assertion for `box` query parameter in messages/[messageId]/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/messages/[messageId]/route.ts:24
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `box` parameter is cast to `'inbox' | 'sent'` without validation. A caller could pass `?box=drafts` or `?box=<script>`, and it would be passed through as a typed value to `getMessage()`. The service layer may or may not validate this further.
- **Evidence:**
```typescript
// Line 24
const box = (searchParams.get('box') || 'inbox') as 'inbox' | 'sent'
```
- **Fix:** Validate the value against the allowed set: `const boxParam = searchParams.get('box') || 'inbox'; if (boxParam !== 'inbox' && boxParam !== 'sent') return NextResponse.json({ error: 'Invalid box parameter' }, { status: 400 }); const box = boxParam as 'inbox' | 'sent';`

### [CC-P8-A0-008] Unsafe type assertion for `category` in long-term memory route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/memory/long-term/route.ts:38
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `category` parameter is cast to `MemoryCategory | null` without validation. Any arbitrary string gets passed to the service as if it were a valid `MemoryCategory`.
- **Evidence:**
```typescript
// Line 38
category: searchParams.get('category') as MemoryCategory | null,
```
- **Fix:** Validate against the known MemoryCategory enum values before casting.

### [CC-P8-A0-009] Unsafe type assertion for `tier` in long-term memory route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/memory/long-term/route.ts:42
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `tier` parameter is cast to `'warm' | 'long' | null` without validation.
- **Evidence:**
```typescript
// Line 42
tier: searchParams.get('tier') as 'warm' | 'long' | null,
```
- **Fix:** Validate against the allowed values before casting.

### [CC-P8-A0-010] Unsafe type assertion for `roleFilter` in search route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/search/route.ts:38
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `role` parameter is cast to `'user' | 'assistant' | 'system' | null` without validation.
- **Evidence:**
```typescript
// Line 38
roleFilter: searchParams.get('role') as 'user' | 'assistant' | 'system' | null,
```
- **Fix:** Validate against the allowed values before casting.

### [CC-P8-A0-011] Inconsistent response format — some routes wrap errors in `{ success: false, ... }`, others don't
- **File:** Multiple files
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** There is no consistent error response format across these 42 route files. Some routes return `{ error: '...' }`, while others return `{ success: false, error: '...' }`. This inconsistency makes it harder for clients to write reliable error handling. Examples:
  - `agents/[id]/route.ts` returns `{ error: '...' }` (no success field)
  - `agents/[id]/docs/route.ts` returns `{ success: false, error: '...' }` on errors
  - `agents/[id]/graph/code/route.ts` returns `{ success: false, error: '...' }`
  - `agents/[id]/memory/route.ts` returns `{ success: false, error: '...' }`
  - `agents/[id]/messages/route.ts` returns `{ error: '...' }` (no success field)
  - `agents/[id]/chat/route.ts` returns `{ success: false, error: '...' }`
  - `agents/[id]/session/route.ts` mixes both patterns (POST uses `{ error: '...' }`, PATCH uses `{ success: false, error: '...' }`)
- **Fix:** Standardize on one error response format across all agent API routes.


### [CC-P8-A6-001] ServiceResult<T> allows simultaneous `data` and `error` -- no discriminated union
- **File:** /Users/emanuelesabetta/ai-maestro/types/service.ts:10-15
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `ServiceResult<T>` has both `data` and `error` as optional fields. This means callers can construct an object with both `data` AND `error` set, or neither set. TypeScript will not catch misuse. A discriminated union pattern (`{ ok: true; data: T } | { ok: false; error: string }`) would make invalid states unrepresentable.
- **Evidence:**
  ```typescript
  export interface ServiceResult<T> {
    data?: T
    error?: string
    status: number
    headers?: Record<string, string>
  }
  ```
  Callers (e.g., `agents-memory-service.ts`) already use `ServiceResult<any>` extensively (tracked as NT-031). The loose typing means a caller can accidentally return `{ data: result, error: "something", status: 200 }` and TypeScript won't flag it.
- **Fix:** Consider refactoring to a discriminated union:
  ```typescript
  export type ServiceResult<T> =
    | { data: T; error?: undefined; status: number; headers?: Record<string, string> }
    | { data?: undefined; error: string; status: number; headers?: Record<string, string> }
  ```
  This is a cross-cutting change affecting 15+ service files, so it should be a dedicated refactor task.

### [CC-P8-A6-002] GovernanceConfig version field is literal `1` but JSON.parse returns `number`
- **File:** /Users/emanuelesabetta/ai-maestro/types/governance.ts:28
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `version: 1` literal type on `GovernanceConfig` is intended as a strict discriminant for future schema migrations. However, `JSON.parse()` (used in `lib/governance.ts:41`) returns `number`, not the literal `1`. If a file on disk has `"version": 2`, TypeScript won't catch it at compile time because the cast is `const parsed: GovernanceConfig = JSON.parse(data)`. The same issue exists in `TransfersFile` (line 63) and `GovernanceRequestsFile` (`governance-request.ts:118`), and `TeamsFile` (`team.ts:42`), and `MeetingsFile` (`team.ts:64`).
- **Evidence:**
  ```typescript
  // types/governance.ts:28
  version: 1   // Strict literal type

  // lib/governance.ts:41 -- no runtime check
  const parsed: GovernanceConfig = JSON.parse(data)
  return parsed
  ```
- **Fix:** Add a runtime version check after parsing:
  ```typescript
  const parsed = JSON.parse(data) as GovernanceConfig
  if (parsed.version !== 1) {
    throw new Error(`Unsupported governance config version: ${parsed.version}`)
  }
  ```
  This applies to all file-format interfaces with `version: 1`.


### [CC-P8-A7-001] localStorage read in useState initializer not wrapped in try/catch (footerTab)
- **File:** components/TerminalView.tsx:72
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `footerTab` useState initializer calls `localStorage.getItem(FOOTER_TAB_STORAGE_KEY)` without try/catch. In the same file, the `notesCollapsed` initializer at line 57 wraps the identical pattern in try/catch with comment "SF-018: Wrap localStorage access in try/catch -- private browsing or full storage throws." This inconsistency means `footerTab` initialization will throw in private browsing mode on some browsers (Safari), crashing the component.
- **Evidence:**
  ```typescript
  // Line 70-74 (NO try/catch):
  const [footerTab, setFooterTab] = useState<'notes' | 'prompt'>(() => {
    if (typeof window === 'undefined') return 'prompt'
    const stored = localStorage.getItem(FOOTER_TAB_STORAGE_KEY)  // Can throw!
    return stored === 'notes' ? 'notes' : 'prompt'
  })

  // Compare line 52-66 (HAS try/catch):
  const [notesCollapsed, setNotesCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    // ...
    try {
      const savedCollapsed = localStorage.getItem(collapsedKey)
      // ...
    } catch {
      // localStorage unavailable
    }
    return mobile
  })
  ```
- **Fix:** Wrap the `localStorage.getItem` call at line 72 in try/catch, returning `'prompt'` as default on failure.

### [CC-P8-A7-002] localStorage read in useState initializer not wrapped in try/catch (loggingEnabled)
- **File:** components/TerminalView.tsx:78-79
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-P8-A7-001. The `loggingEnabled` useState initializer calls `localStorage.getItem()` without try/catch, while the equivalent `notesCollapsed` initializer a few lines above uses try/catch.
- **Evidence:**
  ```typescript
  // Line 76-81 (NO try/catch):
  const [loggingEnabled, setLoggingEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    const loggingKey = `agent-logging-${session.agentId || session.id}`
    const savedLogging = localStorage.getItem(loggingKey)  // Can throw!
    return savedLogging !== null ? savedLogging === 'true' : true
  })
  ```
- **Fix:** Wrap in try/catch, returning `true` as default on failure.

### [CC-P8-A7-003] localStorage.setItem calls not wrapped in try/catch (collapsed state, logging state, footer tab)
- **File:** components/TerminalView.tsx:577, 582, 586
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Three useEffect hooks write to localStorage without try/catch: `agent-notes-collapsed-*` (line 577), `agent-logging-*` (line 582), and `terminal-footer-tab` (line 586). Other write effects in the same file at lines 543-548 and 551-557 DO use try/catch with "SF-003" comments. This inconsistency means these three writes will throw in private browsing or storage-full scenarios.
- **Evidence:**
  ```typescript
  // Lines 576-587 (NO try/catch):
  useEffect(() => {
    localStorage.setItem(`agent-notes-collapsed-${storageId}`, String(notesCollapsed))
  }, [notesCollapsed, storageId])

  useEffect(() => {
    localStorage.setItem(`agent-logging-${storageId}`, String(loggingEnabled))
  }, [loggingEnabled, storageId])

  useEffect(() => {
    localStorage.setItem(FOOTER_TAB_STORAGE_KEY, footerTab)
  }, [footerTab])

  // Compare lines 542-548 (HAS try/catch):
  useEffect(() => {
    try {
      localStorage.setItem(`agent-notes-${storageId}`, notes)
    } catch {
      // localStorage unavailable
    }
  }, [notes, storageId])
  ```
- **Fix:** Wrap each `localStorage.setItem` call in try/catch, matching the pattern at lines 543-548.

### [CC-P8-A7-004] N+1 fetch pattern for team task/document counts on teams page
- **File:** app/teams/page.tsx:37-51
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The teams page fetches all teams, then for each team performs two additional fetch calls (`/api/teams/${team.id}/tasks` and `/api/teams/${team.id}/documents`) to get counts. This is an N+1 query pattern that will cause 2N+1 HTTP requests for N teams. With many teams, this creates a waterfall of requests and visible UI lag. A comment on line 35-36 acknowledges this ("Phase 1: Client-side count via full fetch. Phase 2: Add /api/teams/[id]/stats endpoint"). This is a known limitation but flagged because it may cause user-visible performance issues with >5 teams.
- **Evidence:**
  ```typescript
  // Lines 37-51:
  const enriched = await Promise.all(
    teamsData.map(async (team) => {
      const [tasksRes, docsRes] = await Promise.all([
        fetch(`/api/teams/${team.id}/tasks`).catch(() => null),
        fetch(`/api/teams/${team.id}/documents`).catch(() => null),
      ])
      const tasksData = tasksRes?.ok ? await tasksRes.json() : { tasks: [] }
      const docsData = docsRes?.ok ? await docsRes.json() : { documents: [] }
      return { ...team, taskCount: (tasksData.tasks || []).length, docCount: (docsData.documents || []).length }
    })
  )
  ```
- **Fix:** The Promise.all parallelization mitigates latency somewhat; a proper fix is the Phase 2 stats endpoint mentioned in the comment. Acknowledged as known limitation.


### [CC-P8-A1-002] Rate limiter in manager route uses non-atomic check-then-record pattern
- **File:** `app/api/governance/manager/route.ts`:24-37
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The manager route uses the separate `checkRateLimit` + `recordFailure` pattern (lines 24 and 33), while the cross-host governance service has already migrated to the atomic `checkAndRecordAttempt` function (see cross-host-governance-service.ts:262). The non-atomic pattern has a TOCTOU window where concurrent requests could bypass the rate limit. The `checkAndRecordAttempt` function was specifically introduced (NT-006/MF-023) to eliminate this window.

  The password route at `app/api/governance/password/route.ts`:25-43 has the same issue.

  This is SHOULD-FIX (not MUST-FIX) because Phase 1 is localhost-only, so the risk of concurrent brute-force attempts is low.
- **Evidence:**
  ```typescript
  // manager/route.ts:24-37
  const rateCheck = checkRateLimit('governance-manager-auth')
  // ... gap where concurrent request could pass ...
  if (!(await verifyPassword(password))) {
    recordFailure('governance-manager-auth')
    // ...
  }
  resetRateLimit('governance-manager-auth')
  ```
- **Fix:** Replace `checkRateLimit` + `recordFailure` + `resetRateLimit` with `checkAndRecordAttempt` + `resetRateLimit`, matching the pattern used in `cross-host-governance-service.ts`.

### [CC-P8-A1-003] GET transfers endpoint does not validate `teamId` or `agentId` query parameters
- **File:** `app/api/governance/transfers/route.ts`:17-18
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The GET handler validates `status` (line 21) but does not validate `teamId` or `agentId` query parameters. While these are only used in `Array.filter()` string comparisons (so no injection risk), they should be validated as UUIDs for consistency with the POST handler (line 79) and all other governance API endpoints. Without validation, arbitrary strings are passed through to filter operations, which could cause confusion in logs or cache behavior downstream.

  Compare to `app/api/v1/governance/requests/route.ts`:152-158 which validates both `agentId` (UUID) and `hostId` (hostname regex).
- **Evidence:**
  ```typescript
  // transfers/route.ts:17-18
  const teamId = request.nextUrl.searchParams.get('teamId')
  const agentId = request.nextUrl.searchParams.get('agentId')
  // No UUID validation before use in filters
  ```
- **Fix:** Add `isValidUuid` checks for both `teamId` and `agentId` before using them as filters:
  ```typescript
  if (teamId && !isValidUuid(teamId)) {
    return NextResponse.json({ error: 'Invalid teamId format' }, { status: 400 })
  }
  if (agentId && !isValidUuid(agentId)) {
    return NextResponse.json({ error: 'Invalid agentId format' }, { status: 400 })
  }
  ```

### [CC-P8-A1-004] Governance-service.ts `isChange` computed after `setPassword` always reflects pre-call state correctly, but duplicate code exists between route and service
- **File:** `services/governance-service.ts`:138-139
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `governance-service.ts:setGovernancePassword`, the `isChange` variable is computed at line 139 from `config.passwordHash` which was read at line 118. However, `setPassword(password)` at line 138 has already updated the file on disk with a new hash. So `isChange` correctly reflects whether there was a previous password (because `config` is the old snapshot). This is not a bug per se.

  However, note that the same password-set logic exists in TWO places: `app/api/governance/password/route.ts` (the direct route) and `services/governance-service.ts:setGovernancePassword` (the service function). The direct route at `password/route.ts` computes `isChange` at line 46 (after `setPassword`), using the same pattern. Having duplicate business logic in both the route and the service is a maintenance risk -- if one is updated, the other may be missed.

  The trust routes (`trust/route.ts`, `trust/[hostId]/route.ts`) correctly delegate all logic to the service layer, so this inconsistency is limited to the password, manager, and reachable routes.
- **Evidence:**
  ```typescript
  // password/route.ts has its own password validation, rate limiting, and setPassword call
  // governance-service.ts:setGovernancePassword has the SAME logic
  // Both must be kept in sync manually
  ```
- **Fix:** Either remove the direct business logic from `password/route.ts` and delegate to `governance-service.ts:setGovernancePassword`, or remove the service function. The pattern used by trust routes (thin route -> service) is preferred.

### [CC-P8-A1-005] Missing `password` type validation in reject route's local path
- **File:** `app/api/v1/governance/requests/[id]/reject/route.ts`:76
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The local rejection path (line 76) checks that `body.rejectorAgentId` and `body.password` are truthy, but does not validate that `body.password` is a string before passing it to `rejectCrossHostRequest`. The `rejectCrossHostRequest` function signature expects `password: string`.

  Compare to the approve route at line 28, which also only checks truthiness. And compare to the requests route at line 93, which explicitly checks `typeof body.password !== 'string'`.

  If `body.password` were a number or boolean (truthy but not string), it would be passed to `verifyPassword()` which calls `bcrypt.compare()`. While bcrypt would likely throw or return false, the error message would be confusing.
- **Evidence:**
  ```typescript
  // reject/route.ts:76
  if (!body?.rejectorAgentId || !body?.password) {
    // Only checks truthiness, not type
  }
  // Compare to requests/route.ts:93
  if (!body.password || typeof body.password !== 'string') {
  ```
- **Fix:** Add type check: `if (!body?.rejectorAgentId || !body?.password || typeof body.password !== 'string')`

### [CC-P8-A1-006] Reachable agents cache in `reachable/route.ts` duplicates the one in `governance-service.ts`
- **File:** `app/api/governance/reachable/route.ts`:12-13
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The reachable route maintains its own in-memory cache (`const cache = new Map<...>()` at line 12) with TTL eviction at lines 57-63. The governance-service.ts also has its own independent `reachableCache` at line 152. Since both the route and the service have their own cache, if the route calls the service (or vice versa), cache hits would never occur in one of them, or both caches would hold duplicate data.

  In the current code, the route at `reachable/route.ts` does NOT delegate to `governance-service.ts:getReachableAgents` -- it implements the logic directly. This means:
  1. Two independent caches exist for the same data
  2. The headless router presumably calls `governance-service.ts:getReachableAgents` (the service function)
  3. The full-mode Next.js route uses its own cache

  While this is not a correctness bug (both produce the same result), the duplicate code and caches are a maintenance risk.
- **Evidence:**
  ```typescript
  // reachable/route.ts:12
  const cache = new Map<string, { ids: string[]; expiresAt: number }>()

  // governance-service.ts:152
  const reachableCache = new Map<string, { ids: string[]; expiresAt: number }>()
  ```
- **Fix:** Delegate the route to `governance-service.ts:getReachableAgents` and remove the duplicate cache from the route. This matches the pattern used by the trust routes.

### [CC-P8-A1-007] `reachable/route.ts` cache has size bound but `governance-service.ts` cache does not
- **File:** `services/governance-service.ts`:188-194
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The reachable route at `reachable/route.ts:61-63` enforces a max-size bound of 1000 entries (CC-P1-110). However, the equivalent cache in `governance-service.ts:188-194` only evicts expired entries and has no size bound. If many distinct agentIds are queried within the 5-second TTL window via the headless router (which uses the service), the governance-service cache could grow unbounded.
- **Evidence:**
  ```typescript
  // reachable/route.ts:61-63 (has size bound)
  if (cache.size > 1000) {
    cache.clear()
  }

  // governance-service.ts:190-194 (no size bound)
  const now = Date.now()
  for (const [key, entry] of reachableCache) {
    if (now >= entry.expiresAt) reachableCache.delete(key)
  }
  // No size check
  ```
- **Fix:** Add the same `if (reachableCache.size > 1000) { reachableCache.clear() }` guard to the governance-service.ts cache eviction, or (better) consolidate to one cache per CC-P8-A1-006.


### [CC-P8-A5-003] `validateApiKey` timing side-channel via early-exit find()
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:208-216
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** While `timingSafeEqual` is used for hash comparison, the `find()` loop exits early on the first match. An attacker can measure response time to determine how far into the array the matching key is. The comment on lines 205-207 acknowledges this as "Phase 1 acceptable" since API keys have 256-bit entropy, making timing attacks impractical. However, this undermines the purpose of using `timingSafeEqual` in the first place. If timing attacks are a concern (enough to use `timingSafeEqual`), they should also be a concern for the loop structure.
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
- **Fix:** Iterate all keys, collect the match, then return it. The comment already notes this for Phase 2.

### [CC-P8-A5-004] `acquireIndexSlot` has no timeout -- queued items wait forever
- **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:44-54
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `acquireIndexSlot` function uses a Promise that only resolves when the slot is released. If `releaseIndexSlot` is never called (e.g., the indexing operation throws before reaching the finally block, or an uncaught error occurs), the queued Promises will wait indefinitely, causing a silent resource leak. Unlike `file-lock.ts` which has a 30-second timeout (line 33), this throttle has no timeout mechanism. While line 697 has a `finally` block that calls `releaseSlot()`, an unexpected crash in the runtime or a Node.js microtask scheduling issue could leave the slot permanently held.
- **Evidence:**
```typescript
return new Promise((resolve) => {
    indexQueue.push({
      resolve: () => {
        activeIndexCount++
        resolve(() => releaseIndexSlot(agentId))
      },
      agentId,
      timestamp: Date.now()
    })
  })
```
- **Fix:** Add a timeout (e.g., 60 seconds) to the queued Promise, similar to the pattern in `file-lock.ts:48-75`.

### [CC-P8-A5-005] `getMessageStats` can increment undefined priority keys
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:926-928
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `getMessageStats` function initializes `byPriority` with only four keys (`low`, `normal`, `high`, `urgent`). At line 927, it does `stats.byPriority[m.priority]++`. If a message somehow has a priority value not in the predefined set (e.g., from a corrupted file or old format), this would create a new key with `NaN` (since `undefined + 1 === NaN`). The `convertAMPToMessage` function at line 276 validates priority, but old flat-format messages at line 398 use `ampMsg.priority || 'normal'` without validation, so malformed values could propagate.
- **Evidence:**
```typescript
messages.forEach(m => {
    stats.byPriority[m.priority]++
  })
```
- **Fix:** Guard with: `if (stats.byPriority[m.priority] !== undefined) stats.byPriority[m.priority]++`

### [CC-P8-A5-006] `loadApiKeys` returns cached mutable array -- external mutations corrupt cache
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:52-75
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `loadApiKeys()` returns `_apiKeysCache` directly (line 56 and 70). Callers like `validateApiKey` (line 202) and `revokeApiKey` (line 324) mutate the returned array or its elements in-place. While the comments at lines 219-222 acknowledge this for `validateApiKey` (last_used_at updates), the `revokeApiKey` function at line 337 sets `record.status = 'revoked'` on the cached element, then calls `saveApiKeys(keys)` which re-assigns `_apiKeysCache = keys`. If `saveApiKeys` fails (line 91-94 catches and throws), the in-memory cache is already mutated to 'revoked' but the disk is not updated, creating an inconsistency. Similarly, `revokeAllKeysForAgent` mutates multiple records before saving. If the save fails partway, some records are marked revoked in-memory but not on disk.
- **Evidence:**
```typescript
function loadApiKeys(): AMPApiKeyRecord[] {
  if (_apiKeysCache !== null && (now - _apiKeysCacheTimestamp) < API_KEYS_CACHE_TTL_MS) {
    return _apiKeysCache  // Direct reference returned
  }
  // ...
  _apiKeysCache = JSON.parse(data) as AMPApiKeyRecord[]
  return _apiKeysCache  // Direct reference returned
}
```
- **Fix:** Return a defensive copy (`return [..._apiKeysCache]`) or clone the array before mutation in write operations. Alternatively, mutate only after successful save.

### [CC-P8-A5-007] `createTeam` chiefOfStaffId may be set to `undefined` instead of omitted
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:279-281
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** When building `newTeam`, if `result.sanitized.chiefOfStaffId` is `undefined` (i.e., the key does not exist in the object), the ternary condition `result.sanitized.chiefOfStaffId !== undefined` is false, so it falls through to `data.chiefOfStaffId`. If `data.chiefOfStaffId` is also `undefined` (not provided by the caller), the `chiefOfStaffId` property on `newTeam` will be `undefined`. The `Team` type likely expects this to be `string | null | undefined`, and the codebase generally uses `null` for "no COS" (e.g., line 37 `team.chiefOfStaffId ?? null`). Passing `undefined` vs `null` could cause inconsistencies in downstream comparisons.
- **Evidence:**
```typescript
chiefOfStaffId: result.sanitized.chiefOfStaffId !== undefined
  ? (result.sanitized.chiefOfStaffId as string | undefined)
  : data.chiefOfStaffId,
```
- **Fix:** Default to `null` instead of allowing `undefined`: `chiefOfStaffId: result.sanitized.chiefOfStaffId !== undefined ? (result.sanitized.chiefOfStaffId as string | null) : data.chiefOfStaffId ?? null`


### [CC-P8-A9-002] `broadcastStatusUpdate` does not clean up dead WebSocket subscribers
- **File:** /Users/emanuelesabetta/ai-maestro/services/shared-state-bridge.mjs:43-47
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `broadcastStatusUpdate` function iterates over `statusSubscribers` and sends to clients whose `readyState === 1` (OPEN). However, it never removes dead/closed connections from the Set. While the `statusWss.on('connection')` handler in `server.mjs:616-624` removes clients on 'close' and 'error' events, if a WebSocket becomes unusable without firing those events (e.g., network drop without TCP FIN), the subscriber stays in the Set forever and `ws.send()` is silently skipped each broadcast cycle. Over time, this is a minor memory leak.
- **Evidence:**
  ```javascript
  // shared-state-bridge.mjs:43-47
  statusSubscribers.forEach(ws => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(message)
    }
    // No cleanup of non-OPEN sockets
  })
  ```
- **Fix:** Add cleanup of non-OPEN sockets in the broadcast loop:
  ```javascript
  statusSubscribers.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(message)
    } else if (ws.readyState > 1) { // CLOSING or CLOSED
      statusSubscribers.delete(ws)
    }
  })
  ```

### [CC-P8-A9-003] Companion WebSocket event listener leak when multiple companion clients connect to the same agent
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:659-698
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a companion WebSocket connects, a new `voice:speak` event listener is registered on the cerebellum at line 677. This listener is stored on `ws._companionCleanup` for cleanup. However, the cleanup logic at lines 738-757 only removes the listener when the `agentClients` Set becomes empty (size === 0). If multiple companion clients connect, each registers a new listener, but only the LAST one to disconnect triggers the cleanup block. The earlier clients' listeners are never removed because `agentClients.size > 0` when they disconnect.
- **Evidence:**
  ```javascript
  // line 677 - each client adds a listener
  cerebellum.on('voice:speak', listener)
  ws._companionCleanup = { listener, agentId }

  // line 738-757 - cleanup only when set is empty
  ws.on('close', () => {
    const agentClients = companionClients.get(agentId)
    if (agentClients) {
      agentClients.delete(ws)
      if (agentClients.size === 0) { // <-- only cleans up here
        // Only THIS ws's listener is removed
        if (ws._companionCleanup?.listener) {
          cerebellum.off('voice:speak', ws._companionCleanup.listener)
        }
      }
    }
  })
  ```
- **Fix:** Move the listener cleanup outside the `size === 0` check, so each client removes its own listener on close, and only the `companionClients.delete(agentId)` and `setCompanionConnected(false)` remain inside the empty-check:
  ```javascript
  ws.on('close', () => {
    // Always clean up THIS client's listener
    if (ws._companionCleanup?.listener) {
      import('./lib/agent.ts').then(({ agentRegistry }) => {
        const agent = agentRegistry.getExistingAgent(agentId)
        const cerebellum = agent?.getCerebellum()
        if (cerebellum) {
          cerebellum.off('voice:speak', ws._companionCleanup.listener)
        }
      }).catch(() => {})
    }
    const agentClients = companionClients.get(agentId)
    if (agentClients) {
      agentClients.delete(ws)
      if (agentClients.size === 0) {
        companionClients.delete(agentId)
        // Notify cerebellum no companion connected
        // ...
      }
    }
  })
  ```

### [CC-P8-A9-004] `ptyProcess.resume()` called even if process has already exited
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:1014-1016
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** In the PTY `onData` handler, `ptyProcess.pause()` is called at line 953 and `ptyProcess.resume()` is called at line 1015 in a `.finally()` callback. If the PTY process exits while the backpressure cycle is in progress (i.e., between `pause()` and `resume()`), calling `resume()` on a dead PTY will throw an error. Since this is inside a `.finally()`, the error will become an unhandled promise rejection caught by the global handler, but it creates noise in the crash log.
- **Evidence:**
  ```javascript
  // line 951-1016
  ptyProcess.onData((data) => {
    ptyProcess.pause()  // line 953
    // ... process data ...
    Promise.all(writePromises).finally(() => {
      ptyProcess.resume()  // line 1015 - PTY may be dead
    })
  })
  ```
- **Fix:** Wrap `resume()` in a try-catch or check if session is cleaned up:
  ```javascript
  Promise.all(writePromises).finally(() => {
    try { ptyProcess.resume() } catch { /* PTY already exited */ }
  })
  ```

### [CC-P8-A9-005] `update-aimaestro.sh` always fetches from `origin/main` even when on a different branch
- **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:149-151
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The update script hardcodes `git fetch origin main` and `git pull origin main` at lines 149 and 188. If the user is on a different branch (e.g., `feature/team-governance` as shown in git status), the script will pull `main` into whatever branch is currently checked out, potentially causing merge conflicts or unwanted commits on a feature branch.
- **Evidence:**
  ```bash
  # line 149
  git fetch origin main
  # line 151
  COMMITS_BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")
  # line 188
  git pull origin main
  ```
- **Fix:** Either: (a) check that the current branch is `main` before proceeding, or (b) switch to `main` before pulling, or (c) warn the user that they're not on `main` and ask for confirmation.

### [CC-P8-A9-006] `bump-version.sh` regex replacement in `update_file` may fail for patterns containing special sed characters
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:114-116
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `update_file` function creates a regex pattern by replacing `$CURRENT_VERSION` with `$CURRENT_VERSION_RE` (dot-escaped) inside the `$pattern` string using bash string substitution at line 115. However, `$replacement` is used directly in the sed substitution at line 116. If the replacement string happens to contain the sed delimiter `|` (unlikely for version strings but possible for other patterns), the sed command will break.

  More importantly, the `grep -qF "$pattern"` check at line 113 uses the *original* pattern (with literal dots) for a fixed-string grep, while the actual replacement uses the *regex* pattern. If the file contains a string that matches the fixed-string pattern but the regex-escaped version finds additional matches, there could be unexpected substitutions. In practice, for version strings, this is safe, but the logic is fragile.
- **Evidence:**
  ```bash
  # line 113-116
  if grep -qF "$pattern" "$file" 2>/dev/null; then
      local regex_pattern="${pattern//$CURRENT_VERSION/$CURRENT_VERSION_RE}"
      _sed_inplace "$file" "s|$regex_pattern|$replacement|g"
  ```
- **Fix:** This is a minor fragility. For robustness, use `sed` with escaped dots in the replacement as well, or validate that version strings can never contain `|`.

### [CC-P8-A9-007] `amp-inbox.sh` base64 decoding is not portable across macOS and Linux
- **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-inbox.sh:132
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The script uses `base64 -d` to decode (line 132). On macOS, the `base64` command uses `-D` for decoding (not `-d`). The `-d` flag is the GNU coreutils convention. If run on macOS without GNU coreutils installed, `base64 -d` will fail with an error.

  However, macOS 12+ ships with a `base64` that supports `-d` as an alias for `-D`, so this may work on modern macOS. But on older macOS versions or non-standard systems, this could fail.
- **Evidence:**
  ```bash
  # line 132
  msg=$(echo "$msg_b64" | base64 -d)
  ```
- **Fix:** Use a portable decode: `base64 -d 2>/dev/null || base64 -D` or check the platform. Alternatively, since jq's `@base64d` filter can decode, consider using that: `msg=$(echo "$msg_b64" | jq -Rr '@base64d')`.


### [CC-P8-A4-004] `parseConversationFile` leaks user-controlled file path in error message
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-service.ts:625
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** After the path traversal check at lines 612-620, if the file is not found, the error message includes the user-provided `conversationFile` value verbatim. This could leak internal filesystem path structure to callers.
- **Evidence:**
```typescript
// Line 625
error: `Conversation file not found: ${conversationFile}`,
```
- **Fix:** Return a generic error: `error: 'Conversation file not found'` without echoing the path.

### [CC-P8-A4-005] `controlPlayback` uses `parseInt(sessionId, 10)` on a non-numeric string field
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-playback-service.ts:98
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `sessionId` is compared against `session.index` using `parseInt(sessionId, 10)`. If `sessionId` is a UUID or non-numeric string, `parseInt` returns `NaN`, and the `some()` check will never match, always returning a 404 for valid agents with sessions. The field seems like it should be a session index (number) but the parameter name suggests it could be an ID (UUID).
- **Evidence:**
```typescript
// Line 98
if (sessionId && !agent.sessions?.some(s => s.index === parseInt(sessionId, 10))) {
    return { error: 'Session not found for this agent', status: 404 }
}
```
- **Fix:** Clarify whether `sessionId` is an index or ID. If index, validate `parseInt` doesn't produce `NaN`. If ID, compare against session IDs rather than indices.

### [CC-P8-A4-006] `agents-chat-service` reads entire JSONL file into memory without size limit
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-chat-service.ts:92
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `getConversationMessages` uses `fs.readFileSync` on the most recent .jsonl conversation file with no size limit. Conversation files can grow very large (50MB+), potentially causing OOM or blocking the event loop with synchronous I/O.
- **Evidence:**
```typescript
// Line 92
const fileContent = fs.readFileSync(currentConversation.path, 'utf-8')
```
- **Fix:** Use async `fs.promises.readFile` or streaming (e.g., `readline`) and enforce a maximum file size check before reading.

### [CC-P8-A4-007] `getConversationMessages` uses synchronous file I/O (`readdirSync`, `statSync`) in async function
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-chat-service.ts:68-75
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** While the function is declared `async`, it uses `fs.readdirSync` and `fs.statSync` to list and stat conversation files. These synchronous calls block the Node.js event loop, which can impact server responsiveness under load.
- **Evidence:**
```typescript
// Lines 68-75
const files = fs.readdirSync(conversationDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({
      name: f,
      path: path.join(conversationDir, f),
      mtime: fs.statSync(path.join(conversationDir, f)).mtime
    }))
```
- **Fix:** Replace with `fs.promises.readdir` and `fs.promises.stat`.

### [CC-P8-A4-008] `updateExistingMeeting` casts `status` to `any` without validation
- **File:** /Users/emanuelesabetta/ai-maestro/services/messages-service.ts:537
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The meeting status field is cast `as any` when passed to `updateMeeting`, bypassing type checking entirely. There is no validation that the status value is a valid meeting status.
- **Evidence:**
```typescript
// Line 537
status: updates.status as any,
```
- **Fix:** Validate the status against allowed values (e.g., `['active', 'ended', 'idle']`) before passing to `updateMeeting`, and remove the `as any` cast.

### [CC-P8-A4-009] `agents-docker-service` silently swallows agent registry errors
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-docker-service.ts:238-239
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** After successfully starting a Docker container, if agent registry creation fails, the error is logged but the function returns success. This means a Docker container is running but not tracked in the registry, creating an orphaned container that cannot be managed through the UI.
- **Evidence:**
```typescript
// Lines 238-239
} catch (err) {
    console.error('[Docker Service] Registry error:', err)
}
```
The function then returns `{ data: { success: true, ... }, status: 200 }` even though agentId may be undefined.
- **Fix:** Either return an error/warning status, or attempt to clean up the container on registry failure. At minimum, include a warning in the response data.

### [CC-P8-A4-010] `agents-docker-service` exposes `githubToken` as Docker environment variable in plain text
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-docker-service.ts:183-184
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The GitHub token is passed as a plain-text environment variable via `docker run -e GITHUB_TOKEN=...`. While `execFileAsync` prevents shell injection, the token will be visible in `docker inspect` output and `/proc/[pid]/environ` inside the container. Additionally, it would appear in AI Maestro logs if docker command logging is enabled.
- **Evidence:**
```typescript
// Lines 183-184
if (body.githubToken) {
    dockerArgs.push('-e', `GITHUB_TOKEN=${body.githubToken}`)
}
```
- **Fix:** Use Docker secrets or a `.env` file mounted into the container instead of command-line environment variables.


### [CV-P8-002] Claim: "169 new tests across 9 test files"
- **Source:** CHANGELOG.md line 19
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** All 9 test files exist and contain real tests that execute.
- **What's missing:** The actual count across the 9 CHANGELOG-listed files (governance-peers, governance-sync, host-keys, role-attestation, governance-request-registry, cross-host-governance, manager-trust, agent-config-governance, governance-endpoint-auth) is **199 tests**, not 169. Additionally, a 10th governance test file (`agent-config-governance-extended.test.ts` with 56 tests) exists but is not mentioned in the CHANGELOG. The total across all 10 governance test files is **255 tests**.
- **Evidence:**
  - governance-peers.test.ts: 20 tests
  - governance-sync.test.ts: 16 tests
  - host-keys.test.ts: 15 tests
  - role-attestation.test.ts: 27 tests
  - governance-request-registry.test.ts: 34 tests
  - cross-host-governance.test.ts: 40 tests
  - manager-trust.test.ts: 15 tests
  - agent-config-governance.test.ts: 17 tests
  - governance-endpoint-auth.test.ts: 15 tests
  - **Total for 9 listed files: 199** (not 169)
  - agent-config-governance-extended.test.ts: 56 additional tests (unlisted)
- **Note:** The count is higher than claimed, not lower. The CHANGELOG is stale from an earlier state. Not a functional issue.

### [CV-P8-003] Claim: "agentHostMap field on Team type for multi-host team membership tracking"
- **Source:** CHANGELOG.md line 16
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The `agentHostMap?: Record<string, string>` field is declared on the Team interface at `types/team.ts:34`.
- **What's missing:** The field has a `@planned` JSDoc annotation at `types/team.ts:30-33` stating "type stub only, not yet populated or consumed anywhere." No code reads from or writes to `agentHostMap`. It is a dead type declaration listed as a functional feature in the CHANGELOG.
- **Evidence:** `types/team.ts:30-34` -- `@planned Layer 3 -- type stub only, not yet populated or consumed anywhere.`
- **Note:** This has been flagged in passes P5, P6, and P7 with no correction. The CHANGELOG should either annotate this as "@planned" or remove it from the "Added" section.

### [CV-P8-004] Claim: "56 new tests" (commit 9e4e2cf, Step 10)
- **Source:** Commit message 9e4e2cf: "10. Test suite: 56 new tests (skills RBAC, deploy, cross-host, notifications)"
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The agent-config-governance.test.ts (17 tests) + agent-config-governance-extended.test.ts (56 tests) = 73 tests exist and cover skills RBAC, deploy, cross-host, and notifications as claimed.
- **What's missing:** The commit claims "56 new tests" but the actual count across the two config governance test files is 73. The extended test file alone has 56 tests, making the original file's 17 tests uncounted in the commit message. Minor discrepancy.
- **Evidence:** `tests/agent-config-governance.test.ts` (17 `it()` calls), `tests/agent-config-governance-extended.test.ts` (56 `it()` calls).

---


---

## Nits & Suggestions


### [CC-P8-A8-005] agent-auth.test.ts: Unused import from vitest
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-auth.test.ts:1
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** The test file imports `beforeEach` from vitest but the file does not contain a `beforeEach` block. This is a dead import. (Note: The file was read completely in the previous context; it only has `describe`/`it`/`expect`/`vi` usage, no `beforeEach` call.)
- **Evidence:** Line 1 imports `{ describe, it, expect, vi, beforeEach }` but no `beforeEach()` call exists in the 149-line file.
- **Fix:** Remove `beforeEach` from the import destructuring.

### [CC-P8-A8-006] transfer-registry.test.ts uses fake timers but other tests with timestamps do not
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:78-84
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The transfer-registry test correctly uses `vi.useFakeTimers()` and `vi.setSystemTime()` to produce deterministic timestamps, making assertions like `expect(transfer.createdAt).toBe('2025-06-01T12:00:00.000Z')` reliable. However, other test files that assert on timestamp presence but not exact values (e.g., task-registry.test.ts, document-registry.test.ts) only check `.toBeDefined()` or that `createdAt === updatedAt`. This inconsistency is not a bug, but using fake timers everywhere would make tests more deterministic and easier to debug.
- **Evidence:**
  ```typescript
  // transfer-registry.test.ts lines 78-84
  beforeEach(() => {
    fsStore = {}
    uuidCounter = 0
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'))
  })
  ```
- **Fix:** No action required. This is an observation about test style consistency. Using fake timers is better practice but the current approach works.

### [CC-P8-A8-007] governance-peers.test.ts: Mock pattern uses both named and default fs exports
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance-peers.test.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The governance-peers test mocks `fs` with both `default:` (for `import fs from 'fs'`) and named exports (for `import { readdirSync } from 'fs'`). While this works correctly because vitest supports both access patterns from a single mock, it's worth noting this dual-pattern approach for maintainability. The agent-registry.test.ts file (line 38-42) comments explicitly about this pattern (SF-032), but governance-peers.test.ts does not document the reason.
- **Evidence:** governance-peers.test.ts mocks `fs` with a `default:` block containing all methods, plus standalone named exports for `readdirSync` and `unlinkSync` at the top level of the mock object.
- **Fix:** Add a brief comment explaining the dual export pattern, consistent with agent-registry.test.ts's SF-032 comment.

### [CC-P8-A8-008] team-api.test.ts: vi.spyOn on dynamic import for createTeam verification
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:207-225
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test at line 205 uses `vi.spyOn(await import('@/lib/team-registry'), 'createTeam')` to verify that `managerId` is passed through. This works in vitest because `await import()` returns the same module instance as the route's static import when `vi.mock` is active. The test correctly calls `spy.mockRestore()` afterward. The approach is valid but somewhat fragile -- if vitest's module resolution behavior changes, this pattern could break silently.
- **Evidence:**
  ```typescript
  // lines 209-224
  const spy = vi.spyOn(await import('@/lib/team-registry'), 'createTeam')
  // ... test ...
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][1]).toBe('manager-uuid')
  spy.mockRestore()
  ```
- **Fix:** No action required; the pattern is correct and documented with inline comments. Consider extracting this pattern into a reusable test utility if used frequently.

### [CC-P8-A8-009] service-mocks.ts: createSharedStateMock includes unused fields
- **File:** /Users/emanuelesabetta/ai-maestro/tests/test-utils/service-mocks.ts:51-60
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `createSharedStateMock()` factory includes `statusSubscribers`, `terminalSessions`, and `companionClients` fields. Looking at the service test files that import this mock, only `sessionActivity` and `broadcastStatusUpdate` appear to be used by the services under test. The extra fields may be needed for type compatibility or future tests, but they add noise.
- **Evidence:**
  ```typescript
  export function createSharedStateMock() {
    const sessionActivity = new Map<string, number>()
    return {
      sessionActivity,
      broadcastStatusUpdate: vi.fn(),
      statusSubscribers: new Set(),      // Potentially unused
      terminalSessions: new Map(),        // Potentially unused
      companionClients: new Map(),        // Potentially unused
    }
  }
  ```
- **Fix:** Verify these fields are required for TypeScript type compatibility. If so, add a comment. If not, remove them.


### [CC-P8-A2-005] Unused requestingAgentId passed to notifyTeamAgents
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts`:22
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The notify route spreads `requestingAgentId: auth.agentId` into the params object, but `NotifyTeamParams` only defines `agentIds` and `teamName`. The extra property is silently ignored by the service function. This is not a bug (TypeScript allows extra properties in spread), but it is misleading -- it suggests the service uses the agent identity when it does not.
- **Evidence:**
  ```typescript
  // notify/route.ts line 22
  const result = await notifyTeamAgents({ ...body, requestingAgentId: auth.agentId })
  // NotifyTeamParams = { agentIds: string[]; teamName: string } -- no requestingAgentId
  ```
- **Fix:** Either remove the spread of `requestingAgentId`, or add `requestingAgentId?: string` to `NotifyTeamParams` and use it for audit logging.

### [CC-P8-A2-006] Deprecated recordFailure alias used instead of recordAttempt
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts`:5,42
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The chief-of-staff route imports and uses `recordFailure` from `@/lib/rate-limit`, which is a deprecated alias for `recordAttempt` (see rate-limit.ts:73-74). While functional, it should use the non-deprecated name.
- **Evidence:**
  ```typescript
  // chief-of-staff/route.ts line 5
  import { checkRateLimit, recordFailure, resetRateLimit } from '@/lib/rate-limit'
  // line 42
  recordFailure(rateLimitKey)
  // rate-limit.ts line 73-74
  /** @deprecated Use recordAttempt instead. Alias kept for backward compatibility. */
  export const recordFailure = recordAttempt
  ```
- **Fix:** Change import and usage from `recordFailure` to `recordAttempt`.

### [CC-P8-A2-007] Missing `export const dynamic = 'force-dynamic'` on chief-of-staff, notify routes
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts`, `/Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts`
- **Severity:** NIT
- **Category:** logic
- **Confidence:** POSSIBLE
- **Description:** These routes only export POST handlers, so Next.js treats them as dynamic by default (POST is not statically optimizable). Therefore `force-dynamic` is not strictly required. However, for consistency with the project convention (both `teams/route.ts` and `teams/names/route.ts` explicitly set it), it may be worth adding. The `[id]` segment routes are also correctly dynamic by virtue of their dynamic path segment.
- **Fix:** Consider adding `export const dynamic = 'force-dynamic'` for consistency, or document the convention that only GET-only routes without dynamic segments need it.


### [CC-P8-A3-008] `path` import unused in sessions/create except for `path.isAbsolute`
- **File:** app/api/sessions/create/route.ts:2
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `path` module is imported only for `path.isAbsolute()`. This is fine but could use a more targeted import pattern. Alternatively, an absolute path check can be done with `body.workingDirectory.startsWith('/')` on macOS/Linux (the target platform per CLAUDE.md).
- **Evidence:**
  ```typescript
  import path from 'path'
  // ...
  if (body.workingDirectory && !path.isAbsolute(body.workingDirectory)) {
  ```
- **Fix:** No change needed -- `path.isAbsolute` is more correct cross-platform. Just a minor note.

### [CC-P8-A3-009] Unused import type `NextRequest` in several routes
- **File:** app/api/v1/health/route.ts:10, app/api/v1/info/route.ts:10
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `NextRequest` type is imported but the `_request` parameter could just use `Request` since no Next.js-specific features (like `nextUrl.searchParams`) are used. The function signature uses `_request: NextRequest` but never accesses it.
- **Evidence:**
  ```typescript
  // app/api/v1/health/route.ts
  import { NextRequest, NextResponse } from 'next/server'
  // ...
  export async function GET(_request: NextRequest): Promise<...> {
  ```
- **Fix:** Can simplify to use `Request` or remove the parameter entirely (Next.js allows omitting it). Very minor.

### [CC-P8-A3-010] Unused `AMPError` type import in messages/meeting route
- **File:** app/api/v1/health/route.ts:12
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** POSSIBLE
- **Description:** The `AMPHealthResponse` type is imported and used for the return type annotation. This is fine. However, in `app/api/v1/info/route.ts:12`, the `AMPInfoResponse` type is similarly imported. Both are used correctly. This is not an issue -- marking as clean.

### [CC-P8-A3-011] Deprecation logs on every request in sessions/[id]/* routes
- **File:** app/api/sessions/[id]/command/route.ts:10-12, app/api/sessions/[id]/rename/route.ts:12-14, app/api/sessions/[id]/route.ts:12-14
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `logDeprecation()` function is called on every request to these deprecated endpoints. In a high-traffic scenario, this floods the server logs. A more standard approach is to log once on module load or use a rate-limited warning.
- **Evidence:**
  ```typescript
  function logDeprecation() {
    console.warn('[DEPRECATED] /api/sessions/[id]/command - Use /api/agents/[id]/session (PATCH) instead')
  }
  // Called on every POST and GET
  export async function POST(...) {
    logDeprecation()
    ...
  }
  ```
- **Fix:** Use a module-level `let warned = false` guard or use `console.warn` only once. Minor issue since these are deprecated anyway.


### [CC-P8-A0-012] `body` typed as `any` in docs and graph/code POST handlers
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/docs/route.ts:61, /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/graph/code/route.ts:51
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `body` variable is explicitly typed as `any` in these handlers. While the actual validation happens in the service layer, using `any` suppresses type checking at the route level.
- **Evidence:**
```typescript
// docs/route.ts:61
let body: any = {}
// graph/code/route.ts:51
let body: any = {}
```
- **Fix:** Consider using `Record<string, unknown>` or a specific request type interface.

### [CC-P8-A0-013] Unused `request` parameter not prefixed with underscore in several handlers
- **File:** Multiple files
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** A few handlers accept `request` parameter but only use it for `params` extraction. Some correctly prefix unused params with `_request` while others use the param for `searchParams`. This is minor but inconsistent. For instance, `database/route.ts` POST handler accepts `request: NextRequest` (line 31) but never uses it (the body is passed via the service call with no JSON parsing needed — `initializeDatabase(agentId)` takes only the ID).
- **Evidence:**
```typescript
// database/route.ts:30-31
export async function POST(
  request: NextRequest,  // Never used — should be _request
  { params }: { params: Promise<{ id: string }> }
)
```
- **Fix:** Prefix unused parameters with `_` for clarity.

### [CC-P8-A0-014] `import` route uses `result.status || 500` fallback suggesting service may return status 0 or undefined
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/import/route.ts:34
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Only the `import/route.ts` uses `result.status || 500` fallback for error responses. All other routes trust `result.status` to always be set. Either the import service has a weaker contract, or this is an unnecessary defensive check. Minor inconsistency.
- **Evidence:**
```typescript
// Line 34
return NextResponse.json({ error: result.error }, { status: result.status || 500 })
```
- **Fix:** Standardize — either all routes should use the fallback, or the service contract should guarantee a status is always present.


### [CC-P8-A6-003] parseSessionName does not guard against empty string input
- **File:** /Users/emanuelesabetta/ai-maestro/types/agent.ts:93-99
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `parseSessionName("")` returns `{ agentName: "", index: 0 }`. While callers in practice always receive non-empty tmux session names, the function's JSDoc doesn't document this precondition and there's no assertion.
- **Evidence:**
  ```typescript
  export function parseSessionName(tmuxName: string): { agentName: string; index: number } {
    const match = tmuxName.match(/^(.+)_(\d+)$/)
    if (match) {
      return { agentName: match[1], index: parseInt(match[2], 10) }
    }
    return { agentName: tmuxName, index: 0 }
  }
  ```
- **Fix:** Either add a runtime guard (`if (!tmuxName) throw new Error(...)`) or document the precondition in the JSDoc. Low risk since tmux never produces empty session names, but defensive coding would be preferable.

### [CC-P8-A6-004] RESTORE_MEETING action passes redundant `teamId` alongside `meeting` which already has `teamId`
- **File:** /Users/emanuelesabetta/ai-maestro/types/team.ts:112
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `RESTORE_MEETING` action includes both `meeting: Meeting` (which has `teamId: string | null`) and a separate `teamId: string | null`. The consumer in `MeetingRoom.tsx:229` passes `meeting.teamId` for both, so they're always identical. The redundant field is unused in the reducer handler (line 165-181) -- it only reads from `action.meeting`.
- **Evidence:**
  ```typescript
  // types/team.ts:112
  | { type: 'RESTORE_MEETING'; meeting: Meeting; teamId: string | null }

  // MeetingRoom.tsx:229
  dispatch({ type: 'RESTORE_MEETING', meeting, teamId: meeting.teamId })

  // MeetingRoom.tsx:165-181 -- only uses action.meeting, never action.teamId
  case 'RESTORE_MEETING': {
    const agentIds = Array.isArray(action.meeting.agentIds) ? action.meeting.agentIds : []
    // ... no reference to action.teamId
  }
  ```
- **Fix:** Remove the redundant `teamId` from the action type, or if it's needed for a case where `teamId` should differ from `meeting.teamId`, document why.

### [CC-P8-A6-005] Deprecated `type` field on Host interface lacks runtime migration or validation
- **File:** /Users/emanuelesabetta/ai-maestro/types/host.ts:55-58
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The `type` field is marked DEPRECATED with a comment saying "will be removed". No runtime migration strips this field from loaded configs, meaning old hosts.json files continue carrying it. This is cosmetic but could confuse consumers who see `type: 'local'` and assume it's meaningful.
- **Evidence:**
  ```typescript
  // DEPRECATED: type field is no longer meaningful
  // In a mesh network, all hosts are equal. Use isSelf for self-detection.
  // Kept for backward compatibility during migration - will be removed.
  type?: 'local' | 'remote'
  ```
- **Fix:** Either schedule removal (track as a task) or add migration code in the host loader to strip the field and write back.

### [CC-P8-A6-006] `EmailTool` has deprecated single-address fields without a migration plan
- **File:** /Users/emanuelesabetta/ai-maestro/types/agent.ts:350-354
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `EmailTool.address` and `EmailTool.provider` are marked `@deprecated` with a comment "Remove after all agents migrated to addresses[]" but no migration code or removal timeline is specified. Similar to CC-P8-A6-005.
- **Evidence:**
  ```typescript
  // DEPRECATED: Legacy single-address fields (kept for migration)
  // Remove after all agents migrated to addresses[]
  address?: string              // @deprecated Use addresses[] instead
  provider?: 'local' | 'smtp'   // @deprecated Gateway concern, not identity
  ```
- **Fix:** Track removal as a backlog task with criteria for when migration is complete.


### [CC-P8-A7-005] useWebSocket reconnection attempts may not reset on `hostId` or `socketPath` change
- **File:** hooks/useWebSocket.ts:203-214
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The auto-connect useEffect (line 203) has dependency array `[sessionId, autoConnect]` and an eslint-disable for exhaustive deps. However, `hostId` and `socketPath` also affect the WebSocket URL (line 59-69 in `getWebSocketUrl`). If `hostId` or `socketPath` changes while keeping the same `sessionId`, the hook will not reconnect to the new URL. The `connect` function (which is a dependency of the useEffect but suppressed) does depend on `getWebSocketUrl` which depends on `hostId`/`socketPath`, so those changes would propagate IF `connect` were in the deps. This is suppressed by the eslint-disable. In practice, `hostId` and `socketPath` are unlikely to change without `sessionId` also changing, so this is a NIT.
- **Evidence:**
  ```typescript
  // Lines 203-214:
  useEffect(() => {
    if (autoConnect) {
      connect()
    } else {
      disconnect()
    }
    return () => { disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, autoConnect])  // Missing: hostId, socketPath (indirectly via connect -> getWebSocketUrl)
  ```
- **Fix:** Consider adding `hostId` and `socketPath` to the dependency array, or add a comment explaining why they are intentionally excluded.

### [CC-P8-A7-006] SkillPicker passes no-op `onSkillsFound` to RepoScanner
- **File:** components/plugin-builder/SkillPicker.tsx:255
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The RepoScanner component is passed `onSkillsFound={() => {}}` as a no-op callback. The RepoScanner component calls `onSkillsFound(data.skills, url.trim(), ref)` on successful scan (RepoScanner.tsx:55). The SkillPicker does not use the skills found notification at all. While this is harmless (it just means the parent ignores the notification), it creates unused code paths and could confuse future maintainers about whether the callback serves a purpose.
- **Evidence:**
  ```typescript
  // SkillPicker.tsx line 254-258:
  <RepoScanner
    onSkillsFound={() => {}}  // No-op: result is ignored
    onAddSkill={onAddSkill}
    selectedSkillKeys={selectedKeys}
  />
  ```
- **Fix:** Consider making `onSkillsFound` optional in `RepoScannerProps` and skipping the call if not provided, or document why the no-op is intentional.

### [CC-P8-A7-007] AgentSkillEditor `canApprove` hardcoded to `true`
- **File:** components/marketplace/AgentSkillEditor.tsx:82
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `canApprove` variable is hardcoded to `true` with a comment "Phase 1: localhost single-user". In Phase 2, this should be wired to actual governance role checks. Flagged as a reminder since it bypasses authorization checks.
- **Evidence:**
  ```typescript
  // Line 82:
  const canApprove = true
  ```
- **Fix:** Phase 2 TODO: Wire to `agentRole === 'manager' || agentRole === 'chief-of-staff'` as the comment suggests.


### [CC-P8-A1-008] `password/route.ts` does not validate `password` type is string before checking `.length`
- **File:** `app/api/governance/password/route.ts`:13
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** Line 13 checks `password.length < 6` but only after `!password` (truthiness). If `body.password` were a number like `123456` (truthy, has no `.length`), calling `.length` would return `undefined`, and `undefined < 6` is `false` in JavaScript, so the validation would pass. The `typeof password !== 'string'` check comes after the `||` short-circuit, so if `password` is truthy, the type check is evaluated. Actually, re-reading: `!password || typeof password !== 'string' || password.length < 6` -- this is correct because `||` is left-to-right and `typeof password !== 'string'` is checked before `.length`. This is a false alarm on re-analysis. Marking as NIT for the combined condition being hard to read.
- **Evidence:**
  ```typescript
  if (!password || typeof password !== 'string' || password.length < 6) {
  ```
- **Fix:** No code change needed. The logic is correct. Consider splitting into two checks for readability if desired.

### [CC-P8-A1-009] Missing `dynamic = 'force-dynamic'` on some routes that read from disk
- **File:** `app/api/governance/manager/route.ts`, `app/api/governance/password/route.ts`
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** Several routes that read governance state from disk (manager, password) do not export `dynamic = 'force-dynamic'`. Other routes in the same domain do (reachable/route.ts:10, governance/route.ts:5, trust/route.ts:14, requests/route.ts:18). Without this, Next.js may cache the response at build time or between requests.

  For POST routes this is less of a concern (Next.js does not cache POST responses by default), but for consistency and to prevent issues if GET handlers are added later, the export should be present.
- **Evidence:**
  ```typescript
  // governance/route.ts has it:
  export const dynamic = 'force-dynamic'

  // manager/route.ts and password/route.ts do NOT have it
  // (Both are POST-only, so this is low risk)
  ```
- **Fix:** Add `export const dynamic = 'force-dynamic'` to manager/route.ts and password/route.ts for consistency. Low priority since they are POST-only.

### [CC-P8-A1-010] Inconsistent error response for agentId in governance-service vs direct route
- **File:** `services/governance-service.ts`:95 vs `app/api/governance/manager/route.ts`:53
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The manager route (line 53) says `Agent ${agentId} not found` (no quotes around agentId). The governance-service (line 95) says `Agent '${agentId}' not found` (with quotes). The error messages for the same operation differ depending on which code path is taken (direct route vs headless/service).
- **Evidence:**
  ```typescript
  // manager/route.ts:53
  return NextResponse.json({ error: `Agent ${agentId} not found` }, { status: 404 })

  // governance-service.ts:95
  return { error: `Agent '${agentId}' not found`, status: 404 }
  ```
- **Fix:** Unify the error message format. The route already has a comment `// NT-014: Do not quote agentId in error message`. Choose one convention and apply consistently.

### [CC-P8-A1-011] Sync route POST does not validate `body.type` against known sync message types
- **File:** `app/api/v1/governance/sync/route.ts`:24
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** The sync POST handler validates `body.fromHostId` and `body.type` are present (line 24) but does not validate that `body.type` is a known governance sync message type. The `handleGovernanceSyncMessage` function presumably handles unknown types gracefully, but the route could reject obviously invalid types early.
- **Evidence:**
  ```typescript
  if (!body || !body.fromHostId || !body.type) {
    return NextResponse.json(
      { error: 'Missing required fields: fromHostId, type' },
      { status: 400 }
    )
  }
  ```
- **Fix:** Add validation that `body.type` is one of the known sync message types (e.g., 'full-sync', 'manager-changed', etc.) before passing to the handler.


### [CC-P8-A5-008] `fromVerified` double nullish coalescing is misleading dead code
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:267
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** As analyzed in CC-P8-A5-002 (moved from MUST-FIX), the trailing `?? false` is unreachable because `Boolean()` always returns a boolean. No runtime impact but confusing to readers.
- **Evidence:**
```typescript
fromVerified: ampMsg.fromVerified ?? Boolean(envelope.signature || ampMsg.signature) ?? false,
```
- **Fix:** Remove `?? false`.

### [CC-P8-A5-009] Notification service typing into non-shell programs is a known design limitation
- **File:** /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:52-59
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** As analyzed in CC-P8-A5-001 (moved from MUST-FIX), `sendTmuxNotification` sends an echo command as literal keystrokes. If the target pane is running vim, a REPL, or other non-shell program, the keystrokes are injected as input. The code comments acknowledge this. The escaping for single quotes is correctly implemented for the shell case.
- **Evidence:**
```typescript
await runtime.sendKeys(target, `echo '${safeMessage}'`, { literal: true, enter: true })
```
- **Fix:** Consider using tmux `display-message` instead of `send-keys` for non-intrusive notifications, or check if the pane is at a shell prompt before sending.

### [CC-P8-A5-010] `_agentCacheSweepInterval` is exported only for test cleanup, clutters module API
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:496-516
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The interval handle is stored in `_agentCacheSweepInterval` (prefixed with `_` suggesting private) but `cleanupAgentCacheSweep()` is exported for test cleanup. The comment at line 511 notes "TODO: Wire into shutdown handler or remove export." This is a minor API surface issue.
- **Evidence:**
```typescript
const _agentCacheSweepInterval = setInterval(() => { ... }, 5 * 60 * 1000)
_agentCacheSweepInterval.unref()
export function cleanupAgentCacheSweep(): void { ... }
```
- **Fix:** Wire into the application's graceful shutdown handler, or keep as-is for test use.

### [CC-P8-A5-011] `loadGovernance` returns defaults on ANY read error, not just corruption
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:43-59
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `readFileSync` fails with a non-SyntaxError (e.g., EACCES permission denied), the function logs the error but returns `DEFAULT_GOVERNANCE_CONFIG`. This silently masks configuration when file permissions are wrong. The pattern is consistent across governance.ts, governance-request-registry.ts, manager-trust.ts, and transfer-registry.ts. Acceptable for Phase 1 localhost deployment but could mask real issues.
- **Evidence:**
```typescript
} else {
  console.error('[governance] Failed to read governance config:', error)
}
return { ...DEFAULT_GOVERNANCE_CONFIG }
```
- **Fix:** Phase 2: distinguish ENOENT (expected) from other errors (unexpected) and potentially throw on unexpected errors.

### [CC-P8-A5-012] Missing file in domain: `lib/tmux-discovery.ts` does not exist
- **File:** lib/tmux-discovery.ts
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The file `lib/tmux-discovery.ts` was listed in the FILES domain but does not exist on disk. The tmux discovery functionality lives in `lib/agent-runtime.ts` (TmuxRuntime class). This is likely a stale reference in the audit file list rather than a missing implementation.
- **Fix:** Remove from domain file list if the file was renamed/removed.


### [CC-P8-A9-008] `server.mjs` imports `.ts` files directly, relying on runtime transpilation
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:583,651,684,856,872,1045,1224
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Multiple `import()` calls in `server.mjs` import `.ts` files directly (e.g., `import('./lib/amp-websocket.ts')`, `import('./lib/agent.ts')`, `import('./lib/agent-runtime.ts')`). This relies on the runtime environment supporting TypeScript transpilation (via `tsx` or Next.js's module resolution). While this works in the current setup (headless mode uses `tsx`, full mode uses Next.js), it creates a hidden dependency on the runtime transpiler. If `server.mjs` is ever run with plain `node`, these imports will fail.
- **Evidence:**
  ```javascript
  // line 583
  const { handleAMPWebSocket } = await import('./lib/amp-websocket.ts')
  // line 651
  const { agentRegistry } = await import('./lib/agent.ts')
  ```
- **Fix:** This is intentional per the codebase architecture but worth documenting as a constraint.

### [CC-P8-A9-009] `start-with-ssh.sh` uses `exec tsx server.mjs` but tsx is not checked for existence
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh:30
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The script calls `exec tsx server.mjs` at line 30 without checking whether `tsx` is available on PATH. If `tsx` is not installed, the `exec` will fail with a cryptic "command not found" error after the SSH setup has already been completed.
- **Evidence:**
  ```bash
  # line 30
  exec tsx server.mjs
  ```
- **Fix:** Add a check before exec: `command -v tsx &>/dev/null || { echo "[AI Maestro] Error: tsx not found"; exit 1; }`

### [CC-P8-A9-010] `install-messaging.sh` uses `local` keyword inside `while` loop body within `distribute_shared_to_per_agent`
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:273-274
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** In the function `distribute_shared_to_per_agent`, the `local` keyword is used inside a `while` loop for `recipient` and `sender` (lines 273-276). In bash, `local` inside a loop works but is technically re-declaring the variable on each iteration. This is harmless but unconventional -- typically `local` declarations are placed at the top of the function.
- **Evidence:**
  ```bash
  while IFS= read -r msg_file; do
      local recipient            # Re-declares on each iteration
      recipient=$(_extract_recipient "$msg_file")
      local sender
      sender=$(_extract_sender "$msg_file")
  ```
- **Fix:** Move `local recipient sender msg_basename` declarations to the top of the function, before the while loop.

### [CC-P8-A9-011] `server.mjs` status WebSocket initial fetch uses loopback HTTP
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:600
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a new status WebSocket subscriber connects, the server fetches initial data via `fetch(\`http://localhost:${port}/api/sessions/activity\`)` (line 600). This creates a loopback HTTP request from the server to itself, which adds unnecessary overhead and can fail if the server is still starting up. It would be more efficient to call the handler function directly.
- **Evidence:**
  ```javascript
  // line 600
  const response = await fetch(`http://localhost:${port}/api/sessions/activity`)
  ```
- **Fix:** Consider importing and calling the activity handler directly instead of making a loopback HTTP request. The fallback at lines 606-613 already shows the alternative approach of computing activity from the in-memory `sessionActivity` map.

### [CC-P8-A9-012] `remote-install.sh` cleanup trap removes partial installation in non-interactive mode without user confirmation
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:166-169
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In non-interactive mode, the cleanup trap at lines 166-169 automatically removes the install directory on failure. While the path is validated to be under `$HOME`, this is a destructive action that happens silently. The safety guard is good (checking `package.json` absence and `$HOME` prefix), but the deletion of a directory could still destroy user files if they had pre-existing content in `~/ai-maestro` that isn't an AI Maestro installation.
- **Evidence:**
  ```bash
  if [ "$NON_INTERACTIVE" = true ]; then
      rm -rf "$INSTALL_DIR"
      maestro_info "Removed partial installation at $INSTALL_DIR"
  ```
- **Fix:** The existing guards (`! -f "$INSTALL_DIR/package.json"` and `$HOME/*` check) are adequate. This is just a documentation note.


### [CC-P8-A4-011] Extensive use of `ServiceResult<any>` throughout service files
- **File:** Multiple files (agents-docs-service.ts, agents-memory-service.ts, agents-messaging-service.ts, config-service.ts, messages-service.ts, teams-service.ts, etc.)
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Many service functions use `ServiceResult<any>` instead of specific return types. This reduces TypeScript's ability to catch type errors at compile time. The comment `NT-031` in agents-memory-service.ts line 26 acknowledges this as a known TODO.
- **Evidence:**
```typescript
// agents-memory-service.ts:26
// NT-031: TODO: Replace ServiceResult<any> with specific result types across service files.
```
- **Fix:** Define specific result interfaces and replace `ServiceResult<any>` with `ServiceResult<SpecificType>`.

### [CC-P8-A4-012] `agents-directory-service.ts` returns status 500 with `data` field instead of `error` field on lookup failure
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-directory-service.ts:82
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `lookupAgentByDirectoryName` returns `{ data: { found: false }, status: 500 }` on error, but other service methods use `{ error: '...', status: 500 }`. This inconsistency means the caller cannot reliably detect errors by checking for the `error` field.
- **Evidence:**
```typescript
// Line 82
return { data: { found: false }, status: 500 }
```
- **Fix:** Return `{ error: 'Failed to lookup agent', status: 500 }` for consistency.

### [CC-P8-A4-013] `config-service.ts` `parseConversationFile` logs every line parse error at ERROR level
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-service.ts:730-731
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Malformed JSONL lines are common (e.g., truncated writes). Logging each one at `console.error` level creates excessive noise. Additionally, line 731 logs up to 200 characters of the problematic line, which could contain sensitive conversation content.
- **Evidence:**
```typescript
// Lines 730-731
console.error('[Parse Conversation] Failed to parse line:', parseErr)
console.error('[Parse Conversation] Problematic line:', line.substring(0, 200))
```
- **Fix:** Use `console.warn` or count errors and log a summary. Remove the raw line content from the log to avoid leaking conversation data.

### [CC-P8-A4-014] `shared-state-bridge.mjs` duplicates logic from `shared-state.ts`
- **File:** /Users/emanuelesabetta/ai-maestro/services/shared-state-bridge.mjs:1-48
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The bridge file duplicates the `broadcastStatusUpdate` function and `globalThis._sharedState` initialization from `shared-state.ts`. This is intentional (ESM bridge for server.mjs), but any divergence between the two implementations could cause subtle bugs. The bridge version lacks the TypeScript `satisfies StatusUpdate` check.
- **Evidence:** Lines 33-47 of `shared-state-bridge.mjs` vs. lines 84-104 of `shared-state.ts` -- functionally identical but without type safety.
- **Fix:** Add a comment documenting the intentional duplication and noting that both files must be kept in sync. Consider generating the bridge from the TypeScript source.

### [CC-P8-A4-015] `agents-playback-service.ts` uses `isNaN(value)` instead of `Number.isNaN(value)`
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-playback-service.ts:94
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The global `isNaN` function coerces its argument to a number first, which means `isNaN(undefined)` returns `true`. In this context, it works because the preceding check `value === undefined` handles the undefined case, but `Number.isNaN` is the more precise idiom.
- **Evidence:**
```typescript
// Line 94
if ((action === 'seek' || action === 'setSpeed') && (value === undefined || isNaN(value))) {
```
- **Fix:** Use `Number.isNaN(value)` for clarity, or `typeof value !== 'number'` which is more defensive.


### [CV-P8-005] Config/deploy endpoint missing from headless router
- **Severity:** RESOLVED (was a concern but I confirmed it IS present)
- **Files affected:** `services/headless-router.ts:861`
- **Expected:** `/api/agents/:id/config/deploy` endpoint in headless router
- **Found:** Present at line 861, pattern `POST /api/agents/([^/]+)/config/deploy`. Consistent with Next.js route at `app/api/agents/[id]/config/deploy/route.ts`.

---


---

## Source Reports

- `epcp-correctness-P8-R57d244f7-1ad1f5f8-7387-4abe-bd35-5d00bc62c768.md`
- `epcp-correctness-P8-R57d244f7-42ea92e3-72c8-4821-ab5a-df63082fc80e.md`
- `epcp-correctness-P8-R57d244f7-9513d8b0-d2b4-47c2-9e31-2beefa11332d.md`
- `epcp-correctness-P8-R57d244f7-9bd2a50f-4ceb-4c1a-992a-7583172ec38b.md`
- `epcp-correctness-P8-R57d244f7-9c2ed7e0-b82e-44d6-9cee-21a6d97d0674.md`
- `epcp-correctness-P8-R57d244f7-b0a5930d-3352-451e-9080-0b76d606b248.md`
- `epcp-correctness-P8-R57d244f7-ebe28e6f-732e-4d47-b907-89c3ca1cd350.md`
- `epcp-correctness-P8-R57d244f7-f20eed6a-74cf-4a9e-acf9-bb9c6d3a1563.md`
- `epcp-correctness-P8-R57d244f7-f50ce148-d927-4c71-aa56-cde8ad13838f.md`
- `epcp-correctness-P8-R57d244f7-fc06e1a7-1f77-4b7f-a576-a6db2502c49b.md`
- `epcp-claims-P8-R57d244f7-a4e5e1b4-1f08-4c99-9291-ef7fe92886d0.md`
- `epcp-review-P8-R57d244f7-6cbeaa05-e4b5-4ec1-9947-1c1a3ab342fc.md`

