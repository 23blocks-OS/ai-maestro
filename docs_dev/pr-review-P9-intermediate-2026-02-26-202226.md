# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-26-202226
**Pass:** 9
**Run ID:** 1ebfebc5
**Reports merged:** 12
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 20 |
| **SHOULD-FIX** | 61 |
| **NIT** | 46 |
| **Total** | 135 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


_No MUST-FIX issues found._


(none)


### [CC-P9-A4-001] `sendCommand` returns both `data` and `error` in same response (ambiguous contract)
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:783-787
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** When `sendCommand` detects the session is not idle, it returns an object with BOTH `data` (containing `success: false`, `idle: false`, etc.) AND `error: 'Session is not idle'`, AND `status: 409`. The `ServiceResult<T>` type contract is `{ data, status }` OR `{ error, status }`, not both. The same issue occurs in `sendAgentSessionCommand` at line 1185-1194. Callers like `sendServiceResult` in headless-router may behave unpredictably since they check `result.error` first -- so the `data` field is silently discarded.
- **Evidence:**
```typescript
// sessions-service.ts:782-787
return {
  data: { success: false, sessionName, idle: false, timeSinceActivity, idleThreshold: IDLE_THRESHOLD_MS },
  error: 'Session is not idle',
  status: 409
}
```
- **Fix:** Return either `{ error, status }` or `{ data, status }`, not both. If the intent is to provide structured idle info alongside the error, put it in the error message or make a dedicated error shape. The same pattern at agents-core-service.ts:1185-1194 needs the same fix.

### [CC-P9-A4-002] Cloud agent rename is not atomic -- crash between write and unlink loses data
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:730-735
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `renameSession` function for cloud agents writes the new file, then unlinks the old file. If the process crashes between `writeFileSync` and `unlinkSync`, both files exist with potentially inconsistent state. This is not atomic.
- **Evidence:**
```typescript
// sessions-service.ts:734-735
fs.writeFileSync(newAgentFilePath, JSON.stringify(agentConfig, null, 2), 'utf8')
fs.unlinkSync(oldAgentFilePath)
```
- **Fix:** Use the write-to-temp-then-rename pattern: write to a `.tmp` file first, then `fs.renameSync` the temp to the new path (atomic on same filesystem), then `fs.unlinkSync` the old path. If the rename fails, clean up the temp file.

