# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-22-174231
**Pass:** 2
**Reports merged:** 6
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 0 |
| **SHOULD-FIX** | 10 |
| **NIT** | 13 |
| **Total** | 30 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


_None found._


(none)


(none)


_No must-fix issues found._


---

## SHOULD-FIX Issues


### [CC-P2-A2-001] Remote receive path in governance requests POST lacks try/catch
- **File:** app/api/v1/governance/requests/route.ts:26-58
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The remote receive branch (`if (body?.fromHostId)`) calls `receiveCrossHostRequest()` at line 54 without a try/catch wrapper. The local submission branch (lines 61-70) has a try/catch that logs `[Governance Requests] POST error:`, but the remote receive branch does not. If `receiveCrossHostRequest` throws (e.g., `withLock` timeout, JSON parse error inside the service), the exception propagates unhandled to Next.js which returns a generic 500 with no contextual logging.
- **Evidence:**
  ```typescript
  // Lines 26-58: remote receive path - NO try/catch
  if (body?.fromHostId) {
    // ... auth checks ...
    const result = await receiveCrossHostRequest(body.fromHostId, body.request)  // line 54 - can throw
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  }

  // Lines 61-70: local submission path - HAS try/catch
  try {
    const result = await submitCrossHostRequest(body)
    // ...
  } catch (err) {
    console.error('[Governance Requests] POST error:', err)  // this only catches local path
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  ```
- **Fix:** Wrap lines 54-58 in a try/catch, or restructure the POST handler to have a single outer try/catch encompassing both branches (after the JSON parse guard).

### [CC-P2-A2-002] Config deploy route hardcodes 403 for all auth errors instead of using auth.status
- **File:** app/api/agents/[id]/config/deploy/route.ts:30
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The deploy route returns `status: 403` for all auth failures, but `authenticateAgent` returns `status: 401` for invalid credentials and `status: 403` for identity mismatch. Every other route in the codebase uses `auth.status || 401`. This means a client sending an invalid Bearer token would get a 403 (Forbidden) instead of 401 (Unauthorized), which is semantically incorrect and inconsistent.
- **Evidence:**
  ```typescript
  // deploy/route.ts line 30 - HARDCODED 403
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: 403 })
  }

  // Every other route in the codebase uses auth.status:
  // e.g., app/api/messages/route.ts:47
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }
  ```
- **Fix:** Change line 30 to: `return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })`


(none)


### [CC-P2-A1-001] SF-025 fix introduced global rate limit key inconsistency
- **File:** services/headless-router.ts:1588
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The new `/api/teams/:id/chief-of-staff` endpoint in the headless router (added as the SF-025 fix) uses a global rate limit key `'governance-cos-auth'` at line 1588. However, the P1 fix for SF-017 changed the Next.js route (`app/api/teams/[id]/chief-of-staff/route.ts:31`) to use a per-team key: `` `governance-cos-auth:${id}` ``. This means the headless mode has the same vulnerability that SF-017 identified: a brute-force attempt on one team's COS password locks out legitimate COS changes on ALL teams.
- **Evidence:**
  ```typescript
  // headless-router.ts:1588 (GLOBAL key -- not per-team)
  const rateCheck = checkRateLimit('governance-cos-auth')

  // app/api/teams/[id]/chief-of-staff/route.ts:31 (FIXED -- per-team key)
  const rateLimitKey = `governance-cos-auth:${id}`
  ```
- **Fix:** Change lines 1588, 1596, and 1600 to use `` `governance-cos-auth:${teamId}` `` to match the Next.js route behavior.

### [CC-P2-A1-002] `readRawBody` has no size limit (unlike `readJsonBody`)
- **File:** services/headless-router.ts:336-343
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** While `readJsonBody` was fixed with a 1MB size limit (SF-03), the `readRawBody` function used by the `/api/agents/import` endpoint (line 579) has no size limit. A malicious client could send an arbitrarily large request body to exhaust server memory. The import endpoint is particularly risky because it expects a file upload which could be large.
- **Evidence:**
  ```typescript
  // headless-router.ts:336-343
  async function readRawBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))  // No size check
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  }
  ```
- **Fix:** Add a size limit (e.g., 50MB for file imports) similar to the `readJsonBody` pattern, using a `totalSize` counter and `req.destroy()` when exceeded.

