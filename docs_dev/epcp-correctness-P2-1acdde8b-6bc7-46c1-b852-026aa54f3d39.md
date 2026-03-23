# Code Correctness Report: api-routes

**Agent:** epcp-code-correctness-agent
**Domain:** api-routes
**Files audited:** 5
**Date:** 2026-02-22T17:36:00Z
**Pass:** 2 (verifying P1 fixes + checking for new issues)

## MUST-FIX

_None found._

## SHOULD-FIX

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

## NIT

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

## CLEAN

Files with no issues found:
- `app/api/agents/[id]/skills/route.ts` -- No issues. All 4 HTTP methods have proper UUID validation, JSON body guards, auth handling, and error wrapping. Function signatures match service layer contracts.
- `app/api/agents/[id]/skills/settings/route.ts` -- No issues. Both GET and PUT have proper UUID validation, JSON body guard on PUT, and error handling. Service function signatures match.

## P1 Fix Verification

All files show evidence of P1 fixes being correctly applied:
- UUID validation with `isValidUuid()` present on all path parameters
- JSON body parsing guarded with try/catch on all POST/PUT/PATCH handlers
- Auth patterns using `authenticateAgent` properly (except the 403 hardcode in deploy/route.ts noted above)
- `ServiceResult` pattern correctly used across all routes
- Rate limiting properly implemented in chief-of-staff route with separate check/record pattern

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P2-A2-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P2-1acdde8b-6bc7-46c1-b852-026aa54f3d39.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (the remote receive try/catch gap is not tested)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
