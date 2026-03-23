# Code Correctness Report: other-api-routes

**Agent:** epcp-code-correctness-agent
**Domain:** other-api-routes (non-agent-id API routes)
**Files audited:** 28
**Date:** 2026-02-26T21:30:00Z
**Run ID:** c7f26c53
**Finding ID Prefix:** CC-A1

## MUST-FIX

### [CC-A1-001] Double-decode path traversal bypass in conversations/[file]/messages route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/conversations/[file]/messages/route.ts:15-25
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The route decodes the file parameter once at line 15 to check for `../`, but then passes the still-encoded `encodedFile` to `getConversationMessages()` at line 25. The service function (`config-service.ts:787`) decodes it a second time. A double-encoded path like `%252e%252e%252f` would decode to `%2e%2e%2f` at the route level (passing the traversal check), then to `../` in the service. While the current downstream usage (CozoScript query with `escapeForCozo`) prevents actual exploitation, this is a defense-in-depth failure -- any future code path using the decoded file as a filesystem path would be vulnerable.
- **Evidence:**
  ```typescript
  // Route (line 15): decodes once, checks for ../
  const decodedFile = decodeURIComponent(encodedFile)
  if (decodedFile.includes('../') || decodedFile.includes('..\\')) { ... }

  // Route (line 25): passes ENCODED value to service
  const result = await getConversationMessages(encodedFile, agentId)

  // Service (config-service.ts:787): decodes AGAIN
  const conversationFile = decodeURIComponent(encodedFile)
  ```
- **Fix:** Pass the already-decoded `decodedFile` to the service instead of `encodedFile`, and update the service to not double-decode. Or, perform the traversal check on the service's decoded value instead.

## SHOULD-FIX

### [CC-A1-002] Missing outer try-catch in config/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/config/route.ts:5-11
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The GET handler has no try-catch wrapper. While `getSystemConfig()` internally handles its own errors, any unexpected throw (e.g., from `NextResponse.json()` serialization) would result in an uncontrolled 500 error from Next.js rather than a structured JSON error response. Every other route in this codebase has an outer try-catch; this one is inconsistent.
- **Evidence:**
  ```typescript
  export async function GET() {
    const result = getSystemConfig()
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  }
  // No try-catch wrapper
  ```
- **Fix:** Wrap in try-catch with `{ error: 'Internal server error' }, { status: 500 }` fallback, consistent with all other routes.

### [CC-A1-003] Missing outer try-catch in conversations/[file]/messages/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/conversations/[file]/messages/route.ts:8-35
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The GET handler has no try-catch wrapper. `decodeURIComponent()` at line 15 can throw `URIError` on malformed percent-encoded sequences (e.g., `%zz`). The async `getConversationMessages()` call could also throw unexpectedly. Both would produce uncontrolled 500 errors.
- **Evidence:**
  ```typescript
  export async function GET(request: NextRequest, { params }: ...) {
    const { file: encodedFile } = await params
    const decodedFile = decodeURIComponent(encodedFile) // can throw URIError
    // ... no try-catch wrapper
  }
  ```
- **Fix:** Wrap the entire handler body in try-catch, consistent with all other route handlers in the codebase.

### [CC-A1-004] Missing outer try-catch in domains/[id]/route.ts (GET, PATCH, DELETE)
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/domains/[id]/route.ts:8-57
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** None of the three handlers (GET, PATCH, DELETE) have outer try-catch wrappers. While the service functions have internal try-catches, the PATCH handler's `await request.json()` try-catch does not cover the `await params` or the service call. GET and DELETE have no error handling at all for unexpected throws.
- **Evidence:**
  ```typescript
  export async function GET(_request: Request, { params }: ...) {
    const { id } = await params  // could throw
    const result = getDomainById(id)
    // no try-catch
  }
  ```
- **Fix:** Add outer try-catch to all three handlers.

### [CC-A1-005] Missing outer try-catch in domains/route.ts (GET and POST)
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/domains/route.ts:8-32
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** GET handler has no try-catch at all. POST handler has try-catch for JSON parsing but not around the service call `createNewDomain(body)`. If the service throws unexpectedly, Next.js returns an uncontrolled error.
- **Evidence:**
  ```typescript
  export async function GET() {
    const result = listAllDomains() // no try-catch wrapper
    // ...
  }
  ```
- **Fix:** Add outer try-catch wrappers to both handlers.

### [CC-A1-006] Missing outer try-catch in export/jobs/[jobId]/route.ts (GET and DELETE)
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/export/jobs/[jobId]/route.ts:8-46
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Neither GET nor DELETE has an outer try-catch. While the service functions are currently placeholder implementations unlikely to throw, this is inconsistent with the codebase pattern and will become a real issue when real implementations replace the placeholders.
- **Evidence:**
  ```typescript
  export async function GET(request: Request, { params }: ...) {
    const { jobId } = await params
    const result = getExportJobStatus(jobId)
    // no try-catch
  }
  ```
- **Fix:** Add outer try-catch to both handlers for consistency and forward safety.

### [CC-A1-007] Inconsistent `||` vs `??` for auth.status fallback in transfers/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:60
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The POST handler uses `auth.status || 401` while the resolve route at `transfers/[id]/resolve/route.ts:33` uses `auth.status ?? 401`. With `||`, a status of `0` would be replaced by `401`. While `0` is not a realistic HTTP status, `??` is the correct operator for "use default only when null/undefined" and was already applied in the sibling route. This was likely missed during a previous fix pass.
- **Evidence:**
  ```typescript
  // transfers/route.ts:60
  return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })

  // transfers/[id]/resolve/route.ts:33 (already fixed)
  return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 })
  ```
