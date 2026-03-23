# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-22-183750
**Pass:** 4
**Reports merged:** 7
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 3 |
| **SHOULD-FIX** | 18 |
| **NIT** | 12 |
| **Total** | 44 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


_None found._


No must-fix issues found.


### [CC-P4-A4-001] submitConfigRequest test replica diverges from actual hook signature and body
- **File:** tests/use-governance-hook.test.ts:29-51
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The standalone function replica of `submitConfigRequest` has a 2-parameter signature `(targetAgentId, config)`, but the actual `useGovernance.ts` hook (line 287) takes 6 parameters: `(targetAgentId, config, password, requestedBy, requestedByRole, targetHostId?)`. More critically, the request body in the replica omits `password`, `requestedBy`, `requestedByRole`, and `targetHostId` fields that the actual hook sends. This means the tests validate a request body structure that does NOT match what the production code actually sends.
- **Evidence:**
  Test replica body (lines 37-40):
  ```typescript
  body: JSON.stringify({
    type: 'configure-agent',
    payload: { agentId: targetAgentId, configuration: config },
  })
  ```
  Actual hook body (lines 292-299):
  ```typescript
  body: JSON.stringify({
    type: 'configure-agent',
    targetHostId: targetHostId || 'localhost',
    requestedBy,
    requestedByRole,
    password,
    payload: { agentId: targetAgentId, configuration: config },
  })
  ```
  The test asserts that the body has only `type` and `payload`, but the production code also sends `targetHostId`, `requestedBy`, `requestedByRole`, and `password`. A server relying on these fields would fail if they were missing. The test gives a false green.
- **Fix:** Update the replica function to match the actual 6-parameter signature, and update the request body to include all fields. Update the assertion in the test at line 123-126 to verify the additional body fields.

### [CC-P4-A4-002] submitConfigRequest error-path replica diverges from actual hook error handling
- **File:** tests/use-governance-hook.test.ts:43
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The test replica's error path for non-ok responses uses `.catch(() => ({}))` (line 43), while the actual hook (lines 302-305) uses `.catch((parseErr: unknown) => { console.warn(...); return {} })`. While the functional result is equivalent (both return `{}`), the test at lines 143-155 claims to verify the actual hook's behavior but is testing a subtly different implementation. More importantly, the test for `submitConfigRequest` never tests the case where `res.json()` throws on the error path -- this case IS tested for `resolveConfigRequest` (line 245-258) but NOT for `submitConfigRequest`, creating asymmetric coverage despite both functions having identical error handling patterns in the real hook.
- **Evidence:**
  Test replica line 43:
  ```typescript
  const data = await res.json().catch(() => ({}))
  ```
  Actual hook lines 302-305:
  ```typescript
  const data = await res.json().catch((parseErr: unknown) => {
    console.warn('[useGovernance] Failed to parse response JSON:', parseErr)
    return {}
  })
  ```
- **Fix:** (1) Update the replica to match the actual hook's `.catch()` signature. (2) Add a test case for `submitConfigRequest` that verifies behavior when `res.json()` throws on the error path (symmetric with the existing test at line 245).


(none)


### [CC-P4-A3-001] Missing cosAgentId UUID format validation in headless chief-of-staff route
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1678-1683
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The headless router's chief-of-staff POST handler (lines 1604-1701) is missing the `isValidUuid(cosAgentId)` check that exists in the Next.js mirror route at `app/api/teams/[id]/chief-of-staff/route.ts:87-89`. The Next.js route validates `cosAgentId` format before passing it to `getAgent()`:

  ```typescript
  // Next.js route (line 87-89) - present:
  if (!isValidUuid(cosAgentId)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
  ```

  The headless route skips directly from the `typeof cosAgentId !== 'string'` check (line 1678) to `getAgent(cosAgentId)` (line 1683) without UUID format validation. This allows malformed agent IDs (including path traversal patterns like `../../etc/passwd`) to be passed to `getAgent()`, which does a file-based registry lookup. While `getAgent` likely uses a Map lookup that would just return undefined for invalid IDs, the contract mismatch between the two routes means the headless router is less secure.
- **Evidence:**
  ```typescript
  // headless-router.ts lines 1678-1683 - MISSING isValidUuid check
  if (typeof cosAgentId !== 'string' || !cosAgentId.trim()) {
    sendJson(res, 400, { error: 'agentId must be a non-empty string or null' })
    return
  }
  // MISSING: if (!isValidUuid(cosAgentId)) { ... }
  const agent = getAgent(cosAgentId)
  ```
