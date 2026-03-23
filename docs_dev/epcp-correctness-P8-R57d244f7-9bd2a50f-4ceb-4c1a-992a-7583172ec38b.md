# Code Correctness Report: api-agents

**Agent:** epcp-code-correctness-agent
**Domain:** api-agents
**Files audited:** 42
**Date:** 2026-02-23T02:29:00Z
**Pass:** 8
**Run ID:** R57d244f7
**Finding ID Prefix:** CC-P8-A0

## MUST-FIX

### [CC-P8-A0-001] Missing try-catch in agents/[id]/route.ts — unhandled service throws crash the endpoint
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/route.ts:10-76
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The GET, PATCH, and DELETE handlers in this file have no outer try-catch. If `getAgentById()`, `updateAgentById()`, or `deleteAgentById()` throw an unexpected error (rather than returning a result with `.error`), the exception propagates uncaught to Next.js, resulting in a generic 500 with no structured JSON response. Other routes in this codebase (e.g., `chat/route.ts`, `docs/route.ts`, `export/route.ts`, `repos/route.ts`) consistently wrap their handlers in try-catch. This file is the primary CRUD endpoint for agents, making it high-traffic and high-impact.
- **Evidence:**
```typescript
// Line 10-25: GET handler — no try-catch
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
  const result = getAgentById(id)  // If this throws, unhandled
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
```
- **Fix:** Wrap each handler (GET, PATCH, DELETE) in a try-catch that returns a structured JSON 500 error, consistent with the pattern used in other routes.

### [CC-P8-A0-002] Missing try-catch in multiple graph/memory/tracking routes — service throws go unhandled
- **File:** Multiple files (see list below)
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Several route files have handlers that lack outer try-catch blocks. If the delegated service function throws (e.g., database connection failure, file system error), the exception goes unhandled. Affected files:
  - `app/api/agents/[id]/database/route.ts` — GET (line 9-24) and POST (line 30-45)
  - `app/api/agents/[id]/graph/code/route.ts` — GET (line 9-34), POST (line 40-68), DELETE (line 74-91)
  - `app/api/agents/[id]/graph/db/route.ts` — GET (line 9-31), POST (line 37-57), DELETE (line 63-80)
  - `app/api/agents/[id]/graph/query/route.ts` — GET (line 9-32)
  - `app/api/agents/[id]/hibernate/route.ts` — POST (line 9-36)
  - `app/api/agents/[id]/index-delta/route.ts` — POST (line 13-35)
  - `app/api/agents/[id]/memory/route.ts` — GET (line 9-24) and POST (line 30-50)
  - `app/api/agents/[id]/memory/consolidate/route.ts` — GET (line 13-28), POST (line 39-65), PATCH (line 75-101)
  - `app/api/agents/[id]/memory/long-term/route.ts` — GET (line 25-52), DELETE (line 61-78), PATCH (line 90-115)
  - `app/api/agents/[id]/messages/route.ts` — GET (line 9-32) and POST (line 38-58)
  - `app/api/agents/[id]/messages/[messageId]/route.ts` — all 4 handlers
  - `app/api/agents/[id]/metrics/route.ts` — GET (line 9-24) and PATCH (line 30-50)
  - `app/api/agents/[id]/search/route.ts` — GET (line 22-51) and POST (line 61-84)
  - `app/api/agents/[id]/session/route.ts` — all 4 handlers
  - `app/api/agents/[id]/tracking/route.ts` — GET (line 9-24) and POST (line 30-49)
  - `app/api/agents/[id]/wake/route.ts` — POST (line 9-45)
  - `app/api/agents/[id]/amp/addresses/[address]/route.ts` — GET, PATCH, DELETE (lines 13-77)
  - `app/api/agents/[id]/email/addresses/route.ts` — GET (line 9-25) and POST (line 31-52)
  - `app/api/agents/[id]/email/addresses/[address]/route.ts` — GET, PATCH, DELETE (lines 13-77)
  - `app/api/agents/by-name/[name]/route.ts` — GET (line 8-19)
  - `app/api/agents/unified/route.ts` — GET (line 13-26)