- **Fix:** Change `auth.status || 401` to `auth.status ?? 401` on line 60 of transfers/route.ts.

### [CC-A1-008] SSRF: health proxy endpoint allows requests to internal/cloud metadata URLs
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/health/route.ts:25-32
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The health proxy validates the URL scheme (http/https only, preventing `file://` etc.), but does not restrict the hostname. An attacker with localhost access could use this endpoint to probe internal services (e.g., `http://169.254.169.254/latest/meta-data/` on cloud instances, or `http://127.0.0.1:OTHER_PORT/internal-api`). While Phase 1 is localhost-only, this endpoint could become an SSRF vector if the application is ever exposed to a network.
- **Evidence:**
  ```typescript
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 })
  }
  // No hostname restriction -- 169.254.x.x, 127.0.0.1, 10.x.x.x all allowed
  ```
- **Fix:** Add a hostname allowlist or blocklist. At minimum, block RFC 1918 private ranges, link-local (169.254.x.x), and loopback (127.x.x.x) unless explicitly intended. Alternatively, restrict to known Tailscale/peer host addresses from `hosts.json`.

## NIT

### [CC-A1-009] Unused `request` parameter not prefixed with underscore in export/jobs/[jobId]/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/export/jobs/[jobId]/route.ts:9,31
- **Severity:** NIT
- **Category:** convention
- **Confidence:** CONFIRMED
- **Description:** Both GET and DELETE handlers declare `request: Request` as a parameter but never use it. The codebase convention is to prefix unused parameters with `_` (e.g., `_request: Request`), as seen in `domains/[id]/route.ts` and `by-name/[name]/route.ts`.
- **Evidence:**
  ```typescript
  export async function GET(
    request: Request,  // should be _request
    { params }: { params: Promise<{ jobId: string }> }
  ) {
  ```
- **Fix:** Rename to `_request: Request` for consistency with codebase conventions.

### [CC-A1-010] Redundant null check for fromTeam/toTeam at resolve/route.ts:114 and :142
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:114,142
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** At line 114, there's a null check `if (!fromTeam || !toTeam)` inside a block that is only reached when `toTeam` is already confirmed non-null (line 102 returns 404 if `!toTeam`), and `fromTeam` is confirmed non-null (line 84 returns 404 if `!fromTeam`). Similarly at line 142, both fromTeam and toTeam have already been validated as non-null earlier in the function. The checks were added as "SF-056: Explicit null checks instead of non-null assertions" but they are unreachable dead code since earlier guards already return.
- **Evidence:**
  ```typescript
  // Line 84: fromTeam guaranteed non-null after this
  if (!fromTeam) {
    return NextResponse.json({ error: 'Source team not found' }, { status: 404 })
  }
  // Line 102: toTeam guaranteed non-null in approve branch
  if (!toTeam) {
    return NextResponse.json({ error: 'Destination team...' }, { status: 404 })
  }
  // Line 114: REDUNDANT -- both already proven non-null
  if (!fromTeam || !toTeam) {
    return NextResponse.json(...)
  }
  ```
- **Fix:** These checks are harmless defense-in-depth. Optionally, remove them and use TypeScript narrowing to prove the types, or leave them with a comment acknowledging they are defensive.

### [CC-A1-011] Missing `dynamic = 'force-dynamic'` on several mutable routes
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/domains/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/domains/[id]/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/conversations/[file]/messages/route.ts, /Users/emanuelesabetta/ai-maestro/app/api/export/jobs/[jobId]/route.ts
- **Severity:** NIT
- **Category:** convention
- **Confidence:** LIKELY
- **Description:** Several routes that serve dynamic data (domains CRUD, conversation messages, export job status) do not export `dynamic = 'force-dynamic'`. While Next.js App Router typically treats routes with dynamic segments as dynamic, explicit marking is the codebase convention (seen in `agents/health/route.ts`, `agents/startup/route.ts`, `governance/*.ts`, etc.). Without it, Next.js could potentially cache these responses in certain deployment configurations.
- **Fix:** Add `export const dynamic = 'force-dynamic'` to these route files for consistency.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/app/api/agents/by-name/[name]/route.ts -- No issues. Clean validation, try-catch, proper service delegation.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/directory/lookup/[name]/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/directory/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/directory/sync/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/docker/create/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/email-index/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/import/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/normalize-hosts/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/register/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/startup/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/unified/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/conversations/parse/route.ts -- No issues. Good JSON guard, path validation in service.
- /Users/emanuelesabetta/ai-maestro/app/api/debug/pty/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/docker/info/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts -- No issues. Rate limiting, password verification, proper auth flow.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/trust/[hostId]/route.ts -- No issues. Good hostId validation regex.
- /Users/emanuelesabetta/ai-maestro/app/api/governance/trust/route.ts -- No issues.
- /Users/emanuelesabetta/ai-maestro/app/api/agents/health/route.ts -- SSRF issue noted above (CC-A1-008), otherwise clean.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-A1-001, -002, ...
- [x] My report file uses the path: epcp-correctness-P10-Rc7f26c53-A1.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (no dedicated test files found for any of these routes)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report (11 total)
- [x] My return message to the orchestrator is exactly 1-2 lines
