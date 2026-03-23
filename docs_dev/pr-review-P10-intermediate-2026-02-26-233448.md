# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-26-233448
**Pass:** 10
**Run ID:** c7f26c53
**Reports merged:** 10
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 16 |
| **SHOULD-FIX** | 61 |
| **NIT** | 43 |
| **Total** | 120 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


### [CC-A0-001] DELETE /api/agents/[id]/metadata does not actually clear metadata
- **File:** app/api/agents/[id]/metadata/route.ts:106
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The DELETE handler calls `updateAgent(agentId, { metadata: {} })` to clear metadata. However, `updateAgent` in `lib/agent-registry.ts:542-545` merges metadata using spread: `metadata: { ...agents[index].metadata, ...updates.metadata }`. Spreading an empty object `{}` over the existing metadata is a no-op -- all existing keys are preserved. The metadata is never actually cleared.
- **Evidence:**
  ```typescript
  // metadata/route.ts:106
  const agent = await updateAgent(agentId, { metadata: {} })

  // agent-registry.ts:542-545
  metadata: {
    ...agents[index].metadata,   // existing keys preserved
    ...updates.metadata           // {} adds nothing
  },
  ```
- **Fix:** Either (a) add a `clearMetadata` flag to `updateAgent` that replaces instead of merging, or (b) create a dedicated `clearAgentMetadata(id)` function in the registry that sets `agents[index].metadata = {}` directly, or (c) set each existing key to `undefined` explicitly in the update. The simplest fix is to add a check in `updateAgent`: if the update contains `metadata` and the value is an empty object, replace rather than merge.


### [CC-A1-001] Double-decode path traversal bypass in conversations/[file]/messages route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/conversations/[file]/messages/route.ts:15-25
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The route decodes the file parameter once at line 15 to check for `../`, but then passes the still-encoded `encodedFile` to `getConversationMessages()` at line 25. The service function (`config-service.ts:787`) decodes it a second time. A double-encoded path like `%252e%252e%252f` would decode to `%2e%2e%2f` at the route level (passing the traversal check), then to `../` in the service. While the current downstream usage (CozoScript query with `escapeForCozo`) prevents actual exploitation, this is a defense-in-depth failure -- any future code path using the decoded file as a filesystem path would be vulnerable.
- **Evidence:**
  ```typescript
  // Route (line 15): decodes once, checks for ../
  const decodedFile = decodeURIComponent(encodedFile)
  if (decodedFile.includes('../') || decodedFile.includes('..\\')) { ... }

  // Route (line 25): passes ENCODED value to service
  const result = await getConversationMessages(encodedFile, agentId)

  // Service (config-service.ts:787): decodes AGAIN
  const conversationFile = decodeURIComponent(encodedFile)
  ```
- **Fix:** Pass the already-decoded `decodedFile` to the service instead of `encodedFile`, and update the service to not double-decode. Or, perform the traversal check on the service's decoded value instead.


