# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-22-215258
**Pass:** 6
**Reports merged:** 19
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 44 |
| **SHOULD-FIX** | 65 |
| **NIT** | 41 |
| **Total** | 166 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


### [CC-P6-A5-001] SSRF check incomplete -- octal/hex/decimal IP representations bypass the private-IP blocklist
- **File:** `app/api/hosts/health/route.ts`:24-33
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The SSRF protection blocklist checks for literal strings like `127.0.0.1`, `10.x`, `192.168.x`, etc. However, a caller can bypass this using alternative IP representations that the browser and Node.js `fetch` resolve identically:
  - Octal: `http://0177.0.0.1:23000/` resolves to 127.0.0.1
  - Decimal: `http://2130706433:23000/` resolves to 127.0.0.1
  - IPv4-mapped IPv6: `http://[::ffff:127.0.0.1]:23000/`
  - Hex: `http://0x7f000001:23000/`
  - DNS rebinding: an attacker-controlled domain that initially resolves to a public IP but later resolves to a private one

  The URL is then passed to `checkRemoteHealth`, which makes HTTP requests to the target. This allows an attacker to force the server to make requests to internal services.
- **Evidence:**
  ```typescript
  // Line 24-33
  const hostname = parsed.hostname
  const isPrivate =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    hostname.endsWith('.local')
  ```
- **Fix:** Resolve the hostname to an IP address before checking (e.g., using `dns.lookup`), then check the resolved IP. Alternatively, use `node:net.isIP()` combined with converting all representations to a normalized form before comparison. Also consider using an allowlist approach (only allow hosts in the `hosts.json` configuration).

### [CC-P6-A5-002] `POST /api/messages` -- unauthenticated PATCH and DELETE allow any client to modify/delete messages for any agent
- **File:** `app/api/messages/route.ts`:63-83
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The POST endpoint properly authenticates agent identity via `authenticateAgent()`, preventing sender spoofing. However, the PATCH and DELETE endpoints on the same route have no authentication at all. Any client can mark messages as read, archive, or delete messages for any agent by providing the agent identifier and message ID in query parameters. While the project states "Phase 1 is localhost-only" and thus lower risk, this violates the authentication contract established by POST on the same route -- an attacker with local network access (or any browser extension/malicious page doing fetch) can modify or delete agent messages.
- **Evidence:**
  ```typescript
  // Lines 63-71 -- no auth check
  export async function PATCH(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const result = await updateMessage(
      searchParams.get('agent'),
      searchParams.get('id'),
      searchParams.get('action'),
    )
    return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  }

  // Lines 76-83 -- no auth check
  export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const result = await removeMessage(
      searchParams.get('agent'),
      searchParams.get('id'),
    )
    return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  }
  ```
- **Fix:** Add `authenticateAgent()` check to PATCH and DELETE handlers (same pattern as POST), or at minimum validate that the requesting agent matches the target agent. If this is intentionally unauthenticated for Phase 1, add a comment documenting this design decision and a TODO for Phase 2.


### [CC-P6-A0-001] Missing `await` on async `registerAgent()` call -- endpoint returns `null` instead of data
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/register/route.ts:15`
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED (traced from service declaration to route call)
- **Description:** `registerAgent` in `services/agents-core-service.ts:727` is declared as `export async function registerAgent(...)` returning `Promise<ServiceResult<...>>`. However, the route at line 15 calls it without `await`:
  ```typescript
  const result = registerAgent(body)  // line 15 -- result is a Promise, not ServiceResult
  ```
  Because `result` is a Promise object (not the resolved value):
  - `result.error` is `undefined` (Promise has no `.error` property), so the error-path check at line 17 is always skipped.
  - `result.data` is `undefined`, so `NextResponse.json(undefined)` is returned, which serializes as `null`.
  - The endpoint **always returns HTTP 200 with a `null` body** regardless of success or failure.
  - If `registerAgent` throws, the error propagates as an unhandled promise rejection (no try-catch in this handler) and the client gets no response.
- **Evidence:**
  ```typescript
  // app/api/agents/register/route.ts:10-24
  export async function POST(request: Request) {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const result = registerAgent(body)   // <-- MISSING await

    if (result.error) {                  // <-- Always undefined on a Promise
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)  // <-- result.data is undefined → returns null
  }
  ```
  Service signature:
  ```typescript
  // services/agents-core-service.ts:727
  export async function registerAgent(body: RegisterAgentParams): Promise<ServiceResult<{...}>>
  ```
- **Fix:** Add `await` before the call:
  ```typescript
  const result = await registerAgent(body)
  ```


### [CC-P6-A4-001] Import route skips error check, returns undefined data on failure
- **File:** app/api/agents/import/route.ts:33
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The import route does not check `result.error` before returning. When `importAgent()` returns an error (e.g., `{ error: 'Invalid agent export: missing manifest.json', status: 400 }`), `result.data` is `undefined`. The handler returns `NextResponse.json(undefined, { status: 400 })`, which serializes as an empty response body rather than the error message. Every other route in this domain checks `result.error` first.
- **Evidence:**
```typescript
// Line 32-33 in app/api/agents/import/route.ts
const result = await importAgent(buffer, options)
return NextResponse.json(result.data, { status: result.status })
// Missing:
// if (result.error) {
//   return NextResponse.json({ error: result.error }, { status: result.status })
// }
```
- **Fix:** Add the standard error check before the success return:
```typescript
const result = await importAgent(buffer, options)
if (result.error) {
  return NextResponse.json({ error: result.error }, { status: result.status })
}
return NextResponse.json(result.data, { status: result.status })
```


(none)


### [CC-P6-A3-001] Missing UUID validation on document route path parameters (`id` and `docId`)
- **File:** `app/api/teams/[id]/documents/[docId]/route.ts`:10, `app/api/teams/[id]/documents/route.ts`:10
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The documents routes (`GET/PUT/DELETE /api/teams/[id]/documents/[docId]` and `GET/POST /api/teams/[id]/documents`) do not validate `id` or `docId` with `isValidUuid()` before passing them to service functions. Every other `[id]`-parameterized route in this domain (teams, tasks, chief-of-staff) validates UUID format. While the service layer does call `getTeam(teamId)` which will return `null` for invalid IDs, the inconsistency means:
  1. Malformed IDs bypass the fast-fail 400 response and hit the filesystem/registry layer directly.
  2. If the registry layer ever uses the ID in a file path (e.g., `~/.aimaestro/teams/documents-{teamId}.json`), a non-UUID ID could enable path traversal.
- **Evidence:**
  ```typescript
  // app/api/teams/[id]/documents/[docId]/route.ts:10
  const { id, docId } = await params
  // No isValidUuid(id) or isValidUuid(docId) check -- jumps straight to service call
  const result = getTeamDocument(id, docId, requestingAgentId)

  // Compare with app/api/teams/[id]/route.ts:12
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
  }
  ```
- **Fix:** Add `import { isValidUuid } from '@/lib/validation'` and validate both `id` and `docId` at the top of each handler in both document route files, returning 400 for invalid formats.

### [CC-P6-A3-002] Unsafe cast of `body.blockedBy` without runtime validation in task routes
- **File:** `app/api/teams/[id]/tasks/[taskId]/route.ts`:38, `app/api/teams/[id]/tasks/route.ts`:62
- **Severity:** MUST-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Both task routes cast `body.blockedBy as string[]` in the whitelist object without verifying the value is actually an array of strings at the route level. A caller can submit `{ "blockedBy": "not-an-array" }` or `{ "blockedBy": [123, null] }`, and the `as string[]` assertion will silently pass the invalid data to the service layer. The service layer **does** validate `blockedBy` (lines 322-326 and 374-386 of teams-service.ts), so this won't cause data corruption, but the `as` cast is misleading and violates the principle that type assertions should only be used when the value is genuinely known to match.
- **Evidence:**
  ```typescript
  // app/api/teams/[id]/tasks/[taskId]/route.ts:38
  ...(body.blockedBy !== undefined && { blockedBy: body.blockedBy as string[] }),

  // app/api/teams/[id]/tasks/route.ts:62
  ...(body.blockedBy !== undefined && { blockedBy: body.blockedBy as string[] }),
  ```
- **Fix:** Add runtime validation before the cast: `Array.isArray(body.blockedBy) && body.blockedBy.every((v: unknown) => typeof v === 'string')`, returning 400 if invalid. Or remove the `as string[]` cast and let the service layer handle validation (which it already does).

### [CC-P6-A3-003] Missing UUID validation on meeting route path parameters
- **File:** `app/api/meetings/[id]/route.ts`:9-11
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The meetings `[id]` route (`GET/PATCH/DELETE /api/meetings/[id]`) does not validate the `id` parameter with `isValidUuid()`. Meeting IDs are UUIDs generated by `createMeeting()`. Without validation, arbitrary strings are passed to `getMeetingById()`, `updateExistingMeeting()`, and `deleteExistingMeeting()`. While the `getMeeting()` function does a lookup by ID (returns null for no match), the lack of validation is inconsistent with all team routes and could become a security issue if meeting storage changes to use the ID in file paths.
- **Evidence:**
  ```typescript
  // app/api/meetings/[id]/route.ts:9-11
  const { id } = await params
  const result = getMeetingById(id)  // No UUID validation
  ```
- **Fix:** Import `isValidUuid` and validate `id` at the top of GET, PATCH, and DELETE handlers, returning 400 for invalid format.


### [CC-P6-A6-001] useWebSocket disconnect() does not reset reconnect attempt counter
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useWebSocket.ts:179-191
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `disconnect()` is called (either explicitly or via the cleanup effect at line 201), it clears the reconnect timeout but does NOT reset `reconnectAttemptsRef.current` to 0. This means if a session disconnects and then auto-reconnects (e.g., `autoConnect` toggles from false to true), the reconnect counter retains the previous count. If a prior connection had failed 3 times before stabilizing, the new connection only gets 2 retry attempts instead of 5 on the next transient failure.
- **Evidence:**
  ```typescript
  // hooks/useWebSocket.ts:179-191
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
    setStatus('disconnected')
    // Missing: reconnectAttemptsRef.current = 0
  }, [])
  ```
- **Fix:** Add `reconnectAttemptsRef.current = 0` inside `disconnect()` before `setIsConnected(false)`.

### [CC-P6-A6-002] AgentProfileTab updateField uses `any` type parameter
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:179
- **Severity:** MUST-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `updateField` declares its `value` parameter as `any`, which disables type checking for all callers. This could allow incorrect types to be silently assigned to agent fields (e.g., passing a number where a string is expected). The same function in `AgentProfile.tsx` (line 237) was already fixed to use `string | string[] | undefined` -- this file was not updated.
- **Evidence:**
  ```typescript
  // components/zoom/AgentProfileTab.tsx:179
  const updateField = (field: string, value: any) => {
    setAgent({ ...agent, [field]: value })
    setHasChanges(true)
  }
  ```
  Compare with the fixed version in AgentProfile.tsx:237:
  ```typescript
  const updateField = (field: string, value: string | string[] | undefined) => {
  ```
- **Fix:** Change the type from `any` to `string | string[] | undefined` to match AgentProfile.tsx.

### [CC-P6-A6-003] useWebSocket onclose handler double-processes messages that are valid JSON but not control types
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useWebSocket.ts:109-133
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In the WebSocket `onmessage` handler (lines 109-133), when a message is valid JSON but its `type` is not `'error'` or `'status'`, the function returns without forwarding data to `onMessageRef.current`. This means control messages like `{ type: 'history-complete' }` and `{ type: 'connected' }` are consumed by the hook and never reach `onMessageRef`. However, the TerminalView's `onMessage` callback at line 209-261 ALSO parses JSON and handles these same types. This creates a conflict: the useWebSocket hook intercepts error/status types, but lets through other JSON messages -- which then get double-parsed in TerminalView. For `{ type: 'history-complete' }`, the useWebSocket handler does NOT intercept it (no match), so it IS forwarded to onMessage, where TerminalView handles it correctly. This is actually working but fragile -- if a new `type` is added to useWebSocket's handler without updating TerminalView, messages could be silently dropped.
- **Evidence:**
  ```typescript
  // hooks/useWebSocket.ts:109-133
  ws.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data)
      if (parsed.type === 'error') { ... return }
      if (parsed.type === 'status') { ... return }
    } catch { /* Not JSON */ }
    onMessageRef.current?.(event.data) // Forwards ALL non-error/status messages
  }

  // TerminalView.tsx:209-261
  onMessage: (data) => {
    try {
      const parsed = JSON.parse(data)
      if (parsed.type === 'history-complete') { ... return }
      if (parsed.type === 'connected') { ... return }
    } catch { /* Not JSON */ }
    // Write to terminal
  }
  ```
  The `error` type messages are consumed by useWebSocket and NEVER reach TerminalView. If a user sees a WebSocket error, only the `connectionError` state changes -- but TerminalView has no UI to show it since it relies on `connectionError` from the hook return value. This is actually handled correctly via the `connectionError` prop -- marking as NIT rather than MUST-FIX on re-evaluation.
- **Fix:** This is actually working correctly upon deeper analysis. Both layers handle their respective concerns. Downgrading to NIT -- document the split responsibility between useWebSocket (error/status) and TerminalView (history-complete/connected) to prevent future confusion.

**[Reclassified to NIT -- see CC-P6-A6-013]**


### [CC-P6-A2-001] Reachable endpoint uses relaxed regex validation instead of UUID validation
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts`:22
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `reachable` route validates `agentId` with `/^[a-zA-Z0-9_-]+$/` (line 22), while its governance-service counterpart (`getReachableAgents` at governance-service.ts:161) uses `isValidUuid()`. The route handler's looser regex accepts non-UUID strings that would never match real agent IDs. This inconsistency means the Next.js route and the headless-mode route have different validation behavior for the same endpoint, and the Next.js route permits arbitrary alphanumeric strings as cache keys, enabling cache pollution with many distinct keys (up to the 1000 cap before clear).
- **Evidence:**
  ```typescript
  // reachable/route.ts:22 (Next.js route - LOOSE)
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    return NextResponse.json({ error: 'Invalid agentId format' }, { status: 400 })
  }

  // governance-service.ts:161 (headless route - STRICT)
  if (!isValidUuid(agentId)) {
    return { error: 'Invalid agentId format', status: 400 }
  }
  ```
- **Fix:** Replace the regex with `isValidUuid(agentId)` from `@/lib/validation` to match the governance-service and all other endpoints in this domain.

### [CC-P6-A2-002] Approve endpoint leaks internal error messages to client
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/approve/route.ts`:29
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The catch block interpolates the raw error message into the response: `` `Internal server error: ${(err as Error).message}` ``. This can leak internal stack traces, file paths, or library-specific error details to the client, which is a security concern (information disclosure). All other endpoints in this domain return a generic `'Internal server error'` string in their catch blocks.
- **Evidence:**
  ```typescript
  // approve/route.ts:29
  } catch (err) {
    return NextResponse.json({ error: `Internal server error: ${(err as Error).message}` }, { status: 500 })
  }
  ```
- **Fix:** Change to `{ error: 'Internal server error' }` and log the full error with `console.error('[governance] approve error:', err)` as done elsewhere.

### [CC-P6-A2-003] Reject endpoint leaks internal error messages to client
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/reject/route.ts`:64-65
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P6-A2-002 -- the catch block exposes internal error details: `` `Internal server error: ${(err as Error).message}` ``.
- **Evidence:**
  ```typescript
  // reject/route.ts:64-65
  } catch (err) {
    return NextResponse.json({ error: `Internal server error: ${(err as Error).message}` }, { status: 500 })
  }
  ```
- **Fix:** Change to `{ error: 'Internal server error' }` and log with `console.error`.

### [CC-P6-A2-004] Approve endpoint lacks UUID validation on `id` path parameter
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/approve/route.ts`:15
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `id` path parameter from `await params` is passed directly to `approveCrossHostRequest(id, ...)` without any format validation. The transfer resolve endpoint validates `id` with `isValidUuid(id)` (transfers/[id]/resolve/route.ts:22), and the reject endpoint at least validates the host-signature headers. But the approve endpoint passes the raw, unvalidated `id` string into the service layer. If `approveCrossHostRequest` performs file operations or lookups based on this ID without internal validation, it could enable path traversal or lookup manipulation.
- **Evidence:**
  ```typescript
  // approve/route.ts:15-16
  const { id } = await params
  // No validation on id — directly passed to service
  const result = await approveCrossHostRequest(id, body.approverAgentId, body.password)
  ```
- **Fix:** Add `if (!isValidUuid(id)) { return NextResponse.json({ error: 'Invalid request ID format' }, { status: 400 }) }` before calling the service.

### [CC-P6-A2-005] Reject endpoint lacks UUID validation on `id` path parameter
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/reject/route.ts`:21
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P6-A2-004 -- the `id` path parameter from `await params` is not validated before being passed to `rejectCrossHostRequest` or `receiveRemoteRejection`.
- **Evidence:**
  ```typescript
  // reject/route.ts:21
  const { id } = await params
  // No validation — passed directly to service functions
  ```
- **Fix:** Add `isValidUuid(id)` check after extracting the param.