- **Fix:** Add `if (!isValidUuid(cosAgentId)) { sendJson(res, 400, { error: 'Invalid agent ID format' }); return }` between lines 1681 and 1683 to match the Next.js route. The `isValidUuid` import already exists at line 245.


---

## SHOULD-FIX Issues


### [CC-P4-A1-001] Missing validation of `requestedByRole` and `payload` in governance requests POST route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:67-82
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The local-submission path (SF-007 validation block, lines 67-79) validates `type`, `password`, `targetHostId`, and `requestedBy`, but does NOT validate `requestedByRole` or `payload` -- both of which are required fields in the `submitCrossHostRequest` service function signature. If a caller omits `requestedByRole`, the service stores `undefined` into the governance request record, and the remote host's `receiveCrossHostRequest` will reject it at line 180 with "Invalid requestedByRole". If `payload` is omitted, `createGovernanceRequest` stores `undefined`, and the remote host will throw a runtime TypeError at line 165 when accessing `request.payload?.agentId` (the `?.` prevents the crash in `receiveCrossHostRequest`, but the record is still created locally with no payload). The body is passed directly to the service via `submitCrossHostRequest(body)` on line 82, so any missing fields pass through.
- **Evidence:**
  ```typescript
  // route.ts lines 67-82 -- validates 4 of 6 required fields
  if (!body.type || typeof body.type !== 'string') { ... }
  if (!body.password || typeof body.password !== 'string') { ... }
  if (!body.targetHostId || typeof body.targetHostId !== 'string') { ... }
  if (!body.requestedBy || typeof body.requestedBy !== 'string') { ... }
  // Missing: body.requestedByRole, body.payload

  // service signature expects all 6:
  export async function submitCrossHostRequest(params: {
    type: GovernanceRequestType
    targetHostId: string
    requestedBy: string
    requestedByRole: AgentRole    // <-- not validated in route
    payload: GovernanceRequestPayload  // <-- not validated in route
    password: string
    note?: string
  })
  ```
- **Fix:** Add validation for `requestedByRole` (must be one of `'manager'`, `'chief-of-staff'`, `'member'`) and `payload` (must be an object with at least `agentId` as a string) before calling `submitCrossHostRequest(body)`.

### [CC-P4-A1-002] Hostname regex rejects single-character hostnames
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:129
- **Severity:** SHOULD-FIX (minor)
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `HOSTNAME_RE` regex `/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,253}[a-zA-Z0-9]$/` requires a minimum of 2 characters (the leading `[a-zA-Z0-9]` and trailing `[a-zA-Z0-9]` each consume exactly one character, with the middle group allowing 0). Single-character hostnames (e.g., "a") are valid per RFC 952/1123 but would be rejected. Also, the regex allows hostnames up to 255 characters (1 + 253 + 1) which matches RFC 1035's 253-octet limit for FQDNs only if the middle section is 251 not 253.
- **Evidence:**
  ```typescript
  const HOSTNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,253}[a-zA-Z0-9]$/
  // Test: "a".match(HOSTNAME_RE)  → null (rejected, but "a" is a valid hostname)
  // Test: "ab".match(HOSTNAME_RE) → match (minimum accepted)
  ```
- **Fix:** Change to `/^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,251}[a-zA-Z0-9])?$/` to allow single-char hostnames and correctly cap the max at 253 chars total. Alternatively, use a simpler check: `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/` with a length check `hostId.length <= 253`.


### [CC-P4-A2-001] TOCTOU race: pre-check for terminal state is outside the lock, enabling double-execution
- **File:** /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts:293-305
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** In `approveCrossHostRequest`, the terminal-state pre-check at line 293 reads the request status at line 265 (lock-free via `getGovernanceRequest`), but the actual approval at line 298 (`approveGovernanceRequest`) acquires the `governance-requests` lock and re-reads. Between lines 265 and 298, a concurrent request could have already transitioned the request to `executed`. The inner `approveGovernanceRequest` (registry line 170) does handle this by returning the unchanged request for terminal states -- but it returns the request (not null), so the caller at line 304 sees `updated.status === 'executed'` and calls `performRequestExecution` again. The team mutations in `performRequestExecution` are mostly idempotent (push-if-not-exists, filter), so data corruption is unlikely, but a `configure-agent` execution could double-deploy a configuration and send duplicate notifications.
- **Evidence:**
```typescript
// Line 265: Lock-free read
const request = getGovernanceRequest(requestId)
// ...
// Line 293: Pre-check based on stale data
if (request.status === 'executed' || request.status === 'rejected') {
  return { error: `Request '${requestId}' is already ${request.status}`, status: 409 }
}
// Line 298: Lock-protected approval (re-reads from disk)
const updated = await approveGovernanceRequest(requestId, approverAgentId, approverType)
// Line 304: Triggers execution even if the request was ALREADY executed before this call
if (updated.status === 'executed') {
  await performRequestExecution(updated)
}
```
- **Fix:** After `approveGovernanceRequest` returns, check whether the approval actually changed the status. The registry function at line 170 returns the unchanged request for terminal states. Compare the request status before and after: if the status was already `executed` when `approveGovernanceRequest` found it, skip execution. Simplest approach: have `approveGovernanceRequest` return a richer result (e.g., `{ request, wasAlreadyTerminal: boolean }`), or compare `request.status` (from the pre-read) against `updated.status` -- if both are `executed`, the transition was not caused by this call and `performRequestExecution` should be skipped. Alternatively, the same pattern used in `receiveCrossHostRequest` at line 223 (`if (approvedRequest?.status === 'executed')`) could be augmented with a `wasAlreadyExecuted` flag from the registry.