- **Evidence:** (representative example from `database/route.ts`)
```typescript
// Line 9-24: No try-catch
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  if (!isValidUuid(agentId)) { ... }
  const result = await getDatabaseInfo(agentId)  // If this throws, unhandled
  if (result.error) { ... }
  return NextResponse.json(result.data)
}
```
- **Fix:** Add outer try-catch to each handler that returns `{ error: 'Internal server error' }` with status 500. This is a widespread consistency issue. The routes that DO have try-catch (chat, docs, export, playback, repos, skills, subconscious, transfer, health, register, docker, import, metadata) demonstrate the intended pattern.

## SHOULD-FIX

### [CC-P8-A0-003] SSRF risk in health proxy — no URL validation before fetching
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/health/route.ts:21-25
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `/api/agents/health` POST endpoint accepts a `url` parameter and proxies a fetch to it. While it validates the URL is a non-empty string, it does not validate the URL scheme (could be `file://`), destination (could target internal services like `http://169.254.169.254/` for cloud metadata), or format (could be `javascript:` or other schemes). In Phase 1 (localhost-only), the risk is lower, but this is a classic SSRF vector.
- **Evidence:**
```typescript
// Line 19-25
const { url } = body
if (!url || typeof url !== 'string') {
  return NextResponse.json({ error: 'url is required and must be a string' }, { status: 400 })
}
const result = await proxyHealthCheck(url)  // No scheme/destination validation
```
- **Fix:** Validate that the URL starts with `http://` or `https://`, and optionally block well-known internal IP ranges (169.254.x.x, 10.x.x.x, 127.x.x.x, ::1) unless the intended use requires them. The actual fetch logic is in the service layer, but the route should reject obviously dangerous inputs.

### [CC-P8-A0-004] minScore=0 is silently treated as undefined in search route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/search/route.ts:37
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `minScore` parameter uses `parseFloat(...) || undefined`. Since `parseFloat('0')` returns `0`, which is falsy, `0 || undefined` evaluates to `undefined`. A user explicitly requesting `minScore=0` (meaning "no minimum threshold") gets `undefined` instead. Compare with the `long-term/route.ts` at line 41, which correctly handles this: `const mc = parseFloat(...); return isNaN(mc) ? 0 : Math.max(0, Math.min(1, mc))`.
- **Evidence:**
```typescript
// Line 37
minScore: searchParams.get('minScore') ? parseFloat(searchParams.get('minScore')!) || undefined : undefined,
```
- **Fix:** Use `const val = parseFloat(searchParams.get('minScore')!); return isNaN(val) ? undefined : val` to correctly pass `0` when specified.

### [CC-P8-A0-005] parseInt fallback `|| undefined` silently drops valid value 0 for limit/startTs/endTs in search route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/search/route.ts:36,40-41
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same falsy-zero pattern as CC-P8-A0-004 but for `limit`, `startTs`, and `endTs`. `parseInt('0', 10) || undefined` yields `undefined` when the caller explicitly passes `0`. For `limit=0`, this could mean "no results requested" is silently converted to `undefined` (likely a default). For `startTs=0` (Unix epoch), the timestamp is silently dropped. While `limit=0` is a degenerate case, `startTs=0` and `endTs=0` are valid Unix timestamps.
- **Evidence:**
```typescript
// Line 36
limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) || undefined : undefined,
// Line 40-41
startTs: searchParams.get('startTs') ? parseInt(searchParams.get('startTs')!, 10) || undefined : undefined,
endTs: searchParams.get('endTs') ? parseInt(searchParams.get('endTs')!, 10) || undefined : undefined,
```
- **Fix:** Use `const val = parseInt(str, 10); return isNaN(val) ? undefined : val` pattern to correctly handle `0` values.

### [CC-P8-A0-006] maxConversations=0 silently becomes undefined in consolidate route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/memory/consolidate/route.ts:53-54
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same falsy-zero pattern. `parseInt(..., 10) || undefined` treats `0` as falsy.
- **Evidence:**
```typescript
// Line 53-54
maxConversations: searchParams.get('maxConversations')
  ? parseInt(searchParams.get('maxConversations')!, 10) || undefined
  : undefined,
```
- **Fix:** Use the NaN-check pattern: `const val = parseInt(str, 10); return isNaN(val) ? undefined : val`.