### [CC-P6-A3-001] Missing `await` on async `registerAgent()` in headless-router
- **File:** services/headless-router.ts:543
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Pass 5 changed `registerAgent()` in agents-core-service.ts from sync to async (returns `Promise<ServiceResult<...>>`). The headless-router calls it without `await`, so `sendServiceResult()` receives a Promise object. `result.error` is `undefined` on a Promise, so it always falls to the else branch and sends `{status: 200, data: undefined}` -- agent registration silently returns empty success with no actual registration.
- **Evidence:**
  ```typescript
  // headless-router.ts:541-544
  { method: 'POST', pattern: /^\/api\/agents\/register$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, registerAgent(body))  // <-- missing await
  }},
  ```
- **Fix:** Change to `sendServiceResult(res, await registerAgent(body))`

### [CC-P6-A3-002] Missing `await` on async `createNewAgent()` in headless-router
- **File:** services/headless-router.ts:612
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Pass 5 changed `createNewAgent()` from sync to async. The headless-router calls it without `await`. Same silent failure pattern as CC-P6-A3-001 -- agent creation appears to succeed but no agent is created; the response body is `undefined`.
- **Evidence:**
  ```typescript
  // headless-router.ts:604-613
  { method: 'POST', pattern: /^\/api\/agents$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    sendServiceResult(res, createNewAgent(body, auth.error ? null : auth.agentId))  // <-- missing await
  }},
  ```
- **Fix:** Change to `sendServiceResult(res, await createNewAgent(body, auth.error ? null : auth.agentId))`

### [CC-P6-A3-003] Missing `await` on async `updateAgentById()` in headless-router
- **File:** services/headless-router.ts:972
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Pass 5 changed `updateAgentById()` from sync to async. The headless-router calls it without `await`. Agent updates silently return empty success with no actual update applied.
- **Evidence:**
  ```typescript
  // headless-router.ts:965-973
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    sendServiceResult(res, updateAgentById(params.id, body, auth.error ? null : auth.agentId))  // <-- missing await
  }},
  ```
- **Fix:** Change to `sendServiceResult(res, await updateAgentById(params.id, body, auth.error ? null : auth.agentId))`

### [CC-P6-A3-004] Missing `await` on async `deleteAgentById()` in headless-router
- **File:** services/headless-router.ts:980
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Pass 5 changed `deleteAgentById()` from sync to async. The headless-router calls it without `await`. Agent deletion silently returns success with no actual deletion performed.
- **Evidence:**
  ```typescript
  // headless-router.ts:974-981
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    const auth = authenticateAgent(
      getHeader(_req, 'Authorization'),
      getHeader(_req, 'X-Agent-Id')
    )
    sendServiceResult(res, deleteAgentById(params.id, query.hard === 'true', auth.error ? null : auth.agentId))  // <-- missing await
  }},
  ```
- **Fix:** Change to `sendServiceResult(res, await deleteAgentById(params.id, query.hard === 'true', auth.error ? null : auth.agentId))`

### [CC-P6-A3-005] Missing `await` on async `linkAgentSession()` in headless-router
- **File:** services/headless-router.ts:625
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Pass 5 changed `linkAgentSession()` from sync to async. The headless-router calls it without `await`. Session linking silently returns success with no actual linking performed.
- **Evidence:**
  ```typescript
  // headless-router.ts:623-626
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/session$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, linkAgentSession(params.id, body))  // <-- missing await
  }},
  ```
- **Fix:** Change to `sendServiceResult(res, await linkAgentSession(params.id, body))`

### [CC-P6-A3-006] Missing `await` on async `normalizeHosts()` in headless-router
- **File:** services/headless-router.ts:594
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Pass 5 changed `normalizeHosts()` from sync to async. The headless-router calls it without `await`. Host normalization silently returns success with no actual normalization performed.
- **Evidence:**
  ```typescript
  // headless-router.ts:593-595
  { method: 'POST', pattern: /^\/api\/agents\/normalize-hosts$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, normalizeHosts())  // <-- missing await
  }},
  ```
- **Fix:** Change to `sendServiceResult(res, await normalizeHosts())`

### [CC-P6-A3-007] Missing `await` on async `updateMetrics()` in headless-router
- **File:** services/headless-router.ts:738
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Pass 5 changed `updateMetrics()` from sync to async. The headless-router calls it without `await`. Metric updates silently return success with no actual update applied. This affects agent tracking/monitoring accuracy.
- **Evidence:**
  ```typescript
  // headless-router.ts:736-739
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/metrics$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateMetrics(params.id, body))  // <-- missing await
  }},
  ```
- **Fix:** Change to `sendServiceResult(res, await updateMetrics(params.id, body))`

### [CC-P6-A3-008] Missing `await` on async `registerAgent()` in Next.js API route
- **File:** app/api/agents/register/route.ts:15
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same root cause as CC-P6-A3-001 but in the Next.js API route. `registerAgent()` was made async by Pass 5 but the caller was not updated. The route checks `result.error` on a Promise (always undefined), then calls `NextResponse.json(result.data)` where `result.data` is also undefined -- returns `null` JSON body.
- **Evidence:**
  ```typescript
  // app/api/agents/register/route.ts:15-23
  const result = registerAgent(body)  // <-- missing await
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
  ```
- **Fix:** Change to `const result = await registerAgent(body)`

### [CC-P6-A3-009] Missing `await` on async `createNewAgent()` in Next.js API route
- **File:** app/api/agents/route.ts:54
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same root cause as CC-P6-A3-002 but in the Next.js API route. `createNewAgent()` was made async by Pass 5 but the caller was not updated.
- **Evidence:**
  ```typescript
  // app/api/agents/route.ts:54-59
  const result = createNewAgent(body)  // <-- missing await
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
  ```
- **Fix:** Change to `const result = await createNewAgent(body)`

### [CC-P6-A3-010] Missing `await` on async `updateAgentById()` in Next.js API route
- **File:** app/api/agents/[id]/route.ts:35
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same root cause as CC-P6-A3-003 but in the Next.js API route. `updateAgentById()` was made async by Pass 5 but the caller was not updated.
- **Evidence:**
  ```typescript
  // app/api/agents/[id]/route.ts:35-40
  const result = updateAgentById(id, body)  // <-- missing await
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
  ```
- **Fix:** Change to `const result = await updateAgentById(id, body)`

### [CC-P6-A3-011] Missing `await` on async `deleteAgentById()` in Next.js API route
- **File:** app/api/agents/[id]/route.ts:57
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same root cause as CC-P6-A3-004 but in the Next.js API route. `deleteAgentById()` was made async by Pass 5 but the caller was not updated.
- **Evidence:**
  ```typescript
  // app/api/agents/[id]/route.ts:57-62
  const result = deleteAgentById(id, hard)  // <-- missing await
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
  ```
- **Fix:** Change to `const result = await deleteAgentById(id, hard)`

### [CC-P6-A3-012] Missing `await` on async `linkAgentSession()` in Next.js API route
- **File:** app/api/agents/[id]/session/route.ts:22
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same root cause as CC-P6-A3-005 but in the Next.js API route. `linkAgentSession()` was made async by Pass 5 but the caller was not updated.
- **Evidence:**
  ```typescript
  // app/api/agents/[id]/session/route.ts:22-27
  const result = linkAgentSession(id, body)  // <-- missing await
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
  ```
- **Fix:** Change to `const result = await linkAgentSession(id, body)`

### [CC-P6-A3-013] Missing `await` on async `normalizeHosts()` in Next.js API route
- **File:** app/api/agents/normalize-hosts/route.ts:25
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same root cause as CC-P6-A3-006 but in the Next.js API route. `normalizeHosts()` was made async by Pass 5 but the caller was not updated.
- **Evidence:**
  ```typescript
  // app/api/agents/normalize-hosts/route.ts:24-29
  const result = normalizeHosts()  // <-- missing await
  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
  ```
- **Fix:** Change to `const result = await normalizeHosts()`

### [CC-P6-A3-014] Missing `await` on async `updateMetrics()` in Next.js API route
- **File:** app/api/agents/[id]/metrics/route.ts:35
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same root cause as CC-P6-A3-007 but in the Next.js API route. `updateMetrics()` was made async by Pass 5 but the caller was not updated.
- **Evidence:**
  ```typescript
  // app/api/agents/[id]/metrics/route.ts:35-40
  const result = updateMetrics(agentId, body)  // <-- missing await
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
  ```
- **Fix:** Change to `const result = await updateMetrics(agentId, body)`


### [CC-P6-A7-001] governance.test.ts does not mock @/lib/governance-sync, causing real dependency chain to fire
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:58-61
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The source file `lib/governance.ts` imports `broadcastGovernanceSync` from `@/lib/governance-sync` (line 16) and calls it in `setManager()` (line 111) and `removeManager()` (line 122) with `.catch(() => {})`. The test file mocks `fs`, `uuid`, `bcryptjs`, `@/lib/file-lock`, and `@/lib/team-registry` but does NOT mock `@/lib/governance-sync`. When `setManager()` or `removeManager()` are called in tests, the real `broadcastGovernanceSync` executes, which in turn imports `@/lib/hosts-config`, `@/lib/host-keys`, `@/lib/agent-registry`, and `@/lib/team-registry` -- all of which operate on the real filesystem or generate real crypto keys. The tests pass only because `broadcastGovernanceSync` is called fire-and-forget with `.catch(() => {})`, silently swallowing all errors. This is fragile: any change to `governance-sync.ts` error handling (e.g., removing the `.catch()`) would break these tests. Worse, real host key generation and filesystem writes may occur as side effects during tests.
- **Evidence:**
  ```typescript
  // governance.ts line 16:
  import { broadcastGovernanceSync } from '@/lib/governance-sync'
  // governance.ts line 111:
  broadcastGovernanceSync('manager-changed', { agentId }).catch(() => {})

  // governance.test.ts: NO mock for @/lib/governance-sync
  // Only mocks: fs, uuid, bcryptjs, @/lib/file-lock, @/lib/team-registry
  ```
- **Fix:** Add `vi.mock('@/lib/governance-sync', () => ({ broadcastGovernanceSync: vi.fn().mockResolvedValue(undefined) }))` to `governance.test.ts`.

### [CC-P6-A7-002] agent-registry.test.ts does not mock renameSync, causing atomic writes to fail silently
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts:38-68
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `agent-registry.test.ts` fs mock provides `existsSync`, `mkdirSync`, `readFileSync`, `writeFileSync`, `statSync`, and `rmSync` -- but does NOT provide `renameSync`. The source file `lib/agent-registry.ts` uses atomic writes (writeFileSync to .tmp, then renameSync), which is the standard pattern across the codebase. Without `renameSync` in the mock, any code path in agent-registry.ts that performs an atomic write would call the real `fs.renameSync` or get `undefined is not a function`. The mock provides these methods only on `default` (not as named exports), so if the source uses named imports (`import { renameSync } from 'fs'`), the mock would fail entirely. However, since agent-registry.ts uses `import fs from 'fs'` (default import), the mock works for existing methods. The missing `renameSync` means atomic writes are NOT tested -- the test silently writes to `fileStore` via `writeFileSync` but the rename step that makes it atomic is not exercised.
- **Evidence:**
  ```typescript
  // agent-registry.test.ts mock (lines 38-68): NO renameSync
  vi.mock('fs', () => {
    return {
      default: {
        existsSync: ...,
        mkdirSync: ...,
        readFileSync: ...,
        writeFileSync: ...,
        statSync: ...,
        rmSync: ...,
        // Missing: renameSync, copyFileSync
      },
    }
  })
  ```
- **Fix:** Add `renameSync` and `copyFileSync` to the fs mock's `default` object, implementing them with the standard fsStore pattern used in other test files (e.g., governance-request-registry.test.ts lines 51-58).

### [CC-P6-A7-003] use-governance-hook.test.ts tests standalone replicas, NOT the actual hook code
- **File:** /Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:30-105
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test file explicitly states it tests "standalone function replicas" that "mirror the hook's callbacks exactly" (lines 22-27). These replicas are hand-written copies of `submitConfigRequest` and `resolveConfigRequest` from `hooks/useGovernance.ts`. This is a test correctness issue: if the actual hook code changes (e.g., different request body format, different error handling), the test replicas would NOT detect the regression because they test a copy, not the real code. I verified the replicas against the actual hook (lines 286-345 of useGovernance.ts) and they currently match, but this is a maintenance hazard. The replicas also omit the `refresh()` fire-and-forget call that the real hook makes after success, which is documented but means refresh side-effects are untested.
- **Evidence:**
  ```typescript
  // use-governance-hook.test.ts line 22-27:
  // TODO: These replicas test the API call logic but do not test the refresh()
  // side-effect that the real hook triggers after successful operations.
  // Testing refresh() requires @testing-library/react or a minimal hook wrapper
  ```
- **Fix:** Either (a) import the hook and test it with a minimal React test wrapper (e.g., `renderHook` from `@testing-library/react`), or (b) extract `submitConfigRequest` and `resolveConfigRequest` logic into a shared utility module that both the hook and the tests import directly, eliminating the replica pattern entirely.


### [CC-P6-A0-001] rate-limit.ts: checkAndRecordAttempt records failure even for allowed attempts
- **File:** /Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts:50-59
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `checkAndRecordAttempt()` calls `recordFailure()` whenever `result.allowed === true`. This means every allowed attempt is recorded as a failure, causing the rate limiter to exhaust the allowance after `maxAttempts` *allowed* requests, regardless of whether they succeed or fail. A legitimate user would be rate-limited after 5 successful password verifications.
- **Evidence:**
  ```typescript
  // rate-limit.ts:50-59
  export function checkAndRecordAttempt(
    key: string,
    maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
    windowMs: number = DEFAULT_WINDOW_MS
  ): { allowed: boolean; retryAfterMs: number } {
    const result = checkRateLimit(key, maxAttempts, windowMs)
    if (result.allowed) {
      recordFailure(key, windowMs)  // BUG: records "failure" even for allowed attempts
    }
    return result
  }
  ```
- **Fix:** The intent of `checkAndRecordAttempt` (per the NT-006 comment) is to atomically check AND record in one call to eliminate TOCTOU. The caller should use `checkAndRecordAttempt` to check+record, then if the actual operation succeeds (e.g., password verified), call `resetRateLimit(key)` to clear the count. If the caller never calls `resetRateLimit` on success, this is a legitimate bug. Verify all call sites to confirm whether `resetRateLimit` is called on success. If not, the function should only record on the "not allowed" path OR the callers must be updated.

### [CC-P6-A0-002] notification-service.ts: Shell injection via sendKeys literal mode bypass
- **File:** /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:56-59
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `sendTmuxNotification` function sanitizes control characters and escapes single quotes, then calls `runtime.sendKeys(target, \`echo '${safeMessage}'\`, { literal: true, enter: true })`. The `literal: true` mode uses tmux's `-l` flag, which means tmux will treat the entire string as literal text -- including the `echo '...'` wrapper. This means the string `echo 'message'` is literally typed into the terminal, NOT executed as a shell command. However, looking at agent-runtime.ts:197-205, with `literal: true` AND `enter: true`, it sends the literal text first, then sends Enter separately. So the literal text `echo 'message'` IS typed and then Enter IS pressed, which WOULD execute it as a shell command. The problem: if the safeMessage contains a newline-equivalent that bypasses the `\x00-\x1F` strip (e.g., certain Unicode line separators U+2028/U+2029), it could break out of the echo command. The current sanitization only strips ASCII control chars.
- **Evidence:**
  ```typescript
  // notification-service.ts:55-59
  const sanitized = message.replace(/[\x00-\x1F\x7F]/g, '')
  const safeMessage = sanitized.replace(/'/g, "'\\''")
  await runtime.sendKeys(target, `echo '${safeMessage}'`, { literal: true, enter: true })
  ```
- **Fix:** Also strip Unicode line/paragraph separators (U+2028, U+2029) and any other characters that could cause line breaks in shell context. Additionally, consider using `printf '%s\n'` instead of `echo` for safer handling.

### [CC-P6-A0-003] document-registry.ts: saveDocuments uses non-atomic writeFileSync
- **File:** /Users/emanuelesabetta/ai-maestro/lib/document-registry.ts:48-58
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Unlike other registries in this codebase (governance.ts, manager-trust.ts, governance-request-registry.ts, governance-peers.ts, amp-auth.ts, transfer-registry.ts, team-registry.ts) which all use the atomic write pattern (write to `.tmp` then `renameSync`), `saveDocuments()` uses a direct `writeFileSync()`. This means a crash during write will corrupt the documents file.
- **Evidence:**
  ```typescript
  // document-registry.ts:52
  fs.writeFileSync(docsFilePath(teamId), JSON.stringify(file, null, 2), 'utf-8')
  ```
  Compare with team-registry.ts which uses:
  ```typescript
  const tmpFile = filePath + '.tmp.' + process.pid
  fs.writeFileSync(tmpFile, data, 'utf-8')
  fs.renameSync(tmpFile, filePath)
  ```
- **Fix:** Use the same atomic write pattern: write to a `.tmp` file, then `renameSync` to the final path.

### [CC-P6-A0-004] task-registry.ts: saveTasks uses non-atomic writeFileSync
- **File:** /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:49-58
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P6-A0-003. `saveTasks()` uses direct `writeFileSync()` instead of the atomic temp+rename pattern used consistently by all other registry files in this codebase.
- **Evidence:**
  ```typescript
  // task-registry.ts:53
  fs.writeFileSync(tasksFilePath(teamId), JSON.stringify(file, null, 2), 'utf-8')
  ```
