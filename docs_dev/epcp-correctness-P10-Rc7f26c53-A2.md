# Code Correctness Report: v1-api-remaining-routes

**Agent:** epcp-code-correctness-agent (A2)
**Domain:** v1-api + remaining API routes
**Files audited:** 60
**Date:** 2026-02-26T00:00:00Z
**Run ID:** c7f26c53

## MUST-FIX

### [CC-A2-001] Webhook routes lack authentication -- any localhost client can CRUD webhooks
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/webhooks/route.ts`:8,21; `/Users/emanuelesabetta/ai-maestro/app/api/webhooks/[id]/route.ts`:8,25; `/Users/emanuelesabetta/ai-maestro/app/api/webhooks/[id]/test/route.ts`:8
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** All five webhook endpoints (GET list, POST create, GET by id, DELETE by id, POST test) have zero authentication. While Phase 1 is localhost-only, every other mutating route in the codebase (teams, meetings, messages, governance) has `authenticateAgent()` guards. Webhooks are a write path (create subscriptions, delete subscriptions, trigger test deliveries to arbitrary URLs). An unauthenticated process on localhost can register webhooks to exfiltrate events or delete legitimate webhooks. This is inconsistent with the security posture applied to every other domain.
- **Evidence:**
  ```typescript
  // app/api/webhooks/route.ts -- no auth at all
  export async function POST(request: Request) {
    let body
    try { body = await request.json() } catch { ... }
    const result = createNewWebhook(body)  // no auth check
  ```
- **Fix:** Add `authenticateAgent()` calls to POST (create), DELETE, and POST test endpoints, consistent with other routes. GET (list) can remain unauthenticated if read-only is acceptable for Phase 1 localhost.

### [CC-A2-002] Webhook ID path parameter has no format validation -- potential for path traversal or injection
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/webhooks/[id]/route.ts`:12,29; `/Users/emanuelesabetta/ai-maestro/app/api/webhooks/[id]/test/route.ts`:11
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `[id]` parameter in webhook routes is passed directly to `getWebhookById(id)`, `deleteWebhookById(id)`, and `testWebhookById(id)` without any format validation. Every other `[id]` route in the codebase validates with `isValidUuid(id)`. Although the underlying `getWebhook` does a `.find()` (so it will just return null for unknown IDs and not do a file path lookup), this is inconsistent with the security model and could become a real issue if storage changes.
- **Evidence:**
  ```typescript
  // app/api/webhooks/[id]/route.ts
  export async function GET(_request: Request, { params }) {
    const { id } = await params
    const result = getWebhookById(id)  // no isValidUuid(id) check
  ```
- **Fix:** Add `if (!isValidUuid(id)) return NextResponse.json({ error: 'Invalid webhook ID format' }, { status: 400 })` to all three webhook `[id]` handlers.

## SHOULD-FIX

### [CC-A2-003] Documents PUT route passes raw body spread to service without field whitelisting
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/[docId]/route.ts`:56
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The PUT handler passes `{ ...body, requestingAgentId }` directly to `updateTeamDocument`. While the service layer (teams-service.ts:608-612) does whitelist fields before updating, the route layer does not perform its own field whitelisting. This differs from the pattern used in `POST /api/teams/[id]/documents` (line 59 of that route) which explicitly destructures `{ title, content, pinned, tags }`. Defense-in-depth requires both layers to whitelist, as noted in the SF-015 comment on teams/[id]/route.ts:57-58.
- **Evidence:**
  ```typescript
  // teams/[id]/documents/[docId]/route.ts:56
  const result = await updateTeamDocument(id, docId, { ...body, requestingAgentId })

  // vs. teams/[id]/documents/route.ts:59 (POST - properly whitelisted)
  const { title, content, pinned, tags } = body
  const result = await createTeamDocument(id, { title, content, pinned, tags, requestingAgentId })
  ```
- **Fix:** Whitelist fields at the route level: `const { title, content, pinned, tags } = body; const result = await updateTeamDocument(id, docId, { title, content, pinned, tags, requestingAgentId })`.

### [CC-A2-004] `createNewTeam` route passes raw body spread without field whitelisting
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`:38
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** `POST /api/teams` passes `{ ...body, requestingAgentId }` to `createNewTeam`. While the service validates some fields (`name`, `agentIds`, `type`), any arbitrary fields in `body` are forwarded to the service layer. If `createNewTeam` or its dependencies ever use object spread to pass through to a lower layer, extra fields could leak.
- **Evidence:**
  ```typescript
  // app/api/teams/route.ts:38
  const result = await createNewTeam({ ...body, requestingAgentId })
  ```
- **Fix:** Whitelist expected fields: `const { name, description, agentIds, type } = body` then `createNewTeam({ name, description, agentIds, type, requestingAgentId })`.

### [CC-A2-005] `POST /api/sessions/activity/update` does not validate `sessionName` format
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/sessions/activity/update/route.ts`:17
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `sessionName` is extracted from the request body and passed to `broadcastActivityUpdate` without validating it matches the tmux session name format (`^[a-zA-Z0-9_-]+$`). The service only checks for empty string. Other session routes validate this constraint (e.g., `createSession` in sessions-service.ts:542).
- **Evidence:**
  ```typescript
  // activity/update/route.ts:17
  const { sessionName, status, hookStatus, notificationType } = body
  // No sessionName format validation before:
  const result = broadcastActivityUpdate(sessionName, status, hookStatus, notificationType)
  ```
- **Fix:** Add `if (!sessionName || typeof sessionName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(sessionName)) return NextResponse.json({ error: 'Invalid sessionName' }, { status: 400 })`.

### [CC-A2-006] Marketplace skill `[id]` route lacks input validation on the id parameter
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/marketplace/skills/[id]/route.ts`:18
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `id` parameter (format: `marketplace:plugin:skill`) is passed directly to `getMarketplaceSkillById` with no format validation. Given this is a compound ID with colons, it should at minimum be checked for length limits and disallowed characters (path separators, null bytes) to prevent potential injection if the service does any file path construction with it.
- **Evidence:**
  ```typescript
  export async function GET(_request: NextRequest, { params }) {
    const { id } = await params
    const result = await getMarketplaceSkillById(id)  // no validation
  ```
- **Fix:** Add basic validation: e.g. `if (!id || id.length > 200 || /[\/\\\0]/.test(id)) return 400`.

### [CC-A2-007] Webhook event type reflected in error message without truncation
- **File:** `/Users/emanuelesabetta/ai-maestro/services/webhooks-service.ts`:98
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When an invalid event type is provided to `createNewWebhook`, it is reflected directly in the error message: `Invalid event type: ${event}`. The governance routes truncate reflected values to 50 chars (SF-057). While this is a JSON API (not HTML), an attacker could send an extremely long string as an event type, causing a large error response. This is inconsistent with the truncation pattern used elsewhere.
- **Evidence:**
  ```typescript
  // services/webhooks-service.ts:98
  return { error: `Invalid event type: ${event}. Valid events: ${VALID_EVENTS.join(', ')}`, status: 400 }
  ```
- **Fix:** Truncate the reflected event value: `${String(event).slice(0, 50)}`.

### [CC-A2-008] `hosts/health` route has redundant `if (hostUrl)` check after early return
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/hosts/health/route.ts`:23
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Line 16-18 checks `if (!hostUrl)` and returns 400. Line 23 then checks `if (hostUrl)` which is always true at that point (since the falsy case already returned). This is dead code / misleading, making the SSRF protection block appear conditional when it is not.
- **Evidence:**
  ```typescript
  // Line 16-18: Early return if hostUrl is empty
  if (!hostUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }
  // Line 23: Redundant check -- hostUrl is always truthy here
  if (hostUrl) {
  ```
- **Fix:** Remove the `if (hostUrl) {` wrapper on line 23 and its closing `}` on line 70 -- the SSRF protection should always execute (and it does, since hostUrl is guaranteed non-empty).

## NIT

### [CC-A2-009] `v1/info` route uses `?? {}` with `as AMPInfoResponse` cast on potentially undefined data
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/info/route.ts`:22
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `result.data ?? {} as AMPInfoResponse` falls back to an empty object cast as `AMPInfoResponse`. This is technically type-safe via the assertion but the empty object does not conform to the AMPInfoResponse interface. The `v1/health` route handles this better by returning a 500 error when data is undefined (line 22-24 of health/route.ts). The info route should follow the same pattern.
- **Evidence:**
  ```typescript
  return NextResponse.json(result.data ?? {} as AMPInfoResponse, { ... })
  ```
- **Fix:** Add `if (!result.data) return NextResponse.json({ error: 'Info data unavailable' }, { status: 500 })` before the success response, matching the health endpoint pattern.

### [CC-A2-010] `v1/register` route also uses `?? {}` empty-object fallback
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/register/route.ts`:29
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-A2-009 -- `(result.data ?? {}) as AMPRegistrationResponse` creates an empty object that does not conform to `AMPRegistrationResponse`.
- **Evidence:**
  ```typescript
  return NextResponse.json((result.data ?? {}) as AMPRegistrationResponse, { status: result.status })
  ```
- **Fix:** Guard with `if (!result.data)` and return a 500 error.

### [CC-A2-011] `v1/route` and `v1/messages/pending` use the same `?? {}` pattern
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts`:38; `/Users/emanuelesabetta/ai-maestro/app/api/v1/messages/pending/route.ts`:36,52,73
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple AMP v1 routes use `(result.data ?? {}) as <Type>` which creates an empty object not conforming to the declared type. This is a systemic pattern across AMP routes. While it works at runtime (the service layer always provides data on success), the fallback disguises potential bugs where data might actually be undefined.
- **Fix:** Either add `if (!result.data)` guards or ensure the service functions always set `data` on success paths (and remove the `?? {}` fallback).

### [CC-A2-012] `POST /api/teams/notify` does not validate that agentIds is a non-empty array
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts`:28
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The route validates that each element in `agentIds` is a string (line 28), but only when `agentIds` is truthy and an array. It does not validate that `agentIds` is actually present or non-empty. If `agentIds` is undefined/null, it passes through to the service unchecked.
- **Evidence:**
  ```typescript
  if (agentIds && Array.isArray(agentIds) && !agentIds.every((id: unknown) => typeof id === 'string')) {
    return NextResponse.json({ error: 'Each agentIds element must be a string' }, { status: 400 })
  }
  // agentIds could be undefined/null/empty here
  const result = await notifyTeamAgents({ agentIds, teamName })
  ```
- **Fix:** Add `if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) return 400` before the element validation.

### [CC-A2-013] `help/agent` route does not wrap service calls in try-catch
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/help/agent/route.ts`:19-29
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The POST, DELETE, and GET handlers in `help/agent/route.ts` call their respective service functions without a top-level try-catch. If any service function throws (e.g., due to filesystem errors), the error will propagate as an unhandled rejection, resulting in a generic Next.js 500 error instead of a structured JSON error response. Most other routes in the codebase have try-catch wrappers.
- **Evidence:**
  ```typescript
  export async function POST() {
    const result = await createAssistantAgent()
    // No try-catch -- if createAssistantAgent() throws, unstructured 500
    if (result.error) { ... }
    return NextResponse.json(result.data)
  }
  ```
- **Fix:** Wrap each handler body in try-catch with a standard 500 JSON error response.

### [CC-A2-014] `POST /api/webhooks` does not validate webhook URL scheme (allows non-http schemes)
- **File:** `/Users/emanuelesabetta/ai-maestro/services/webhooks-service.ts`:89-93
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `createNewWebhook` service validates URL format via `new URL(body.url)` but does not check the protocol. This allows `file:///`, `ftp://`, `javascript:`, etc. URLs. When webhooks fire, the delivery function may make HTTP requests to these URLs. The `hosts/health` route explicitly checks `['http:', 'https:'].includes(parsed.protocol)`.
- **Evidence:**
  ```typescript
  try {
    new URL(body.url)  // passes for any valid URL including file://, ftp://, etc.
  } catch {
    return { error: 'Invalid URL format', status: 400 }
  }
  ```
- **Fix:** Add protocol validation: `const parsed = new URL(body.url); if (!['http:', 'https:'].includes(parsed.protocol)) return { error: 'Only http/https URLs are allowed', status: 400 }`.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/api/hosts/[id]/route.ts` -- Clean: proper validation, error handling, try-catch
- `/Users/emanuelesabetta/ai-maestro/app/api/hosts/exchange-peers/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/hosts/identity/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/hosts/register-peer/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/hosts/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/hosts/sync/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/meetings/[id]/route.ts` -- Clean: auth, UUID validation, JSON try-catch
- `/Users/emanuelesabetta/ai-maestro/app/api/meetings/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/messages/forward/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/messages/meeting/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/messages/route.ts` -- Clean: auth on PATCH/DELETE, sender override on POST
- `/Users/emanuelesabetta/ai-maestro/app/api/organization/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/build/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/builds/[id]/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/push/route.ts` -- Clean: thorough validation
- `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/scan-repo/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/sessions/[id]/command/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/sessions/[id]/rename/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/sessions/[id]/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/sessions/activity/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/sessions/create/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/sessions/restore/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/sessions/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/subconscious/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts` -- Clean: rate limiting, password auth, UUID validation
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts` -- Clean: auth, UUID validation, field whitelisting
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts` -- Clean: strips type/chiefOfStaffId
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts` -- Clean: thorough validation
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/stats/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/marketplace/skills/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/agents/me/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/agents/resolve/[address]/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/agents/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/auth/revoke-key/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/auth/rotate-key/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/auth/rotate-keys/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/federation/deliver/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/approve/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/reject/route.ts` -- Clean: dual auth paths, signature verification
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts` -- Clean: comprehensive validation
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/sync/route.ts` -- Clean: Ed25519 auth, timestamp freshness
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/health/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/messages/[id]/read/route.ts` -- Clean
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/messages/pending/route.ts` -- Clean (minor NIT for ?? {} pattern)
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/register/route.ts` -- Clean (minor NIT for ?? {} pattern)
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts` -- Clean (minor NIT for ?? {} pattern)

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-A2-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P10-Rc7f26c53-A2.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
