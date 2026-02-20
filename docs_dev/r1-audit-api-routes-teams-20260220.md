# Code Correctness Report: API Routes (Teams/Tasks/Documents)

**Agent:** epcp-code-correctness-agent
**Domain:** api-routes-teams
**Files audited:** 6
**Date:** 2026-02-20T00:00:00Z

## Files Audited

1. `app/api/teams/route.ts`
2. `app/api/teams/[id]/route.ts`
3. `app/api/teams/[id]/tasks/route.ts`
4. `app/api/teams/[id]/tasks/[taskId]/route.ts`
5. `app/api/teams/[id]/documents/route.ts`
6. `app/api/teams/[id]/documents/[docId]/route.ts`

---

## MUST-FIX

### [CC-001] Unsafe `as CreateTaskParams` type assertion bypasses type checking
- **File:** `app/api/teams/[id]/tasks/route.ts:50`
- **Severity:** MUST-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The body is typed as `Record<string, unknown>`, then spread with `requestingAgentId` and cast via `as CreateTaskParams`. This assertion silences the compiler but does NOT validate or narrow the types at runtime. Any key in the parsed JSON body will pass through to the service layer unchecked by the TypeScript compiler. For instance, `subject` is required on `CreateTaskParams` (type `string`), but since the body comes from `request.json()` (which is `unknown`/`any`), the `as` cast simply tells TypeScript "trust me" -- the actual value at runtime could be a number, null, or missing entirely.
- **Evidence:**
  ```typescript
  // Line 43-50
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed JSON in request body' }, { status: 400 })
  }
  const result = await createTeamTask(id, { ...body, requestingAgentId } as CreateTaskParams)
  ```
- **Impact:** Low in practice because `createTeamTask` validates `subject` at runtime (line 320-322 of teams-service.ts). But extra unknown fields from the body pass through to `createTask()` unsanitized. If `createTask` spreads these into a stored object, it allows **prototype pollution** or unexpected field injection into the task JSON file.
- **Fix:** Destructure only the known fields from `body` before passing to service:
  ```typescript
  const { subject, description, assigneeAgentId, blockedBy, priority } = body
  const result = await createTeamTask(id, {
    subject: subject as string,
    description: description as string | undefined,
    assigneeAgentId: assigneeAgentId as string | undefined,
    blockedBy: blockedBy as string[] | undefined,
    priority: priority as number | undefined,
    requestingAgentId,
  })
  ```

### [CC-002] Unsafe `as UpdateTaskParams` type assertion bypasses type checking
- **File:** `app/api/teams/[id]/tasks/[taskId]/route.ts:27`
- **Severity:** MUST-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-001 but for task updates. Body is `Record<string, unknown>`, spread and cast via `as UpdateTaskParams`. Extra unknown keys from the JSON body pass through to the service layer.
- **Evidence:**
  ```typescript
  // Line 20-27
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed JSON in request body' }, { status: 400 })
  }
  const result = await updateTeamTask(id, taskId, { ...body, requestingAgentId } as UpdateTaskParams)
  ```
- **Impact:** `updateTeamTask` destructures known fields (line 365-366 of teams-service.ts: `const { requestingAgentId, ...taskFields } = params`), but `taskFields` still contains any unknown keys from the original body. These are then passed to `updateTask()`. If `updateTask` spreads them into the stored task object, unknown fields persist in storage.
- **Fix:** Destructure only known fields from `body` before passing to service (same pattern as CC-001).

---

## SHOULD-FIX

### [CC-003] `GET /api/teams` list endpoint leaks closed team metadata without auth
- **File:** `app/api/teams/route.ts:7-9`
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `GET /api/teams` handler calls `listAllTeams()` which returns ALL teams including closed teams with full metadata (member lists, description, instructions, chiefOfStaffId, etc.). No authentication is required. Meanwhile, `GET /api/teams/[id]` properly gates closed team detail access via `checkTeamAccess()`. This inconsistency means that closed team data is accessible to anyone who can list teams, bypassing the per-team ACL.
- **Evidence:**
  ```typescript
  // teams/route.ts lines 7-9 - No auth
  export async function GET() {
    const result = listAllTeams()
    return NextResponse.json(result.data, { status: result.status })
  }
  ```
  vs.
  ```typescript
  // teams/[id]/route.ts lines 6-24 - Auth required, ACL checked
  export async function GET(request, { params }) {
    const { id } = await params
    const auth = authenticateAgent(...)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
    const result = getTeamById(id, requestingAgentId)
    // getTeamById calls checkTeamAccess()
  }
  ```