### [CC-P4-A2-002] Duplicate request receipt still triggers auto-approve path on existing request
- **File:** /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts:192-231
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `receiveCrossHostRequest` receives a duplicate request (one whose ID already exists locally), the `withLock` block at line 192 correctly skips insertion (line 197-199). However, after the lock is released, the auto-approve logic at lines 217-231 still runs unconditionally. If the existing request is in a non-pending state (e.g., already `executed` or `rejected`), the `approveGovernanceRequest` call at line 222 will find it and (correctly) return it unchanged due to the terminal-state guard. But if the existing request is still `pending`, receiving a duplicate from the network would trigger another auto-approve attempt, potentially causing a redundant approval. The `approveGovernanceRequest` is idempotent for the same approverType (it overwrites the same approval slot), so no corruption occurs, but it generates unnecessary I/O and log noise.
- **Evidence:**
```typescript
// Line 192-212: Stores or skips duplicate
await withLock('governance-requests', () => {
  const file = loadGovernanceRequests()
  const existing = file.requests.find(r => r.id === request.id)
  if (existing) {
    console.log(`... skipping duplicate`)
    return  // Skipped, but no flag propagated
  }
  file.requests.push({ ...request, status: 'pending', approvals: {} })
  saveGovernanceRequests(file)
})

// Line 217-231: Runs regardless of whether the request was a duplicate
if (shouldAutoApprove(request)) {
  // ...auto-approve logic...
}
```
- **Fix:** Capture whether the request was newly inserted vs. skipped as a duplicate. Return a boolean from the `withLock` callback (e.g., `const isNew = await withLock(...)`) and only proceed with auto-approve if `isNew === true`.


### [CC-P4-A4-003] readFileSync mock ignores encoding parameter
- **File:** tests/governance-request-registry.test.ts:44,63
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `readFileSync` mock accepts only `(filePath: string)`, but the actual call in `governance-request-registry.ts:43` passes `(REQUESTS_FILE, 'utf-8')`. The mock ignores the encoding argument, which means it returns a raw string regardless. This works in this test because the mock always returns strings, but it means the test wouldn't catch a regression where someone removes the encoding argument from the source (which would cause `readFileSync` to return a `Buffer` instead of `string` in real Node.js).
- **Evidence:**
  Mock (line 44):
  ```typescript
  readFileSync: vi.fn((filePath: string) => {
  ```
  Source (line 43):
  ```typescript
  const data = fs.readFileSync(REQUESTS_FILE, 'utf-8')
  ```
- **Fix:** Update the mock signature to `readFileSync: vi.fn((filePath: string, _encoding?: string) => {` and optionally assert in at least one test that the encoding parameter was passed.

### [CC-P4-A4-004] writeFileSync mock ignores encoding parameter
- **File:** tests/governance-request-registry.test.ts:48,67
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P4-A4-003 but for `writeFileSync`. The mock takes `(filePath: string, data: string)` but the source passes a third argument `'utf-8'`. The test wouldn't detect if the encoding were removed from the source.
- **Evidence:**
  Mock (line 48):
  ```typescript
  writeFileSync: vi.fn((filePath: string, data: string) => {
  ```
  Source (line 71):
  ```typescript
  fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
  ```
- **Fix:** Update mock to `writeFileSync: vi.fn((filePath: string, data: string, _encoding?: string) => {`.

### [CC-P4-A4-005] Missing test: rejectGovernanceRequest with unknown ID
- **File:** tests/governance-request-registry.test.ts:565-590
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `rejectGovernanceRequest` test suite tests rejection of a pending request and rejection guard for executed requests, but does NOT test what happens when `rejectGovernanceRequest` is called with a non-existent ID. The source code (line 218) returns `null` in this case. The `approveGovernanceRequest` suite correctly tests this case (line 514-521), but `rejectGovernanceRequest` does not.
- **Evidence:** The source at line 218 returns `null` for unknown IDs:
  ```typescript
  if (!request) return null
  ```
  No test verifies this behavior for `rejectGovernanceRequest`.
