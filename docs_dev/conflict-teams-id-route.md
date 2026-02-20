# Merge Conflict Analysis: `app/api/teams/[id]/route.ts`

Generated: 2026-02-20T02:35Z

## Summary

Origin/main refactored the route to be a **thin wrapper** that delegates all logic to `services/teams-service.ts`. Our branch added **governance logic** (ACL, UUID validation, manager checks, closed-team guards) directly into the route handler. These two approaches conflict structurally: origin wants thin routes + fat services; our branch has fat routes + governance in lib/.

---

## Side-by-Side Comparison

### Origin/main Route (`app/api/teams/[id]/route.ts`)

- **Imports:** Only `NextRequest`, `NextResponse`, and 3 functions from `services/teams-service`
- **Pattern:** Thin wrapper. Each handler is ~5 lines: extract params, call service, return JSON.
- **Params:** `{ params }: { params: Promise<{ id: string }> }` (Promise-based, awaited) -- **consistent across GET/PUT/DELETE**
- **No governance:** No UUID validation, no ACL, no manager checks, no closed-team guard
- **Service functions:** `getTeamById(id)`, `updateTeamById(id, body)`, `deleteTeamById(id)` -- all return `ServiceResult<T>` with `.error`, `.status`, `.data`

### Our Branch Route (`app/api/teams/[id]/route.ts`)

- **Imports:** `team-registry` (getTeam, updateTeam, deleteTeam, TeamValidationException), `governance` (getManagerId, isManager), `team-acl` (checkTeamAccess), `validation` (isValidUuid)
- **Pattern:** Fat route. Each handler has 10-30 lines of governance logic inline.
- **Params:** `{ params }: { params: Promise<{ id: string }> }` (Promise-based, awaited) -- **same as origin, no conflict here**
- **Governance logic inline:**
  - UUID validation via `isValidUuid(id)`
  - ACL via `checkTeamAccess({ teamId, requestingAgentId })` (reads `X-Agent-Id` header)
  - PUT: calls `getManagerId()` and passes to `updateTeam(id, updates, managerId)`
  - PUT: catches `TeamValidationException` for business rule errors
  - DELETE: extra closed-team guard (`isManager(agentId)` or COS check)
- **Service layer:** Does NOT exist on our branch (`services/` directory is absent)

---

## Param Signature Analysis

**No conflict.** Both branches use the same Next.js 14+ Promise-based params pattern:

```typescript
{ params }: { params: Promise<{ id: string }> }
```

Both branches `await params` to extract `id`. This is consistent.

---

## What Governance Logic Must Move Into Services

The origin/main architecture demands that `services/teams-service.ts` contains all business logic, and routes are thin HTTP wrappers. Our governance features must be integrated into the service layer.

### 1. UUID Validation (`isValidUuid`)

**Current location (our branch):** Route handler, before any service call
**Recommendation:** Move into service functions `getTeamById`, `updateTeamById`, `deleteTeamById` as the first check. The service already returns `ServiceResult` with status codes, so it can return `{ error: 'Invalid team ID format', status: 400 }`.

**Alternative:** Keep in route as an HTTP-layer concern (input sanitization). This is defensible -- UUID format validation is arguably transport-layer validation, not business logic. But for consistency with origin's pattern of zero logic in routes, move it into services.

### 2. ACL Check (`checkTeamAccess`)

**Current location (our branch):** Route handler, reads `X-Agent-Id` from `request.headers`
**Recommendation:** Service functions need a new parameter: `requestingAgentId?: string`. The route extracts `X-Agent-Id` from headers and passes it to the service. The service calls `checkTeamAccess` internally.

**Proposed service signatures:**
```typescript
getTeamById(id: string, opts?: { requestingAgentId?: string }): ServiceResult<{ team: any }>
updateTeamById(id: string, params: UpdateTeamParams, opts?: { requestingAgentId?: string }): ServiceResult<{ team: any }>
deleteTeamById(id: string, opts?: { requestingAgentId?: string }): ServiceResult<{ success: boolean }>
```

**How X-Agent-Id flows:**
```
Route handler:
  const agentId = request.headers.get('X-Agent-Id') || undefined
  const result = updateTeamById(id, body, { requestingAgentId: agentId })
```

### 3. Manager ID (`getManagerId`)

**Current location (our branch):** Route handler (PUT), calls `getManagerId()` and passes to `updateTeam(id, updates, managerId)`
**Recommendation:** The service should call `getManagerId()` internally. The route should NOT need to know about the manager concept. The service has access to `lib/governance` directly.

**In service `updateTeamById`:**
```typescript
export function updateTeamById(id: string, params: UpdateTeamParams, opts?: { requestingAgentId?: string }): ServiceResult<{ team: any }> {
  // ACL check first
  if (opts?.requestingAgentId !== undefined) {
    const access = checkTeamAccess({ teamId: id, requestingAgentId: opts.requestingAgentId })
    if (!access.allowed) return { error: access.reason!, status: 403 }
  }
  // Get manager ID for validation rules
  const managerId = getManagerId()
  // Call updateTeam with managerId
  const team = await updateTeam(id, params, managerId)
  ...
}
```

### 4. `validateTeamMutation` (called inside `updateTeam` in team-registry)

