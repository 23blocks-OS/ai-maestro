# Code Correctness Report: api-governance

**Agent:** epcp-code-correctness-agent
**Domain:** api-governance
**Pass:** 5
**Files audited:** 27
**Date:** 2026-02-22T04:22:00Z

## MUST-FIX

### [CC-P5-A0-001] Missing try/catch in POST and GET handlers for cross-host governance requests
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:56-57 and :75-80
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `POST` handler calls `submitCrossHostRequest(body)` at line 56 and `receiveCrossHostRequest(body.fromHostId, body.request)` at line 52 without a surrounding try/catch. Similarly, the `GET` handler calls `listCrossHostRequests(...)` at line 75 without a try/catch. If these service functions throw (e.g., file I/O error, JSON parse error in the service layer), the exception propagates unhandled, resulting in Next.js returning a generic 500 error without the structured `{ error: '...' }` JSON format that clients expect. All other route handlers in this domain have try/catch wrappers.
- **Evidence:**
```typescript
// POST handler - no try/catch around service calls
const result = await submitCrossHostRequest(body)
return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })

// GET handler - no try/catch around service call
const result = listCrossHostRequests({...})
return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
```
- **Fix:** Wrap the POST body (lines 17-57) and GET body (lines 65-80) in try/catch blocks that return `NextResponse.json({ error: '...' }, { status: 500 })`, matching the pattern used in `approve/route.ts` and `reject/route.ts`.

### [CC-P5-A0-002] Missing error check in exchange-peers route before accessing result.data
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/hosts/exchange-peers/route.ts:17
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `exchangePeers` service function embeds errors inside `result.data.error` rather than `result.error` (it always returns with `data` set). However, the route handler at line 17 directly passes `result.data` without checking `result.error`. While this currently works because `exchangePeers()` never returns `{ error: '...', status: 400 }` at the ServiceResult level, this is inconsistent with the ServiceResult contract used everywhere else. If the service function is refactored to use the standard pattern (returning `{ error: '...', status: 400 }` without `data`), `result.data` would be `undefined`, sending `undefined` as the JSON body, which crashes `NextResponse.json()`.
- **Evidence:**
```typescript
// exchange-peers/route.ts:17
const result = await exchangePeers(body)
return NextResponse.json(result.data, { status: result.status })
// Missing: if (result.error) { return NextResponse.json({ error: result.error }, ...) }
```
- **Fix:** Add the standard `if (result.error)` check before the success path, matching `hosts/route.ts` GET handler pattern.

## SHOULD-FIX

### [CC-P5-A0-003] Missing error check in register-peer route before accessing result.data
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/hosts/register-peer/route.ts:17
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P5-A0-002 but for `registerPeer`. The service function always returns with `data` set (embedding errors inside `data.error`), so the route works correctly today. However, it deviates from the `ServiceResult` contract and is fragile against refactoring. Classified as SHOULD-FIX because `registerPeer` is less likely to be refactored to return errors at the top level given its complex response shape.
- **Evidence:**
```typescript
// register-peer/route.ts:17
const result = await registerPeer(body)
return NextResponse.json(result.data, { status: result.status })
```
- **Fix:** Add the standard `if (result.error)` check: `if (result.error) { return NextResponse.json({ error: result.error }, { status: result.status }) }`.

### [CC-P5-A0-004] SSRF potential in hosts/health endpoint -- no destination URL validation
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/hosts/health/route.ts:12-13
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `GET /api/hosts/health?url=<hostUrl>` endpoint proxies a health check request to any user-supplied URL via `checkRemoteHealth(hostUrl)`. The service validates URL format but does not restrict destination to prevent SSRF (Server-Side Request Forgery). An attacker on the local machine could use this to scan internal networks (e.g., `http://169.254.169.254/latest/meta-data/` for cloud metadata, `http://10.0.0.1:8080/admin` for internal services). Phase 1 is localhost-only which mitigates this, but if the server is exposed remotely (Phase 2+), this becomes a high-severity vulnerability.
- **Evidence:**
```typescript
// hosts/health/route.ts
export async function GET(request: NextRequest) {
  const hostUrl = request.nextUrl.searchParams.get('url') || ''
  const result = await checkRemoteHealth(hostUrl) // No URL destination validation
```
- **Fix:** Add URL destination validation in `checkRemoteHealth()`: reject `file://`, `ftp://`, private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x), and `localhost`. Only allow `http://` and `https://` with non-private destinations. Alternatively, restrict to URLs matching configured hosts only.