### [CC-P2-A1-003] `registerAgent` WorkTree branch allows non-UUID agentId to reach filesystem
- **File:** services/agents-core-service.ts:811-814
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The MF-002 fix at line 812 only validates UUID format when `body.id` is present (cloud agent path). For the WorkTree branch (line 766), `agentId` is derived from `sessionName` via regex replacement (`/[^a-zA-Z0-9_-]/g`) which produces a non-UUID string. The UUID validation guard `if (body.id && !isValidUuid(agentId))` deliberately skips validation for WorkTree agents. While the regex replacement prevents path traversal (no dots, slashes), the `path.basename()` at line 823 provides a second layer of defense. However, the guard condition `body.id && !isValidUuid(agentId)` has a subtle gap: if `body.id` is set to an empty string `""` (falsy), the UUID check is skipped but `agentId` still gets `body.id` (empty string) at line 807, and `path.basename("")` returns `""`, creating a file named `.json` in the agents directory.
- **Evidence:**
  ```typescript
  // line 807
  agentId = body.id  // Could be ""
  // line 812
  if (body.id && !isValidUuid(agentId)) {  // Skipped when body.id is ""
    return { error: 'Invalid agent ID format', status: 400 }
  }
  // line 823
  const agentFilePath = path.join(agentsDir, `${path.basename(agentId)}.json`)
  // Result: ~/.aimaestro/agents/.json
  ```
- **Fix:** Add an explicit check for empty/missing `body.id` in the cloud agent branch: `if (!body.id || !body.id.trim() || ...)`. Or validate `isValidUuid` unconditionally when `body.id` is present (even empty).


### [CC-P2-A3-001] Inconsistent optional chaining on `payload` between AgentProfile and AgentSkillEditor
- **File:** `components/marketplace/AgentSkillEditor.tsx:71`
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `AgentSkillEditor.tsx` line 71 uses `r.payload.agentId` (non-optional access) while `AgentProfile.tsx` line 60 uses `r.payload?.agentId` (optional chaining). The `GovernanceRequest` type at `types/governance-request.ts:107` declares `payload: GovernanceRequestPayload` as non-optional, so neither should crash at runtime. However, the `pendingConfigRequests` array comes from `useGovernance` state which is typed as `GovernanceRequest[]` -- the payload field is always present per the type. The inconsistency is not a runtime bug but a code style issue that creates confusion about whether payload could be undefined. Since `AgentProfile.tsx` also accesses `r.payload?.configuration?.operation` at line 304-305 (the `configuration` field IS optional per the type), the optional chaining on `payload` itself is unnecessary defensive coding, while the optional chaining on `configuration` is correct.
- **Evidence:**
  ```tsx
  // AgentSkillEditor.tsx:71 -- no optional chaining on payload
  const agentPendingConfigs = pendingConfigRequests.filter(r => r.payload.agentId === agentId)

  // AgentProfile.tsx:60 -- optional chaining on payload (unnecessary)
  const agentPendingConfigRequests = governance.pendingConfigRequests.filter(r => r.payload?.agentId === agent?.id)
  ```
- **Fix:** Make both files consistent. Since `payload` is non-optional in the type, remove the `?.` on `payload` in `AgentProfile.tsx:60` (keep `agent?.id` since `agent` can be null). Alternatively, add `?.` in `AgentSkillEditor.tsx` for defensive coding consistency.

### [CC-P2-A3-002] AgentProfile `agentPendingConfigRequests` filters against nullable `agent?.id` which could cause empty results during loading
- **File:** `components/AgentProfile.tsx:60`
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Line 60 computes `agentPendingConfigRequests` by filtering `governance.pendingConfigRequests` against `agent?.id`. However, `agent` state starts as `null` and is populated asynchronously via `useEffect`. During the loading phase (or if the fetch fails), `agent` is null so `agent?.id` is `undefined`, causing the filter to return an empty array. This is not a crash bug, but it means the `pendingConfigCount` used later in the UI will always be 0 during loading. This is mostly fine since the UI shows a loading spinner during that time, but the computation runs on every render even when `agent` is null, which is wasted work. The `useGovernance(agentId || null)` hook already uses the prop `agentId` directly, which is always available. The filter should use `agentId` (the prop) instead of `agent?.id` (the state) for consistency with what `useGovernance` uses.
- **Evidence:**
  ```tsx
  // Line 55: useGovernance uses agentId prop directly
  const governance = useGovernance(agentId || null)

  // Line 60: But this filter uses agent state (which may be null during loading)
  const agentPendingConfigRequests = governance.pendingConfigRequests.filter(r => r.payload?.agentId === agent?.id)
  ```
