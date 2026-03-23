# Code Correctness Report: api-routes

**Agent:** epcp-code-correctness-agent
**Domain:** api-routes
**Files audited:** 4
**Date:** 2026-02-22T17:01:00Z
**Pass:** 1
**Finding ID Prefix:** CC-P1-A3

## MUST-FIX

(none)

## SHOULD-FIX

### [CC-P1-A3-001] Missing UUID validation on `id` path parameter in config/deploy route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/config/deploy/route.ts:20
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `id` path parameter is used directly without UUID format validation. The `chief-of-staff/route.ts` (line 14) validates with `isValidUuid(id)` before proceeding, but this route does not. While `getAgent(agentId)` in the downstream service will return null for invalid IDs (preventing functional issues), the lack of early validation means malformed IDs (e.g., path traversal attempts like `../../etc`) reach the service layer unnecessarily. The service does use the ID for file path construction (`path.join(workingDir, '.claude')`), though the actual path is derived from the agent's stored `workingDirectory`, not the `id` parameter directly, so there is no actual path traversal vulnerability. Still, consistent validation is important for defense-in-depth.
- **Evidence:**
```typescript
// deploy/route.ts:20 - no validation
const { id } = await params
// ...
const result = await deployConfigToAgent(id, body.configuration || body, auth.agentId)
```
vs.
```typescript
// chief-of-staff/route.ts:14 - validated
const { id } = await params
if (!isValidUuid(id)) {
  return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
}
```
- **Fix:** Add `import { isValidUuid } from '@/lib/validation'` and validate `id` before proceeding, returning 400 for invalid format.

### [CC-P1-A3-002] Missing UUID validation on `id` path parameter in skills route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/route.ts:22,42,69,96
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P1-A3-001. All four handlers (GET, PATCH, POST, DELETE) extract `id` from params without UUID format validation. The downstream service calls `getAgent(id)` which returns null for invalid IDs, so there is no functional bug, but defense-in-depth is missing.
- **Evidence:**
```typescript
// Line 22 (GET), 42 (PATCH), 69 (POST), 96 (DELETE) - all use:
const { id } = await params
// No isValidUuid check
```
- **Fix:** Add UUID validation at the top of each handler, or factor it into a shared middleware/helper.

### [CC-P1-A3-003] Missing UUID validation on `id` path parameter in skills/settings route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/settings/route.ts:19,39
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P1-A3-001 and CC-P1-A3-002. Both GET and PUT handlers extract `id` without validation.
- **Evidence:**
```typescript
// Line 19 (GET), 39 (PUT):
const { id: agentId } = await params
// No isValidUuid check
```
- **Fix:** Add UUID validation.

### [CC-P1-A3-004] Rate limit key is global, not per-team, for COS password auth
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts:31
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The rate limit key `'governance-cos-auth'` is shared across all teams. A brute-force attempt on Team A's COS endpoint will lock out legitimate COS changes on Team B. This creates a denial-of-service vector where an attacker can lock out all COS operations by targeting any single team endpoint.
- **Evidence:**
```typescript
// Line 31 - same key regardless of team ID
const rateCheck = checkRateLimit('governance-cos-auth')
// ...
recordFailure('governance-cos-auth')     // line 41
resetRateLimit('governance-cos-auth')    // line 45
```
- **Fix:** Include the team ID in the rate limit key: `checkRateLimit(\`governance-cos-auth:${id}\`)`. This scopes rate limiting per team.

## NIT

### [CC-P1-A3-005] Inconsistent error response shape across routes
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/settings/route.ts:22,28 vs /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/route.ts:25,31
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The skills/settings route wraps errors in `{ success: false, error: ... }` while the skills route uses `{ error: ... }` (no `success` field). This inconsistency in the same API family (both under `/api/agents/:id/skills/`) can confuse clients.
- **Evidence:**
```typescript
// skills/settings/route.ts:22
return NextResponse.json({ success: false, error: result.error }, { status: result.status })

// skills/route.ts:25
return NextResponse.json({ error: result.error }, { status: result.status })
```
- **Fix:** Standardize error response shape across the skills API family.

### [CC-P1-A3-006] `body.configuration || body` fallback could mask malformed payloads
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/config/deploy/route.ts:34
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The expression `body.configuration || body` silently accepts two payload shapes. If a caller sends `{ configuration: null, operation: "add-skill" }`, the `body.configuration` is falsy so it falls through to `body` (which has no `operation` at top level -- it has `configuration: null` and `operation`... actually wait, it does have `operation` at the top level in this case). This is more of a documentation/clarity issue. The fallback is not harmful because the downstream service validates `config.operation`.
- **Evidence:**
```typescript
const result = await deployConfigToAgent(id, body.configuration || body, auth.agentId)
```
- **Fix:** Consider explicit documentation or a clear comment explaining the two accepted payload shapes: `{ configuration: { operation: ... } }` and `{ operation: ... }`.

### [CC-P1-A3-007] Unused atomic rate limit function -- non-atomic pattern used instead
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts:31-45
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The rate-limit module provides `checkAndRecordAttempt()` (NT-006) specifically to eliminate the TOCTOU window between `checkRateLimit()` and `recordFailure()`. While Node.js is single-threaded (so the TOCTOU is not exploitable in practice), using the atomic function is better practice and matches the stated intent of NT-006. The current code uses the separate check/record pattern.
- **Evidence:**
```typescript
// COS route uses separate calls:
const rateCheck = checkRateLimit('governance-cos-auth')   // line 31
// ... password check ...
recordFailure('governance-cos-auth')                       // line 41

// But rate-limit.ts provides the atomic version:
export function checkAndRecordAttempt(...) {  // line 50
  const result = checkRateLimit(...)
  if (result.allowed) { recordFailure(...) }
  return result
}
```
However, the current separate pattern is actually **correct for the COS use case**: the COS route only records failure when the password is wrong (line 41), whereas `checkAndRecordAttempt` records on every allowed attempt. The separate pattern is intentionally more precise here -- it only penalizes failed attempts, not successful ones. So this is purely a NIT about adding a clarifying comment.
- **Fix:** Add a comment on line 31 explaining why `checkAndRecordAttempt` is not used (only failures should be recorded, not all attempts). Or consider renaming `checkAndRecordAttempt` to `checkAndRecordIfAllowed` for clarity.

## CLEAN

Files with no issues beyond the above:

- `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/config/deploy/route.ts` -- Auth logic is correct. JSON parsing guarded. Error handling covers all paths. `auth.agentId` (string | undefined) correctly matches `deployedBy?: string` parameter type.
- `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/route.ts` -- All four handlers (GET/PATCH/POST/DELETE) follow consistent patterns. JSON body parsing guarded on mutating methods. Auth soft-failure (null requestingAgentId) correctly triggers Phase 1 backward compat in service. DELETE validates required `skill` query parameter.
- `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/settings/route.ts` -- GET and PUT follow service delegation pattern correctly. JSON body parsing guarded. Auth extraction correct.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts` -- UUID validation present. Password validation thorough. Rate limiting implemented. COS removal correctly captures `oldCosId` before `updateTeam` clears it. 11a safeguard (auto-reject pending requests) uses correct filter on `type`, `status`, and `requestedBy` fields matching `GovernanceRequest` interface. `TeamValidationException` caught with proper status code. Dynamic import of governance-request-registry wrapped in try/catch (graceful degradation).

## Test Coverage

- No dedicated route-level tests found for any of these four files. Test coverage relies on integration through service-level tests (if they exist).

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P1-A3-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P1-86e11eb0-e872-4e12-9d0d-2ac06f44ebf7.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