**Current location (our branch):** Inside `lib/team-registry.ts:updateTeam()`, which throws `TeamValidationException`
**Recommendation:** This is already in the right place (lib layer). The service just needs to catch `TeamValidationException` and convert it to a `ServiceResult` error. This is analogous to what origin's service does with generic `Error` catches, but with the specific exception type.

**In service:**
```typescript
try {
  const team = await updateTeam(id, { name, description, agentIds, ... }, managerId)
  if (!team) return { error: 'Team not found', status: 404 }
  return { data: { team }, status: 200 }
} catch (error) {
  if (error instanceof TeamValidationException) {
    return { error: error.message, status: error.code }
  }
  return { error: error instanceof Error ? error.message : 'Failed to update team', status: 500 }
}
```

### 5. Closed-Team DELETE Guard

**Current location (our branch):** Route handler (DELETE), after ACL check
```typescript
if (team && team.type === 'closed') {
  if (!agentId || (!isManager(agentId) && team.chiefOfStaffId !== agentId)) {
    return 403
  }
}
```

**Recommendation:** Move into `deleteTeamById` service function. The service needs `requestingAgentId` to perform this check.

**In service `deleteTeamById`:**
```typescript
export function deleteTeamById(id: string, opts?: { requestingAgentId?: string }): ServiceResult<{ success: boolean }> {
  // ACL check
  ...
  // Closed-team deletion guard
  const team = getTeam(id)
  if (team?.type === 'closed') {
    const agentId = opts?.requestingAgentId
    if (!agentId || (!isManager(agentId) && team.chiefOfStaffId !== agentId)) {
      return { error: 'Closed team deletion requires MANAGER or Chief-of-Staff authority', status: 403 }
    }
  }
  // Proceed with delete
  const deleted = await deleteTeam(id)
  ...
}
```

---

## Signature Conflicts: `updateTeam` and `deleteTeam` (team-registry)

### Origin/main:
```typescript
updateTeam(id: string, updates: Partial<Pick<Team, ...>>): Team | null          // sync, no managerId
deleteTeam(id: string): boolean                                                  // sync
```

### Our branch:
```typescript
updateTeam(id, updates, managerId?, reservedNames?): Promise<Team | null>        // async (withLock), has managerId
deleteTeam(id): Promise<boolean>                                                 // async (withLock)
```

**Key differences:**
1. **Async vs sync:** Our branch uses `withLock()` which is async. Origin is sync. The service layer on origin calls them synchronously. After merge, the service must `await` these calls (the service functions become `async`).
2. **`managerId` parameter:** Only on our branch. Origin's `updateTeam` has no governance awareness.
3. **`Team` type:** Our branch adds `type: TeamType` and `chiefOfStaffId?: string | null`. Origin's `Team` lacks these fields. The `Partial<Pick<Team, ...>>` in updates must include these new fields.
4. **Orphan cleanup:** Our branch's `deleteTeam` cleans up task and document files. Origin's does not.

---

## New Files Required on Origin (Don't Exist on main)

These files exist only on our branch and must be added:
- `lib/team-acl.ts` -- ACL check function
- `lib/validation.ts` -- UUID validation utility
- `lib/governance.ts` -- Manager/COS role checks, password management
- `lib/file-lock.ts` -- File locking utility (used by governance and team-registry)
- `types/governance.ts` -- GovernanceConfig type and defaults

---

## Recommended Merge Strategy

### Step 1: Accept origin's architectural pattern
The route should be a thin wrapper delegating to `services/teams-service.ts`.

### Step 2: Enhance the service layer with governance
Add to `services/teams-service.ts`:
- New imports: `checkTeamAccess`, `isValidUuid`, `getManagerId`, `isManager`, `TeamValidationException`
- New `opts` parameter on `getTeamById`, `updateTeamById`, `deleteTeamById` for `requestingAgentId`
- UUID validation as first check in each function
- ACL check after UUID validation
- Manager ID lookup in `updateTeamById`
- Closed-team DELETE guard in `deleteTeamById`
- `TeamValidationException` catch in `updateTeamById`

### Step 3: Route becomes thin again
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getTeamById, updateTeamById, deleteTeamById } from '@/services/teams-service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agentId = request.headers.get('X-Agent-Id') || undefined
  const result = getTeamById(id, { requestingAgentId: agentId })
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.data)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agentId = request.headers.get('X-Agent-Id') || undefined
  const body = await request.json()
  const result = await updateTeamById(id, body, { requestingAgentId: agentId })
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.data)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agentId = request.headers.get('X-Agent-Id') || undefined
  const result = await deleteTeamById(id, { requestingAgentId: agentId })
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.data)
}
```

### Step 4: Handle async signatures
Since our `updateTeam` and `deleteTeam` are now async (due to `withLock`), the service functions that call them must become async too. Update all service functions that call registry functions to use `await`.

---

## Risk Assessment

| Item | Risk | Mitigation |
|------|------|------------|
| Service layer doesn't exist on our branch | HIGH | Must create `services/teams-service.ts` with governance or modify origin's version |
| `updateTeam` signature change (sync->async, new params) | HIGH | All callers must update; origin's service calls it sync |
| `Team` type expanded (type, chiefOfStaffId) | MEDIUM | Origin's `UpdateTeamParams` in service must include new fields |
| Missing lib files on origin | MEDIUM | Must be added alongside service changes |
| `TeamValidationException` not in origin | LOW | Simple class addition to team-registry |
| Params Promise pattern | NONE | Both sides already use it consistently |
