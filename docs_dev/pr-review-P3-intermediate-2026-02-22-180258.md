# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-22-180258
**Pass:** 3
**Reports merged:** 6
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 2 |
| **SHOULD-FIX** | 11 |
| **NIT** | 10 |
| **Total** | 28 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


_No must-fix issues found._


### [CC-P3-A3-001] resolveConfigRequest sends wrong request body to approve/reject endpoints
- **File:** hooks/useGovernance.ts:315-318
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED (traced through route handlers to service functions)
- **Description:** The `resolveConfigRequest` function sends `{ reason }` in the POST body to `/api/v1/governance/requests/${requestId}/approve` and `/api/v1/governance/requests/${requestId}/reject`. However, both endpoints require completely different fields:
  - Approve endpoint (`app/api/v1/governance/requests/[id]/approve/route.ts:22-24`) requires `{ approverAgentId, password }` -- returns 400 "Missing required fields: approverAgentId, password" if absent.
  - Reject endpoint (`app/api/v1/governance/requests/[id]/reject/route.ts:58-60`) requires `{ rejectorAgentId, password }` -- returns 400 "Missing required fields: rejectorAgentId, password" if absent.

  The `resolveConfigRequest` function never sends `approverAgentId`, `rejectorAgentId`, or `password`. This means **every call to resolve a config request will always fail with HTTP 400**.
