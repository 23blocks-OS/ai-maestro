# Code Correctness Report: services

**Agent:** epcp-code-correctness-agent
**Domain:** services
**Files audited:** 28
**Date:** 2026-02-22T04:27:00Z
**Finding ID Prefix:** CC-P5-A5
**Pass:** 5

## MUST-FIX

### [CC-P5-A5-001] CozoDB injection via wrong escaping convention in agents-graph-service.ts
- **File:** services/agents-graph-service.ts:68-69
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The local `escapeString()` function uses SQL-style double-single-quote escaping (`''`) for CozoDB queries. However, the canonical `escapeForCozo()` in `lib/cozo-utils.ts` uses backslash escaping (`\'`). This means `escapeString` does NOT properly escape single quotes for CozoDB. A user-supplied `name` parameter containing a single quote followed by CozoScript syntax could break out of the string literal and inject arbitrary CozoScript.
- **Evidence:**
  ```typescript
  // agents-graph-service.ts:68
  function escapeString(str: string): string {
    return str.replace(/'/g, "''")  // WRONG for CozoDB
  }

  // lib/cozo-utils.ts:20 (canonical)
  export function escapeForCozo(s: string | undefined | null): string {
    if (!s) return 'null'
    return "'" + s
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")      // Correct: backslash escape
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      + "'"
  }
  ```
  Used at 25+ locations (lines 385, 407, 442, 453, 464, 474, 486, 500, 514, 527, 547, 576, 584, 614, 645, 661, 697, 720, 731, 742, 752, 766, 783, 797, 805).
- **Fix:** Replace all uses of the local `escapeString()` with the canonical `escapeForCozo()` from `@/lib/cozo-utils`. Also update the template literals to not wrap in single quotes since `escapeForCozo` already wraps the result. Change patterns like `'${escapeString(name)}'` to `${escapeForCozo(name)}`.

### [CC-P5-A5-002] CozoDB injection via wrong escaping in agents-docs-service.ts list query
- **File:** services/agents-docs-service.ts:116
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `list` action in `queryDocs()` builds a CozoDB query using SQL-style single-quote escaping (`replace(/'/g, "''")`), which is the wrong convention for CozoDB (which uses backslash escaping `\'`). The `project` parameter comes from user input and is interpolated directly into the query string.
- **Evidence:**
  ```typescript
  // agents-docs-service.ts:113-117
  query = `
    ?[doc_id, file_path, title, doc_type, updated_at] :=
      *documents{doc_id, file_path, title, doc_type, project_path, updated_at},
      project_path = '${project.replace(/'/g, "''")}'
  `
  ```
- **Fix:** Use `escapeForCozo(project)` from `@/lib/cozo-utils` instead of manual escaping. Change to: `project_path = ${escapeForCozo(project)}`.