- **Fix:** Add a test case: `it('returns null for unknown request ID', ...)` that seeds an empty requests file and calls `rejectGovernanceRequest('nonexistent', 'agent', 'reason')`, asserting the result is `null`.

### [CC-P4-A4-006] Missing test: executeGovernanceRequest with unknown ID
- **File:** tests/governance-request-registry.test.ts:596-624
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Similar to CC-P4-A4-005, the `executeGovernanceRequest` test suite does not test the `null` return case for unknown IDs (source line 240: `if (!request) return null`).
- **Evidence:** Source at line 240:
  ```typescript
  if (!request) return null
  ```
  No test verifies this path.
- **Fix:** Add a test case asserting `executeGovernanceRequest('nonexistent')` returns `null`.

### [CC-P4-A4-007] Missing test: dual-approved status path in approveGovernanceRequest
- **File:** tests/governance-request-registry.test.ts:447-559
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The source code (lines 198-201) has a `dual-approved` status path that is triggered when both source-side AND target-side have at least COS approval but NOT both managers. This status transition is documented in the JSDoc (line 155) but never tested. The test suite only covers: sourceCOS alone (remote-approved), targetManager alone (local-approved), both managers (executed), and terminal state guards. The `dual-approved` path has zero test coverage.
- **Evidence:** Source lines 198-201:
  ```typescript
  } else if (hasAnySourceApproval && hasAnyTargetApproval) {
    // Both sides have at least COS approval but not both managers yet
    request.status = 'dual-approved'
  }
  ```
- **Fix:** Add a test: seed a request with `sourceCOS` approval, then approve with `targetCOS`. Assert `status === 'dual-approved'`.

### [CC-P4-A4-008] Test does not verify refresh() call in hook after successful mutation
- **File:** tests/use-governance-hook.test.ts:129-141
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The actual `useGovernance` hook calls `refresh()` (fire-and-forget) after successful `submitConfigRequest` (line 309) and `resolveConfigRequest` (line 338). Since the test replicas are standalone functions (not extracted from the hook), they cannot test this behavior. This is an inherent limitation of the test strategy, but it means a regression that removes the `refresh()` call would not be caught. The test file's header (lines 12-13) acknowledges this limitation, but it should be documented as a known gap.
- **Evidence:** Source line 309:
  ```typescript
  refresh() // CC-002: Intentionally fire-and-forget
  ```
  The test replica at line 47 simply returns the result without calling any refresh.
- **Fix:** Either document this as a known test gap with a `// TODO:` comment in the test, or add a test that uses `@testing-library/react` or a minimal hook wrapper to verify `refresh()` is called after success.


### [CC-P4-A0-001] resolveConfigRequest return value silently ignored in handleResolve
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:97
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `handleResolve` awaits `resolveConfigRequest(...)` but never checks the return value `{ success, error }`. The `resolveConfigRequest` implementation in `useGovernance.ts` (lines 318-345) wraps all errors in a return object and never throws, so the `catch` block in `handleResolve` (line 98-99) will never execute. When the server rejects an approve/reject (e.g., wrong password, already resolved), the user sees no error feedback.
- **Evidence:**
```typescript
// AgentSkillEditor.tsx:88-103
const handleResolve = async (requestId: string, approved: boolean) => {
  // ...
  try {
    await resolveConfigRequest(requestId, approved, governancePassword, resolverAgent)
    // <-- return value { success: false, error: '...' } is silently ignored
  } catch (err) {
    // This catch will never fire -- resolveConfigRequest never throws
    console.error('Failed to resolve config request:', err)
  } finally {
    // ...
  }
}
```
- **Fix:** Check the return value and set error state on failure:
```typescript
const result = await resolveConfigRequest(requestId, approved, governancePassword, resolverAgent)
if (!result.success) {
  setError(result.error || 'Failed to resolve configuration request')
}
```