### [CC-P5-A0-005] Type assertion `as UpdateTaskParams` bypasses type safety
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts:27
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The route spreads unvalidated request body into a type-asserted `UpdateTaskParams`. The `as UpdateTaskParams` cast bypasses TypeScript's type checker, allowing any JSON payload to be passed through. If the service function `updateTeamTask` trusts the type assertion and doesn't validate fields internally, malformed data could corrupt task state.
- **Evidence:**
```typescript
const result = await updateTeamTask(id, taskId, { ...body, requestingAgentId } as UpdateTaskParams)
```
- **Fix:** Either validate the body fields before casting, or ensure `updateTeamTask` performs full runtime validation of all fields (if it already does, add a comment noting that the cast is safe because the service validates).

### [CC-P5-A0-006] Type assertion `as CreateTaskParams` bypasses type safety
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts:50
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-P5-A0-005 but for `createTeamTask`. The unvalidated body is type-asserted as `CreateTaskParams`.
- **Evidence:**
```typescript
const result = await createTeamTask(id, { ...body, requestingAgentId } as CreateTaskParams)
```
- **Fix:** Same as CC-P5-A0-005 -- validate body fields or ensure the service performs runtime validation.

### [CC-P5-A0-007] `any` type annotation on hosts.find callback parameter
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:36
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `.find((h: any) => h.id === hostId)` uses an explicit `any` type annotation. Since `getHosts()` returns `Host[]` and `Host` has an `id` property, the `any` annotation is unnecessary and suppresses type checking.
- **Evidence:**
```typescript
const knownHost = hosts.find((h: any) => h.id === hostId)
```
- **Fix:** Remove the `: any` annotation: `hosts.find(h => h.id === hostId)`. The `Host` type already has the `id` field.

### [CC-P5-A0-008] hostId in error message could leak host identifiers to unauthenticated callers
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:38
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The error message includes the user-supplied `hostId` value: `Unknown host: ${hostId}`. This is an information disclosure -- it confirms to an attacker that the host ID they tried is not in the system, helping enumerate valid host IDs. The hostId comes from the request body's `fromHostId` which was validated to match the `X-Host-Id` header, but at this point we already know the host is unknown, so reflecting the ID just confirms it.
- **Evidence:**
```typescript
return NextResponse.json({ error: `Unknown host: ${hostId}` }, { status: 403 })
```
- **Fix:** Use a generic message: `{ error: 'Unknown host' }` (without echoing the ID). The same pattern is used correctly in `reject/route.ts:37` which says just `'Unknown host'`.

## NIT

### [CC-P5-A0-009] Inconsistent error response patterns across routes
- **File:** Multiple files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Three different error response patterns exist across the routes in this domain:
  1. **Pattern A** (governance/trust, governance/manager, governance/password, transfers/resolve, teams/chief-of-staff, hosts/[id]): Direct `if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })` -- clean and explicit.
  2. **Pattern B** (v1/governance/requests, v1/governance/approve, v1/governance/reject): `return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })` -- compact but harder to read and hides the error/success branching.
  3. **Pattern C** (hosts/register-peer, hosts/exchange-peers): No error check at all -- relies on error being embedded in `result.data.error`.

  This inconsistency makes maintenance error-prone. Pattern A is the clearest and most defensive.
- **Fix:** Standardize on Pattern A across all routes for consistency.

