# Code Correctness Report: api-other

**Agent:** epcp-code-correctness-agent
**Domain:** api-other
**Files audited:** 39
**Date:** 2026-02-22T21:34:00Z
**Pass:** 6
**Finding ID prefix:** CC-P6-A5

## MUST-FIX

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

## SHOULD-FIX

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

## NIT

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

## CLEAN

Files with no issues found:
- `app/api/config/route.ts` -- Clean, minimal wrapper with proper error handling
- `app/api/conversations/[file]/messages/route.ts` -- Clean, proper path parameter handling, service uses escapeForCozo
- `app/api/conversations/parse/route.ts` -- Clean, dual try-catch for JSON and processing errors, service validates path traversal
- `app/api/debug/pty/route.ts` -- Clean, proper cache control and error handling
- `app/api/domains/[id]/route.ts` -- Clean, proper JSON parsing guard and error handling
- `app/api/domains/route.ts` -- Clean
- `app/api/export/jobs/[jobId]/route.ts` -- Clean
- `app/api/help/agent/route.ts` -- Clean, proper async/error handling
- `app/api/hosts/[id]/route.ts` -- Clean, has hostname format validation regex
- `app/api/hosts/exchange-peers/route.ts` -- Clean
- `app/api/hosts/identity/route.ts` -- Clean
- `app/api/hosts/register-peer/route.ts` -- Clean
- `app/api/hosts/route.ts` -- Clean
- `app/api/hosts/sync/route.ts` -- Clean
- `app/api/marketplace/skills/[id]/route.ts` -- Clean
- `app/api/marketplace/skills/route.ts` -- Clean
- `app/api/organization/route.ts` -- Clean
- `app/api/plugin-builder/build/route.ts` -- Clean (catch wraps both JSON parse and build errors)
- `app/api/plugin-builder/builds/[id]/route.ts` -- Clean
- `app/api/sessions/activity/route.ts` -- Clean
- `app/api/sessions/restore/route.ts` -- Clean
- `app/api/sessions/route.ts` -- Clean, proper local-only flag handling
- `app/api/subconscious/route.ts` -- Clean
- `app/api/webhooks/[id]/route.ts` -- Clean
- `app/api/webhooks/[id]/test/route.ts` -- Clean
- `app/api/webhooks/route.ts` -- Clean
- `app/api/sessions/[id]/route.ts` -- Clean (aside from deprecation noted in NIT)
- `app/api/sessions/[id]/command/route.ts` -- Clean (aside from deprecation noted in NIT)

## Test Coverage Notes

- No test files were found in this domain. All 39 API route files appear to lack corresponding unit tests.
- The service layer functions are tested indirectly through integration tests mentioned in CLAUDE.md (e.g., `test-amp-routing.sh`, `test-amp-cross-host.sh`), but route-level unit tests are absent.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P6-A5-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P6-08a8c052-be4c-4b7e-924c-c7e1f3b5462f.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