- **Fix:** Use temp file + `renameSync` pattern for atomic writes.

### [CC-P6-A0-005] agent-registry.ts: saveAgents uses non-atomic writeFileSync
- **File:** /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts:201-218
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The agent registry is the most critical data store (all agents), yet `saveAgents()` uses direct `writeFileSync()` without the atomic temp+rename pattern. A crash during write would corrupt the entire agent registry -- catastrophic data loss.
- **Evidence:**
  ```typescript
  // agent-registry.ts:205-206
  const data = JSON.stringify(agents, null, 2)
  fs.writeFileSync(REGISTRY_FILE, data, 'utf-8')
  ```
- **Fix:** Use temp file + `renameSync` pattern. This is the highest priority atomic write fix because agent registry corruption affects all agents.

---


### [CC-P6-A8-001] server.mjs uses deprecated `url.parse()` API
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:2,377,759
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `url.parse()` is deprecated in Node.js and has known parsing inconsistencies that can lead to SSRF and URL confusion attacks. The `query` object from `parse(req.url, true)` is also susceptible to prototype pollution through crafted query strings (e.g., `?__proto__[x]=y`). While the server is localhost-only in Phase 1, this becomes a security risk if network access is ever enabled via `HOSTNAME=0.0.0.0`.
- **Evidence:**
  ```javascript
  // Line 2
  import { parse } from 'url'
  // Line 377
  const parsedUrl = parse(req.url, true)
  // Line 759
  const { pathname, query } = parse(request.url, true)
  ```
- **Fix:** Replace with `new URL(req.url, 'http://localhost')` which returns a proper `URL` object. Query params via `url.searchParams.get()` instead of `query.name`.

### [CC-P6-A8-002] server.mjs WebSocket session name used without sanitization
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:783-788
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `sessionName` from WebSocket query parameter is used directly in PTY spawn commands (via `getRt().getAttachCommand(sessionName, socketPath)`) and file path construction (log files at line 903). While there is validation that `sessionName` is a string, there is no character validation (e.g., restricting to `^[a-zA-Z0-9_-]+$`) to prevent command injection or path traversal. The CLAUDE.md itself documents that session names should match `^[a-zA-Z0-9_-]+$`.
- **Evidence:**
  ```javascript
  // Line 783-788
  const sessionName = query.name
  if (!sessionName || typeof sessionName !== 'string') {
    ws.close(1008, 'Session name required')
    return
  }
  // Line 903 - used directly in file path
  const logFilePath = path.join(logsDir, `${sessionName}.txt`)
  ```
- **Fix:** Add validation immediately after extracting `sessionName`:
  ```javascript
  if (!/^[a-zA-Z0-9_@.-]+$/.test(sessionName)) {
    ws.close(1008, 'Invalid session name')
    return
  }
  ```


(none)


### [CC-P6-A1-001] Command injection via shell interpolation in help-service.ts
- **File:** /Users/emanuelesabetta/ai-maestro/services/help-service.ts:160
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The launch command for the assistant agent uses `$(cat ${promptFile})` inside a string passed to `runtime.sendKeys` with `literal: true` and `enter: true`. While `promptFile` is constructed from `tmpdir()` (which is safe), the `SYSTEM_PROMPT` content is written to the file and then expanded via `$(cat ...)` shell command substitution. If the SYSTEM_PROMPT constant ever contains backticks, `$(...)`, or other shell metacharacters, they would be interpreted by the shell. Currently the SYSTEM_PROMPT is a hardcoded constant so this is not exploitable from user input, but the pattern is dangerous and fragile.

  More critically, the `sendKeys` with `literal: true` sends the string character-by-character to tmux. The `$(cat ${promptFile})` will be interpreted by the **shell running inside the tmux session**, not by tmux itself. If the prompt file content contains shell metacharacters, they will be executed.

- **Evidence:**
  ```typescript
  // Line 160
  const launchCmd = `claude --model ${ASSISTANT_MODEL} --tools ${ASSISTANT_TOOLS} --permission-mode bypassPermissions --system-prompt "$(cat ${promptFile})"`
  await runtime.sendKeys(ASSISTANT_NAME, launchCmd, { literal: true, enter: true })
  ```
- **Fix:** Use `--system-prompt-file` flag if the CLI supports it, or base64-encode the prompt and decode it in the command, or use `runtime.sendKeys` to first write an environment variable via `runtime.setEnvironment`, then reference that variable in the command. The current approach of shell command substitution inside sendKeys is fragile.

### [CC-P6-A1-002] SSRF in hosts-service checkRemoteHealth -- accepts arbitrary user-controlled URL
- **File:** /Users/emanuelesabetta/ai-maestro/services/hosts-service.ts:~460-535
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `checkRemoteHealth` function accepts a `hostUrl` string parameter and makes HTTP requests to it (via `makeHealthCheckRequest`, `fetchVersionInfo`, `fetchDockerInfo`). The URL comes from the API route which reads it from query parameters or request body. There is no validation that the URL points to a known host or uses an allowed scheme. An attacker with localhost access could use this endpoint to probe internal network services (SSRF).

  The `agents-transfer-service.ts` has proper SSRF protection at lines 1016-1037 (validates against known hosts from hosts.json). The `agents-docker-service.ts` has SSRF protection at lines 63-70. But `hosts-service.ts` lacks this.

- **Evidence:**
  ```typescript
  // hosts-service.ts ~line 460+
  export async function checkRemoteHealth(hostUrl: string): Promise<ServiceResult<any>> {
    // ... validates URL format only
    const parsedUrl = new URL(normalizedUrl)
    // ... no check against known hosts, no internal network blocking
    const result = await makeHealthCheckRequest(parsedUrl, 10000)
  ```
- **Fix:** Add the same internal network IP blocking used in `plugin-builder-service.ts:validateGitUrl` (blocks localhost, 127.0.0.1, 10.x, 192.168.x, 172.16-31.x, ::1, .local). Optionally also validate against known hosts from hosts.json.

### [CC-P6-A1-003] Hardcoded localhost URL in config-notification-service.ts bypasses host configuration
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-notification-service.ts:80
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `notifyGovernanceRequestOutcome` function hardcodes `http://localhost:23000` for the AMP send-message API call, instead of using `getSelfHost()` from `@/lib/hosts-config`. This will fail if AI Maestro is running on a different port, or if the URL configuration has changed. Other services correctly use `getSelfHost()` for self-referencing HTTP calls (e.g., `agents-docs-service.ts:264`).

- **Evidence:**
  ```typescript
  // Line 80
  const sendResponse = await fetch('http://localhost:23000/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
  ```
- **Fix:** Replace `'http://localhost:23000'` with `getSelfHost().url`:
  ```typescript
  import { getSelfHost } from '@/lib/hosts-config'
  // ...
  const selfHost = getSelfHost()
  const sendResponse = await fetch(`${selfHost.url}/api/messages`, {
  ```

### [CC-P6-A1-004] sessions-service.ts uses shell-based execAsync for Docker container discovery
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:275-276
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `fetchLocalSessions` function uses `execAsync` (which is `promisify(exec)` -- shell-based) to run Docker commands. While the command string is hardcoded and not user-controllable, using `exec` (shell) instead of `execFile` (no shell) is inconsistent with the security patterns elsewhere in the codebase. The same file correctly uses `execFileAsync` (no shell) for tmux commands at lines 320-321.

  The Docker command at line 275 includes shell features (`2>/dev/null`, `||`, pipe-like format strings) that require a shell. However, these features should be replaced with `execFileAsync` patterns for consistency.

- **Evidence:**
  ```typescript
  // Line 275
  const { stdout: dockerOutput } = await execAsync(
    "docker ps --filter 'name=aim-' --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo ''"
  )
  ```
- **Fix:** Use `execFileAsync('docker', ['ps', '--filter', 'name=aim-', '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}'])` wrapped in a try/catch instead of shell redirection and `|| echo ''`.


(none)


(none)


### [CV-P6-001] Claim: "resolve 108 review findings (25 MUST-FIX, 58 SHOULD-FIX, 31 NIT)"
- **Source:** Commit message 9626e8d
- **Severity:** MUST-FIX
- **Verification:** NOT IMPLEMENTED (arithmetic mismatch)
- **Expected:** 108 findings total, with breakdown 25+58+31 = 108
- **Actual:** The breakdown 25+58+31 = 114, not 108. The commit message contains an arithmetic error. Additionally, the fix reports enumerate only 57 SHOULD-FIX IDs (not 58) -- SF-005 does not exist in any report. The actual unique finding IDs are: 25 MF + 57 SF + 31 NT = 113 unique IDs.
- **Evidence:** Commit message text: `fix: pass 5 -- resolve 108 review findings (25 MUST-FIX, 58 SHOULD-FIX, 31 NIT)`. Sum: 25+58+31=114 (not 108). Grep of all 6 fix reports yields 57 unique SF-xxx IDs, not 58.
- **Impact:** Misleading commit message. The total count and SF count are both inaccurate. This is a documentation issue, not a code issue.

---


| ID | File | In Diff | Code Verified |
|---|---|---|---|
| MF-001 | lib/team-registry.ts | Yes | Yes - previousType capture + G4 revocation for all agentIds |
| MF-002 | lib/index-delta.ts | Yes | Yes - releaseSlot in finally block |
| MF-003 | lib/agent-registry.ts | Yes | Yes - 51 withLock occurrences, all mutating functions wrapped |
| MF-004 | app/teams/[id]/page.tsx | Yes | Yes - typeof guard replacing `as string` |
| MF-005 | hooks/useTeam.ts | Yes | Yes - AbortController in useEffect |
| MF-006 | tests/cross-host-governance.test.ts | Yes | Yes - host-keys mock added |
| MF-007 | tests/cross-host-governance.test.ts | Yes | Yes - manager-trust mock added |
| MF-008 | tests/cross-host-governance.test.ts | Yes | Yes - rate-limit mock added |
| MF-009 | services/agents-graph-service.ts | Yes | Yes - escapeForCozo replacing escapeString (29 uses) |
| MF-010 | services/agents-docs-service.ts | Yes | Yes - escapeForCozo replacing inline replace |
| MF-011 | services/agents-repos-service.ts | Yes | Yes - execFileSync replacing execSync (0 remaining) |
| MF-012 | app/api/webhooks/route.ts | Yes | Yes - try/catch around request.json() |
| MF-013 | app/api/meetings/[id]/route.ts | Yes | Yes - try/catch around request.json() |
| MF-014 | app/api/meetings/route.ts | Yes | Yes - try/catch around request.json() |
| MF-015 | app/api/sessions/create/route.ts | Yes | Yes - inner try/catch added |
| MF-016 | app/api/sessions/restore/route.ts | Yes | Yes - inner try/catch added |
| MF-017 | app/api/organization/route.ts | Yes | Yes - inner try/catch added |
| MF-018 | app/api/sessions/[id]/command/route.ts | Yes | Yes - inner try/catch added |
| MF-019 | app/api/sessions/[id]/rename/route.ts | Yes | Yes - separated from Promise.all |
| MF-020 | app/api/sessions/activity/update/route.ts | Yes | Yes - inner try/catch added |
| MF-021 | app/api/conversations/parse/route.ts | Yes | Yes - inner try/catch added |
| MF-022 | app/api/v1/governance/requests/route.ts | Yes | Yes - try/catch + Pattern A |
| MF-023 | app/api/hosts/exchange-peers/route.ts | Yes | Yes - result.error check added |
| MF-024 | lib/messageQueue.ts | Yes | Yes - indexOf-based @ parsing |
| MF-025 | lib/messageQueue.ts | Yes | Yes - fromVerified field added |


---

## SHOULD-FIX Issues


### [CC-P6-A5-003] `POST /api/plugin-builder/push` -- unchecked type assertion `as PluginPushConfig`
- **File:** `app/api/plugin-builder/push/route.ts`:14
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The request body is cast with `as PluginPushConfig` without runtime validation beyond the two explicit checks for `forkUrl` and `manifest`. If `PluginPushConfig` has other required fields (like `branch`, `commitMessage`, `prTitle`), those fields are not validated at the route level -- they could be missing or have wrong types. While the service layer does validate some of these, the type assertion gives a false sense of type safety.
- **Evidence:**
  ```typescript
  const body = await request.json() as PluginPushConfig  // unsafe assertion
  ```
- **Fix:** Either validate all required fields explicitly before calling `pushToGitHub`, or remove the `as PluginPushConfig` assertion and let the service function handle validation (which it already partially does). The `as` assertion is misleading since it provides no runtime guarantees.

### [CC-P6-A5-004] `GET /api/messages/meeting` -- null params passed directly without validation
- **File:** `app/api/messages/meeting/route.ts`:9-13
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The route passes `searchParams.get()` values directly to `getMeetingMessages()`. If `meetingId` is null (parameter not provided), the service must handle that case. Similarly, `participants` and `since` may be null. While the service likely handles this, the route layer should validate required parameters before calling the service.
- **Evidence:**
  ```typescript
  const result = await getMeetingMessages({
    meetingId: searchParams.get('meetingId'),    // could be null
    participants: searchParams.get('participants'), // could be null
    since: searchParams.get('since'),            // could be null
  })
  ```
- **Fix:** Add validation that at least `meetingId` or `participants` is provided before calling the service. Return 400 with a descriptive error if required params are missing.

### [CC-P6-A5-005] `POST /api/sessions/activity/update` -- no validation on `sessionName` or `status` values
- **File:** `app/api/sessions/activity/update/route.ts`:17-19
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The destructured `sessionName` and `status` are passed directly to `broadcastActivityUpdate`. While the service checks for `!sessionName`, the `status` parameter is not validated against allowed values. Arbitrary status strings could be broadcast, potentially confusing UI components or other agents relying on a fixed set of statuses.
- **Evidence:**
  ```typescript
  const { sessionName, status, hookStatus, notificationType } = body
  const result = broadcastActivityUpdate(sessionName, status, hookStatus, notificationType)
  ```
- **Fix:** Validate that `status` is one of the expected values (`'active'`, `'idle'`, `'waiting'`, etc.) before calling the service function. Also validate `hookStatus` and `notificationType` against expected enums.

### [CC-P6-A5-006] `POST /api/sessions/create` -- `workingDirectory` not validated for path traversal or existence
- **File:** `app/api/sessions/create/route.ts`:11-20
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `workingDirectory` from request body is passed directly to the service layer which uses it to create a tmux session. While Phase 1 is localhost-only, an attacker could create a session with `workingDirectory` pointing to sensitive directories like `/etc`, `/root`, or `~/.ssh`. The service layer at `sessions-service.ts:591` falls back to `process.cwd()` if not provided but does not validate the provided path.
- **Evidence:**
  ```typescript
  // Route layer (create/route.ts:11-14)
  const result = await createSession({
    name: body.name,
    workingDirectory: body.workingDirectory,  // no validation
    // ...
  })

  // Service layer (sessions-service.ts:591)
  const cwd = workingDirectory || process.cwd()
  await runtime.createSession(actualSessionName, cwd)
  ```
- **Fix:** Add validation that `workingDirectory` (when provided) is an absolute path, exists on disk, and is within an allowed base directory (e.g., user home). At minimum, verify the directory exists with `fs.existsSync`.

### [CC-P6-A5-007] `app/api/docker/info/route.ts` -- missing error response branch
- **File:** `app/api/docker/info/route.ts`:12
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The route does not check for `result.error` before returning `result.data`. Unlike most other routes in this codebase that follow the pattern `if (result.error) { return error response } else { return data }`, this route skips the error check. Looking at the service implementation, `getDockerInfo` always returns `data` (even on Docker not being available), so this doesn't crash. However, it violates the codebase's consistent error-handling pattern and would break if the service's error contract changes.
- **Evidence:**
  ```typescript
  export async function GET() {
    const result = await getDockerInfo()
    // Missing: if (result.error) { ... }
    return NextResponse.json(result.data, { status: result.status })
  }
  ```
- **Fix:** Add the standard `if (result.error)` guard for consistency and defensive programming.

### [CC-P6-A5-008] `POST /api/plugin-builder/scan-repo` -- `body.ref` not validated before being passed to service
- **File:** `app/api/plugin-builder/scan-repo/route.ts`:22
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The route validates `body.url` but passes `body.ref` (or default `'main'`) directly to `scanRepo`. The service layer validates the ref, but the default `'main'` fallback should be in the service layer, not split between route and service. More importantly, if `body.ref` is not a string (e.g., a number or object), it bypasses the `typeof body.url !== 'string'` check on the URL but could cause unexpected behavior in the ref validation.
- **Evidence:**
  ```typescript
  const result = await scanRepo(body.url, body.ref || 'main')
  ```
- **Fix:** Validate that `body.ref` is either undefined or a string before passing to the service.


*(none)*