### [CC-P4-A0-002] saveSuccessTimerRef not cleared before setting new timeout (timer leak)
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:155,176
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `handleAddSkill` or `handleRemoveSkill` is called multiple times in quick succession (e.g., user rapidly adds two skills), the previous timer is not cleared before setting a new one. This creates orphaned timers that can set `saveSuccess` to `false` at unexpected times, causing the "Saved" indicator to flash/disappear prematurely. The cleanup on unmount (line 66) only clears the last timer ref.
- **Evidence:**
```typescript
// Line 155 (inside handleAddSkill):
saveSuccessTimerRef.current = setTimeout(() => setSaveSuccess(false), 2000)

// Line 176 (inside handleRemoveSkill):
saveSuccessTimerRef.current = setTimeout(() => setSaveSuccess(false), 2000)

// Neither clears the previous timer first
```
- **Fix:** Clear the existing timer before setting a new one:
```typescript
if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
saveSuccessTimerRef.current = setTimeout(() => setSaveSuccess(false), 2000)
```


### [CC-P4-A3-002] Dead code: `getQuery()` function is unused after Pass 3 refactor
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:407-412
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `getQuery()` helper function was replaced in Pass 3 by inline query parsing in `createHeadlessRouter().handle()` (lines 1868-1869). The function at lines 407-412 is now dead code -- it has zero callers in the entire codebase. Dead code in a security-critical routing module adds confusion and maintenance burden.
- **Evidence:**
  ```typescript
  // Line 407-412: defined but never called
  function getQuery(url: string): Record<string, string> {
    const urlObj = new URL(url, 'http://localhost')
    const q: Record<string, string> = {}
    urlObj.searchParams.forEach((v, k) => { q[k] = v })
    return q
  }

  // Line 1868-1869: inline replacement in handle()
  const query: Record<string, string> = {}
  urlObj.searchParams.forEach((v, k) => { query[k] = v })
  ```
  Grep confirmed zero callers of `getQuery` in the entire project.
- **Fix:** Remove the `getQuery` function (lines 406-412) since its logic is now inline in `handle()`.