### [CC-P8-A0-007] Unsafe type assertion for `box` query parameter in messages/[messageId]/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/messages/[messageId]/route.ts:24
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `box` parameter is cast to `'inbox' | 'sent'` without validation. A caller could pass `?box=drafts` or `?box=<script>`, and it would be passed through as a typed value to `getMessage()`. The service layer may or may not validate this further.
- **Evidence:**
```typescript
// Line 24
const box = (searchParams.get('box') || 'inbox') as 'inbox' | 'sent'
```
- **Fix:** Validate the value against the allowed set: `const boxParam = searchParams.get('box') || 'inbox'; if (boxParam !== 'inbox' && boxParam !== 'sent') return NextResponse.json({ error: 'Invalid box parameter' }, { status: 400 }); const box = boxParam as 'inbox' | 'sent';`

### [CC-P8-A0-008] Unsafe type assertion for `category` in long-term memory route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/memory/long-term/route.ts:38
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `category` parameter is cast to `MemoryCategory | null` without validation. Any arbitrary string gets passed to the service as if it were a valid `MemoryCategory`.
- **Evidence:**
```typescript
// Line 38
category: searchParams.get('category') as MemoryCategory | null,
```
- **Fix:** Validate against the known MemoryCategory enum values before casting.

### [CC-P8-A0-009] Unsafe type assertion for `tier` in long-term memory route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/memory/long-term/route.ts:42
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `tier` parameter is cast to `'warm' | 'long' | null` without validation.
- **Evidence:**
```typescript
// Line 42
tier: searchParams.get('tier') as 'warm' | 'long' | null,
```
- **Fix:** Validate against the allowed values before casting.

### [CC-P8-A0-010] Unsafe type assertion for `roleFilter` in search route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/search/route.ts:38
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `role` parameter is cast to `'user' | 'assistant' | 'system' | null` without validation.
- **Evidence:**
```typescript
// Line 38
roleFilter: searchParams.get('role') as 'user' | 'assistant' | 'system' | null,
```
- **Fix:** Validate against the allowed values before casting.

### [CC-P8-A0-011] Inconsistent response format — some routes wrap errors in `{ success: false, ... }`, others don't
- **File:** Multiple files
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** There is no consistent error response format across these 42 route files. Some routes return `{ error: '...' }`, while others return `{ success: false, error: '...' }`. This inconsistency makes it harder for clients to write reliable error handling. Examples:
  - `agents/[id]/route.ts` returns `{ error: '...' }` (no success field)
  - `agents/[id]/docs/route.ts` returns `{ success: false, error: '...' }` on errors
  - `agents/[id]/graph/code/route.ts` returns `{ success: false, error: '...' }`
  - `agents/[id]/memory/route.ts` returns `{ success: false, error: '...' }`
  - `agents/[id]/messages/route.ts` returns `{ error: '...' }` (no success field)
  - `agents/[id]/chat/route.ts` returns `{ success: false, error: '...' }`
  - `agents/[id]/session/route.ts` mixes both patterns (POST uses `{ error: '...' }`, PATCH uses `{ success: false, error: '...' }`)
- **Fix:** Standardize on one error response format across all agent API routes.

## NIT

### [CC-P8-A0-012] `body` typed as `any` in docs and graph/code POST handlers
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/docs/route.ts:61, /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/graph/code/route.ts:51
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `body` variable is explicitly typed as `any` in these handlers. While the actual validation happens in the service layer, using `any` suppresses type checking at the route level.
- **Evidence:**
```typescript
// docs/route.ts:61
let body: any = {}
// graph/code/route.ts:51
let body: any = {}
```
- **Fix:** Consider using `Record<string, unknown>` or a specific request type interface.