### [CC-A2-001] Webhook routes lack authentication -- any localhost client can CRUD webhooks
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/webhooks/route.ts`:8,21; `/Users/emanuelesabetta/ai-maestro/app/api/webhooks/[id]/route.ts`:8,25; `/Users/emanuelesabetta/ai-maestro/app/api/webhooks/[id]/test/route.ts`:8
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** All five webhook endpoints (GET list, POST create, GET by id, DELETE by id, POST test) have zero authentication. While Phase 1 is localhost-only, every other mutating route in the codebase (teams, meetings, messages, governance) has `authenticateAgent()` guards. Webhooks are a write path (create subscriptions, delete subscriptions, trigger test deliveries to arbitrary URLs). An unauthenticated process on localhost can register webhooks to exfiltrate events or delete legitimate webhooks. This is inconsistent with the security posture applied to every other domain.
- **Evidence:**
  ```typescript
  // app/api/webhooks/route.ts -- no auth at all
  export async function POST(request: Request) {
    let body
    try { body = await request.json() } catch { ... }
    const result = createNewWebhook(body)  // no auth check
  ```
- **Fix:** Add `authenticateAgent()` calls to POST (create), DELETE, and POST test endpoints, consistent with other routes. GET (list) can remain unauthenticated if read-only is acceptable for Phase 1 localhost.

### [CC-A2-002] Webhook ID path parameter has no format validation -- potential for path traversal or injection
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/webhooks/[id]/route.ts`:12,29; `/Users/emanuelesabetta/ai-maestro/app/api/webhooks/[id]/test/route.ts`:11
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `[id]` parameter in webhook routes is passed directly to `getWebhookById(id)`, `deleteWebhookById(id)`, and `testWebhookById(id)` without any format validation. Every other `[id]` route in the codebase validates with `isValidUuid(id)`. Although the underlying `getWebhook` does a `.find()` (so it will just return null for unknown IDs and not do a file path lookup), this is inconsistent with the security model and could become a real issue if storage changes.
- **Evidence:**
  ```typescript
  // app/api/webhooks/[id]/route.ts
  export async function GET(_request: Request, { params }) {
    const { id } = await params
    const result = getWebhookById(id)  // no isValidUuid(id) check
  ```
- **Fix:** Add `if (!isValidUuid(id)) return NextResponse.json({ error: 'Invalid webhook ID format' }, { status: 400 })` to all three webhook `[id]` handlers.


### [CC-P10-A3-001] Missing null-check on `agent` in `getMemory()` before calling `.getDatabase()`
- **File:** services/agents-memory-service.ts:220-221
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `getMemory()` calls `agentRegistry.getAgent(agentId)` and immediately calls `agent.getDatabase()` without any validation that `agentId` corresponds to a real agent in the file-based registry. While `agentRegistry.getAgent` auto-creates in-memory agents (never returns null), calling it with an arbitrary/invalid agentId will create a database directory on disk for a nonexistent agent. Several other functions in this same file (e.g., `getConsolidationStatus` at line 464, `triggerConsolidation` at line 536, `queryLongTermMemories` at line 653, `deleteLongTermMemory` at line 761, `updateLongTermMemory` at line 814, `searchConversations` at line 911, `ingestConversations` at line 959, `getTracking` at line 1009, `initializeTracking` at line 1033) all share this same pattern: they use `agentRegistry.getAgent()` without first verifying the agent exists in the file-based registry. Contrast this with `getMetrics()` at line 1103 which correctly uses the file-based `getAgentFromFileRegistry()` and returns 404 if not found.
- **Evidence:**
```typescript
// Line 218-221
export async function getMemory(agentId: string): Promise<ServiceResult<any>> {
  try {
    const agent = await agentRegistry.getAgent(agentId)  // auto-creates, never null
    const agentDb = await agent.getDatabase()             // creates DB dir for any agentId
```
- **Fix:** Add a file-based registry check at the top of each of these functions, matching the pattern used elsewhere:
```typescript
const registryAgent = getAgentFromFileRegistry(agentId)
if (!registryAgent) {
  return { error: 'Agent not found', status: 404 }
}
```

### [CC-P10-A3-002] `parseInt(sessionId)` without NaN check in `createTranscriptExportJob()`
- **File:** services/agents-transfer-service.ts:549
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `parseInt(sessionId)` is called without checking if the result is NaN. If `sessionId` is a non-numeric string (e.g., "abc"), `parseInt` returns `NaN`, and comparing `s.index === NaN` is always false (NaN !== NaN), which would make `.some()` return false. This causes a misleading "Session not found" 404 error instead of a proper 400 validation error. The playback service at line 100-103 already has the correct pattern with `Number.isNaN(parsedIndex)` check (SF-046).
- **Evidence:**
```typescript
// Line 549
if (sessionId && !agent.sessions?.some(s => s.index === parseInt(sessionId))) {
    return { error: 'Session not found for this agent', status: 404 }
}
```
- **Fix:** Add NaN validation before comparison:
```typescript
if (sessionId) {
  const parsedIndex = parseInt(sessionId, 10)
  if (Number.isNaN(parsedIndex)) {
    return { error: 'sessionId must be a numeric session index', status: 400 }
  }
  if (!agent.sessions?.some(s => s.index === parsedIndex)) {
    return { error: 'Session not found for this agent', status: 404 }
  }
}
```


### [CC-A4-001] TOCTOU race in headless-router chief-of-staff endpoint: checkRateLimit + recordAttempt are separate calls
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:1666-1674
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The chief-of-staff endpoint in headless-router.ts uses the older `checkRateLimit` / `recordAttempt` two-step pattern instead of the atomic `checkAndRecordAttempt` used everywhere else in this codebase (governance-service.ts:74, cross-host-governance-service.ts:73, etc.). This creates a TOCTOU window where two concurrent password-brute-force requests could both pass `checkRateLimit` before either calls `recordAttempt`, bypassing the rate limit for one attempt.
- **Evidence:**
  ```typescript
  // headless-router.ts:1666-1674
  const rateCheck = checkRateLimit(rateLimitKey)    // <-- separate check
  if (!rateCheck.allowed) { ... }
  if (!(await verifyPassword(password))) {
    recordAttempt(rateLimitKey)                      // <-- separate record
    sendJson(res, 401, { error: 'Invalid governance password' })
    return
  }
  ```
  Compare with governance-service.ts:74:
  ```typescript
  const rateCheck = checkAndRecordAttempt('governance-manager-auth')  // <-- atomic
  ```
- **Fix:** Replace `checkRateLimit` + `recordAttempt` with `checkAndRecordAttempt`, then call `resetRateLimit` on success, matching the pattern in governance-service.ts, cross-host-governance-service.ts, and all other callers.

### [CC-A4-002] `getMessages` allows action=null to fall through to inbox listing without agent validation
- **File:** /Users/emanuelesabetta/ai-maestro/services/messages-service.ts:72-173
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `getMessages`, when `action` is an unrecognized value (e.g., `"foo"`), the function does not return a 400 error. It falls through to the inbox listing logic (line 149+), where it correctly requires `agentIdentifier`. However, if both `agentIdentifier` and `messageId` are provided but `action` is garbage, the function takes the "get specific message" path (line 116-122), which is likely not the caller's intent. This is not a crash, but it produces incorrect behavior for unrecognized actions -- the caller gets a message lookup instead of an error.
- **Evidence:**
  ```typescript
  // lines 81-148: a chain of if statements with specific action values
  // but no final else/default for unrecognized actions
  if (action === 'resolve' && agentIdentifier) { ... }
  if (action === 'search' && agentIdentifier) { ... }
  if (agentIdentifier && messageId) { ... }  // <-- falls through here
  if (action === 'unread-count' && agentIdentifier) { ... }
  // ... etc
  ```
- **Fix:** Add a validation check before the fallthrough: if `action` is defined and not one of the recognized values (`resolve`, `search`, `unread-count`, `sent-count`, `stats`, `agents`, `sessions`, `list`), return `{ error: 'Invalid action', status: 400 }`.


### [CC-A5-001] hosts-config.ts: `saveHosts()` is NOT atomic -- data loss on crash
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:565
- **Severity:** MUST-FIX
- **Category:** security / data-integrity
- **Confidence:** CONFIRMED
- **Description:** `saveHosts()` calls `fs.writeFileSync(HOSTS_CONFIG_PATH, ...)` directly, without the temp-file-then-rename atomic write pattern used everywhere else in this codebase (governance.ts:82-84, governance-request-registry.ts:76-78, team-registry.ts:247-249, transfer-registry.ts:60-62, host-keys.ts:58-63, manager-trust.ts:97-100). If the process crashes mid-write, `hosts.json` will be left in a corrupted/truncated state.
- **Evidence:**
```typescript
// hosts-config.ts:565
fs.writeFileSync(HOSTS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
```
Compare with governance.ts:82-84:
```typescript
const tmpFile = GOVERNANCE_FILE + `.tmp.${process.pid}`
fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf-8')
fs.renameSync(tmpFile, GOVERNANCE_FILE)
```
- **Fix:** Use atomic write pattern: write to `HOSTS_CONFIG_PATH + '.tmp.' + process.pid`, then `fs.renameSync(tmpFile, HOSTS_CONFIG_PATH)`. Same fix needed at lines 886 and 947 in `setOrganization()` and `adoptOrganization()`.

### [CC-A5-002] hosts-config.ts: Duplicate lock implementation instead of using shared `file-lock.ts`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:19-85
- **Severity:** MUST-FIX
- **Category:** logic / race-condition
- **Confidence:** CONFIRMED
- **Description:** `hosts-config.ts` implements its own lock mechanism (lines 19-85: `acquireLock()`, `releaseLock()`, `withLock()`) separately from the shared `lib/file-lock.ts`. This custom lock has a 5-second timeout vs the shared lock's 30 seconds, and more critically, the lock names are not visible to `lib/file-lock.ts`. If any code path acquires the shared `withLock('hosts')` from file-lock.ts AND the local `withLock()` from hosts-config.ts concurrently, the two lock systems are unaware of each other and cannot prevent races. Additionally, this local lock has no documented lock ordering relative to the lock ordering invariant in file-lock.ts (lines 12-23).
- **Evidence:**
```typescript
// hosts-config.ts:19-25 -- local lock state
let lockHeld = false
let _lockWaiterId = 0
const lockQueue: Array<{ id: number; resolve: () => void; reject: (err: Error) => void }> = []
const LOCK_TIMEOUT = 5000

// file-lock.ts:26-33 -- shared lock state
const locks = new Map<string, Array<() => void>>()
const held = new Set<string>()
const DEFAULT_LOCK_TIMEOUT_MS = 30_000
```
- **Fix:** Migrate `hosts-config.ts` to use the shared `withLock('hosts', fn)` from `@/lib/file-lock`. Remove the duplicate local lock implementation. Add `'hosts'` to the lock ordering invariant in `file-lock.ts`.

### [CC-A5-003] hosts-config.ts: `setOrganization()` and `adoptOrganization()` have TOCTOU race on `config.organization` check
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:846-898, 908-960
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Both `setOrganization()` and `adoptOrganization()` read the config, check `config.organization`, and then write -- but neither function is wrapped in any lock. Two concurrent calls to `setOrganization()` could both read `organization: null` and both proceed to write, violating the "can only be set once" invariant. Same for concurrent `adoptOrganization()` calls during mesh sync.
- **Evidence:**
```typescript
// hosts-config.ts:861-872 -- read-check-write without lock
let config: HostsConfig = { hosts: [] }
if (fs.existsSync(HOSTS_CONFIG_PATH)) {
  const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
  config = JSON.parse(fileContent) as HostsConfig
}
// Check if already set
if (config.organization) {
  return { success: false, error: `Organization already set...` }
}
// ... proceeds to write -- but another caller could be between the same check and write
config.organization = name.toLowerCase()
```
- **Fix:** Wrap both `setOrganization()` and `adoptOrganization()` in `withLock()` (either the local one or preferably the shared one from file-lock.ts per CC-A5-002).


### [CC-A6-001] getSentCount counts top-level entries only, misses messages in subdirectories
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:737-740
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `getSentCount()` uses `readdirSync(sentDir)` and counts `.json` files at the top level of the sent directory. However, `writeToAMPSent()` in amp-inbox-writer.ts stores sent messages in `sent/{recipientDir}/{messageId}.json` -- a nested subdirectory structure. The top-level entries in the sent directory are recipient-name subdirectories (e.g., `alice/`, `bob@host/`), not `.json` files. This means `getSentCount()` always returns 0 for AMP-format sent messages.
- **Evidence:**
```typescript
// getSentCount (messageQueue.ts:737-740):
const entries = fsSync.readdirSync(sentDir)
return entries.filter(e => e.endsWith('.json')).length
// ^ Only counts .json at top level -- but messages are in subdirectories

// writeToAMPSent (amp-inbox-writer.ts:388-392) stores messages in subdirectories:
const recipientDir = sanitizeAddressForPath(envelope.to)
const sentRecipientDir = path.join(agentSentDir, recipientDir)
await fs.mkdir(sentRecipientDir, { recursive: true })
// Writes message as: sent/{recipientDir}/{messageId}.json
```
- **Fix:** Recurse into subdirectories to count `.json` files. Example:
```typescript
let count = 0
for (const entry of entries) {
  const entryPath = path.join(sentDir, entry)
  const stat = fsSync.statSync(entryPath)
  if (stat.isDirectory()) {
    const files = fsSync.readdirSync(entryPath)
    count += files.filter(f => f.endsWith('.json')).length
  } else if (entry.endsWith('.json')) {
    count++
  }
}
return count
```


### [CC-A7-001] MeetingRoom: creatingMeetingRef never reset on success path
- **File:** /Users/emanuelesabetta/ai-maestro/components/team-meeting/MeetingRoom.tsx:274-328
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `creatingMeetingRef.current` is set to `true` at line 274 but is only reset to `false` in the catch block (line 325). On the success path (lines 307-323), it is never reset. This means that if the first meeting creation succeeds, the ref permanently stays `true`, preventing any future meeting creation in the same component lifecycle (e.g., if the user ends and starts a new meeting without a full page reload).
- **Evidence:**
```typescript
// line 274
creatingMeetingRef.current = true
// ... try block ...
try {
  const res = await fetch('/api/meetings', { ... })
  const data = await res.json()
  if (data.meeting) {
    persistedMeetingIdRef.current = data.meeting.id
    window.history.replaceState(null, '', `/team-meeting?meeting=${data.meeting.id}`)
  }
  // NOTE: creatingMeetingRef.current is NEVER set to false here
} catch {
  creatingMeetingRef.current = false  // only reset on error
}
```
- **Fix:** Move `creatingMeetingRef.current = false` to a `finally` block (or after the inner try-catch) so it resets on both success and failure.

### [CC-A7-002] useGovernance: addAgentToTeam/removeAgentFromTeam fire-and-forget refresh without AbortSignal
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:268,314
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `addAgentToTeam` (line 268) and `removeAgentFromTeam` (line 314) call `refresh()` without an AbortSignal, unlike all other mutation methods (setPassword, assignManager, assignCOS) which use `mutationAbortRef`. This means these refreshes cannot be cancelled on unmount, potentially causing React state updates on an unmounted component.
- **Evidence:**
```typescript
// Line 268 (addAgentToTeam)
refresh() // CC-002: Intentionally fire-and-forget

// Line 314 (removeAgentFromTeam)
refresh() // CC-002: Intentionally fire-and-forget

// Compare with setPassword (line 177-179):
mutationAbortRef.current?.abort()
mutationAbortRef.current = new AbortController()
refresh(mutationAbortRef.current.signal)
```
- **Fix:** Use the same `mutationAbortRef` pattern for `addAgentToTeam` and `removeAgentFromTeam` refresh calls, consistent with the other mutation methods.


_No MUST-FIX issues found._

All 29 test files are structurally sound, with correct mock setups, proper beforeEach/afterEach cleanup, deterministic UUID counters, and no logic errors that would cause false positives or false negatives in the test suite.


### [CC-A9-001] server.mjs: unhandledRejection handler may silently lose crash logs
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:61
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `unhandledRejection` handler (line 56-72) writes to `path.join(process.cwd(), 'logs', 'crash.log')` but does NOT create the `logs/` directory first, unlike the `uncaughtException` handler at line 36-37 which explicitly calls `fs.mkdirSync(logsDir, { recursive: true })`. If an unhandled rejection occurs before the module-level `fs.mkdirSync` at line 369-371 runs (e.g., during a top-level import that rejects), the `appendFileSync` fails and the rejection is silently lost. While the try-catch at line 65-69 prevents a crash, the primary purpose of this handler (logging crash info for debugging) is defeated.
- **Evidence:**
  ```javascript
  // Line 56-72 (unhandledRejection) -- no mkdir:
  const crashLogPath = path.join(process.cwd(), 'logs', 'crash.log')
  fs.appendFileSync(crashLogPath, logEntry) // ENOENT if logs/ doesn't exist yet

  // Line 31-46 (uncaughtException) -- has mkdir:
  const logsDir = path.join(process.cwd(), 'logs')
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
  ```
- **Fix:** Add the same `mkdirSync` guard to the `unhandledRejection` handler:
  ```javascript
  const logsDir = path.join(process.cwd(), 'logs')
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
  const crashLogPath = path.join(logsDir, 'crash.log')
  ```

### [CC-A9-002] server.mjs: removeAllListeners on retry removes the early-close handler
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:490-492
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** In the `handleRemoteWorker` function, when a successful WebSocket connection to the remote worker opens (line 478), lines 490-492 call `clientWs.removeAllListeners('message')`, `clientWs.removeAllListeners('close')`, `clientWs.removeAllListeners('error')` to clean up listeners from previous retry attempts. However, this also removes the **early client disconnection handler** registered at line 575-580 (before `attemptConnection()` is called). That early-close handler sets `clientClosed = true` and terminates in-progress connections. After `removeAllListeners`, if the client disconnects and the remote worker also disconnects, there's no close handler on `clientWs` until the new one at line 533 is registered. The gap is minimal since the new handler is registered immediately after, but it's semantically incorrect to strip the fallback handler.
- **Evidence:**
  ```javascript
  // Line 574-580: Early close handler (registered before retries)
  clientWs.on('close', () => {
    clientClosed = true
    if (workerWs && workerWs.readyState === WebSocket.CONNECTING) {
      workerWs.terminate()
    }
  })

  // Line 490-492: Removes ALL listeners including the one above
  clientWs.removeAllListeners('message')
  clientWs.removeAllListeners('close')  // <-- removes the early handler
  clientWs.removeAllListeners('error')

  // Line 533-538: New close handler registered after
  clientWs.on('close', () => { ... })
  ```
- **Fix:** Instead of `removeAllListeners`, track named listeners from previous retry attempts and remove only those, or move the early-close handler registration inside the `on('open')` callback (since it's re-registered each time anyway). Alternatively, keep the removeAllListeners but register the new close handler immediately afterwards (which is actually what happens -- the gap is negligible in practice, so this could be downgraded to SHOULD-FIX if confirmed acceptable).


---

## SHOULD-FIX Issues


### [CC-A0-002] Inconsistent use of `new URL(request.url)` vs `request.nextUrl.searchParams`
- **File:** app/api/agents/[id]/messages/route.ts:19, app/api/agents/[id]/playback/route.ts:24, app/api/agents/[id]/repos/route.ts:77
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Several route files use `new URL(request.url)` with native `Request` type while most other routes use `request.nextUrl.searchParams` via `NextRequest`. While both work, `new URL(request.url)` allocates a new URL object unnecessarily. In `messages/route.ts:19`, this is a `NextRequest` parameter so `request.nextUrl.searchParams` is available and preferred. In `playback/route.ts:24` and `repos/route.ts:77`, the parameter is typed as `Request` (not `NextRequest`), so `new URL()` is the only option -- but using `NextRequest` would be more consistent with the rest of the codebase.
- **Evidence:**
  ```typescript
  // messages/route.ts:19 - Has NextRequest but uses new URL
  const { searchParams } = new URL(request.url)

  // Versus the norm elsewhere:
  const searchParams = request.nextUrl.searchParams
  ```
- **Fix:** In `messages/route.ts`, replace `new URL(request.url)` with `request.nextUrl.searchParams`. In `playback/route.ts` and `repos/route.ts`, change the parameter type from `Request` to `NextRequest` and use `request.nextUrl.searchParams` for consistency. (Low functional impact but improves consistency across ~30 route files.)

### [CC-A0-003] `playback/route.ts` and `repos/route.ts` use `Request` instead of `NextRequest`
- **File:** app/api/agents/[id]/playback/route.ts:15,42 and app/api/agents/[id]/repos/route.ts:16,40,68
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** These route handlers use the native `Request` type instead of Next.js `NextRequest`. While this works in Next.js App Router, it means they lack access to `nextUrl`, `cookies`, `geo`, and other NextRequest extensions. More importantly, it's inconsistent with the other 28+ route files in this domain that all use `NextRequest`.
- **Evidence:**
  ```typescript
  // playback/route.ts
  export async function GET(
    request: Request,  // Should be NextRequest
    { params }: { params: Promise<{ id: string }> }
  )
  ```
- **Fix:** Change `Request` to `NextRequest` and import from `next/server`.

### [CC-A0-004] `route.ts` (main agent CRUD) uses `Request` instead of `NextRequest`
- **File:** app/api/agents/[id]/route.ts:11,38,70
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The main agent route (`GET/PATCH/DELETE`) uses native `Request` type. The `GET` handler does not need the request object (it only uses params), but `PATCH` and `DELETE` parse the body or URL which would benefit from `NextRequest`. The DELETE handler on line 79 creates `new URL(request.url)` which is unnecessary with `NextRequest`.
- **Evidence:**
  ```typescript
  // route.ts:70
  export async function DELETE(
    request: Request,  // Should be NextRequest
  ```
- **Fix:** Change to `NextRequest` for consistency with the rest of the codebase.

### [CC-A0-005] `export/route.ts` uses `Request` type instead of `NextRequest`
- **File:** app/api/agents/[id]/export/route.ts:15,53
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-A0-003/004 -- uses native `Request` type instead of `NextRequest`.
- **Evidence:**
  ```typescript
  export async function GET(
    _request: Request,
  ```
- **Fix:** Change to `NextRequest`.

### [CC-A0-006] `session/route.ts` POST handler uses `Request` instead of `NextRequest`
- **File:** app/api/agents/[id]/session/route.ts:15
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The POST handler on line 15 uses `Request`, while the PATCH, GET, and DELETE handlers in the same file use `NextRequest`. This inconsistency within a single file is more notable.
- **Evidence:**
  ```typescript
  // Line 15 - POST uses Request
  export async function POST(
    request: Request,

  // Line 46 - PATCH uses NextRequest
  export async function PATCH(
    request: NextRequest,
  ```
- **Fix:** Change the POST handler's `Request` to `NextRequest`.

### [CC-A0-007] `export/route.ts` X-Agent-Name header not sanitized for header injection
- **File:** app/api/agents/[id]/export/route.ts:39
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `agentName` value is placed directly into the `X-Agent-Name` HTTP response header without sanitization. While the filename on line 36 is properly sanitized with `.replace(/["\r\n\\]/g, '_')`, the `X-Agent-Name` header uses the raw value. If an agent name somehow contains newline characters (`\r\n`), this could enable HTTP header injection. Agent names are lowercased in the registry but not validated against a strict charset, so this is a defense-in-depth concern.
- **Evidence:**
  ```typescript
  // Line 36: filename sanitized
  'Content-Disposition': `attachment; filename="${filename.replace(/["\r\n\\]/g, '_')}"`,
  // Line 39: agentName NOT sanitized
  'X-Agent-Name': agentName,
  ```
- **Fix:** Sanitize `agentName` before putting it in the header: `'X-Agent-Name': agentName.replace(/[\r\n]/g, '')` or validate agent names against a strict regex at registration time.


### [CC-A1-002] Missing outer try-catch in config/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/config/route.ts:5-11
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The GET handler has no try-catch wrapper. While `getSystemConfig()` internally handles its own errors, any unexpected throw (e.g., from `NextResponse.json()` serialization) would result in an uncontrolled 500 error from Next.js rather than a structured JSON error response. Every other route in this codebase has an outer try-catch; this one is inconsistent.
- **Evidence:**
  ```typescript
  export async function GET() {
    const result = getSystemConfig()
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  }
  // No try-catch wrapper
  ```
- **Fix:** Wrap in try-catch with `{ error: 'Internal server error' }, { status: 500 }` fallback, consistent with all other routes.

### [CC-A1-003] Missing outer try-catch in conversations/[file]/messages/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/conversations/[file]/messages/route.ts:8-35
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The GET handler has no try-catch wrapper. `decodeURIComponent()` at line 15 can throw `URIError` on malformed percent-encoded sequences (e.g., `%zz`). The async `getConversationMessages()` call could also throw unexpectedly. Both would produce uncontrolled 500 errors.
- **Evidence:**
  ```typescript
  export async function GET(request: NextRequest, { params }: ...) {
    const { file: encodedFile } = await params
    const decodedFile = decodeURIComponent(encodedFile) // can throw URIError
    // ... no try-catch wrapper
  }
  ```
- **Fix:** Wrap the entire handler body in try-catch, consistent with all other route handlers in the codebase.

### [CC-A1-004] Missing outer try-catch in domains/[id]/route.ts (GET, PATCH, DELETE)
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/domains/[id]/route.ts:8-57
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** None of the three handlers (GET, PATCH, DELETE) have outer try-catch wrappers. While the service functions have internal try-catches, the PATCH handler's `await request.json()` try-catch does not cover the `await params` or the service call. GET and DELETE have no error handling at all for unexpected throws.
- **Evidence:**
  ```typescript
  export async function GET(_request: Request, { params }: ...) {
    const { id } = await params  // could throw
    const result = getDomainById(id)
    // no try-catch
  }
  ```
- **Fix:** Add outer try-catch to all three handlers.

### [CC-A1-005] Missing outer try-catch in domains/route.ts (GET and POST)
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/domains/route.ts:8-32
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** GET handler has no try-catch at all. POST handler has try-catch for JSON parsing but not around the service call `createNewDomain(body)`. If the service throws unexpectedly, Next.js returns an uncontrolled error.
- **Evidence:**
  ```typescript
  export async function GET() {
    const result = listAllDomains() // no try-catch wrapper
    // ...
  }
  ```
- **Fix:** Add outer try-catch wrappers to both handlers.

### [CC-A1-006] Missing outer try-catch in export/jobs/[jobId]/route.ts (GET and DELETE)
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/export/jobs/[jobId]/route.ts:8-46
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Neither GET nor DELETE has an outer try-catch. While the service functions are currently placeholder implementations unlikely to throw, this is inconsistent with the codebase pattern and will become a real issue when real implementations replace the placeholders.
- **Evidence:**
  ```typescript
  export async function GET(request: Request, { params }: ...) {
    const { jobId } = await params
    const result = getExportJobStatus(jobId)
    // no try-catch
  }
  ```
- **Fix:** Add outer try-catch to both handlers for consistency and forward safety.

### [CC-A1-007] Inconsistent `||` vs `??` for auth.status fallback in transfers/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:60
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The POST handler uses `auth.status || 401` while the resolve route at `transfers/[id]/resolve/route.ts:33` uses `auth.status ?? 401`. With `||`, a status of `0` would be replaced by `401`. While `0` is not a realistic HTTP status, `??` is the correct operator for "use default only when null/undefined" and was already applied in the sibling route. This was likely missed during a previous fix pass.
- **Evidence:**
  ```typescript
  // transfers/route.ts:60
  return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })

  // transfers/[id]/resolve/route.ts:33 (already fixed)
  return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 })
  ```
- **Fix:** Change `auth.status || 401` to `auth.status ?? 401` on line 60 of transfers/route.ts.

### [CC-A1-008] SSRF: health proxy endpoint allows requests to internal/cloud metadata URLs
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/health/route.ts:25-32
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The health proxy validates the URL scheme (http/https only, preventing `file://` etc.), but does not restrict the hostname. An attacker with localhost access could use this endpoint to probe internal services (e.g., `http://169.254.169.254/latest/meta-data/` on cloud instances, or `http://127.0.0.1:OTHER_PORT/internal-api`). While Phase 1 is localhost-only, this endpoint could become an SSRF vector if the application is ever exposed to a network.
- **Evidence:**
  ```typescript
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 })
  }
  // No hostname restriction -- 169.254.x.x, 127.0.0.1, 10.x.x.x all allowed
  ```
