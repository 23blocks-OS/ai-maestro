# Code Correctness Report: API Routes - Teams/Tasks/Documents (Round 2 Independent Audit)

**Agent:** epcp-code-correctness-agent
**Domain:** api-routes-teams-tasks-documents
**Files audited:** 7 (6 route files + 1 auth module + 1 service file for context)
**Date:** 2026-02-20T00:00:00Z

---

## Handler-by-Handler Audit Table

| File | Handler | Auth Pattern | JSON Error Handling | Type Safety | Agent ID Source | Issues |
|------|---------|-------------|-------------------|-------------|----------------|--------|
| `teams/route.ts` | `GET` | **NO AUTH** | N/A (no body) | OK | N/A | CC-R2-001: No auth, lists all teams including closed |
| `teams/route.ts` | `POST` | authenticateAgent(Auth, X-Agent-Id) | try/catch on json() | `body` typed as `let body` (implicit any) | auth.agentId | CC-R2-002: body untyped |
| `teams/[id]/route.ts` | `GET` | authenticateAgent(Auth, X-Agent-Id) | N/A (no body) | OK | auth.agentId | Clean |
| `teams/[id]/route.ts` | `PUT` | authenticateAgent(Auth, X-Agent-Id) | try/catch on json() | `body` typed as `let body` (implicit any), strips type/chiefOfStaffId | auth.agentId | CC-R2-003: body untyped |
| `teams/[id]/route.ts` | `DELETE` | authenticateAgent(Auth, X-Agent-Id) | N/A (no body) | OK | auth.agentId | Clean |
| `tasks/route.ts` | `GET` | authenticateAgent(Auth, X-Agent-Id) | N/A (no body) | OK | auth.agentId | Clean |
| `tasks/route.ts` | `POST` | authenticateAgent(Auth, X-Agent-Id) | try/catch on json() | `body` as `Record<string, unknown>` then cast `as CreateTaskParams` | auth.agentId | CC-R2-004: unsafe cast |
| `tasks/[taskId]/route.ts` | `PUT` | authenticateAgent(Auth, X-Agent-Id) | try/catch on json() | `body` as `Record<string, unknown>` then cast `as UpdateTaskParams` | auth.agentId | CC-R2-005: unsafe cast |
| `tasks/[taskId]/route.ts` | `DELETE` | authenticateAgent(Auth, X-Agent-Id) | N/A (no body) | OK | auth.agentId | Clean |
| `documents/route.ts` | `GET` | authenticateAgent(Auth, X-Agent-Id) | N/A (no body) | OK | auth.agentId | Clean |
| `documents/route.ts` | `POST` | authenticateAgent(Auth, X-Agent-Id) | try/catch on json() | `body` typed as `let body` (implicit any) | auth.agentId | CC-R2-006: body untyped |
| `documents/[docId]/route.ts` | `GET` | authenticateAgent(Auth, X-Agent-Id) | N/A (no body) | OK | auth.agentId | Clean |
| `documents/[docId]/route.ts` | `PUT` | authenticateAgent(Auth, X-Agent-Id) | try/catch on json() | `body` typed as `let body` (implicit any) | auth.agentId | CC-R2-007: body untyped |
| `documents/[docId]/route.ts` | `DELETE` | authenticateAgent(Auth, X-Agent-Id) | N/A (no body) | OK | auth.agentId | Clean |

---

## Summary of Positive Findings (Clean Patterns)

1. **Auth pattern is consistent across all mutating endpoints.** Every POST/PUT/DELETE uses `authenticateAgent(request.headers.get('Authorization'), request.headers.get('X-Agent-Id'))`. CONFIRMED.
2. **Agent ID is NEVER sourced from request body.** All handlers extract `requestingAgentId` from `auth.agentId`, which comes from the authenticated Bearer token. CONFIRMED.
3. **All POST/PUT handlers have try/catch on `request.json()`.** CONFIRMED.
4. **No `as any` in route files.** CONFIRMED (the `as any` at line 561 is in the service layer, not routes).
5. **Error response format is consistent:** `{ error: string }` with `{ status: number }`. CONFIRMED.
6. **GET /api/teams/[id] has auth** and passes to service for ACL check. CONFIRMED.
7. **PUT teams/[id]/route.ts strips `type` and `chiefOfStaffId`** from body before passing to service (defense-in-depth against governance bypass). CONFIRMED.

---

## SHOULD-FIX

