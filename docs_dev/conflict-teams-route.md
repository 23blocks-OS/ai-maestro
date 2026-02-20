# Merge Conflict Analysis: `app/api/teams/route.ts`

Generated: 2026-02-20T02:35:00Z
Branch: `feature/team-governance` vs `origin/main`

## Summary

Origin/main introduced a **service layer refactor** (`services/teams-service.ts`) that makes `app/api/teams/route.ts` a thin wrapper. Our branch added **governance logic** (team type, chief-of-staff, validation, reserved names) directly in `route.ts`. These are **structurally incompatible** -- our governance logic must migrate into the service layer.

---

## File-by-File Comparison

### 1. `app/api/teams/route.ts`

| Aspect | origin/main | our branch |
|--------|-------------|------------|
| Imports | `listAllTeams`, `createNewTeam` from `@/services/teams-service` | `loadTeams`, `createTeam`, `TeamValidationException` from `@/lib/team-registry`; `getManagerId` from `@/lib/governance`; `loadAgents` from `@/lib/agent-registry` |
| GET handler | Thin wrapper: `listAllTeams()` -> return `result.data` | Direct: `loadTeams()` -> return `{ teams }` |
| POST handler | Thin wrapper: `createNewTeam(body)` -> return result | Full validation logic inline (type, agentIds, managerId, agentNames, TeamValidationException catch) |
| Error handling | Service returns `{ error, status }` tuple | Try/catch with `TeamValidationException` |
| Body fields | `{ name, description, agentIds }` | `{ name, description, agentIds, type, chiefOfStaffId }` |
| Lines of code | 15 lines | 55 lines |

**Conflict type:** STRUCTURAL + SEMANTIC. Both files rewrite the same route with incompatible patterns.

### 2. `lib/team-registry.ts` - `createTeam` signature

| Aspect | origin/main | our branch |
|--------|-------------|------------|
| Signature | `createTeam(data: { name, description?, agentIds })` | `createTeam(data: { name, description?, agentIds, type?, chiefOfStaffId? }, managerId?, reservedNames?)` |
| Return type | `Team` (sync) | `Promise<Team>` (async, uses `withLock`) |
| Validation | None | Full `validateTeamMutation()` call |
| Team fields set | `name, description, agentIds` | `name, description, agentIds, type, chiefOfStaffId` + sanitized values |

### 3. `services/teams-service.ts` (origin/main only)

- `CreateTeamParams`: `{ name, description?, agentIds? }` -- **does NOT include** `type`, `chiefOfStaffId`, `managerId`, or `agentNames`
- `createNewTeam()`: Does basic name/agentIds validation, calls `createTeam({ name, description, agentIds: agentIds || [] })` -- **no governance params**
- `updateTeam()` call: No `managerId` or `reservedNames` params
- `ServiceResult<T>` pattern: Returns `{ data?, error?, status }` instead of throwing exceptions

### 4. `types/team.ts` - `Team` interface

| Field | origin/main | our branch |
|-------|-------------|------------|
| `type` | absent | `type: TeamType` (required, always present via migration) |
| `chiefOfStaffId` | absent | `chiefOfStaffId?: string \| null` |

### 5. Files that exist only on our branch (not on origin/main)

- `lib/governance.ts` -- provides `getManagerId()`, governance config
- `types/governance.ts` -- provides `TeamType` enum/type

---

## What Governance Logic Must Move Into `services/teams-service.ts`

### A. `createNewTeam()` needs these additions:

1. **Accept governance params**: `type?: TeamType`, `chiefOfStaffId?: string`
2. **Validate `type` field**: Must be `'open'` or `'closed'` if provided (CC-007)
3. **Validate `agentIds` elements**: Each must be a string (CC-011)
4. **Resolve `managerId`**: Call `getManagerId()` from `@/lib/governance` for R4.1 multi-closed-team constraint
5. **Resolve `agentNames`**: Call `loadAgents()` from `@/lib/agent-registry` and extract names for R2.1 name collision check
6. **Pass governance params to `createTeam()`**: `{ name, description, agentIds, type, chiefOfStaffId }, managerId, agentNames`
7. **Handle `TeamValidationException`**: Convert to `ServiceResult` error format (not throw, but catch and return `{ error, status }`)

### B. `updateTeamById()` needs these additions:

1. **Accept governance params**: `type?`, `chiefOfStaffId?` in `UpdateTeamParams`
2. **Resolve `managerId` and `agentNames`** for update validation
3. **Handle `TeamValidationException`** from `updateTeam()`

### C. `CreateTeamParams` interface needs expansion:

```typescript
export interface CreateTeamParams {
  name: string
  description?: string
  agentIds?: string[]
  type?: TeamType          // NEW
  chiefOfStaffId?: string  // NEW
}
```

### D. `UpdateTeamParams` interface needs expansion:

```typescript
export interface UpdateTeamParams {
  name?: string
  description?: string
  agentIds?: string[]
  lastMeetingAt?: string
  instructions?: string
  lastActivityAt?: string
  type?: TeamType           // NEW
  chiefOfStaffId?: string   // NEW
}
```

---

## Semantic Conflicts (Different Behavior for Same Input)

### S1: `createTeam` is now async
- **origin/main**: `createTeam()` is synchronous, returns `Team`
- **our branch**: `createTeam()` is async (uses `withLock()`), returns `Promise<Team>`
- **Impact**: `createNewTeam()` in the service must become async, and the route handler must await it. The service currently returns `ServiceResult` synchronously -- this must change to `Promise<ServiceResult>`.

### S2: `updateTeam` is now async
- Same issue as S1. Origin's `updateTeam()` is sync; ours is async with locking.
- **Impact**: `updateTeamById()` must become async.