- **Fix:** Change `agent?.id` to `agentId` on line 60 to match the prop used by `useGovernance`:
  ```tsx
  const agentPendingConfigRequests = governance.pendingConfigRequests.filter(r => r.payload?.agentId === agentId)
  ```

### [CC-P2-A3-003] `canApprove` in AgentSkillEditor checks agentRole of the profiled agent, not the viewer
- **File:** `components/marketplace/AgentSkillEditor.tsx:75`
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Line 75 sets `canApprove = agentRole === 'manager' || agentRole === 'chief-of-staff'`. However, `agentRole` comes from `useGovernance(agentId)` which returns the role of the agent being viewed, not the current viewer/user. In Phase 1 (localhost, single user = system owner), the comment on lines 72-74 acknowledges this and says it's acceptable. This is documented as a known limitation. However, the logic is still inverted: if you're viewing a "member" agent's profile, the approve/reject buttons won't appear even though the viewer (system owner) has full access. Conversely, viewing a "manager" agent's profile would show approve/reject buttons.
- **Evidence:**
  ```tsx
  // Line 70-75
  const { pendingConfigRequests, resolveConfigRequest, agentRole } = useGovernance(agentId)
  // ...
  const canApprove = agentRole === 'manager' || agentRole === 'chief-of-staff'
  ```
  The comment says "In Phase 1 (localhost, single user), the 'viewer' IS the system owner who has full access." But that reasoning would mean `canApprove` should always be `true` in Phase 1, not dependent on the viewed agent's role.
- **Fix:** For Phase 1, change to `const canApprove = true` with a comment explaining that in Phase 1 the viewer is always the system owner. Or fetch the manager's agentId and check that instead. This is a known Phase 1 limitation but the current logic does not match the stated intent.


### [CV-P2-001] Claim: "[SF-017] per-team rate limit" -- headless COS endpoint uses GLOBAL rate limit key

- **Source:** Commit message, SHOULD-FIX section: "SF-017: per-team rate limit"
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The Next.js API route (`app/api/teams/[id]/chief-of-staff/route.ts:31`) correctly uses per-team rate limiting with `` `governance-cos-auth:${id}` ``. This was verified at line 31.
- **What's missing:** The NEW headless router COS endpoint (`services/headless-router.ts:1588`) uses a GLOBAL rate limit key `'governance-cos-auth'` instead of the per-team `` `governance-cos-auth:${teamId}` ``. This means the headless mode endpoint still has the original SF-017 bug where brute-force on Team A locks out Team B.
- **Evidence:**
  - `app/api/teams/[id]/chief-of-staff/route.ts:31`: `const rateLimitKey = \`governance-cos-auth:${id}\`` -- CORRECT
  - `services/headless-router.ts:1588`: `const rateCheck = checkRateLimit('governance-cos-auth')` -- WRONG (global key)
  - `services/headless-router.ts:1596`: `recordFailure('governance-cos-auth')` -- also uses global key
  - `services/headless-router.ts:1600`: `resetRateLimit('governance-cos-auth')` -- also uses global key
- **Impact:** SF-017 is only half-fixed. In headless mode, the rate limit is still global across all teams.

---

### [CV-P2-002] Claim: "[MF-004] Test count documentation discrepancy -- documented vitest parameterized inflation"

- **Source:** Commit message, MUST-FIX section: "MF-004: Test count documentation discrepancy -- documented vitest parameterized inflation"
- **Severity:** NIT (downgraded from MUST-FIX; the original finding was about an incorrect claim of 836 tests)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The commit message acknowledges the discrepancy exists.
- **What's missing:** The original MF-004 finding said the claim "836 tests pass" was inaccurate (actual: 628). The commit message says "documented vitest parameterized inflation" but I cannot locate where this documentation was actually added. The diff does not show any new documentation file or comment explaining the 836 vs 628 discrepancy. The fix is described as "documented" but no documentation artifact is visible in the diff.
- **Evidence:** The 1151-line diff was searched for "836", "628", "parameterized", and "inflation" -- none of these strings appear in the diff. The fix appears to be the commit message itself serving as documentation, rather than an in-code or in-repo documentation change.
- **Impact:** Low -- the discrepancy is now acknowledged in git history via the commit message, which may be sufficient. But no permanent documentation artifact exists in the codebase explaining the count difference.

---


---

## Nits & Suggestions


