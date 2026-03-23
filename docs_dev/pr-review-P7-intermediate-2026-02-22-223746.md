# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-22-223746
**Pass:** 7
**Reports merged:** 15
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 3 |
| **SHOULD-FIX** | 13 |
| **NIT** | 7 |
| **Total** | 29 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


No MUST-FIX issues found.


### [CC-P7-A0-001] Missing `await` on async `updateAgentById` in PATCH /metadata route (headless-router.ts)
- **File:** services/headless-router.ts:945
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `updateAgentById` is declared `async` (agents-core-service.ts:645) and returns `Promise<ServiceResult<...>>`. At line 945 in the headless-router's PATCH `/api/agents/[id]/metadata` handler, the call is made without `await`. This means `result` is a Promise object, not the resolved value. Consequently, `result.error` is always `undefined` (Promise objects don't have an `.error` property), so the handler always falls through to the success branch and sends `{ metadata: undefined }` because `result.data` is also undefined on the Promise.
- **Evidence:**
  ```typescript
  // Line 943-951
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (req, res, params) => {
    const metadata = await readJsonBody(req)
    const result = updateAgentById(params.id, { metadata })  // <-- MISSING await
    if (result.error) {
      sendJson(res, result.status, { error: result.error })
    } else {
      sendJson(res, 200, { metadata: result.data?.agent?.metadata })
    }
  }},
  ```
- **Fix:** Change line 945 to `const result = await updateAgentById(params.id, { metadata })`

### [CC-P7-A0-002] Missing `await` on async `updateAgentById` in DELETE /metadata route (headless-router.ts)
- **File:** services/headless-router.ts:953
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P7-A0-001 but in the DELETE `/api/agents/[id]/metadata` handler. The `updateAgentById` call at line 953 is missing `await`. The result is a Promise, so the handler always reaches the success branch and sends `{ success: true }` even if the underlying update failed.
- **Evidence:**
  ```typescript
  // Line 952-959
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const result = updateAgentById(params.id, { metadata: {} })  // <-- MISSING await
    if (result.error) {
      sendJson(res, result.status, { error: result.error })
    } else {
      sendJson(res, 200, { success: true })
    }
  }},
  ```
- **Fix:** Change line 953 to `const result = await updateAgentById(params.id, { metadata: {} })`


No MUST-FIX issues found.


No must-fix issues found.


(none)


(none found)


