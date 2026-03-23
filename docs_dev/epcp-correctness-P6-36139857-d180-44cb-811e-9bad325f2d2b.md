# Code Correctness Report: api-agents

**Agent:** epcp-code-correctness-agent
**Domain:** api-agents
**Files audited:** 48
**Date:** 2026-02-22T21:34:00Z
**Pass:** 6

## MUST-FIX

### [CC-P6-A4-001] Import route skips error check, returns undefined data on failure
- **File:** app/api/agents/import/route.ts:33
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The import route does not check `result.error` before returning. When `importAgent()` returns an error (e.g., `{ error: 'Invalid agent export: missing manifest.json', status: 400 }`), `result.data` is `undefined`. The handler returns `NextResponse.json(undefined, { status: 400 })`, which serializes as an empty response body rather than the error message. Every other route in this domain checks `result.error` first.
- **Evidence:**
```typescript
// Line 32-33 in app/api/agents/import/route.ts
const result = await importAgent(buffer, options)
return NextResponse.json(result.data, { status: result.status })
// Missing:
// if (result.error) {
//   return NextResponse.json({ error: result.error }, { status: result.status })
// }
```
- **Fix:** Add the standard error check before the success return:
```typescript
const result = await importAgent(buffer, options)
if (result.error) {
  return NextResponse.json({ error: result.error }, { status: result.status })
}
return NextResponse.json(result.data, { status: result.status })
```

## SHOULD-FIX

### [CC-P6-A4-002] Metadata PATCH returns 400 for all caught errors including internal failures
- **File:** app/api/agents/metadata/route.ts:53-55
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The PATCH handler catches all errors from `updateAgent()` and returns status 400. However, `updateAgent()` can throw for internal reasons (file I/O errors, JSON parse errors) in addition to validation errors (duplicate name). Internal server errors should return 500, not 400. Only the `"already exists"` throw from the registry (line 497 of agent-registry.ts) is truly a 400.
- **Evidence:**
```typescript
// Lines 52-56 in metadata/route.ts
} catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update metadata'
    console.error('Failed to update agent metadata:', error)
    return NextResponse.json({ error: message }, { status: 400 }) // Always 400, even for I/O errors
}
```
- **Fix:** Differentiate validation errors (400) from internal errors (500). For example, check if the error message contains "already exists" for 400, else 500. Or better, use the service layer pattern with `ServiceResult`.

### [CC-P6-A4-003] Multiple routes lack top-level try-catch for unexpected errors
- **File:** Multiple files (see list below)
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Several route handlers do not have a top-level try-catch. While the service functions internally return `ServiceResult` (not throwing), an unexpected error in `await params`, URL parsing, or an unhandled edge case would produce an uncontrolled 500 with a stack trace. Routes with try-catch consistently return sanitized error messages. Affected handlers:
  - `app/api/agents/[id]/route.ts` (GET)
  - `app/api/agents/[id]/database/route.ts` (GET, POST)
  - `app/api/agents/[id]/graph/code/route.ts` (GET, POST, DELETE)
  - `app/api/agents/[id]/graph/db/route.ts` (GET, POST, DELETE)
  - `app/api/agents/[id]/graph/query/route.ts` (GET)
  - `app/api/agents/[id]/index-delta/route.ts` (POST)
  - `app/api/agents/[id]/memory/route.ts` (GET, POST)
  - `app/api/agents/[id]/memory/long-term/route.ts` (GET, DELETE, PATCH)
  - `app/api/agents/[id]/messages/route.ts` (GET, POST)
  - `app/api/agents/[id]/messages/[messageId]/route.ts` (GET, PATCH, DELETE, POST)
  - `app/api/agents/[id]/metrics/route.ts` (GET, PATCH)
  - `app/api/agents/[id]/search/route.ts` (GET, POST - POST has inner catch for JSON but no outer)
  - `app/api/agents/[id]/tracking/route.ts` (GET, POST)
  - `app/api/agents/[id]/hibernate/route.ts` (POST)
  - `app/api/agents/[id]/wake/route.ts` (POST)
  - `app/api/agents/unified/route.ts` (GET)
- **Evidence:**
```typescript
// Example: app/api/agents/[id]/database/route.ts
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params  // could theoretically throw
  const result = await getDatabaseInfo(agentId)
  // No try-catch wrapping these calls
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
```
- **Fix:** Wrap each handler in a top-level try-catch that returns `{ error: 'Internal server error' }` with status 500 for consistency. Next.js will catch unhandled errors but returns a generic HTML error page rather than a JSON API response.

### [CC-P6-A4-004] Agent ID not validated as UUID in most routes, only in skills/config-deploy
- **File:** Multiple files
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Only `skills/route.ts`, `skills/settings/route.ts`, and `config/deploy/route.ts` validate that the `id` path parameter is a valid UUID using `isValidUuid()`. All other `[id]` routes pass the raw path parameter directly to service functions. While the service layer uses `getAgent(id)` which does a lookup by ID (not constructing file paths from it), this inconsistency means some routes silently accept malformed IDs like `../../../etc/passwd` -- the lookup will return null / "not found", but the inconsistency is a defense-in-depth gap.
- **Evidence:**
```typescript
// skills/route.ts line 24 - validates:
if (!isValidUuid(id)) {
  return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
}

// [id]/route.ts line 13 - does NOT validate:
const { id } = await params
const result = getAgentById(id)
```
- **Fix:** Add `isValidUuid(id)` check to all `[id]` routes, or add it once in a shared middleware / utility function.