### [CC-P2-A2-003] GET governance requests type param not validated against known types
- **File:** app/api/v1/governance/requests/route.ts:92
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The GET handler validates the `status` query parameter against `VALID_GOVERNANCE_REQUEST_STATUSES` (line 82), but the `type` query parameter is passed through without validation. An invalid `type` value silently returns an empty array. This is not a bug (the filter logic is correct), but inconsistent with the status parameter validation pattern. The `GovernanceRequestType` enum has known values: `add-to-team`, `remove-from-team`, `assign-cos`, `remove-cos`, `transfer-agent`, `create-agent`, `delete-agent`, `configure-agent`.
- **Evidence:**
  ```typescript
  // status is validated:
  if (statusParam && !VALID_GOVERNANCE_REQUEST_STATUSES.has(statusParam)) {
    return NextResponse.json({ error: `Invalid status value...` }, { status: 400 })
  }
  // type is NOT validated:
  type: searchParams.get('type') || undefined,  // any string accepted silently
  ```
- **Fix:** Add a `VALID_GOVERNANCE_REQUEST_TYPES` set and validate the `type` param similarly to `status`.

### [CC-P2-A2-004] Chief-of-staff route does not validate cosAgentId with isValidUuid
- **File:** app/api/teams/[id]/chief-of-staff/route.ts:83-89
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `cosAgentId` is validated as a non-empty string (line 83) but not checked with `isValidUuid()` before being passed to `getAgent()`. This is not a security issue because `getAgent` does an in-memory array comparison (no file system access), and a non-UUID string would simply return null/404. However, it's inconsistent with the pattern used elsewhere in this file (team ID is validated with `isValidUuid` at line 14) and across other routes.
- **Evidence:**
  ```typescript
  // Team ID validated with isValidUuid (line 14):
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
  }

  // cosAgentId NOT validated with isValidUuid (line 83-89):
  if (typeof cosAgentId !== 'string' || !cosAgentId.trim()) {
    return NextResponse.json({ error: 'agentId must be a non-empty string or null' }, { status: 400 })
  }
  const agent = getAgent(cosAgentId)  // proceeds with any non-empty string
  ```
- **Fix:** Add `if (!isValidUuid(cosAgentId))` check before calling `getAgent(cosAgentId)`.


### [CC-P2-A0-001] Stale `withLock` docstring claims "No lock timeout"
- **File:** /Users/emanuelesabetta/ai-maestro/lib/file-lock.ts:99
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `withLock` JSDoc says "No deadlock detection or lock timeout" but `acquireLock` (which `withLock` calls at line 103) now has a 30-second default timeout added as part of the P1 fixes (NT-007). The comment is stale and contradicts the actual behavior.
- **Evidence:**
  ```typescript
  // file-lock.ts:95-101
  /**
   * Run a function under a named lock.
   * Convenience wrapper: acquires, runs fn, releases (even on error).
   *
   * Note: No deadlock detection or lock timeout.          // <-- STALE
   * Lock ordering convention: 'teams' before 'transfers' before 'governance'
   */
  ```
  But `acquireLock` at line 38 has: `timeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS` (30s).
- **Fix:** Update the `withLock` docstring to: "Note: Lock acquisition times out after 30s (DEFAULT_LOCK_TIMEOUT_MS). No deadlock detection beyond timeout."

### [CC-P2-A0-002] `withLock` lock ordering comment omits `governance-requests`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/file-lock.ts:100
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The lock ordering convention note in the `withLock` docstring (line 100) says "Lock ordering convention: 'teams' before 'transfers' before 'governance'" but omits `'governance-requests'`. The main LOCK ORDERING INVARIANT comment at line 14-19 was correctly updated in P1 to include `'governance-requests'`, but this secondary reference was not updated.
- **Evidence:**
  ```typescript
  // file-lock.ts:100
  * Lock ordering convention: 'teams' before 'transfers' before 'governance'

  // file-lock.ts:14-19 (correctly updated)
  * LOCK ORDERING INVARIANT:
  * When acquiring multiple locks, always acquire in this order:
  *   1. 'teams'
  *   2. 'transfers'
  *   3. 'governance'
  *   4. 'governance-requests'       // <-- present here but missing in line 100
  ```
- **Fix:** Update line 100 to: `Lock ordering convention: 'teams' before 'transfers' before 'governance' before 'governance-requests'`