- **Fix:** Add a hostname allowlist or blocklist. At minimum, block RFC 1918 private ranges, link-local (169.254.x.x), and loopback (127.x.x.x) unless explicitly intended. Alternatively, restrict to known Tailscale/peer host addresses from `hosts.json`.


### [CC-A2-003] Documents PUT route passes raw body spread to service without field whitelisting
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts`:56
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The PUT handler passes `{ ...body, requestingAgentId }` directly to `updateTeamDocument`. While the service layer (teams-service.ts:608-612) does whitelist fields before updating, the route layer does not perform its own field whitelisting. This differs from the pattern used in `POST /api/teams/[id]/documents` (line 59 of that route) which explicitly destructures `{ title, content, pinned, tags }`. Defense-in-depth requires both layers to whitelist, as noted in the SF-015 comment on teams/[id]/route.ts:57-58.
- **Evidence:**
  ```typescript
  // teams/[id]/documents/[docId]/route.ts:56
  const result = await updateTeamDocument(id, docId, { ...body, requestingAgentId })

  // vs. teams/[id]/documents/route.ts:59 (POST - properly whitelisted)
  const { title, content, pinned, tags } = body
  const result = await createTeamDocument(id, { title, content, pinned, tags, requestingAgentId })
  ```
- **Fix:** Whitelist fields at the route level: `const { title, content, pinned, tags } = body; const result = await updateTeamDocument(id, docId, { title, content, pinned, tags, requestingAgentId })`.

### [CC-A2-004] `createNewTeam` route passes raw body spread without field whitelisting
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`:38
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** `POST /api/teams` passes `{ ...body, requestingAgentId }` to `createNewTeam`. While the service validates some fields (`name`, `agentIds`, `type`), any arbitrary fields in `body` are forwarded to the service layer. If `createNewTeam` or its dependencies ever use object spread to pass through to a lower layer, extra fields could leak.
- **Evidence:**
  ```typescript
  // app/api/teams/route.ts:38
  const result = await createNewTeam({ ...body, requestingAgentId })
  ```
- **Fix:** Whitelist expected fields: `const { name, description, agentIds, type } = body` then `createNewTeam({ name, description, agentIds, type, requestingAgentId })`.

### [CC-A2-005] `POST /api/sessions/activity/update` does not validate `sessionName` format
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/sessions/activity/update/route.ts`:17
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `sessionName` is extracted from the request body and passed to `broadcastActivityUpdate` without validating it matches the tmux session name format (`^[a-zA-Z0-9_-]+$`). The service only checks for empty string. Other session routes validate this constraint (e.g., `createSession` in sessions-service.ts:542).
- **Evidence:**
  ```typescript
  // activity/update/route.ts:17
  const { sessionName, status, hookStatus, notificationType } = body
  // No sessionName format validation before:
  const result = broadcastActivityUpdate(sessionName, status, hookStatus, notificationType)
  ```
- **Fix:** Add `if (!sessionName || typeof sessionName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(sessionName)) return NextResponse.json({ error: 'Invalid sessionName' }, { status: 400 })`.

### [CC-A2-006] Marketplace skill `[id]` route lacks input validation on the id parameter
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/marketplace/skills/[id]/route.ts`:18
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `id` parameter (format: `marketplace:plugin:skill`) is passed directly to `getMarketplaceSkillById` with no format validation. Given this is a compound ID with colons, it should at minimum be checked for length limits and disallowed characters (path separators, null bytes) to prevent potential injection if the service does any file path construction with it.
- **Evidence:**
  ```typescript
  export async function GET(_request: NextRequest, { params }) {
    const { id } = await params
    const result = await getMarketplaceSkillById(id)  // no validation
  ```
- **Fix:** Add basic validation: e.g. `if (!id || id.length > 200 || /[\/\\\0]/.test(id)) return 400`.

### [CC-A2-007] Webhook event type reflected in error message without truncation
- **File:** `/Users/emanuelesabetta/ai-maestro/services/webhooks-service.ts`:98
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When an invalid event type is provided to `createNewWebhook`, it is reflected directly in the error message: `Invalid event type: ${event}`. The governance routes truncate reflected values to 50 chars (SF-057). While this is a JSON API (not HTML), an attacker could send an extremely long string as an event type, causing a large error response. This is inconsistent with the truncation pattern used elsewhere.
- **Evidence:**
  ```typescript
  // services/webhooks-service.ts:98
  return { error: `Invalid event type: ${event}. Valid events: ${VALID_EVENTS.join(', ')}`, status: 400 }
  ```
- **Fix:** Truncate the reflected event value: `${String(event).slice(0, 50)}`.

