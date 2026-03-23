# Code Correctness Report: api-routes

**Agent:** epcp-code-correctness-agent
**Domain:** api-routes
**Files audited:** 5
**Date:** 2026-02-22T17:58:00Z
**Pass:** 3
**Finding ID prefix:** CC-P3-A2

## MUST-FIX

No MUST-FIX issues found.

## SHOULD-FIX

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

## NIT

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

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/config/deploy/route.ts` -- Well-structured with proper auth, UUID validation, JSON body guard, and config extraction logic. Only a minor NIT about error detail leakage (CC-P3-A2-004).

## Test Coverage

None of these 5 route files have corresponding unit or integration tests. The project appears to rely on manual testing and the AMP test scripts for validation. The routes delegate to service layer functions which may have their own tests, but the route-level behavior (HTTP status codes, auth enforcement, parameter validation) is untested.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P3-A2-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P3-ef6c94da-c483-4d40-99cf-29a3079d1938.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report (6 total, 0 must-fix)
- [x] My return message to the orchestrator is exactly 1-2 lines
