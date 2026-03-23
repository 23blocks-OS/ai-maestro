# Code Correctness Report: api-agents

**Agent:** epcp-code-correctness-agent
**Domain:** api-agents
**Pass:** 9
**Run ID:** 1ebfebc5
**Finding ID Prefix:** CC-P9-A0
**Files audited:** 42
**Date:** 2026-02-23T03:10:00Z

## MUST-FIX

### [CC-P9-A0-001] Missing try-catch in directory/lookup route allows unhandled exceptions to crash
- **File:** `app/api/agents/directory/lookup/[name]/route.ts`:18
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `GET` handler does not have an outer try-catch. If `lookupAgentByDirectoryName()` throws an unhandled exception (rather than returning an error result object), the request will fail with an unhandled exception and no 500 response will be sent. Every other route in this domain wraps the handler body in try-catch; this one is missing it.
- **Evidence:**
```typescript
// line 14-24
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params          // no try-catch
  const result = lookupAgentByDirectoryName(name)
  if (result.error) {
    return NextResponse.json({ found: false }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
```
- **Fix:** Wrap the handler body in a try-catch block that returns a 500 JSON error, consistent with all other routes in this domain.

### [CC-P9-A0-002] Missing try-catch in directory GET route allows unhandled exceptions
- **File:** `app/api/agents/directory/route.ts`:14
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `GET` handler for `/api/agents/directory` lacks a try-catch. If `getDirectory()` throws, the request crashes with no JSON error response. All other routes in this domain have outer try-catch.
- **Evidence:**
```typescript
// line 14-20
export async function GET(_request: NextRequest) {
  const result = getDirectory()
  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch returning `{ error: 'Internal server error' }` with status 500.

### [CC-P9-A0-003] Missing try-catch in directory/sync POST route allows unhandled exceptions
- **File:** `app/api/agents/directory/sync/route.ts`:13
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `POST` handler for `/api/agents/directory/sync` lacks a try-catch. If `syncDirectory()` throws, the request crashes with no JSON error response.
- **Evidence:**
```typescript
// line 13-19
export async function POST(_request: NextRequest) {
  const result = await syncDirectory()
  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch returning `{ error: 'Internal server error' }` with status 500.

### [CC-P9-A0-004] Missing try-catch in startup POST and GET routes
- **File:** `app/api/agents/startup/route.ts`:10-36
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Both `POST` and `GET` handlers for `/api/agents/startup` lack try-catch. If `initializeStartup()` or `getStartupInfo()` throws, the request will crash without a JSON error response.
- **Evidence:**
```typescript
// line 10-20
export async function POST() {
  const result = await initializeStartup()
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
// line 26-36
export async function GET() {
  const result = getStartupInfo()
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch to both handlers.

### [CC-P9-A0-005] Missing try-catch in normalize-hosts GET and POST routes
- **File:** `app/api/agents/normalize-hosts/route.ts`:16-30
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Both `GET` and `POST` handlers for `/api/agents/normalize-hosts` lack try-catch. If `diagnoseHosts()` or `normalizeHosts()` throws, the request will crash.
- **Evidence:**
```typescript
// line 16-22
export async function GET() {
  const result = diagnoseHosts()
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
// line 24-30
export async function POST() {
  const result = await normalizeHosts()
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch to both handlers.

## SHOULD-FIX

### [CC-P9-A0-006] email-index GET route lacks try-catch for error resilience
- **File:** `app/api/agents/email-index/route.ts`:15-29
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `GET` handler for `/api/agents/email-index` does not have a try-catch. Unlike the directory routes (which are internal-only), this route is described as "used by external gateways to build routing tables" -- an unhandled throw here would return a non-JSON error to external consumers.
- **Evidence:**
```typescript
// line 15-29
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const result = await queryEmailIndex({ ... })
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch returning JSON 500 error.

### [CC-P9-A0-007] `address` path parameter in AMP/email address routes not validated/sanitized
- **File:** `app/api/agents/[id]/amp/addresses/[address]/route.ts`:18 and `app/api/agents/[id]/email/addresses/[address]/route.ts`:18
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `[address]` path parameter is extracted from params and passed directly to service functions without any format validation or sanitization. While the `[id]` parameter is validated as UUID, the `[address]` parameter (which could contain URL-encoded special characters) is passed through without checks. If the service layer uses it in file paths or shell commands, this could be an injection vector.
- **Evidence:**
```typescript
// amp/addresses/[address]/route.ts line 18
const { id, address } = await params
// id is validated:
if (!isValidUuid(id)) { ... }
// address is NOT validated -- passed directly:
const result = getAMPAddress(id, address)
```
- **Fix:** Add basic format validation for the `address` parameter (e.g., email format regex) before passing to service functions.

### [CC-P9-A0-008] `messageId` path parameter not validated
- **File:** `app/api/agents/[id]/messages/[messageId]/route.ts`:22,57,89,117
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `messageId` path parameter is used in GET, PATCH, DELETE, and POST handlers but is never validated. While `id` is validated as UUID, `messageId` is passed directly to service functions. If the messaging service uses `messageId` in file path construction, this could be a path traversal vector.
- **Evidence:**
```typescript
// line 22
const { id, messageId } = await params
if (!isValidUuid(id)) { ... }  // id validated
// messageId NOT validated -- passed directly to:
const result = await getMessage(id, messageId, box)
```
- **Fix:** If `messageId` should be a UUID, validate it with `isValidUuid()`. If it has a different format, add appropriate format validation.

### [CC-P9-A0-009] Inconsistent error response shapes across routes
- **File:** Multiple files
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Error responses have inconsistent shapes across routes. Some use `{ error: '...' }`, some use `{ success: false, error: '...' }`, and some use `{ success: false, status: 'failed', error: '...' }`. This makes it hard for clients to handle errors uniformly.
  - `chat/route.ts` line 31: `{ success: false, error: result.error }`
  - `route.ts` (agents root) line 32: `{ error: result.error, agents: [] }`
  - `memory/consolidate/route.ts` line 67-68: `{ success: false, status: 'failed', error: result.error }`
  - `database/route.ts` line 22: `{ error: result.error }`
  - `metadata/route.ts` line 60: `{ metadata: agent.metadata }` (success case with no `success` field)
- **Evidence:** See files listed above.
- **Fix:** Standardize error response shape. Recommend `{ error: string }` for errors and include `success` only if it was part of the original API design.

### [CC-P9-A0-010] `bm25Weight` and `semanticWeight` in search route not NaN-guarded
- **File:** `app/api/agents/[id]/search/route.ts`:56-57
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** While `limit`, `minScore`, `startTs`, and `endTs` have NaN guards (checking `Number.isNaN()` before using the parsed value), `bm25Weight` and `semanticWeight` do not. If a user passes `?bm25Weight=abc`, `parseFloat('abc')` returns `NaN`, which would be passed to the service function.
- **Evidence:**
```typescript
// line 56-57
bm25Weight: searchParams.get('bm25Weight') ? parseFloat(searchParams.get('bm25Weight')!) : undefined,
semanticWeight: searchParams.get('semanticWeight') ? parseFloat(searchParams.get('semanticWeight')!) : undefined,
```
- **Fix:** Add NaN guards consistent with the other parameters:
```typescript
bm25Weight: searchParams.get('bm25Weight')
  ? (Number.isNaN(parseFloat(searchParams.get('bm25Weight')!)) ? undefined : parseFloat(searchParams.get('bm25Weight')!))
  : undefined,
```

### [CC-P9-A0-011] `by-name` route has no input validation on the `name` parameter
- **File:** `app/api/agents/by-name/[name]/route.ts`:13
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `name` path parameter is passed directly to `lookupAgentByName()` without any validation. tmux session names should match `^[a-zA-Z0-9_-]+$` (as documented in CLAUDE.md). If the service layer uses this name for tmux commands or file operations, a crafted name could be problematic.
- **Evidence:**
```typescript
// line 13-14
const { name } = await params
const result = lookupAgentByName(name)
```
- **Fix:** Add format validation for the `name` parameter, e.g., `if (!/^[a-zA-Z0-9_-]+$/.test(name)) return 400`.

### [CC-P9-A0-012] `metadata` PATCH passes raw user JSON directly to updateAgent as metadata
- **File:** `app/api/agents/[id]/metadata/route.ts`:50-54
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The PATCH handler reads the full JSON body and passes it directly as the `metadata` property to `updateAgent()`. There is no schema validation, no depth limit, and no size limit. An attacker could send a deeply nested or very large JSON object, potentially causing DoS or storage issues.
- **Evidence:**
```typescript
// line 50-54
let metadata
try { metadata = await request.json() } catch { ... }
const agent = await updateAgent(agentId, { metadata })
```
- **Fix:** Add basic validation: check that metadata is a plain object (not an array), has reasonable depth/size, and key names are strings.

## NIT

### [CC-P9-A0-013] `_request` parameter unused but typed differently across routes
- **File:** Multiple files
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Some routes type the unused first parameter as `Request` (native) while others use `NextRequest` (Next.js). For example, `app/api/agents/[id]/route.ts` uses `Request`, while `app/api/agents/[id]/database/route.ts` uses `NextRequest`. While both work in Next.js App Router, this inconsistency could cause confusion.
- **Evidence:**
  - `[id]/route.ts` line 11: `request: Request`
  - `[id]/playback/route.ts` line 15: `request: Request`
  - `[id]/repos/route.ts` line 16: `_request: Request`
  - `[id]/database/route.ts` line 10: `_request: NextRequest`
  - `[id]/chat/route.ts` line 15: `request: NextRequest`
- **Fix:** Standardize on `NextRequest` for consistency across all routes.

### [CC-P9-A0-014] Inconsistent `dynamic` export across routes
- **File:** Multiple files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Some top-level routes export `dynamic = 'force-dynamic'` (e.g., `route.ts`, `health/route.ts`, `docker/create/route.ts`), while others do not (e.g., `startup/route.ts`, `normalize-hosts/route.ts`, `import/route.ts`). All routes that involve server-side computation or mutable state should be `force-dynamic` to prevent caching.
- **Evidence:**
  - `app/api/agents/route.ts`: `export const dynamic = 'force-dynamic'`
  - `app/api/agents/health/route.ts`: `export const dynamic = 'force-dynamic'`
  - `app/api/agents/startup/route.ts`: no dynamic export
  - `app/api/agents/normalize-hosts/route.ts`: no dynamic export
- **Fix:** Add `export const dynamic = 'force-dynamic'` to all API routes that perform dynamic operations.

### [CC-P9-A0-015] Minor: URL parsing method inconsistency
- **File:** Multiple files
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Some routes use `request.nextUrl.searchParams` (NextRequest-specific), while others use `new URL(request.url).searchParams`. Both work, but mixing them is inconsistent.
- **Evidence:**
  - `[id]/search/route.ts` line 35: `request.nextUrl.searchParams`
  - `[id]/messages/route.ts` line 19: `new URL(request.url)`
  - `[id]/messages/[messageId]/route.ts` line 27: `new URL(request.url)`
  - `[id]/repos/route.ts` line 77: `new URL(request.url)`
- **Fix:** Standardize on `request.nextUrl.searchParams` for `NextRequest` typed handlers, and `new URL(request.url)` for `Request` typed handlers.

## CLEAN

Files with no issues found:
- `app/api/agents/[id]/amp/addresses/route.ts` -- No issues (proper validation, error handling, try-catch)
- `app/api/agents/[id]/chat/route.ts` -- No issues (NaN guard, UUID validation, try-catch)
- `app/api/agents/[id]/config/deploy/route.ts` -- No issues (auth, UUID validation, JSON guard, try-catch)
- `app/api/agents/[id]/database/route.ts` -- No issues
- `app/api/agents/[id]/docs/route.ts` -- No issues (NaN guard, UUID validation, JSON parse guard)
- `app/api/agents/[id]/export/route.ts` -- No issues (filename sanitization in Content-Disposition)
- `app/api/agents/[id]/graph/code/route.ts` -- No issues
- `app/api/agents/[id]/graph/db/route.ts` -- No issues
- `app/api/agents/[id]/graph/query/route.ts` -- No issues
- `app/api/agents/[id]/hibernate/route.ts` -- No issues
- `app/api/agents/[id]/index-delta/route.ts` -- No issues (NaN guard on batchSize)
- `app/api/agents/[id]/memory/consolidate/route.ts` -- No issues (NaN guard on maxConversations)
- `app/api/agents/[id]/memory/long-term/route.ts` -- No issues (category/tier validation, NaN guard on minConfidence)
- `app/api/agents/[id]/memory/route.ts` -- No issues
- `app/api/agents/[id]/messages/route.ts` -- No issues
- `app/api/agents/[id]/metrics/route.ts` -- No issues
- `app/api/agents/[id]/playback/route.ts` -- No issues
- `app/api/agents/[id]/repos/route.ts` -- No issues
- `app/api/agents/[id]/route.ts` -- No issues (hard delete param handling is thorough)
- `app/api/agents/[id]/session/route.ts` -- No issues (409 conflict handling is well done)
- `app/api/agents/[id]/skills/route.ts` -- No issues (auth differentiation pattern is clean)
- `app/api/agents/[id]/skills/settings/route.ts` -- No issues (body.settings type guard)
- `app/api/agents/[id]/subconscious/route.ts` -- No issues
- `app/api/agents/[id]/tracking/route.ts` -- No issues
- `app/api/agents/[id]/transfer/route.ts` -- No issues
- `app/api/agents/[id]/wake/route.ts` -- No issues (case-sensitive program name preservation)
- `app/api/agents/docker/create/route.ts` -- No issues
- `app/api/agents/health/route.ts` -- No issues (SSRF protection is good)
- `app/api/agents/import/route.ts` -- No issues
- `app/api/agents/register/route.ts` -- No issues
- `app/api/agents/route.ts` -- No issues
- `app/api/agents/unified/route.ts` -- No issues (NaN guard on timeout)

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes (unhandled exceptions due to missing try-catch)
      SHOULD-FIX = security risks, inconsistent behavior, NaN propagation
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P9-A0-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P9-R1ebfebc5-f2305b62-d08d-4b94-9f6f-38901971ca1d.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (no test files exist for these API routes based on the domain scope)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