### [CC-P9-A4-003] `createSession` has conflicting agentId assignment (last write wins)
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:620-627
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `persistSession`, the `agentId` is spread twice: first from the function parameter (`params.agentId`), then from the registered agent result (`registeredAgent.id`). If both are truthy, the second one silently overwrites the first via object spread order. While this likely works "correctly" (the registered agent's ID is preferred), it is confusing and could mask a scenario where `params.agentId` and `registeredAgent.id` differ.
- **Evidence:**
```typescript
// sessions-service.ts:620-627
persistSession({
  id: actualSessionName,
  name: actualSessionName,
  workingDirectory: cwd,
  createdAt: new Date().toISOString(),
  ...(agentId && { agentId }),           // First: from params
  ...(registeredAgent && { agentId: registeredAgent.id })  // Second: overwrites first
})
```
- **Fix:** Choose one source of truth for `agentId`. If `registeredAgent.id` is always preferred, remove the `...(agentId && { agentId })` spread. If the parameter should take precedence, reverse the order.

---


### [CC-P9-A3-001] SSRF bypass: health check proceeds when hostUrl is empty string
- **File:** app/api/hosts/health/route.ts:18,58
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When `url` query parameter is missing, `hostUrl` defaults to `''` (empty string). The SSRF allowlist check on line 18 is guarded by `if (hostUrl)`, so an empty string skips the entire allowlist validation. Control then falls through to `checkRemoteHealth('')` on line 58. Depending on how `checkRemoteHealth` handles an empty string, this could either produce an unhelpful error or, if the service constructs a URL from defaults, route the request to an unintended target. At minimum, the allowlist is completely bypassed for empty `url`.
- **Evidence:**
  ```typescript
  // line 13
  const hostUrl = request.nextUrl.searchParams.get('url') || ''
  // line 18
  if (hostUrl) {  // <-- empty string is falsy, skips entire SSRF block
    // ... allowlist validation ...
  }
  // line 58
  const result = await checkRemoteHealth(hostUrl) // called with '' bypassing allowlist
  ```
- **Fix:** Return 400 immediately when `hostUrl` is empty/missing:
  ```typescript
  if (!hostUrl) {
    return NextResponse.json({ error: 'url query parameter is required' }, { status: 400 })
  }
  ```

### [CC-P9-A3-002] SSRF allowlist bypass via bare alias hostname match with attacker-controlled port
- **File:** app/api/hosts/health/route.ts:45
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When a host alias is a bare hostname/IP (not a URL), the code falls back to a direct hostname string comparison on line 45: `alias.toLowerCase() === parsed.hostname.toLowerCase()`. This ignores the port entirely. If a known host has alias `"myhost"`, an attacker can request `?url=http://myhost:6379/` to reach Redis on that host, bypassing the origin-based port check that was specifically added by MF-001 fix. The origin-based check (lines 40-41) only fires when the alias contains `://` or when the URL parsing succeeds; for bare hostname strings that do not parse as URLs, the code falls through to the unsafe hostname-only check.
- **Evidence:**
  ```typescript
  // line 44-45: bare alias match ignores port
  if (alias.toLowerCase() === parsed.hostname.toLowerCase()) return true
  ```
- **Fix:** Either remove the bare hostname fallback entirely (forcing aliases to always be full URLs), or also validate that the requested port matches the known host's configured port (e.g., default 23000).

### [CC-P9-A3-003] Missing error guard in GET /api/organization allows undefined result.status
- **File:** app/api/organization/route.ts:10
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The GET handler returns `NextResponse.json(result.data, { status: result.status })` without checking `result.error` first. If `getOrganization()` returns an error result (e.g., config file missing/corrupt), `result.data` could be `undefined` and `result.status` could be an error status code (e.g., 500). This sends the error data in a non-standard format (no `{ error: ... }` wrapper) or, if `result.data` is undefined, returns `null` with a 500 status and no error message. Every other GET route in this domain checks `result.error` first.
- **Evidence:**
  ```typescript
  export async function GET() {
    const result = getOrganization()
    return NextResponse.json(result.data, { status: result.status })  // no error check
  }
  ```
- **Fix:** Add the standard error guard:
  ```typescript
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
  ```


### [CC-P9-A5-001] hosts-config.ts has its own lock implementation, duplicating and diverging from file-lock.ts
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:20-79
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `hosts-config.ts` implements its own `acquireLock`/`releaseLock`/`withLock` functions (lines 20-79), separate from and with different behavior than the canonical `file-lock.ts`. Crucially, the hosts-config lock has a **5-second timeout** (vs 30 seconds in file-lock.ts), uses a different queue structure (object with resolve/reject vs function callbacks), and critically: when the timeout fires in `acquireLock()`, the `findIndex` comparison uses function reference equality on the `resolve` wrapper (line 35: `item.resolve === resolve`), but the stored `resolve` (line 43) is a **wrapper** around the promise's `resolve`, not the raw promise resolver. This means the wrapper reference might not match `resolve` from the outer closure depending on how the variable is captured. Let me re-verify: the `resolve` referenced on line 35 refers to the parameter of the Promise executor, and line 43 wraps it. On line 35 `item.resolve === resolve` compares the *wrapped* function (stored) with the *raw* resolve -- these will never be equal because line 43 assigns a new function. This means timed-out waiters will never be removed from the queue, causing a memory leak and phantom lock grants.
- **Evidence:**
```typescript
// Line 33-52
return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const index = lockQueue.findIndex(item => item.resolve === resolve) // BUG: compares wrapped fn
      if (index !== -1) {
        lockQueue.splice(index, 1)
      }
      reject(new Error('Lock acquisition timeout'))
    }, LOCK_TIMEOUT)

    lockQueue.push({
      resolve: () => {         // This is a WRAPPER, not `resolve` itself
        clearTimeout(timeout)
        resolve()              // `resolve` is called inside the wrapper
      },
      reject: ...
    })
  })
```
- **Fix:** The `findIndex` on timeout should compare by a stable identifier (e.g., store the timeout ID or use a unique index), or store the raw `resolve` alongside the wrapper. Alternatively, migrate to using the canonical `withLock` from `file-lock.ts` with a 'hosts-config' lock name.

### [CC-P9-A5-002] index-delta.ts acquireIndexSlot references `entry` before it is declared
- **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:51
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `acquireIndexSlot()`, the timeout callback on line 51 references `entry.timestamp`, but `entry` is declared on line 56 (5 lines later). JavaScript hoists `const` declarations but does not initialize them, so accessing `entry.timestamp` in the timeout would throw a `ReferenceError: Cannot access 'entry' before initialization` if the timeout fires before `entry` is assigned. In practice, since the timeout is asynchronous (at least 60 seconds), `entry` will always be initialized by the time the callback fires. However, this is a temporal dead zone (TDZ) hazard -- if `INDEX_SLOT_TIMEOUT_MS` were ever set to 0 or the event loop were starved, it could crash.
- **Evidence:**
```typescript
// Line 47-66
return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      // Line 51: references `entry` which is declared on line 56
      const idx = indexQueue.findIndex(q => q.agentId === agentId && q.timestamp === entry.timestamp)
      if (idx !== -1) indexQueue.splice(idx, 1)
      reject(new Error(...))
    }, INDEX_SLOT_TIMEOUT_MS)

    const entry = {  // Line 56: declared AFTER the timeout callback references it
      resolve: () => { ... },
      agentId,
      timestamp: Date.now()
    }
    indexQueue.push(entry)
  })
```
- **Fix:** Move the `entry` declaration before the `setTimeout` call, or capture `entry.timestamp` in a separate variable declared before the timeout.

### [CC-P9-A5-003] amp-auth.ts validateApiKey mutates shared cache without lock protection
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:216-246
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `validateApiKey()` is synchronous and intentionally lock-free. It calls `_loadApiKeysRaw()` which returns the shared cache reference (line 216). When the debounce interval passes, it mutates `record.last_used_at` in-place (line 243) and then calls `saveApiKeys(keys)` (line 244) which writes ALL keys to disk. If two concurrent HTTP requests both hit the debounce window simultaneously, both will call `saveApiKeys(keys)` with the same array reference -- the second write will overwrite the first. This is a data race on the `last_used_at` field. While the comment on line 209-211 acknowledges this, the actual risk is not just lost `last_used_at` updates -- if `createApiKey` or `revokeApiKey` runs between the two saves, the second `saveApiKeys` call in `validateApiKey` will overwrite the newly created/revoked key because it holds a stale snapshot. The in-memory cache prevents this from being visible but disk state can diverge from cache after TTL expiry.
- **Evidence:**
```typescript
// Lines 216-246
const keys = _loadApiKeysRaw()  // Returns shared cache reference
const keyHash = hashApiKey(apiKey)
// ... iteration ...
if (record) {
    const now = Date.now()
    const lastWrite = _lastUsedWriteTimestamps.get(keyHash) || 0
    if (now - lastWrite > LAST_USED_WRITE_INTERVAL_MS) {
      record.last_used_at = new Date().toISOString()
      saveApiKeys(keys)  // Writes ALL keys, may overwrite concurrent mutations
      _lastUsedWriteTimestamps.set(keyHash, now)
    }
  }
```
- **Fix:** Either: (a) wrap the `saveApiKeys` call inside `withLock('amp-api-keys')` (making that part async), or (b) schedule the lastUsed write via a debounced async callback that acquires the lock, re-reads from cache, updates `last_used_at`, and saves.


_No MUST-FIX issues found._

All 29 test files were audited thoroughly. No crashes, security holes, data loss, or wrong-result bugs were identified in the test code itself. The tests are well-structured, use correct mocking patterns, and accurately verify the behavior of their modules under test.


### [CC-P9-A9-001] `portable_sed` in remote-install.sh passes file path twice to sed, breaking on files with spaces or certain patterns
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:327-330
- **Severity:** MUST-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The `portable_sed` function extracts the last argument as the file, then passes ALL arguments (including the file) to `sed -i.bak`. This means the file path appears twice: once as the sed expression list and once as the target file. This works by accident when `sed` receives `"s|foo|bar|" "file"` -- sed interprets the first as a command and the second as the file. However, the function is semantically wrong: it should separate the sed arguments from the file path. More critically, the `rm -f "${file}.bak"` depends on the `$@` call succeeding. If sed fails (e.g., invalid regex), the `.bak` file is not cleaned up because `&&` short-circuits.
- **Evidence:**
  ```bash
  portable_sed() {
      local file="${@: -1}"
      sed -i.bak "$@" && rm -f "${file}.bak"
  }
  ```
  Callers like line 1065: `portable_sed "s|AIMAESTRO_API=.*|AIMAESTRO_API=http://127.0.0.1:${PORT}|" .env`
  This becomes: `sed -i.bak "s|AIMAESTRO_API=.*|..." .env && rm -f ".env.bak"` which works. But conceptually, if the function is called with multiple sed expressions, the file extraction is fragile.
- **Fix:** The function works by coincidence in all current call sites. For robustness, separate the file arg explicitly:
  ```bash
  portable_sed() {
      local file="${@: -1}"
      local args=("${@:1:$#-1}")
      sed -i.bak "${args[@]}" "$file" && rm -f "${file}.bak"
  }
  ```
  Also add cleanup of `.bak` in the failure path if partial writes are undesirable.

### [CC-P9-A9-002] `server.mjs` crash log directory may not exist on first uncaught exception
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:36-43
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `uncaughtException` handler writes to `path.join(process.cwd(), 'logs', 'crash.log')` at line 36. The logs directory creation happens at line 366-368, which runs AFTER the global error handlers are registered (lines 31-70). If an uncaught exception is thrown during module import resolution (lines 6-22), the logs directory doesn't exist yet and `fs.appendFileSync` will throw, which is swallowed by the try/catch. This is benign but the crash log is silently lost. More importantly, the `unhandledRejection` handler (line 59) has the same issue.
- **Evidence:**
  ```javascript
  // Line 31-43: Global handler registered first
  process.on('uncaughtException', (error, origin) => {
    const crashLogPath = path.join(process.cwd(), 'logs', 'crash.log')
    // ...
    try {
      fs.appendFileSync(crashLogPath, logEntry)
    } catch (fsError) {
      // Ignore file write errors  <-- crash log silently lost
    }
  })

  // Line 366-368: Logs dir created much later
  const logsDir = path.join(process.cwd(), 'logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }
  ```
- **Fix:** Move the `logsDir` creation block (lines 366-368) to before the global error handlers (before line 31), or create the directory lazily inside the error handler before writing.


### [CC-P9-A6-001] MeetingRoom: duplicate team creation race between createMeetingRecord and teamId resolution effects
- **File:** components/team-meeting/MeetingRoom.tsx:264-321 and :367-391
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Two independent `useEffect` blocks both attempt to create a team via `POST /api/teams` when `teamId` is null and the meeting is active. The effect at line 264 (`createMeetingRecord`) runs when `state.phase === 'active' && !persistedMeetingIdRef.current`, and the effect at line 367 runs when `state.phase === 'active' && !teamId && state.teamName.trim()`. Both check for an existing team by name and create one if missing. Since they run independently and check different guards (`persistedMeetingIdRef.current` vs `teamId`), both can fire on the same render cycle. This creates a race condition where two teams with the same name can be created in rapid succession.
- **Evidence:**
  ```tsx
  // Effect 1 (line 264):
  useEffect(() => {
    if (state.phase !== 'active' || persistedMeetingIdRef.current) return
    // ...creates team if not found by name...
  }, [state.phase, state.teamName, state.selectedAgentIds, state.sidebarMode, teamId])

  // Effect 2 (line 367):
  useEffect(() => {
    if (state.phase === 'active' && !teamId && state.teamName.trim()) {
      // ...creates team if not found by name...
    }
  }, [state.phase, state.teamName, state.selectedAgentIds, teamId])
  ```
- **Fix:** Consolidate team creation into a single effect, or add a `creatingTeamRef` guard (similar to `creatingMeetingRef`) to prevent the second effect from creating a duplicate team while the first is in flight.

### [CC-P9-A6-002] MeetingRoom: handleStartMeeting dispatches SET_TEAM_NAME but reads stale state.teamName
- **File:** components/team-meeting/MeetingRoom.tsx:447-463
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `handleStartMeeting` first checks `state.teamName.trim()` and dispatches `SET_TEAM_NAME` with a generated name if empty. It then immediately dispatches `START_MEETING`. The problem is that the AMP notification code at line 459 uses `state.teamName || 'Unnamed Team'` -- but React state updates from `dispatch` are batched and not yet applied. So if the team name was empty and a new name was just generated, the notification still sends "Unnamed Team" instead of the generated name.
- **Evidence:**
  ```tsx
  const handleStartMeeting = useCallback(async () => {
    if (!state.teamName.trim()) {
      dispatch({ type: 'SET_TEAM_NAME', name: generateTeamName() })  // state.teamName is still ''
    }
    dispatch({ type: 'START_MEETING' })

    if (state.notifyAmp && state.selectedAgentIds.length > 0) {
      fetch('/api/teams/notify', {
        // ...
        body: JSON.stringify({
          agentIds: state.selectedAgentIds,
          teamName: state.teamName || 'Unnamed Team',  // BUG: still reads old state.teamName (empty)
        }),
      })
    }
  }, [state.notifyAmp, state.selectedAgentIds, state.teamName])
  ```
- **Fix:** Capture the generated name in a local variable and use it consistently:
  ```tsx
  const name = state.teamName.trim() || generateTeamName()
  if (!state.teamName.trim()) dispatch({ type: 'SET_TEAM_NAME', name })
  // ... use `name` in the notification body
  ```

### [CC-P9-A6-003] MessageCenter: compose sends message but never clears composePriority/composeType state
- **File:** components/MessageCenter.tsx (sendMessage function - compose form handler)
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** When the user sends a composed message and then composes another, the priority and type selections from the previous message persist. After reviewing the full MessageCenter file, the `sendMessage` handler clears `composeTo`, `composeSubject`, `composeBody`, but does not reset `composePriority` and `composeType` to their defaults. A user composing a new message will unexpectedly inherit the priority/type from their previous message.
- **Evidence:** The compose form's send handler clears fields:
  ```tsx
  setComposeTo('')
  setComposeSubject('')
  setComposeBody('')
  setView('sent')
  // Missing: setComposePriority('normal')
  // Missing: setComposeType('request')
  ```
- **Fix:** Add `setComposePriority('normal')` and `setComposeType('request')` (or whatever the defaults are) after clearing the other compose fields.


### [CC-P9-A0-001] Missing try-catch in directory/lookup route allows unhandled exceptions to crash
- **File:** `app/api/agents/directory/lookup/[name]/route.ts`:18
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `GET` handler does not have an outer try-catch. If `lookupAgentByDirectoryName()` throws an unhandled exception (rather than returning an error result object), the request will fail with an unhandled exception and no 500 response will be sent. Every other route in this domain wraps the handler body in try-catch; this one is missing it.
- **Evidence:**
```typescript
// line 14-24
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params          // no try-catch
  const result = lookupAgentByDirectoryName(name)
  if (result.error) {
    return NextResponse.json({ found: false }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
```
- **Fix:** Wrap the handler body in a try-catch block that returns a 500 JSON error, consistent with all other routes in this domain.

### [CC-P9-A0-002] Missing try-catch in directory GET route allows unhandled exceptions
- **File:** `app/api/agents/directory/route.ts`:14
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `GET` handler for `/api/agents/directory` lacks a try-catch. If `getDirectory()` throws, the request crashes with no JSON error response. All other routes in this domain have outer try-catch.
- **Evidence:**
```typescript
// line 14-20
export async function GET(_request: NextRequest) {
  const result = getDirectory()
  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch returning `{ error: 'Internal server error' }` with status 500.

### [CC-P9-A0-003] Missing try-catch in directory/sync POST route allows unhandled exceptions
- **File:** `app/api/agents/directory/sync/route.ts`:13
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `POST` handler for `/api/agents/directory/sync` lacks a try-catch. If `syncDirectory()` throws, the request crashes with no JSON error response.
- **Evidence:**
```typescript
// line 13-19
export async function POST(_request: NextRequest) {
  const result = await syncDirectory()
  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch returning `{ error: 'Internal server error' }` with status 500.

### [CC-P9-A0-004] Missing try-catch in startup POST and GET routes
- **File:** `app/api/agents/startup/route.ts`:10-36
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Both `POST` and `GET` handlers for `/api/agents/startup` lack try-catch. If `initializeStartup()` or `getStartupInfo()` throws, the request will crash without a JSON error response.
- **Evidence:**
```typescript
// line 10-20
export async function POST() {
  const result = await initializeStartup()
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
// line 26-36
export async function GET() {
  const result = getStartupInfo()
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch to both handlers.

### [CC-P9-A0-005] Missing try-catch in normalize-hosts GET and POST routes
- **File:** `app/api/agents/normalize-hosts/route.ts`:16-30
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Both `GET` and `POST` handlers for `/api/agents/normalize-hosts` lack try-catch. If `diagnoseHosts()` or `normalizeHosts()` throws, the request will crash.
- **Evidence:**
```typescript
// line 16-22
export async function GET() {
  const result = diagnoseHosts()
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
// line 24-30
export async function POST() {
  const result = await normalizeHosts()
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch to both handlers.


### [CC-P9-A1-001] Transfer resolve route: early return inside `finally` block leaks lock semantics
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:83-84
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `try` block on line 79 contains multiple early `return NextResponse.json(...)` statements (lines 84, 91, 102, 117-119, 129, 163) before the `finally` on line 166. While these returns do execute `releaseLock()` in the finally block (which is correct behavior), the early returns on lines 84, 102, and 117 happen **after team mutations may have started but before `saveTeams()`**. Specifically:
  - Line 84: Returns 404 if source team not found. This is safe (no mutation yet).
  - Line 91: Returns 403 if not authorized. Safe (no mutation yet).
  - Line 102: Returns 404 if destination team not found. Safe (no mutation yet).
  - Line 117: Returns 409 for closed-team constraint. Safe (no mutation yet).
  - Line 129: Returns 409 if `resolveTransferRequest` returns null. **Potential issue**: `resolveTransferRequest` was called on line 126 which already marked the transfer as approved/rejected on disk. If it returns null (concurrent resolve), the transfer status was already changed by another caller, so this is actually fine (the other caller handled it).

  Upon deeper trace: All early returns before `resolveTransferRequest()` on line 126 are pre-validation and safe. The only return after `resolveTransferRequest()` and before `saveTeams()` is line 129, which handles the case where `resolveTransferRequest` itself returned null (concurrent resolve detected). This is correct behavior.

  **RETRACTED** -- After full trace, the lock acquisition and release pattern is correct. The `finally` block always releases the lock, and the early returns are all in safe states. Downgrading to informational.

*(No MUST-FIX issues found after thorough analysis.)*


---

## SHOULD-FIX Issues


### [CC-P9-A2-001] notify/route.ts passes raw unvalidated body directly to service function
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts`:26
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `POST` handler in `notify/route.ts` passes the raw `body` object directly to `notifyTeamAgents(body)` without any field whitelisting or input validation at the route level. While other POST handlers in this domain (tasks/route.ts, tasks/[taskId]/route.ts, [id]/route.ts) explicitly whitelist fields and validate types before passing to the service layer, `notify/route.ts` trusts the raw JSON entirely. The service function `notifyTeamAgents` does validate `agentIds` and `teamName`, but the route-level defense-in-depth pattern used everywhere else is absent here. An attacker could send extraneous fields that get spread into the params object (prototype pollution vectors, unexpected properties that downstream code might pick up).
- **Evidence:**
  ```typescript
  // notify/route.ts:26
  const result = await notifyTeamAgents(body)
  ```
  Compare with the pattern used in tasks/route.ts:74-83:
  ```typescript
  const safeParams: CreateTaskParams = {
    subject: String(body.subject ?? ''),
    ...(body.description !== undefined && { description: String(body.description) }),
    // ... explicit whitelist
  }
  const result = await createTeamTask(id, safeParams)
  ```
- **Fix:** Whitelist only `agentIds` and `teamName` from `body` before passing to service:
  ```typescript
  const safeParams = { agentIds: body.agentIds, teamName: body.teamName }
  const result = await notifyTeamAgents(safeParams)
  ```

### [CC-P9-A2-002] documents/route.ts POST passes raw body with spread, no field whitelisting
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts`:58
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The POST handler in `documents/route.ts` passes `{ ...body, requestingAgentId }` directly to `createTeamDocument`. While the service layer destructures only known fields (`title, content, pinned, tags`), the route layer does not whitelist fields. This is inconsistent with the defense-in-depth pattern applied to the task routes (tasks/route.ts and tasks/[taskId]/route.ts), which explicitly whitelist fields. Similarly, `documents/[docId]/route.ts` PUT handler at line 56 does the same: `{ ...body, requestingAgentId }`.
- **Evidence:**
  ```typescript
  // documents/route.ts:58
  const result = await createTeamDocument(id, { ...body, requestingAgentId })

  // documents/[docId]/route.ts:56
  const result = await updateTeamDocument(id, docId, { ...body, requestingAgentId })
  ```
- **Fix:** Whitelist only `CreateDocumentParams` / `UpdateDocumentParams` fields at the route level, mirroring the pattern in tasks routes. For POST:
  ```typescript
  const safeParams: CreateDocumentParams = {
    title: body.title,
    ...(body.content !== undefined && { content: String(body.content) }),
    ...(body.pinned !== undefined && { pinned: Boolean(body.pinned) }),
    ...(body.tags !== undefined && { tags: body.tags }),
    requestingAgentId,
  }
  ```

### [CC-P9-A2-003] notify/route.ts does not validate agentIds array elements are UUIDs
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts`:26
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `notifyTeamAgents` service function accepts `agentIds` as `string[]` and validates it is an array, but neither the route nor the service validates that each element is a valid UUID. The task routes validate `blockedBy` array elements at the route level (`body.blockedBy.every(v => typeof v === 'string')`). Without element-level validation for `agentIds`, non-string or malformed values could be passed to downstream tmux commands. The service does call `safeTeamName.replace(/[\x00-\x1F\x7F]/g, '')` for teamName but agentIds are used to look up agents without UUID format validation.
- **Evidence:**
  ```typescript
  // notify/route.ts:26 - passes body directly, no element validation
  const result = await notifyTeamAgents(body)

  // teams-service.ts:626 - validates array, not elements
  if (!agentIds || !Array.isArray(agentIds)) {
    return { error: 'agentIds array is required', status: 400 }
  }
  ```
- **Fix:** Add element-level validation at the route or service layer: validate each `agentIds` element is a string and optionally a valid UUID format.

### [CC-P9-A2-004] `any[]` return types in service functions weaken type safety
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:120,300,468,623
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple service functions use `any[]` in their return types: `listAllTeams()` returns `ServiceResult<{ teams: any[] }>`, `listTeamTasks()` returns `ServiceResult<{ tasks: any[] }>`, `listTeamDocuments()` returns `ServiceResult<{ documents: any[] }>`, and `notifyTeamAgents()` returns `Promise<ServiceResult<{ results: any[] }>>`. These propagate `any` through the route handlers to the API responses, eliminating TypeScript's ability to catch shape mismatches between what the service returns and what the API contract promises.
- **Evidence:**
  ```typescript
  // teams-service.ts:120
  export function listAllTeams(): ServiceResult<{ teams: any[] }> {
  // teams-service.ts:300
  export function listTeamTasks(...): ServiceResult<{ tasks: any[] }> {
  // teams-service.ts:468
  export function listTeamDocuments(...): ServiceResult<{ documents: any[] }> {
  // teams-service.ts:623
  export async function notifyTeamAgents(...): Promise<ServiceResult<{ results: any[] }>> {
  ```
- **Fix:** Replace `any[]` with concrete types: `Team[]`, `Task[]`, `TeamDocument[]`, and a notification result type respectively. These types already exist in `types/team.ts` and `types/task.ts`.


### [CC-P9-A7-001] assertValidServiceResult is defined but never called
- **File:** /Users/emanuelesabetta/ai-maestro/types/service.ts:27
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `assertValidServiceResult()` runtime guard was introduced as defense-in-depth for SF-024 (ServiceResult allows simultaneous `data` and `error`). The comment at line 25 says "Use in route handlers after service calls for defense-in-depth." However, a codebase-wide search confirms this function is never imported or called by any route handler or service. Multiple route handlers use the unsafe `result.data ?? {}` pattern without checking `result.error` first (e.g., `app/api/v1/health/route.ts:22`, `app/api/v1/info/route.ts:22`, `app/api/v1/route/route.ts:38`), which is exactly the bug class this guard was designed to catch.
- **Evidence:**
  ```typescript
  // types/service.ts:27-33
  export function assertValidServiceResult<T>(result: ServiceResult<T>, context?: string): void {
    if (result.data !== undefined && result.error !== undefined) {
      const ctx = context ? ` [${context}]` : ''
      console.error(`[ServiceResult]${ctx} BUG: result has both data and error set. error="${result.error}" status=${result.status}`)
    }
  }
  ```
  Grep for `assertValidServiceResult` across `**/*.ts` returns only the definition in `types/service.ts` -- zero call sites.
- **Fix:** Either (a) add `assertValidServiceResult(result, 'contextName')` calls in route handlers that consume ServiceResult, or (b) document that this guard is deferred to Phase 2 alongside the discriminated union refactor. The current state is misleading: the guard exists but provides zero protection.


### [CC-P9-A4-004] `getMessages` and `getMeetingMessages` pass raw query object as `any` -- no validation
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:1182, 1188-1189
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple headless-router handlers pass the raw `query` object directly to service functions cast as `any`. For example, `getMeetingMessages(query as any)` and `getMessages(query as any)`. This bypasses type checking and could propagate unexpected fields or missing required fields to the service layer.
- **Evidence:**
```typescript
// headless-router.ts:1182
sendServiceResult(res, await getMeetingMessages(query as any))
// headless-router.ts:1189
sendServiceResult(res, await getMessages(query as any))
// headless-router.ts:1821
sendServiceResult(res, await listMarketplaceSkills(query as any))
```
- **Fix:** Extract and validate specific query parameters before passing to service functions. Replace `query as any` with explicit parameter destructuring.

### [CC-P9-A4-005] `readJsonBody` resolves `{}` for empty body -- callers don't distinguish empty from valid
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:330
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When the request body is empty, `readJsonBody` returns `{}` (an empty object). Many POST/PUT/PATCH handlers call `readJsonBody(req)` then pass the result directly to service functions. Service functions that expect specific fields (e.g., `body.agentId`, `body.password`) will see `undefined` but won't know whether the client sent an empty body vs. `{}`. A `Content-Type: application/json` POST with no body silently succeeds parsing.
- **Evidence:**
```typescript
// headless-router.ts:329-330
if (!body) return resolve({})
```
- **Fix:** Return `null` for empty bodies, or throw an error for POST/PUT/PATCH methods that require a body. Let handlers check for null and return 400 if appropriate.

### [CC-P9-A4-006] `resolveStartCommand` has unreachable `'claude code'` match
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:186
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The condition `program.includes('claude') || program.includes('claude code')` has the second disjunct as unreachable because any string containing `'claude code'` also contains `'claude'`, so the first check always matches. Separately, `createSession` in sessions-service.ts:654 has the same pattern with `selectedProgram.includes('claude')` followed by a separate `else if` for `codex`, etc. Both have `'openclaw'` in sessions-service but not in agents-core-service's `resolveStartCommand`.
- **Evidence:**
```typescript
// agents-core-service.ts:186
if (program.includes('claude') || program.includes('claude code')) {
  return 'claude'
}
```
- **Fix:** Remove the redundant `|| program.includes('claude code')` clause.

### [CC-P9-A4-007] Duplicate program resolution logic -- `createSession` and `resolveStartCommand` diverge
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:653-661 vs /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:185-199
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `createSession` in sessions-service.ts has an inline if-else chain for program resolution (includes `openclaw`), while `wakeAgent` in agents-core-service.ts uses a helper `resolveStartCommand` that does NOT include `openclaw`. This means creating a session with program `'openclaw'` works, but waking a hibernated agent with program `'openclaw'` falls through to `'claude'` default.
- **Evidence:**
```typescript
// sessions-service.ts:660
else if (selectedProgram.includes('openclaw')) startCommand = 'openclaw'
// agents-core-service.ts resolveStartCommand does NOT have openclaw
```
- **Fix:** Consolidate program resolution into a single shared function used by both services. Add `openclaw` to `resolveStartCommand`.

### [CC-P9-A4-008] `headless-router` GET /api/teams/[id]/tasks/[taskId] returns 405 instead of routing to service
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:1498-1501
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The headless router has a GET handler for `/api/teams/:id/tasks/:taskId` that returns 405 (Method Not Allowed) with a comment "GET single task not implemented in route". If this endpoint truly doesn't exist in the Next.js routes either, this is fine. But 405 implies the resource exists but the method isn't allowed, when 404 or simply not registering the route would be more appropriate.
- **Evidence:**
```typescript
// headless-router.ts:1498-1501
{ method: 'GET', pattern: /^\/api\/teams\/([^/]+)\/tasks\/([^/]+)$/, paramNames: ['id', 'taskId'], handler: async (_req, res, _params) => {
  sendJson(res, 405, { error: 'Method not allowed' })
}},
```
- **Fix:** Either implement the GET handler to delegate to a service function (if the feature should exist), or remove the route entirely so it falls through to 404.

### [CC-P9-A4-009] `proxyHealthCheck` SSRF protection can be bypassed via DNS rebinding
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:1633-1669
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The health check proxy validates the hostname against private IP patterns and known hosts from `hosts.json`, but hostname resolution happens later in `fetch()`. A DNS rebinding attack could make a hostname resolve to a private IP after validation. Additionally, the check only blocks private IPs for non-known-hosts, but any entry in hosts.json is allowed even to private IPs. The comment at line 1642-1643 acknowledges this as an "accepted risk" for Phase 1, but it remains a SSRF vector.
- **Evidence:**
```typescript
// agents-core-service.ts:1664
if (isPrivateIP && !isKnownHost) {
  return { error: 'URL target is not a known peer host', status: 403 }
}
```
- **Fix:** For Phase 2, resolve the hostname to an IP first and check the resolved IP against private ranges, regardless of hosts.json status. For now, document the accepted risk more prominently.

### [CC-P9-A4-010] `wakeAgent` sends single-quoted shell exports via `sendKeys` -- fragile for values with spaces
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:1387-1418
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The wake agent flow builds shell export commands with single-quote escaping (`replace(/'/g, "'\\''")`) and sends them via `runtime.sendKeys`. While the single-quote escaping is correct for Bourne-compatible shells, this relies on the tmux session running bash/zsh. If the shell is fish, csh, or another non-POSIX shell, the escaping is wrong. More importantly, `createSession` at line 639 uses `runtime.setEnvironment` (tmux `set-environment`) which is shell-independent, while `wakeAgent` uses `sendKeys` with shell commands -- an inconsistency.
- **Evidence:**
```typescript
// agents-core-service.ts:1415-1418
const envExport = ampDir
  ? `export AMP_DIR='${safeAmpDir2}' AIM_AGENT_NAME='${safeAgentName2}' AIM_AGENT_ID='${safeAgentId2}'; `
  : ''
await runtime.sendKeys(sessionName, `${envExport}unset CLAUDECODE; ${fullCommand}`, { enter: true })
```
- **Fix:** Use `runtime.setEnvironment` consistently (as `createSession` does at line 634-639), then send only the program start command via `sendKeys`. This avoids shell-dependent quoting entirely.

### [CC-P9-A4-011] `listPendingMessages` parseInt without validation
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:1149
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The headless router uses `parseInt(query.limit)` without checking if the result is NaN or negative. If the client sends `?limit=abc`, `parseInt` returns NaN which is passed to the service function.
- **Evidence:**
```typescript
// headless-router.ts:1149
sendServiceResult(res, listPendingMessages(authHeader, query.limit ? parseInt(query.limit) : undefined))
```
- **Fix:** Validate the parsed integer: `const limit = parseInt(query.limit); if (isNaN(limit) || limit < 0) return sendJson(res, 400, { error: 'Invalid limit parameter' })`.

---


### [CC-P9-A3-004] `as` cast bypasses runtime validation for PluginPushConfig
- **File:** app/api/plugin-builder/push/route.ts:62
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** After validating individual fields, the code performs `const config: PluginPushConfig = body as PluginPushConfig` on line 62. While top-level fields are validated (forkUrl, manifest.name, manifest.version, etc.), the `sources` array elements are only checked with `Array.isArray(manifest.sources)` - the individual source objects are never validated. Similarly, `manifest.plugin` is only checked as `typeof manifest.plugin !== 'object'` without validating its internal structure. This means malformed nested data would pass validation and be sent to the service layer.
- **Evidence:**
  ```typescript
  if (!Array.isArray(manifest.sources)) {  // only checks it's an array, not element shape
    return NextResponse.json({ error: 'Manifest sources must be an array' }, { status: 400 })
  }
  // ...
  const config: PluginPushConfig = body as PluginPushConfig  // unsafe cast
  ```
- **Fix:** Add validation for `manifest.sources` elements (at minimum, check each has required fields) and for `manifest.plugin` internal structure, or use a schema validator like zod.

### [CC-P9-A3-005] Operator precedence issue with `?? {} as AMPHealthResponse`
- **File:** app/api/v1/health/route.ts:22
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The expression `result.data ?? {} as AMPHealthResponse` may be parsed as `result.data ?? ({} as AMPHealthResponse)` which is correct for the intended behavior, but the precedence is subtle and could confuse maintainers. More importantly, returning an empty `{}` typed as `AMPHealthResponse` means the response will be missing all required fields of the health response type. This violates the API contract. The same pattern appears in `app/api/v1/info/route.ts:22`.
- **Evidence:**
  ```typescript
  return NextResponse.json(result.data ?? {} as AMPHealthResponse, {
    status: result.status,
    headers: result.headers
  })
  ```
- **Fix:** If `result.data` is null/undefined when `result.error` is falsy (which should be impossible given the preceding guard), this is masking a logic error in the service layer. Consider throwing an error instead of returning an empty object:
  ```typescript
  if (!result.data) throw new Error('Health check returned no data')
  return NextResponse.json(result.data, { ... })
  ```

### [CC-P9-A3-006] No input validation for `conversationFile` in parse endpoint
- **File:** app/api/conversations/parse/route.ts:14
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `conversationFile` value is extracted from the JSON body and passed directly to `parseConversationFile()` without validating it is a string or checking for path traversal patterns. If `parseConversationFile` reads from disk using this value, an attacker could potentially read arbitrary files (e.g., `../../etc/passwd`). The validation depends on the service layer, but the route layer should still validate the input type at minimum.
- **Evidence:**
  ```typescript
  const { conversationFile } = body
  const result = parseConversationFile(conversationFile)
  // no type check, no path validation
  ```
- **Fix:** Add type validation and consider path traversal checks:
  ```typescript
  if (!conversationFile || typeof conversationFile !== 'string') {
    return NextResponse.json({ error: 'conversationFile is required and must be a string' }, { status: 400 })
  }
  ```

### [CC-P9-A3-007] No validation on `encodedFile` parameter in conversation messages endpoint
- **File:** app/api/conversations/[file]/messages/route.ts:12
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `encodedFile` path parameter is passed directly to `getConversationMessages()` without validation. If this parameter is URL-decoded to a file path, it could allow path traversal. While Next.js does URL-decode path parameters, the `[file]` segment is user-controlled.
- **Evidence:**
  ```typescript
  const { file: encodedFile } = await params
  const agentId = request.nextUrl.searchParams.get('agentId') || ''
  const result = await getConversationMessages(encodedFile, agentId)
  ```
- **Fix:** Add validation to ensure `encodedFile` does not contain path traversal sequences (`..`, `/`, etc.) or validate it matches an expected filename pattern.

### [CC-P9-A3-008] `checkIdleStatus` exceptions not wrapped in service result pattern
- **File:** app/api/sessions/[id]/command/route.ts:75
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The GET handler calls `checkIdleStatus(sessionName)` directly and wraps the result in `{ success: true, ...data }`. Unlike the POST handler which checks `result.error`, this assumes `checkIdleStatus` always succeeds (only catching via the outer try/catch). If the service throws, it falls through to a generic 500 error that loses structured error info. This is inconsistent with the POST handler's use of the service result pattern.
- **Evidence:**
  ```typescript
  const data = await checkIdleStatus(sessionName)
  return NextResponse.json({ success: true, ...data })
  ```
- **Fix:** Update `checkIdleStatus` to return a service result, or handle its potential error states explicitly.

### [CC-P9-A3-009] Missing `dynamic = 'force-dynamic'` on several routes that read runtime state
- **File:** Multiple files
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** Several routes read from runtime filesystem state (registries, message stores) but do not export `dynamic = 'force-dynamic'`. During Next.js production builds, these routes could be statically generated and cached, returning stale data. Affected routes include:
  - `app/api/conversations/[file]/messages/route.ts`
  - `app/api/conversations/parse/route.ts`
  - `app/api/domains/route.ts`
  - `app/api/domains/[id]/route.ts`
  - `app/api/webhooks/route.ts`
  - `app/api/webhooks/[id]/route.ts`
  - `app/api/webhooks/[id]/test/route.ts`
  - `app/api/messages/route.ts`
  - `app/api/messages/forward/route.ts`
  - `app/api/messages/meeting/route.ts`

  Routes that already have `dynamic = 'force-dynamic'`: hosts/*, sessions/*, meetings/route.ts, etc.
- **Evidence:** Missing `export const dynamic = 'force-dynamic'` in affected route files.
- **Fix:** Add `export const dynamic = 'force-dynamic'` to all routes that read from runtime state (filesystem, in-memory stores, tmux).

### [CC-P9-A3-010] Session `name` not validated for tmux naming constraints in create endpoint
- **File:** app/api/sessions/create/route.ts:17-26
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The session creation endpoint validates `workingDirectory` is absolute (line 13) but does not validate `body.name` against tmux session naming constraints (`^[a-zA-Z0-9_-]+$` as documented in CLAUDE.md). An invalid session name passed to tmux could cause `tmux new-session` to fail silently or, if it contains shell metacharacters, lead to command injection in the service layer (depending on how `createSession` constructs the tmux command).
- **Evidence:**
  ```typescript
  const result = await createSession({
    name: body.name,  // no validation on name format
    workingDirectory: body.workingDirectory,
    // ...
  })
  ```
- **Fix:** Add name validation:
  ```typescript
  if (body.name && !/^[a-zA-Z0-9_-]+$/.test(body.name)) {
    return NextResponse.json({ error: 'Session name must be alphanumeric with hyphens/underscores only' }, { status: 400 })
  }
  ```

### [CC-P9-A3-011] `newName` not validated in session rename endpoint
- **File:** app/api/sessions/[id]/rename/route.ts:32
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The rename endpoint extracts `newName` from the request body without validating it exists or matches tmux naming constraints. If `newName` is undefined, the `renameSession(oldName, undefined)` call passes an undefined value to the service. If it contains invalid characters, it could cause tmux command failures or injection.
- **Evidence:**
  ```typescript
  const { newName } = jsonBody
  const result = await renameSession(oldName, newName)
  // no validation on newName
  ```
- **Fix:** Validate `newName`:
  ```typescript
  if (!newName || typeof newName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(newName)) {
    return NextResponse.json({ error: 'newName is required and must be alphanumeric with hyphens/underscores' }, { status: 400 })
  }
  ```

### [CC-P9-A3-012] `body.command` not validated before passing to tmux send-keys
- **File:** app/api/sessions/[id]/command/route.ts:34
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The command endpoint passes `body.command` directly to `sendCommand()` without checking it is a non-empty string. If the service layer constructs a tmux `send-keys` command using this value without proper sanitization, this could be a command injection vector. Even if sanitization happens in the service, the route should validate input type.
- **Evidence:**
  ```typescript
  const result = await sendCommand(sessionName, body.command, {
    requireIdle: body.requireIdle,
    addNewline: body.addNewline,
  })
  ```
- **Fix:** Add basic validation:
  ```typescript
  if (!body.command || typeof body.command !== 'string') {
    return NextResponse.json({ error: 'command is required and must be a string' }, { status: 400 })
  }
  ```


### [CC-P9-A5-004] messageQueue.ts deleteMessage has no lock protection for concurrent access
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:857-868
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `deleteMessage()` calls `findMessagePath()` (which resolves the agent and finds the file) and then calls `fs.unlink()` without any lock. Unlike `markMessageAsRead` (line 777) and `archiveMessage` (line 828) which both use `withLock('msg-${messageId}')`, deleteMessage has no lock. If a concurrent `markMessageAsRead` or `archiveMessage` is writing to the same file, the delete could race with the write, potentially causing an error on the write side (ENOENT after unlink) or deleting a file that was just updated.
- **Evidence:**
```typescript
// Lines 857-868
export async function deleteMessage(agentIdentifier: string, messageId: string): Promise<boolean> {
  const messagePath = await findMessagePath(agentIdentifier, messageId, 'inbox')
  if (!messagePath) return false

  try {
    await fs.unlink(messagePath)  // No lock!
    return true
  } catch (error) {
    return false
  }
}
```
- **Fix:** Wrap the unlink in `withLock('msg-${messageId}', async () => { ... })` to match the pattern used by `markMessageAsRead` and `archiveMessage`.

### [CC-P9-A5-005] governance-peers.ts savePeerGovernance has no file lock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-peers.ts:60-68
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `savePeerGovernance()` writes to `~/.aimaestro/governance-peers/{hostId}.json` using atomic write (temp+rename), but without any lock. If two governance sync messages arrive from the same peer simultaneously, both will write to the same file. The atomic rename prevents corruption, but the last writer wins, potentially losing the earlier update if it contained newer data. Unlike other registries that use `withLock`, peer governance writes are unprotected.
- **Evidence:**
```typescript
// Lines 60-68
export function savePeerGovernance(hostId: string, state: GovernancePeerState): void {
  validateHostId(hostId)
  ensurePeersDir()
  const filePath = path.join(PEERS_DIR, `${hostId}.json`)
  const tmpFile = `${filePath}.tmp.${process.pid}`
  writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8')
  renameSync(tmpFile, filePath)
}
```
- **Fix:** Use `withLock('governance-peers-' + hostId, ...)` to serialize writes per peer host.

### [CC-P9-A5-006] message-filter.ts passes alias strings into checkMessageAllowed where UUIDs are expected
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:180-187
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `sendFromUI()`, when the recipient cannot be resolved to an agent, the code falls back to using `toResolved.alias` as `recipientAgentId` for the message filter (line 180). The message filter (`checkMessageAllowed`) then checks `closedTeams.some(t => t.agentIds.includes(recipientAgentId))` -- but `agentIds` contains UUIDs, not aliases. This means the filter will never find an alias in the agentIds array, so the closed-team check always passes for unresolved recipients. The Step 1b guard (line 92-98 in message-filter.ts) partially mitigates this by checking `isValidUuid(recipientAgentId)` and denying from closed-team senders, but open-world senders can still message into closed teams when the recipient is known only by alias.
- **Evidence:**
```typescript
// message-send.ts:180-187
const recipientIdForFilter = toResolved.agentId || toResolved.alias  // May be an alias, not UUID
if (!recipientIdForFilter) { throw... }
const filterResult = checkMessageAllowed({
  senderAgentId: fromAgent?.agentId || null,
  recipientAgentId: recipientIdForFilter,  // Could be "backend-api" not a UUID
})
```
- **Fix:** When the recipient cannot be resolved to an agent with a UUID, the message filter should be aware it's dealing with an alias and apply stricter rules (deny if sender is in a closed team, or attempt resolution within the filter itself).

### [CC-P9-A5-007] hosts-config.ts caches hosts but never invalidates on file change
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:236
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `cachedHosts` (line 236) is set once and never invalidated unless `updateHosts()` or `addHost()` is called through the module's own API. If another process or the user manually edits `~/.aimaestro/hosts.json`, the cache will be stale for the lifetime of the process. Other caches in the codebase (like `_apiKeysCache` in amp-auth.ts) have a TTL mechanism. The hosts cache has none. This can cause mesh routing failures when hosts are added/removed externally.
- **Evidence:**
```typescript
// Line 236
let cachedHosts: Host[] | null = null
// Only cleared in updateHosts() and other write functions, never on TTL
```
- **Fix:** Add a mtime-based cache invalidation (check file stat before returning cached value) or a TTL similar to `_apiKeysCache`.

### [CC-P9-A5-008] amp-auth.ts _loadApiKeysRaw returns empty array on error without caching it
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:73-76
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `_loadApiKeysRaw()` catches a JSON parse or read error (line 73-76), it returns `[]` but does not set `_apiKeysCache = []` or update `_apiKeysCacheTimestamp`. This means every subsequent call within the TTL window will re-read the broken file from disk and re-throw/re-catch the error, creating unnecessary I/O and error log spam. In contrast, the successful path (line 70-72) does cache the result.
- **Evidence:**
```typescript
// Lines 73-76
} catch (error) {
    console.error('[AMP Auth] Failed to load API keys:', error)
    return []  // Not cached -- will re-attempt on every call
  }
```
- **Fix:** On error, set `_apiKeysCache = []` and `_apiKeysCacheTimestamp = now` to cache the empty result and prevent repeated I/O on a broken file. Consider also backing up and healing the file (matching governance.ts pattern).

### [CC-P9-A5-009] task-registry.ts saveTasks returns false on error but callers inside withLock don't check
- **File:** /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:49-63 and 131
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `saveTasks()` catches errors and returns `false` instead of throwing (line 59-62). However, all callers inside `withLock` (e.g., `createTask` line 131, `updateTask` line 193, `deleteTask` line 213) ignore the return value. If `saveTasks` fails, the task object is returned to the caller as if it was successfully persisted, but it was not. The caller (API route) will return a 200 success to the client with the unsaved data.
- **Evidence:**
```typescript
// task-registry.ts:131 inside createTask's withLock
tasks.push(task)
saveTasks(data.teamId, tasks)  // Return value ignored -- could be false
return task  // Returns task to caller as if persisted
```
- **Fix:** Either have `saveTasks` throw on error (removing the try/catch) so `withLock` propagates the error, or check the return value and throw if false. The same applies to `saveDocuments` in document-registry.ts.

### [CC-P9-A5-010] document-registry.ts saveDocuments returns false on error but callers ignore it
- **File:** /Users/emanuelesabetta/ai-maestro/lib/document-registry.ts:48-62 and 92
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P9-A5-009 but for `saveDocuments()`. All callers within `withLock` (createDocument line 92, updateDocument line 113, deleteDocument line 123) ignore the return value.
- **Evidence:**
```typescript
// document-registry.ts:92 inside createDocument's withLock
documents.push(doc)
saveDocuments(data.teamId, documents)  // Return value ignored
return doc
```
- **Fix:** Either throw on failure in `saveDocuments` or check the return value in callers.

### [CC-P9-A5-011] messageQueue.ts getSentCount loads ALL messages just to count them
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:731-734
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `getSentCount()` calls `listSentMessages()` which reads, parses, and converts every message file in the sent directory, sorts them, applies filters, deduplicates -- then counts the result with `.length`. Similarly `getUnreadCount()` (line 873-876) loads all inbox messages. For agents with many messages, this is very inefficient when only a count is needed.
- **Evidence:**
```typescript
// Lines 731-734
export async function getSentCount(agentIdentifier: string): Promise<number> {
  const messages = await listSentMessages(agentIdentifier)
  return messages.length
}
```
- **Fix:** Add an optimized count function that walks the directory and counts JSON files without parsing their contents. Or at minimum, pass `{ limit: 0, previewLength: 0 }` to avoid preview extraction.


### [CC-P9-A8-001] use-governance-hook.test.ts tests standalone replicas, not actual hook code
- **File:** /Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:41-112
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The test file explicitly declares (line 25-34) that it tests standalone function replicas of the `useGovernance` hook's `submitConfigRequest` and `resolveConfigRequest` callbacks, NOT the actual hook. This means if the actual hook implementation drifts from these replicas, the tests will still pass but the real code will be wrong. The test file acknowledges this limitation (MF-027) and notes that `refresh()` side-effects, React state updates, and `useCallback` memoization are NOT tested.
- **Evidence:**
```typescript
// lines 25-34
// MF-027 KNOWN LIMITATION: These tests exercise standalone replicas of the
// hook's submitConfigRequest and resolveConfigRequest callbacks, NOT the actual
// useGovernance hook. This means:
//   1. The refresh() side-effect after successful operations is NOT tested.
//   2. React state updates (loading, error) are NOT tested.
//   3. Memoization via useCallback is NOT tested.
```
- **Fix:** This is a known limitation documented in the file. The proper fix requires adding `@testing-library/react` (or `@testing-library/react-hooks`) to the project's test dependencies so the actual React hook can be rendered and tested. Until then, the replica pattern is the best available approach but should be regularly diffed against the real hook to detect drift.

### [CC-P9-A8-002] governance-peers.test.ts dual-export mock pattern creates inconsistent function references
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance-peers.test.ts:33-88
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The fs mock exports named functions AND a `default` object with duplicated implementations. Both share the same `fsStore`, but the named exports and default exports are separate `vi.fn()` instances. This means `vi.clearAllMocks()` resets call counts on both, but if production code uses a mix of named and default imports, the mock call assertions could be misleading. The comment at line 30-32 explains this is intentional ("NT-003: Dual export mock pattern"), but the mock functions are not shared references -- they are independent vi.fn() wrappers, so calling `vi.mocked(fs.default.existsSync)` and `vi.mocked(existsSync)` would show different call counts.
- **Evidence:**
```typescript
// lines 35-36 (named export)
existsSync: vi.fn((filePath: string) => filePath in fsStore),
// lines 63-64 (default export, separate vi.fn)
existsSync: vi.fn((filePath: string) => filePath in fsStore),
```
- **Fix:** Consider using shared function references between named and default exports to avoid potential assertion confusion. For example: define `const mockExistsSync = vi.fn(...)` once and use it in both the named export and `default.existsSync`.

### [CC-P9-A8-003] agent-config-governance-extended.test.ts does not restore globalThis.fetch on error paths
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts:380-447
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `globalThis.fetch` is overridden in `beforeEach` (line 442) and restored in `afterEach` (line 446). However, if a test throws an unhandled error between these lifecycle hooks, `afterEach` may not run reliably in all test runners, leaving `fetch` mocked for subsequent test files. While Vitest typically runs afterEach even on failures, this pattern is fragile.
- **Evidence:**
```typescript
// line 380
const originalFetch = globalThis.fetch
// line 442
globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
// line 446
globalThis.fetch = originalFetch
```
- **Fix:** Use `vi.stubGlobal('fetch', ...)` instead, which integrates with Vitest's mock lifecycle and is automatically restored by `vi.restoreAllMocks()`. Alternatively, use `vi.spyOn(globalThis, 'fetch')` which also auto-restores.

### [CC-P9-A8-004] task-registry.test.ts empty string assigneeAgentId test relies on implementation detail
- **File:** /Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts:241-245
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test at line 241 verifies that `createTask` with `assigneeAgentId: ''` preserves the empty string because "Source uses `??` not `||`". This tests an implementation detail (nullish coalescing behavior) rather than a documented API contract. If the implementation switches to `||` (which would convert `''` to `null`), this test would fail but the behavior change might actually be desirable. The test comment correctly documents the current behavior but the empty-string case should ideally be treated as equivalent to `null` (no assignee).
- **Evidence:**
```typescript
it('keeps empty string assigneeAgentId as-is (nullish coalescing does not convert empty string)', async () => {
    const task = await createTask({ teamId: TEAM_1, subject: 'Test', assigneeAgentId: '' })
    expect(task.assigneeAgentId).toBe('')
})
```
- **Fix:** If empty-string assigneeAgentId is not a valid use case, the source code should normalize it to `null` using `||` instead of `??`, and this test should be updated to expect `null`. If empty string IS valid, document why in the type definition.


### [CC-P9-A9-003] `bump-version.sh` regex replacement on `ai-index.html` may match wrong patterns
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:190-202
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** Lines 190-193 and 197-202 perform sed replacements on `ai-index.html` matching patterns like `<strong>Version:</strong> 0.26.0 (Month Year)`. The regex `[A-Za-z]* [0-9]*` is used to match the month-year string. However, this regex uses `*` (zero or more), meaning it could match zero characters for the month or year, potentially matching `<strong>Version:</strong> 0.26.0 ()` or `<strong>Version:</strong> 0.26.0  0`. A more precise regex would use `+` (one or more): `[A-Za-z][A-Za-z]* [0-9][0-9]*` to ensure at least one character of each.
- **Evidence:**
  ```bash
  _sed_inplace "$PROJECT_ROOT/docs/ai-index.html" \
      "s|<strong>Version:</strong> $CURRENT_VERSION_RE ([A-Za-z]* [0-9]*)|<strong>Version:</strong> $NEW_VERSION ($MONTH_YEAR)|g"
  ```
- **Fix:** Use `[A-Za-z][A-Za-z]* [0-9][0-9]*` instead of `[A-Za-z]* [0-9]*` to avoid zero-length matches.

### [CC-P9-A9-004] `update-aimaestro.sh` line 119: `git status --porcelain` may include untracked files in docs_dev causing false "uncommitted changes" warning
- **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:119
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `git status --porcelain` includes untracked files (prefixed with `??`), which means the presence of any untracked file (even in gitignored directories that aren't yet in `.gitignore`) will trigger the "uncommitted changes" warning and offer to stash. `git stash` does NOT stash untracked files by default, so the "stash and continue" option would still leave the untracked files, and `git status --porcelain` would still be non-empty. This could cause issues if git pull encounters untracked files that conflict with incoming tracked files.
- **Evidence:**
  ```bash
  if [ -n "$(git status --porcelain)" ]; then
      print_warning "You have uncommitted changes in your working directory"
  ```
- **Fix:** Use `git status --porcelain --untracked-files=no` if the intent is to detect only tracked-file changes, or use `git stash push -u` (with `-u` for untracked) if untracked files should also be stashed.

### [CC-P9-A9-005] `amp-send.sh` sign_message trap collision with set -e
- **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-helper.sh:737-739
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The `sign_message` function uses `trap 'rm -f "$tmp_msg" "$tmp_sig"' RETURN` to clean up temp files. However, if `sign_message` is called multiple times in the same shell session (which it is in amp-send.sh -- once for local signing at line 320, and potentially again for external re-signing at line 658), the second `trap RETURN` **replaces** the first one's variables. This is fine since each call uses its own local variables. However, the `verify_signature` function at line 755 also sets `trap ... RETURN` with the same pattern. If these functions call each other (they don't currently), there would be a trap conflict. The real issue is that `trap ... RETURN` in a function under `set -e` might not fire if the function exits due to a command failure. On bash 4.x+, RETURN traps fire on function exit regardless, but on older bash this behavior is inconsistent.
- **Evidence:**
  ```bash
  sign_message() {
      # ...
      local tmp_msg=$(mktemp)
      local tmp_sig=$(mktemp)
      trap 'rm -f "$tmp_msg" "$tmp_sig"' RETURN
  ```
- **Fix:** Use a subshell or explicit cleanup in all code paths rather than relying on `trap RETURN`:
  ```bash
  sign_message() {
      local tmp_msg=$(mktemp)
      local tmp_sig=$(mktemp)
      # ... signing logic ...
      local result=$?
      rm -f "$tmp_msg" "$tmp_sig"
      return $result
  }
  ```

### [CC-P9-A9-006] `server.mjs` WebSocket message handler registers duplicate event listeners on retry
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:486-540
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `handleRemoteWorker`, when the workerWs `open` event fires, event listeners are registered on `clientWs` (lines 488, 526, 534). However, if the worker disconnects and the function retries (lines 548-552), a NEW `workerWs` is created, and when it connects, NEW listeners are added to `clientWs` again. The old `clientWs.on('message')` listener from the first attempt is never removed, so the clientWs now has two 'message' handlers -- one forwarding to the dead workerWs and one to the new workerWs. The dead one would fail silently (readyState check at line 489), but it's a resource leak. More critically, the `clientWs.on('close')` listener at line 526 sets `clientClosed = true`, which is already registered from the outer scope at line 568. After a retry, there would be two close handlers.
- **Evidence:**
  ```javascript
  workerWs.on('open', () => {
      // ...
      // These get re-registered on every retry:
      clientWs.on('message', (data) => { ... })  // line 488
      clientWs.on('close', () => { ... })         // line 526
      clientWs.on('error', (error) => { ... })    // line 534
  ```
- **Fix:** Either (a) register the clientWs event listeners once, outside the `attemptConnection` function, using a mutable `workerWs` reference, or (b) remove old listeners before adding new ones on retry, or (c) guard the inner registration with a `listenersRegistered` flag.

### [CC-P9-A9-007] `remote-install.sh` portable_sed receives all sed args including the file, making it pass the file path to sed twice
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:327-330
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** Same root cause as CC-P9-A9-001 but noting a different consequence: `sed -i.bak "$@"` expands to `sed -i.bak <expression> <file>`, which works correctly because sed treats the first non-option arg as the script and the second as the file. HOWEVER, the pattern breaks if the expression itself contains an argument that looks like a file path (e.g., if someone passes a sed expression like `s|/old/path|/new/path|`). This is already in use at line 1065 with `s|AIMAESTRO_API=.*|AIMAESTRO_API=http://127.0.0.1:${PORT}|` which contains slashes. This works because `|` is the delimiter, but if someone uses `/` as delimiter, it would break. Merging with CC-P9-A9-001 as the same fix applies.
- **Evidence:** See CC-P9-A9-001
- **Fix:** See CC-P9-A9-001

### [CC-P9-A9-008] `amp-inbox.sh` processes empty `$MESSAGES` JSON as having `COUNT` of `null`
- **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-inbox.sh:89-93
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** If `list_inbox` returns empty output (e.g., due to a jq error rather than returning `"[]"`), then `COUNT=$(echo "$MESSAGES" | jq 'length')` would produce `null` rather than `0`. The subsequent `-eq 0` comparison at line 109 would fail with a bash arithmetic error like `[: null: integer expression expected`. The `list_inbox` function in amp-helper.sh does return `"[]"` for empty cases (lines 1084, 1109), so this would only trigger on jq failure. Still, defensive coding should handle this.
- **Evidence:**
  ```bash
  MESSAGES=$(list_inbox "$STATUS_FILTER")
  COUNT=$(echo "$MESSAGES" | jq 'length')
  # If MESSAGES is empty string or invalid JSON, COUNT could be "null" or empty
  # Line 109:
  if [ "$COUNT" -eq 0 ]; then  # bash error if COUNT is "null"
  ```
- **Fix:** Add a fallback: `COUNT=$(echo "$MESSAGES" | jq 'length' 2>/dev/null || echo "0")` and/or validate that MESSAGES is valid JSON before proceeding.


### [CC-P9-A6-004] useGovernance: refresh() has empty dependency array but closes over nothing -- callers pass no signal on mutation-triggered refreshes
- **File:** hooks/useGovernance.ts:170-215 (mutation callbacks)
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** After each mutation (setPassword, assignManager, etc.), `refresh()` is called without an AbortSignal. This means these fire-and-forget refreshes cannot be cancelled if the component unmounts during the fetch. The `isMountedRef` guard at line 116 provides partial protection against setState-after-unmount, but the fetch itself continues to completion, wasting network resources. The code comments (CC-002) acknowledge this is intentional, but it is still a resource leak.
- **Evidence:**
  ```tsx
  refresh() // CC-002: Intentionally fire-and-forget
  ```
- **Fix:** Consider passing the existing AbortController's signal or creating a new one that is aborted on unmount. The `isMountedRef` guard mitigates crashes but not wasted network calls.

### [CC-P9-A6-005] useWebSocket: connect() referenced in reconnect timeout creates recursive closure but is stable -- reconnect counter may not reset on sessionId change
- **File:** hooks/useWebSocket.ts:202-216
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `useEffect` at line 202 calls `disconnect()` (which resets `reconnectAttemptsRef.current = 0`) then `connect()` when deps change. However, `connect` and `disconnect` are not in the dependency array (they are memoized with `useCallback`). The eslint-disable comment suppresses this. The issue: if `connect` or `disconnect` identity changes (unlikely given stable useCallback deps), the effect would use stale versions. Currently safe but fragile.
- **Evidence:**
  ```tsx
  useEffect(() => {
    if (autoConnect) {
      connect()
    } else {
      disconnect()
    }
    return () => { disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, hostId, socketPath, autoConnect])
  ```
- **Fix:** Add `connect` and `disconnect` to the dependency array. Since they are stable (memoized with `useCallback` with stable or empty deps), this won't cause extra renders but removes the eslint suppression and makes the code self-documenting.

### [CC-P9-A6-006] MeetingRoom: AGENT_JOINED can add duplicate agentIds to joinedAgentIds array
- **File:** components/team-meeting/MeetingRoom.tsx:99-103
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `AGENT_JOINED` reducer case blindly appends the agentId without checking if it is already in `joinedAgentIds`. If the `RingingAnimation` component fires `onAgentJoined` twice for the same agent (e.g., due to a re-render or animation replay), the same agentId appears multiple times in the array.
- **Evidence:**
  ```tsx
  case 'AGENT_JOINED':
    return {
      ...state,
      joinedAgentIds: [...state.joinedAgentIds, action.agentId],
    }
  ```
- **Fix:** Add a dedup check: `state.joinedAgentIds.includes(action.agentId) ? state : { ...state, joinedAgentIds: [...state.joinedAgentIds, action.agentId] }`

### [CC-P9-A6-007] TerminalView: localStorage writes for notes/collapsed lack try/catch
- **File:** components/TerminalView.tsx (notes persistence section, approximately lines 500+)
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** While localStorage *reads* are correctly wrapped in try/catch (SF-018, SF-026), localStorage *writes* for notes and collapsed state may throw in private browsing mode or when storage is full. The reads at initialization are guarded but the corresponding writes when the user types notes or toggles collapse are not consistently guarded.
- **Fix:** Wrap all `localStorage.setItem()` calls for notes, collapsed state, and footer tab in try/catch blocks.

### [CC-P9-A6-008] useTeam: optimistic update does not include `type` in safeUpdates, may drop team type on server response failure
- **File:** hooks/useTeam.ts:61-65
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `validKeys` array includes `'type'`, which is correct. However, the `updateTeam` function signature only accepts `{ name?, description?, agentIds?, instructions? }` -- it does not include `type`. If a caller somehow passes `type` in the updates object, it would be filtered through `validKeys` but TypeScript would flag it. The concern is that the optimistic update at line 65 spreads `safeUpdates` into the team state: `{ ...prev, ...safeUpdates, updatedAt: new Date().toISOString() }`. If the server response at line 78 (`data.team`) has a different `type` than the optimistic update, the team type will flash between values. This is benign for the current callers, but the mismatch between the TypeScript signature and `validKeys` is confusing.
- **Evidence:**
  ```tsx
  const validKeys = ['name', 'description', 'type', 'agentIds', 'chiefOfStaffId', 'managerId', 'instructions'] as const
  // But the function signature only accepts: { name?, description?, agentIds?, instructions? }
  ```
- **Fix:** Either remove `'type'`, `'chiefOfStaffId'`, `'managerId'` from `validKeys` (since they are not in the function signature), or expand the function signature to match.

### [CC-P9-A6-009] RoleAssignmentDialog: COS assignment to new teams is sequential, not parallel
- **File:** components/governance/RoleAssignmentDialog.tsx:232-235
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When assigning COS to new teams, the code uses a sequential `for...of` loop instead of `Promise.all` or `Promise.allSettled` (which is used for COS *removal* at lines 173-184). This means each team assignment waits for the previous one to complete, making the operation slow for multiple teams. More importantly, if one fails partway through, some teams will have the COS assigned and some won't, with no rollback.
- **Evidence:**
  ```tsx
  // Sequential (slow, partial failure risk):
  for (const teamId of newTeamIds) {
    const result = await governance.assignCOS(teamId, agentId, password)
    if (!result.success) throw new Error(result.error || 'Failed to assign chief-of-staff')
  }
  ```
- **Fix:** Use `Promise.allSettled` for parallel execution with partial failure reporting, consistent with the COS removal pattern used elsewhere in this same component.


### [CC-P9-A0-006] email-index GET route lacks try-catch for error resilience
- **File:** `app/api/agents/email-index/route.ts`:15-29
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `GET` handler for `/api/agents/email-index` does not have a try-catch. Unlike the directory routes (which are internal-only), this route is described as "used by external gateways to build routing tables" -- an unhandled throw here would return a non-JSON error to external consumers.
- **Evidence:**
```typescript
// line 15-29
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await queryEmailIndex({ ... })
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch returning JSON 500 error.

### [CC-P9-A0-007] `address` path parameter in AMP/email address routes not validated/sanitized
- **File:** `app/api/agents/[id]/amp/addresses/[address]/route.ts`:18 and `app/api/agents/[id]/email/addresses/[address]/route.ts`:18
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `[address]` path parameter is extracted from params and passed directly to service functions without any format validation or sanitization. While the `[id]` parameter is validated as UUID, the `[address]` parameter (which could contain URL-encoded special characters) is passed through without checks. If the service layer uses it in file paths or shell commands, this could be an injection vector.
- **Evidence:**
```typescript
// amp/addresses/[address]/route.ts line 18
const { id, address } = await params
// id is validated:
if (!isValidUuid(id)) { ... }
// address is NOT validated -- passed directly:
const result = getAMPAddress(id, address)
```
- **Fix:** Add basic format validation for the `address` parameter (e.g., email format regex) before passing to service functions.

### [CC-P9-A0-008] `messageId` path parameter not validated
- **File:** `app/api/agents/[id]/messages/[messageId]/route.ts`:22,57,89,117
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `messageId` path parameter is used in GET, PATCH, DELETE, and POST handlers but is never validated. While `id` is validated as UUID, `messageId` is passed directly to service functions. If the messaging service uses `messageId` in file path construction, this could be a path traversal vector.
- **Evidence:**
```typescript
// line 22
const { id, messageId } = await params
if (!isValidUuid(id)) { ... }  // id validated
// messageId NOT validated -- passed directly to:
const result = await getMessage(id, messageId, box)
```
- **Fix:** If `messageId` should be a UUID, validate it with `isValidUuid()`. If it has a different format, add appropriate format validation.

### [CC-P9-A0-009] Inconsistent error response shapes across routes
- **File:** Multiple files
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Error responses have inconsistent shapes across routes. Some use `{ error: '...' }`, some use `{ success: false, error: '...' }`, and some use `{ success: false, status: 'failed', error: '...' }`. This makes it hard for clients to handle errors uniformly.
  - `chat/route.ts` line 31: `{ success: false, error: result.error }`
  - `route.ts` (agents root) line 32: `{ error: result.error, agents: [] }`
  - `memory/consolidate/route.ts` line 67-68: `{ success: false, status: 'failed', error: result.error }`
  - `database/route.ts` line 22: `{ error: result.error }`
  - `metadata/route.ts` line 60: `{ metadata: agent.metadata }` (success case with no `success` field)
- **Evidence:** See files listed above.
- **Fix:** Standardize error response shape. Recommend `{ error: string }` for errors and include `success` only if it was part of the original API design.

### [CC-P9-A0-010] `bm25Weight` and `semanticWeight` in search route not NaN-guarded
- **File:** `app/api/agents/[id]/search/route.ts`:56-57
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** While `limit`, `minScore`, `startTs`, and `endTs` have NaN guards (checking `Number.isNaN()` before using the parsed value), `bm25Weight` and `semanticWeight` do not. If a user passes `?bm25Weight=abc`, `parseFloat('abc')` returns `NaN`, which would be passed to the service function.
- **Evidence:**
```typescript
// line 56-57
bm25Weight: searchParams.get('bm25Weight') ? parseFloat(searchParams.get('bm25Weight')!) : undefined,
semanticWeight: searchParams.get('semanticWeight') ? parseFloat(searchParams.get('semanticWeight')!) : undefined,
```
- **Fix:** Add NaN guards consistent with the other parameters:
```typescript
bm25Weight: searchParams.get('bm25Weight')
  ? (Number.isNaN(parseFloat(searchParams.get('bm25Weight')!)) ? undefined : parseFloat(searchParams.get('bm25Weight')!))
  : undefined,
```

### [CC-P9-A0-011] `by-name` route has no input validation on the `name` parameter
- **File:** `app/api/agents/by-name/[name]/route.ts`:13
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `name` path parameter is passed directly to `lookupAgentByName()` without any validation. tmux session names should match `^[a-zA-Z0-9_-]+$` (as documented in CLAUDE.md). If the service layer uses this name for tmux commands or file operations, a crafted name could be problematic.
- **Evidence:**
```typescript
// line 13-14
const { name } = await params
const result = lookupAgentByName(name)
```
- **Fix:** Add format validation for the `name` parameter, e.g., `if (!/^[a-zA-Z0-9_-]+$/.test(name)) return 400`.

### [CC-P9-A0-012] `metadata` PATCH passes raw user JSON directly to updateAgent as metadata
- **File:** `app/api/agents/[id]/metadata/route.ts`:50-54
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The PATCH handler reads the full JSON body and passes it directly as the `metadata` property to `updateAgent()`. There is no schema validation, no depth limit, and no size limit. An attacker could send a deeply nested or very large JSON object, potentially causing DoS or storage issues.
- **Evidence:**
```typescript
// line 50-54
let metadata
try { metadata = await request.json() } catch { ... }
const agent = await updateAgent(agentId, { metadata })
```
- **Fix:** Add basic validation: check that metadata is a plain object (not an array), has reasonable depth/size, and key names are strings.


### [CC-P9-A1-002] Transfer resolve: `auth.status` may be undefined, fallback to 401 may mask real status
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:32
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `AgentAuthResult` interface defines `status?: number` (optional). On line 32:
  ```typescript
  return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  ```
  The `|| 401` fallback is correct for the case where `status` is undefined, but if `authenticateAgent` returns `status: 0` (which would be a bug in the auth module), it would also fall through to 401 due to JavaScript's falsy evaluation of 0. The same pattern appears in `transfers/route.ts:60`.

  While `status: 0` is not a realistic HTTP status code, using nullish coalescing (`??`) instead of `||` would be more precise and defensive.
- **Evidence:**
  ```typescript
  // transfers/[id]/resolve/route.ts:32
  return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  // transfers/route.ts:60
  return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  ```
- **Fix:** Replace `auth.status || 401` with `auth.status ?? 401` in both locations.

### [CC-P9-A1-003] Governance GET route: `getAgent()` may return object without `.name` -- `managerName` coalesces to null
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts`:12
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** On line 12:
  ```typescript
  const managerName = config.managerId ? getAgent(config.managerId)?.name || null : null
  ```
  If `getAgent()` returns an agent object whose `.name` is an empty string `""`, the `||` operator will coalesce it to `null` because empty string is falsy. This may hide agents with empty names. The manager POST route at `manager/route.ts:60` uses `agent.name || agent.alias`, which also has the same empty-string issue but at least falls back to alias.

  The GET route does not fall back to alias, so a manager with `name: ""` but a valid `alias` would show `managerName: null` in the GET response while the POST response would show the alias.
- **Evidence:**
  ```typescript
  // route.ts:12 (GET)
  const managerName = config.managerId ? getAgent(config.managerId)?.name || null : null
  // manager/route.ts:60 (POST)
  return NextResponse.json({ success: true, managerId: agentId, managerName: agent.name || agent.alias })
  ```
- **Fix:** Use the same fallback pattern in both routes: `getAgent(config.managerId)?.name || getAgent(config.managerId)?.alias || null`, or better, extract the agent once and apply the fallback consistently.

### [CC-P9-A1-004] Governance requests POST: Missing top-level try/catch for local submission path
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts`:89-128
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `POST` handler has two paths: remote receive (lines 45-87, wrapped in try/catch) and local submission (lines 89-128). The local submission path has its own try/catch around `submitCrossHostRequest` (lines 119-128), but the validation code on lines 89-116 runs **outside any try/catch**. If any of these validation lines throw an unexpected error (e.g., `body.payload` throws a getter trap from a Proxy, or `VALID_REQUESTED_BY_ROLES.has()` receives an unexpected type), the error would bubble up as an unhandled exception, causing a 500 with stack trace leak (Next.js would catch it but with less controlled error formatting).

  The remote receive path correctly wraps everything in try/catch (lines 46-86), but the local path has a gap.
- **Evidence:**
  ```typescript
  // Line 89-116: validation code outside try/catch
  if (!body.type || typeof body.type !== 'string') { ... }
  // ...many more validations...

  // Line 119: try/catch only starts here
  try {
    const result = await submitCrossHostRequest(body)
  ```
- **Fix:** Wrap the entire local submission path (lines 89-128) in a try/catch, or move the validation inside the existing try/catch block on line 119.

### [CC-P9-A1-005] Transfer resolve: `fromTeam!` and `toTeam!` non-null assertions after conditional checks
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:113,146
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Lines 113 and 146 use non-null assertions (`fromTeam!.id`, `toTeam!.id`) within `teams.find()` callbacks:
  ```typescript
  // Line 113
  t.type === 'closed' && t.id !== fromTeam!.id && t.id !== toTeam!.id && ...
  // Line 146
  const toIdx = teams.findIndex(t => t.id === toTeam!.id)
  ```
  While `fromTeam` is guaranteed non-null by the check on line 83, and `toTeam` is guaranteed non-null by the check on line 101 (for the approve path), these non-null assertions could become incorrect if future refactoring moves these checks. The `fromTeam` on line 113 references a variable declared on line 76 and validated on line 83, and `toTeam` validated on line 101 -- both are only accessible in the approve branch (line 97 `if (action === 'approve')`), so the assertions are currently correct but fragile.
- **Evidence:**
  ```typescript
  const otherClosedTeam = teams.find(t =>
    t.type === 'closed' && t.id !== fromTeam!.id && t.id !== toTeam!.id && t.agentIds.includes(agentId)
  )
  ```
- **Fix:** Consider narrowing the types earlier (e.g., re-assign to const with type guard after the null check) to avoid non-null assertions, or add a local const like `const validFromTeam = fromTeam` after the null check so TypeScript narrows the type.

### [CC-P9-A1-006] Governance requests GET: Reflected query parameter in error message (minor XSS vector in JSON API)
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts`:138,146
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** Lines 138 and 146 reflect user-provided query parameters directly in the JSON error response:
  ```typescript
  { error: `Invalid status value '${statusParam}'. Must be one of: ...` }
  { error: `Invalid type value '${typeParam}'. Must be one of: ...` }
  ```
  While these are JSON responses (not HTML), reflected values in API error messages can become attack vectors if:
  1. A frontend renders these error messages in HTML without escaping
  2. The values contain special characters that affect downstream JSON parsers

  The comment on line 137 explicitly acknowledges this: "NT-035: Reflecting validated statusParam in error is acceptable for Phase 1 JSON API (not rendered in HTML)." This is a deliberate trade-off, but worth noting the risk remains.
- **Evidence:** See lines 138, 146.
- **Fix:** Either sanitize/truncate the reflected values, or use a fixed error message that lists the valid values without echoing the input. Low priority given Phase 1 localhost-only context.


### [CV-001] Claim: "Deprecated alias: recordFailure -> recordAttempt in chief-of-staff route"
- **Source:** Commit 5525899, SHOULD-FIX section
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The canonical function is renamed to `recordAttempt` in `lib/rate-limit.ts:42`. The chief-of-staff route (`app/api/teams/[id]/chief-of-staff/route.ts:6`) correctly imports `recordAttempt`. A backward-compatible alias `recordFailure = recordAttempt` exists at `lib/rate-limit.ts:74`.
- **What's missing:** The old name `recordFailure` is still directly imported and used in 3 production files:
  - `services/headless-router.ts:245` -- imports `recordFailure`
  - `services/headless-router.ts:1645` -- calls `recordFailure(rateLimitKey)`
  - `services/governance-service.ts:499` -- calls `recordFailure('governance-trust-auth')`
  - `services/governance-service.ts:530` -- calls `recordFailure('governance-trust-auth')`
- **Impact:** Low -- the alias works correctly at runtime. But the rename is incomplete; callers still use the deprecated name. This is a cleanup NIT, not a runtime bug.

### [CV-002] Claim: "canApprove logic: check isManager || isCos in AgentSkillEditor"
- **Source:** Commit 5525899, SHOULD-FIX section
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The `canApprove` variable exists in `components/marketplace/AgentSkillEditor.tsx:85` and is used at line 334 to conditionally render approve/reject buttons. A Phase 2 TODO comment documents the intended logic at line 82-83.
- **What's missing:** `canApprove` is hardcoded to `true` (line 85). The claimed `isManager || isCos` check is **only in a comment** (line 83), not actual code. The commit message says "canApprove logic: check isManager || isCos" but the implementation is just `const canApprove = true` with a TODO comment.
- **Evidence:**
  ```typescript
  // AgentSkillEditor.tsx:81-85
  // NT-021: Phase 1 localhost bypass -- canApprove is always true for single-user mode.
  // Phase 2 TODO: Wire to governance role checks:
  //   const canApprove = agentRole === 'manager' || agentRole === 'chief-of-staff'
  // This requires passing the current user's role from the governance context.
  const canApprove = true
  ```
- **Impact:** In Phase 1 (single-user localhost), this is acceptable -- all users CAN approve. But the commit message implies the check was implemented, when it was only documented as a TODO. The claim is misleading.

### [CV-003] Claim: "ToxicSkills scan: add warning when scanner unavailable" [MF-008]
- **Source:** Commit 5525899, MUST-FIX section
- **Severity:** SHOULD-FIX (not MUST-FIX as claimed -- the warning IS present, but ToxicSkills itself is unimplemented)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** A `console.warn()` is present in `services/agents-config-deploy-service.ts:167` that explicitly warns skills are deployed WITHOUT ToxicSkills scan. The warning is clear and actionable.
- **What's missing:** The commit says "[MF-008] ToxicSkills scan: add warning when scanner unavailable" -- the warning IS added, so the fix IS implemented. However, the underlying scanner (`lib/toxic-skills.ts`) does not exist yet (line 164 says "to be created"). Skills are deployed without any content scanning.
- **Evidence:**
  ```typescript
  // agents-config-deploy-service.ts:162-167
  // MF-008: WARNING -- ToxicSkills scan is NOT implemented yet (Phase 2).
  // Deployed skills are NOT scanned for malicious content.
  // See lib/toxic-skills.ts (to be created).
  console.warn(`${LOG_PREFIX} WARNING: Skill "${skillName}" deployed WITHOUT ToxicSkills scan (not yet implemented). Skills are NOT checked for malicious content.`)
  ```
- **Impact:** The warning claim is VERIFIED. The scanner being unavailable is a known Phase 2 gap. The fix (adding a warning) IS correctly implemented. Marking partial because the MUST-FIX severity implies a security control, when it's just a log warning.

---


---

## Nits & Suggestions


### [CC-P9-A2-005] teams/route.ts GET does not use `dynamic = 'force-dynamic'`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`:1-17
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `teams/route.ts` file exports `dynamic = 'force-dynamic'` at line 6, but this only applies to the module as a whole. However, examining the file, it does have `export const dynamic = 'force-dynamic'` at line 6, so this is actually present. No issue here -- removing this finding.

_Retracted: teams/route.ts does have `dynamic = 'force-dynamic'` at line 6._

### [CC-P9-A2-005] chief-of-staff/route.ts error handler exposes internal error messages
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts`:110
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The catch-all error handler at line 110 returns `error.message` directly to the client for non-`TeamValidationException` errors. While this is a localhost-only Phase 1 app, in general practice this could leak internal implementation details (stack traces, file paths, dependency errors) to the client.
- **Evidence:**
  ```typescript
  // chief-of-staff/route.ts:110
  { error: error instanceof Error ? error.message : 'Failed to set chief-of-staff' }
  ```
- **Fix:** For Phase 2 remote access, replace with a generic error message and log the details server-side only. For Phase 1, this is acceptable but worth noting.

### [CC-P9-A2-006] Missing `export const dynamic = 'force-dynamic'` on some route files
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts`, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts`, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts`, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts`, `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts`
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** Several route files (`[id]/route.ts`, `[id]/tasks/route.ts`, `[id]/tasks/[taskId]/route.ts`, `[id]/documents/route.ts`, `[id]/documents/[docId]/route.ts`) do not export `dynamic = 'force-dynamic'`, while `teams/route.ts`, `teams/names/route.ts`, `teams/notify/route.ts`, and `chief-of-staff/route.ts` all do. These routes read runtime filesystem state (team registry, task files, document files) and should not be statically cached by Next.js. Routes with dynamic path segments (`[id]`, `[taskId]`, `[docId]`) are automatically dynamic in Next.js App Router because they cannot be statically generated, so this is not a functional bug, but it's inconsistent with the explicit pattern used elsewhere.
- **Fix:** For consistency, add `export const dynamic = 'force-dynamic'` to all route files that read runtime state, or remove it from the files that have dynamic segments (since Next.js handles them automatically).

### [CC-P9-A2-007] `assertValidServiceResult` guard not used in any route handler
- **File:** All 9 route files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `ServiceResult` type has a companion `assertValidServiceResult()` guard (defined in `types/service.ts:27`) designed for defense-in-depth to detect when both `data` and `error` are set simultaneously. None of the 9 route handlers in this domain call this guard after service calls. The comment in `types/service.ts` says "Use in route handlers after service calls for defense-in-depth."
- **Evidence:**
  ```typescript
  // types/service.ts:22-26
  /**
   * SF-024: Runtime guard to assert a ServiceResult is in a valid state.
   * Detects when both `data` and `error` are set (indicates a service bug).
   * Use in route handlers after service calls for defense-in-depth.
   */
  ```
  No route file imports or calls `assertValidServiceResult`.
- **Fix:** Import and call `assertValidServiceResult(result, 'contextLabel')` after each service call in the route handlers to detect service bugs early.


### [CC-P9-A7-002] ServiceResult data+error ambiguity documented but not enforced at type level
- **File:** /Users/emanuelesabetta/ai-maestro/types/service.ts:10-20
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** SF-024 documents that `ServiceResult<T>` allows simultaneous `data` and `error` fields and that a discriminated union refactor is tracked for Phase 2. This is acknowledged and well-documented. Noting here for completeness that the current type permits `{ data: T, error: string, status: 200 }` which callers must guard against manually. The runtime guard (CC-P9-A7-001) exists but is unused.
- **Evidence:**
  ```typescript
  export interface ServiceResult<T> {
    data?: T
    error?: string
    status: number
    headers?: Record<string, string>
  }
  ```
- **Fix:** Phase 2 discriminated union refactor as already planned. No action needed now beyond CC-P9-A7-001.

### [CC-P9-A7-003] Deprecated fields in Agent/AgentSummary lack JSDoc @deprecated annotation
- **File:** /Users/emanuelesabetta/ai-maestro/types/agent.ts:198-199, 472-475
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Several deprecated fields use only `// DEPRECATED:` comments instead of proper JSDoc `@deprecated` annotations. The `EmailTool.address` and `EmailTool.provider` fields (lines 359-362) correctly use `/** @deprecated ... */`, but the `Agent.alias` (line 199), `AgentSummary.alias` (line 473), `AgentSummary.displayName` (line 474), `AgentSummary.currentSession` (line 475), `CreateAgentRequest.alias` (line 501), `CreateAgentRequest.displayName` (line 502), `UpdateAgentRequest.alias` (line 524), and `UpdateAgentRequest.displayName` (line 525) use plain comments. TypeScript IDEs only show strikethrough for `@deprecated` JSDoc tags.
- **Evidence:**
  ```typescript
  // line 198-199 (Agent)
  // DEPRECATED: alias - use 'name' instead (kept temporarily for migration)
  alias?: string

  // line 359-362 (EmailTool) - correct pattern
  /** @deprecated Use addresses[] instead. Removal: Phase 2. */
  address?: string
  ```
- **Fix:** Change `// DEPRECATED:` comments to `/** @deprecated ... */` JSDoc annotations for IDE support.

### [CC-P9-A7-004] Host.type deprecated field lacks removal timeline
- **File:** /Users/emanuelesabetta/ai-maestro/types/host.ts:55-58
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `Host.type` field is marked as deprecated with comments explaining it's kept for backward compatibility during migration, but unlike `EmailTool.address` (which has "Removal: Phase 2"), there is no target removal version or phase specified.
- **Evidence:**
  ```typescript
  // DEPRECATED: type field is no longer meaningful
  // In a mesh network, all hosts are equal. Use isSelf for self-detection.
  // Kept for backward compatibility during migration - will be removed.
  type?: 'local' | 'remote'
  ```
- **Fix:** Add a removal target (e.g., "Phase 2" or "v1.0") and convert to `/** @deprecated */` JSDoc.

### [CC-P9-A7-005] GovernanceSyncMessage.payload typed as Record<string, unknown> loses type safety
- **File:** /Users/emanuelesabetta/ai-maestro/types/governance.ts:77
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `GovernanceSyncMessage.payload` is typed as `Record<string, unknown>` rather than a discriminated union based on the `type` field. For example, when `type` is `'manager-changed'`, the payload should contain `managerId`, `managerName`, `teams`, etc. The consuming code in `governance-sync.ts:206-209` manually casts with `as { managerId: string | null; managerName: string | null; teams: PeerTeamSummary[] }`, bypassing type checking.
- **Evidence:**
  ```typescript
  // types/governance.ts:73-78
  export interface GovernanceSyncMessage {
    type: GovernanceSyncType
    fromHostId: string
    timestamp: string
    payload: Record<string, unknown>  // type-specific data
  }

  // lib/governance-sync.ts:206-209 (consumer)
  const { managerId, managerName, teams } = rawPayload as {
    managerId: string | null
    managerName: string | null
    teams: PeerTeamSummary[]
  }
  ```
- **Fix:** Consider a discriminated union for the payload based on `type`, e.g.: `GovernanceSyncMessage = { type: 'manager-changed'; payload: ManagerChangedPayload } | { type: 'team-updated'; payload: TeamUpdatedPayload } | ...`. This would eliminate the unsafe `as` cast in consumers. Low priority given the small number of sync types currently.


### [CC-P9-A4-012] Inconsistent `ServiceResult` re-export pattern
- **File:** Multiple files (agents-core-service.ts:74-75, sessions-service.ts:47-48, governance-service.ts:30-31)
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple service files independently import `ServiceResult` from `@/types/service` and re-export it. This creates redundant export paths. Callers import from different service files, creating inconsistent import sources for the same type.
- **Evidence:**
```typescript
// Each service file has:
import { ServiceResult } from '@/types/service'
export type { ServiceResult }
```
- **Fix:** Remove the re-exports. Import `ServiceResult` directly from `@/types/service` in files that need it. Or designate a single barrel export.

### [CC-P9-A4-013] `sendServiceResult` hardcodes `result.data` check without discriminated union
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts (sendServiceResult helper -- around line 390-410 based on pattern)
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** The `sendServiceResult` function checks `result.error` to determine if it's an error response, then falls through to success. Since `ServiceResult<T>` is a union type without a discriminant property, TypeScript cannot narrow this safely. CC-P9-A4-001 demonstrates this -- a result can have both `data` and `error`.
- **Fix:** Add a discriminant (e.g., `success: boolean`) to the `ServiceResult` type, or use a proper tagged union.

### [CC-P9-A4-014] `queryCodeGraph` `depth` parameter accepted but not used in `focus` action
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-graph-service.ts:861, 1022-1126
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `focus` action in `queryCodeGraph` accepts a `depth` parameter (default 1) and includes it in the result at line 1126 (`result = { focusNodeId: nodeId, depth, nodes, edges }`), but the actual query logic always fetches exactly 1 level of neighbors regardless of the `depth` value. The depth parameter is logged and returned but never used for multi-hop traversal.
- **Evidence:**
```typescript
// agents-graph-service.ts:1022
console.log(`[Graph Service] Focus on node: ${nodeId}, depth: ${depth}`)
// ... but queries are always single-hop (caller_fn = escapedNodeId)
```
- **Fix:** Either implement multi-hop traversal using recursive queries, or remove the `depth` parameter and document that focus always returns 1-hop neighbors.

### [CC-P9-A4-015] `getAgent(auth.agentId!)` uses non-null assertion after checking `.authenticated`
- **File:** /Users/emanuelesabetta/ai-maestro/services/amp-service.ts:1631
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `rotateKeypair` function checks `auth.authenticated` then uses `auth.agentId!` with a non-null assertion. While this is logically safe (authenticated implies agentId exists), using `!` bypasses TypeScript's null safety.
- **Evidence:**
```typescript
// amp-service.ts:1631
const agent = getAgent(auth.agentId!)
```
- **Fix:** Add a guard: `if (!auth.agentId) return { data: { error: 'unauthorized', message: 'No agent identity' } as AMPError, status: 401 }` before the call.

### [CC-P9-A4-016] Synchronous file reads at module load time in sessions-service
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts (inferred from summary, package.json read)
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The sessions-service module appears to read `package.json` synchronously at import time (for version info). This blocks the event loop during module initialization and slows server startup.
- **Fix:** Lazy-load the package.json data on first use, or cache it after an async read during startup.

---


### [CC-P9-A3-013] Inconsistent response wrapping: some routes use `{ success: false, error }`, others use `{ error }`
- **File:** Multiple files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Error responses are inconsistent across routes. Some routes wrap errors as `{ success: false, error: '...' }` (e.g., conversations/parse, sessions/command, sessions/activity/update, help/agent, export/jobs) while others use the simpler `{ error: '...' }` pattern (e.g., hosts/*, domains/*, messages/*, webhooks/*). The TODO comment at `sessions/route.ts:4-6` acknowledges this: "SF-054: TODO Phase 2 -- Standardize all API error responses on { error: string } shape."
- **Evidence:** Compare `app/api/sessions/activity/update/route.ts:31`: `{ success: false, error: result.error }` vs `app/api/hosts/route.ts:15`: `{ error: result.error, hosts: [] }` vs `app/api/domains/route.ts:15`: `{ error: result.error }`.
- **Fix:** This is acknowledged as Phase 2 work (SF-054). Standardize on one shape when the time comes.

### [CC-P9-A3-014] Unused `path` import in sessions/create/route.ts
- **File:** app/api/sessions/create/route.ts:2
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `import path from 'path'` is imported and used only for `path.isAbsolute()` on line 13. This is correct usage. (Upon re-examination, this is actually used. Disregarding.)

*Retracted -- path is used.*

### [CC-P9-A3-015] `AMPError` type cast on inline error objects may not match actual type shape
- **File:** app/api/v1/messages/pending/route.ts:26,42,63
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Error responses are cast with `as AMPError` even though the inline object `{ error: result.error, message: result.error }` duplicates the error string in both `error` and `message` fields. This works but is redundant -- if `AMPError` changes its shape, these inline casts would silently become wrong. The same pattern appears in `app/api/v1/register/route.ts:26` and `app/api/v1/route/route.ts:35`.
- **Evidence:**
  ```typescript
  return NextResponse.json({ error: result.error, message: result.error } as AMPError, { status: result.status })
  ```
- **Fix:** Consider a helper function like `toAMPError(result)` to centralize the conversion and eliminate the redundant duplication.

### [CC-P9-A3-016] Module-level mutable state for deprecation warnings shared across requests
- **File:** app/api/sessions/[id]/command/route.ts:11, app/api/sessions/[id]/rename/route.ts:13, app/api/sessions/[id]/route.ts:13
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Three deprecated route files use a module-level `let _deprecationWarned = false` pattern. In serverless environments (Vercel), module state may be reset between invocations. In long-running servers, the warning fires exactly once per process lifetime. This is the intentional behavior (NT-011), but worth noting that in serverless, the "warn once" guarantee is only per-cold-start, not globally. Not a bug, just an awareness item.
- **Evidence:** All three files have identical pattern: `let _deprecationWarned = false; function logDeprecation() { ... }`
- **Fix:** No action needed. This is working as designed for the localhost deployment model.

### [CC-P9-A3-017] GET handler in sessions/restore does not use service result pattern
- **File:** app/api/sessions/restore/route.ts:10-11
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The GET handler returns `NextResponse.json(result)` directly from `listRestorableSessions()` instead of using the standard `result.data / result.error` service result pattern used everywhere else. This means the service return shape is different from all other routes.
- **Evidence:**
  ```typescript
  const result = await listRestorableSessions()
  return NextResponse.json(result)  // no .data/.error decomposition
  ```
- **Fix:** Either standardize `listRestorableSessions()` to return the service result pattern, or document this as an intentional exception.


### [CC-P9-A5-012] governance.ts isChiefOfStaffAnywhere does not guard against empty agentId
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:162-169
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Unlike `isManager()` (line 145: `if (!agentId) return false`) and `isChiefOfStaff()` (line 154: `if (!agentId) return false`), `isChiefOfStaffAnywhere()` does not guard against falsy agentId. If called with an empty string or null (cast to string), the `===` comparison would not match any chiefOfStaffId. This is safe because `===` with a falsy string won't match UUIDs, but the inconsistency with sibling functions is confusing and could mask bugs.
- **Evidence:**
```typescript
// Lines 162-169
export function isChiefOfStaffAnywhere(agentId: string): boolean {
  const teams = loadTeams()
  // No guard: if (!agentId) return false
  return teams.some(
    (team) => team.type === 'closed' && team.chiefOfStaffId === agentId
  )
}
```
- **Fix:** Add `if (!agentId) return false` at the start for consistency with `isManager` and `isChiefOfStaff`.

### [CC-P9-A5-013] governance.ts getClosedTeamForAgent and getClosedTeamsForAgent lack agentId guard
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:173, 184
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-P9-A5-012. Both `getClosedTeamForAgent` (line 173) and `getClosedTeamsForAgent` (line 184) accept `agentId: string` without a falsy guard. If called with empty string, `agentIds.includes('')` would never match, so functionally safe but inconsistent.
- **Evidence:**
```typescript
// Line 173
export function getClosedTeamForAgent(agentId: string): Team | null {
  const teams = loadTeams()
  // No guard
  return teams.find(...)
```
- **Fix:** Add `if (!agentId) return null` / `if (!agentId) return []` for consistency.

### [CC-P9-A5-014] rate-limit.ts exports deprecated alias `recordFailure`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts:73-74
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Line 73-74 exports a deprecated alias `recordFailure` for backward compatibility. Per the project's CLAUDE.md rule "NO BACKWARD COMPATIBILITY CODE and NO LEGACY/OBSOLETE CODE", this deprecated export should be removed.
- **Evidence:**
```typescript
/** @deprecated Use recordAttempt instead. Alias kept for backward compatibility. */
export const recordFailure = recordAttempt
```
- **Fix:** Remove the deprecated alias and update any callers to use `recordAttempt` directly.

### [CC-P9-A5-015] validation.ts UUID regex allows uppercase but agent IDs are typically lowercase
- **File:** /Users/emanuelesabetta/ai-maestro/lib/validation.ts:5
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The UUID regex uses the `i` flag (case-insensitive), accepting both `a-f` and `A-F`. While technically correct per RFC 4122, all UUIDs generated by the codebase (via `crypto.randomUUID()` and `uuid.v4()`) produce lowercase. This is fine as a validator but worth noting for consistency.
- **Evidence:**
```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```
- **Fix:** No action needed. The `i` flag is correct for a general-purpose validator.

### [CC-P9-A5-016] messageQueue.ts `_agentCacheSweepInterval` variable name suggests it should be private but is module-level
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:497
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `_agentCacheSweepInterval` variable is prefixed with underscore suggesting it's private, and it's not exported. This is fine. However, the `cleanupAgentCacheSweep()` function (line 516) is exported for test cleanup but the interval itself has `.unref()` (line 505). The comment on line 512-513 correctly explains this is only needed for tests.
- **Evidence:** No action needed. Just noting for completeness.
- **Fix:** No action needed.

### [CC-P9-A5-017] hosts-config.ts isSelf has redundant toLowerCase on selfId
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:182
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `getSelfHostId()` already returns a lowercase string (line 91: `os.hostname().toLowerCase().replace(...)`). Line 182 calls `selfId.toLowerCase()` redundantly.
- **Evidence:**
```typescript
// Line 91
export function getSelfHostId(): string {
  return os.hostname().toLowerCase().replace(/\.local$/, '')
}
// Line 178-182
const selfId = getSelfHostId()  // Already lowercase
const hostIdLower = hostId.toLowerCase()
if (hostIdLower === selfId.toLowerCase()) return true  // .toLowerCase() is redundant
```
- **Fix:** Change to `hostIdLower === selfId` since selfId is already lowercase.


### [CC-P9-A8-005] Inconsistent mock pattern for `withLock` across test files
- **File:** Multiple files
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `@/lib/file-lock` mock uses different signatures across test files. Some use `(_name: string, fn: () => unknown)`, others use `(_name: string, fn: () => any)`. While this doesn't cause bugs (both work), the inconsistency makes it harder to maintain. Files affected: transfer-registry.test.ts (line 39 uses `any`), team-api.test.ts (line 46 uses `any`), governance-peers.test.ts (line doesn't mock withLock), etc.
- **Evidence:**
```typescript
// transfer-registry.test.ts:39
withLock: vi.fn((_name: string, fn: () => any) => Promise.resolve(fn())),
// document-registry.test.ts:44
withLock: vi.fn((_name: string, fn: () => unknown) => Promise.resolve(fn())),
```
- **Fix:** Standardize on `() => unknown` across all test files for type safety consistency (stricter than `any`).

### [CC-P9-A8-006] transfer-registry.test.ts mocks `crypto` instead of `uuid` for ID generation
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:34-36
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Unlike most other test files that mock `uuid` with `{ v4: vi.fn(...) }`, transfer-registry.test.ts mocks `crypto` with `{ randomUUID: vi.fn(...) }`. This is correct if the source module uses `crypto.randomUUID()` instead of `uuid.v4()`, but it's a different pattern from the rest of the codebase. Not a bug, but notable for consistency.
- **Evidence:**
```typescript
// transfer-registry.test.ts:34-36
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => `uuid-${++uuidCounter}`),
}))
```
- **Fix:** No action needed if the source module uses `crypto.randomUUID()`. Just noting the pattern difference.

### [CC-P9-A8-007] role-attestation.test.ts signatureBindings cleared twice (beforeEach + afterEach)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/role-attestation.test.ts:99-112
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `signatureBindings.clear()` is called in both `beforeEach` (line 104) and `afterEach` (line 111). The comment at line 102 explains the `beforeEach` call: "CC-P4-010: Clear signatureBindings in beforeEach for complete test isolation. vi.clearAllMocks() in afterEach does NOT clear standalone Maps." Having it in both hooks is redundant but harmless -- the `beforeEach` clear is the important one (ensures clean state before test), while the `afterEach` clear is extra insurance.
- **Evidence:**
```typescript
beforeEach(() => {
  // ...
  signatureBindings.clear() // line 104
})
afterEach(() => {
  // ...
  signatureBindings.clear() // line 111
})
```
- **Fix:** Keep the `beforeEach` call (it's the critical one). The `afterEach` call can be removed as it's redundant, but leaving it is not harmful.

### [CC-P9-A8-008] test-utils/service-mocks.ts MockTeamValidationException pattern is duplicated
- **File:** /Users/emanuelesabetta/ai-maestro/tests/test-utils/service-mocks.ts and /Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts:23-29
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `MockTeamValidationException` class (extending Error with a `code` property) is defined in both service-mocks.ts and inline in transfer-resolve-route.test.ts (lines 23-29). The duplicate definition could drift. The service-mocks.ts version exists specifically to be shared, but transfer-resolve-route.test.ts defines its own copy.
- **Evidence:**
```typescript
// transfer-resolve-route.test.ts:23-29
TeamValidationException: class TeamValidationException extends Error {
    code: number
    constructor(message: string, code: number) {
      super(message)
      this.code = code
    }
  },
```
- **Fix:** Import the shared MockTeamValidationException from test-utils/service-mocks.ts instead of defining it inline.


### [CC-P9-A9-009] `install-messaging.sh` box-drawing lines are misaligned
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The box-drawing characters are not perfectly aligned. The top/bottom bars use `════════════════════════════════════════════════════════════════` (64 chars) but the content lines use different padding:
  ```
  ║                                                                ║    <- 64 chars between bars
  ║     AI Maestro - Agent Messaging Protocol (AMP) Installer      ║
  ```
  The content between the `║` delimiters should be exactly the same width in all lines.
- **Evidence:**
  ```bash
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                                                                ║"
  ```
  The top bar has 64 `=` characters, but the middle line's spacing doesn't produce the same visual width.
- **Fix:** Verify all box-drawing lines have consistent character counts between delimiters.

### [CC-P9-A9-010] `start-with-ssh.sh` does not use set -u, SSH_AUTH_SOCK could be unset
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh:10
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** Line 10 tests `$SSH_AUTH_SOCK` without checking if the variable is set. With `set -e` but without `set -u`, an unset `SSH_AUTH_SOCK` would evaluate to empty string and take the else branch (printing "SSH symlink already exists"), which is misleading -- it should say "No SSH agent found" or similar.
- **Evidence:**
  ```bash
  if [ -S "$SSH_AUTH_SOCK" ] && [ ! -h "$SSH_AUTH_SOCK" ]; then
  ```
  When `SSH_AUTH_SOCK` is unset, this becomes `[ -S "" ]` which is false, so the else branch fires with a misleading message.
- **Fix:** Add an explicit check: `if [ -z "${SSH_AUTH_SOCK:-}" ]; then echo "No SSH agent detected"; elif ...`

### [CC-P9-A9-011] `bump-version.sh` double-counts FILES_UPDATED for version.json
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:135-138
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Lines 135-136 directly modify version.json via `_sed_inplace`, then line 138 increments `FILES_UPDATED`. But version.json is also processed by `update_file` for other patterns. The manual increment at line 138 is the only one for version.json (since `update_file` handles the rest), but lines 190-208 also directly call `_sed_inplace` on `ai-index.html` and `BACKLOG.md` with manual increments. This means `FILES_UPDATED` counts the number of replacements, not the number of unique files. For version.json it counts 1, but for `ai-index.html` it could count 3+ (steps 7, 7b, 7c, 8, 9). The final message says "Updated N files" when it really means "Updated N file references."
- **Evidence:**
  ```bash
  # Line 135-138 (version.json: +1)
  _sed_inplace "$VERSION_FILE" "s|..."
  _sed_inplace "$VERSION_FILE" "s|..."
  FILES_UPDATED=$((FILES_UPDATED + 1))

  # Line 190-193 (ai-index.html direct: +1)
  # Line 197-202 (ai-index.html direct: +1)
  # Line 205-209 (BACKLOG.md direct: +1)
  # Plus update_file calls for ai-index.html: up to +3 more
  ```
- **Fix:** Either count unique files or change the message to "Updated N version references across M files."

### [CC-P9-A9-012] `server.mjs` `cleanupSession` may fire after session was already removed from map by another path
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:174-237
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `cleanedUp` flag at line 183-187 prevents double cleanup. However, the `handleClientDisconnect` function at line 261-266 schedules a delayed cleanup timer that captures `sessionState` in its closure. If `ptyProcess.onExit` fires and calls `cleanupSession` before the timer fires, the timer callback at line 263 checks `sessionState.clients.size === 0` on the now-cleaned-up state. Since `cleanedUp` is true, `cleanupSession` returns early at line 184. This is correct but the timer is never cleared, wasting a setTimeout. This is benign -- just noting the timer reference leak.
- **Evidence:**
  ```javascript
  // handleClientDisconnect:
  sessionState.cleanupTimer = setTimeout(() => {
      if (sessionState.clients.size === 0) {
          cleanupSession(sessionName, sessionState, 'no_clients_after_grace_period')
          // cleanupSession returns early due to cleanedUp=true
      }
  }, PTY_CLEANUP_GRACE_MS)
  ```
- **Fix:** In `cleanupSession`, clear the timer: already done at line 192-195. The race is if onExit fires between timer creation and cleanupSession processing. The `cleanedUp` guard handles it. No action needed.


### [CC-P9-A6-010] TerminalView: initializeTerminal effect suppresses exhaustive-deps but has implicit dependency on session.id
- **File:** components/TerminalView.tsx:296-360
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The terminal initialization `useEffect` has `[]` as deps with an eslint-disable. Inside, it references `session.id` in console.error messages (lines 323, 330, 340). While the tab architecture means this is intentional (init once, never re-init), the session.id reference inside the effect body without it being in deps is technically a stale closure. In this architecture it is correct because session never changes for a mounted TerminalView.
- **Evidence:**
  ```tsx
  useEffect(() => {
    // ... uses session.id in console messages
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  ```
- **Fix:** No functional change needed, but adding a comment `// session.id is stable for the lifetime of this component (tab architecture)` would improve clarity.

### [CC-P9-A6-011] Header: unused import of 'useState' if no state is used
- **File:** components/Header.tsx
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** POSSIBLE
- **Description:** The Header component appears to be a pure presentational component. If `useState` or `useEffect` are imported but unused, they should be removed. Need to verify with the actual import line.
- **Fix:** Remove unused imports if present.

### [CC-P9-A6-012] RoleBadge: switch default case uses String(role) which may hide type narrowing bugs
- **File:** components/governance/RoleBadge.tsx
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The switch default case renders `String(role)` as a fallback badge. While this is a reasonable defensive pattern for future-proofing, TypeScript's exhaustive switch checking would be more valuable here. If a new GovernanceRole is added, the compiler would not warn about the missing case because the default swallows it.
- **Fix:** Consider using a `never` type assertion in the default case: `const _exhaustive: never = role` to get compile-time exhaustiveness checking, with a fallback render only if needed at runtime.

### [CC-P9-A6-013] TeamsPage: validateTeamName sets state on every keystroke but does not debounce
- **File:** app/teams/page.tsx:88-129
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `validateTeamName` is called on every keystroke in the Create Team dialog. It performs string operations and array lookups (`reservedNames.teamNames.find(...)`) on every character typed. For small arrays this is negligible, but the function creates new state on every call via `setNameValidation(...)`.
- **Evidence:**
  ```tsx
  onChange={e => { setNewTeamName(e.target.value); setCreateError(null); validateTeamName(e.target.value) }}
  ```
- **Fix:** This is fine for the current scale. If reservedNames grows large, consider debouncing or deferring validation with `useDeferredValue`.

### [CC-P9-A6-014] useTerminal: debounce utility casts return type unsafely
- **File:** hooks/useTerminal.ts:18-24
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `debounce` function casts the wrapper function `as T`, but the wrapper drops the return type (always returns `void` via `setTimeout`). Since the debounced function is only used with void-returning callbacks (ResizeObserver), this is safe in practice, but the type assertion is technically unsound.
- **Evidence:**
  ```tsx
  function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
    // ...
    return ((...args: unknown[]) => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => fn(...args), ms)
    }) as T  // Unsafe cast: return type may differ
  }
  ```
- **Fix:** The constraint `=> void` ensures callers don't rely on a return value, so this is safe. No change needed unless the constraint is relaxed.

### [CC-P9-A6-015] TeamOverviewSection: does not re-sync local state when team.description changes to empty string
- **File:** components/teams/TeamOverviewSection.tsx:27-31
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `useEffect` syncing local state uses `team.description || ''` for the description. If `team.description` changes from a non-empty string to `undefined` externally, the effect correctly resets to `''`. But if `team.description` is already `''` and the effect runs, the setState is a no-op. This is fine behavior but the dependency array includes `team.description` which may cause unnecessary effect runs when description toggles between `undefined` and `''`.
- **Evidence:**
  ```tsx
  useEffect(() => {
    setName(team.name)
    setDescription(team.description || '')
  }, [team.id, team.name, team.description])
  ```
- **Fix:** No functional change needed. This is correct behavior.


### [CC-P9-A0-013] `_request` parameter unused but typed differently across routes
- **File:** Multiple files
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Some routes type the unused first parameter as `Request` (native) while others use `NextRequest` (Next.js). For example, `app/api/agents/[id]/route.ts` uses `Request`, while `app/api/agents/[id]/database/route.ts` uses `NextRequest`. While both work in Next.js App Router, this inconsistency could cause confusion.
- **Evidence:**
  - `[id]/route.ts` line 11: `request: Request`
  - `[id]/playback/route.ts` line 15: `request: Request`
  - `[id]/repos/route.ts` line 16: `_request: Request`
  - `[id]/database/route.ts` line 10: `_request: NextRequest`
  - `[id]/chat/route.ts` line 15: `request: NextRequest`
- **Fix:** Standardize on `NextRequest` for consistency across all routes.

### [CC-P9-A0-014] Inconsistent `dynamic` export across routes
- **File:** Multiple files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Some top-level routes export `dynamic = 'force-dynamic'` (e.g., `route.ts`, `health/route.ts`, `docker/create/route.ts`), while others do not (e.g., `startup/route.ts`, `normalize-hosts/route.ts`, `import/route.ts`). All routes that involve server-side computation or mutable state should be `force-dynamic` to prevent caching.
- **Evidence:**
  - `app/api/agents/route.ts`: `export const dynamic = 'force-dynamic'`
  - `app/api/agents/health/route.ts`: `export const dynamic = 'force-dynamic'`
  - `app/api/agents/startup/route.ts`: no dynamic export
  - `app/api/agents/normalize-hosts/route.ts`: no dynamic export
- **Fix:** Add `export const dynamic = 'force-dynamic'` to all API routes that perform dynamic operations.

### [CC-P9-A0-015] Minor: URL parsing method inconsistency
- **File:** Multiple files
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Some routes use `request.nextUrl.searchParams` (NextRequest-specific), while others use `new URL(request.url).searchParams`. Both work, but mixing them is inconsistent.
- **Evidence:**
  - `[id]/search/route.ts` line 35: `request.nextUrl.searchParams`
  - `[id]/messages/route.ts` line 19: `new URL(request.url)`
  - `[id]/messages/[messageId]/route.ts` line 27: `new URL(request.url)`
  - `[id]/repos/route.ts` line 77: `new URL(request.url)`
- **Fix:** Standardize on `request.nextUrl.searchParams` for `NextRequest` typed handlers, and `new URL(request.url)` for `Request` typed handlers.


### [CC-P9-A1-007] Manager route: `agent.name || agent.alias` uses `||` instead of `??`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts`:60
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `agent.name || agent.alias` will skip `name` if it's an empty string. Using `agent.name ?? agent.alias` would only skip if `name` is null/undefined.
- **Evidence:**
  ```typescript
  return NextResponse.json({ success: true, managerId: agentId, managerName: agent.name || agent.alias })
  ```
- **Fix:** Use `agent.name ?? agent.alias` if empty-string names should be preserved.

### [CC-P9-A1-008] Transfer resolve: `saveError` caught but not logged
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:159
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `catch (saveError)` block on line 159 reverts the transfer and returns an error, but does not log `saveError`. This makes it harder to diagnose disk/permission issues in production.
- **Evidence:**
  ```typescript
  } catch (saveError) {
    // Compensating action (SR-007): revert transfer from 'approved' back to 'pending'
    await revertTransferToPending(id)
    return NextResponse.json({ error: 'Failed to save team changes...' }, { status: 500 })
  }
  ```
- **Fix:** Add `console.error('[TransferResolve] saveTeams failed:', saveError)` before the revert.

### [CC-P9-A1-009] Trust DELETE route: Missing `export const dynamic = 'force-dynamic'`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/trust/[hostId]/route.ts`
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The parent route `trust/route.ts` has `export const dynamic = 'force-dynamic'` on line 14, but the child `trust/[hostId]/route.ts` does not. While Next.js dynamic routes with params are typically not cached, adding the explicit directive would be consistent with the project convention (NT-023 pattern used in other governance routes).
- **Evidence:** Compare `trust/route.ts:14` (has it) vs `trust/[hostId]/route.ts` (missing).
- **Fix:** Add `export const dynamic = 'force-dynamic'` to `trust/[hostId]/route.ts`.

### [CC-P9-A1-010] Governance sync POST: `validSyncTypes` declared as mutable array instead of Set or const assertion
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/sync/route.ts`:32
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Line 32 declares `const validSyncTypes: string[] = [...]` and uses `.includes()` for validation. Other routes in this domain use `Set` with `.has()` for the same pattern (e.g., `requests/route.ts:22-33` uses `VALID_GOVERNANCE_REQUEST_STATUSES = new Set([...])` and `VALID_GOVERNANCE_REQUEST_TYPES = new Set([...])`). The array approach is functionally correct but inconsistent with the established pattern and slightly less efficient for larger sets.
- **Evidence:**
  ```typescript
  // sync/route.ts:32 -- uses array + includes
  const validSyncTypes: string[] = ['manager-changed', 'team-updated', 'team-deleted', 'transfer-update']
  if (!validSyncTypes.includes(body.type)) { ... }

  // requests/route.ts:22 -- uses Set + has (established pattern)
  const VALID_GOVERNANCE_REQUEST_STATUSES = new Set(['pending', ...])
  ```
- **Fix:** Change to `const VALID_SYNC_TYPES = new Set([...])` with `.has()` for consistency.

### [CC-P9-A1-011] Governance sync POST: `validSyncTypes` declared inside function scope but is constant
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/sync/route.ts`:32
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `validSyncTypes` is declared inside the `POST` function body, meaning it's re-created on every request. The similar constants in `requests/route.ts` are declared at module scope (lines 22-33). This is a minor performance nit -- the array is small and the allocation is cheap, but module-scope would be consistent.
- **Evidence:** Compare `sync/route.ts:32` (inside POST) vs `requests/route.ts:22` (module scope).
- **Fix:** Move to module scope as `const VALID_SYNC_TYPES = new Set([...])`.


None found.

---


---

## Source Reports

- `epcp-correctness-P9-R1ebfebc5-0cd1d104-943e-4849-acf3-feba237c7100.md`
- `epcp-correctness-P9-R1ebfebc5-23246459-ab12-46fe-b831-acdf810ee936.md`
- `epcp-correctness-P9-R1ebfebc5-244bc5c1-205b-4252-a127-97c88e079e43.md`
- `epcp-correctness-P9-R1ebfebc5-4e266dd4-78dd-4f84-ab92-043e817ada52.md`
- `epcp-correctness-P9-R1ebfebc5-60800534-557b-4f15-989d-205b9731c60b.md`
- `epcp-correctness-P9-R1ebfebc5-61ae11eb-a64a-4ca5-8c12-3ab1f1f66170.md`
- `epcp-correctness-P9-R1ebfebc5-b248a4d3-a8ca-4b82-84b5-b8a4599569af.md`
- `epcp-correctness-P9-R1ebfebc5-b8fdcfb8-0aa1-45c0-bbcd-5177156465e9.md`
- `epcp-correctness-P9-R1ebfebc5-f2305b62-d08d-4b94-9f6f-38901971ca1d.md`
- `epcp-correctness-P9-R1ebfebc5-f2d3343d-19e2-41e9-806b-09a2ca20297f.md`
- `epcp-claims-P9-R1ebfebc5-5280a7fa-f12a-44a3-aff6-f2df79943853.md`
- `epcp-review-P9-R1ebfebc5-f03bac89-332f-4c94-805c-2e1b5f595411.md`