- **Evidence:**
  ```typescript
  // hooks/useGovernance.ts:311-318
  const resolveConfigRequest = useCallback(
    async (requestId: string, approved: boolean, reason?: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const endpoint = approved ? 'approve' : 'reject'
        const res = await fetch(`/api/v1/governance/requests/${requestId}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })  // <-- Missing approverAgentId/rejectorAgentId + password
        })
  ```
  ```typescript
  // app/api/v1/governance/requests/[id]/approve/route.ts:22-24
  if (!body?.approverAgentId || !body?.password) {
    return NextResponse.json({ error: 'Missing required fields: approverAgentId, password' }, { status: 400 })
  }
  ```
- **Fix:** The `resolveConfigRequest` function signature needs to accept `approverAgentId` (or use the hook's `agentId` from parent scope) and `password`, and include them in the request body. The body for approve should be `{ approverAgentId, password, reason }` and for reject should be `{ rejectorAgentId, password, reason }`.

### [CC-P3-A3-002] submitConfigRequest sends incomplete request body -- missing required fields
- **File:** hooks/useGovernance.ts:286-296
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED (traced through route handler to submitCrossHostRequest service function)
- **Description:** The `submitConfigRequest` function sends only `{ type, payload }` to `POST /api/v1/governance/requests`. The route handler at `app/api/v1/governance/requests/route.ts:67` passes this body directly to `submitCrossHostRequest()` (from `cross-host-governance-service.ts:59-67`), which requires the following fields: `type`, `targetHostId`, `requestedBy`, `requestedByRole`, `payload`, `password`, and optionally `note`.

  The function is missing: `targetHostId`, `requestedBy`, `requestedByRole`, and `password`. Without `password`, the service returns 401 "Invalid governance password". Without the other fields, the function may crash or produce undefined behavior.
- **Evidence:**
  ```typescript
  // hooks/useGovernance.ts:286-296
  const submitConfigRequest = useCallback(
    async (targetAgentId: string, config: Record<string, unknown>): Promise<{ ... }> => {
      try {
        const res = await fetch('/api/v1/governance/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'configure-agent',
            payload: { agentId: targetAgentId, configuration: config },
            // Missing: targetHostId, requestedBy, requestedByRole, password
          })
        })
  ```
  ```typescript
  // services/cross-host-governance-service.ts:59-67
  export async function submitCrossHostRequest(params: {
    type: GovernanceRequestType
    targetHostId: string        // <-- required
    requestedBy: string         // <-- required
    requestedByRole: AgentRole  // <-- required
    payload: GovernanceRequestPayload
    password: string            // <-- required
    note?: string
  }): Promise<ServiceResult<GovernanceRequest>> {
  ```
- **Fix:** The `submitConfigRequest` function signature needs to accept `password`, `targetHostId`, `requestedBy`, and `requestedByRole` (or derive them from the hook's state, e.g., using `agentId` for `requestedBy`, `agentRole` for `requestedByRole`, and a sensible default or param for `targetHostId`). All must be included in the request body.


(none)


No MUST-FIX issues found.


---

## SHOULD-FIX Issues


### [CC-P3-A1-001] readRawBody missing rejected guard (double resolve/reject possible)
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:348-364
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `readRawBody` lacks the `rejected` guard that was added to `readJsonBody` (NT-007 fix). After `req.destroy()` rejects the promise on size limit violation, the `'end'` event can still fire and call `resolve(Buffer.concat(chunks))` on an already-settled promise. Similarly, the `'error'` event could fire after rejection, calling `reject()` twice. While Node.js ignores subsequent resolve/reject calls on a settled promise, this means a) data chunks continue to be accumulated in memory after the limit is hit, and b) the behavior is inconsistent with the fixed `readJsonBody`.
- **Evidence:**
```typescript
// headless-router.ts:348-364
async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalSize = 0
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length
      if (totalSize > MAX_RAW_BODY_SIZE) {
        req.destroy()
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }))
        return  // returns from data handler, but 'end'/'error' handlers still active
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))  // no guard
    req.on('error', reject)  // no guard
  })
}
```
- **Fix:** Add a `let rejected = false` guard matching the `readJsonBody` pattern (lines 314-341). Guard `data` to stop accumulating chunks after rejection, guard `end` to prevent resolve after reject, and guard `error` to prevent double reject.

### [CC-P3-A1-002] Global rate-limit keys in cross-host governance allow cross-user denial of service
- **File:** /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts:69,247,318
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `submitCrossHostRequest`, `approveCrossHostRequest`, and `rejectCrossHostRequest` functions all use single global rate-limit keys (`'cross-host-gov-submit'`, `'cross-host-gov-approve'`, `'cross-host-gov-reject'`). Any user who makes repeated failed password attempts against one of these endpoints will lock out ALL users from that endpoint until the rate limit expires. The headless-router's COS endpoint already demonstrates the correct pattern (line 1610): per-entity rate-limit keys like `governance-cos-auth:${teamId}`.
- **Evidence:**
```typescript
// cross-host-governance-service.ts:69
const rateCheck = checkRateLimit('cross-host-gov-submit')
// line 247
const rateCheck = checkRateLimit('cross-host-gov-approve')
// line 318
const rateCheck = checkRateLimit('cross-host-gov-reject')
```
- **Fix:** Use per-agent or per-request rate-limit keys, e.g. `cross-host-gov-submit:${params.requestedBy}` for submit, `cross-host-gov-approve:${approverAgentId}` for approve, and `cross-host-gov-reject:${rejectorAgentId}` for reject. This prevents one agent's failed attempts from blocking all others.


### [CC-P3-A3-003] AgentSkillEditor calls resolveConfigRequest without required auth fields
- **File:** components/marketplace/AgentSkillEditor.tsx:82
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED (direct consequence of CC-P3-A3-001)
- **Description:** `AgentSkillEditor.tsx` calls `resolveConfigRequest(requestId, approved)` at line 82. Since `resolveConfigRequest` sends the wrong body (see CC-P3-A3-001), every approve/reject action in the skill editor UI will silently fail. The error is caught and logged to console (line 83-84), but no user-facing feedback is shown.
- **Evidence:**
  ```typescript
  // components/marketplace/AgentSkillEditor.tsx:79-86
  const handleResolve = async (requestId: string, approved: boolean) => {
    setResolvingIds(prev => new Set(prev).add(requestId))
    try {
      await resolveConfigRequest(requestId, approved) // Always fails with 400
    } catch (err) {
      console.error('Failed to resolve config request:', err)
    } finally {
  ```
- **Fix:** After fixing CC-P3-A3-001, update all callers to provide the required auth fields. The `handleResolve` function in AgentSkillEditor should prompt for or supply the governance password and the approver/rejector agent ID.

### [CC-P3-A3-004] No test coverage for useGovernance hook's API contract correctness
- **File:** hooks/useGovernance.ts (entire file)
- **Severity:** SHOULD-FIX
- **Category:** test-coverage
- **Confidence:** CONFIRMED (searched all test files in the domain)
- **Description:** None of the 4 test files in this domain test the `useGovernance` hook directly. The hook contains complex API contract logic (constructing request bodies for 10+ different endpoints), but no unit tests verify that the request bodies match what the server endpoints expect. The API contract mismatches in CC-P3-A3-001 and CC-P3-A3-002 would have been caught by tests that mock `fetch` and verify the request body structure.
- **Fix:** Add a test file (`tests/use-governance-hook.test.ts`) that imports `useGovernance`, mocks `fetch`, and verifies each function sends the correct request body structure to the correct endpoint.


### [CC-P3-A0-001] approveGovernanceRequest returns non-null for terminal states, enabling potential double-execution
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:170
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `approveGovernanceRequest` returns the unchanged request (non-null) when the request is in a terminal state (`'rejected'` or `'executed'`). The callers in `cross-host-governance-service.ts` (line 289-296) use `if (!updated)` to detect failure (null = not found), then check `if (updated.status === 'executed')` to trigger `performRequestExecution`. If an already-executed request is approved again, `approveGovernanceRequest` returns it with `status === 'executed'` unchanged, and the caller re-executes the mutation. This is a silent double-execution risk.
- **Evidence:**
  ```typescript
  // governance-request-registry.ts:170
  if (request.status === 'rejected' || request.status === 'executed') return request

  // cross-host-governance-service.ts:289-296
  const updated = await approveGovernanceRequest(requestId, approverAgentId, approverType)
  if (!updated) {
    return { error: `Failed to approve request '${requestId}'`, status: 500 }
  }
  if (updated.status === 'executed') {
    await performRequestExecution(updated)  // Double-execution if already was 'executed'
  }
  ```
- **Fix:** Either (a) return `null` for terminal states (breaking change -- update callers), or (b) add a boolean flag to the return indicating whether the approval was actually applied (e.g., `{ request, applied: boolean }`), or (c) have callers compare status before/after to detect no-op. The simplest immediate fix: callers should check if the status *transitioned* to 'executed' rather than just checking if it *is* 'executed'. Alternatively, add a pre-check in the API route: `if (request.status === 'executed' || request.status === 'rejected') return { error: 'Request already finalized', status: 409 }`.
- **Note:** The `rejectGovernanceRequest` has the same pattern (returns non-null for already-executed requests) but the caller does not branch on status after rejection, so the impact there is lower (just returns a 200 with the unchanged request, which is arguably misleading but not harmful).

### [CC-P3-A0-002] listGovernanceRequests filter.type is typed as `string` instead of `GovernanceRequestType`
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:94
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `type` field in the filter parameter of `listGovernanceRequests` is typed as `string`, but the actual `GovernanceRequest.type` field is `GovernanceRequestType` (a union of string literals). This loses type safety -- callers can pass any arbitrary string without a compile-time error. The same issue exists in the `cross-host-governance-service.ts` caller which also declares `type?: string`.
- **Evidence:**
  ```typescript
  // governance-request-registry.ts:93-94
  export function listGovernanceRequests(filter?: {
    status?: GovernanceRequestStatus
    type?: string              // Should be GovernanceRequestType
    hostId?: string
    agentId?: string
  }): GovernanceRequest[] {
  ```
- **Fix:** Change `type?: string` to `type?: GovernanceRequestType` in both `listGovernanceRequests` and its caller in `cross-host-governance-service.ts`. The import for `GovernanceRequestType` is already present at line 16.


### [CC-P3-A2-001] Local POST submission to governance requests endpoint has no authentication
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts`:66-71
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The POST handler for `/api/v1/governance/requests` has two branches: (1) remote receive (fromHostId present) which has Ed25519 signature verification, and (2) local submission (no fromHostId). The local submission path at lines 66-71 passes the raw body directly to `submitCrossHostRequest(body)` with **zero authentication**. While `submitCrossHostRequest` internally validates the governance password (it requires a `password` field), the route itself does not enforce any auth at the API layer. This means any local process can attempt to submit governance requests and probe the API without even an `Authorization` header check. The password check inside the service is a defense-in-depth layer, but the route should enforce at minimum that the request contains expected fields before passing to the service.
- **Evidence:**
  ```typescript
  // Lines 66-71 - no auth check at all
  try {
    const result = await submitCrossHostRequest(body)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  }
  ```
  Compare with the remote receive branch (lines 27-53) which has full Ed25519 signature verification.
- **Fix:** Add at minimum a basic field validation (e.g., require `body.type`, `body.targetHostId`, `body.password` exist as strings) before calling `submitCrossHostRequest`, so that completely malformed requests are rejected at the route layer. The service already does password validation, but the route should not blindly pass arbitrary JSON to the service. This is a defense-in-depth improvement; the password check in the service prevents actual misuse, but the route layer should still validate.

### [CC-P3-A2-002] GET handler for governance requests does not validate hostId or agentId format
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts`:112-113
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The GET handler validates `status` and `type` query parameters against allowlists (lines 92-106, well done), but passes `hostId` and `agentId` directly without any format validation. While these values are only used for string comparison in `listGovernanceRequests` (so injection is not possible), an `agentId` that is not a valid UUID or a `hostId` with unusual characters would never match any stored request. Validating the format would provide consistent error messages and match the validation discipline applied to `status` and `type`.
- **Evidence:**
  ```typescript
  // Lines 112-113 - no format validation
  hostId: searchParams.get('hostId') || undefined,
  agentId: searchParams.get('agentId') || undefined,
  ```
  Compare with lines 92-106 where `status` and `type` are validated against allowlists.
- **Fix:** Add `isValidUuid(agentId)` check for `agentId` and a similar format check for `hostId` before passing them to `listCrossHostRequests`. Return 400 with a descriptive error if validation fails.

### [CC-P3-A2-003] Skill settings PUT allows unauthenticated writes (auth is soft/optional)
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/settings/route.ts`:52-53
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** In the PUT handler, `authenticateAgent` is called but auth failure does not block the request. When `auth.error` is truthy, the code sets `requestingAgentId = null` and proceeds to call `saveSkillSettings` anyway. This means an unauthenticated caller can save skill settings for any agent. The same pattern exists in the skills route (PATCH, POST, DELETE handlers). While this may be intentional for the Phase 1 localhost-only security model (web UI users have no auth headers), it means that if governance/RBAC enforcement exists in the service layer, it cannot distinguish between "authenticated system owner via web UI" (no auth headers at all) and "agent that tried to authenticate but failed" (bad credentials). A request with a malformed Authorization header would silently succeed.
- **Evidence:**
  ```typescript
  // Line 52-53 in skills/settings/route.ts
  const auth = authenticateAgent(request.headers.get('Authorization'), request.headers.get('X-Agent-Id'))
  const requestingAgentId = auth.error ? null : (auth.agentId || null)
  ```
  The same pattern at skills/route.ts lines 55-56, 85-86, 118-119.
- **Fix:** Distinguish between "no auth attempted" (both headers null, which `authenticateAgent` returns `{}` for -- no error) and "auth attempted but failed" (error truthy). If auth was attempted and failed, return 401 instead of proceeding with `requestingAgentId = null`. This preserves the Phase 1 behavior for web UI callers (no auth headers) while rejecting callers with bad credentials.


### [CV-P3-001] Claim: "[SF-001] Wrap remote receive branch in try/catch (governance requests POST)"
- **Source:** P2 commit message, line 3
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The Next.js route at `app/api/v1/governance/requests/route.ts:27-63` wraps the remote receive branch in a dedicated try/catch that logs and returns 500. This is correct.
- **What's missing:** The headless router equivalent at `services/headless-router.ts:1358-1399` does NOT have a dedicated try/catch around the remote receive branch. It relies on the global handler catch at lines 1859-1868 instead. This is functionally equivalent (errors still caught), but inconsistent with the Next.js route pattern. The claim says "governance requests POST" which could refer to either -- the Next.js route IS fixed.
- **Evidence:** `services/headless-router.ts:1361-1395` -- no try/catch around `receiveCrossHostRequest` call at line 1395. The global catch at line 1861 handles it, but does not log the specific "[Governance Requests] POST remote-receive error" context the Next.js route logs.
- **Impact:** Low -- errors are still caught by global handler, just with less specific logging in headless mode.

### [CV-P3-002] Claim: "[NT-012] Remove setTimeout for setSaving(false) to avoid unmount risk"
- **Source:** P2 commit message, line 24
- **Severity:** NIT
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** In `components/AgentProfile.tsx:198-234`, the `handleSave` function calls `setSaving(false)` directly in the response handlers (lines 223, 228, 232) with NO setTimeout. The fix IS applied in AgentProfile.
- **What's missing:** In `components/marketplace/AgentSkillEditor.tsx`, there are still `setTimeout(() => setSaveSuccess(false), 2000)` calls at lines 140, 161. These target `setSaveSuccess` (not `setSaving`), so technically the claim is specifically about `setSaving`, which is correct. However, the `setSaveSuccess` setTimeout pattern has the same unmount risk. This is not a strict claim failure since the claim is specifically about `setSaving(false)`.
- **Evidence:** `components/AgentProfile.tsx:223` -- `setSaving(false)` called directly, no setTimeout. `components/marketplace/AgentSkillEditor.tsx:140` -- `setTimeout(() => setSaveSuccess(false), 2000)` still present but for a different state variable.
- **Impact:** Minimal -- React 18 no longer warns about updates on unmounted components.

---


---

## Nits & Suggestions


### [CC-P3-A1-003] Double URL parsing in headless router handle()
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:1849,1852
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `handle()` method calls both `parse(req.url)` (line 1849) and `getQuery(req.url)` (line 1852), and `getQuery` internally also calls `parse(url, true)`. The URL is parsed twice. Only `getQuery` result is actually used by route handlers, while `parsedUrl.pathname` from line 1849 is used for route matching. This is harmless but wasteful.
- **Evidence:**
```typescript
const parsedUrl = parse(req.url || '', true)
const pathname = parsedUrl.pathname || '/'
const method = req.method || 'GET'
const query = getQuery(req.url || '')  // calls parse() again internally
```
- **Fix:** Extract pathname from the same parse call that `getQuery` uses, or have `getQuery` return both pathname and query. Minor performance improvement.

### [CC-P3-A1-004] Deprecated url.parse() usage
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:12,1849
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `url.parse()` from the `url` module is deprecated in Node.js in favor of `new URL()` / `URL` API. While it still works, it may emit deprecation warnings in future Node.js versions.
- **Evidence:**
```typescript
import { parse } from 'url'
// ...
const parsedUrl = parse(req.url || '', true)
```
- **Fix:** Replace with `new URL(req.url || '/', 'http://localhost')` and use `.pathname` and `.searchParams`.

### [CC-P3-A1-005] performRequestExecution silently returns on errors instead of propagating
- **File:** /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts:372-521
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Inside `performRequestExecution`, each switch case does `return` on validation failures (e.g., team not found, COS already assigned). The outer try/catch logs the error, but the calling code (`approveCrossHostRequest`) has no way to know whether execution succeeded or failed -- it always returns 200 with the updated request. The request status is already set to `'executed'` before `performRequestExecution` runs. The code comments (SF-013, lines 493-496) acknowledge this design limitation.
- **Evidence:**
```typescript
// line 383
if (!team) {
  console.error(`${LOG_PREFIX} Cannot execute add-to-team: team '${request.payload.teamId}' not found`)
  return  // silently fails, caller returns 200
}
```
- **Fix:** This is a known design trade-off documented in SF-013. A proper fix would require adding a `'failed'` status to `GovernanceRequestStatus` and updating the type and all callers. Flagged as NIT since the limitation is documented and the current behavior is acceptable for Phase 1.


### [CC-P3-A3-005] Inconsistent error handling in resolveConfigRequest vs submitConfigRequest
- **File:** hooks/useGovernance.ts:320-322 vs hooks/useGovernance.ts:297-299
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `resolveConfigRequest` (line 321) catches JSON parse failure with `.catch(() => ({}))` and falls through to a generic error message. `submitConfigRequest` (line 298) uses the same pattern. However, `resolveConfigRequest` returns the error directly from the response, while `submitConfigRequest` does too. Both are consistent with each other, but both swallow JSON parse errors silently. Minor -- the pattern is used consistently across both functions.
- **Evidence:**
  ```typescript
  // Both use same pattern - consistent but could log parse failure
  const data = await res.json().catch(() => ({}))
  return { success: false, error: data.error || `HTTP ${res.status}` }
  ```
- **Fix:** Consider logging when JSON parse fails on error responses, as this can make debugging harder.

### [CC-P3-A3-006] governance-request-registry.test.ts: test assumes specific request ordering in listGovernanceRequests
- **File:** tests/governance-request-registry.test.ts:311
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The test at line 311 asserts `expect(result.map(r => r.id)).toEqual(['req-pending', 'req-executed', 'req-rejected'])`, which assumes `listGovernanceRequests()` returns results in insertion order. If the implementation ever changes to sort by date or status, this test will break. The test is correct for the current implementation but is fragile.
- **Evidence:**
  ```typescript
  // tests/governance-request-registry.test.ts:311
  expect(result.map(r => r.id)).toEqual(['req-pending', 'req-executed', 'req-rejected'])
  ```
- **Fix:** Use `expect.arrayContaining` or sort-independent assertions if ordering is not part of the function's contract.


### [CC-P3-A0-003] loadGovernanceRequests returns spread of DEFAULT but DEFAULT already has empty requests
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:40
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** On line 40, after writing defaults to disk, the function returns `{ ...DEFAULT_GOVERNANCE_REQUESTS_FILE, requests: [] }`. The spread is redundant because `DEFAULT_GOVERNANCE_REQUESTS_FILE` already has `requests: []` (line 125 of governance-request.ts). The explicit `requests: []` override was presumably added for defensive clarity but is a no-op.
- **Evidence:**
  ```typescript
  // governance-request-registry.ts:39-40
  saveGovernanceRequests(DEFAULT_GOVERNANCE_REQUESTS_FILE)
  return { ...DEFAULT_GOVERNANCE_REQUESTS_FILE, requests: [] }

  // governance-request.ts:123-126
  export const DEFAULT_GOVERNANCE_REQUESTS_FILE: GovernanceRequestsFile = {
    version: 1,
    requests: [],
  }
  ```
- **Fix:** Change to `return { ...DEFAULT_GOVERNANCE_REQUESTS_FILE }` or simply `return structuredClone(DEFAULT_GOVERNANCE_REQUESTS_FILE)`. The spread is still important to avoid returning the mutable singleton.

### [CC-P3-A0-004] Empty catch block in corruption backup is too silent
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:55
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The catch block `catch { /* backup is best-effort */ }` at line 55 silently swallows errors during the backup of a corrupted governance-requests.json file. While the backup IS best-effort, losing the backup silently on a permissions error (e.g., disk full, read-only filesystem) means the corrupted data is lost with no trace.
- **Evidence:**
  ```typescript
  try {
    const backupPath = REQUESTS_FILE + '.corrupted.' + Date.now()
    fs.copyFileSync(REQUESTS_FILE, backupPath)
    console.error(`[governance-requests] Corrupted file backed up to ${backupPath}`)
  } catch { /* backup is best-effort */ }
  ```
- **Fix:** Add a `console.warn` in the catch block: `catch (backupErr) { console.warn('[governance-requests] Failed to backup corrupted file:', backupErr) }`.


### [CC-P3-A2-004] Config deploy route leaks error details in 500 response
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/config/deploy/route.ts`:47-50
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The 500 error response includes `details: error instanceof Error ? error.message : 'Unknown error'`. While this is localhost-only Phase 1, leaking internal error messages in API responses is a pattern that would need to be removed if the API ever becomes externally accessible. The skills routes and chief-of-staff route only include `error.message` without a separate `details` field, so there is an inconsistency across routes.
- **Evidence:**
  ```typescript
  // Line 48 in config/deploy/route.ts
  { error: 'Failed to deploy agent config', details: error instanceof Error ? error.message : 'Unknown error' },
  ```
  Same pattern at skills/route.ts lines 35, 65, 95, 128.
  But NOT in skills/settings/route.ts or chief-of-staff/route.ts which only expose `error.message`.
- **Fix:** Standardize error responses across routes. Either always include `details` for debugging or never include them. For consistency, prefer logging the error server-side and returning a generic message to the client.

### [CC-P3-A2-005] Redundant isValidUuid check in skill settings service
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/settings/route.ts`:21 and service at line 253
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The GET route validates `isValidUuid(agentId)` at line 21, and the service function `getSkillSettings` also validates `isValidUuid(agentId)` at its line 253. This is defensive-in-depth (good), but it means the same validation runs twice. Not a bug, just a note for awareness. The service's check will never trigger because the route already rejects invalid UUIDs.
- **Evidence:**
  ```typescript
  // Route line 21:
  if (!isValidUuid(agentId)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
  // Service line 253:
  if (!agentId || !isValidUuid(agentId)) {
    return { error: 'Invalid agent ID format', status: 400 }
  }
  ```
- **Fix:** Not strictly needed. The redundancy is harmless and provides defense-in-depth. Could remove the service-layer check if the contract guarantees routes always validate first, but keeping both is fine.

### [CC-P3-A2-006] Chief-of-staff route: cosAgentId null check before string check allows empty string
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts`:55,83
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The route checks `cosAgentId === null` first (line 55) for the "remove COS" path, then later checks `typeof cosAgentId !== 'string' || !cosAgentId.trim()` (line 83). The flow is actually correct: `cosAgentId` comes from `body.agentId` which can be `null`, a string, or undefined. If it is `undefined`, `undefined === null` is false, so it falls through to line 83 where `typeof cosAgentId !== 'string'` catches it. However, if `cosAgentId` is `0`, `false`, or `""` (empty string), the null check at line 55 fails, then at line 83 the empty string is caught by `!cosAgentId.trim()`. So the logic is correct but relies on the ordering being maintained. This is fine but worth a note.
- **Evidence:**
  ```typescript
  // Line 55: remove COS
  if (cosAgentId === null) { ... }
  // Line 83: validate non-null cosAgentId
  if (typeof cosAgentId !== 'string' || !cosAgentId.trim()) { ... }
  ```
- **Fix:** No change needed. The logic is correct. For readability, could add a comment explaining the flow.


None found. The fixes are consistent between their claims and implementations across files.

---


---

## Source Reports

- `epcp-correctness-P3-3efe27b9-f382-44cf-8223-95536487e916.md`
- `epcp-correctness-P3-a1c3e7f2-4b89-4d56-9e01-3f8a2b6c5d94.md`
- `epcp-correctness-P3-b84ce2f3-9779-46c5-9ed3-567e42b0efd1.md`
- `epcp-correctness-P3-ef6c94da-c483-4d40-99cf-29a3079d1938.md`
- `epcp-claims-P3-a2f535d4-8e28-4d8a-a564-281ff00f255e.md`
- `epcp-review-P3-86e119b6-2bce-40c4-9284-ba7d0aebdc28.md`

