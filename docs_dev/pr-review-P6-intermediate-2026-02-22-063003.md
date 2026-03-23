# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-22-063003
**Pass:** 6
**Reports merged:** 8
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 16 |
| **SHOULD-FIX** | 3 |
| **NIT** | 2 |
| **Total** | 27 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


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


(none)


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


(none)


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


*(none)*


(none)


No SHOULD-FIX issues found.


(none)


(none)


(none)


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


*(none)*


(none)


No NIT issues found.


(none)


(none)


(none)


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

- `epcp-correctness-P6-16497aea-d766-4db1-b4ad-bafe99a33cb3.md`
- `epcp-correctness-P6-6b9b3ffe-4725-44bf-8900-33348941d940.md`
- `epcp-correctness-P6-8b2eacb3-357a-4eb4-be93-cce666c8ce2f.md`
- `epcp-correctness-P6-a8a95ed7-b2f0-46d4-a71f-ea8f11650dd0.md`
- `epcp-correctness-P6-d3eff400-f006-4c0e-8efc-906119b2106d.md`
- `epcp-correctness-P6-d71bdbfd-b100-4da3-b886-1407a64eb337.md`
- `epcp-claims-P6-dc7e0379-240d-481d-87d4-57d30966fa5b.md`
- `epcp-review-P6-8ece3fe6-b8f4-43cb-8a52-a7716e377386.md`