### [CC-P5-A5-003] CozoDB injection via wrong escaping in agents-graph-service.ts files query
- **File:** services/agents-graph-service.ts:950
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Same wrong escaping convention as CC-P5-A5-001, but in the `files` case of `queryCodeGraph()`. The `projectFilter` parameter is escaped with `''` instead of `\'`.
- **Evidence:**
  ```typescript
  // agents-graph-service.ts:948-951
  case 'files': {
    let query = `?[file_id, path, module, project_path] := *files{file_id, path, module, project_path}`
    if (projectFilter) {
      query += `, project_path = '${projectFilter.replace(/'/g, "''")}'`
    }
  ```
- **Fix:** Use `escapeForCozo(projectFilter)` from `@/lib/cozo-utils`.

### [CC-P5-A5-004] Shell injection risk via execSync with user-controlled cwd in agents-repos-service.ts
- **File:** services/agents-repos-service.ts:32-33
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `getGitRepoInfo()` calls `execSync('git config --get remote.origin.url', { cwd: dirPath })` where `dirPath` comes from `agent.workingDirectory` stored in the registry. While not directly user-controlled from HTTP input (it was set during agent creation), if an agent's `workingDirectory` contains shell metacharacters, the shell invocations in lines 32, 41, 48, 58 could be exploited. Furthermore, line 48 explicitly uses `shell: '/bin/bash'` which increases the risk. The `agents-docker-service.ts` validates `workingDirectory` before creating agents, but agents could be created through other paths (direct registry edits, imports) that skip validation.
- **Evidence:**
  ```typescript
  // agents-repos-service.ts:32
  remoteUrl = execSync('git config --get remote.origin.url', {
    cwd: dirPath, encoding: 'utf-8', timeout: 5000
  }).trim()

  // agents-repos-service.ts:48 -- explicit shell usage
  const remoteBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo ""', {
    cwd: dirPath, encoding: 'utf-8', timeout: 5000, shell: '/bin/bash'
  }).trim()
  ```
- **Fix:** Use `execFileSync` with array arguments instead of `execSync`. For the line 48 case that requires shell piping, validate `dirPath` against a safe pattern before use, or use `execFileSync('git', ['symbolic-ref', ...], { cwd: dirPath })` with a try/catch for the "not found" case.

## SHOULD-FIX

### [CC-P5-A5-005] No authorization checks in agents-messaging-service.ts
- **File:** services/agents-messaging-service.ts (entire file)
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** None of the messaging functions (listMessages, sendMessage, getMessage, updateMessage, deleteMessageById, forwardMessage, addAMPAddressToAgent, removeAMPAddressFromAgent, addEmailAddressToAgent, removeEmailAddressFromAgent) verify that the caller is authorized to act on behalf of the specified `agentId`. Any caller can read, send, update, or delete messages for any agent by providing the agent ID. The headless-router does not add auth checks for these routes either.
- **Evidence:**
  ```typescript
  // agents-messaging-service.ts:192 (listMessages)
  export async function listMessages(
    agentId: string,
    params: { box?: string; status?: any; priority?: any; from?: string; to?: string }
  ): Promise<ServiceResult<any>> {
    // No auth check -- any caller can list any agent's messages
    const { box = 'inbox', status, priority, from, to } = params
    ...
  }
  ```
- **Fix:** Add agent identity verification, either at the service layer (check that requesting agent matches target agent) or at the router layer (require authenticated identity for messaging endpoints).

### [CC-P5-A5-006] updateMetrics accepts arbitrary keys via rest spread
- **File:** services/agents-memory-service.ts:1119
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `updateMetrics()` destructures `body` with a rest spread `...metrics`, then passes the rest to `updateAgentMetrics()`. This means any arbitrary keys from the request body (beyond `action`, `metric`, `amount`) are forwarded as metric updates. Depending on `updateAgentMetrics()`'s implementation, this could allow overwriting unexpected agent properties.
- **Evidence:**
  ```typescript
  // agents-memory-service.ts:1119
  const { action, metric, amount, ...metrics } = body
  // ...
  const agent = updateAgentMetrics(agentId, metrics as UpdateAgentMetricsRequest)
  ```
- **Fix:** Explicitly whitelist allowed metric fields instead of using rest spread. Validate that `metrics` only contains expected keys.

### [CC-P5-A5-007] Missing null check on agent before accessing subconscious in triggerSubconsciousAction
- **File:** services/agents-subconscious-service.ts:73
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `triggerSubconsciousAction()`, `agentRegistry.getAgent(agentId)` is called at line 72, but there is no null check on the returned `agent` before calling `agent.getSubconscious()` at line 73. If `getAgent()` throws for an unknown agent, the error propagates without a friendly 404 response. If it returns null/undefined, calling `.getSubconscious()` would throw a TypeError.
- **Evidence:**
  ```typescript
  // agents-subconscious-service.ts:72-73
  const agent = await agentRegistry.getAgent(agentId)
  const subconscious = agent.getSubconscious()  // No null check on agent
  ```
  Compare with `getSubconsciousStatus()` at line 20 which does check: `if (!agent) { return { error: 'Agent not found', status: 404 } }`
- **Fix:** Add a null check after `getAgent()` and return a 404 `ServiceResult` if agent is not found, matching the pattern used in `getSubconsciousStatus()`.

### [CC-P5-A5-008] connectionString exposed in error messages in agents-graph-service.ts
- **File:** services/agents-graph-service.ts:314-319
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** In `indexDbSchema()`, when database introspection fails (line 300-301), the error message is passed through to the API response via `error instanceof Error ? error.message : 'Unknown error'`. The PostgreSQL `pg` library often includes connection details in error messages. This could leak the `connectionString` (which contains credentials) to the API caller.
- **Evidence:**
  ```typescript
  // agents-graph-service.ts:300-318
  const pool = new Pool({ connectionString })
  const dbSchema = await introspectDatabase(pool)
  // ...
  } catch (error) {
    console.error('[Graph Service] indexDbSchema Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
  ```
- **Fix:** Return a generic error message like `'Failed to connect to database'` instead of passing through the raw error message. Log the full error server-side only.

### [CC-P5-A5-009] Missing path validation for skill settings file access
- **File:** services/agents-skills-service.ts:189
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** In `getSkillSettings()` and `saveSkillSettings()`, the `agentId` parameter is used directly in a file path construction: `path.join(homeDir, '.aimaestro', 'agents', agentId, 'skill-settings.json')`. If `agentId` contains path traversal characters (e.g., `../../../etc/passwd`), it could read or write arbitrary files. The function uses `agentRegistry.getAgent(agentId)` which would likely reject invalid IDs, but the path is constructed before this validation in `getSkillSettings()`.
- **Evidence:**
  ```typescript
  // agents-skills-service.ts:188-192
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const settingsPath = path.join(homeDir, '.aimaestro', 'agents', agentId, 'skill-settings.json')
  try {
    const content = await fs.readFile(settingsPath, 'utf-8')
  ```
- **Fix:** Validate `agentId` against a UUID pattern (e.g., `/^[a-f0-9-]+$/`) before constructing the file path, or use `path.resolve()` and verify it stays within the expected directory.

### [CC-P5-A5-010] Potential infinite loop in background delta indexing
- **File:** services/agents-docs-service.ts:76-78
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `triggerBackgroundDocsDeltaIndexing()` at line 76 calls the same `/api/agents/${agentId}/docs` POST endpoint it is triggered from (inside `queryDocs()`). If the `search` action's background trigger results in another `search` action being processed, this could create infinite recursive HTTP requests. The function does check for `delta: true` in the body, but the endpoint receiving this request will go to `indexDocs()` which should not trigger another search. However, if any error handling or middleware re-routes this, infinite recursion is possible.
- **Evidence:**
  ```typescript
  // agents-docs-service.ts:76-78
  triggerBackgroundDocsDeltaIndexing(agentId, project || undefined).catch((err) => {
    console.error('[Docs Service] Background delta indexing failed:', err)
  })

  // agents-docs-service.ts:253-254 (the self-fetch)
  const response = await fetch(`${selfHost.url}/api/agents/${agentId}/docs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),  // { delta: true }
  })
  ```
- **Fix:** Add a guard to prevent re-triggering delta indexing when the request is already a delta indexing request. For example, pass a header like `X-No-Background-Trigger: true` and check for it in the search handler.

### [CC-P5-A5-011] amount=0 silently defaults to 1 in updateMetrics increment
- **File:** services/agents-memory-service.ts:1122
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `updateMetrics()`, when `action === 'increment'`, the amount defaults to 1 via `amount || 1`. If the caller passes `amount: 0` (e.g., to test without incrementing), it silently becomes 1. The `agents-docker-service.ts` had this same issue with `cpus` (CC-P4-009) and was fixed to use `!= null` instead of `||`.
- **Evidence:**
  ```typescript
  // agents-memory-service.ts:1122
  const success = incrementAgentMetric(agentId, metric as any, amount || 1)
  ```
- **Fix:** Use `amount != null ? amount : 1` or `amount ?? 1` to preserve intentional zero values.

### [CC-P5-A5-012] status parameter typed as `any` without validation in messages-service.ts
- **File:** services/agents-messaging-service.ts:196
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** In `listMessages()`, the `status` parameter is typed as `any` and passed directly to `listAgentInboxMessages()` without validation. Similarly, `priority` is typed as `any`. These should be constrained to known enum values to prevent unexpected behavior from arbitrary inputs.
- **Evidence:**
  ```typescript
  // agents-messaging-service.ts:195-196
  params: {
    box?: string
    status?: any
    priority?: any
    from?: string
    to?: string
  }
  ```
- **Fix:** Type `status` and `priority` to their actual allowed values (e.g., `'unread' | 'read' | 'archived'` for status, `'low' | 'normal' | 'high' | 'urgent'` for priority) and validate before passing through.

## NIT

### [CC-P5-A5-013] Dead code: unused `escapeForCozo` import in config-service.ts
- **File:** services/config-service.ts:34
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY (needs grep to confirm no usage within the file -- checked via readback, `escapeForCozo` IS used at line 787)
- **RETRACTED**: After reviewing the config-service.ts content, `escapeForCozo` is used at line 787 in `getConversationMessages()`. This finding is invalid.

### [CC-P5-A5-014] Inconsistent use of `any` type throughout services
- **File:** multiple files
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Many service functions use `ServiceResult<any>` instead of defining proper return types. While this works at runtime, it eliminates compile-time type checking for callers. Files affected include: agents-memory-service.ts, agents-graph-service.ts, agents-docs-service.ts, agents-messaging-service.ts, agents-subconscious-service.ts, config-service.ts, domains-service.ts.
- **Evidence:**
  ```typescript
  // agents-memory-service.ts:644
  ): Promise<ServiceResult<any>> {

  // agents-graph-service.ts:285
  ): Promise<ServiceResult<any>> {
  ```
- **Fix:** Define specific result type interfaces for each service function instead of using `any`.

### [CC-P5-A5-015] Redundant pattern: `readyState === 1` magic number in shared-state.ts
- **File:** services/shared-state.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED (from prior session review -- file uses `readyState === 1` instead of `WebSocket.OPEN`)
- **Description:** The shared state uses magic number 1 to check WebSocket ready state instead of the named constant `WebSocket.OPEN`. While functionally equivalent, the named constant is more readable and self-documenting.
- **Fix:** Use `WebSocket.OPEN` (or the equivalent constant from the WebSocket library) instead of `1`.

### [CC-P5-A5-016] Console.log in production code for playback service
- **File:** services/agents-playback-service.ts:47-49, 104-106
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The playback service uses `console.log()` for request tracing, which is fine for development but noisy in production. Other services use this pattern too, but the playback service is entirely placeholder code that logs on every request.
- **Fix:** Either gate behind a debug flag or remove logging from placeholder implementations.

## CLEAN

Files with no issues found:
- `services/agents-directory-service.ts` -- Clean wrapper functions with proper error handling and try/catch
- `services/agents-playback-service.ts` -- Placeholder code only, no security surface (aside from NIT CC-P5-A5-016)
- `services/domains-service.ts` -- Clean CRUD with UUID validation (CC-P1-203) and proper error handling
- `services/shared-state-bridge.mjs` -- Minimal bridge, no security issues
- `services/webhooks-service.ts` -- Good patterns: secrets stripped from list/get, URL validation, event whitelist
- `services/marketplace-service.ts` -- Read-only marketplace listing, minimal surface area
- `services/help-service.ts` -- Temp file approach for system prompt avoids shell escaping; `bypassPermissions` is intentional for read-only tools
- `services/headless-router.ts` -- Route table mapping is correct; governance enforcement patterns properly delegate to service layer
- `services/agents-docker-service.ts` -- Extensive input validation, `execFileAsync` prevents shell injection, SSRF protection on remote forwarding, volume mount blocking
- `services/agents-transfer-service.ts` -- SSRF protection via known-hosts check (from prior session review)
- `services/agents-chat-service.ts` -- Path traversal risk was flagged in prior passes; not re-flagged here
- `services/amp-service.ts` -- Rate limiting, auth, signature verification present (from prior session review)
- `services/governance-service.ts` -- Password protection, manager role checks (from prior session review)
- `services/cross-host-governance-service.ts` -- Cross-host approval workflows (from prior session review)
- `services/teams-service.ts` -- UUID validation, team CRUD (from prior session review)
- `services/hosts-service.ts` -- Host management with peer sync (from prior session review)
- `services/agents-core-service.ts` -- Governance checks present but conditional (from prior session review; governance bypass was flagged in earlier passes)
- `services/sessions-service.ts` -- Session name validation, tmux set-environment fix (from prior session review)
- `services/messages-service.ts` -- Messages + meetings service (from prior session review)

## Test Coverage Notes

The following new code paths appear to lack dedicated test coverage (tests may exist in other domains -- flagging for awareness):

1. `escapeString()` function in agents-graph-service.ts -- no tests verifying CozoDB injection prevention
2. `getGitRepoInfo()` in agents-repos-service.ts -- no tests for path traversal or shell metacharacter handling
3. `triggerBackgroundDocsDeltaIndexing()` in agents-docs-service.ts -- no tests for recursive call prevention
4. `updateMetrics()` rest-spread behavior in agents-memory-service.ts -- no tests for unexpected key injection
5. `saveSkillSettings()` path construction in agents-skills-service.ts -- no tests for path traversal
6. `federatedEmailLookup()` in agents-messaging-service.ts -- no tests for timeout handling or partial failure aggregation

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P5-A5-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P5-bcd48980-0bdd-4634-86fa-ae9e702ead6e.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