- **Impact:** Closed team metadata is exposed to unauthenticated callers via the list endpoint. The Phase 1 comment acknowledges this ("Phase 1: No ACL on team list"), but since closed team governance was added later, this should be revisited.
- **Fix:** Either (a) filter closed teams from the list for unauthenticated callers, or (b) strip sensitive fields (instructions, member lists) from closed teams in the list response, or (c) add auth to the list endpoint and pass `requestingAgentId` to `listAllTeams` for filtering.

### [CC-004] POST `/api/teams` does not strip `type` and `chiefOfStaffId` from body
- **File:** `app/api/teams/route.ts:31`
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The PUT handler at `teams/[id]/route.ts:50` explicitly strips `type` and `chiefOfStaffId` from the body with a comment "only dedicated governance endpoints can change these." However, the POST handler at `teams/route.ts:31` passes `{ ...body, requestingAgentId }` directly without stripping, which means a caller CAN set `type` and `chiefOfStaffId` when creating a team. While this may be intentional (creating a team should allow setting initial type), it creates an inconsistency: updating a team cannot set type/COS via the generic endpoint, but creation can.
- **Evidence:**
  ```typescript
  // POST handler - does NOT strip type/chiefOfStaffId
  const result = await createNewTeam({ ...body, requestingAgentId })

  // PUT handler - strips type/chiefOfStaffId
  const { type: _type, chiefOfStaffId: _cos, ...safeBody } = body
  const result = await updateTeamById(id, { ...safeBody, requestingAgentId })
  ```
- **Impact:** If the intent is that type/COS changes go through dedicated governance endpoints, then creation should also use a dedicated flow -- or at minimum, the inconsistency should be documented. Currently, any authenticated caller can create a "closed" team and appoint themselves as COS.
- **Fix:** Either (a) document that POST intentionally allows type/COS setting at creation time, or (b) strip type/COS from the POST body too and require dedicated endpoints for setting these even at creation.

### [CC-005] Redundant double-stripping of `type` and `chiefOfStaffId` in update path
- **File:** `app/api/teams/[id]/route.ts:50` and `services/teams-service.ts:207`
- **Severity:** SHOULD-FIX (code quality)
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The route handler strips `type` and `chiefOfStaffId` at line 50, then the service function `updateTeamById` strips them again at line 207. While defense-in-depth is good, the service comment says "CC-007 defense-in-depth" indicating this was deliberate. However, the double-stripping means the route-level stripping is dead code -- the service would handle it regardless.
- **Evidence:**
  ```typescript
  // Route (line 50):
  const { type: _type, chiefOfStaffId: _cos, ...safeBody } = body
  const result = await updateTeamById(id, { ...safeBody, requestingAgentId })

  // Service (line 207):
  const { requestingAgentId, type: _type, chiefOfStaffId: _cos, ...updateFields } = params
  ```
- **Impact:** No functional impact, but confusing for maintainers. If someone removes the route-level strip thinking it's the only guard, the service still protects. If someone removes the service-level strip thinking the route handles it, other callers of `updateTeamById` would be unprotected.
- **Fix:** Keep both (defense-in-depth is valid) but add a comment at the route level explicitly stating both layers strip these fields intentionally.

### [CC-006] `createNewTeam` receives but ignores `requestingAgentId`
- **File:** `app/api/teams/route.ts:31` and `services/teams-service.ts:131-165`
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The POST handler extracts `requestingAgentId` from auth and passes it to `createNewTeam` via `{ ...body, requestingAgentId }`. However, `createNewTeam` never destructures or uses `requestingAgentId`. It only destructures `name`, `description`, and `agentIds` from params. This means no governance ACL check is performed on team creation -- any authenticated agent can create any team.
- **Evidence:**
  ```typescript
  // Route (line 31):
  const result = await createNewTeam({ ...body, requestingAgentId })

  // Service (lines 131-132):
  export async function createNewTeam(params: CreateTeamParams) {
    const { name, description, agentIds } = params  // requestingAgentId ignored
  ```
- **Impact:** If governance rules should restrict who can create teams (e.g., only the manager), the `requestingAgentId` is passed but never checked. Currently, team creation has no ACL beyond "is authenticated."
- **Fix:** Either (a) add an ACL check using `requestingAgentId` if team creation should be restricted, or (b) remove `requestingAgentId` from the spread to avoid implying it's used, and document that team creation is open to all authenticated agents.