### [CC-P8-A0-013] Unused `request` parameter not prefixed with underscore in several handlers
- **File:** Multiple files
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** A few handlers accept `request` parameter but only use it for `params` extraction. Some correctly prefix unused params with `_request` while others use the param for `searchParams`. This is minor but inconsistent. For instance, `database/route.ts` POST handler accepts `request: NextRequest` (line 31) but never uses it (the body is passed via the service call with no JSON parsing needed — `initializeDatabase(agentId)` takes only the ID).
- **Evidence:**
```typescript
// database/route.ts:30-31
export async function POST(
  request: NextRequest,  // Never used — should be _request
  { params }: { params: Promise<{ id: string }> }
)
```
- **Fix:** Prefix unused parameters with `_` for clarity.

### [CC-P8-A0-014] `import` route uses `result.status || 500` fallback suggesting service may return status 0 or undefined
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/import/route.ts:34
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Only the `import/route.ts` uses `result.status || 500` fallback for error responses. All other routes trust `result.status` to always be set. Either the import service has a weaker contract, or this is an unnecessary defensive check. Minor inconsistency.
- **Evidence:**
```typescript
// Line 34
return NextResponse.json({ error: result.error }, { status: result.status || 500 })
```
- **Fix:** Standardize — either all routes should use the fallback, or the service contract should guarantee a status is always present.

## CLEAN

Files with no issues found (all following the correct pattern with try-catch, proper validation, correct typing):
- `app/api/agents/route.ts` — No issues (has try-catch, JSON guard, proper service delegation)
- `app/api/agents/[id]/amp/addresses/route.ts` — No issues (has try-catch on both GET/POST)
- `app/api/agents/[id]/chat/route.ts` — No issues (has try-catch, NaN guard, UUID validation)
- `app/api/agents/[id]/config/deploy/route.ts` — No issues (has auth, try-catch, JSON guard)
- `app/api/agents/[id]/docs/route.ts` — No issues (has try-catch on all 3 handlers)
- `app/api/agents/[id]/export/route.ts` — No issues (has try-catch, proper binary response)
- `app/api/agents/[id]/playback/route.ts` — No issues (has try-catch on both handlers)
- `app/api/agents/[id]/repos/route.ts` — No issues (has try-catch on all 3 handlers)
- `app/api/agents/[id]/skills/route.ts` — No issues (has try-catch, auth, JSON guard on all 4 handlers)
- `app/api/agents/[id]/skills/settings/route.ts` — No issues (has try-catch, auth, body validation)
- `app/api/agents/[id]/subconscious/route.ts` — No issues (has try-catch on both handlers)
- `app/api/agents/[id]/transfer/route.ts` — No issues (has try-catch, JSON guard)
- `app/api/agents/[id]/metadata/route.ts` — No issues (has try-catch, proper null checks)
- `app/api/agents/docker/create/route.ts` — No issues (has try-catch, JSON guard)
- `app/api/agents/email-index/route.ts` — No issues (straightforward delegation)
- `app/api/agents/health/route.ts` — No issues beyond CC-P8-A0-003 (SSRF, reported above)
- `app/api/agents/import/route.ts` — No issues beyond CC-P8-A0-014 (NIT, reported above)
- `app/api/agents/normalize-hosts/route.ts` — No issues (simple delegation)
- `app/api/agents/register/route.ts` — No issues (has try-catch, JSON guard)
- `app/api/agents/startup/route.ts` — No issues (simple delegation, no user input)
- `app/api/agents/directory/route.ts` — No issues
- `app/api/agents/directory/lookup/[name]/route.ts` — No issues
- `app/api/agents/directory/sync/route.ts` — No issues

## Test Coverage Notes

- No test files were observed in this domain. These 42 API route files appear to have no dedicated unit tests.
- The route handlers are thin wrappers (good design), so testing the service layer would cover most logic. However, the parameter parsing/validation logic (parseInt guards, type casts, try-catch patterns) in the routes themselves would benefit from integration tests.
- The unsafe type assertions (CC-P8-A0-007 through CC-P8-A0-010) could silently pass invalid values to services, which argues for route-level validation tests.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P8-A0-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P8-R57d244f7-9bd2a50f-4ceb-4c1a-992a-7583172ec38b.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