### [CC-P6-A4-002] Metadata PATCH returns 400 for all caught errors including internal failures
- **File:** app/api/agents/metadata/route.ts:53-55
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The PATCH handler catches all errors from `updateAgent()` and returns status 400. However, `updateAgent()` can throw for internal reasons (file I/O errors, JSON parse errors) in addition to validation errors (duplicate name). Internal server errors should return 500, not 400. Only the `"already exists"` throw from the registry (line 497 of agent-registry.ts) is truly a 400.
- **Evidence:**
```typescript
// Lines 52-56 in metadata/route.ts
} catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update metadata'
    console.error('Failed to update agent metadata:', error)
    return NextResponse.json({ error: message }, { status: 400 }) // Always 400, even for I/O errors
}
```
- **Fix:** Differentiate validation errors (400) from internal errors (500). For example, check if the error message contains "already exists" for 400, else 500. Or better, use the service layer pattern with `ServiceResult`.

### [CC-P6-A4-003] Multiple routes lack top-level try-catch for unexpected errors
- **File:** Multiple files (see list below)
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Several route handlers do not have a top-level try-catch. While the service functions internally return `ServiceResult` (not throwing), an unexpected error in `await params`, URL parsing, or an unhandled edge case would produce an uncontrolled 500 with a stack trace. Routes with try-catch consistently return sanitized error messages. Affected handlers:
  - `app/api/agents/[id]/route.ts` (GET)
  - `app/api/agents/[id]/database/route.ts` (GET, POST)
  - `app/api/agents/[id]/graph/code/route.ts` (GET, POST, DELETE)
  - `app/api/agents/[id]/graph/db/route.ts` (GET, POST, DELETE)
  - `app/api/agents/[id]/graph/query/route.ts` (GET)
  - `app/api/agents/[id]/index-delta/route.ts` (POST)
  - `app/api/agents/[id]/memory/route.ts` (GET, POST)
  - `app/api/agents/[id]/memory/long-term/route.ts` (GET, DELETE, PATCH)
  - `app/api/agents/[id]/messages/route.ts` (GET, POST)
  - `app/api/agents/[id]/messages/[messageId]/route.ts` (GET, PATCH, DELETE, POST)
  - `app/api/agents/[id]/metrics/route.ts` (GET, PATCH)
  - `app/api/agents/[id]/search/route.ts` (GET, POST - POST has inner catch for JSON but no outer)
  - `app/api/agents/[id]/tracking/route.ts` (GET, POST)
  - `app/api/agents/[id]/hibernate/route.ts` (POST)
  - `app/api/agents/[id]/wake/route.ts` (POST)
  - `app/api/agents/unified/route.ts` (GET)
- **Evidence:**
```typescript
// Example: app/api/agents/[id]/database/route.ts
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params  // could theoretically throw
  const result = await getDatabaseInfo(agentId)
  // No try-catch wrapping these calls
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
```
- **Fix:** Wrap each handler in a top-level try-catch that returns `{ error: 'Internal server error' }` with status 500 for consistency. Next.js will catch unhandled errors but returns a generic HTML error page rather than a JSON API response.

### [CC-P6-A4-004] Agent ID not validated as UUID in most routes, only in skills/config-deploy
- **File:** Multiple files
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Only `skills/route.ts`, `skills/settings/route.ts`, and `config/deploy/route.ts` validate that the `id` path parameter is a valid UUID using `isValidUuid()`. All other `[id]` routes pass the raw path parameter directly to service functions. While the service layer uses `getAgent(id)` which does a lookup by ID (not constructing file paths from it), this inconsistency means some routes silently accept malformed IDs like `../../../etc/passwd` -- the lookup will return null / "not found", but the inconsistency is a defense-in-depth gap.
- **Evidence:**
```typescript
// skills/route.ts line 24 - validates:
if (!isValidUuid(id)) {
  return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
}

// [id]/route.ts line 13 - does NOT validate:
const { id } = await params
const result = getAgentById(id)
```
- **Fix:** Add `isValidUuid(id)` check to all `[id]` routes, or add it once in a shared middleware / utility function.

### [CC-P6-A4-005] Wake route lowercases program name which may break case-sensitive executables
- **File:** app/api/agents/[id]/wake/route.ts:27
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** When parsing the optional `program` field from the request body, the code calls `.toLowerCase()` on line 27. If an agent specifies a program with mixed case (e.g., a custom script `runAgent.sh`), this would produce `runagent.sh` which would fail to execute on case-sensitive file systems (macOS with case-sensitive APFS, Linux).
- **Evidence:**
```typescript
// Line 26-28
if (typeof body.program === 'string') {
  program = body.program.toLowerCase()
}
```
- **Fix:** Remove `.toLowerCase()` unless there's a documented reason for normalization. The program name should be passed as-is.


(none)


### [CC-P6-A3-004] `Number(body.priority)` passes NaN silently for non-numeric input
- **File:** `app/api/teams/[id]/tasks/[taskId]/route.ts`:36, `app/api/teams/[id]/tasks/route.ts`:63
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `body.priority` is a non-numeric string like `"high"`, `Number("high")` evaluates to `NaN`, which gets passed through to `createTask`/`updateTask`. The service layer does not appear to validate that priority is a finite number. This means `NaN` could end up persisted in the task file.
- **Evidence:**
  ```typescript
  // app/api/teams/[id]/tasks/[taskId]/route.ts:36
  ...(body.priority !== undefined && { priority: Number(body.priority) }),

  // Number("abc") === NaN -- silently passes through
  ```
- **Fix:** Add a check: `const p = Number(body.priority); if (!Number.isFinite(p)) return 400`. Or use `Number.isInteger(body.priority)` if priority should be an integer.

### [CC-P6-A3-005] Notify route authenticates agent but does not pass identity to service
- **File:** `app/api/teams/notify/route.ts`:6-21
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The notify route authenticates the requesting agent via `authenticateAgent()` (lines 8-14), obtains `auth.agentId` implicitly, but never uses it. The `notifyTeamAgents()` service function receives only `body` and does not know who initiated the notification. This means any authenticated agent can trigger notifications for any team without any ACL check or audit trail of who initiated the notification.
- **Evidence:**
  ```typescript
  // app/api/teams/notify/route.ts
  const auth = authenticateAgent(...)
  if (auth.error) { ... }
  // auth.agentId is available but never used

  let body
  try { body = await request.json() } catch { ... }
  const result = await notifyTeamAgents(body)  // body has no requestingAgentId
  ```
- **Fix:** Pass `requestingAgentId: auth.agentId` in the body or as a separate parameter to `notifyTeamAgents()`, and add team ACL validation in the service layer (at minimum for closed teams).

### [CC-P6-A3-006] Meetings routes have no authentication
- **File:** `app/api/meetings/route.ts`:1-18, `app/api/meetings/[id]/route.ts`:1-36
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Neither the meetings list/create route nor the meetings `[id]` route imports or uses `authenticateAgent`. All other team-related routes (teams CRUD, tasks, documents, notify) authenticate agents for write operations. Meetings are team-associated resources (they contain `teamId`), yet any request can create, update, or delete meetings without proving identity. While Phase 1 is localhost-only, this is inconsistent with the governance model applied to sibling routes.
- **Evidence:**
  ```typescript
  // app/api/meetings/route.ts -- no auth import
  import { NextRequest, NextResponse } from 'next/server'
  import { listMeetings, createNewMeeting } from '@/services/messages-service'
  // No authenticateAgent import or usage

  // app/api/meetings/[id]/route.ts -- no auth import
  import { NextRequest, NextResponse } from 'next/server'
  import { getMeetingById, updateExistingMeeting, deleteExistingMeeting } from '@/services/messages-service'
  // No authenticateAgent import or usage
  ```
- **Fix:** Add `authenticateAgent` to at minimum the POST, PATCH, and DELETE handlers for meetings, consistent with the pattern used in teams/tasks/documents routes.

### [CC-P6-A3-007] Unsafe `as` cast for `body.status` in task update route
- **File:** `app/api/teams/[id]/tasks/[taskId]/route.ts`:35
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The line `body.status as UpdateTaskParams['status']` casts arbitrary user input to the `TaskStatus` union type without validation. A user could send `{ "status": "hacked" }` and it would pass the type assertion. The service layer does validate the status against `VALID_TASK_STATUSES` (line 389), so this won't cause data corruption, but the route-level `as` cast is misleading.
- **Evidence:**
  ```typescript
  // app/api/teams/[id]/tasks/[taskId]/route.ts:35
  ...(body.status !== undefined && { status: body.status as UpdateTaskParams['status'] }),
  ```
- **Fix:** Add route-level validation: `if (body.status !== undefined && !['backlog','pending','in_progress','review','completed'].includes(body.status)) return 400`. Or remove the cast and pass as `string`, since the service already validates.

### [CC-P6-A3-008] `updateTeamById` service double-strips `type` and `chiefOfStaffId` (defense-in-depth redundancy)
- **File:** `app/api/teams/[id]/route.ts`:57, `services/teams-service.ts`:204
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The route at line 57 strips `type` and `chiefOfStaffId` from the body, then passes `safeBody` to `updateTeamById()`. The service at line 204 strips them again from `params`. The route comment says "CC-005" and the service comment says "CC-007 defense-in-depth". While defense-in-depth is a valid pattern, the double-strip means:
  1. The properties are already absent by the time they reach the service, so the service destructuring assigns `undefined` to `_type` and `_cos`.
  2. A developer might remove the route-level strip thinking the service handles it, or vice versa, leading to a regression.
- **Evidence:**
  ```typescript
  // Route: app/api/teams/[id]/route.ts:57
  const { type: _type, chiefOfStaffId: _cos, ...safeBody } = body
  const result = await updateTeamById(id, { ...safeBody, requestingAgentId })

  // Service: services/teams-service.ts:204
  const { requestingAgentId, type: _type, chiefOfStaffId: _cos, ...updateFields } = params
  ```
- **Fix:** This is acceptable as defense-in-depth but add a comment in the service saying "Route already strips these; this is a safety net" to prevent future confusion. Consider consolidating to one location with a clear comment.


### [CC-P6-A6-004] useGovernance addAgentToTeam/removeAgentFromTeam read-modify-write race condition
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:210-283
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Both `addAgentToTeam` and `removeAgentFromTeam` follow a read-modify-write pattern: they GET the current team, modify `agentIds` locally, then PUT the full array back. If two browser tabs or rapid UI clicks modify the same team simultaneously, one operation's writes will overwrite the other's. The code includes comments acknowledging this TOCTOU race (CC-006), and the server validates mutations. However, the functions could lose agent additions if two adds happen concurrently, since each starts with the same snapshot.
- **Evidence:**
  ```typescript
  // hooks/useGovernance.ts:210-243
  const addAgentToTeam = useCallback(
    async (teamId: string, targetAgentId: string) => {
      const teamRes = await fetch(`/api/teams/${teamId}`)   // Read
      const team = teamData.team
      const updatedAgentIds = [...team.agentIds, targetAgentId]  // Modify
      const res = await fetch(`/api/teams/${teamId}`, {     // Write
        method: 'PUT',
        body: JSON.stringify({ agentIds: updatedAgentIds }),
      })
    }
  )
  ```
- **Fix:** Already documented as Phase 2 TODO. For Phase 1, consider adding a simple mutex (e.g., `isMutating` ref) to serialize team membership changes within the same browser tab.

### [CC-P6-A6-005] MessageCenter sendMessage does not guard against concurrent submits
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:171-253
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `sendMessage` function sets `loading` to true at line 177, but does not check if `loading` is already true before executing. If a user rapidly clicks the Send button, multiple messages could be sent before the first completes and the form resets. The UI likely disables the button when `loading=true`, but the function itself has no guard.
- **Evidence:**
  ```typescript
  // MessageCenter.tsx:171-253
  const sendMessage = async () => {
    if (!composeTo || !composeSubject || !composeMessage) { ... return }
    setLoading(true) // No check for already-loading
    try { ... }
  }
  ```
- **Fix:** Add `if (loading) return` at the start of `sendMessage`, similar to GovernancePasswordDialog's `if (submitting) return` guard.

### [CC-P6-A6-006] TerminalView localStorage access inside useState initializer can throw in SSR edge cases
- **File:** /Users/emanuelesabetta/ai-maestro/components/TerminalView.tsx:52-61
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `notesCollapsed` useState initializer (lines 52-61) accesses `localStorage` inside a function that checks `typeof window === 'undefined'`. This is correct for SSR protection, but `localStorage.getItem()` can throw in some edge cases (e.g., Safari private browsing in older versions, iframe sandboxing). A try/catch would be more defensive.
- **Evidence:**
  ```typescript
  const [notesCollapsed, setNotesCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    const mobile = window.innerWidth < 768
    const collapsedKey = `agent-notes-collapsed-${session.agentId || session.id}`
    const savedCollapsed = localStorage.getItem(collapsedKey) // Can throw
    ...
  })
  ```
- **Fix:** Wrap the `localStorage.getItem` call in a try/catch with a fallback value.

### [CC-P6-A6-007] TeamOverviewSection uses index as key for repository list
- **File:** /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:792
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The repository list uses `key={idx}` (array index) instead of a stable identifier. If repositories are re-ordered or one is removed, React may incorrectly reuse DOM nodes, causing stale content display.
- **Evidence:**
  ```typescript
  // AgentProfile.tsx:792
  {repositories.map((repo, idx) => (
    <div key={idx} ...>
  ```
- **Fix:** Use `repo.remoteUrl` or `repo.localPath` as the key, since these should be unique per repository.

### [CC-P6-A6-008] AgentSkillEditor SkillDetailModal is dead code (selectedSkill never set)
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:73
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The component imports and renders `SkillDetailModal` based on `selectedSkill` state, but `setSelectedSkill` is never called with a non-null value anywhere in the file. The TODO comment at line 71-72 acknowledges this. The dead code imports (`SkillDetailModal`, the state variable, and the modal render) add bundle size and confusion.
- **Evidence:**
  ```typescript
  // Line 73
  const [selectedSkill, setSelectedSkill] = useState<MarketplaceSkill | null>(null)
  // The TODO at lines 71-72 says:
  // TODO(NT-021): selectedSkill is never set to non-null; SkillDetailModal below is dead code.
  ```
- **Fix:** Remove the dead `selectedSkill` state, `setSelectedSkill`, and `SkillDetailModal` import/render code.

### [CC-P6-A6-009] RoleAssignmentDialog fetches agent names from /api/sessions but doesn't abort on unmount
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:109-123
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The useEffect that fetches agent names (lines 109-123) does not use an AbortController. If the dialog is opened and quickly closed, the fetch completes and calls `setAgentNameMap` on an unmounted component. While React 18 doesn't throw for this, it wastes resources and could cause a flash of stale data if the dialog is re-opened before the previous fetch completes.
- **Evidence:**
  ```typescript
  // RoleAssignmentDialog.tsx:109-123
  useEffect(() => {
    if (!isOpen) return
    fetch('/api/sessions')
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then(data => {
        const map = new Map<string, string>()
        ...
        setAgentNameMap(map) // No abort guard
      })
      .catch(() => {})
  }, [isOpen])
  ```
- **Fix:** Add an AbortController with cleanup: `return () => controller.abort()`.

### [CC-P6-A6-010] BuildAction poll interval does not use AbortController for fetch requests
- **File:** /Users/emanuelesabetta/ai-maestro/components/plugin-builder/BuildAction.tsx:78-107
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The polling interval in `handleBuild` creates `setInterval` that makes fetch requests without AbortController. If the component unmounts while polling, in-flight requests may attempt to set state on an unmounted component. The cleanup effect at lines 33-36 clears the interval but doesn't abort pending fetches.
- **Evidence:**
  ```typescript
  // BuildAction.tsx:78-107
  pollRef.current = setInterval(async () => {
    try {
      const statusRes = await fetch(`/api/plugin-builder/builds/${data.buildId}`)
      // No abort signal, no unmount guard
      if (statusRes.ok) {
        ...setResult(statusData)...
      }
    }
  }, 1000)
  ```
- **Fix:** Use an AbortController per poll cycle, and abort it in the cleanup effect.

### [CC-P6-A6-011] useGovernance refresh() has empty dependency array but captures no state -- subtle correctness issue
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:68-136
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `refresh` callback has an empty dependency array (line 136), and the comment at lines 133-135 explains this is intentional because it only uses `fetch` (global) and `setState` (stable). This is correct -- but it means all calls to `refresh()` after mutations (lines 156, 175, 194, 236, 277, 309, 338, 358, 378) are fire-and-forget without an AbortSignal. If the component unmounts during a mutation, the subsequent `refresh()` call's state updates will target a potentially unmounted component. The `signal?.aborted` guard in `finally` (line 130) only protects when signal is passed -- these fire-and-forget calls pass no signal.
- **Evidence:**
  ```typescript
  // hooks/useGovernance.ts:156
  refresh() // CC-002: Intentionally fire-and-forget -- no signal

  // hooks/useGovernance.ts:128-132
  .finally(() => {
    if (signal?.aborted) return  // Only guards when signal is passed
    setLoading(false)
  })
  ```
- **Fix:** While React 18 tolerates state updates on unmounted components, consider tracking mount state with a ref and skipping state updates in `refresh()` if unmounted.