### [CC-P6-A4-005] Wake route lowercases program name which may break case-sensitive executables
- **File:** app/api/agents/[id]/wake/route.ts:27
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** When parsing the optional `program` field from the request body, the code calls `.toLowerCase()` on line 27. If an agent specifies a program with mixed case (e.g., a custom script `runAgent.sh`), this would produce `runagent.sh` which would fail to execute on case-sensitive file systems (macOS with case-sensitive APFS, Linux).
- **Evidence:**
```typescript
// Line 26-28
if (typeof body.program === 'string') {
  program = body.program.toLowerCase()
}
```
- **Fix:** Remove `.toLowerCase()` unless there's a documented reason for normalization. The program name should be passed as-is.

## NIT

### [CC-P6-A4-006] Inconsistent response shape across routes
- **File:** Multiple files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Some routes include `{ success: false }` in error responses while others do not. For example, `chat/route.ts` returns `{ success: false, error: ... }`, `memory/route.ts` returns `{ success: false, error: ... }`, but `[id]/route.ts` returns `{ error: ... }` without `success`. This inconsistency can confuse API consumers. The routes at least are internally consistent (e.g., the memory routes all use `success: false` pattern), but the overall API surface is not uniform.
- **Evidence:**
```typescript
// chat/route.ts line 26:
return NextResponse.json({ success: false, error: result.error }, { status: result.status })

// [id]/route.ts line 17:
return NextResponse.json({ error: result.error }, { status: result.status })
```
- **Fix:** Standardize on one pattern for all agent API routes. Either always include `success` or never include it.

### [CC-P6-A4-007] `any` type used for body variables in several routes
- **File:** Multiple files (graph/code/route.ts:42, docs/route.ts:52, amp/addresses/route.ts:37, email/addresses/route.ts:32, messages/route.ts:38, etc.)
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple routes declare request body with `let body` (implicit `any`) or `let body: any`. While the service layer is responsible for validation, having typed request bodies at the route level (matching service expectations) would catch contract mismatches at compile time.
- **Evidence:**
```typescript
// amp/addresses/route.ts line 37:
let body
try { body = await request.json() } catch { ... }
// body is implicitly 'any'
```
- **Fix:** Use typed body declarations matching the service function parameter types, e.g., `let body: AddAMPAddressRequest`.

### [CC-P6-A4-008] Minor: graph/db GET spreads potentially undefined data into error response
- **File:** app/api/agents/[id]/graph/db/route.ts:23
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The GET handler spreads `result.data` into the error response: `{ success: false, error: result.error, ...(result.data || {}) }`. While the `|| {}` guards against undefined, mixing data and error fields in one response can be confusing. The graph/query route (line 24) has the same pattern.
- **Evidence:**
```typescript
// Line 23
return NextResponse.json({ success: false, error: result.error, ...(result.data || {}) }, { status: result.status })
```
- **Fix:** Evaluate whether clients actually need `data` alongside errors. If so, nest it under a `data` key. If not, remove the spread.

## CLEAN

Files with no issues found:
- `app/api/agents/[id]/amp/addresses/route.ts` -- No issues
- `app/api/agents/[id]/amp/addresses/[address]/route.ts` -- No issues
- `app/api/agents/[id]/chat/route.ts` -- No issues
- `app/api/agents/[id]/config/deploy/route.ts` -- No issues (good auth + UUID validation)
- `app/api/agents/[id]/docs/route.ts` -- No issues
- `app/api/agents/[id]/email/addresses/route.ts` -- No issues
- `app/api/agents/[id]/email/addresses/[address]/route.ts` -- No issues
- `app/api/agents/[id]/export/route.ts` -- No issues (filename sanitization present)
- `app/api/agents/[id]/memory/consolidate/route.ts` -- No issues
- `app/api/agents/[id]/messages/route.ts` -- No issues (noted: no try-catch, covered by CC-P6-A4-003)
- `app/api/agents/[id]/playback/route.ts` -- No issues
- `app/api/agents/[id]/repos/route.ts` -- No issues
- `app/api/agents/[id]/session/route.ts` -- No issues
- `app/api/agents/[id]/skills/route.ts` -- No issues (good auth + UUID validation)
- `app/api/agents/[id]/skills/settings/route.ts` -- No issues (good auth + UUID + body validation)
- `app/api/agents/[id]/subconscious/route.ts` -- No issues
- `app/api/agents/[id]/transfer/route.ts` -- No issues
- `app/api/agents/by-name/[name]/route.ts` -- No issues
- `app/api/agents/directory/route.ts` -- No issues
- `app/api/agents/directory/lookup/[name]/route.ts` -- No issues
- `app/api/agents/directory/sync/route.ts` -- No issues
- `app/api/agents/docker/create/route.ts` -- No issues
- `app/api/agents/email-index/route.ts` -- No issues
- `app/api/agents/health/route.ts` -- No issues (SSRF protection in service layer verified)
- `app/api/agents/normalize-hosts/route.ts` -- No issues
- `app/api/agents/register/route.ts` -- No issues
- `app/api/agents/route.ts` -- No issues
- `app/api/agents/startup/route.ts` -- No issues

## Test Coverage Notes

- No test files were identified for these API route handlers. The routes are thin wrappers delegating to service functions, so service-level tests would provide the primary coverage. However, integration tests for the route layer (verifying JSON parsing, error response shapes, status codes) are absent from this domain.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P6-A4-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P6-36139857-d180-44cb-811e-9bad325f2d2b.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