### [CC-R2-001] GET /api/teams lists ALL teams without auth, leaking closed team metadata
- **File:** `app/api/teams/route.ts:7-10`
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `GET /api/teams` handler calls `listAllTeams()` with no authentication and no ACL filtering. This returns ALL teams including closed teams. While the comment says "Phase 1: No ACL on team list -- localhost only", this contradicts the effort put into ACL-protecting every other endpoint for closed teams. An agent that should not see a closed team's existence can simply call `GET /api/teams` and see its name, description, member list, type, chiefOfStaffId, etc.
- **Evidence:**
  ```typescript
  // GET /api/teams - List all teams
  // Phase 1: No ACL on team list -- localhost only.
  export async function GET() {
    const result = listAllTeams()
    return NextResponse.json(result.data, { status: result.status })
  }
  ```
  And in the service:
  ```typescript
  export function listAllTeams(): ServiceResult<{ teams: any[] }> {
    const teams = loadTeams()
    return { data: { teams }, status: 200 }
  }
  ```
  No filtering applied.
- **Fix:** Either add auth + ACL filtering (filter out closed teams the requesting agent is not a member/manager/COS of), or at minimum strip sensitive fields (agentIds, chiefOfStaffId) from closed teams in the list response. The current approach creates a metadata leak that undermines the closed-team governance model.

### [CC-R2-002] Untyped body spread in POST /api/teams allows extra fields to pass through
- **File:** `app/api/teams/route.ts:31`
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `body` variable is declared as `let body` (implicit `any`). Then it's spread into the service call as `{ ...body, requestingAgentId }`. Because `body` is `any`, TypeScript will NOT catch if the request contains unexpected fields that leak into `CreateTeamParams`. The service function (`createNewTeam`) accepts `CreateTeamParams` which has known fields, but the `any` spread could in theory carry unknown properties through.
- **Evidence:**
  ```typescript
  let body          // <-- implicit any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await createNewTeam({ ...body, requestingAgentId })
  ```
- **Fix:** Type `body` explicitly: `let body: Partial<CreateTeamParams>` or destructure only known fields before passing to the service. This pattern repeats in several handlers (see CC-R2-003, CC-R2-006, CC-R2-007).

### [CC-R2-003] Untyped body spread in PUT /api/teams/[id]
- **File:** `app/api/teams/[id]/route.ts:42,51`
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-R2-002. `body` is `let body` (implicit `any`). Although `type` and `chiefOfStaffId` are destructured away (good), the remaining `safeBody` spread from an `any` source still carries all unknown properties.
- **Evidence:**
  ```typescript
  let body
  try {
    body = await request.json()
  } catch { ... }
  const { type: _type, chiefOfStaffId: _cos, ...safeBody } = body
  const result = await updateTeamById(id, { ...safeBody, requestingAgentId })
  ```
- **Fix:** Type `body` as `Record<string, unknown>` or `Partial<UpdateTeamParams>`, then destructure only known fields.

### [CC-R2-004] Unsafe `as CreateTaskParams` cast on untrusted request body
- **File:** `app/api/teams/[id]/tasks/route.ts:50`
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The body is typed as `Record<string, unknown>` (good start), but then forcefully cast with `as CreateTaskParams`. This assertion tells TypeScript to trust that the untrusted user input matches the interface, which it might not. Any unexpected or wrongly-typed fields will pass through unchecked. The service layer does validate `subject` at runtime, but other fields like `priority` (expected `number`) could be a string without TypeScript catching it.
- **Evidence:**
  ```typescript
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch { ... }
  const result = await createTeamTask(id, { ...body, requestingAgentId } as CreateTaskParams)
  ```
- **Fix:** Either validate/destructure known fields in the route before passing them, or create a validation function that returns a properly typed result. The `as` cast should be a last resort, not the first.

### [CC-R2-005] Unsafe `as UpdateTaskParams` cast on untrusted request body
- **File:** `app/api/teams/[id]/tasks/[taskId]/route.ts:27`
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-R2-004. `body` is `Record<string, unknown>` but cast to `UpdateTaskParams`. Fields like `status`, `priority`, `blockedBy` could have wrong types at runtime. The service layer validates some of these (status, blockedBy), but `priority` (expected `number | undefined`) is not validated if it arrives as a string.
- **Evidence:**
  ```typescript
  const result = await updateTeamTask(id, taskId, { ...body, requestingAgentId } as UpdateTaskParams)
  ```
- **Fix:** Same as CC-R2-004 -- destructure and validate known fields, or use a runtime validation function.

### [CC-R2-006] Untyped body spread in POST /api/teams/[id]/documents
- **File:** `app/api/teams/[id]/documents/route.ts:42,49`
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same as CC-R2-002. `body` is `let body` (implicit any), spread into `createTeamDocument(id, { ...body, requestingAgentId })`. The service function expects `CreateDocumentParams` but any extra/wrong-typed fields leak through.
- **Evidence:**
  ```typescript
  let body
  try {
    body = await request.json()
  } catch { ... }
  const result = await createTeamDocument(id, { ...body, requestingAgentId })
  ```
- **Fix:** Type `body` and destructure only known fields.

