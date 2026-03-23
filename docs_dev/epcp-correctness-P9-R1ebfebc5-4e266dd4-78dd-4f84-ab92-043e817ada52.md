# Code Correctness Report: api-other

**Agent:** epcp-code-correctness-agent
**Domain:** api-other
**Files audited:** 55
**Date:** 2026-02-23T03:12:00Z
**Pass:** 9
**Run ID:** 1ebfebc5
**Finding ID Prefix:** CC-P9-A3

## MUST-FIX

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

## SHOULD-FIX

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

## NIT

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

## CLEAN

Files with no issues found:
- app/api/config/route.ts -- No issues (clean thin wrapper)
- app/api/debug/pty/route.ts -- No issues
- app/api/docker/info/route.ts -- No issues
- app/api/domains/[id]/route.ts -- No issues
- app/api/domains/route.ts -- No issues
- app/api/export/jobs/[jobId]/route.ts -- No issues
- app/api/help/agent/route.ts -- No issues
- app/api/hosts/[id]/route.ts -- No issues (has hostname validation)
- app/api/hosts/exchange-peers/route.ts -- No issues
- app/api/hosts/identity/route.ts -- No issues
- app/api/hosts/register-peer/route.ts -- No issues
- app/api/hosts/route.ts -- No issues
- app/api/hosts/sync/route.ts -- No issues
- app/api/marketplace/skills/[id]/route.ts -- No issues
- app/api/marketplace/skills/route.ts -- No issues
- app/api/meetings/[id]/route.ts -- No issues (has UUID validation and auth)
- app/api/meetings/route.ts -- No issues
- app/api/messages/forward/route.ts -- No issues
- app/api/messages/meeting/route.ts -- No issues
- app/api/messages/route.ts -- No issues (has auth on mutating operations)
- app/api/plugin-builder/build/route.ts -- No issues
- app/api/plugin-builder/builds/[id]/route.ts -- No issues
- app/api/plugin-builder/scan-repo/route.ts -- No issues
- app/api/sessions/activity/route.ts -- No issues
- app/api/sessions/activity/update/route.ts -- No issues (has status validation)
- app/api/sessions/route.ts -- No issues
- app/api/subconscious/route.ts -- No issues
- app/api/v1/agents/me/route.ts -- No issues
- app/api/v1/agents/resolve/[address]/route.ts -- No issues
- app/api/v1/agents/route.ts -- No issues
- app/api/v1/auth/revoke-key/route.ts -- No issues
- app/api/v1/auth/rotate-key/route.ts -- No issues
- app/api/v1/auth/rotate-keys/route.ts -- No issues
- app/api/v1/federation/deliver/route.ts -- No issues (has structural validation)
- app/api/v1/messages/[id]/read/route.ts -- No issues
- app/api/v1/messages/pending/route.ts -- No issues (has NaN guard)
- app/api/v1/register/route.ts -- No issues
- app/api/v1/route/route.ts -- No issues
- app/api/v1/health/route.ts -- No issues (besides CC-P9-A3-005 noted above)
- app/api/v1/info/route.ts -- No issues (besides CC-P9-A3-005 same pattern)
- app/api/webhooks/[id]/route.ts -- No issues
- app/api/webhooks/[id]/test/route.ts -- No issues
- app/api/webhooks/route.ts -- No issues

## Test Coverage Notes

- No test files were found in this domain (all files are thin API route wrappers).
- Integration tests for these routes would ideally test: JSON parsing error handling, auth header propagation, service result error/success branching.
- The service layer (referenced by all routes) is where the actual business logic lives and should have the bulk of unit test coverage.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P9-A3-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P9-R1ebfebc5-4e266dd4-78dd-4f84-ab92-043e817ada52.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