### [CC-P6-A2-006] Approve endpoint does not validate `approverAgentId` format
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/approve/route.ts`:22-26
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The body fields `approverAgentId` and `password` are checked for truthiness (`!body?.approverAgentId`) but not for type (`typeof ... !== 'string'`). A numeric or boolean value would pass the truthy check. Additionally, `approverAgentId` is not UUID-validated like other agent IDs in this domain.
- **Evidence:**
  ```typescript
  // approve/route.ts:22-24
  if (!body?.approverAgentId || !body?.password) {
    return NextResponse.json({ error: 'Missing required fields...' }, { status: 400 })
  }
  ```
- **Fix:** Add type checks (`typeof body.approverAgentId !== 'string'`) and UUID validation (`isValidUuid(body.approverAgentId)`).

### [CC-P6-A2-007] Reject endpoint does not validate `rejectorAgentId` format
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/reject/route.ts`:50,58
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `rejectorAgentId` field is checked for truthiness but not for string type or UUID format, in both the remote-host and local-rejection code paths (lines 50 and 58). All other governance endpoints that accept agent IDs validate them with `isValidUuid()`.
- **Evidence:**
  ```typescript
  // reject/route.ts:50 (remote path)
  if (!body?.rejectorAgentId) { ... }
  // reject/route.ts:58 (local path)
  if (!body?.rejectorAgentId || !body?.password) { ... }
  ```
- **Fix:** Add `typeof body.rejectorAgentId !== 'string'` and `isValidUuid(body.rejectorAgentId)` checks in both paths.

### [CC-P6-A2-008] Sync POST reflects user-controlled `fromHostId` in error message
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/sync/route.ts`:36
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When the host is unknown, the error message includes `body.fromHostId` which comes from user input: `` `Unknown host: ${body.fromHostId}` ``. While this is a JSON API (not HTML), the inconsistency with the requests endpoint (which returns plain `'Unknown host'`) suggests this was unintentional. Could facilitate reconnaissance.
- **Evidence:**
  ```typescript
  // sync/route.ts:36
  { error: `Unknown host: ${body.fromHostId}` }
  ```
- **Fix:** Change to `{ error: 'Unknown host' }` to match the pattern used in requests/route.ts:42.

### [CC-P6-A2-009] Trust DELETE does not validate `hostId` path parameter format
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/trust/[hostId]/route.ts`:19
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `hostId` path parameter is extracted from `await params` and passed to `removeTrust(hostId, body?.password)` without any format validation. The requests GET endpoint validates `hostId` with a hostname regex. The trust DELETE endpoint does not, potentially allowing path traversal or injection if `removeTrust` uses the hostId in file operations internally.
- **Evidence:**
  ```typescript
  // trust/[hostId]/route.ts:19
  const { hostId } = await params
  // No validation — passed directly to removeTrust
  const result = await removeTrust(hostId, body?.password)
  ```
- **Fix:** Add hostname format validation (e.g., using the `HOSTNAME_RE` pattern from the requests route) before calling `removeTrust`.

### [CC-P6-A2-010] Requests POST does not validate `body.request` object for remote receive path
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts`:56
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** In the remote-receive path (when `body.fromHostId` is present), `body.request` is passed to `receiveCrossHostRequest(body.fromHostId, body.request)` without any validation that `body.request` exists, is an object, or has required fields. If a remote host sends `{ fromHostId: "x" }` with no `request` field, it will pass `undefined` to the service.
- **Evidence:**
  ```typescript
  // requests/route.ts:56
  const result = await receiveCrossHostRequest(body.fromHostId, body.request)
  // body.request is never validated
  ```
- **Fix:** Add validation: `if (!body.request || typeof body.request !== 'object') { return NextResponse.json({ error: 'Missing or invalid request object' }, { status: 400 }) }`

### [CC-P6-A2-011] Governance root GET missing try/catch error handling
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts`:8-17
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The GET handler in `governance/route.ts` has no try/catch block. If `loadGovernance()` or `getAgent()` throws (e.g., file permission error, corrupted JSON after backup fails), the error propagates uncaught to Next.js, which returns a generic 500 without logging. Every other route in this domain has try/catch with explicit error logging.
- **Evidence:**
  ```typescript
  // governance/route.ts:8-17
  export async function GET() {
    const config = loadGovernance()
    const managerName = config.managerId ? getAgent(config.managerId)?.name || null : null
    return NextResponse.json({
      hasPassword: !!config.passwordHash,
      hasManager: !!config.managerId,
      managerId: config.managerId,
      managerName,
    })
  }
  ```
- **Fix:** Wrap in try/catch with `console.error` logging and 500 response, matching other routes.

