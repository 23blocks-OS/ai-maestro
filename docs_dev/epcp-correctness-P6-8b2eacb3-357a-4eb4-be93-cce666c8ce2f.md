# Code Correctness Report: services

**Agent:** epcp-code-correctness-agent
**Domain:** services
**Files audited:** 16
**Date:** 2026-02-22T06:20:00Z
**Scope:** Regressions introduced by Pass 5 (commit 9626e8d) only

## MUST-FIX

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

## SHOULD-FIX

No SHOULD-FIX issues found.

## NIT

No NIT issues found.

## CLEAN

Files with no Pass 5 regressions found:
- services/agents-core-service.ts -- Pass 5 async changes correct internally; governance comments (SF-058) accurate
- services/agents-memory-service.ts -- SF-027 whitelist and SF-032 nullish coalescing correct
- services/agents-messaging-service.ts -- SF-026 agent validation and SF-033 parameter validation correct
- services/agents-graph-service.ts -- escapeForCozo migration correct; SF-029 error message sanitization correct
- services/agents-docs-service.ts -- escapeForCozo migration correct; SF-031 re-entrancy guard correct with proper finally cleanup
- services/agents-repos-service.ts -- MF-011 execFileSync migration correct; path validation adequate
- services/agents-skills-service.ts -- SF-030 UUID validation correct; async await additions correct
- services/agents-subconscious-service.ts -- SF-028 null check correct (checks agent before calling getSubconscious)
- services/agents-playback-service.ts -- NT-021 console.log removal clean
- services/agents-docker-service.ts -- createAgent await added correctly
- services/amp-service.ts -- All async/await additions correct
- services/sessions-service.ts -- deleteAgentBySession and renameAgentSession await additions correct
- services/help-service.ts -- deleteAgent and createAgent await additions correct
- services/shared-state.ts -- NT-020 WS_OPEN constant clean
- services/agents-directory-service.ts -- normalizeHosts async signature correct (callers missing await, reported above)

## Root Cause Analysis

All 14 findings share a single root cause: Pass 5 (commit 9626e8d) correctly added `async/await` to service function implementations but **failed to update all callers** in two locations:

1. **services/headless-router.ts** -- 7 route handlers (CC-P6-A3-001 through CC-P6-A3-007)
2. **app/api/\*\*/route.ts** -- 7 Next.js API route handlers (CC-P6-A3-008 through CC-P6-A3-014)

The bug pattern is identical in all 14 cases: a function that previously returned `ServiceResult<T>` now returns `Promise<ServiceResult<T>>`, but the caller still accesses `.error` and `.data` directly on the Promise object (which are both `undefined`), causing:
- Error conditions to be silently swallowed (`.error` is undefined on Promise)
- Success responses to return `undefined`/`null` data
- The underlying operation (create, update, delete, register, link) to execute as a fire-and-forget with its result discarded

**Impact:** In headless mode, these 7 core agent CRUD operations are completely broken -- they all return empty 200 responses. In full (Next.js) mode, the same 7 operations are broken.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
- [x] My finding IDs use the assigned prefix: CC-P6-A3-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P6-8b2eacb3-357a-4eb4-be93-cce666c8ce2f.md
- [x] I did NOT report issues outside my assigned domain files (API routes reported because they are direct callers of the domain functions and share the same Pass 5 regression)
- [x] I noted code paths that appear to lack test coverage (the missing-await pattern would be caught by integration tests for agent CRUD)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