### [CC-P2-A0-003] Missing test coverage for `type` filter in `listGovernanceRequests`
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance-request-registry.test.ts (line 272-338) and /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:104
- **Severity:** NIT
- **Category:** test-coverage
- **Confidence:** CONFIRMED
- **Description:** The P1 fix for SF-024 added `type` filtering to `listGovernanceRequests` (line 94, 104), but the test file `governance-request-registry.test.ts` has no test case for filtering by `type`. The existing tests cover `status`, `hostId`, and `agentId` filters but not `type`. The test file header (line 8) still says "listGovernanceRequests: no filter, by status, by hostId, by agentId" with no mention of `type`.
- **Evidence:**
  ```typescript
  // governance-request-registry.ts:104 (new code, untested)
  if (filter.type && r.type !== filter.type) return false

  // test file line 8 (stale)
  // * - listGovernanceRequests: no filter, by status, by hostId, by agentId
  ```
- **Fix:** Add a test case like `it('filters by type', () => { ... })` using requests with different `type` values. Update the header comment.

### [CC-P2-A0-004] Missing test coverage for `purgeOldRequests` and `expirePendingRequests`
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance-request-registry.test.ts and /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:292-337
- **Severity:** NIT
- **Category:** test-coverage
- **Confidence:** CONFIRMED
- **Description:** The test file has NO tests for `purgeOldRequests`, `expirePendingRequests`, or the shared `expirePendingRequestsInPlace` helper. The test header lists 8 functions but does not include these. The P1 fix changed `purgeOldRequests` return type from `number` to `PurgeResult` -- this new interface has zero test coverage. Note: tests may exist in another domain's test file, but this is the primary test file for this registry module and it lacks coverage.
- **Evidence:**
  ```
  $ grep -c 'purgeOldRequests\|expirePendingRequests\|PurgeResult' tests/governance-request-registry.test.ts
  0
  ```
- **Fix:** Add test cases for `purgeOldRequests` (purging old terminal-state requests, TTL expiry of pending requests, the `PurgeResult` structure) and `expirePendingRequests` (configurable TTL, no-op when no expired requests).


### [CC-P2-A1-004] `readJsonBody` can call `reject()` multiple times on oversized payloads
- **File:** services/headless-router.ts:314-320
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `totalSize > MAX_BODY_SIZE`, the handler calls `req.destroy()` and `reject()`. However, `req.destroy()` is asynchronous -- additional 'data' events may still arrive before the stream is destroyed, causing `totalSize += chunk.length` to be called again and potentially calling `reject()` a second time. While Node.js promises ignore subsequent resolve/reject calls, the additional chunks are still pushed to the `chunks` array unnecessarily.
- **Evidence:**
  ```typescript
  req.on('data', (chunk: Buffer) => {
    totalSize += chunk.length
    if (totalSize > MAX_BODY_SIZE) {
      req.destroy()
      reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }))
      return  // But more 'data' events may fire before destroy completes
    }
    chunks.push(chunk)  // Chunks still pushed after size exceeded
  })
  ```
- **Fix:** Add a `rejected` boolean flag: set it to `true` before `reject()`, and early-return at the top of the handler if `rejected === true`.

### [CC-P2-A1-005] `sendServiceResult` spreads `result.data` into error responses
- **File:** services/headless-router.ts:362-363
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** When a service returns both `error` and `data`, the error response includes the data spread into the response object: `{ error: result.error, ...(result.data || {}) }`. This could leak internal state (e.g., partial agent records) in error responses. Most services do not set both, but it is a latent issue.
- **Evidence:**
  ```typescript
  if (result.error) {
    sendJson(res, result.status || 500, { error: result.error, ...(result.data || {}) }, result.headers)
  }
  ```
- **Fix:** Only include `result.data` in error responses if explicitly intended (e.g., validation errors that return details). Consider using `{ error: result.error }` alone.

### [CC-P2-A1-006] Duplicate UUID validation regex in agents-skills-service.ts
- **File:** services/agents-skills-service.ts:252,288
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `UUID_PATTERN` regex is defined inline at both `getSkillSettings` (line 252) and `saveSkillSettings` (line 288), duplicating the pattern. The same project already has `isValidUuid` imported from `@/lib/validation` in agents-config-deploy-service.ts (line 14). Using the shared helper would reduce duplication and ensure consistency.
- **Evidence:**
  ```typescript
  // Line 252 (getSkillSettings)
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // Line 288 (saveSkillSettings)
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  ```
- **Fix:** Import `isValidUuid` from `@/lib/validation` and use it instead of inline regex.