### [CC-P6-A2-012] Reject endpoint signature verification before JSON parsing allows denial-of-service
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/reject/route.ts`:29-55
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The reject endpoint checks for host-signature headers *after* parsing the JSON body. If all three host-signature headers are present but the body contains a valid `rejectorAgentId`, the code enters the remote path and calls `receiveRemoteRejection`. However, the body's `password` field (if present) is completely ignored in the remote path, which is correct. The concern is: if a remote host sets all three headers AND also sends a `password` field, the `password` in the body is silently ignored with no warning. This is not a bug per se, but it means the routing decision (local vs remote) is based purely on header presence, which could be surprising. An attacker who can set custom headers could force any request to take the remote path and bypass password authentication (though they'd need a valid host signature).
- **Evidence:**
  ```typescript
  // reject/route.ts:32
  if (hostSignature && hostTimestamp && hostId) {
    // Remote path — skips password check entirely
    // Relies solely on host signature for auth
  ```
- **Fix:** This is working as designed (host signatures are cryptographically stronger than passwords). Document the routing decision more explicitly in comments so future reviewers understand this is intentional. Optionally, log a warning if both `password` and host-signature headers are present simultaneously.


No SHOULD-FIX issues found.


### [CC-P6-A7-004] transfer-registry.test.ts does not test revertTransferToPending or cleanupOldTransfers
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:46-53
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The import block at lines 46-53 imports `loadTransfers`, `createTransferRequest`, `getTransferRequest`, `getPendingTransfersForTeam`, `getPendingTransfersForAgent`, and `resolveTransferRequest`. However, `lib/transfer-registry.ts` also exports `revertTransferToPending` (line 147) and `cleanupOldTransfers` (line 169), which are not imported or tested. `revertTransferToPending` is used as a compensating transaction in `transfer-resolve-route.ts` and is critical for data consistency when downstream operations fail. `cleanupOldTransfers` handles time-based cleanup with a 30-day cutoff. Both functions have non-trivial logic paths that lack test coverage.
- **Evidence:**
  ```typescript
  // transfer-registry.ts exports not tested:
  export async function revertTransferToPending(id: string): Promise<boolean> { ... }
  export async function cleanupOldTransfers(): Promise<number> { ... }
  ```
- **Fix:** Add tests for `revertTransferToPending` (approved->pending revert, rejected->pending revert, not-found returns false, already-pending is no-op) and `cleanupOldTransfers` (removes resolved requests older than 30 days, keeps pending regardless of age, keeps recent resolved).

### [CC-P6-A7-005] agent-registry.test.ts fs mock uses only default export; source imports may mismatch
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts:38-68
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The agent-registry.test.ts fs mock provides methods only on `default: { ... }`, with no named exports. Other test files in the codebase that mock `fs` for sources using named imports (like `import { readFileSync, writeFileSync, ... } from 'fs'`) provide both `default` AND named export mocks (see governance-request-registry.test.ts lines 40-79, governance-peers.test.ts). If `agent-registry.ts` uses `import fs from 'fs'` (default import), this works. However, this pattern is fragile -- if agent-registry.ts is refactored to use named imports (as many other lib files do, e.g., transfer-registry.ts, governance-peers.ts), the mock would silently fail. The inconsistency across test files (some provide both, some only default) creates a maintenance risk.
- **Evidence:**
  ```typescript
  // agent-registry.test.ts: default-only mock
  vi.mock('fs', () => ({ default: { existsSync, mkdirSync, ... } }))

  // governance-request-registry.test.ts: both default AND named exports
  vi.mock('fs', () => ({
    default: { existsSync, ... },
    existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync,
  }))
  ```
- **Fix:** Add named export aliases alongside the default export in the agent-registry.test.ts fs mock, matching the pattern in governance-request-registry.test.ts.

### [CC-P6-A7-006] sessions-service.test.ts listSessions cache test may interfere with other tests
- **File:** /Users/emanuelesabetta/ai-maestro/tests/services/sessions-service.test.ts:137-155
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The test at line 140 verifies that `listSessions()` caches results for 3 seconds. Because the cache is module-level state in `sessions-service.ts`, and `beforeEach` only clears mocks (not the module-level cache), this test's cached state can leak into subsequent tests. The test comment at line 137-138 acknowledges this: "listSessions has a module-level 3s cache that persists across tests." This means other describe blocks testing functions that internally call `listSessions` may get stale cached data from this test, potentially masking bugs. Other tests that call `listLocalSessions` (which is tested separately) may work around this, but any test that calls `listSessions` directly after this test could get cached data.
- **Evidence:**
  ```typescript
  // sessions-service.test.ts line 137-138:
  // NOTE: listSessions has a module-level 3s cache that persists across tests.
  // We test caching in a single test. For session data behavior, use listLocalSessions.
  ```
- **Fix:** Either (a) reset the module-level cache between tests using `vi.resetModules()` and dynamic imports, or (b) use `vi.useFakeTimers()` to advance past the 3s TTL between tests, or (c) export a `resetCache()` function from sessions-service.ts for test use.

### [CC-P6-A7-007] document-api.test.ts documents known stored-XSS surface but no sanitization test exists
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The document-api.test.ts file documents a known stored-XSS security surface: the document content field stores HTML verbatim without sanitization. However, there is no test that verifies either (a) that HTML is sanitized before storage, or (b) that the system explicitly documents this as an accepted risk with output encoding happening at render time. Since Phase 1 is localhost-only, this is not a critical vulnerability, but the test suite should at minimum verify the behavior (storing raw HTML) and document the security boundary explicitly.
- **Evidence:** Document API creates and updates documents with arbitrary content strings, including potential HTML/script payloads, without any sanitization test.
- **Fix:** Add a test that stores HTML content (e.g., `<script>alert(1)</script>`) and verifies the expected behavior -- either sanitized output or documented acceptance of raw storage with render-time encoding.

### [CC-P6-A7-008] cross-host-governance.test.ts uses vi.waitFor for fire-and-forget fetch assertions, which is timing-dependent
- **File:** /Users/emanuelesabetta/ai-maestro/tests/cross-host-governance.test.ts
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** Several tests in cross-host-governance.test.ts use `vi.waitFor()` to assert on fire-and-forget `fetch()` calls that happen inside `performRequestExecution`. While this pattern is documented (CC-P4-004), it depends on `vi.waitFor`'s default timeout and polling interval to catch the asynchronous fetch. In CI environments with higher latency, these assertions could become flaky. The pattern is: the function under test fires a fetch and does not await it; the test uses `vi.waitFor(() => expect(mockFetch).toHaveBeenCalled())` to poll for the assertion.
- **Evidence:** Multiple tests use `await vi.waitFor(() => { expect(mockFetch).toHaveBeenCalled() })` to catch fire-and-forget network calls.
- **Fix:** Consider refactoring the service to return a promise for the fire-and-forget operation (at least in test mode), or use `vi.waitFor` with explicit timeout parameters to make the timing expectation clear.

### [CC-P6-A7-009] host-keys.test.ts module cache reset pattern may leak state between tests
- **File:** /Users/emanuelesabetta/ai-maestro/tests/host-keys.test.ts
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The host-keys.test.ts uses `vi.resetModules()` + dynamic `import()` to reset the module-level `cachedKeyPair` variable between tests. This is correct in principle, but the pattern is fragile: if any test forgets to use the dynamically-imported module and instead uses the static import, it would operate on a stale cached module instance. The test file handles this correctly for the tests I reviewed, but the pattern itself is error-prone for future test additions.
- **Evidence:** Tests use `vi.resetModules()` then `const { getOrCreateHostKeyPair, ... } = await import('@/lib/host-keys')` to get a fresh module instance.
- **Fix:** Add a comment warning future developers to always use the dynamically-imported module, or export a `_resetCacheForTesting()` function from host-keys.ts.

### [CC-P6-A7-010] agent-config-governance-extended.test.ts has two separate mock systems for agent-registry
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts:59-98
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test file sets up two separate mock paths for agent registry: `mockGetAgent` (line 59, used via `@/lib/agent-registry.getAgent`) and `mockAgentRegistryGetAgent` (line 94, used via `@/lib/agent.agentRegistry.getAgent`). These are separate mocks pointing to different mock functions for what is conceptually the same operation: getting an agent by ID. If a test only configures one mock but the code under test uses the other path, the test will get `undefined` (the default mock return) instead of failing explicitly. This makes it easy to write tests that pass for the wrong reason.
- **Evidence:**
  ```typescript
  // Line 59: const mockGetAgent = vi.fn()
  // Line 67: vi.mock('@/lib/agent-registry', () => ({ getAgent: (...args) => mockGetAgent(...args), ... }))

  // Line 94: const mockAgentRegistryGetAgent = vi.fn()
  // Line 95: vi.mock('@/lib/agent', () => ({ agentRegistry: { getAgent: (...args) => mockAgentRegistryGetAgent(...args) } }))
  ```
- **Fix:** Document clearly in the test file which code paths use which mock, and consider unifying them if the source code can be refactored to use a single agent registry access pattern.


### [CC-P6-A0-006] amp-auth.ts: cleanupExpiredKeys is not serialized with withLock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:371-396
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `cleanupExpiredKeys()` performs a read-modify-write cycle (loadApiKeys + filter + saveApiKeys) without acquiring the `amp-api-keys` lock. If called concurrently with `createApiKey`, `rotateApiKey`, or `revokeApiKey`, it could overwrite their changes.
- **Evidence:**
  ```typescript
  // amp-auth.ts:371 -- note: no withLock wrapper
  export function cleanupExpiredKeys(): number {
    const keys = loadApiKeys()
    // ... filter ...
    if (removedCount > 0) {
      saveApiKeys(activeKeys)
    }
    return removedCount
  }
  ```
- **Fix:** Wrap the function body in `withLock('amp-api-keys', () => { ... })` and make it async.

### [CC-P6-A0-007] amp-auth.ts: validateApiKey mutates shared cached array
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:218-226
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `validateApiKey()` calls `loadApiKeys()` which may return the cached array `_apiKeysCache`. The function then mutates `record.last_used_at` directly on an object in that cached array, then calls `saveApiKeys(keys)` which overwrites the file AND refreshes the cache. While this works correctly because the cache IS the source of truth after save, it couples mutation to caching in a fragile way. If any future change introduces a code path between the mutation and the save, the cache would be in an inconsistent state.
- **Evidence:**
  ```typescript
  // amp-auth.ts:223
  record.last_used_at = new Date().toISOString()
  saveApiKeys(keys)  // saves AND updates cache
  ```
- **Fix:** Document the invariant (mutation + immediate save) or clone the array before mutation to decouple cache from write operations.

### [CC-P6-A0-008] governance-request-registry.ts: saveGovernanceRequests uses non-PID-specific temp file
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:75
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The temp file for atomic writes uses a fixed suffix `.tmp` without including `process.pid`. If two processes somehow both attempt to write at the same time (future multi-process scenario), they would write to the same temp file, causing a race. Compare with amp-auth.ts:85 which uses `.tmp.${process.pid}`.
- **Evidence:**
  ```typescript
  // governance-request-registry.ts:75
  const tmpFile = REQUESTS_FILE + '.tmp'
  ```
  vs amp-auth.ts:85:
  ```typescript
  const tmpFile = API_KEYS_FILE + `.tmp.${process.pid}`
  ```
- **Fix:** Include `process.pid` in the temp file name for consistency: `REQUESTS_FILE + '.tmp.' + process.pid`.

### [CC-P6-A0-009] governance.ts, governance-peers.ts, manager-trust.ts: Same non-PID temp file issue
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:67, lib/governance-peers.ts:65, lib/manager-trust.ts:97
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Same as CC-P6-A0-008. Multiple files use fixed `.tmp` suffix without `process.pid`.
- **Evidence:**
  ```typescript
  // governance.ts:67
  const tmpFile = GOVERNANCE_FILE + '.tmp'
  // governance-peers.ts:65
  const tmpFile = `${filePath}.tmp`
  // manager-trust.ts:97
  const tmpFile = TRUST_FILE + '.tmp'
  ```
- **Fix:** Include `process.pid` in all temp file names.

### [CC-P6-A0-010] index-delta.ts: acquireIndexSlot has no timeout, queue can grow unbounded
- **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:35-55
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `acquireIndexSlot()` enqueues a promise that never rejects. If the active index operation hangs or crashes without calling `releaseIndexSlot()`, all queued operations wait indefinitely. Unlike `file-lock.ts` which has a 30-second timeout (NT-007), there is no timeout for the index throttle.
- **Evidence:**
  ```typescript
  // index-delta.ts:44-54
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
  // No reject path, no timeout
  ```
- **Fix:** Add a timeout (e.g., 5 minutes) that rejects the promise and removes the entry from the queue, matching the pattern in file-lock.ts.

### [CC-P6-A0-011] message-filter.ts: Step 5b allows open-world agent to message MANAGER/COS in closed teams
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:174-181
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** POSSIBLE
- **Description:** After Step 5 (closed-team member rules), the code falls through to Step 5b which allows any open-world sender (not in any closed team) to reach MANAGER and COS. While this is documented as intentional (v2 Rules 62-63), it creates an information flow from open-world to governance roles in closed teams. An open-world agent could probe COS/MANAGER for information that should stay within the closed team. This may be a design decision rather than a bug, but worth flagging for review.
- **Evidence:**
  ```typescript
  // message-filter.ts:174-181
  // Step 5b: Open-world agents can reach MANAGER and COS (v2 Rules 62-63)
  if (agentIsManager(recipientAgentId)) {
    return { allowed: true }
  }
  if (agentIsCOS(recipientAgentId)) {
    return { allowed: true }
  }
  ```
- **Fix:** Verify this is intentional policy. If so, add a comment noting the security implication. If not, restrict open-world-to-COS messaging.

### [CC-P6-A0-012] messageQueue.ts: convertAMPToMessage `fromVerified` uses double nullish coalescing
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:267
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The expression `ampMsg.fromVerified ?? Boolean(envelope.signature || ampMsg.signature) ?? false` has a redundant `?? false` at the end. `Boolean(...)` always returns either `true` or `false` (never null/undefined), so the final `?? false` is dead code. While not causing wrong behavior, it suggests a misunderstanding of the operator precedence.
- **Evidence:**
  ```typescript
  // messageQueue.ts:267
  fromVerified: ampMsg.fromVerified ?? Boolean(envelope.signature || ampMsg.signature) ?? false,
  ```
- **Fix:** Remove the trailing `?? false`:
  ```typescript
  fromVerified: ampMsg.fromVerified ?? Boolean(envelope.signature || ampMsg.signature),
  ```

### [CC-P6-A0-013] governance-peers.ts: validateHostId regex allows special characters
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-peers.ts:29-33
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `validateHostId` only rejects hostIds containing path separators (`/`, `\`) or `..`. This means hostIds with special characters like spaces, quotes, newlines, null bytes, or other potentially dangerous characters are accepted. While the immediate path construction is safe (it only forms a filename), a relaxed hostId could cause issues in logging, JSON storage, or downstream consumers.
- **Evidence:**
  ```typescript
  // governance-peers.ts:29-33
  function validateHostId(hostId: string): void {
    if (!hostId || /[\/\\]|\.\./.test(hostId)) {
      throw new Error(`Invalid hostId: contains path traversal characters: ${hostId}`)
    }
  }
  ```
- **Fix:** Use a strict allowlist regex instead: `/^[a-zA-Z0-9_.-]+$/`. This matches the `parseAMPAddress` name validation pattern in lib/types/amp.ts:96.

---


### [CC-P6-A8-003] start-with-ssh.sh hardcodes tsx path via node_modules
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh:29
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The script uses `exec ./node_modules/.bin/tsx server.mjs` which is a relative path. If the script is invoked from a different working directory, it will fail. The regular startup commands in package.json use `tsx server.mjs` (relying on PATH), which is more robust.
- **Evidence:**
  ```bash
  # Line 29
  exec ./node_modules/.bin/tsx server.mjs
  ```
- **Fix:** Either `cd` to the script's directory first, or use `exec npx tsx server.mjs`, or use `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" && cd "$(dirname "$SCRIPT_DIR")" && exec ./node_modules/.bin/tsx server.mjs`.

### [CC-P6-A8-004] start-with-ssh.sh lacks `set -e` for error handling
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh:1-29
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The script does not use `set -e`, meaning failures in intermediate commands (e.g., `ln -sf`, `tmux setenv`) would be silently ignored and execution would continue to `exec`, potentially starting the server in an inconsistent state.
- **Evidence:**
  ```bash
  #!/bin/bash
  # AI Maestro - Startup script with SSH configuration
  # ... (no set -e anywhere)
  ```
- **Fix:** Add `set -e` after the shebang line.

### [CC-P6-A8-005] bump-version.sh sed patterns have unescaped dots in version numbers
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:109-110
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `update_file` function uses `grep -q "$pattern"` and `sed "s|$pattern|$replacement|g"` where version number dots (e.g., `0.26.0`) are regex wildcards matching any character. While the script has a comment noting this is mitigated by surrounding context, it could still match unintended text (e.g., version `0.26.0` would match `0X26Y0` if such a string existed in the same pattern context). More importantly, the sed replacement uses `$replacement` which could contain `&` or `\` characters that are interpreted specially by sed.
- **Evidence:**
  ```bash
  # Lines 109-110
  if grep -q "$pattern" "$file" 2>/dev/null; then
      _sed_inplace "$file" "s|$pattern|$replacement|g"
  ```
- **Fix:** Escape dots in the version pattern: `local escaped_pattern=$(echo "$pattern" | sed 's/\./\\./g')`. For the replacement, escape `&` and `\`.

### [CC-P6-A8-006] server.mjs `else` block misalignment creates confusing code flow
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:898-992
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The code has an unusual `} else {` at line 898 that opens a block spanning from line 900 to 992, inside the retry loop's `if (sessionState) ... else if (!ptyProcess) ... else {` chain. The `else {` block creates a new `sessionState` object but the closing `}` at line 992 ends the `else` while the code at lines 995-1080 (adding client to session) runs regardless. This works but is confusing because the indentation and structure make it hard to see that lines 900-992 only execute for new sessions while lines 995+ always execute.
- **Evidence:**
  ```javascript
  // Line 892-898
  if (sessionState) {
    // Fall through to add client to existing session
  } else if (!ptyProcess) {
    ws.close(1011, 'PTY spawn failed unexpectedly')
    return
  } else {
  // Line 900-992 - new session setup
  // Line 992 - closing brace of else
  }
  // Line 995+ - always runs (add client to session)
  ```
- **Fix:** Refactor to make the control flow clearer, e.g., extract the session creation block into a named function, or restructure so the intent is obvious.

### [CC-P6-A8-007] remote-install.sh portable_sed uses macOS-specific `sed -i ''` syntax
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:321-326
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The `portable_sed` function in remote-install.sh uses `sed -i '' "$@"` for macOS and `sed -i "$@"` for Linux. The macOS branch is correct, but the Linux branch `sed -i "$@"` works only if `$@` starts with a sed expression, not flags. This is fine for simple `s/.../.../` calls but would break if called with flags. Additionally, `bump-version.sh` already solves this correctly with `sed -i.bak` + `rm -f`, so there's an inconsistency.
- **Evidence:**
  ```bash
  # Lines 321-326
  portable_sed() {
      if [ "$OS" = "macos" ]; then
          sed -i '' "$@"
      else
          sed -i "$@"
      fi
  }
  ```
- **Fix:** Use the same `sed -i.bak` + `rm` pattern used in `bump-version.sh` (line 94-98).

### [CC-P6-A8-008] amp-send.sh `$?` check after command substitution is unreliable
- **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-send.sh:234-236
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The pattern `att_meta=$(upload_attachment ...)` followed by `if [ $? -ne 0 ]` is unreliable because `set -e` is active. If `upload_attachment` fails (returns non-zero), the script would exit at the command substitution line before reaching the `$?` check. The `$?` check is dead code.
- **Evidence:**
  ```bash
  # Lines 234-236
  att_meta=$(upload_attachment "$attach_file" "$UPLOAD_API_URL" "$UPLOAD_API_KEY")
  if [ $? -ne 0 ]; then
      echo "Error: Failed to upload attachment: $(basename "$attach_file")"
  ```
- **Fix:** Either disable `set -e` around this section, or use `if ! att_meta=$(upload_attachment ...); then`.

### [CC-P6-A8-009] amp-inbox.sh base64 decoding may fail on Linux
- **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-inbox.sh:130
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** LIKELY
- **Description:** The script uses `base64 -d` to decode messages. On macOS, `base64 -d` is correct, but on some Linux systems the flag is `base64 -d` (GNU coreutils) which is also fine. However, if the base64 output from `jq -r '.[] | @base64'` contains line breaks, `base64 -d` will fail. Long messages may produce wrapped base64 that breaks decoding.
- **Evidence:**
  ```bash
  # Line 130
  msg=$(echo "$msg_b64" | base64 -d)
  ```
- **Fix:** Use `base64 --decode` or `base64 -d` with `-w0` on encode side (jq's `@base64` already produces single-line output, so this is low risk).


(none)


### [CC-P6-A1-005] config-service.ts uses shell-based exec for PTY debug commands
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-service.ts:515-524
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `getDebugPtyInfo` function uses `execSync` with shell commands (`sysctl`, `ls`, `lsof | awk | sort | uniq | head`). While these are all hardcoded strings with no user input, using `execSync` (shell-based) is inconsistent with the project's security patterns. The commands include shell pipe chains that legitimately need a shell, but the comment at line 514 acknowledges this: "Safe: fixed command strings with no user input; shell piping required for data processing".

- **Evidence:**
  ```typescript
  // Lines 515-524
  const limitOutput = execSync('sysctl -n kern.tty.ptmx_max 2>/dev/null || echo 511', { encoding: 'utf8' })
  const ptyCountOutput = execSync('ls /dev/ttys* 2>/dev/null | wc -l', { encoding: 'utf8' })
  const lsofOutput = execSync(
    "lsof /dev/ttys* 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -10",
    { encoding: 'utf8' }
  )
  ```
- **Fix:** The existing comment documents the justification. For additional hardening, consider wrapping in `execFileSync('/bin/sh', ['-c', ...])` to make the shell invocation explicit, or extract to a dedicated shell script.

### [CC-P6-A1-006] config-service.ts uses shell-based execAsync for Docker version check
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-service.ts:578-580
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `getDockerInfo` function uses `execAsync("docker version --format '{{.Server.Version}}'")` which invokes a shell. While the command is hardcoded, `execFileAsync` should be used for consistency. The `--format` flag's Go template syntax doesn't require shell quoting when passed as a separate argument.

- **Evidence:**
  ```typescript
  // Line 578-580
  const { stdout } = await execAsync("docker version --format '{{.Server.Version}}'", {
    timeout: 5000,
  })
  ```
- **Fix:** Use `execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 5000 })`.

### [CC-P6-A1-007] agents-chat-service.ts reads entire JSONL files synchronously into memory
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-chat-service.ts:92
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `getConversationMessages` function uses `fs.readFileSync` to read the entire JSONL conversation file into memory at once. Claude Code conversation files can grow to tens or hundreds of megabytes. This blocks the event loop during the synchronous read and could cause OOM for very large files. The function already has a `limit` parameter but reads the entire file before applying it.

- **Evidence:**
  ```typescript
  // Line 92
  const fileContent = fs.readFileSync(currentConversation.path, 'utf-8')
  const lines = fileContent.split('\n').filter(line => line.trim())
  ```
- **Fix:** Use a streaming approach with `readline` or `fs.createReadStream` to process lines incrementally, especially when `since` is set (skip early lines) or when only the last N messages are needed.

### [CC-P6-A1-008] messages-service.ts casts priority without validation
- **File:** /Users/emanuelesabetta/ai-maestro/services/messages-service.ts:~160
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The messages service casts the `priority` parameter directly to a union type without validating it against the allowed values. If an invalid priority string is passed, it will be stored as-is, potentially causing display or sorting issues downstream.

- **Evidence:**
  ```typescript
  params.priority as 'low' | 'normal' | 'high' | 'urgent' | undefined
  ```
- **Fix:** Validate against a whitelist before use:
  ```typescript
  const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
  const priority = VALID_PRIORITIES.includes(params.priority as any) ? params.priority : 'normal'
  ```

### [CC-P6-A1-009] agents-playback-service.ts has parseInt without radix for potential NaN
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-playback-service.ts:~98
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** In the playback service, `sessionId` is parsed with `parseInt(sessionId, 10)` which is correct syntactically, but if `sessionId` is not a valid numeric string, `parseInt` returns `NaN`, and `NaN === anyNumber` is always false, so the check `agent.sessions?.some(s => s.index === parseInt(sessionId, 10))` would silently fail. This is a Phase 5 placeholder service so impact is low.

- **Evidence:**
  ```typescript
  agent.sessions?.some(s => s.index === parseInt(sessionId, 10))
  ```
- **Fix:** Validate sessionId is numeric before parsing, or use `Number(sessionId)` with an explicit `isNaN` check.

### [CC-P6-A1-010] sessions-service.ts cloud agent rename has non-atomic file operation
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:730-735
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `renameSession` function for cloud agents writes the new agent file, then deletes the old one. If the process crashes between these two operations, both files will exist. Additionally, the agent config is read, modified in-memory (id, name, alias all set to newName), and written -- but `id` should be a UUID, not a human name.

- **Evidence:**
  ```typescript
  // Lines 730-735
  const agentConfig = JSON.parse(fs.readFileSync(oldAgentFilePath, 'utf8'))
  agentConfig.id = newName    // <-- setting id to the name, not a UUID
  agentConfig.name = newName
  agentConfig.alias = newName
  fs.writeFileSync(newAgentFilePath, JSON.stringify(agentConfig, null, 2), 'utf8')
  fs.unlinkSync(oldAgentFilePath)
  ```
- **Fix:** (1) Use atomic write pattern: write to temp file, then rename. (2) Do not overwrite `agentConfig.id` with the new name -- the UUID should remain stable.

### [CC-P6-A1-011] agents-docs-service.ts background indexing does not validate agentId in URL
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-docs-service.ts:267
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `triggerBackgroundDocsDeltaIndexing` function constructs a URL with `agentId` interpolated directly: `` `${selfHost.url}/api/agents/${agentId}/docs` ``. The `agentId` parameter comes from `queryDocs` which receives it from the API route. If agentId contains URL-special characters (e.g., `../`), it could potentially alter the URL path. However, the agent is looked up via `agentRegistry.getAgent(agentId)` before this function is called, which likely rejects invalid IDs.

- **Evidence:**
  ```typescript
  // Line 267
  const response = await fetch(`${selfHost.url}/api/agents/${agentId}/docs`, {
  ```
- **Fix:** Add `encodeURIComponent(agentId)` or validate agentId format before URL construction.

### [CC-P6-A1-012] amp-service.ts uses non-null assertions on auth.agentId without prior check
- **File:** /Users/emanuelesabetta/ai-maestro/services/amp-service.ts:1173, 1206, 1249, 1377, 1417, 1445, 1469
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple functions in amp-service.ts use `auth.agentId!` (non-null assertion) after checking `auth.authenticated`. While `authenticated === true` likely implies `agentId` is set, the TypeScript type system doesn't guarantee this. If `authenticateRequest` has a bug that returns `authenticated: true` without setting `agentId`, these would all throw at runtime.

- **Evidence:**
  ```typescript
  // Line 1173
  const result = getPendingMessages(auth.agentId!, effectiveLimit)
  // Line 1206
  const acknowledged = acknowledgeMessage(auth.agentId!, messageId)
  // Line 1377
  const agent = getAgent(auth.agentId!)
  ```
- **Fix:** Either (a) refine the return type of `authenticateRequest` to use a discriminated union where `authenticated: true` guarantees `agentId: string`, or (b) add explicit null checks before each use.


(none)


(none)


### [CV-P6-001] Claim: "169 new tests across 9 test files"
- **Source:** CHANGELOG.md line 19, v0.26.0 section
- **Severity:** SHOULD-FIX (NIT -- count is UNDER-reported)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** All 9 named test files exist and pass. Tests are real, meaningful governance tests.
- **What's missing:** The count of 169 is LOWER than actual. The 9 named files contain 196 tests total:
  - governance-peers.test.ts: 20
  - governance-sync.test.ts: 16
  - host-keys.test.ts: 15
  - role-attestation.test.ts: 27
  - governance-request-registry.test.ts: 34
  - cross-host-governance.test.ts: 40
  - manager-trust.test.ts: 15
  - agent-config-governance.test.ts: 16
  - governance-endpoint-auth.test.ts: 13
  - **Sum: 196** (not 169)
  - Additionally, 2 more governance-related test files exist but are NOT listed in the CHANGELOG:
    - agent-config-governance-extended.test.ts: 56 tests
    - use-governance-hook.test.ts: 12 tests
  - **Grand total governance tests: 264** across 11 files
- **Evidence:** `yarn test --run` output shows all 862/862 tests pass across 30 files
- **Impact:** Cosmetic only. Test coverage is actually BETTER than claimed. The CHANGELOG was written at commit 8754692 (which said "166 new tests") and was later corrected to 169 in the CHANGELOG but the actual tests continued growing through subsequent review passes.

### [CV-P6-002] Claim: "Layer 6: Agent configuration governance" (original numbering)
- **Source:** Commit ccc1649 "Add Layer 6: Agent configuration governance enforcement"
- **Severity:** SHOULD-FIX (naming inconsistency)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The agent config governance feature is fully implemented (RBAC enforcement, deploy service, notifications, tests). The feature itself is complete.
- **What's missing:** Commit ccc1649 calls it "Layer 6" but SR-008 finding in commit e515d1f explicitly renumbered it to "Layer 5" across 5 files. The CHANGELOG correctly says "Layer 5". However, some internal comments may still reference "Layer 6".
- **Evidence:** agents-core-service.ts:605 says "Layer 5", agents-core-service.ts:658 says "Layer 5", agents-core-service.ts:705 says "Layer 5". Commit messages reference both "Layer 6" (older) and "Layer 5" (newer).
- **Impact:** Cosmetic only. Commit history is immutable; source code correctly uses "Layer 5".

---


### [CV-P6-002] Claim: "resolve ... 58 SHOULD-FIX"
- **Source:** Commit message 9626e8d
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** 55 of the 57 unique SF findings were actually implemented as code changes in the diff. All 55 are visible in the diff and verified against source files.
- **What's missing:**
  1. SF-005 does not exist in any fix report -- there are only 57 SF IDs (SF-001 through SF-058, skipping SF-005), not 58.
  2. SF-016 (N+1 fetch pattern in teams list) is explicitly marked "DEFERRED" -- no code change was made.
  3. SF-025 (governance-sync mock in agent-config-governance tests) is explicitly marked "FALSE POSITIVE" -- no code change was made.
- **Evidence:** `docs_dev/epcp-fixes-done-P5-ui.md` says `SF-016: N+1 fetch pattern in teams list (DEFERRED)` and `docs_dev/epcp-fixes-done-P5-tests.md` says `SF-025: FALSE POSITIVE`.

### [CV-P6-003] Claim: "resolve ... 31 NIT"
- **Source:** Commit message 9626e8d
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** 26 of 31 NIT findings were implemented as code changes in the diff. All 26 are visible in the diff.
- **What's missing:**
  1. NT-004 (Inconsistent error return patterns) -- report says "No code change applied".
  2. NT-009 (GovernancePasswordDialog redundant state reset) -- report says "NO ACTION".
  3. NT-010 (localStorage reads use mount-only effects) -- report says "NO ACTION".
  4. NT-011 (RoleBadge default case uses String()) -- report says "NO ACTION".
  5. NT-017 (agent-registry.test.ts describe nesting) -- report says "SKIPPED".
- **Evidence:** All five have explicit "No change needed" / "No code change" / "SKIPPED" / "NO ACTION" in the fix reports.

### [CV-P6-004] Claim: "resolve 108 review findings" (all resolved)
- **Source:** Commit message 9626e8d
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** 106 of 113 unique finding IDs had actual code changes implemented. All 25 MUST-FIX were implemented.
- **What's missing:** 7 findings (2 SF + 5 NT) were explicitly deferred, false-positive, no-action, or skipped. While these are documented in the fix reports, the commit message claims all were "resolved" without qualification.
- **Evidence:** See CV-P6-002 and CV-P6-003 above for the specific 7 findings.

---


All 55 implemented SF findings have corresponding diff hunks. Key spot-checks:
- SF-002 (atomic write): renameSync in transfer-registry.ts confirmed
- SF-004 (amp-auth withLock): confirmed in diff
- SF-008 (streaming line reads): confirmed in diff
- SF-010 (terminalInstance state): confirmed in diff
- SF-011 (exponential backoff): WS_RECONNECT_BACKOFF array confirmed
- SF-012/013 (aria-modal, aria-label): confirmed in diff
- SF-018/019/020/021 (new test coverage): confirmed in diff
- SF-045 (SSRF URL validation): confirmed in diff
- SF-046/047 (field whitelisting): confirmed in diff

NOT implemented:
- SF-016: DEFERRED (requires new API endpoint)
- SF-025: FALSE POSITIVE (no fix needed)


---

## Nits & Suggestions


### [CC-P6-A5-009] Inconsistent response shape -- some routes wrap errors in `{ success: false, error }`, others use `{ error }`
- **File:** Multiple routes
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Error response shapes are inconsistent across routes:
  - `app/api/help/agent/route.ts` uses `{ success: false, error }`
  - `app/api/hosts/[id]/route.ts` uses `{ error }`
  - `app/api/messages/route.ts` uses `result.data ?? { error: result.error }`
  - `app/api/sessions/activity/route.ts` returns `{ error, activity: {} }`

  This makes it harder for clients to write consistent error handling. Note: There's already a TODO comment about this at `app/api/sessions/route.ts`:4-6 (SF-054).
- **Evidence:**
  ```typescript
  // help/agent/route.ts
  return NextResponse.json({ success: false, error: result.error }, { status: result.status })

  // hosts/[id]/route.ts
  return NextResponse.json({ error: result.error }, { status: result.status })
  ```
- **Fix:** Standardize on one error response shape across all routes (the existing SF-054 TODO).

### [CC-P6-A5-010] `GET /api/messages` and `POST /api/messages/forward` -- using `result.data ?? { error: result.error }` pattern can produce misleading responses
- **File:** `app/api/messages/route.ts`:21, `app/api/messages/forward/route.ts`:13
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The pattern `result.data ?? { error: result.error }` means that if `result.data` is defined but `result.error` is also set (a dual-result scenario), the error is silently swallowed. This differs from other routes that explicitly check `if (result.error)` first. The `??` operator only triggers on `null`/`undefined`, so if `result.data` is an empty object `{}` or `0` or `false`, the error is hidden.
- **Evidence:**
  ```typescript
  // forward/route.ts:13
  return NextResponse.json(result.data ?? { error: result.error || 'Internal server error' }, { status: result.status })
  ```
- **Fix:** Use the standard pattern: `if (result.error) { return error response }; return success response`.

### [CC-P6-A5-011] `PATCH /api/sessions/[id]/rename` -- double-await of params with destructuring
- **File:** `app/api/sessions/[id]/rename/route.ts`:25
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The destructuring `const [{ newName }, { id: oldName }] = [jsonBody, await params]` awaits params in an array assignment, which is unusual and harder to read. While functionally correct, this pattern is non-obvious and could confuse future maintainers. The `params` Promise is awaited in a tuple destructuring which works but is an uncommon pattern in this codebase.
- **Evidence:**
  ```typescript
  const [{ newName }, { id: oldName }] = [jsonBody, await params]
  ```
- **Fix:** Use the same straightforward two-line pattern used in other routes:
  ```typescript
  const { newName } = jsonBody
  const { id: oldName } = await params
  ```

### [CC-P6-A5-012] Deprecated routes still active with no removal timeline
- **File:** `app/api/sessions/[id]/command/route.ts`:5-11, `app/api/sessions/[id]/rename/route.ts`:7-13, `app/api/sessions/[id]/route.ts`:7-13
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Three session routes are marked `@deprecated` with `logDeprecation()` calls, but there is no version or date indicating when they will be removed. The deprecation warnings go to `console.warn` which is easily missed in production logs.
- **Evidence:**
  ```typescript
  /**
   * @deprecated Use /api/agents/[id]/session with PATCH method instead.
   */
  function logDeprecation() {
    console.warn('[DEPRECATED] /api/sessions/[id]/command - Use /api/agents/[id]/session (PATCH) instead')
  }
  ```
- **Fix:** Add a target removal version (e.g., "Scheduled for removal in v0.26.0") in the deprecation comment.


*(none)*


### [CC-P6-A4-006] Inconsistent response shape across routes
- **File:** Multiple files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Some routes include `{ success: false }` in error responses while others do not. For example, `chat/route.ts` returns `{ success: false, error: ... }`, `memory/route.ts` returns `{ success: false, error: ... }`, but `[id]/route.ts` returns `{ error: ... }` without `success`. This inconsistency can confuse API consumers. The routes at least are internally consistent (e.g., the memory routes all use `success: false` pattern), but the overall API surface is not uniform.
- **Evidence:**
```typescript
// chat/route.ts line 26:
return NextResponse.json({ success: false, error: result.error }, { status: result.status })

// [id]/route.ts line 17:
return NextResponse.json({ error: result.error }, { status: result.status })
```
- **Fix:** Standardize on one pattern for all agent API routes. Either always include `success` or never include it.

### [CC-P6-A4-007] `any` type used for body variables in several routes
- **File:** Multiple files (graph/code/route.ts:42, docs/route.ts:52, amp/addresses/route.ts:37, email/addresses/route.ts:32, messages/route.ts:38, etc.)
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple routes declare request body with `let body` (implicit `any`) or `let body: any`. While the service layer is responsible for validation, having typed request bodies at the route level (matching service expectations) would catch contract mismatches at compile time.
- **Evidence:**
```typescript
// amp/addresses/route.ts line 37:
let body
try { body = await request.json() } catch { ... }
// body is implicitly 'any'
```
- **Fix:** Use typed body declarations matching the service function parameter types, e.g., `let body: AddAMPAddressRequest`.

### [CC-P6-A4-008] Minor: graph/db GET spreads potentially undefined data into error response
- **File:** app/api/agents/[id]/graph/db/route.ts:23
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The GET handler spreads `result.data` into the error response: `{ success: false, error: result.error, ...(result.data || {}) }`. While the `|| {}` guards against undefined, mixing data and error fields in one response can be confusing. The graph/query route (line 24) has the same pattern.
- **Evidence:**
```typescript
// Line 23
return NextResponse.json({ success: false, error: result.error, ...(result.data || {}) }, { status: result.status })
```
- **Fix:** Evaluate whether clients actually need `data` alongside errors. If so, nest it under a `data` key. If not, remove the spread.


(none)


### [CC-P6-A3-009] teams/names route uses `any[]` return type for teams
- **File:** `app/api/teams/names/route.ts`:15-20
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `loadTeams()` and `loadAgents()` functions return typed arrays, but the GET handler maps them with `teams.map(t => t.name)` and `agents.map(a => a.name)` without declaring the response shape. The response type is implicitly `{ teamNames: string[], agentNames: string[] }` which is fine, but adding an explicit type annotation would improve clarity.
- **Evidence:**
  ```typescript
  return NextResponse.json({
    teamNames: teams.map(t => t.name),
    agentNames: agents.map(a => a.name).filter(Boolean),
  })
  ```
- **Fix:** Minor -- consider adding a `TeamNamesResponse` interface for documentation.

### [CC-P6-A3-010] Inconsistent 200 vs explicit status in response patterns
- **File:** `app/api/meetings/[id]/route.ts`:11, `app/api/teams/route.ts`:13
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Some routes use `result.data ?? { error: result.error }` with `result.status` as the HTTP status (meetings routes), while others check `result.error` explicitly and return with or without status (teams routes). The two patterns produce identical behavior but the inconsistency makes the codebase harder to maintain.
- **Evidence:**
  ```typescript
  // Meetings pattern (compact):
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })

  // Teams pattern (explicit):
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
  ```
- **Fix:** Standardize on one pattern across all routes for consistency.

### [CC-P6-A3-011] Missing `force-dynamic` export on stateful routes
- **File:** `app/api/teams/route.ts`, `app/api/meetings/route.ts`
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `teams/names/route.ts` includes `export const dynamic = 'force-dynamic'` with a comment explaining it reads runtime filesystem state. However, `teams/route.ts` and `meetings/route.ts` also read runtime filesystem state (teams registry, meetings registry) but lack this export. In development mode this doesn't matter (Next.js treats all routes as dynamic), but in production builds Next.js might attempt to statically render these routes if it infers they have no dynamic inputs.
- **Evidence:**
  ```typescript
  // teams/names/route.ts has:
  export const dynamic = 'force-dynamic'

  // teams/route.ts does NOT have it, despite calling loadTeams() which reads filesystem
  ```
- **Fix:** Add `export const dynamic = 'force-dynamic'` to `teams/route.ts`, `meetings/route.ts`, and `meetings/[id]/route.ts` for consistency.


### [CC-P6-A6-012] Header component has unused imports (Grid3X3, Users already used but no functional concern)
- **File:** /Users/emanuelesabetta/ai-maestro/components/Header.tsx:3
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** All imported icons in Header.tsx are actually used in the JSX. No dead imports found. Marking as clean.

**[Reclassified to CLEAN]**

### [CC-P6-A6-013] WebSocket message handling split between useWebSocket and TerminalView is undocumented
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useWebSocket.ts:109-133, /Users/emanuelesabetta/ai-maestro/components/TerminalView.tsx:209-261
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The WebSocket message handling is split between two layers: useWebSocket handles `error` and `status` types, while TerminalView handles `history-complete` and `connected` types. This works correctly but the split responsibility is not documented, making it easy for a future developer to add a new message type in the wrong layer.
- **Fix:** Add a comment in useWebSocket.ts documenting which message types it consumes vs. forwards, and similarly in TerminalView.tsx.

### [CC-P6-A6-014] GovernancePasswordDialog setup mode parses response as text, not JSON
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:82-83
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** In setup mode (line 82), the error response body is parsed with `res.text()` instead of `res.json()`. If the server returns a JSON error body like `{ "error": "..." }`, the user will see the raw JSON string in the error message. The confirm mode at line 101 uses `onPasswordConfirmed` which handles its own errors. The setup mode should parse JSON for consistent error display.
- **Evidence:**
  ```typescript
  // GovernancePasswordDialog.tsx:82-83
  const body = await res.text()
  throw new Error(body || `Failed to set password (${res.status})`)
  ```
- **Fix:** Use `res.json().catch(() => null)` and extract `.error` from the parsed body, falling back to `res.text()`.

### [CC-P6-A6-015] AgentProfileTab and AgentProfile have significant code duplication
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx, /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `AgentProfileTab.tsx` and `AgentProfile.tsx` contain near-identical logic for: avatar fetching, repository handling, save handling, tag management, governance integration, and section toggling. They differ mainly in layout (tab vs. slide-over panel). This duplication means bug fixes must be applied to both files (e.g., CC-P6-A6-002 shows `updateField` was fixed in one but not the other).
- **Fix:** Extract shared logic into a custom hook (e.g., `useAgentProfileState`) or shared subcomponents.

### [CC-P6-A6-016] TerminalView empty touchEnd handler body
- **File:** /Users/emanuelesabetta/ai-maestro/components/TerminalView.tsx:476-479
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `handleTouchEnd` function has an empty `if` block that presumably once contained cleanup code.
- **Evidence:**
  ```typescript
  const handleTouchEnd = () => {
    if (isTouchingTerminal) {
    }
    isTouchingTerminal = false
  }
  ```
- **Fix:** Remove the empty `if` block, keeping just `isTouchingTerminal = false`.

### [CC-P6-A6-017] MessageCenter formatAgentName function referenced but not shown in read range
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:320-321
- **Severity:** NIT
- **Category:** logic
- **Confidence:** POSSIBLE
- **Description:** The `formatAgentName` function is called at lines 320, 321, 366, 367 but its definition was not in the read range. It likely exists later in the file. Not a bug per se, but the function name suggests it formats agent display names and should handle null/undefined inputs defensively.
- **Fix:** Verify `formatAgentName` handles null `alias` and `host` parameters.


### [CC-P6-A2-013] Inconsistent error message format in manager route
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts`:52
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The error message uses single quotes around `agentId`: `` `Agent '${agentId}' not found` ``. Other endpoints in this domain use plain strings without quoting the ID value. This is a minor inconsistency but doesn't affect functionality.
- **Evidence:**
  ```typescript
  // manager/route.ts:52
  return NextResponse.json({ error: `Agent '${agentId}' not found` }, { status: 404 })
  ```