### [CC-R2-007] Untyped body spread in PUT /api/teams/[id]/documents/[docId]
- **File:** `app/api/teams/[id]/documents/[docId]/route.ts:41,47`
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same as CC-R2-002. `body` is `let body` (implicit any), spread into `updateTeamDocument`.
- **Evidence:**
  ```typescript
  let body
  try {
    body = await request.json()
  } catch { ... }
  const result = await updateTeamDocument(id, docId, { ...body, requestingAgentId })
  ```
- **Fix:** Type `body` and destructure only known fields.

---

## NIT

### [CC-R2-008] Service layer uses `as any` for updateDocument call
- **File:** `services/teams-service.ts:561`
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `updateDocument` function expects `Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>>`, and the `updates` object built at lines 555-559 already matches this type exactly. The `as any` cast is unnecessary and hides potential future type mismatches.
- **Evidence:**
  ```typescript
  const updates: Record<string, unknown> = {}
  if (docFields.title !== undefined) updates.title = docFields.title
  // ...
  const document = await updateDocument(teamId, docId, updates as any)
  ```
- **Fix:** Change the type of `updates` from `Record<string, unknown>` to `Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>>` and remove the `as any`.

### [CC-R2-009] Inconsistent status code pattern for successful GET responses
- **File:** Multiple route files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Some GET handlers include `{ status: result.status }` in the response (e.g., `teams/route.ts:9`), while others omit it (e.g., `teams/[id]/route.ts:24` just does `NextResponse.json(result.data)`). This is not a bug since NextResponse defaults to 200, but it's inconsistent. POST handlers are also inconsistent: some use `result.status` (which is 201), some use default 200.
- **Evidence:**
  ```typescript
  // teams/route.ts:9 -- explicit status
  return NextResponse.json(result.data, { status: result.status })

  // teams/[id]/route.ts:24 -- default 200
  return NextResponse.json(result.data)
  ```
- **Fix:** Pick one pattern and use it consistently. Recommendation: always pass `{ status: result.status }` since the service returns the intended status code (200 for get, 201 for create).

### [CC-R2-010] ServiceResult uses `any[]` and `any` for data types
- **File:** `services/teams-service.ts:121,131,171,282,304,351,421,450,471,510,535,577,605`
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** All `ServiceResult` generics use `any` for the actual entity types: `ServiceResult<{ teams: any[] }>`, `ServiceResult<{ team: any }>`, etc. This means the return types of every service function provide no type safety to the route handlers. If the underlying registry functions return properly typed objects, this `any` laundering loses that information.
- **Fix:** Define proper interfaces for Team, Task, Document at the service boundary and use them instead of `any`.

---

## CLEAN

Files with no issues found:
- `app/api/teams/[id]/route.ts` (GET handler) -- Clean auth, ACL passed to service
- `app/api/teams/[id]/route.ts` (DELETE handler) -- Clean auth, proper service delegation
- `app/api/teams/[id]/tasks/route.ts` (GET handler) -- Clean auth, ACL check
- `app/api/teams/[id]/tasks/[taskId]/route.ts` (DELETE handler) -- Clean auth, proper param passing
- `app/api/teams/[id]/documents/route.ts` (GET handler) -- Clean auth, ACL check
- `app/api/teams/[id]/documents/[docId]/route.ts` (GET handler) -- Clean auth, ACL check
- `app/api/teams/[id]/documents/[docId]/route.ts` (DELETE handler) -- Clean auth, proper param passing
- `lib/agent-auth.ts` -- Solid 3-case auth logic, proper spoofing prevention, X-Agent-Id match check

---

## Agent Auth Module Analysis

`lib/agent-auth.ts` is well-structured with clear documentation:

1. **Case 1 (no headers):** Returns `{}` (system owner / web UI) -- allows unauthenticated browser access for localhost-only Phase 1. CONFIRMED correct.
2. **Case 2 (X-Agent-Id without Bearer):** Rejects with 401 -- prevents identity spoofing. CONFIRMED correct.
3. **Case 3 (Bearer present):** Validates via `authenticateRequest`, cross-checks X-Agent-Id match. Returns 403 on mismatch. CONFIRMED correct.
4. **No `requestingAgentId` from body:** All route handlers extract it from `auth.agentId`, never from the request body. CONFIRMED across all 14 handlers.

---

## Summary

- **MUST-FIX:** 0
- **SHOULD-FIX:** 7 (1 security metadata leak, 6 type-safety issues with untyped/unsafely-cast request bodies)
- **NIT:** 3 (1 unnecessary `as any` in service, 1 inconsistent status codes, 1 `any` generics in service)
- **CLEAN:** 8 handlers + auth module

The route layer is structurally sound with consistent auth patterns and proper JSON error handling. The main weakness is the type-safety gap: request bodies either have implicit `any` type or are unsafely cast, meaning TypeScript cannot catch type mismatches between client requests and service expectations. Runtime validation in the service layer mitigates most of this, but fields like `priority` (number) have no runtime type check and could silently accept strings.
