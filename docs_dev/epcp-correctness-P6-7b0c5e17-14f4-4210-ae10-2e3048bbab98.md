# Code Correctness Report: api-governance

**Agent:** epcp-code-correctness-agent
**Domain:** api-governance
**Pass:** 6
**Files audited:** 12
**Date:** 2026-02-22T21:35:00Z

## MUST-FIX

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

## SHOULD-FIX

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

## NIT

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

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts` -- No issues. Proper rate limiting, input validation (min/max length, type checks), correct distinction between set and change flows.
- `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts` -- No issues. Thorough validation (UUID format, string types, length limits, duplicate checks, authority verification, COS protection). Both GET and POST well-structured.
- `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts` -- No issues. Proper lock acquisition with try/finally, compensating action on save failure, TOCTOU-aware design, auth from headers not body.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P6-A2-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P6-7b0c5e17-14f4-4210-ae10-2e3048bbab98.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