- **Fix:** Consider standardizing error message format across routes (either all quote or none do).

### [CC-P6-A2-014] Transfers GET lacks outer try/catch in requests/route.ts POST
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts`:20-24
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The POST handler's JSON parsing is wrapped in try/catch, but the outer function body (lines 20-24, before the `if (body?.fromHostId)` branch) has no top-level try/catch. If `request.json()` itself throws a non-JSON parse error (unlikely but possible), it would propagate. The local submission path (line 97) does have its own try/catch. The remote path (line 28) also has its own try/catch. Only the gap between lines 24-27 (after parsing, before the `if` check) is uncovered, but only `body?.fromHostId` truthiness is checked there, which can't throw. This is actually fine on deeper inspection -- not a real issue.
- **Evidence:** N/A (false alarm on deeper analysis)
- **Fix:** No action needed.

### [CC-P6-A2-015] `VALID_REQUESTED_BY_ROLES` used before definition (hoisted by `const`)
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts`:81,121
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED (not a bug)
- **Description:** `VALID_REQUESTED_BY_ROLES` is referenced on line 81 inside the `POST` function but defined on line 121. This works because the function body executes at runtime (not at module-parse time), and by then the `const` is initialized. However, placing constants before their first use improves readability.
- **Evidence:**
  ```typescript
  // Line 81 (usage)
  if (!body.requestedByRole || !VALID_REQUESTED_BY_ROLES.has(body.requestedByRole)) {
  // Line 121 (definition)
  const VALID_REQUESTED_BY_ROLES = new Set(['manager', 'chief-of-staff', 'member'])
  ```
- **Fix:** Move the three `const` declarations (lines 110-124) above the `POST` function for clarity.


No NIT issues found.


### [CC-P6-A7-011] Inconsistent UUID mocking strategy across test files
- **File:** Multiple test files
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Different test files use different UUID generation strategies: `agent-registry.test.ts` and `governance.test.ts` mock `uuid.v4`; `transfer-registry.test.ts` and `governance-request-registry.test.ts` mock `crypto.randomUUID`; `host-keys.test.ts` uses real crypto. This mirrors the actual source code (some modules use `uuid.v4`, others use `crypto.randomUUID`), so the mocks are correct. However, the inconsistency makes it harder to reason about which UUID approach each module uses and creates a risk of mock mismatch if a source module changes its UUID generation strategy.
- **Evidence:**
  ```typescript
  // agent-registry.test.ts: vi.mock('uuid', () => ({ v4: () => ... }))
  // transfer-registry.test.ts: vi.mock('crypto', () => ({ randomUUID: vi.fn(() => ...) }))
  // governance-request-registry.test.ts: vi.mock('crypto', () => ({ randomUUID: ... }))
  ```