### [CC-P4-A3-003] Agent export filename not sanitized in Content-Disposition header
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:922
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The export route at line 922 constructs a `Content-Disposition` header using `filename` from the service result, which is derived from `agent.name || agent.alias`. If an agent name contains `"` or `\r\n` characters, it could inject headers or break the Content-Disposition value. While agent names are typically alphanumeric with hyphens/underscores, the headless router should not rely on upstream validation for HTTP header safety.
- **Evidence:**
  ```typescript
  // Line 920-922
  sendBinary(res, 200, new Uint8Array(buffer), {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"`,
    // ...
  })
  ```
  The `filename` is `${agentName}-export-${timestamp}.zip` where `agentName = agent.name || agent.alias`.
- **Fix:** Sanitize the filename before use: `filename.replace(/["\r\n\\]/g, '_')` or use the RFC 5987 `filename*` encoding. Alternatively, validate at the service layer.

### [CC-P4-A3-004] `readJsonBody` rejects with non-Error for 413 but error handler expects `error.statusCode`
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:321, 1878-1884
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `readJsonBody` function uses `Object.assign(new Error(...), { statusCode: 413 })` to add a `statusCode` property. The catch block in `handle()` at line 1882 reads `error?.statusCode`. This works correctly for `readJsonBody`'s 413 rejection. However, the same `readRawBody` function (line 359) also uses this pattern. The concern is that the `any` type at line 1878 (`catch (error: any)`) means there's no type narrowing -- this works but relies on duck-typing a non-standard property. This is fragile: if any service function throws an error with a different `statusCode` value, it would be exposed to the client as a status code override, which could cause unexpected behavior (e.g. a service throwing `{ statusCode: 0 }` would send status 0).
- **Evidence:**
  ```typescript
  // Line 1878-1884
  } catch (error: any) {
    console.error(`[Headless] Error handling ${method} ${pathname}:`, error)
    if (!res.headersSent) {
      const statusCode = error?.statusCode || 500  // duck-typed from any thrown error
      const message = statusCode === 413 ? 'Request body too large' : 'Internal server error'
      sendJson(res, statusCode, { error: message })
    }
  }
  ```
- **Fix:** Narrow the statusCode check: only honor `413` specifically rather than any arbitrary `statusCode` from an unknown error. E.g.: `const statusCode = error?.statusCode === 413 ? 413 : 500`.


### [CV-P4-001] Claim: "ToxicSkills scan" (listed as edge case 11d)
- **Source:** Commit `9e4e2cf`, Step 11 list: "ToxicSkills scan"
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The deploy service has the placeholder with a TODO comment at `services/agents-config-deploy-service.ts:162-164`: `// TODO: ToxicSkills scan on deployed content (11d safeguard) / When @/lib/toxic-skills is implemented, scan skill content here before deployment`
- **What's missing:** The actual ToxicSkills scan is NOT executed during deployment. The module `@/lib/toxic-skills` does not exist. The original dynamic import was replaced with a TODO comment (as acknowledged in commit `42079ac`). However, the commit message for the initial feature commit (`9e4e2cf`) lists "ToxicSkills scan" as an implemented edge case, which is misleading -- it is scaffolded, not implemented.
- **Impact:** Deployed skills are not scanned for malicious content during cross-host governance config deployment. The CLI scripts (`agent-skill.sh`, `agent-plugin.sh`) DO have their own ToxicSkills scanning, but the web API deploy path does not.

### [CV-P4-002] Claim: "56 new tests" in initial feature commit
- **Source:** Commit `9e4e2cf`: "Test suite: 56 new tests (skills RBAC, deploy, cross-host, notifications)"
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The extended test file `tests/agent-config-governance-extended.test.ts` contains exactly 56 `it()` blocks, matching the claim. The base file `tests/agent-config-governance.test.ts` has 17 additional tests (16 claimed + 1 extra). The `tests/use-governance-hook.test.ts` adds 10 more tests (added in pass 3 via SF-004).
- **What's missing:** The tests are all mocked -- every dependency (filesystem, governance lib, agent registry, network) is stubbed. While the internal logic of the service functions is exercised for real, the claim "comprehensive test suite" could be misleading because no integration tests exist that test real filesystem or network behavior. This is acceptable for unit tests but should be noted.
- **Impact:** Low. Mock-based unit tests are standard practice, but the PR does not contain integration tests for the governance flow.

### [CV-P4-003] Claim: "Total: 836 tests passing across 29 test files (780 existing + 56 new)"
- **Source:** Commit `9e4e2cf`: "Total: 836 tests passing across 29 test files"
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The math is consistent (780 + 56 = 836). Later passes report updated totals: 836 (P1), 841 (P2), 851 (P3).
- **What's missing:** The actual test count discrepancy is documented in the test file itself (NT-013 comment at `tests/agent-config-governance.test.ts:15-21`): vitest counts parameterized expansions, so the 836/841/851 number includes it.each expansions, not discrete test functions. The actual discrete `it()` block count is lower (~628 per the comment). This is disclosed but the commit messages use vitest's inflated count without caveat.
- **Impact:** Cosmetic. The inflated number is vitest's default behavior and is documented in the codebase.


---

## Nits & Suggestions


### [CC-P4-A1-003] Hostname regex compiled inside request handler on every GET call
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:129
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `HOSTNAME_RE` regex is defined inside the `GET` function body, so it's recompiled on every request. The status and type sets (`VALID_GOVERNANCE_REQUEST_STATUSES`, `VALID_GOVERNANCE_REQUEST_TYPES`) are already defined at module level (lines 94-102). `HOSTNAME_RE` should follow the same pattern for consistency and minor performance benefit.
- **Evidence:**
  ```typescript
  // Lines 94-102: module-level (correct)
  const VALID_GOVERNANCE_REQUEST_STATUSES = new Set([...])
  const VALID_GOVERNANCE_REQUEST_TYPES = new Set([...])

  // Line 129: inside function body (inconsistent)
  export async function GET(request: NextRequest): Promise<NextResponse> {
    ...
    const HOSTNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,253}[a-zA-Z0-9]$/
  ```
- **Fix:** Move `HOSTNAME_RE` to module level, alongside the other validation constants.

### [CC-P4-A1-004] GET handler for skills settings does not require authentication
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/settings/route.ts:15-36
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `GET` handler for skill settings does not perform any authentication check. The `PUT` handler on the same file (line 52-62) has the SF-009 auth pattern. This is consistent with other GET handlers in the skills route (line 18-39 of `skills/route.ts`) and follows the Phase 1 localhost-only security model, but it's worth noting that skill settings may contain sensitive configuration data. If authentication is added later, this GET handler should also be updated.
- **Fix:** No immediate action needed given Phase 1 security model. Document as a Phase 2 consideration.

### [CC-P4-A1-005] Error message in 500 handler leaks error details for skills settings endpoints
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/settings/route.ts:32,70
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Both GET and PUT 500 error handlers in skills/settings return `error.message` directly in the response: `error instanceof Error ? error.message : 'Unknown error'`. The other route files (config/deploy, skills/route.ts, governance/requests) return generic messages like `'Failed to fetch agent skills'` or `'Internal server error'`. While this is fine for localhost, error messages can leak internal implementation details (stack info, file paths, etc.).
- **Evidence:**
  ```typescript
  // skills/settings/route.ts (leaks error.message):
  { error: error instanceof Error ? error.message : 'Unknown error' }

  // skills/route.ts (generic message):
  { error: 'Failed to fetch agent skills' }

  // governance/requests/route.ts (generic message):
  { error: 'Internal server error' }
  ```
- **Fix:** Use generic error messages in 500 handlers, log the actual error to console (which is already done).


### [CC-P4-A2-003] `expirePendingRequestsInPlace` only checks `pending` status but docstring on `purgeOldRequests` says "auto-reject stale pending requests" without clarifying the 7-day hardcoded TTL
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:306
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `purgeOldRequests` calls `expirePendingRequestsInPlace(filtered, 7)` with a hardcoded 7-day TTL, while the function parameter `maxAgeDays` (default 30) controls the terminal-state purge cutoff. The two different time windows (30 days for purge, 7 days for expiry) are not explained in the function's JSDoc or parameter documentation. A caller passing `maxAgeDays = 3` might reasonably expect pending requests older than 3 days to also be expired, but they would still use the hardcoded 7 days.
- **Evidence:**
```typescript
// Line 292: maxAgeDays = 30 for terminal-state purge
export async function purgeOldRequests(maxAgeDays: number = 30): Promise<PurgeResult> {
  // ...
  // Line 306: Hardcoded 7 for pending expiry -- not related to maxAgeDays
  const expired = expirePendingRequestsInPlace(filtered, 7)
```
- **Fix:** Either make the pending TTL a separate parameter (e.g., `pendingTtlDays: number = 7`), or document the relationship between `maxAgeDays` and the hardcoded 7-day pending TTL in the JSDoc.

### [CC-P4-A2-004] `approveGovernanceRequest` status transitions missing `pending` -> `remote-approved`/`local-approved` labels are semantically confusing
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:192-201
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The status `remote-approved` is set when "only source side approved" (line 194), and `local-approved` when "only target side approved" (line 196). However, from the perspective of the target host (which receives requests), "remote" typically means "the other host" (i.e., source). So `remote-approved` meaning "source-side approved" is semantically correct. But the comment says "only source side approved" and the label is "remote-approved" -- which is consistent only if interpreted from the target host's perspective. If a source host reads its own copy of the request, "remote-approved" would mean "I (source) approved it" which is confusing since from the source's perspective, that is a local action. This is a naming clarity issue, not a bug.
- **Evidence:**
```typescript
} else if (hasAnySourceApproval && !hasAnyTargetApproval) {
  // Only source side approved
  request.status = 'remote-approved'  // "remote" from target's perspective
} else if (hasAnyTargetApproval && !hasAnySourceApproval) {
  // Only target side approved
  request.status = 'local-approved'   // "local" from target's perspective
```
- **Fix:** Consider renaming to `source-approved` / `target-approved` for unambiguous semantics, or add a comment clarifying the naming convention is from the target host's perspective.


### [CC-P4-A4-009] Inconsistent agentId filter test -- relies on coincidental string match
- **File:** tests/governance-request-registry.test.ts:338-345
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test for `listGovernanceRequests` agentId filter (line 341) relies on `'agent-x'` matching both `pendingReq.payload.agentId` (which is `'agent-x'` from the fixture at line 282) AND `rejectedReq.requestedBy` (which is `'agent-x'` from line 299). This is correct but the two match paths (payload.agentId vs requestedBy) are not explicitly tested separately. A single test with the same string matching both paths doesn't confirm both filter branches work independently.
- **Evidence:**
  ```typescript
  const result = listGovernanceRequests({ agentId: 'agent-x' })
  expect(result).toHaveLength(2) // matches both paths with same string
  ```
- **Fix:** Add two sub-assertions or separate test cases: one where agentId matches only `payload.agentId` and another where it matches only `requestedBy`.

### [CC-P4-A4-010] Test comment says "lines 286-309" but actual line numbers may have shifted
- **File:** tests/use-governance-hook.test.ts:27
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The JSDoc on the replica function says "Mirrors hooks/useGovernance.ts lines 286-309 exactly" but the line numbers in the source are currently 286-316 (with the `refresh()` call and `[refresh]` dependency array). Hard-coded line numbers in comments go stale quickly.
- **Evidence:**
  ```typescript
  * Mirrors hooks/useGovernance.ts lines 286-309 exactly.
  ```
  The actual function spans lines 286-316 in the source.
- **Fix:** Remove the specific line number references or use a more stable reference like "Mirrors the submitConfigRequest useCallback in hooks/useGovernance.ts".


### [CC-P4-A0-003] Unused imports in AgentSkillEditor
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:29
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `useGovernance` hook destructures `agentRole` (line 79) but `agentRole` is never used in the component's render logic or any handler. It's only destructured, not referenced. Similarly, `managerId` is used on line 94 inside `handleResolve`, which is valid, so that one is fine. But `agentRole` is dead code.
- **Evidence:**
```typescript
// Line 79
const { pendingConfigRequests, resolveConfigRequest, agentRole, managerId } = useGovernance(agentId)
// agentRole is never referenced anywhere else in the file
```
- **Fix:** Remove `agentRole` from the destructuring to avoid confusion about whether it's used for access control decisions.

### [CC-P4-A0-004] canApprove hardcoded to true, agentRole unused for authorization
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:82
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `canApprove` is hardcoded to `true` with a comment "Phase 1: localhost single-user". The `agentRole` is destructured (line 79) but not used to gate the approve/reject buttons. This is fine for Phase 1 but should be tracked as a Phase 2 TODO since the plumbing (`agentRole`) is already in place but not connected.
- **Evidence:**
```typescript
// Line 82
const canApprove = true  // Phase 1 hardcoded
```
- **Fix:** This is documented and intentional for Phase 1. No action needed now, but Phase 2 should wire `canApprove` to `agentRole === 'manager' || agentRole === 'chief-of-staff'`.


### [CC-P4-A3-005] NT-002 comment references replaced code
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:406
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The comment `// NT-002: Use modern URL API instead of deprecated url.parse()` at line 406 refers to the `getQuery` function, which is now dead code (see CC-P4-A3-002). The actual fix for NT-002 was applied inline in `handle()` at line 1864. The comment is misleading since it annotates unused code.
- **Evidence:**
  ```typescript
  // Line 406-412
  // NT-002: Use modern URL API instead of deprecated url.parse()
  function getQuery(url: string): Record<string, string> {
  ```
- **Fix:** Remove the dead function and its comment (same fix as CC-P4-A3-002).

### [CC-P4-A3-006] `query.project` passed directly without fallback to `clearDocs`
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:833
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** POSSIBLE
- **Description:** `clearDocs(params.id, query.project)` passes `query.project` which could be `undefined` if the query parameter is missing. Whether this is a problem depends on the `clearDocs` signature -- if it expects `string | undefined`, this is fine. Other similar patterns in the file use `|| ''` or `|| undefined` as explicit fallbacks. This inconsistency is worth noting for code clarity.
- **Evidence:**
  ```typescript
  // Line 833 - no fallback
  sendServiceResult(res, await clearDocs(params.id, query.project))
  // Compared to line 796 - explicit fallback
  sendServiceResult(res, await deleteCodeGraph(params.id, query.projectPath || ''))
  ```
- **Fix:** Verify `clearDocs` signature and either add `|| ''` if it expects a string, or leave as-is if it handles `undefined`.

### [CC-P4-A3-007] Governance sync timestamp freshness check allows negative clock skew of 60s but positive of 5 minutes
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1321
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The timestamp freshness check `tsAge > 300_000 || tsAge < -60_000` means: a timestamp from up to 5 minutes in the past is accepted, but a timestamp from up to 60 seconds in the future is accepted. This asymmetry is intentional (comment says "5 min window, allow 60s clock skew") but the comment doesn't explain the asymmetry clearly. The same pattern is repeated in 5 places (lines 1321, 1353, 1400, 1449, and the GET governance/sync at line 1354). This is functionally correct but the asymmetric window could cause confusion for maintainers.
- **Evidence:**
  ```typescript
  // Line 1319-1323 (repeated 5 times in governance routes)
  // Check timestamp freshness (5 min window, allow 60s clock skew)
  const tsAge = Date.now() - new Date(hostTimestamp).getTime()
  if (isNaN(tsAge) || tsAge > 300_000 || tsAge < -60_000) {
    sendJson(res, 403, { error: 'Signature expired' })
    return
  }
  ```
- **Fix:** Consider extracting this into a helper function (e.g., `isTimestampFresh(hostTimestamp)`) to reduce duplication and centralize the logic. Also improve the comment to explain: "Accept timestamps from 5min ago to 60s in the future (clock skew tolerance)."


None found. Version strings, types, and cross-file references are consistent.


---

## Source Reports

- `epcp-correctness-P4-72a49824-3d0f-4d87-8639-9f0d87b5611e.md`
- `epcp-correctness-P4-8282814c-f8b8-498d-a56a-68269641799d.md`
- `epcp-correctness-P4-ad56df60-9209-42c4-b82b-5777513cfdc5.md`
- `epcp-correctness-P4-c2631157-d9f4-4376-bded-7d5cb0caac8b.md`
- `epcp-correctness-P4-ea0d592e-d300-4c9c-bdc1-5bcde65df725.md`
- `epcp-claims-P4-53421286-89e6-4941-9c8b-c90e6e0c5fac.md`
- `epcp-review-P4-380ca69a-4e44-448f-ae3e-e5214d74d9b2.md`