### [CC-007] Documents POST and PUT do not validate/whitelist body fields
- **File:** `app/api/teams/[id]/documents/route.ts:49` and `app/api/teams/[id]/documents/[docId]/route.ts:47`
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Both document endpoints spread the entire parsed body into service calls: `{ ...body, requestingAgentId }`. The body is untyped (`let body` -- implicitly `any` from `request.json()`). Unlike the task endpoints which at least typed body as `Record<string, unknown>`, the document endpoints don't even annotate the type. Any unknown fields from the JSON body pass through to `createTeamDocument` / `updateTeamDocument`, which may persist them to disk.
- **Evidence:**
  ```typescript
  // documents/route.ts:49
  const result = await createTeamDocument(id, { ...body, requestingAgentId })

  // documents/[docId]/route.ts:47
  const result = await updateTeamDocument(id, docId, { ...body, requestingAgentId })
  ```
- **Impact:** Unknown fields from request body can be injected into document storage. If the service layer spreads params into the stored object, arbitrary data persists.
- **Fix:** Destructure only known fields (`title`, `content`, `pinned`, `tags`) from the body before passing to the service.

---

## NIT

### [CC-008] Inconsistent JSON error messages across handlers
- **File:** Multiple files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** JSON parse error messages vary across handlers:
  - `teams/route.ts:28` → `'Invalid JSON body'`
  - `teams/[id]/route.ts:46` → `'Invalid JSON body'`
  - `teams/[id]/tasks/route.ts:47` → `'Malformed JSON in request body'`
  - `teams/[id]/tasks/[taskId]/route.ts:24` → `'Malformed JSON in request body'`
  - `teams/[id]/documents/route.ts:46` → `'Invalid JSON body'`
  - `teams/[id]/documents/[docId]/route.ts:45` → `'Invalid JSON body'`
- **Fix:** Standardize on one message (e.g., `'Invalid JSON body'`) across all handlers.

### [CC-009] Inconsistent HTTP status codes on success for create operations
- **File:** Multiple files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Create operations return different status codes:
  - `POST /api/teams` → `result.status` (which is 201 from service)
  - `POST /api/teams/[id]/tasks` → `result.status` (which is 201 from service)
  - `POST /api/teams/[id]/documents` → `result.status` (which is 201 from service)

  But read/update/delete success responses don't pass `result.status` -- they default to 200:
  - `GET /api/teams/[id]` → `NextResponse.json(result.data)` (default 200)
  - `PUT /api/teams/[id]` → `NextResponse.json(result.data)` (default 200)

  This is actually correct (201 for create, 200 for others), but the inconsistency in how status is passed (explicit `{ status: result.status }` vs implicit 200) makes the pattern less obvious.
- **Fix:** Either always pass `{ status: result.status }` for consistency, or document the convention.

### [CC-010] `body` variable in document endpoints lacks explicit type annotation
- **File:** `app/api/teams/[id]/documents/route.ts:42` and `app/api/teams/[id]/documents/[docId]/route.ts:41`
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Unlike the task endpoints which type `body` as `Record<string, unknown>`, the document and team endpoints declare `let body` without a type annotation. While `request.json()` returns `Promise<any>`, the lack of annotation makes the implicit `any` less visible.
- **Evidence:**
  ```typescript
  // documents/route.ts:42 - no type
  let body

  // tasks/route.ts:43 - has type
  let body: Record<string, unknown>
  ```
- **Fix:** Add `Record<string, unknown>` type annotation to `body` in all handlers for consistency.

---

## CLEAN

Files with no critical auth/contract violations:
- `app/api/teams/[id]/tasks/[taskId]/route.ts` -- Auth pattern correct, JSON error handling present (issues CC-002 and CC-008 noted above are SHOULD-FIX/NIT)
- `app/api/teams/[id]/documents/[docId]/route.ts` -- Auth pattern correct for all 3 handlers (GET/PUT/DELETE), JSON error handling present

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| MUST-FIX | 2 | CC-001, CC-002 |
| SHOULD-FIX | 5 | CC-003, CC-004, CC-005, CC-006, CC-007 |
| NIT | 3 | CC-008, CC-009, CC-010 |
| **Total** | **10** | |

### Key Patterns Verified (All Pass)

- [x] All POST/PUT/DELETE handlers use `authenticateAgent(request.headers.get('Authorization'), request.headers.get('X-Agent-Id'))` pattern
- [x] All handlers check `auth.error` and return 401 early
- [x] All handlers extract `requestingAgentId` from `auth.agentId` (not from body)
- [x] All handlers with request body have try/catch on `request.json()`
- [x] No handler reads `requestingAgentId` from the request body
- [x] No handler uses `X-Agent-Id` directly without `authenticateAgent()`
- [x] GET team list intentionally skips auth (Phase 1 design, noted as CC-003)
- [x] `params` properly awaited as `Promise<{...}>` (Next.js 14+ pattern)
- [x] No `as any` casts in these 6 files (the `as CreateTaskParams` and `as UpdateTaskParams` are specific type assertions, not `any`)