### S3: `deleteTeam` is now async
- Same issue. Origin's `deleteTeam()` is sync; ours is async with locking.
- **Impact**: `deleteTeamById()` must become async.

### S4: Error signaling mechanism differs
- **origin/main service**: Returns `{ error, status }` tuples (never throws)
- **our branch lib**: Throws `TeamValidationException` with `.code` and `.message`
- **Resolution**: The service layer must catch `TeamValidationException` and convert to `ServiceResult` format. The route layer stays thin (no try/catch for business rules).

### S5: Response shape for GET /api/teams
- **origin/main**: Returns `{ teams: [...] }` (via `listAllTeams()`)
- **our branch**: Returns `{ teams: [...] }` (directly)
- **No conflict** -- same shape.

### S6: Team object now has extra fields
- **origin/main**: Team has no `type` or `chiefOfStaffId`
- **our branch**: Team always has `type` (migrated on load) and optionally `chiefOfStaffId`
- **Impact**: Frontend and other consumers will see new fields. Non-breaking since they are additive.

---

## Specific Changes Needed for Reconciliation

### Step 1: Merge `types/team.ts`
- Add `type: TeamType` and `chiefOfStaffId?: string | null` to the `Team` interface on main
- Add `import type { TeamType } from '@/types/governance'`
- Ensure `types/governance.ts` is included in the merge

### Step 2: Merge `lib/team-registry.ts`
- Replace origin's simple `createTeam`, `updateTeam`, `deleteTeam` with our governance-aware async versions
- Add `TeamValidationException`, `sanitizeTeamName`, `validateTeamMutation`, `withLock` etc.

### Step 3: Update `services/teams-service.ts`
Add governance params and async handling:

```typescript
import { loadTeams, createTeam, getTeam, updateTeam, deleteTeam, TeamValidationException } from '@/lib/team-registry'
import { getManagerId } from '@/lib/governance'
import { loadAgents } from '@/lib/agent-registry'
import type { TeamType } from '@/types/governance'

export interface CreateTeamParams {
  name: string
  description?: string
  agentIds?: string[]
  type?: TeamType
  chiefOfStaffId?: string
}

export interface UpdateTeamParams {
  name?: string
  description?: string
  agentIds?: string[]
  lastMeetingAt?: string
  instructions?: string
  lastActivityAt?: string
  type?: TeamType
  chiefOfStaffId?: string
}

export async function createNewTeam(params: CreateTeamParams): Promise<ServiceResult<{ team: any }>> {
  const { name, description, agentIds, type, chiefOfStaffId } = params

  if (!name || typeof name !== 'string') {
    return { error: 'Team name is required', status: 400 }
  }
  if (agentIds && (!Array.isArray(agentIds) || !agentIds.every((id: unknown) => typeof id === 'string'))) {
    return { error: 'agentIds must be an array of strings', status: 400 }
  }
  if (type !== undefined && type !== 'open' && type !== 'closed') {
    return { error: 'type must be "open" or "closed"', status: 400 }
  }

  try {
    const managerId = getManagerId()
    const allAgents = loadAgents()
    const agentNames = allAgents.map(a => a.name).filter(Boolean) as string[]
    const team = await createTeam(
      { name, description, agentIds: agentIds || [], type, chiefOfStaffId },
      managerId,
      agentNames
    )
    return { data: { team }, status: 201 }
  } catch (error) {
    if (error instanceof TeamValidationException) {
      return { error: error.message, status: error.code }
    }
    console.error('Failed to create team:', error)
    return { error: error instanceof Error ? error.message : 'Failed to create team', status: 500 }
  }
}
```

Similarly update `updateTeamById()` and `deleteTeamById()` to be async and handle `TeamValidationException`.

### Step 4: Keep `app/api/teams/route.ts` thin (origin's pattern)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { listAllTeams, createNewTeam } from '@/services/teams-service'

export async function GET() {
  const result = listAllTeams()
  return NextResponse.json(result.data, { status: result.status })
}

export async function POST(request: NextRequest) {
  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await createNewTeam(body)  // now async
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
```

### Step 5: Ensure `lib/governance.ts` and `types/governance.ts` are included in merge
These files only exist on our branch and must be carried over.

### Step 6: Update all other route files that call service functions
Check `app/api/teams/[id]/route.ts` and nested routes -- they likely need async handling for `updateTeamById()`, `deleteTeamById()`, and governance param forwarding.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Forgetting to pass `managerId`/`agentNames` through service | HIGH | R4.1 constraint would be silently unenforced |
| Sync-to-async mismatch causing unhandled promises | HIGH | TypeScript will catch if return types updated |
| `TeamValidationException` not caught in service | MEDIUM | Would propagate as 500 instead of proper 4xx |
| Frontend sending `type`/`chiefOfStaffId` but service ignoring them | MEDIUM | Would silently create teams as `open` type |
| `loadTeams()` migration for `type` field not running | LOW | Our `loadTeams()` already handles migration |

---

## Conclusion

The merge requires **moving all governance logic from our `route.ts` into origin's `services/teams-service.ts`**. The key changes are:
1. Expand `CreateTeamParams` and `UpdateTeamParams` with governance fields
2. Make `createNewTeam`, `updateTeamById`, `deleteTeamById` async
3. Add `TeamValidationException` catch-and-convert in each service function
4. Inject `managerId` (from `getManagerId()`) and `agentNames` (from `loadAgents()`) inside the service, not the route
5. Keep the route file thin per origin's pattern
6. Carry over `lib/governance.ts`, `types/governance.ts`, and the expanded `types/team.ts`