- **Fix:** Consider standardizing on one UUID generation approach across the codebase (e.g., `crypto.randomUUID` which is Node.js built-in and does not require the `uuid` package).

### [CC-P6-A7-012] validate-team-mutation.test.ts tests pure functions with thorough coverage -- no issues
- **File:** /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** This is a well-structured test file testing `sanitizeTeamName` and `validateTeamMutation` pure functions. Coverage includes COS rules, multi-closed-team constraints, null/undefined edge cases, and XSS prevention via name sanitization. No issues found. Minor observation: the test uses `vi.mocked(loadTeams).mockReturnValue(...)` for team state, which is the correct pattern for testing pure functions that depend on external state.
- **Evidence:** All test assertions verified against source logic. No mock mismatches.
- **Fix:** None needed.

### [CC-P6-A7-013] amp-address.test.ts is clean -- tests pure function with no mocks
- **File:** /Users/emanuelesabetta/ai-maestro/tests/amp-address.test.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Tests 9 cases for `parseAMPAddress` -- a pure function with no dependencies. All test cases verified correct. No mock mismatches possible since no mocks are used.
- **Evidence:** All assertions verified against pure parsing logic.
- **Fix:** None needed.

### [CC-P6-A7-014] test-utils/fixtures.ts counter is reset by only some test files
- **File:** /Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `fixtures.ts` exports `resetFixtureCounter()` for test isolation. Service test files (`sessions-service.test.ts`, `teams-service.test.ts`, `agents-core-service.test.ts`) call it in `beforeEach`, but the lib-level test files that also use fixtures (if any do) may not. Since the counter is shared module-level state, tests run in parallel could generate overlapping IDs if they share the module instance. In practice, vitest runs test files in separate worker threads, so cross-file contamination is unlikely. Within a single file, the `beforeEach` reset is sufficient.
- **Evidence:**
  ```typescript
  // sessions-service.test.ts line 121: resetFixtureCounter()
  // teams-service.test.ts line 112: resetFixtureCounter()
  ```
- **Fix:** No fix needed for correctness (vitest isolates workers). For clarity, document that `resetFixtureCounter()` is only needed when tests depend on deterministic fixture IDs.

### [CC-P6-A7-015] role-attestation.test.ts uses sophisticated signatureBindings Map pattern -- well implemented
- **File:** /Users/emanuelesabetta/ai-maestro/tests/role-attestation.test.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test uses a `signatureBindings` Map to track which data was signed and bind it to the returned signature (CC-P1-1003 fix). This allows `verifyHostAttestation` to check that the signature actually corresponds to the data, preventing "any signature verifies any data" false positives. The implementation is correct and well-documented. Verified that the mock accurately reflects the real `host-keys.ts` API: `signHostAttestation(data: string) => string` and `verifyHostAttestation(data: string, sig: string, pubKeyHex: string) => boolean`.
- **Evidence:** Mock correctly validates data-signature binding via Map lookup.
- **Fix:** None needed.


### [CC-P6-A0-014] team-acl.ts: Phase 1 security gap documented but still present
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-acl.ts:1-75
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The team ACL allows any request without an `agentId` header (treated as "system owner / web UI") to bypass all restrictions. This is documented as a Phase 1 limitation, but in practice any local process can omit the header to get full access. Not a bug per se (Phase 1 is localhost-only), but worth tracking for Phase 2.
- **Evidence:** Web UI access without agentId is always allowed -- effectively an authentication bypass for local processes.
- **Fix:** Track this for Phase 2 when remote access is added. Consider requiring authentication for all API calls.

### [CC-P6-A0-015] Inconsistent error handling patterns across registries
- **File:** Multiple files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Some registries (task-registry, document-registry) return boolean for save success/failure (swallowing errors), while others (governance.ts, governance-request-registry.ts) let errors propagate. The comment `NT-008: Returns boolean for legacy compat` acknowledges this but it creates inconsistency. For example, `saveTasks` returns `false` on error, but the callers in `createTask/updateTask/deleteTask` don't check the return value.
- **Evidence:**
  ```typescript
  // task-registry.ts:127 - saveTasks return value ignored
  tasks.push(task)
  saveTasks(data.teamId, tasks)
  return task
  ```
- **Fix:** Phase 2: Standardize on throw-on-failure for all save operations, as noted in the NT-008 comment.

### [CC-P6-A0-016] validation.ts: Extremely small file, could be inlined
- **File:** /Users/emanuelesabetta/ai-maestro/lib/validation.ts:1-14
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The entire file is 14 lines containing only a UUID regex and `isValidUuid` function. Multiple other files independently define the same UUID regex (e.g., task-registry.ts:27, document-registry.ts:25). These could all import from validation.ts for consistency.
- **Evidence:**
  ```typescript
  // validation.ts - entire file
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  export function isValidUuid(value: string): boolean {
    return UUID_RE.test(value)
  }
  ```
- **Fix:** Have task-registry.ts and document-registry.ts import `isValidUuid` from validation.ts instead of duplicating the regex.

### [CC-P6-A0-017] index-delta.ts: activeIndexCount could go negative on double-release
- **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:57-66
- **Severity:** NIT
- **Category:** logic
- **Confidence:** POSSIBLE
- **Description:** If `releaseIndexSlot` is called twice for the same slot (e.g., due to a bug in the caller), `activeIndexCount` would decrement below zero, allowing more concurrent operations than intended. The `runIndexDelta` function uses try/finally which should prevent double-release, but there's no guard.
- **Evidence:**
  ```typescript
  // index-delta.ts:57-58
  function releaseIndexSlot(agentId: string) {
    activeIndexCount--  // No guard against going below 0
  ```
- **Fix:** Add `activeIndexCount = Math.max(0, activeIndexCount - 1)` as a defensive guard.

### [CC-P6-A0-018] governance-sync.ts: requestPeerSync does not validate response structure
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-sync.ts:269
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `requestPeerSync` casts the JSON response directly to `GovernancePeerState` without validating required fields. A malicious or buggy peer could return arbitrary JSON that would be cast without validation.
- **Evidence:**
  ```typescript
  // governance-sync.ts:269
  const data = await response.json() as GovernancePeerState
  return data
  ```
  Compare with `handleGovernanceSyncMessage` which validates payload fields before use (lines 186-202).
- **Fix:** Add field validation before returning, matching the pattern used in `handleGovernanceSyncMessage`.

---


### [CC-P6-A8-010] install-messaging.sh uses Unicode box-drawing characters that may render incorrectly
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The box-drawing header uses full-width Unicode characters. The box widths don't match between the top (`╔═...╗`), middle (`║ ... ║`), and bottom (`╚═...╝`) lines -- the content lines appear wider than the borders, which creates misalignment in terminals with monospaced fonts.
- **Evidence:**
  ```bash
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                                                                ║"
  ```
  Count: top/bottom border has 64 `═` chars between corners, but the content line has 64 spaces between `║` chars. The visual widths may differ because `═` is full-width in some fonts.
- **Fix:** Verify alignment in common terminals, or simplify to ASCII borders.

### [CC-P6-A8-011] update-aimaestro.sh version extraction uses fragile sed pattern
- **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:114
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The version extraction uses `grep + sed` which is fragile. The `jq` tool is already verified as a prerequisite elsewhere, and would be more reliable.
- **Evidence:**
  ```bash
  # Line 114
  CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
  ```
- **Fix:** Use `jq -r '.version' package.json` instead.

### [CC-P6-A8-012] server.mjs fetches own API endpoints during startup
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:1092-1176
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The server makes HTTP requests to itself during startup (`fetch("http://localhost:${port}/api/...")`). While this is done inside `setTimeout` callbacks (2s, 5s delays), it creates a temporal coupling -- the server must be fully listening before these fire. If startup is slow (e.g., heavy CPU load), the fetches could race with route registration.
- **Evidence:**
  ```javascript
  // Lines 1102-1117 (inside server.listen callback)
  setTimeout(async () => {
    const response = await fetch(`http://localhost:${port}/api/agents/normalize-hosts`, ...)
  }, 2000)
  ```
- **Fix:** This is acceptable for the current architecture but consider importing and calling the functions directly rather than HTTP self-requests for reliability.

### [CC-P6-A8-013] Missing `set -u` in shell scripts
- **File:** Multiple scripts
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** None of the shell scripts use `set -u` (treat unset variables as errors). All scripts use `set -e` consistently, but `set -u` would catch typos in variable names early. This is a minor quality improvement.
- **Evidence:** All scripts in domain: `install-messaging.sh`, `update-aimaestro.sh`, `bump-version.sh`, `remote-install.sh`, `start-with-ssh.sh`, `amp-inbox.sh`, `amp-send.sh`, `amp-register.sh`.
- **Fix:** Add `set -u` after `set -e` in scripts where appropriate (may require initializing some variables that are currently left unset).


(none)


### [CC-P6-A1-013] agents-graph-service.ts has excessive use of `any` type
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-graph-service.ts:multiple
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The graph service uses `let result: any = {}` at the top of query functions and `(r: any[])` for CozoDB row mappings. This is a pragmatic choice since CozoDB returns untyped rows, but it eliminates all type-safety guarantees within the function body.

- **Evidence:**
  ```typescript
  let result: any = {}
  // and
  const componentsResult = await agentDb.run(...)
  result = componentsResult.rows.map((r: any[]) => ({ name: r[0], file: r[1] }))
  ```
- **Fix:** Consider defining typed interfaces for each query result shape, or at minimum use `Record<string, unknown>` instead of `any` for the outer result.

### [CC-P6-A1-014] shared-state-bridge.mjs uses magic number 1 for WebSocket.OPEN
- **File:** /Users/emanuelesabetta/ai-maestro/services/shared-state-bridge.mjs:44
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The ESM bridge uses `ws.readyState === 1` with a comment `// WebSocket.OPEN`, while the TypeScript counterpart (`shared-state.ts:101`) correctly uses the named constant `WS_OPEN = 1`. The ESM file should define the same constant for consistency.

- **Evidence:**
  ```javascript
  // shared-state-bridge.mjs:44
  if (ws.readyState === 1) { // WebSocket.OPEN
  ```
- **Fix:** Add `const WS_OPEN = 1` at the top of the file and use it.

### [CC-P6-A1-015] agents-core-service.ts sessionName-derived agentId not UUID-validated
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:~812
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When creating an agent from a session (without an explicit body.id), the agentId is derived from the session name via sanitization (`sessionName.replace(/[^a-zA-Z0-9_-]/g, '-')`). This produces a non-UUID identifier. The code does use `path.basename(agentId)` at line 823 for path traversal prevention, but the agent registry may expect UUIDs in some code paths.

- **Evidence:**
  ```typescript
  // ~Line 766
  agentId = sessionName.replace(/[^a-zA-Z0-9_-]/g, '-')
  // vs Line 812 (when body.id is provided)
  if (!isValidUuid(body.id)) { return { error: 'Invalid agent ID format', status: 400 } }
  ```
- **Fix:** Consider generating a proper UUID for session-derived agents instead of using the sanitized session name as the ID.

### [CC-P6-A1-016] webhooks-service.ts createNewWebhook does not validate URL scheme
- **File:** /Users/emanuelesabetta/ai-maestro/services/webhooks-service.ts:89-93
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The webhook creation validates URL format with `new URL(body.url)` but does not restrict the scheme. A webhook URL with `file://`, `javascript:`, or `data:` scheme would pass validation. While `fetch` would reject non-HTTP schemes, it's better to validate explicitly.

- **Evidence:**
  ```typescript
  // Lines 89-93
  try {
    new URL(body.url)
  } catch {
    return { error: 'Invalid URL format', status: 400 }
  }
  ```
- **Fix:** Add scheme validation: `if (!body.url.startsWith('http://') && !body.url.startsWith('https://')) { return { error: 'Only HTTP/HTTPS URLs allowed', status: 400 } }`

### [CC-P6-A1-017] Inconsistent error handling in sessions-service.ts renameSession for cloud agents
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:720-738
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The cloud agent rename path at lines 720-738 checks for existing agent files to detect cloud agents, but does not validate the `oldName` or `newName` against path traversal. While the session name regex check at line 716 (`/^[a-zA-Z0-9_-]+$/.test(newName)`) prevents dangerous characters in `newName`, `oldName` is not similarly validated in this code path (it comes from the URL path parameter).

- **Evidence:**
  ```typescript
  // Lines 721-723 - oldName used directly in path construction
  const oldAgentFilePath = path.join(agentsDir, `${oldName}.json`)
  const newAgentFilePath = path.join(agentsDir, `${newName}.json`)
  const isCloudAgent = fs.existsSync(oldAgentFilePath)
  ```
- **Fix:** Validate `oldName` with the same regex check used for `newName`: `if (!/^[a-zA-Z0-9_-]+$/.test(oldName)) return { error: 'Invalid session name', status: 400 }`.


(none)


(none)


### [CV-P6-005] Version string consistency
- **Severity:** NIT (all correct)
- **Files checked:** version.json, package.json, README.md, docs/ai-index.html (x3 locations), docs/index.html (x2 locations), scripts/remote-install.sh, docs/OPERATIONS-GUIDE.md, docs/BACKLOG.md (x2 locations), CHANGELOG.md
- **Expected:** 0.26.0
- **Found:** 0.26.0 in ALL 12 locations across 8 files -- FULLY CONSISTENT

---


### [CV-P6-005] Commit total does not match breakdown sum
- **Severity:** SHOULD-FIX
- **Files affected:** Commit message
- **Expected:** Total equals MF+SF+NIT sum
- **Found:** Commit says "108" but 25+58+31=114. Off by 6. Also the actual unique IDs total 113 (not 114 or 108).

### [CV-P6-006] SF-005 gap: 57 unique SF IDs claimed as 58
- **Severity:** SHOULD-FIX
- **Files affected:** All 6 fix reports
- **Expected:** 58 unique SF finding IDs
- **Found:** Only SF-001 through SF-058 exist, but SF-005 is missing from all reports. 57 unique SF IDs total.

---


All 26 implemented NT findings have corresponding diff hunks. Key spot-checks:
- NT-005 (numeric suffix fallback): confirmed in agent-registry.ts diff
- NT-013 (removed unused import): confirmed in governance-endpoint-auth.test.ts diff
- NT-015 (removed unused mock): confirmed in cross-host-governance.test.ts diff
- NT-018 (removed unused helper): confirmed in fixtures.ts diff
- NT-020 (WS_OPEN constant): confirmed in shared-state.ts diff
- NT-025 (try/catch in amp addresses): confirmed in diff
- NT-026 (UUID validation): confirmed in diff
- NT-027 (force-dynamic): confirmed in diff

NOT implemented (acknowledged in reports):
- NT-004: No code change (cross-cutting concern)
- NT-009: No action needed (defensive pattern correct)
- NT-010: No action needed (tab architecture)
- NT-011: No action needed (defensive pattern correct)
- NT-017: Skipped (readability only)

---


---

## Source Reports

- `epcp-correctness-P6-08a8c052-be4c-4b7e-924c-c7e1f3b5462f.md`
- `epcp-correctness-P6-16497aea-d766-4db1-b4ad-bafe99a33cb3.md`
- `epcp-correctness-P6-36139857-d180-44cb-811e-9bad325f2d2b.md`
- `epcp-correctness-P6-6b9b3ffe-4725-44bf-8900-33348941d940.md`
- `epcp-correctness-P6-6cfbeabb-6ca8-453d-9796-fbe3d61e1302.md`
- `epcp-correctness-P6-7aaa3a7f-73dd-4399-bd89-3a77ea18136c.md`
- `epcp-correctness-P6-7b0c5e17-14f4-4210-ae10-2e3048bbab98.md`
- `epcp-correctness-P6-8b2eacb3-357a-4eb4-be93-cce666c8ce2f.md`
- `epcp-correctness-P6-926c2319-2d75-4b59-a8a5-de1a7c317f92.md`
- `epcp-correctness-P6-9bcd6f06.md`
- `epcp-correctness-P6-9ffc6f5d-e3f3-4bd5-a37d-356a1d48f26c.md`
- `epcp-correctness-P6-a8a95ed7-b2f0-46d4-a71f-ea8f11650dd0.md`
- `epcp-correctness-P6-c31413c4-edfa-4f53-8584-9ce8cecf55bf.md`
- `epcp-correctness-P6-d3eff400-f006-4c0e-8efc-906119b2106d.md`
- `epcp-correctness-P6-d71bdbfd-b100-4da3-b886-1407a64eb337.md`
- `epcp-claims-P6-613f04ad-4749-4489-839c-b1809696570a.md`
- `epcp-claims-P6-dc7e0379-240d-481d-87d4-57d30966fa5b.md`
- `epcp-review-P6-8e555398-b775-4d2d-ac32-49ed2549c769.md`
- `epcp-review-P6-8ece3fe6-b8f4-43cb-8a52-a7716e377386.md`