### [CC-P7-A4-001] CozoDB injection via incorrect manual escaping in agents-graph-service.ts
- **File:** services/agents-graph-service.ts:1033
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `queryCodeGraph` function's `focus-node` action uses manual SQL-style escaping (`nodeId.replace(/'/g, "''")`) instead of the `escapeForCozo()` utility that is imported at line 22 and used correctly ~30 other times in the same file. CozoDB uses backslash escaping (`\'`), not SQL-style double-single-quote (`''`) escaping. The manual escaping also fails to handle backslashes, newlines, carriage returns, and tabs -- all of which `escapeForCozo` handles.

  The vulnerable pattern appears at **4 locations**:
  - Line 1033: `const escapedNodeId = nodeId.replace(/'/g, "''")`
  - Line 1089: `const escapedId = id.replace(/'/g, "''")`
  - Line 1100: `const escapedId = id.replace(/'/g, "''")`
  - Line 1111: `const escapedId = id.replace(/'/g, "''")`

  These escaped values are then interpolated into CozoDB queries with manual quote wrapping (e.g., `'${escapedNodeId}'`), creating an injection vector. For example, a `nodeId` containing a backslash followed by a single quote (`\'`) would:
  1. Pass through the manual escaping unchanged (it only doubles lone `'`)
  2. In CozoDB, the `\` would escape the closing quote, breaking out of the string literal

  The file even contains a comment at line 66-67 acknowledging this was supposed to be fixed:
  ```
  // MF-009: Local escapeString removed -- use escapeForCozo from @/lib/cozo-utils
  // escapeForCozo uses backslash escaping (correct for CozoDB) and wraps in quotes
  ```

  But the `focus-node` action (lines 1013-1127) was missed during that fix.

- **Evidence:**
  ```typescript
  // Line 1033 -- WRONG: SQL-style escaping, manual quote wrapping
  const escapedNodeId = nodeId.replace(/'/g, "''")
  // ...
  const callsOut = await agentDb.run(`?[caller_fn, callee_fn] := *calls{caller_fn, callee_fn}, caller_fn = '${escapedNodeId}'`)

  // Line 383 -- CORRECT: uses escapeForCozo (same file, different action)
  callee_name = ${escapeForCozo(name)},
  ```

  The `escapeForCozo` utility (from `lib/cozo-utils.ts`):
  ```typescript
  export function escapeForCozo(s: string | undefined | null): string {
    if (!s) return 'null'
    return "'" + s
      .replace(/\\/g, '\\\\')   // Escape backslashes first
      .replace(/'/g, "\\'")     // Then escape single quotes
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      + "'"
  }
  ```

- **Fix:** Replace all 4 occurrences of manual escaping with `escapeForCozo()`:
  - Line 1033: Replace `const escapedNodeId = nodeId.replace(/'/g, "''")` and all subsequent `'${escapedNodeId}'` with `${escapeForCozo(nodeId)}`
  - Line 1089: Replace `const escapedId = id.replace(/'/g, "''")` and `'${escapedId}'` with `${escapeForCozo(id)}`
  - Line 1100: Same pattern
  - Line 1111: Same pattern

  Note: `escapeForCozo` returns the value already wrapped in quotes, so the surrounding `'...'` must also be removed from the query strings.


No must-fix issues found.


No MUST-FIX issues found.


No MUST-FIX issues found.


No MUST-FIX issues found.


---

## SHOULD-FIX Issues


### [CC-P7-A8-001] Shared uuidCounter between makeDoc helper and uuid mock creates fragile coupling
- **File:** tests/document-registry.test.ts:33-38, 78-90
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `makeDoc()` helper function (line 80) uses `++uuidCounter` to generate document IDs, but this same `uuidCounter` variable is also used by the `uuid.v4()` mock (line 36). Both increment the same counter. When `createDocument()` is called (which internally calls `v4()` to generate document IDs), it advances the shared counter, and subsequent `makeDoc()` calls get IDs that are non-sequential relative to their own calls. This shared mutation makes it impossible to predict the exact ID from `makeDoc()` if `createDocument()` was called in between. Currently no test asserts on `makeDoc`-generated IDs after calling `createDocument`, so this doesn't cause failures -- but it makes the test infrastructure brittle and confusing for anyone adding new tests.
- **Evidence:**
  ```typescript
  // line 33-38: uuid mock uses uuidCounter
  let uuidCounter = 0
  vi.mock('uuid', () => ({
    v4: vi.fn(() => {
      uuidCounter++
      return `uuid-${uuidCounter}`
    }),
  }))

  // line 78-80: makeDoc ALSO uses uuidCounter
  function makeDoc(overrides: Partial<TeamDocument> = {}): TeamDocument {
    return {
      id: `doc-${++uuidCounter}`,
  ```
- **Fix:** Give `makeDoc` its own separate counter (e.g. `let makeDocCounter = 0`), or use a fixed prefix that does not collide with `uuid-N` IDs generated by the mock.


### [CC-P7-A0-003] `getMetrics` (sync) called without `await` at GET /metrics in headless-router -- correct but inconsistent with PATCH
- **File:** services/headless-router.ts:734
- **Severity:** NIT (not a bug)
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `getMetrics` is declared as synchronous (`export function getMetrics(agentId: string): ServiceResult<any>` at agents-memory-service.ts:1101), so the call at line 734 without `await` is correct. Meanwhile `updateMetrics` is async and correctly uses `await` at line 738 after the diff fix. No action needed -- noting for completeness.


### [CC-P7-A3-001] Outer catch in plugin-builder routes misattributes service errors as "Invalid request body" (400)
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/build/route.ts`:13-31
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `POST` handler wraps both `request.json()` and `buildPlugin(body)` in a single try/catch. If `buildPlugin` throws an unexpected error (e.g., filesystem failure not caught by its internal try/catch), the outer catch returns `{ error: 'Invalid request body' }` with status 400, which is misleading -- the request body was valid, the service failed. The same pattern exists in `scan-repo/route.ts` (lines 11-46) and `push/route.ts` (lines 12-70), though those at least log the actual error via `console.error`.
- **Evidence:**
  ```typescript
  // build/route.ts lines 13-31
  export async function POST(request: NextRequest) {
    try {
      const body = await request.json()        // JSON parse error
      const result = await buildPlugin(body)    // Service error
      // ...
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },      // Both error types get this message
        { status: 400 }
      )
    }
  }
  ```
- **Fix:** Separate the JSON parsing try/catch from the service call, similar to how other routes in this codebase do it:
  ```typescript
  export async function POST(request: NextRequest) {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const result = await buildPlugin(body)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  }
  ```
  Apply the same fix to `scan-repo/route.ts` and `push/route.ts`.


No should-fix issues found.


### [CC-P7-A9-001] PTY process may be accessed after cleanup in WebSocket message handler
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:1082-1097
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** When a client sends a `resize` or raw input message, the handler accesses `sessionState.ptyProcess` without checking if the session has been cleaned up. If the PTY process exited between when the message was queued and when it's processed, `sessionState.ptyProcess.resize()` or `.write()` will throw. While the outer try-catch on line 1098 prevents a crash, the error message (`Error processing message`) is misleading and doesn't indicate the real cause (PTY already dead).
- **Evidence:**
```javascript
// Line 1082-1097 - no guard on sessionState.cleanedUp or sessionState.ptyProcess existence
if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
    sessionState.ptyProcess.resize(parsed.cols, parsed.rows)
    return
}
// ...
sessionState.ptyProcess.write(message)
```
- **Fix:** Add a guard before accessing `ptyProcess`:
```javascript
if (sessionState.cleanedUp || !sessionState.ptyProcess) {
    return  // Session already cleaned up, drop the message
}
```


### [CC-P7-A5-001] saveTeams atomic write uses shared tmp filename without process.pid
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:247
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `saveTeams()` uses `TEAMS_FILE + '.tmp'` as a fixed temp file path, unlike every other registry in the codebase which uses `+ '.tmp.' + process.pid` (e.g., task-registry.ts:55, governance-request-registry.ts:76, amp-auth.ts:85, governance-peers.ts:66). If two concurrent callers invoke `saveTeams()` simultaneously (even within the same process via event loop interleaving between the `writeFileSync` and `renameSync` calls), the second caller's `writeFileSync` could overwrite the first caller's temp file before the first caller's `renameSync` completes, potentially leading to data loss. This is a real risk because `saveTeams` is called inside `withLock` in `createTeam`/`updateTeam`/`deleteTeam`, but it is also called WITHOUT a lock in the `loadTeams` migration path (line 233).
- **Evidence:**
  ```typescript
  // team-registry.ts:247-249
  const tmpFile = TEAMS_FILE + '.tmp'
  fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
  fs.renameSync(tmpFile, TEAMS_FILE)
  ```
  Compare with the pattern used in every other registry:
  ```typescript
  // task-registry.ts:55
  const tmpPath = `${filePath}.tmp.${process.pid}`
  ```
- **Fix:** Change `TEAMS_FILE + '.tmp'` to `` TEAMS_FILE + `.tmp.${process.pid}` `` to match the pattern used throughout the rest of the codebase.

### [CC-P7-A5-002] transfer-registry.ts atomic write uses shared tmp filename without process.pid
- **File:** /Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts:60
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `saveTransfers()` uses `` `${TRANSFERS_FILE}.tmp` `` (no process.pid suffix), same issue as CC-P7-A5-001. Although `saveTransfers` is always called inside `withLock('transfers')`, the fixed temp filename is inconsistent with the codebase pattern and could cause issues if the code is ever refactored to allow concurrent callers.
- **Evidence:**
  ```typescript
  // transfer-registry.ts:60
  const tmpFile = `${TRANSFERS_FILE}.tmp`
  ```
- **Fix:** Change to `` `${TRANSFERS_FILE}.tmp.${process.pid}` `` for consistency and future safety.


(none)


### [CC-P7-A0-001] `parseFloat(...) || undefined` silently discards explicit zero values for search weights
- **File:** app/api/agents/[id]/search/route.ts:43-44
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a user passes `?bm25Weight=0` or `?semanticWeight=0`, the expression `parseFloat("0") || undefined` evaluates to `undefined` because `0` is falsy. This causes the service layer to use default values (`0.4` and `0.6` respectively) instead of the explicitly-requested `0`. A weight of `0` is a valid configuration meaning "disable this search method entirely", so silently overriding it is incorrect behavior.
- **Evidence:**
  ```typescript
  // search/route.ts lines 43-44
  bm25Weight: searchParams.get('bm25Weight') ? parseFloat(searchParams.get('bm25Weight')!) : undefined,
  semanticWeight: searchParams.get('semanticWeight') ? parseFloat(searchParams.get('semanticWeight')!) : undefined,
  ```
  Wait -- re-reading the actual code:
  ```typescript
  bm25Weight: searchParams.get('bm25Weight') ? parseFloat(searchParams.get('bm25Weight')!) : undefined,
  semanticWeight: searchParams.get('semanticWeight') ? parseFloat(searchParams.get('semanticWeight')!) : undefined,
  ```
  Actually the current code on lines 43-44 does NOT use `|| undefined` after parseFloat. It uses a ternary: if the param exists (truthy string), parseFloat it directly; otherwise undefined. So `parseFloat("0")` correctly returns `0`.

  **RETRACTED** -- Upon re-reading, the current code correctly handles the zero case. The ternary guard `searchParams.get('bm25Weight') ? parseFloat(...) : undefined` only checks whether the query param is present (non-null, non-empty string), not whether the parsed value is truthy. `"0"` is a truthy string, so `parseFloat("0")` returns `0` which is passed through correctly.

  *(This finding is withdrawn after verification.)*


### [CC-P7-A7-001] AgentProfileTab (zoom) handleSave does not reset saving state on non-OK response
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:169-176
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When the save API returns a non-OK response, the component does not call `setSaving(false)`. It only sets it to false after a 500ms delay on the success path (`setTimeout(() => setSaving(false), 500)`). If the response is not OK and not a network error (caught by the catch block), `saving` remains `true` forever, leaving the Save button in a stuck spinner state.
- **Evidence:**
```typescript
// lines 169-177
if (response.ok) {
  setHasChanges(false)
  setTimeout(() => setSaving(false), 500)
}
// NO else branch to setSaving(false) on non-OK response
```
- **Fix:** Add an `else` branch that calls `setSaving(false)` on non-OK responses, matching the pattern already used in the sibling `AgentProfile.tsx` (see lines 222-229 with CC-P1-702 fix). Example:
```typescript
if (response.ok) {
  setHasChanges(false)
  setTimeout(() => setSaving(false), 500)
} else {
  const errData = await response.json().catch(() => ({ error: 'Save failed' }))
  console.error('Failed to save agent:', errData.error || response.statusText)
  setSaving(false)
}
```
- **Note:** The sibling component `AgentProfile.tsx` already has this fix (annotated CC-P1-702), but `AgentProfileTab.tsx` was not patched identically.

### [CC-P7-A7-002] AgentProfileTab (zoom) repositories list uses array index as React key
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:610-612
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The repositories list in AgentProfileTab uses `key={idx}` (array index) as the React key for repository items. This can cause incorrect rendering when repositories are added, removed, or reordered. The sibling `AgentProfile.tsx` already uses a stable key (`repo.remoteUrl || repo.localPath || idx` with annotation SF-019), but this file was not updated.
- **Evidence:**
```tsx
// line 610-612 in AgentProfileTab.tsx
{repositories.map((repo, idx) => (
  <div
    key={idx}   // unstable key
```
vs AgentProfile.tsx line 793:
```tsx
key={repo.remoteUrl || repo.localPath || idx}  // stable key (SF-019)
```
- **Fix:** Change `key={idx}` to `key={repo.remoteUrl || repo.localPath || idx}` to match the pattern in AgentProfile.tsx (SF-019).

### [CC-P7-A7-003] TerminalView localStorage reads not wrapped in try/catch
- **File:** /Users/emanuelesabetta/ai-maestro/components/TerminalView.tsx:507-526
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Multiple `localStorage.getItem` calls in TerminalView's useEffect hooks (lines 507-526 for notes and prompt loading) are not wrapped in try/catch, while the `notesCollapsed` initializer at line 57 IS wrapped (annotated SF-018). In private browsing or when localStorage is full, these unprotected reads will throw and crash the component during mount. The `localStorage.setItem` calls at lines 531-565 are also unprotected.
- **Evidence:**
```typescript
// line 507-516 — unprotected read
useEffect(() => {
  const key = `agent-notes-${storageId}`
  const savedNotes = localStorage.getItem(key)  // can throw
  ...
}, [])

// line 518-527 — unprotected read
useEffect(() => {
  const key = `agent-prompt-${storageId}`
  const savedPrompt = localStorage.getItem(key)  // can throw
  ...
}, [])

// line 530-532 — unprotected write
useEffect(() => {
  localStorage.setItem(`agent-notes-${storageId}`, notes)  // can throw
}, [notes, storageId])
```
vs the protected pattern at line 57-64:
```typescript
try {
  const savedCollapsed = localStorage.getItem(collapsedKey)
  ...
} catch {
  // localStorage unavailable (private browsing, storage full, etc.)
}
```
- **Fix:** Wrap all `localStorage.getItem` and `localStorage.setItem` calls in try/catch blocks, consistent with the SF-018 pattern already used in the same file.


No SHOULD-FIX issues found.


No SHOULD-FIX issues found.


### [CV-P7-001] Claim: "169 new tests across 9 test files"
- **Source:** CHANGELOG.md line 19, v0.26.0 section
- **Severity:** SHOULD-FIX (documentation inaccuracy, not a code bug)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** All 9 test files exist exactly as named: governance-peers, governance-sync, host-keys, role-attestation, governance-request-registry, cross-host-governance, manager-trust, agent-config-governance, governance-endpoint-auth. All files contain real tests with real assertions.
- **What's missing:** The actual test count across these 9 files is **196** (20+16+15+27+34+40+15+16+13), not 169. Additionally there is a 10th file `agent-config-governance-extended.test.ts` with 56 more tests that is not mentioned. The 169 figure was likely correct at an earlier commit but subsequent fix passes added tests without updating the CHANGELOG count.
- **Evidence:**
  - tests/governance-peers.test.ts: 20 `it()` calls
  - tests/governance-sync.test.ts: 16 `it()` calls
  - tests/host-keys.test.ts: 15 `it()` calls
  - tests/role-attestation.test.ts: 27 `it()` calls
  - tests/governance-request-registry.test.ts: 34 `it()` calls
  - tests/cross-host-governance.test.ts: 40 `it()` calls
  - tests/manager-trust.test.ts: 15 `it()` calls
  - tests/agent-config-governance.test.ts: 16 `it()` calls
  - tests/governance-endpoint-auth.test.ts: 13 `it()` calls
  - tests/agent-config-governance-extended.test.ts: 56 `it()` calls (unlisted)
- **Impact:** Low. The actual count (196+ across 10 files) exceeds the claim. No missing tests.

### [CV-P7-002] Claim: "dual-manager approval state machine for add-to-team, remove-from-team, assign-cos, remove-cos, transfer-agent operations"
- **Source:** CHANGELOG.md line 12, v0.26.0 section (Layer 3 description)
- **Severity:** SHOULD-FIX (documentation inaccuracy)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The dual-manager approval state machine is fully implemented for all 5 listed operations PLUS `configure-agent`. The GovernanceRequestType union includes all 5 plus `create-agent`, `delete-agent`, and `configure-agent`. The `performRequestExecution()` function at cross-host-governance-service.ts:407-543 has working switch cases for `add-to-team`, `remove-from-team`, `assign-cos`, `remove-cos`, `transfer-agent`, and `configure-agent`.
- **What's missing:** The `create-agent` and `delete-agent` types exist in the GovernanceRequestType union (types/governance-request.ts:18-19) and are accepted as valid in `receiveCrossHostRequest` validation (line 175), but:
  1. They are NOT in the IMPLEMENTED_TYPES list at cross-host-governance-service.ts:110, so `submitCrossHostRequest` rejects them with "not yet implemented".
  2. The `performRequestExecution` default case at line 540 logs "not yet implemented" for them.

  This means the types are defined but non-functional for cross-host submission. The CHANGELOG does not explicitly claim these work -- it only lists the 5 operations. However, the type union declares them, which could mislead consumers.
- **Evidence:**
  - types/governance-request.ts:18-19 -- `'create-agent' | 'delete-agent'` in GovernanceRequestType
  - cross-host-governance-service.ts:110 -- IMPLEMENTED_TYPES does NOT include them
  - cross-host-governance-service.ts:540 -- "not yet implemented" in default case
- **Impact:** Low. The CHANGELOG claim is technically accurate (it lists only the 5 operations). The non-implemented types in the union are forward-looking placeholders. However, `receiveCrossHostRequest` accepts them (line 175), which means a remote peer could send a `create-agent` request that gets stored but never executed -- a silent no-op.

---


### [CV-P7-001] Claim: "resolve 14 review findings (14 MUST-FIX missing await)"
- **Source:** Commit message
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The diff contains exactly 14 `await` additions across 7 files. All 14 are genuine missing-await fixes for async functions (`updateMetrics`, `updateAgentById`, `deleteAgentById`, `linkAgentSession`, `normalizeHosts`, `registerAgent`, `createNewAgent`). All 7 functions are confirmed `async` in their service definitions.
- **What's missing:** Two additional call sites for `updateAgentById` in `services/headless-router.ts` at lines 945 and 953 (PATCH/DELETE `/api/agents/[id]/metadata`) remain un-awaited. These are the same async function fixed elsewhere in this commit but were not caught in this pass.
- **Evidence:**
  - `services/headless-router.ts:945` -- `const result = updateAgentById(params.id, { metadata })` -- missing `await`
  - `services/headless-router.ts:953` -- `const result = updateAgentById(params.id, { metadata: {} })` -- missing `await`
- **Impact:** The metadata PATCH and DELETE endpoints will receive a Promise object instead of the resolved ServiceResult, causing `result.error` to be undefined (Promise objects don't have `.error`), so the handler will always fall through to the success path and return `{ metadata: undefined }` or `{ success: true }` regardless of whether the operation actually succeeded or failed.

---


---

## Nits & Suggestions


### [CC-P7-A8-002] Test description says "17 scenarios" but file has 27 tests
- **File:** tests/message-filter.test.ts:69
- **Severity:** NIT
- **Category:** logic (stale comment)
- **Confidence:** CONFIRMED
- **Description:** The comment at line 69 says `// Tests -- 17 scenarios covering all branches of checkMessageAllowed` but the file actually contains 27 test cases: 17 in the first `describe` block and 10 in the "Layer 2: attestation-aware mesh messages" block. The comment was not updated when the Layer 2 tests were added.
- **Evidence:**
  ```typescript
  // line 69:
  // Tests — 17 scenarios covering all branches of checkMessageAllowed
  ```
  Actual count: Layer 1 has 17 tests (lines 80-391), Layer 2 has 10 tests (lines 399-531). Total: 27.
- **Fix:** Update the comment to say "27 scenarios" or remove the count since it's easy to get out of date.


_No nits found._


### [CC-P7-A3-002] Non-null assertion on `result.data!` in AMP v1 routes
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/health/route.ts`:19, `/Users/emanuelesabetta/ai-maestro/app/api/v1/info/route.ts`:19, `/Users/emanuelesabetta/ai-maestro/app/api/v1/messages/pending/route.ts`:28,43,63, `/Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts`:37, `/Users/emanuelesabetta/ai-maestro/app/api/v1/register/route.ts`:28
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Seven locations use `result.data!` non-null assertion after an `if (result.error)` early return. While the runtime behavior is correct (the service layer always sets `data` on success paths), the TypeScript compiler cannot narrow `data` from `T | undefined` to `T` after an `error` check because `ServiceResult<T>` uses optional fields (`data?: T; error?: string`). The `!` assertions bypass type safety. This is a known design limitation of the current `ServiceResult` type (noted in prior passes as a type design improvement, not a bug).
- **Evidence:**
  ```typescript
  // health/route.ts:19
  return NextResponse.json(result.data!, { status: result.status, headers: result.headers })
  ```
- **Fix:** This would be eliminated by switching to a discriminated union `ServiceResult` type:
  ```typescript
  type ServiceResult<T> =
    | { data: T; status: number; headers?: Record<string, string>; error?: never }
    | { error: string; status: number; headers?: Record<string, string>; data?: never }
  ```
  This is a codebase-wide refactor, not specific to these routes.


No nit issues found.


### [CC-P7-A9-002] Box-drawing banner width mismatch in install-messaging.sh
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The ASCII box-drawing banner has inconsistent column widths. The top/bottom borders (`═`) are 62 characters wide, but the middle lines use 64-character padding (spaces between `║`), causing visual misalignment in some terminal emulators.
- **Evidence:**
```bash

### [CC-P7-A5-003] amp-auth.ts createApiKey body not indented under withLock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:162-183
- **Severity:** NIT
- **Category:** style
- **Confidence:** CONFIRMED
- **Description:** The body of `createApiKey()` has the code inside `withLock()` not indented to the lock callback level. Lines 163-182 are at the same indentation as the `return withLock(...)` line, making it visually unclear that all logic runs under the lock. This is a cosmetic/readability issue only; the code is functionally correct.
- **Evidence:**
  ```typescript
  export async function createApiKey(...): Promise<string> {
    // SF-004: Serialize read-modify-write on the API keys file
    return withLock('amp-api-keys', () => {
    const apiKey = generateApiKey()   // <-- should be indented one more level
    const keyHash = hashApiKey(apiKey)
    // ...
    return apiKey
    }) // end withLock('amp-api-keys')
  }
  ```
- **Fix:** Indent the body of the `withLock` callback by one additional level.


(none)


No nit issues found.


### [CC-P7-A7-004] TerminalView uses deprecated document.execCommand('copy')
- **File:** /Users/emanuelesabetta/ai-maestro/components/TerminalView.tsx:161
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `handleTerminalCopy` function has a fallback path that uses `document.execCommand('copy')`, which is deprecated by the Web API standard. While it serves as a fallback for contexts where Clipboard API fails, this should be noted for future removal.
- **Evidence:**
```typescript
// line 161
document.execCommand('copy')
```
- **Fix:** No immediate fix needed. Document for future removal when Clipboard API support is universal.

### [CC-P7-A7-005] RepoScanner unmount does not abort in-flight scan
- **File:** /Users/emanuelesabetta/ai-maestro/components/plugin-builder/RepoScanner.tsx:19
- **Severity:** NIT
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `RepoScanner` component stores an `AbortController` in a ref (`abortRef`) and aborts previous scans when starting a new one, but does not abort on component unmount. If the component unmounts during a scan, the fetch resolves and calls `setScanResult`/`setError` on an unmounted component (React will log a warning in dev mode, though it's a no-op in production since React 18).
- **Evidence:**
```typescript
// line 19 — ref created but no cleanup effect
const abortRef = useRef<AbortController | null>(null)
// No useEffect(() => { return () => abortRef.current?.abort() }, [])
```
- **Fix:** Add a cleanup effect: `useEffect(() => { return () => { abortRef.current?.abort() } }, [])` matching the pattern used in `SkillPicker.tsx` (line 58) and `BuildAction.tsx` (lines 35-40).


No NIT issues found.


No NIT issues found.


No cross-file consistency issues found.

- **Version 0.26.0:** Consistent across all 8+ files (package.json, version.json, README.md, remote-install.sh, docs/index.html, docs/ai-index.html, CHANGELOG.md, docs/OPERATIONS-GUIDE.md, docs/BACKLOG.md).
- **GovernanceRole alias:** Correctly aliases AgentRole in types/governance.ts:23 as claimed.
- **'normal' -> 'member' migration:** No instances of `'normal'` as a governance role remain in any .ts file. All role references use `'manager' | 'chief-of-staff' | 'member'`.

---


### [CV-P7-002] Two additional missing-await call sites for updateAgentById not fixed
- **Severity:** MUST-FIX
- **Files affected:** services/headless-router.ts
- **Expected:** All call sites of async `updateAgentById` should be awaited
- **Found:**
  - `services/headless-router.ts:945` -- `const result = updateAgentById(params.id, { metadata })` -- NOT awaited
  - `services/headless-router.ts:953` -- `const result = updateAgentById(params.id, { metadata: {} })` -- NOT awaited
- **Note:** These are in the PATCH/DELETE handlers for `/api/agents/[id]/metadata`, distinct from the PATCH/DELETE for `/api/agents/[id]` which were fixed in this commit.

---


---

## Source Reports

- `epcp-correctness-P7-2305aa91-9631-440f-82e1-17f8f9b44357.md`
- `epcp-correctness-P7-268dc241-STALE.md`
- `epcp-correctness-P7-3930fff6-9cdb-4ff9-8d42-b125b1ef4e05.md`
- `epcp-correctness-P7-752c6665-cfc2-436e-b291-09d815880b96.md`
- `epcp-correctness-P7-7ab743ca-9342-4c70-9b43-c456b4898f97.md`
- `epcp-correctness-P7-7ce9af35-81f0-47fc-b7be-4f45ed44a4e6.md`
- `epcp-correctness-P7-8c33016b-be54-42b0-9915-d3a950bab861.md`
- `epcp-correctness-P7-b3559652-053c-4427-89a8-5461446b3d5d.md`
- `epcp-correctness-P7-d9ea0473-5d18-4c24-b8ed-cb623bda65a3.md`
- `epcp-correctness-P7-eefd7535-7766-439e-b5fe-19348b575dbd.md`
- `epcp-correctness-P7-f660f3f4-e347-4dad-a92e-3df11c8ab80d.md`
- `epcp-claims-P7-55ff3976-eff0-433e-b47a-2013f4a67bf8.md`
- `epcp-claims-P7-6648438e-b892-460b-80ed-c82855a46b5e.md`
- `epcp-review-P7-70ecbca4-1565-48ff-bf1c-b4e852896722.md`
- `epcp-review-P7-b4183ea6-a20c-44da-9f37-c457bc154667.md`