### [CC-A2-008] `hosts/health` route has redundant `if (hostUrl)` check after early return
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/hosts/health/route.ts`:23
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Line 16-18 checks `if (!hostUrl)` and returns 400. Line 23 then checks `if (hostUrl)` which is always true at that point (since the falsy case already returned). This is dead code / misleading, making the SSRF protection block appear conditional when it is not.
- **Evidence:**
  ```typescript
  // Line 16-18: Early return if hostUrl is empty
  if (!hostUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }
  // Line 23: Redundant check -- hostUrl is always truthy here
  if (hostUrl) {
  ```
- **Fix:** Remove the `if (hostUrl) {` wrapper on line 23 and its closing `}` on line 70 -- the SSRF protection should always execute (and it does, since hostUrl is guaranteed non-empty).


### [CC-P10-A3-003] `config-service.ts` uses `execSync` with shell for PTY debug commands
- **File:** services/config-service.ts:515-523
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `getPtyDebugInfo()` function uses `execSync()` with shell commands (lines 515, 518, 521-523). While the commands are hardcoded strings with no user input (documented by comment "Safe: fixed command strings"), the general pattern is inconsistent with the rest of the codebase which has been migrated to `execFileSync` to prevent shell injection. The `execSync` import at line 24 exists only for these usages. Since these commands use shell features (piping, `2>/dev/null`), they cannot trivially be converted to `execFileSync`, but they should ideally be refactored to avoid shell invocation.
- **Evidence:**
```typescript
// Line 515
const limitOutput = execSync('sysctl -n kern.tty.ptmx_max 2>/dev/null || echo 511', { encoding: 'utf8' })
// Line 518
const ptyCountOutput = execSync('ls /dev/ttys* 2>/dev/null | wc -l', { encoding: 'utf8' })
// Line 521-522
const lsofOutput = execSync(
  "lsof /dev/ttys* 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -10",
  { encoding: 'utf8' }
)
```
- **Fix:** Refactor to use `execFileSync` with separate process calls and in-JS data processing, or wrap in `try/catch` around `execFileSync('sysctl', ['-n', 'kern.tty.ptmx_max'])` etc. Not critical since there is no user input, but eliminates the inconsistency.

### [CC-P10-A3-004] `config-service.ts` uses `execAsync` (shell) for Docker version check
- **File:** services/config-service.ts:578
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `getDockerInfo()` uses `execAsync("docker version --format '{{.Server.Version}}'")` which invokes a shell. This is inconsistent with `agents-docker-service.ts` which uses `execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'])` for the same purpose (line 93). No user input is involved, but the `exec` import at line 25 exists only for this usage.
- **Evidence:**
```typescript
// Line 578
const { stdout } = await execAsync("docker version --format '{{.Server.Version}}'", {
  timeout: 5000,
})
```
- **Fix:** Replace with `execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'])` as in `agents-docker-service.ts`.

### [CC-P10-A3-005] `ServiceResult<any>` used pervasively instead of specific types
- **File:** Multiple service files
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Nearly all service functions return `ServiceResult<any>` or `ServiceResult<Record<string, unknown>>`. This eliminates compile-time type checking for callers. The comment at `agents-docs-service.ts:25` acknowledges this: "NT-036: TODO: Replace ServiceResult<any> with specific result types across service files." This is a known debt item but the pervasiveness (across all 17 service files) means callers have zero type safety for return values.
- **Evidence:** `agents-memory-service.ts`, `agents-graph-service.ts`, `agents-messaging-service.ts`, `agents-docs-service.ts`, `agents-subconscious-service.ts`, `config-service.ts` -- all public functions use `ServiceResult<any>`.
- **Fix:** Define specific result types for each service function return value. This is a larger refactoring task flagged as NT-036.

### [CC-P10-A3-006] `agents-directory-service.ts` uses `ServiceResult<any>` in all functions
- **File:** services/agents-directory-service.ts:35,54,90,120,146
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** All 5 functions in this service return `ServiceResult<any>`, which defeats type checking. `getDirectory()`, `lookupAgentByDirectoryName()`, `syncDirectory()`, `diagnoseHosts()`, and `normalizeHosts()` should all have specific result types.
- **Evidence:**
```typescript
export function getDirectory(): ServiceResult<any> { ... }
export function lookupAgentByDirectoryName(name: string): ServiceResult<any> { ... }
export async function syncDirectory(): Promise<ServiceResult<any>> { ... }
```
- **Fix:** Define typed return interfaces for each.

### [CC-P10-A3-007] `agents-memory-service.ts` functions inconsistently handle agent validation
- **File:** services/agents-memory-service.ts (multiple functions)
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The memory service has two different agent lookup patterns: (1) `agentRegistry.getAgent()` (in-memory, auto-creates) used by most functions, and (2) `getAgentFromFileRegistry()` (file-based, returns null) used by `getMetrics()` and `updateMetrics()`. Functions using pattern (1) will silently create database directories for non-existent agents, while functions using pattern (2) properly return 404. This inconsistency means some endpoints accept arbitrary agentIds while others correctly validate.
- **Evidence:**
```typescript
// Pattern 1 (no validation): getMemory, initializeMemory, getConsolidationStatus, etc.
const agent = await agentRegistry.getAgent(agentId) // auto-creates

// Pattern 2 (proper validation): getMetrics
const agent = getAgentFromFileRegistry(agentId)
if (!agent) {
  return { error: 'Agent not found', status: 404 }
}
```
- **Fix:** Add file-based registry validation before `agentRegistry.getAgent()` calls throughout the service.


### [CC-A4-003] `exchangePeers` calls `getHosts()` inside the per-peer loop, re-reading the file on each iteration
- **File:** /Users/emanuelesabetta/ai-maestro/services/hosts-service.ts:1009
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Inside the `exchangePeers` function's `for (const peerHost of uniqueHosts)` loop (line 987-1019), each iteration calls `getHosts()` at line 1009 to check for URL duplicates. Since `getHosts()` reads from disk (or cache), and the loop itself adds hosts via `addHostAsync` (line 1059) which invalidates the cache (line 1069), this results in repeated file reads. The call should be hoisted before the loop and updated only when needed.
- **Evidence:**
  ```typescript
  for (const peerHost of uniqueHosts) {
    // ...
    // Check if URL already exists
    const hosts = getHosts()  // <-- re-read on every iteration
    const hostWithSameUrl = hosts.find(h => h.url === peerHost.url && !isSelf(h.id))
    // ...
  }
  ```
- **Fix:** Hoist `getHosts()` call before the loop and maintain a local URL set that gets updated when a host is added.

### [CC-A4-004] `checkHostHealth` uses manual AbortController + setTimeout instead of `AbortSignal.timeout()`
- **File:** /Users/emanuelesabetta/ai-maestro/services/hosts-service.ts:256-270
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `checkHostHealth` creates a manual `AbortController` + `setTimeout` combination for timeouts, but if `fetch` throws before the timeout fires (e.g., DNS failure), the `setTimeout` callback is never cleared. The same file's `makeHealthCheckRequest` (line 164) uses `AbortSignal.timeout()` which handles cleanup automatically. This is inconsistent and can leak timers.
- **Evidence:**
  ```typescript
  async function checkHostHealth(url: string, timeoutMs: number = 5000): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      const response = await fetch(`${url}/api/config`, { signal: controller.signal })
      clearTimeout(timeout)  // only reached on success
      return response.ok
    } catch {
      return false  // timeout never cleared on error path
    }
  }
  ```
- **Fix:** Either add `clearTimeout(timeout)` in the catch block, or switch to `AbortSignal.timeout(timeoutMs)` like the other fetch calls in the same file.

### [CC-A4-005] `getMeshStatus` also uses manual AbortController + setTimeout with the same timer leak
- **File:** /Users/emanuelesabetta/ai-maestro/services/hosts-service.ts:610-616
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-A4-004. Inside `getMeshStatus`'s `healthChecks` map, a manual `AbortController` + `setTimeout` is used. On `fetch` failure (catch block), `clearTimeout` is never called, leaking the timer.
- **Evidence:**
  ```typescript
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  const response = await fetch(`${peer.url}/api/config`, { signal: controller.signal })
  clearTimeout(timeout)
  // ...
  } catch {
    return { ... reachable: false ... }  // timeout not cleared
  }
  ```
- **Fix:** Add `clearTimeout(timeout)` at the top of the catch block, or switch to `AbortSignal.timeout(5000)`.

### [CC-A4-006] `forwardMessage` does not validate `fromSession` / `toSession` format
- **File:** /Users/emanuelesabetta/ai-maestro/services/messages-service.ts:321-367
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** `forwardMessage` validates that `fromSession !== toSession` but does not validate the format of `fromSession` or `toSession`. These strings are passed directly to `forwardFromUI` which will use them as agent identifiers for file system lookups. While `forwardFromUI` likely resolves them safely through the agent registry, the service layer should validate inputs before passing them downstream.
- **Evidence:**
  ```typescript
  export async function forwardMessage(params: ForwardMessageParams): Promise<ServiceResult<any>> {
    const { messageId, originalMessage, fromSession, toSession, forwardNote } = params
    if ((!messageId && !originalMessage) || !fromSession || !toSession) {
      return { error: '...', status: 400 }
    }
    if (fromSession === toSession) {
      return { error: '...', status: 400 }
    }
    // No format validation on fromSession/toSession
    const result = await forwardFromUI({ ... })
  ```
- **Fix:** Add basic format validation (e.g., length limit, no control characters) for `fromSession` and `toSession` before passing them to `forwardFromUI`.

### [CC-A4-007] `renameSession` cloud agent path overwrites `agentConfig.id` with the new name, corrupting the UUID
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:733-734
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When renaming a cloud agent, the code sets `agentConfig.id = newName` and `agentConfig.name = newName`. If the agent's `id` field is supposed to be a UUID (as it is for all other agents in the registry), this overwrites the UUID with a human-readable name, breaking any UUID-based lookups or cross-references (e.g., team membership `agentIds`, governance requests, etc.).
- **Evidence:**
  ```typescript
  const agentConfig = JSON.parse(fs.readFileSync(oldAgentFilePath, 'utf8'))
  agentConfig.id = newName      // <-- overwrites UUID with name string
  agentConfig.name = newName
  agentConfig.alias = newName
  ```
- **Fix:** Only update `agentConfig.name` and `agentConfig.alias` with the new name. Keep `agentConfig.id` as the original UUID. Also update the agent registry via `renameAgentSession` (which is called on line 741) rather than directly manipulating JSON files.

### [CC-A4-008] `listSessions` return type does not include ServiceResult wrapper
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:440
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `listSessions` returns `Promise<{ sessions: Session[]; fromCache: boolean }>` instead of `Promise<ServiceResult<{ sessions: Session[]; fromCache: boolean }>>`. This is inconsistent with every other public function in the services layer, which all return `ServiceResult<T>`. The headless-router likely wraps this manually, but any new callers expecting `ServiceResult` will get type errors.
- **Evidence:**
  ```typescript
  export async function listSessions(): Promise<{ sessions: Session[]; fromCache: boolean }> {
  ```
  Compare with other functions in the same file:
  ```typescript
  export async function createSession(params: CreateSessionParams): Promise<ServiceResult<...>> {
  ```
- **Fix:** Wrap the return in `ServiceResult` format: `return { data: { sessions, fromCache }, status: 200 }`.

### [CC-A4-009] `checkIdleStatus` does not follow ServiceResult pattern
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:803-822
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `checkIdleStatus` returns a raw object instead of `ServiceResult<T>`. Same issue as CC-A4-008.
- **Evidence:**
  ```typescript
  export async function checkIdleStatus(sessionName: string): Promise<{
    sessionName: string; exists: boolean; idle: boolean; ...
  }> {
  ```
- **Fix:** Wrap in `ServiceResult` to match the pattern.

### [CC-A4-010] `listRestorableSessions` does not follow ServiceResult pattern
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:827-836
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-A4-008 and CC-A4-009 -- raw return instead of `ServiceResult`.
- **Evidence:**
  ```typescript
  export async function listRestorableSessions(): Promise<{ sessions: any[]; count: number }> {
  ```
- **Fix:** Wrap in `ServiceResult`.

### [CC-A4-011] `getActivity` does not follow ServiceResult pattern
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:476-513
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-A4-008 -- raw return instead of `ServiceResult`.
- **Evidence:**
  ```typescript
  export async function getActivity(): Promise<Record<string, SessionActivityInfo>> {
  ```
- **Fix:** Wrap in `ServiceResult`.


### [CC-A5-004] governance-peers.ts: `deletePeerGovernance()` is not protected by file lock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-peers.ts:80-86
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `savePeerGovernance()` is protected by `withLock('governance-peers-${hostId}')` (line 65) but `deletePeerGovernance()` is synchronous and unprotected. A concurrent save and delete for the same hostId could race: the save writes a temp file + renames, while the delete calls `unlinkSync` -- the end state is nondeterministic.
- **Evidence:**
```typescript
// governance-peers.ts:80-86 -- no lock
export function deletePeerGovernance(hostId: string): void {
  validateHostId(hostId)
  const filePath = path.join(PEERS_DIR, `${hostId}.json`)
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}
```
- **Fix:** Make `deletePeerGovernance()` async and wrap in `withLock('governance-peers-${hostId}')`.

### [CC-A5-005] host-keys.ts: Atomic write for private key uses generic `.tmp` suffix without `process.pid`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/host-keys.ts:54-55
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Other files in the codebase include `process.pid` in the temp file suffix (governance.ts:82, governance-request-registry.ts:76, team-registry.ts:247, etc.) to ensure multi-process safety. `host-keys.ts` uses a bare `.tmp` suffix. While key generation typically happens only once, if two processes race to generate keys simultaneously, they would both write to the same `.tmp` file, potentially causing corruption.
- **Evidence:**
```typescript
// host-keys.ts:54-55
const privateTmp = PRIVATE_KEY_PATH + '.tmp'
const publicTmp = PUBLIC_KEY_PATH + '.tmp'
```
Compare with governance.ts:82:
```typescript
const tmpFile = GOVERNANCE_FILE + `.tmp.${process.pid}`
```
- **Fix:** Add `process.pid` to temp file names: `PRIVATE_KEY_PATH + '.tmp.' + process.pid`.

### [CC-A5-006] team-registry.ts: `createTeam()` returns `chiefOfStaffId: ... ?? null` but the `??` coalesces `undefined` to `null` when `sanitized.chiefOfStaffId` is deliberately `undefined`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:281-283
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The ternary at lines 281-283 checks if `result.sanitized.chiefOfStaffId !== undefined`. If `sanitized` has no `chiefOfStaffId` key, it falls through to `data.chiefOfStaffId`. But `data.chiefOfStaffId` is typed as `string | undefined` (optional), and the trailing `?? null` converts `undefined` to `null`. This means if the caller intentionally omits `chiefOfStaffId` (meaning "no COS"), the value becomes `null` -- which is actually correct behavior per the codebase convention (comment SF-038). However, the code path is confusing: `result.sanitized.chiefOfStaffId` could be the value `null` (explicitly set by G5 downgrade), but the `!== undefined` check would catch it, and `null as string | null` would be `null`. The logic works but is overly complex.
- **Evidence:**
```typescript
chiefOfStaffId: (result.sanitized.chiefOfStaffId !== undefined
  ? result.sanitized.chiefOfStaffId as string | null
  : data.chiefOfStaffId) ?? null,
```
- **Fix:** Consider simplifying to: `chiefOfStaffId: (result.sanitized.chiefOfStaffId as string | null | undefined) ?? data.chiefOfStaffId ?? null`. Or add a comment explaining the three-way fallback chain.

### [CC-A5-007] hosts-config.ts: `updateHost()` uses case-sensitive ID comparison while `addHost()` uses case-insensitive
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:689 vs 636
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `addHost()` at line 636 uses `h.id.toLowerCase() === host.id.toLowerCase()` for duplicate detection, but `updateHost()` at line 689 uses `h.id === hostId` (case-sensitive). This means a host added as `Mac-Mini` could not be found by `updateHost('mac-mini', ...)` even though `addHost()` would consider them the same.
- **Evidence:**
```typescript
// addHost line 636 -- case-insensitive
const existingById = currentHosts.find(h => h.id.toLowerCase() === host.id.toLowerCase())

// updateHost line 689 -- case-sensitive
const hostIndex = currentHosts.findIndex(h => h.id === hostId)
```
- **Fix:** Use case-insensitive comparison in `updateHost()`: `h.id.toLowerCase() === hostId.toLowerCase()`. Same issue in `deleteHost()` at line 739.

### [CC-A5-008] hosts-config.ts: `deleteHost()` uses case-sensitive filter but case-insensitive lookup elsewhere
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:739, 755
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `deleteHost()` finds the host with `h.id === hostId` (line 739) but also filters with `h.id !== hostId` (line 755). Both are case-sensitive. If host IDs were normalized to lowercase on write (via `migrateHost()`), this should be fine -- but `addHost()` does NOT normalize to lowercase before saving (it passes the host object directly). So a host added with mixed-case ID would not be deletable with a lowercase hostId.
- **Evidence:**
```typescript
// deleteHost line 739
const host = currentHosts.find(h => h.id === hostId)
// deleteHost line 755
const updatedHosts = currentHosts.filter(h => h.id !== hostId)
```
- **Fix:** Use case-insensitive comparison: `h.id.toLowerCase() === hostId.toLowerCase()` and normalize on add.

### [CC-A5-009] governance-sync.ts: `broadcastGovernanceSync()` signs data with its own timestamp, different from message timestamp
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-sync.ts:101, 122-123
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The function creates `message.timestamp` at line 101 and then a separate `timestamp` at line 122 for signature computation. These two timestamps are generated from different `new Date().toISOString()` calls and may differ by milliseconds. The receiver would need to verify the signature using the `X-Host-Timestamp` header value (line 123), not the `message.timestamp` -- but the receiver code (`handleGovernanceSyncMessage`) does not verify the Ed25519 signature from the HTTP headers at all (it trusts the request was validated by the API route layer). This is a minor double-timestamp inconsistency.
- **Evidence:**
```typescript
// Line 101 -- message envelope timestamp
timestamp: new Date().toISOString(),

// Lines 122-123 -- signature timestamp (separate Date object)
const timestamp = new Date().toISOString()
const signedData = `gov-sync|${selfHostId}|${timestamp}`
```
- **Fix:** Use a single `const now = new Date().toISOString()` for both the message timestamp and the signature data, ensuring consistency.

### [CC-A5-010] message-filter.ts: Step 5 "closed-team member" allows messaging to MANAGER but Step 5b (open-world to MANAGER) is unreachable via Step 5
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:154-171, 174-181
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In Step 5 (lines 154-171), a closed-team member who wants to message the MANAGER falls through to the `return { allowed: false, reason: 'Closed team members can only message within their team' }` at line 170 because the MANAGER is NOT checked as a valid recipient for closed-team members. The MANAGER may not be in the same team as the member. Looking at the governance rules (R6.1), closed-team members should be able to reach their team's COS (line 164 handles this) but the rules do NOT explicitly allow normal members to message the MANAGER directly -- only COS can (R6.2). So this may be intentional. However, the code comment on Step 5 says "Normal closed-team member" and the rules say "can only message within their team" -- which is correct. The MANAGER is reachable via COS as intermediary. No actual bug here on closer inspection; the filter correctly enforces that normal members cannot directly reach MANAGER.
- **Evidence:**
```typescript
// Step 5 does NOT have: if (agentIsManager(recipientAgentId)) return { allowed: true }
// This is intentional per R6.1
```
- **Fix:** This is actually correct behavior per R6.1. Downgrading from SHOULD-FIX. However, the comment at line 174 "Step 5b: Open-world agents can reach MANAGER and COS" should clarify it only applies to open-world senders. Consider adding a brief comment in Step 5 clarifying that closed-team members cannot directly message MANAGER (must go through COS).


### [CC-A6-002] index-delta acquireIndexSlot timeout-rejection entry may match wrong queue item
- **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:59
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The timeout handler in `acquireIndexSlot` finds the queue entry by matching both `agentId` and `timestamp` (line 59). If the same agentId happens to call `acquireIndexSlot` twice at the exact same millisecond (e.g., rapid API retries), both entries share `agentId` and `timestamp`, so `findIndex` would return the first one, and the timeout for the second entry could splice the wrong queue item. While unlikely due to `Date.now()` millisecond granularity, it is a correctness concern.
- **Evidence:**
```typescript
const idx = indexQueue.findIndex(q => q.agentId === agentId && q.timestamp === entry.timestamp)
```
- **Fix:** Use the `entry` object reference directly for identification: `const idx = indexQueue.indexOf(entry)`. This is simpler and always correct regardless of timestamp collisions.

### [CC-A6-003] agent-registry updateAgent tmux rename uses base name, not computed session name
- **File:** /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts:506
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `updateAgent()`, when renaming an agent, the code checks `sessionExistsSync(currentName)` using the raw agent name, not the computed session name (which includes `_0` suffix for session index). The actual tmux session name is computed via `computeSessionName(agentName, sessionIndex)`. So if the session is named `myagent_0`, `sessionExistsSync('myagent')` will return false (tmux has-session doesn't match partial names), and the tmux rename is silently skipped.
- **Evidence:**
```typescript
// agent-registry.ts:506-508
if (sessionExistsSync(currentName)) {
  renameSessionSync(currentName, newName)
  console.log(`[Agent Registry] Renamed tmux session: ${currentName} -> ${newName}`)
}
```
- **Fix:** Iterate through the agent's sessions array and use `computeSessionName(currentName, s.index)` / `computeSessionName(newName, s.index)` for each, similar to how `killAgentSessions()` (line 619-636) iterates `agent.sessions`.

### [CC-A6-004] agent-registry renameAgent does not rename tmux sessions (only updateAgent does)
- **File:** /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts:1060-1126
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `renameAgent()` updates the agent name in the registry, updates AMP index, and updates config.json, but does NOT rename the tmux session. The tmux session rename only happens in `updateAgent()` (lines 503-514). So when `renameAgent()` is called directly (e.g., from `renameAgentSession` on line 1144, or from API routes), the tmux session keeps its old name while the registry points to the new name, creating a mismatch.
- **Evidence:**
```typescript
// renameAgent (lines 1060-1126): no tmux rename code
export async function renameAgent(agentId: string, newName: string): Promise<boolean> {
  return withLock('agents', () => {
    // ... updates registry, saves, updates AMP index ...
    // NO call to renameSessionSync anywhere
    return saved
  })
}

// updateAgent (lines 503-514): DOES rename tmux session
if (sessionExistsSync(currentName)) {
  renameSessionSync(currentName, newName)
}
```
- **Fix:** Add tmux session renaming to `renameAgent()` for each session in the agent's sessions array. Iterate through `agents[index].sessions` and call `renameSessionSync(computeSessionName(oldName, s.index), computeSessionName(normalizedNewName, s.index))`.

### [CC-A6-005] message-send forwardFromUI marks forwarded messages as fromVerified=true unconditionally
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:574
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** In `forwardFromUI()`, the forwarded message is always delivered with `senderPublicKeyHex: VERIFIED_LOCAL_SENDER` (line 574). The comment says "Forwards are always from a local verified agent." However, `forwardFromUI` only checks that the sender (`fromAgent`) resolves via `resolveAgentIdentifier`, which resolves any agent including those registered via AMP external API. An externally-registered agent with no cryptographic verification could forward a message, and the forwarded message would be marked as verified.
- **Evidence:**
```typescript
// message-send.ts:574
senderPublicKeyHex: VERIFIED_LOCAL_SENDER,  // CC-P4-008: Forwards are always from a local verified agent
```
- **Fix:** Check whether the sender agent is actually local and verified before using VERIFIED_LOCAL_SENDER. For AMP-external agents, omit the senderPublicKeyHex or use the actual key.

### [CC-A6-006] messageQueue getUnreadCount loads all messages just to count them
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:885-888
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `getUnreadCount()` calls `listInboxMessages(agentIdentifier, { status: 'unread' })` which reads and parses every message file in the inbox, converts AMP envelopes, applies filters, sorts by timestamp, and then returns an array. `getUnreadCount` only uses `.length`. For agents with many messages, this is very wasteful. Similarly, `getMessageStats()` (line 923) loads all messages just to count them. This is a performance issue that affects responsiveness.
- **Evidence:**
```typescript
export async function getUnreadCount(agentIdentifier: string): Promise<number> {
  const messages = await listInboxMessages(agentIdentifier, { status: 'unread' })
  return messages.length
}
```
- **Fix:** Add an optimized count-only path that reads only the `metadata.status` / `local.status` field from each JSON file without full conversion and sorting.


### [CC-A7-003] MessageCenter: selectedSuggestionIndex can go out of bounds
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx (compose view autocomplete)
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `selectedSuggestionIndex` state is used for keyboard navigation of autocomplete suggestions. When the `filteredAgents` array changes (user types more characters), the index may reference a position beyond the new array length, causing the highlighted suggestion to disappear or reference undefined. The index should be clamped when `filteredAgents` changes.
- **Evidence:** Based on the autocomplete pattern at lines ~1143-1200 where `selectedSuggestionIndex` drives `isSelected` comparison with `index` in the map, and `handleToKeyDown` presumably increments/decrements the index. If the user types a character that reduces `filteredAgents.length` below the current `selectedSuggestionIndex`, the UI highlights nothing.
- **Fix:** Add a `useEffect` that clamps `selectedSuggestionIndex` to `Math.min(selectedSuggestionIndex, filteredAgents.length - 1)` when `filteredAgents` changes, or reset to 0.

### [CC-A7-004] MeetingRoom: teamId resolution effect has no dependency on teamId changes from other effects
- **File:** /Users/emanuelesabetta/ai-maestro/components/team-meeting/MeetingRoom.tsx:376-404
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** The team ID resolution `useEffect` at line 376 checks `!teamId` but `teamId` is also set by other effects (line 257 in the team-param loader, line 299 in the meeting creation). Because multiple effects run asynchronously and all can set `teamId`, there is a potential race where this effect triggers a redundant team creation even though another effect already set `teamId` in the same render cycle. The `creatingTeamRef` guard mitigates double-creation but does not prevent the unnecessary fetch.
- **Evidence:**
```typescript
// Line 376-404
useEffect(() => {
  if (state.phase === 'active' && !teamId && state.teamName.trim()) {
    if (creatingTeamRef.current) return
    creatingTeamRef.current = true
    fetch('/api/teams')
      .then(r => r.json())
      .then(data => {
        // Creates team if not found...
      })
  }
}, [state.phase, state.teamName, state.selectedAgentIds, teamId])
```
- **Fix:** Consider combining the team creation logic into a single effect or callback to avoid redundant fetches. The `creatingTeamRef` guard helps but a cleaner architecture would use a single team resolution pathway.

### [CC-A7-005] AgentSkillEditor: canApprove hardcoded to true bypasses governance
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:85
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `canApprove` variable is hardcoded to `true` with a comment saying "Phase 1 localhost: canApprove always true." While this is documented, it means any user can approve or reject governance configuration requests without role checking. If this code ships to a multi-user environment, it would be a privilege escalation.
- **Evidence:**
```typescript
// Line 85
const canApprove = true
```
- **Fix:** This is a known Phase 1 limitation per the comment (SF-059). However, it should be tracked as tech debt. At minimum, add a TODO with a ticket reference for Phase 2.

### [CC-A7-006] TerminalView: localStorage reads on mount use empty deps but reference storageId
- **File:** /Users/emanuelesabetta/ai-maestro/components/TerminalView.tsx:520-536, 538-553
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `useEffect` at lines 520-536 and 538-553 have `// eslint-disable-next-line react-hooks/exhaustive-deps` and empty dependency arrays `[]`, but they reference `storageId` in their body. If `storageId` changes (e.g., due to a session ID change), the effects will not re-run and will use the stale `storageId` from the initial render. In the tab-based architecture this may be fine if each TerminalView is keyed by session, but if the same component is reused for different sessions, notes/prompts would load for the wrong session.
- **Evidence:**
```typescript
// Line 520-536
useEffect(() => {
  try {
    const key = `agent-notes-${storageId}`  // storageId from props/derived
    const savedNotes = localStorage.getItem(key)
    // ...
  } catch { /* ... */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])  // Empty deps, storageId not included
```
- **Fix:** If the component is guaranteed to be keyed by session (which the tab architecture implies), this is acceptable. Add a comment documenting this assumption explicitly. If not guaranteed, add `storageId` to the dependency array.

### [CC-A7-007] useGovernance: requestTransfer and resolveTransfer call refresh() without AbortSignal
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:397,417
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-A7-002. `requestTransfer` (line 397) and `resolveTransfer` (line 417) call `refresh()` without an AbortSignal, inconsistent with `setPassword`, `assignManager`, and `assignCOS` which all use `mutationAbortRef`.
- **Evidence:**
```typescript
// Line 397
refresh() // CC-002: Intentionally fire-and-forget

// Line 417
refresh() // CC-002: Intentionally fire-and-forget
```
- **Fix:** Use the `mutationAbortRef` pattern consistently across all mutation methods.

### [CC-A7-008] useGovernance: submitConfigRequest and resolveConfigRequest also skip AbortSignal
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:348,377
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `submitConfigRequest` (line 348) and `resolveConfigRequest` (line 377) call `refresh()` without AbortSignal, same pattern as CC-A7-002 and CC-A7-007.
- **Evidence:**
```typescript
// Line 348
refresh() // CC-002: Intentionally fire-and-forget

// Line 377
refresh() // CC-002: Intentionally fire-and-forget
```
- **Fix:** Use `mutationAbortRef` pattern for all refresh calls after mutations.


### [CC-A8-001] use-governance-hook.test.ts tests standalone replicas, not the actual hook
- **File:** /Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:26-35
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The file explicitly acknowledges (MF-027 comment at line 24-35) that it tests standalone function replicas of `submitConfigRequest` and `resolveConfigRequest`, NOT the actual `useGovernance` hook. This means: (1) The `refresh()` side-effect after successful operations is NOT tested. (2) React state updates (loading, error) are NOT tested. (3) Memoization via `useCallback` is NOT tested. If the actual hook's logic drifts from these replicas, the tests will pass while the real code is broken.
- **Evidence:**
```typescript
// MF-027 KNOWN LIMITATION: These tests exercise standalone replicas of the
// hook's submitConfigRequest and resolveConfigRequest callbacks, NOT the actual
// useGovernance hook. This means:
//   1. The refresh() side-effect after successful operations is NOT tested.
//   2. React state updates (loading, error) are NOT tested.
//   3. Memoization via useCallback is NOT tested.
```
- **Fix:** Add `@testing-library/react` (or `@testing-library/react-hooks`) as a dev dependency and write a parallel test suite that renders the actual hook. Alternatively, extract the fetch logic from the hook into a standalone module and test that module directly, ensuring the hook imports from the same module.

### [CC-A8-002] afterEach in use-governance-hook.test.ts does not restore global.fetch
- **File:** /Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:127-130
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `afterEach` calls `vi.restoreAllMocks()` but this does not restore `global.fetch` since it was assigned directly (not via `vi.stubGlobal`). While `beforeEach` re-assigns the mock each time, if a test throws before completion, `global.fetch` remains as the mock for any subsequent test file that vitest runs in the same worker. Compare with `cross-host-governance.test.ts` which correctly saves `originalFetch` and restores it in `afterEach`, and `agent-config-governance-extended.test.ts` which correctly uses `vi.stubGlobal`/`vi.unstubAllGlobals`.
- **Evidence:**
```typescript
// use-governance-hook.test.ts lines 120-130:
beforeEach(() => {
  mockFetch = vi.fn()
  global.fetch = mockFetch  // Direct assignment, NOT vi.stubGlobal
})

afterEach(() => {
  // NOTE: restoreAllMocks does not restore global.fetch; beforeEach re-assigns it each time.
  vi.restoreAllMocks()
})
```
- **Fix:** Either use `vi.stubGlobal('fetch', mockFetch)` in `beforeEach` and `vi.unstubAllGlobals()` in `afterEach` (matching agent-config-governance-extended.test.ts pattern), or save/restore the original like cross-host-governance.test.ts does: `const originalFetch = globalThis.fetch` ... `afterEach(() => { globalThis.fetch = originalFetch })`.

### [CC-A8-003] agent-registry.test.ts uses require() inside test bodies
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts:169-176
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Several tests in `loadAgents` use `require('path')` and `require('os')` inside the test body to construct the registry file path. Since `path` and `os` are imported at module scope in the source-under-test but not in the test file, using `require()` in a vitest/ESM context is fragile and may behave differently depending on the module system configuration. The pattern also makes the tests harder to read.
- **Evidence:**
```typescript
// agent-registry.test.ts lines 166-177:
const _registryPath = Object.keys(fileStore).length === 0
  ? (() => {
      const p = require('path')
      const os = require('os')
      const dir = p.join(os.homedir(), '.aimaestro', 'agents')
      const file = p.join(dir, 'registry.json')
      dirStore.add(dir)
      fileStore[file] = '{{not json}}'
      fileMtimes[file] = ++mtimeCounter
      return file
    })()
  : ''
```
- **Fix:** Import `path` and `os` at the top of the test file (they are already used elsewhere in similar test files) and compute `REGISTRY_FILE` as a constant. Replace inline `require()` calls with the constant. This matches the pattern used in other test files like `team-registry.test.ts` and `document-registry.test.ts`.

### [CC-A8-004] Missing test for document-registry saveDocuments write error propagation
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-registry.test.ts:142-161
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `saveDocuments` tests verify writes succeed and round-trip correctly, but do not test the error case where `writeFileSync` (or `renameSync` for atomic writes) throws. Compare with `team-registry.test.ts` which has a dedicated test: `"throws when writeFileSync fails (MF-04: surfaces write errors instead of silent data loss)"` at line 134. Document registry should have an equivalent test to verify error propagation.
- **Evidence:**
```typescript
// team-registry.test.ts has this test at line 134-141:
it('throws when writeFileSync fails (MF-04: surfaces write errors instead of silent data loss)', async () => {
  const fs = await import('fs')
  vi.mocked(fs.default.writeFileSync).mockImplementationOnce(() => {
    throw new Error('EACCES: permission denied')
  })
  expect(() => saveTeams([makeTeam({ id: 'team-x', name: 'Fail' })])).toThrow('EACCES: permission denied')
})
// document-registry.test.ts does NOT have an equivalent test
```
- **Fix:** Add a test to `document-registry.test.ts` that mocks `writeFileSync` to throw and verifies the error propagates, matching the team-registry pattern.


### [CC-A9-003] amp-inbox.sh: `base64 -d` portability on older macOS
- **File:** /Users/emanuelesabetta/ai-maestro/plugins/amp-messaging/scripts/amp-inbox.sh:130
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** LIKELY
- **Description:** `base64 -d` is used for decoding. On macOS 13 and earlier, the flag is `-D` (uppercase), not `-d`. macOS 14+ added `-d` as an alias. Users on Ventura or earlier would get an error. This also affects `amp-helper.sh:537` and `amp-security.sh:262`.
- **Evidence:**
  ```bash
  # amp-inbox.sh:130
  msg=$(echo "$msg_b64" | base64 -d)
  ```
- **Fix:** Use a portable decode wrapper:
  ```bash
  _base64_decode() {
    base64 -d 2>/dev/null || base64 -D 2>/dev/null
  }
  ```
  Or use `openssl base64 -d` which is portable across all platforms (and openssl is already a prerequisite).

### [CC-A9-004] amp-inbox.sh: redundant if/else in count-only mode
- **File:** /Users/emanuelesabetta/ai-maestro/plugins/amp-messaging/scripts/amp-inbox.sh:93-99
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Both branches of the if/else at lines 93-98 do the same thing (`echo "$COUNT"`). The conditional check for `$STATUS_FILTER` is unnecessary in count-only mode.
- **Evidence:**
  ```bash
  if [ "$COUNT_ONLY" = true ]; then
      if [ "$STATUS_FILTER" = "unread" ]; then
          echo "$COUNT"
      else
          echo "$COUNT"  # identical to the above branch
      fi
      exit 0
  fi
  ```
- **Fix:** Simplify to just `echo "$COUNT"; exit 0`.

### [CC-A9-005] server.mjs: startup loopback fetch uses hardcoded localhost, ignores HOSTNAME binding
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:616
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Several startup tasks use `fetch(`http://localhost:${port}/...`)` (lines 616, 1173, 1191, 1209, 1216) but the server may be bound to `0.0.0.0` (via `HOSTNAME=0.0.0.0`). While `localhost` still resolves on most systems, on some Linux setups (especially Docker/containers) with IPv6-only localhost, this could fail. The `hostname` variable is already available (line 82) and should be used consistently.
- **Evidence:**
  ```javascript
  // Line 82
  const hostname = process.env.HOSTNAME || '127.0.0.1'
  // Line 616 -- uses hardcoded 'localhost' instead of hostname
  const response = await fetch(`http://localhost:${port}/api/sessions/activity`)
  ```
- **Fix:** Use `http://127.0.0.1:${port}/...` for all loopback fetches (or create a `loopbackUrl` constant). Using `127.0.0.1` is more reliable than `localhost` which may resolve to `::1` on IPv6 systems.

### [CC-A9-006] server.mjs: host sync filters by deprecated `h.type === 'remote'`
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:1211
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The startup host sync at line 1211 filters hosts using `h.type === 'remote'`. However, the `type` field is deprecated on `Host` (types/host.ts:55-58: `@deprecated Use 'role' field instead`). The CLAUDE.md also states "In a mesh network, all hosts are equal." New hosts added via peer registration may not have `type: 'remote'` set, causing them to be silently excluded from startup sync.
- **Evidence:**
  ```javascript
  // server.mjs:1211
  const remoteHosts = (hostsData.hosts || []).filter(h => h.type === 'remote' && h.enabled)
  ```
  ```typescript
  // types/host.ts:55-58
  /** @deprecated Use 'role' field instead. Removal: v1.0.0
   *  In a mesh network, all hosts are equal. Use isSelf for self-detection. */
  type?: 'local' | 'remote'
  ```
- **Fix:** Filter using `!isSelf(h.id) && h.enabled !== false` instead of relying on the deprecated `type` field.

### [CC-A9-007] types/service.ts: assertValidServiceResult only logs, does not throw
- **File:** /Users/emanuelesabetta/ai-maestro/types/service.ts:29-35
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `assertValidServiceResult` function is named as an assertion but only logs an error via `console.error` without throwing. The function name `assert*` implies it would throw on invalid state. Callers using this for "defense-in-depth" (as documented in the JSDoc) may assume it will halt execution on bugs. As-is, the bug is merely logged and execution continues with an ambiguous result.
- **Evidence:**
  ```typescript
  export function assertValidServiceResult<T>(result: ServiceResult<T>, context?: string): void {
    if (result.data !== undefined && result.error !== undefined) {
      const ctx = context ? ` [${context}]` : ''
      console.error(`[ServiceResult]${ctx} BUG: result has both data and error set...`)
      // In this ambiguous state, error takes precedence -- callers using `if (result.error)` are correct
    }
    // No throw, no return value change
  }
  ```
- **Fix:** Either rename to `warnOnInvalidServiceResult` (to match behavior) or add `throw new Error(...)` to match the `assert` naming convention. If throwing is too disruptive, at minimum document that this is a soft assertion (logging only).

### [CC-A9-008] update-aimaestro.sh: box drawing characters misaligned
- **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:75-79
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The box-drawing decorative header has mismatched widths. The `╔═══╗` top line uses 64 `═` characters, but the middle `║` lines have content that doesn't fill to 64 characters, and the `║` right edges don't align with the `╗`. The same issue exists at lines 358-363.
- **Evidence:**
  ```bash
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                                                                ║"  # <-- wider than the top line
  echo "║                 AI Maestro - Full Updater                      ║"
  echo "║                                                                ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  ```
  Counting: the top/bottom lines have 64 `═` + `╔╗` = 66 chars. The middle lines have more spaces than needed, making the right `║` extend past the box border.
- **Fix:** Align the inner content to match exactly 64 characters between the side `║` bars.


---

## Nits & Suggestions


### [CC-A0-008] Consolidation maxConversations parsing is complex and hard to read
- **File:** app/api/agents/[id]/memory/consolidate/route.ts:61-62
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The inline ternary for parsing `maxConversations` is deeply nested and hard to read. The same pattern appears in `search/route.ts` (lines 47-59) where multiple parameters use this pattern. While functionally correct, extracting a helper function like `parseIntParam(searchParams, 'maxConversations')` would improve readability.
- **Evidence:**
  ```typescript
  maxConversations: searchParams.get('maxConversations')
    ? (Number.isNaN(parseInt(searchParams.get('maxConversations')!, 10)) ? undefined : parseInt(searchParams.get('maxConversations')!, 10))
    : undefined,
  ```
- **Fix:** Extract a reusable `parseIntParam(searchParams: URLSearchParams, key: string): number | undefined` helper function to `lib/utils.ts` or similar. This would simplify all ~15 instances of this pattern across the route files.

### [CC-A0-009] `search/route.ts` calls `searchParams.get()` multiple times for same param
- **File:** app/api/agents/[id]/search/route.ts:47-59
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** For each numeric parameter (`limit`, `minScore`, `startTs`, `endTs`, `bm25Weight`, `semanticWeight`), `searchParams.get()` is called 2-3 times per parameter. While `URLSearchParams.get()` is cheap, reading the value once into a local variable would be cleaner and avoid the non-null assertion (`!`) on the second call.
- **Evidence:**
  ```typescript
  // searchParams.get('limit') called 3 times:
  limit: searchParams.get('limit') ? (Number.isNaN(parseInt(searchParams.get('limit')!, 10)) ? undefined : parseInt(searchParams.get('limit')!, 10)) : undefined,
  ```
- **Fix:** Store each param value once: `const limitStr = searchParams.get('limit')` then use `limitStr` in the ternary.

### [CC-A0-010] Minor: `memory/route.ts` POST uses `.catch(() => ({}))` instead of explicit JSON parse guard
- **File:** app/api/agents/[id]/memory/route.ts:46
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The POST handler uses `request.json().catch(() => ({}))` to handle missing/invalid JSON bodies. While this works, it silently swallows malformed JSON, treating it as an empty object. Other routes in this domain (e.g., chat, docs, search) explicitly return 400 for invalid JSON. This inconsistency means a client sending `{invalid json}` to `/memory` gets a 200 with default behavior, while the same request to `/chat` gets a 400 error.
- **Evidence:**
  ```typescript
  // memory/route.ts:46
  const body = await request.json().catch(() => ({}))

  // tracking/route.ts:46 has the same pattern:
  const body = await request.json().catch(() => ({}))
  ```
- **Fix:** Consider using the explicit try/catch pattern with 400 response for consistency, or document that these endpoints accept empty/no body as valid input.

### [CC-A0-011] `tracking/route.ts` POST also uses `.catch(() => ({}))` silent fallback
- **File:** app/api/agents/[id]/tracking/route.ts:46
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-A0-010. The tracking POST handler silently swallows malformed JSON.
- **Evidence:**
  ```typescript
  const body = await request.json().catch(() => ({}))
  ```
- **Fix:** Same as CC-A0-010 -- use explicit try/catch with 400 response, or document that empty body is acceptable.


### [CC-A1-009] Unused `request` parameter not prefixed with underscore in export/jobs/[jobId]/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/export/jobs/[jobId]/route.ts:9,31
- **Severity:** NIT
- **Category:** convention
- **Confidence:** CONFIRMED
- **Description:** Both GET and DELETE handlers declare `request: Request` as a parameter but never use it. The codebase convention is to prefix unused parameters with `_` (e.g., `_request: Request`), as seen in `domains/[id]/route.ts` and `by-name/[name]/route.ts`.
- **Evidence:**
  ```typescript
  export async function GET(
    request: Request,  // should be _request
    { params }: { params: Promise<{ jobId: string }> }
  ) {
  ```
- **Fix:** Rename to `_request: Request` for consistency with codebase conventions.

### [CC-A1-010] Redundant null check for fromTeam/toTeam at resolve/route.ts:114 and :142
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:114,142
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** At line 114, there's a null check `if (!fromTeam || !toTeam)` inside a block that is only reached when `toTeam` is already confirmed non-null (line 102 returns 404 if `!toTeam`), and `fromTeam` is confirmed non-null (line 84 returns 404 if `!fromTeam`). Similarly at line 142, both fromTeam and toTeam have already been validated as non-null earlier in the function. The checks were added as "SF-056: Explicit null checks instead of non-null assertions" but they are unreachable dead code since earlier guards already return.
- **Evidence:**
  ```typescript
  // Line 84: fromTeam guaranteed non-null after this
  if (!fromTeam) {
    return NextResponse.json({ error: 'Source team not found' }, { status: 404 })
  }
  // Line 102: toTeam guaranteed non-null in approve branch
  if (!toTeam) {
    return NextResponse.json({ error: 'Destination team...' }, { status: 404 })
  }
  // Line 114: REDUNDANT -- both already proven non-null
  if (!fromTeam || !toTeam) {
    return NextResponse.json(...)
  }
  ```
- **Fix:** These checks are harmless defense-in-depth. Optionally, remove them and use TypeScript narrowing to prove the types, or leave them with a comment acknowledging they are defensive.

### [CC-A1-011] Missing `dynamic = 'force-dynamic'` on several mutable routes
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/domains/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/domains/[id]/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/conversations/[file]/messages/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/export/jobs/[jobId]/route.ts
- **Severity:** NIT
- **Category:** convention
- **Confidence:** LIKELY
- **Description:** Several routes that serve dynamic data (domains CRUD, conversation messages, export job status) do not export `dynamic = 'force-dynamic'`. While Next.js App Router typically treats routes with dynamic segments as dynamic, explicit marking is the codebase convention (seen in `agents/health/route.ts`, `agents/startup/route.ts`, `governance/*.ts`, etc.). Without it, Next.js could potentially cache these responses in certain deployment configurations.
- **Fix:** Add `export const dynamic = 'force-dynamic'` to these route files for consistency.


### [CC-A2-009] `v1/info` route uses `?? {}` with `as AMPInfoResponse` cast on potentially undefined data
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/info/route.ts`:22
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `result.data ?? {} as AMPInfoResponse` falls back to an empty object cast as `AMPInfoResponse`. This is technically type-safe via the assertion but the empty object does not conform to the AMPInfoResponse interface. The `v1/health` route handles this better by returning a 500 error when data is undefined (line 22-24 of health/route.ts). The info route should follow the same pattern.
- **Evidence:**
  ```typescript
  return NextResponse.json(result.data ?? {} as AMPInfoResponse, { ... })
  ```
- **Fix:** Add `if (!result.data) return NextResponse.json({ error: 'Info data unavailable' }, { status: 500 })` before the success response, matching the health endpoint pattern.

### [CC-A2-010] `v1/register` route also uses `?? {}` empty-object fallback
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/register/route.ts`:29
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-A2-009 -- `(result.data ?? {}) as AMPRegistrationResponse` creates an empty object that does not conform to `AMPRegistrationResponse`.
- **Evidence:**
  ```typescript
  return NextResponse.json((result.data ?? {}) as AMPRegistrationResponse, { status: result.status })
  ```
- **Fix:** Guard with `if (!result.data)` and return a 500 error.

### [CC-A2-011] `v1/route` and `v1/messages/pending` use the same `?? {}` pattern
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts`:38; `/Users/emanuelesabetta/ai-maestro/app/api/v1/messages/pending/route.ts`:36,52,73
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple AMP v1 routes use `(result.data ?? {}) as <Type>` which creates an empty object not conforming to the declared type. This is a systemic pattern across AMP routes. While it works at runtime (the service layer always provides data on success), the fallback disguises potential bugs where data might actually be undefined.
- **Fix:** Either add `if (!result.data)` guards or ensure the service functions always set `data` on success paths (and remove the `?? {}` fallback).

### [CC-A2-012] `POST /api/teams/notify` does not validate that agentIds is a non-empty array
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts`:28
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The route validates that each element in `agentIds` is a string (line 28), but only when `agentIds` is truthy and an array. It does not validate that `agentIds` is actually present or non-empty. If `agentIds` is undefined/null, it passes through to the service unchecked.
- **Evidence:**
  ```typescript
  if (agentIds && Array.isArray(agentIds) && !agentIds.every((id: unknown) => typeof id === 'string')) {
    return NextResponse.json({ error: 'Each agentIds element must be a string' }, { status: 400 })
  }
  // agentIds could be undefined/null/empty here
  const result = await notifyTeamAgents({ agentIds, teamName })
  ```
- **Fix:** Add `if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) return 400` before the element validation.

### [CC-A2-013] `help/agent` route does not wrap service calls in try-catch
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/help/agent/route.ts`:19-29
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The POST, DELETE, and GET handlers in `help/agent/route.ts` call their respective service functions without a top-level try-catch. If any service function throws (e.g., due to filesystem errors), the error will propagate as an unhandled rejection, resulting in a generic Next.js 500 error instead of a structured JSON error response. Most other routes in the codebase have try-catch wrappers.
- **Evidence:**
  ```typescript
  export async function POST() {
    const result = await createAssistantAgent()
    // No try-catch -- if createAssistantAgent() throws, unstructured 500
    if (result.error) { ... }
    return NextResponse.json(result.data)
  }
  ```
- **Fix:** Wrap each handler body in try-catch with a standard 500 JSON error response.

### [CC-A2-014] `POST /api/webhooks` does not validate webhook URL scheme (allows non-http schemes)
- **File:** `/Users/emanuelesabetta/ai-maestro/services/webhooks-service.ts`:89-93
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `createNewWebhook` service validates URL format via `new URL(body.url)` but does not check the protocol. This allows `file:///`, `ftp://`, `javascript:`, etc. URLs. When webhooks fire, the delivery function may make HTTP requests to these URLs. The `hosts/health` route explicitly checks `['http:', 'https:'].includes(parsed.protocol)`.
- **Evidence:**
  ```typescript
  try {
    new URL(body.url)  // passes for any valid URL including file://, ftp://, etc.
  } catch {
    return { error: 'Invalid URL format', status: 400 }
  }
  ```
- **Fix:** Add protocol validation: `const parsed = new URL(body.url); if (!['http:', 'https:'].includes(parsed.protocol)) return { error: 'Only http/https URLs are allowed', status: 400 }`.


### [CC-P10-A3-008] Unused `depth` parameter in `queryCodeGraph`
- **File:** services/agents-graph-service.ts:858-862
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `depth` parameter is accepted but documented as not yet used (NT-008 comment at line 857). It is destructured at line 862 (`depth = 1`) and logged at line 1023, but does NOT control any actual traversal depth limit. The `focus` action (line 1018) only does direct neighbors (depth=1 equivalent) regardless of the `depth` value.
- **Evidence:**
```typescript
/** NT-008: depth is accepted but not yet used for traversal limiting -- reserved for future use */
depth?: number
```
- **Fix:** Either implement depth-limited traversal or remove the parameter to avoid misleading callers. Low priority since documented.

### [CC-P10-A3-009] `agents-playback-service.ts` is entirely a placeholder (Phase 5)
- **File:** services/agents-playback-service.ts (entire file)
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** This service is a complete placeholder. `getPlaybackState()` returns hardcoded state, and `controlPlayback()` does not persist any state. Both are documented as "placeholder - Phase 5 implementation pending." Not a bug per se, but the service creates an illusion of functionality for API consumers.
- **Evidence:**
```typescript
// Line 49-58
const playbackState: PlaybackState = {
  agentId: agent.id,
  isPlaying: false,
  currentMessageIndex: 0,
  speed: 1,
  totalMessages: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}
```
- **Fix:** No action needed for Phase 1. Could add a response header or field indicating "placeholder" status.

### [CC-P10-A3-010] Verbose console.log in graph/docs services for every request
- **File:** services/agents-graph-service.ts:162,367,864; services/agents-docs-service.ts:59
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Several service functions log every request at `console.log` level (not debug), including the agent ID and action. In a production environment with many agents, this creates significant log noise.
- **Evidence:**
```typescript
// agents-graph-service.ts:162
console.log(`[Graph Service] queryDbGraph Agent: ${agentId}, Action: ${action}`)
// agents-graph-service.ts:367
console.log(`[Graph Service] queryGraph Agent: ${agentId}, Query: ${queryType}, Name: ${name}`)
```
- **Fix:** Use `console.debug` or a configurable log level for per-request logging.


### [CC-A4-012] `help-service.ts` writes system prompt to a predictable temp file path without uniqueness
- **File:** /Users/emanuelesabetta/ai-maestro/services/help-service.ts:156
- **Severity:** NIT
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The system prompt is written to `join(tmpdir(), 'aim-assistant-prompt.txt')` -- a predictable path. If another process writes to this path between `writeFileSync` and the `cat` command, the assistant could get a different prompt. This is Phase 1 (localhost-only) so the risk is minimal, but a unique temp file (e.g., using `mkdtemp` or appending a random suffix) would be safer.
- **Evidence:**
  ```typescript
  const promptFile = join(tmpdir(), 'aim-assistant-prompt.txt')
  writeFileSync(promptFile, SYSTEM_PROMPT)
  const launchCmd = `claude --model ${ASSISTANT_MODEL} ... --system-prompt "$(cat ${promptFile})"`
  ```
- **Fix:** Use a unique temp file path (e.g., `join(tmpdir(), `aim-assistant-prompt-${randomUUID()}.txt`)`) and clean it up after launch.

### [CC-A4-013] Inconsistent use of `any` return types in multiple services
- **File:** multiple files
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Several service functions use `ServiceResult<any>` instead of concrete types: `hosts-service.ts:listHosts` (line 298), `hosts-service.ts:addNewHost` (line 338), `hosts-service.ts:checkRemoteHealth` (line 485), `messages-service.ts:getMessages` (line 72), `messages-service.ts:sendMessage` (line 201), `teams-service.ts:createNewTeam` (line 141), etc. While this is not a bug, it defeats TypeScript's type checking at the service boundary.
- **Fix:** Replace `ServiceResult<any>` with concrete response types for each function.

### [CC-A4-014] `marketplace-service.ts` passes `query as any` to `listMarketplaceSkills` in headless router
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:1850
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The headless router casts the query object to `any` when calling `listMarketplaceSkills`:
  ```typescript
  sendServiceResult(res, await listMarketplaceSkills(query as any))
  ```
  The `SkillSearchParams` type expected by `listMarketplaceSkills` may not match the shape of the raw `query` object (which is `Record<string, string>`).
- **Fix:** Explicitly construct a `SkillSearchParams` object from the query parameters instead of casting.

### [CC-A4-015] `plugin-builder-service.ts` evictionInterval runs forever even if no builds are active
- **File:** /Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts:200-201
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The eviction interval fires every 10 minutes unconditionally. While `.unref()` prevents it from blocking process exit, it still triggers `evictStaleBuildResults()` repeatedly even when `buildResults` is empty. This is a minor inefficiency.
- **Evidence:**
  ```typescript
  const evictionInterval = setInterval(evictStaleBuildResults, 10 * 60 * 1000)
  evictionInterval.unref()
  ```
- **Fix:** Consider only starting the interval when the first build is created, or adding an early-return check in `evictStaleBuildResults` when the map is empty.


### [CC-A5-011] hosts-config.ts: `createExampleConfig()` still uses deprecated `type: 'local'` field
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:513
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `migrateHost()` function explicitly strips the deprecated `type` field (line 257), and the Host type docs say it's deprecated. But `createExampleConfig()` still emits `type: 'local'` in the example self host config. Users who copy this example will get the deprecated field.
- **Evidence:**
```typescript
// hosts-config.ts:513
type: 'local',
```
- **Fix:** Remove `type: 'local'` from the example config since it's stripped during migration anyway.

### [CC-A5-012] governance.ts: `loadGovernance()` heals corrupted file but doesn't heal on version mismatch
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:43-46
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When JSON parsing succeeds but `parsed.version !== 1`, the function returns defaults but does NOT heal the file (unlike the SyntaxError path at lines 52-59 which backs up + overwrites). This means the version-mismatched file persists on disk and the mismatch warning fires on every call. This is inconsistent with the SyntaxError handling.
- **Evidence:**
```typescript
if (parsed.version !== 1) {
  console.error(`[governance] Unsupported config version: ${parsed.version} (expected 1). Returning defaults.`)
  return { ...DEFAULT_GOVERNANCE_CONFIG }
  // No saveGovernance() here unlike the SyntaxError branch
}
```
- **Fix:** Either heal the file (backup + save defaults) or add a comment explaining why version mismatch intentionally doesn't heal (e.g., to avoid overwriting a newer-version file that a future release might understand).

### [CC-A5-013] hosts-config.ts: `getHostById()` does double case-insensitive comparison
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:391
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The find predicate checks `host.id === hostId` (case-sensitive) OR `host.id.toLowerCase() === hostId.toLowerCase()` (case-insensitive). The second condition is a superset of the first, making the first check redundant.
- **Evidence:**
```typescript
return hosts.find(host => host.id === hostId || host.id.toLowerCase() === hostId.toLowerCase())
```
- **Fix:** Simplify to just the case-insensitive check: `host.id.toLowerCase() === hostId.toLowerCase()`.

### [CC-A5-014] hosts-config.ts: `_lockWaiterId` counter can overflow `Number.MAX_SAFE_INTEGER` theoretically
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:23
- **Severity:** NIT
- **Category:** logic
- **Confidence:** POSSIBLE
- **Description:** The monotonic counter `_lockWaiterId` increments without bound. At `Number.MAX_SAFE_INTEGER` (9007199254740991), further increments lose precision. This is practically unreachable (would require ~285 million years of lock operations per second), but the shared `file-lock.ts` avoids this issue entirely by using the closure identity approach.
- **Evidence:**
```typescript
let _lockWaiterId = 0
// ...
const waiterId = ++_lockWaiterId
```
- **Fix:** Not a practical concern. If CC-A5-002 is adopted (migrating to shared file-lock.ts), this becomes moot.


### [CC-A6-007] notification-service NOTIFICATION_FORMAT only replaces first occurrence of placeholders
- **File:** /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:82-83
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `String.replace()` with a string argument (not regex) only replaces the first occurrence. If the user configures `NOTIFICATION_FORMAT` with multiple `{from}` or `{subject}` placeholders, only the first would be replaced.
- **Evidence:**
```typescript
let message = NOTIFICATION_FORMAT
  .replace('{from}', senderWithHost)
  .replace('{subject}', subject)
```
- **Fix:** Use `replaceAll('{from}', ...)` or a regex with `g` flag: `.replace(/\{from\}/g, ...)`. Low impact since the default template only has one of each.

### [CC-A6-008] agent-registry config.json rename is not atomic
- **File:** /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts:1114
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When renaming an agent, the AMP `config.json` is updated via direct `writeFileSync` without atomic write (temp+rename). Other files in the codebase use atomic writes consistently (e.g., `saveAgents`, `saveApiKeys`). A crash during this write could corrupt config.json.
- **Evidence:**
```typescript
// line 1114
fs.writeFileSync(configPath, JSON.stringify(configData, null, 2))
```
- **Fix:** Use the same atomic write pattern: write to `configPath + '.tmp.' + process.pid`, then `renameSync`.

### [CC-A6-009] document-registry and task-registry saveDocuments does not clean up temp file on renameSync failure
- **File:** /Users/emanuelesabetta/ai-maestro/lib/document-registry.ts:54-56, /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:55-57
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** If `fs.writeFileSync(tmpPath, ...)` succeeds but `fs.renameSync(tmpPath, filePath)` fails (e.g., cross-device), the temp file is left on disk. Same pattern in both document-registry.ts and task-registry.ts.
- **Evidence:**
```typescript
const tmpPath = `${filePath}.tmp.${process.pid}`
fs.writeFileSync(tmpPath, JSON.stringify(file, null, 2), 'utf-8')
fs.renameSync(tmpPath, filePath)
// No cleanup of tmpPath on renameSync failure
```
- **Fix:** Wrap in try/catch with cleanup: `try { fs.renameSync(...) } catch(e) { try { fs.unlinkSync(tmpPath) } catch {} throw e }`. Low priority since the same pattern is used across the codebase.

### [CC-A6-010] index-delta model detection uses hardcoded "4.5" display names
- **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:344-347
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The model detection hardcodes "Sonnet 4.5", "Haiku 4.5", "Opus 4.5" as display names, but Claude models evolve over time. The current date is 2026-02-26 and newer model names include "claude-opus-4-6" etc. The pattern-matching (`model.includes('sonnet')`, etc.) is loose enough to catch variants, but the display names will always show "4.5".
- **Evidence:**
```typescript
if (model.includes('sonnet')) modelSet.add('Sonnet 4.5')
else if (model.includes('haiku')) modelSet.add('Haiku 4.5')
else if (model.includes('opus')) modelSet.add('Opus 4.5')
```
- **Fix:** Extract the version from the model string dynamically, or just use the raw model name: `modelSet.add(model)`.


### [CC-A7-009] Header: unused immersiveUrl variable when activeAgentId is null
- **File:** /Users/emanuelesabetta/ai-maestro/components/Header.tsx:13-14
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `immersiveUrl` and `companionUrl` are computed with `activeAgentId` but `activeAgentId` is optional and often null. The fallback URLs (`/immersive`, `/companion`) work but these variables are computed on every render regardless. Minor optimization: could use conditional rendering or memoize.
- **Evidence:**
```typescript
const immersiveUrl = activeAgentId ? `/immersive?agent=${encodeURIComponent(activeAgentId)}` : '/immersive'
const companionUrl = activeAgentId ? `/companion?agent=${encodeURIComponent(activeAgentId)}` : '/companion'
```
- **Fix:** No action needed, this is trivial computation. Just noting for completeness.

### [CC-A7-010] RoleBadge: dead code after exhaustiveness check
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx:64-75
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `default` case in the switch statement performs `const _exhaustive: never = role` which is a compile-time exhaustiveness check. The code after it (lines 70-74) is technically dead code in a correctly-typed codebase. However, this is intentional defensive coding (CC-P1-708 marker). The use of `String(_exhaustive)` is correct for the `never` type.
- **Evidence:**
```typescript
default: {
  const _exhaustive: never = role
  const displayLabel = String(_exhaustive).toUpperCase()
  // ... renders fallback badge
}
```
- **Fix:** No action needed. This is correctly defensive for future extensibility.

### [CC-A7-011] PluginComposer: getSkillDisplayName lacks default/exhaustiveness check
- **File:** /Users/emanuelesabetta/ai-maestro/components/plugin-builder/PluginComposer.tsx:209-218
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `getSkillDisplayName` and `getSkillSubtitle` functions use switch statements over `skill.type` but have no `default` case or exhaustiveness check. If a new skill type is added to `PluginSkillSelection`, these functions would silently return `undefined`.
- **Evidence:**
```typescript
function getSkillDisplayName(skill: PluginSkillSelection): string {
  switch (skill.type) {
    case 'core': return skill.name
    case 'marketplace': return skill.id.split(':')[2] || skill.id
    case 'repo': return skill.name
    // No default case
  }
}
```
- **Fix:** Add a `default` case with exhaustiveness check (`const _exhaustive: never = skill`), similar to the pattern used in RoleBadge.tsx.

### [CC-A7-012] BuildAction: polling interval not cleared when component re-renders with new config
- **File:** /Users/emanuelesabetta/ai-maestro/components/plugin-builder/BuildAction.tsx:54-56
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `handleBuild` calls `clearPoll()` at the start (line 56), which is good. However, if the user changes `config` props while a build is polling, the old poll continues with stale state. This is minor since `config` changes don't trigger a re-build automatically, and the poll only reads from the server.
- **Evidence:**
```typescript
const handleBuild = async () => {
  clearPoll()  // Clears existing poll before starting new build
  // ...
}
```
- **Fix:** No action needed. The behavior is correct as-is since polls are server-driven.

### [CC-A7-013] TeamMembershipSection: error state not cleared on successful leave
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx:149-163
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `handleLeave`, the error is cleared at the start (`setError(null)` at line 150), and only set on failure (line 155). However, `infoMessage` is also cleared (line 151). If a leave succeeds, no success feedback is shown to the user (unlike join which sets `infoMessage`). This is a minor UX gap, not a bug.
- **Evidence:**
```typescript
const handleLeave = async (teamId: string) => {
  setError(null)
  setInfoMessage(null)
  setLoading(teamId)
  try {
    const result = await onLeaveTeam(teamId)
    if (!result.success) {
      setError(result.error || 'Failed to leave team')
    }
    // No success feedback
  } catch { ... }
}
```
- **Fix:** Consider adding a brief success message or toast on successful leave.


### [CC-A8-005] Inconsistent global.fetch mock patterns across test files
- **File:** Multiple files
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Three different patterns are used for mocking `global.fetch` across test files:
  1. `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()` (agent-config-governance-extended.test.ts:441,445)
  2. Save `originalFetch` + restore in `afterEach` (cross-host-governance.test.ts:155,211)
  3. Direct `global.fetch = mockFetch` with no restore (use-governance-hook.test.ts:124)

  While all work correctly within their individual files, the inconsistency makes it harder to maintain the test suite. Pattern 1 (`vi.stubGlobal`) is the cleanest approach.
- **Evidence:** See line references above.
- **Fix:** Standardize on `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()` across all test files that mock fetch.

### [CC-A8-006] Unused variable in agent-registry.test.ts updateAgent test
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts:433
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In the `'updates lastActive timestamp'` test, `originalLastActive` is assigned but never used in any assertion. The test only checks that `updated!.lastActive` is defined, but does not compare it against the original value.
- **Evidence:**
```typescript
// agent-registry.test.ts lines 431-438:
it('updates lastActive timestamp', async () => {
  const agent = await createAgent(makeCreateRequest({ name: 'ts-agent' }))
  const originalLastActive = agent.lastActive  // <-- assigned but never used

  // Small delay to ensure different timestamp
  const updated = await updateAgent(agent.id, { taskDescription: 'changed' })
  expect(updated!.lastActive).toBeDefined()
})
```
- **Fix:** Either add `expect(updated!.lastActive).not.toBe(originalLastActive)` to verify the timestamp actually changed, or remove the unused variable.

### [CC-A8-007] Missing `unlinkSync` in document-registry.test.ts fs mock
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-registry.test.ts:12-31
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The fs mock in `document-registry.test.ts` provides `existsSync`, `mkdirSync`, `readFileSync`, `writeFileSync`, and `renameSync`, but does not mock `unlinkSync`. Compare with `team-registry.test.ts` which includes `unlinkSync`. If the `document-registry` module or any module it imports were to call `unlinkSync` (e.g., for cleanup), the test would fail with an unclear error.
- **Evidence:**
```typescript
// team-registry.test.ts includes unlinkSync:
unlinkSync: vi.fn((filePath: string) => {
  delete fsStore[filePath]
}),
// document-registry.test.ts does NOT include unlinkSync
```
- **Fix:** Add `unlinkSync` to the fs mock in document-registry.test.ts for defensive completeness.

### [CC-A8-008] document-registry.test.ts does not mock `copyFileSync`
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-registry.test.ts:12-31
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The fs mock in `document-registry.test.ts` does not include `copyFileSync`, which is present in other test files (e.g., `transfer-registry.test.ts:27-30`, `agent-registry.test.ts:78-83`) for corruption recovery patterns. If the document registry ever gains corruption recovery (following the governance.test.ts pattern), this would need to be added.
- **Evidence:** Compare `transfer-registry.test.ts:27-30` which has `copyFileSync` vs `document-registry.test.ts:12-31` which does not.
- **Fix:** Add `copyFileSync` mock for defensive completeness.

### [CC-A8-009] fixtures.ts makeDocument does not default `pinned` and `tags` fields
- **File:** /Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts:133-144
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `makeDocument` factory in `fixtures.ts` creates a `TeamDocument` with defaults for `id`, `teamId`, `title`, `content`, `createdAt`, `updatedAt`, but does not include defaults for `pinned` and `tags`. While these fields are optional in the type, the production `createDocument` function defaults them to `false` and `[]` respectively. Tests using `makeDocument` without specifying `pinned`/`tags` will get `undefined` instead of the production defaults. This is inconsistent with the `document-registry.test.ts` local `makeDoc` helper which does set these defaults.
- **Evidence:**
```typescript
// fixtures.ts makeDocument (no pinned/tags defaults):
export function makeDocument(overrides: Partial<TeamDocument> = {}): TeamDocument {
  const n = nextId()
  return {
    id: `doc-${n}`,
    teamId: 'team-1',
    title: `Test Document ${n}`,
    content: `Content for document ${n}`,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// document-registry.test.ts makeDoc (has pinned/tags defaults):
function makeDoc(overrides: Partial<TeamDocument> = {}): TeamDocument {
  return {
    id: `doc-helper-${++makeDocCounter}`,
    teamId: TEAM_1,
    title: 'Default Doc',
    content: 'Some content',
    pinned: false,  // <-- matches production default
    tags: [],       // <-- matches production default
    ...
  }
}
```
- **Fix:** Add `pinned: false` and `tags: []` to the `makeDocument` factory in `fixtures.ts`.


### [CC-A9-009] types/governance.ts: GovernanceSyncMessage payload should be typed
- **File:** /Users/emanuelesabetta/ai-maestro/types/governance.ts:79
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `GovernanceSyncMessage.payload` is `Record<string, unknown>` with a Phase 2 comment saying to refactor to a discriminated union. This is documented as intentional tech debt, but the `Record<string, unknown>` type provides no type safety for consumers. This is a known design decision per the inline comment.
- **Evidence:**
  ```typescript
  // Phase 2: Refactor to discriminated union keyed on `type`
  payload: Record<string, unknown>  // type-specific data
  ```
- **Fix:** Track as Phase 2 backlog item. No immediate action needed.

### [CC-A9-010] CI workflow: no TypeScript type-checking step
- **File:** /Users/emanuelesabetta/ai-maestro/.github/workflows/ci.yml
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The CI workflow runs `yarn test` and `yarn build` but has no explicit `tsc --noEmit` step to catch type errors independently of the build. The build does invoke `next build` which runs TypeScript compilation, but Next.js may skip certain type checks or only report a subset of errors. A dedicated `tsc --noEmit` step would catch type errors more reliably.
- **Evidence:**
  ```yaml
  - name: Run tests
    run: yarn test
  - name: Build
    run: |
      mkdir -p data
      touch data/.help-build-success
      yarn build
  ```
- **Fix:** Consider adding a `yarn tsc --noEmit` step before the build, or add it as an npm script.

### [CC-A9-011] install-messaging.sh: box drawing characters misaligned
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** Same box alignment issue as CC-A9-008. The middle `║` lines are wider than the `╔═══╗` frame.
- **Evidence:**
  ```bash
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                                                                ║"
  ```
- **Fix:** Align inner content width to match the top/bottom border.

### [CC-A9-012] types/team.ts: TeamMeetingAction RESTORE_MEETING uses Meeting type directly
- **File:** /Users/emanuelesabetta/ai-maestro/types/team.ts:113
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `RESTORE_MEETING` action embeds an entire `Meeting` object in the action payload. This couples the reducer to the full Meeting schema. If Meeting grows, every action dispatch must include all fields. A `Pick<Meeting, ...>` with only the fields needed for restoration would be more robust.
- **Evidence:**
  ```typescript
  | { type: 'RESTORE_MEETING'; meeting: Meeting }
  ```
- **Fix:** Minor concern. The current approach works correctly. Could be improved to `Pick<Meeting, 'id' | 'teamId' | 'agentIds' | 'status' | 'sidebarMode' | ...>` for clarity, but this is purely a design preference.

### [CC-A9-013] package.json: tsx is in dependencies, not devDependencies
- **File:** /Users/emanuelesabetta/ai-maestro/package.json:69
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `tsx` (TypeScript executor) is listed in `dependencies` rather than `devDependencies`. Since `tsx` is used to run `server.mjs` in production (`yarn start` uses `tsx server.mjs`), this is actually correct for this project's architecture. However, it's unconventional -- `tsx` is typically a dev tool. This is a documented design decision per CLAUDE.md ("In headless mode `tsx server.mjs` must be used").
- **Evidence:**
  ```json
  "dependencies": {
    ...
    "tsx": "~4.21.0",
    ...
  }
  ```
- **Fix:** No action needed. The placement is intentional because the production server requires tsx to run TypeScript imports from `.mjs`. Document this in package.json comments if desired.


---

## Source Reports

- `epcp-correctness-P10-Rc7f26c53-A0.md`
- `epcp-correctness-P10-Rc7f26c53-A1.md`
- `epcp-correctness-P10-Rc7f26c53-A2.md`
- `epcp-correctness-P10-Rc7f26c53-A3.md`
- `epcp-correctness-P10-Rc7f26c53-A4.md`
- `epcp-correctness-P10-Rc7f26c53-A5.md`
- `epcp-correctness-P10-Rc7f26c53-A6.md`
- `epcp-correctness-P10-Rc7f26c53-A7.md`
- `epcp-correctness-P10-Rc7f26c53-A8.md`
- `epcp-correctness-P10-Rc7f26c53-A9.md`