### [CC-P5-A0-010] Missing UUID validation on path parameters in several routes
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/hosts/[id]/route.ts
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Several routes accept path parameters (`id`, `docId`, `taskId`) without UUID format validation at the route level. Compare with `governance/transfers/[id]/resolve/route.ts:22` and `teams/[id]/chief-of-staff/route.ts:14` which both validate `isValidUuid(id)`. The service layer may validate internally, but defense-in-depth at the route level is more consistent.
- **Evidence:**
```typescript
// teams/[id]/route.ts - no UUID validation on 'id'
const { id } = await params
const result = getTeamById(id, requestingAgentId)
// vs chief-of-staff/route.ts which does:
if (!isValidUuid(id)) {
  return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
}
```
- **Fix:** Add `isValidUuid(id)` checks to all route handlers that accept UUID path parameters, for consistency with the established pattern.

### [CC-P5-A0-011] Missing `export const dynamic = 'force-dynamic'` on several routes that read runtime state
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** POSSIBLE
- **Description:** Some GET routes read runtime state (governance config, agent list, team list) but don't export `dynamic = 'force-dynamic'`. Next.js may attempt to statically generate or cache these responses. Other routes like `hosts/route.ts`, `hosts/[id]/route.ts`, and `hosts/identity/route.ts` correctly set `export const dynamic = 'force-dynamic'`. While Next.js typically treats routes with dynamic imports or headers access as dynamic, explicit marking is safer.
- **Evidence:**
```typescript
// governance/route.ts - reads runtime governance config, no dynamic export
export async function GET() {
  const config = loadGovernance()
  ...
}

// hosts/route.ts - correctly marks as dynamic
export const dynamic = 'force-dynamic'
```
- **Fix:** Add `export const dynamic = 'force-dynamic'` to all GET routes that read runtime state from the filesystem.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts -- No issues. Rate limiting, password verification, agent validation all correct. Handles `agentId === null` for removal correctly.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts -- No issues. Correctly separates missing-field (400) from wrong-password (401). Rate limiting on change. bcrypt 72-char limit enforced.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts -- No issues (aside from NIT CC-P5-A0-011). Cache bounded with size limit and TTL eviction. AgentId format validated.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts -- No issues. Excellent TOCTOU handling with `acquireLock('teams')`. Compensating action on save failure (SR-007). Authentication via headers prevents impersonation.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts -- No issues. Comprehensive validation: UUID format, string types, team existence, COS transfer prevention, duplicate check.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/trust/[hostId]/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/trust/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/approve/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/reject/route.ts -- No issues. Dual auth mode (local password + remote host-signature) well-implemented with timestamp freshness check.
- /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/sync/route.ts -- No issues. Both POST and GET require host authentication. Timestamp freshness validation correct (5 min window, 60s clock skew).
- /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts -- No issues. UUID validation, rate limiting, password verification, auto-type-upgrade on COS assignment all correct.
- /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts -- No issues (aside from NIT CC-P5-A0-010).
- /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts -- No issues (aside from NIT CC-P5-A0-010).
- /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts -- No issues (aside from NIT CC-P5-A0-010). CC-005 correctly strips `type` and `chiefOfStaffId` from body to prevent privilege escalation via PUT.
- /Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts -- No issues (aside from NIT CC-P5-A0-011).
- /Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/hosts/[id]/route.ts -- No issues (aside from NIT CC-P5-A0-010).
- /Users/emanuelesabetta/ai-maestro/app/api/hosts/health/route.ts -- See CC-P5-A0-004 (SSRF concern in service layer).
- /Users/emanuelesabetta/ai-maestro/app/api/hosts/identity/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/hosts/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/hosts/sync/route.ts -- No issues.

## Test Coverage Notes

- No test files were found in the audited domain. The routes are thin wrappers over service functions, so tests would ideally be at the service layer (not in scope for this domain audit).
- The transfer resolve route has the most complex logic (lock acquisition, compensating actions, multi-team mutations) and would benefit most from integration tests.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P5-A0-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P5-d47d0772-90c1-45bc-a972-3fbc8f09d84d.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