### [CC-P2-A3-004] `governance-endpoint-auth.test.ts` does not restore `vi.stubGlobal('fetch')` in afterEach
- **File:** `tests/governance-endpoint-auth.test.ts:135-142`
- **Severity:** NIT
- **Category:** test-isolation
- **Confidence:** CONFIRMED
- **Description:** The test file uses `vi.stubGlobal('fetch', mockFetch)` in `beforeEach` but does not restore the original `fetch` in `afterEach`. Compare with `agent-config-governance-extended.test.ts` which correctly saves `originalFetch` and restores it in `afterEach`. While vitest clears mocks between test files, within a test file the stubbed global persists, which is fine since `vi.clearAllMocks()` resets mock state. However, best practice is to restore globals to avoid side effects. Since vitest runs each test file in its own worker, this is unlikely to cause real issues.
- **Evidence:**
  ```ts
  // governance-endpoint-auth.test.ts:135
  vi.stubGlobal('fetch', mockFetch)
  // No afterEach to restore

  // agent-config-governance-extended.test.ts:355,418-420
  const originalFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = originalFetch })
  ```
- **Fix:** Add `afterEach` to restore original fetch, or use `vi.unstubAllGlobals()` in afterEach.

### [CC-P2-A3-005] `uuid` mock in `agent-config-governance-extended.test.ts` returns static value
- **File:** `tests/agent-config-governance-extended.test.ts:226-228`
- **Severity:** NIT
- **Category:** test-isolation
- **Confidence:** CONFIRMED
- **Description:** The uuid mock always returns `'test-uuid-ext-001'`. This means all tests that trigger uuid generation will get the same ID. This is fine for current tests since none compare or deduplicate generated UUIDs within a single test, but if future tests need unique IDs within a test case (e.g., creating multiple entities), this mock would cause ID collisions. The `agents-core-service.test.ts` file uses a better pattern with an incrementing counter: `vi.fn(() => 'uuid-${++uuidCounter}')`.
- **Evidence:**
  ```ts
  // Static mock
  vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid-ext-001') }))

  // Better pattern (in agents-core-service.test.ts)
  mockUuid: { v4: vi.fn(() => `uuid-${++uuidCounter}`) }
  ```
- **Fix:** Consider switching to the incrementing counter pattern for robustness if more tests are added.

### [CC-P2-A3-006] `AgentProfile.tsx` save handler uses `setTimeout` to delay `setSaving(false)` on success path
- **File:** `components/AgentProfile.tsx:222`
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** On successful save, line 222 uses `setTimeout(() => setSaving(false), 500)` to keep the spinner visible for 500ms. This is a common UX pattern to prevent "flash" of loading state. However, if the component unmounts during that 500ms window (user closes profile), `setSaving(false)` will trigger a React state update on an unmounted component. In React 18 with concurrent mode, this warning was removed, but it's still unnecessary work. The error path correctly calls `setSaving(false)` immediately.
- **Evidence:**
  ```tsx
  if (response.ok) {
    setHasChanges(false)
    setTimeout(() => setSaving(false), 500) // potential update on unmounted component
  }
  ```
- **Fix:** Use a cleanup ref pattern or simply call `setSaving(false)` immediately. This is minor since React 18 no longer warns about this.


### [CV-P2-004] Headless COS endpoint inconsistency with Next.js route

- **Severity:** SHOULD-FIX
- **Files affected:** `services/headless-router.ts:1588`, `app/api/teams/[id]/chief-of-staff/route.ts:31`
- **Expected:** Both endpoints use per-team rate limit key `` `governance-cos-auth:${teamId}` ``
- **Found:** Next.js route uses per-team key (correct), headless router uses global key (incorrect)
- **Note:** This is the same issue as CV-P2-001, listed here for cross-file consistency tracking.

---


---

## Source Reports

- `epcp-correctness-P2-1acdde8b-6bc7-46c1-b852-026aa54f3d39.md`
- `epcp-correctness-P2-5af1940c-0132-4f74-b123-6c3054e49c67.md`
- `epcp-correctness-P2-7a29a4b1-12d8-4e3f-b905-3c81f72e8d10.md`
- `epcp-correctness-P2-86654a1e-f90a-42bd-9b48-d444c7db4cf5.md`
- `epcp-claims-P2-bd4a2310-22b5-4f24-a010-aa0a4560ebbf.md`
- `epcp-review-P2-52b7a4da-bf85-4f18-a619-9badf1982b6f.md`

