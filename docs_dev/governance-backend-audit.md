# Governance Backend Audit Report
Generated: 2026-02-16T18:36Z

## Summary

The governance backend is spread across 7 API route files, 4 library files, 2 type definition files, and 1 ACL module. The system implements a role-based team governance model with MANAGER (singleton global role), Chief-of-Staff (per closed team), and normal members. Key gaps found: **no duplicate team name check**, **no COS-required-for-closed-team enforcement**, **no validation when changing team type from open to closed**, **updateTeam is a blind merge with zero business-rule guards**, and **the COS endpoint does NOT check if COS is already a member of the team**.

---

## 1. Team Creation: `app/api/teams/route.ts` (35 lines)

**Path:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts`

### Exported handlers
- `GET()` -- returns all teams from `loadTeams()`
- `POST(request)` -- creates a new team

### Validation in POST handler
| Check | Present? | Details |
|-------|----------|---------|
| `name` required + is string | YES | Line 17-19 |
| `agentIds` is array (if provided) | YES | Line 21-23 |
| `type` validation (must be 'open' or 'closed') | **NO** | Any string value accepted, passed straight to `createTeam` |
| Duplicate team name check | **NO** | No check if a team with the same name already exists |
| `chiefOfStaffId` validation | **NO** | Not validated at all (not checked if agent exists, not checked if COS is needed for closed) |
| COS required for closed teams | **NO** | Can create a closed team without a COS |
| Agent existence check | **NO** | `agentIds` are not verified against agent registry |
| Min/max agentIds | **NO** | Empty array is fine, no upper limit |
| Name length/format | **NO** | Any non-empty string accepted |

### Data flow
```
POST body {name, description, agentIds, type, chiefOfStaffId}
  --> minimal validation (name required, agentIds is array)
  --> createTeam(data)  [lib/team-registry.ts]
  --> returns {team} with 201
```

### Gaps
1. **No TeamType validation** -- `type` could be `"banana"` and it would be stored
2. **No duplicate name check** -- two teams can have identical names
3. **No COS enforcement for closed teams** -- closed team can be created without a COS
4. **No agent existence check** -- agentIds can reference non-existent agents
5. **No COS agent existence check** -- chiefOfStaffId not validated
6. **No ACL check** -- any request can create a team (no `checkTeamAccess`)

---

## 2. Team Update: `app/api/teams/[id]/route.ts` (70 lines)

**Path:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts`

### Exported handlers
- `GET(request, {params})` -- get single team (with ACL check)
- `PUT(request, {params})` -- update team (with ACL check)
- `DELETE(request, {params})` -- delete team (with ACL check)

### Validation in PUT handler
| Check | Present? | Details |
|-------|----------|---------|
| Team ACL (checkTeamAccess) | YES | Line 31-34, uses `X-Agent-Id` header |
| Team exists (via updateTeam return) | YES | Returns 404 if `updateTeam` returns null |
| Type change validation (open->closed) | **NO** | Can switch to closed without a COS |
| Type change validation (closed->open) | **NO** | Can switch to open, orphaning COS role |
| COS change validation | **NO** | `chiefOfStaffId` passed blindly to updateTeam |
| Name uniqueness | **NO** | No duplicate name check |
| Agent existence in agentIds | **NO** | Not validated |
| Type enum validation | **NO** | `type` not validated as 'open'|'closed' |
| Governance password for type changes | **NO** | Type changes require no auth beyond ACL |

### Data flow
```
PUT body {name, description, agentIds, lastMeetingAt, instructions, lastActivityAt, type, chiefOfStaffId}
  --> checkTeamAccess (X-Agent-Id header)
  --> updateTeam(id, { ...allFields })  [blind merge, zero business logic]
  --> returns {team} or 404
```

### Gaps
1. **updateTeam is a blind merge** -- any field can be changed without business-rule validation
2. **Type change from open to closed** -- no check that a COS exists or is assigned
3. **Type change from closed to open** -- no cleanup of COS, no check if transfers are pending
4. **COS can be set on open teams** -- no check that type is 'closed' before accepting chiefOfStaffId
5. **No governance password required** for structural changes (type/COS)
6. **Agent membership can be changed freely** -- could remove COS from agentIds while leaving chiefOfStaffId set

---

## 3. Team Registry: `lib/team-registry.ts` (119 lines)

**Path:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`

### Exports
| Function | Signature | Description |
|----------|-----------|-------------|
| `loadTeams()` | `() => Team[]` | Reads teams.json, migrates missing `type` to 'open' |
| `saveTeams(teams)` | `(teams: Team[]) => boolean` | Writes teams.json |
| `getTeam(id)` | `(id: string) => Team \| null` | Find by ID |
| `createTeam(data)` | `(data: {name, description?, agentIds, type?, chiefOfStaffId?}) => Promise<Team>` | Creates team with UUID, wraps in file lock |
| `updateTeam(id, updates)` | `(id: string, updates: Partial<...>) => Promise<Team \| null>` | Merges updates blindly, wraps in file lock |
| `deleteTeam(id)` | `(id: string) => Promise<boolean>` | Removes from array, wraps in file lock |

### Key implementation details
- **Storage**: `~/.aimaestro/teams/teams.json` with `TeamsFile` format (`{version: 1, teams: []}`)
- **Locking**: All write operations (`createTeam`, `updateTeam`, `deleteTeam`) use `withLock('teams', ...)` from `lib/file-lock.ts`
- **Migration**: `loadTeams()` auto-adds `type: 'open'` to teams missing it (lines 36-46)
- **IDs**: Generated with `uuid.v4()`

### Validation/constraints in the registry
| Check | Present? |
|-------|----------|
| Duplicate name check | **NO** |
| Agent existence check | **NO** |
| COS must be member of team | **NO** |
| COS only on closed teams | **NO** |
| Type enum validation | **NO** |
| Cascade on delete (tasks, transfers, meetings) | **NO** |
| Agent can only be in one closed team | **NO** (enforced nowhere) |

### Gaps
1. **`createTeam` has ZERO validation** -- it trusts whatever data is passed in
2. **`updateTeam` is a blind object spread** -- `{...teams[index], ...updates}` with no guards
3. **No referential integrity** -- deleting a team doesn't clean up related transfers, tasks, or meetings
4. **No uniqueness constraint on team names**
5. **No constraint preventing an agent from being in multiple closed teams** (even though `getClosedTeamForAgent` in governance.ts returns only the first one, implying at most one)

---

## 4. Governance: `lib/governance.ts` (140 lines)

**Path:** `/Users/emanuelesabetta/ai-maestro/lib/governance.ts`

### Exports
| Function | Signature | Description |
|----------|-----------|-------------|
| `loadGovernance()` | `() => GovernanceConfig` | Reads governance.json, creates with defaults if missing |
| `saveGovernance(config)` | `(config: GovernanceConfig) => boolean` | Writes governance.json |
| `setPassword(plaintext)` | `(plaintext: string) => Promise<void>` | bcrypt hash (12 rounds), stores in governance.json, uses file lock |
| `verifyPassword(plaintext)` | `(plaintext: string) => boolean` | Compare with stored hash |
| `getManagerId()` | `() => string \| null` | Returns managerId from config |
| `setManager(agentId)` | `(agentId: string) => Promise<void>` | Sets managerId, uses file lock |
| `removeManager()` | `() => Promise<void>` | Sets managerId to null, uses file lock |
| `isManager(agentId)` | `(agentId: string) => boolean` | Check if agentId equals stored managerId |
| `isChiefOfStaff(agentId, teamId)` | `(agentId: string, teamId: string) => boolean` | Check if agentId is COS for specific team |
| `isChiefOfStaffAnywhere(agentId)` | `(agentId: string) => boolean` | Check if agentId is COS in any closed team |
| `getClosedTeamForAgent(agentId)` | `(agentId: string) => Team \| null` | First closed team where agent is member |
| `getClosedTeamsForAgent(agentId)` | `(agentId: string) => Team[]` | All closed teams where agent is member |

### COS assignment/removal

COS is **NOT tracked in governance.ts**. COS is stored as `chiefOfStaffId` on the `Team` object in `teams.json`. The governance library only has **read** functions for COS (`isChiefOfStaff`, `isChiefOfStaffAnywhere`).

COS is **assigned/removed** via:
1. `app/api/teams/[id]/chief-of-staff/route.ts` POST -- dedicated endpoint with password protection
2. `app/api/teams/[id]/route.ts` PUT -- passes `chiefOfStaffId` as a regular update field (NO password protection)
3. `app/api/teams/route.ts` POST -- passes `chiefOfStaffId` during creation (NO password protection)

**Gap**: Routes 2 and 3 bypass the governance password, allowing COS to be set/changed without authentication.

### Key implementation details
- **Storage**: `~/.aimaestro/governance.json` with `GovernanceConfig` format
- **Password**: bcrypt with 12 salt rounds
- **Manager**: Singleton role (one agent globally)
- **COS**: Per-team, stored on Team objects, not in governance.json
- **File locking**: `setPassword`, `setManager`, `removeManager` all use `withLock('governance', ...)`

### Gaps
1. **COS bypass via PUT /api/teams/[id]** -- chiefOfStaffId can be changed without governance password
2. **COS bypass via POST /api/teams** -- chiefOfStaffId can be set at creation without governance password
3. **No check that COS agent is a member of the team**
4. **No check that COS agent isn't already COS of another team** (is it allowed to be COS of multiple teams?)
5. **`isChiefOfStaffAnywhere` only checks closed teams** -- consistent with design but could be confusing if a closed team gets changed to open with COS still set

---

## 5. COS Assignment: `app/api/teams/[id]/chief-of-staff/route.ts` (62 lines)

**Path:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts`

### Exported handlers
- `POST(request, {params})` -- assign or remove COS for a team

### Validation
| Check | Present? | Details |
|-------|----------|---------|
| Password required | YES | Lines 15-16 |
| Governance password hash exists | YES | Lines 20-21 |
| Password verification | YES | Lines 24-26 |
| Team exists | YES | Lines 28-31 |
| Team must be closed | YES | Lines 33-35: `team.type !== 'closed'` |
| agentId=null removes COS | YES | Lines 37-41 |
| agentId must be non-empty string | YES | Lines 43-45 |
| Agent exists in registry | YES | Lines 47-50 |
| Agent is member of the team | **NO** | COS can be assigned to any registered agent |
| Agent is not COS of another team | **NO** | Could create multi-team COS |
| Agent is not the MANAGER | **NO** | MANAGER could also be COS |
| ACL check (X-Agent-Id) | **NO** | Only password-protected, no agent identity check |

### Data flow
```
POST body {agentId, password}
  --> validate password exists and matches
  --> verify team exists and is closed
  --> if agentId===null: remove COS
  --> if agentId: verify agent exists in registry
  --> updateTeam(id, {chiefOfStaffId: agentId})
  --> return {success, team, chiefOfStaffName}
```

### Gaps
1. **COS not required to be team member** -- can assign any agent as COS even if not in the team
2. **No multi-COS prevention** -- agent can be COS of multiple closed teams simultaneously
3. **No MANAGER exclusion** -- MANAGER could also serve as COS (is this intended?)

---

## 6. Transfer Registry: `lib/transfer-registry.ts` (132 lines)

**Path:** `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts`

### Exports
| Function | Signature | Description |
|----------|-----------|-------------|
| `loadTransfers()` | `() => TransferRequest[]` | Reads governance-transfers.json |
| `createTransferRequest(params)` | `(params: {agentId, fromTeamId, toTeamId, requestedBy, note?}) => Promise<TransferRequest>` | Creates pending request with file lock |
| `getTransferRequest(id)` | `(id: string) => TransferRequest \| null` | Find by ID |
| `getPendingTransfersForTeam(teamId)` | `(teamId: string) => TransferRequest[]` | Pending requests where team is source |
| `getPendingTransfersForAgent(agentId)` | `(agentId: string) => TransferRequest[]` | Pending requests for specific agent |
| `resolveTransferRequest(id, status, resolvedBy, rejectReason?)` | `(...) => Promise<TransferRequest \| null>` | Approve/reject, with idempotency check (already-resolved returns null) |
| `cleanupOldTransfers()` | `() => Promise<number>` | Remove resolved requests older than 30 days |

### Validation in the registry itself
| Check | Present? |
|-------|----------|
| Already-resolved idempotency | YES | `resolveTransferRequest` checks `status !== 'pending'` (line 101) |
| File locking | YES | All writes use `withLock('transfers', ...)` |

### Validation in the API routes

**POST `/api/governance/transfers`** (create):
| Check | Present? | Details |
|-------|----------|---------|
| Required fields | YES | agentId, fromTeamId, toTeamId, requestedBy |
| Requester is MANAGER or COS | YES | Lines 47-49 |
| Agent is in source team | YES | Lines 53-59 |
| Source team is closed | YES | Lines 62-64 |
| Duplicate pending request check | YES | Lines 67-71 |
| Destination team exists | **NO** | `toTeamId` not verified |
| Destination team is different from source | **NO** | Same-team transfer possible |
| Agent is not the COS of source team | **NO** | Could transfer the COS away |

**POST `/api/governance/transfers/[id]/resolve`** (resolve):
| Check | Present? | Details |
|-------|----------|---------|
| Required fields (action, resolvedBy) | YES | Lines 22-27 |
| Transfer request exists | YES | Lines 30-33 |
| Request is still pending | YES | Lines 34-36 |
| Resolver is source COS or MANAGER | YES | Lines 45-50 |
| On approval: removes from source, adds to dest | YES | Lines 60-69 |
| Notification to affected agent | YES | Lines 73-95 (fire-and-forget) |
| Destination team still exists at resolution time | PARTIAL | Uses `toTeam` but doesn't error if null (line 66: `if (toTeam && ...)`) |

### Gaps
1. **Destination team not validated on creation** -- toTeamId could reference a non-existent team
2. **Same-team transfer allowed** -- no check that fromTeamId !== toTeamId
3. **COS can be transferred out** -- no guard against removing the COS from their own team
4. **No check that destination is a closed team** (or any team at all)
5. **Storage**: Uses `governance-transfers.json` (different from `teams.json`)

---

## 7. Message Filter: `lib/message-filter.ts` (103 lines)

**Path:** `/Users/emanuelesabetta/ai-maestro/lib/message-filter.ts`

### Exports
| Symbol | Type | Description |
|--------|------|-------------|
| `MessageFilterInput` | interface | `{senderAgentId: string \| null, recipientAgentId: string, isMeshForwarded?: boolean}` |
| `MessageFilterResult` | interface | `{allowed: boolean, reason?: string}` |
| `checkMessageAllowed(input)` | function | Main reachability check |

### Algorithm (7 steps)
1. **Mesh-forwarded** (senderAgentId null): always allowed
2. **Neither in closed team**: allowed (open world)
3. **Sender is MANAGER**: always allowed
4. **Sender is COS**: can reach MANAGER, other COS, own team members
5. **Sender is normal closed-team member**: can reach same-team members and own COS
6. **Outside sender to closed-team recipient**: denied
7. **Default**: allowed

### Dependencies
- `isManager(agentId)` from `./governance`
- `isChiefOfStaffAnywhere(agentId)` from `./governance`
- `getClosedTeamForAgent(agentId)` from `./governance`

### Where it is called
- `lib/message-send.ts` line 153-161: `sendFromUI()` checks `checkMessageAllowed()` before routing
- `app/api/governance/reachable/route.ts` line 32-36: iterates all agents to compute reachable set (cached 5s)

### Gaps/Edge cases
1. **`isMeshForwarded` field is declared but never used** -- Step 1 checks `senderAgentId === null` instead
2. **COS membership check uses `getClosedTeamForAgent`** (returns first closed team only) -- if COS is in multiple closed teams, Step 4 line 68 only checks the first team's members
3. **Normal member check at Step 5** -- uses `getClosedTeamForAgent` which returns only the first closed team. If an agent is somehow in multiple closed teams (no constraint prevents this), only the first is checked
4. **COS not in own team's agentIds** -- if COS is assigned but not in `team.agentIds`, the COS's own members can't reach back (Step 5 line 80 checks `senderTeam.id === recipientTeam.id`, but COS might have a different `getClosedTeamForAgent` result)
5. **No rate limiting or abuse protection** on the reachable endpoint

---

## 8. Supporting Modules

### `lib/team-acl.ts` (69 lines)
**Path:** `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts`

Exports:
- `TeamAccessInput` interface: `{teamId: string, requestingAgentId?: string}`
- `TeamAccessResult` interface: `{allowed: boolean, reason?: string}`
- `checkTeamAccess(input)` function

Decision order: Web UI (no agentId) -> Team not found -> Open team -> MANAGER -> COS -> Member -> Denied.

Used by: `app/api/teams/[id]/route.ts` for GET, PUT, DELETE.

### `lib/file-lock.ts` (69 lines)
**Path:** `/Users/emanuelesabetta/ai-maestro/lib/file-lock.ts`

Provides `withLock(name, fn)` for file-based mutex. Used by team-registry, governance, and transfer-registry for all write operations.

### `lib/notification-service.ts` (181 lines)
**Path:** `/Users/emanuelesabetta/ai-maestro/lib/notification-service.ts`

Provides `notifyAgent()` for tmux-based push notifications. Used by transfer resolve endpoint.

---

## 9. Type Definitions

### `types/governance.ts` (49 lines)
```typescript
export type TeamType = 'open' | 'closed'

export interface GovernanceConfig {
  version: 1
  passwordHash: string | null
  passwordSetAt: string | null
  managerId: string | null
}

export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
  version: 1, passwordHash: null, passwordSetAt: null, managerId: null
}

export type TransferRequestStatus = 'pending' | 'approved' | 'rejected'

export interface TransferRequest {
  id: string; agentId: string; fromTeamId: string; toTeamId: string;
  requestedBy: string; status: TransferRequestStatus; createdAt: string;
  resolvedAt?: string; resolvedBy?: string; note?: string; rejectReason?: string
}

export interface TransfersFile { version: 1; requests: TransferRequest[] }
```

### `types/team.ts` (98 lines)
```typescript
export interface Team {
  id: string; name: string; description?: string; agentIds: string[];
  instructions?: string; type?: TeamType; chiefOfStaffId?: string;
  createdAt: string; updatedAt: string;
  lastMeetingAt?: string; lastActivityAt?: string
}

export interface TeamsFile { version: 1; teams: Team[] }
```

Note: `Team.type` is `TeamType | undefined` (optional), meaning old teams without a type are treated as open via migration in `loadTeams()`.

---

## 10. Tests

| Test file | Path |
|-----------|------|
| governance.test.ts | `/Users/emanuelesabetta/ai-maestro/tests/governance.test.ts` |
| team-registry.test.ts | `/Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts` |
| transfer-registry.test.ts | `/Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts` |
| message-filter.test.ts | **DOES NOT EXIST** |

---

## 11. Critical Gap Summary

### HIGH PRIORITY

| # | Gap | Location | Risk |
|---|-----|----------|------|
| 1 | **No duplicate team name check** | `createTeam()` and `updateTeam()` in team-registry.ts | Two teams with same name, confusing UI |
| 2 | **COS bypass via PUT /api/teams/[id]** | teams/[id]/route.ts line 38 | COS can be changed without governance password |
| 3 | **COS bypass via POST /api/teams** | teams/route.ts line 25 | COS can be set at creation without governance password |
| 4 | **No COS-required-for-closed validation** | createTeam, updateTeam, PUT handler | Closed team can exist without COS, breaking governance model |
| 5 | **No type change validation** | PUT handler, updateTeam | Open team can become closed (no COS) or closed become open (orphan COS, pending transfers) |
| 6 | **updateTeam has zero business-rule guards** | team-registry.ts line 94-108 | Blind merge allows any invalid state |
| 7 | **COS not required to be team member** | chief-of-staff/route.ts | COS may not be in team's agentIds, breaking message filter |
| 8 | **No agent-in-one-closed-team constraint** | team-registry.ts | Agent can be in multiple closed teams, but message-filter uses `getClosedTeamForAgent` (first only) |

### MEDIUM PRIORITY

| # | Gap | Location | Risk |
|---|-----|----------|------|
| 9 | **Destination team not validated in transfer create** | transfers/route.ts POST | Transfer to non-existent team |
| 10 | **Same-team transfer allowed** | transfers/route.ts POST | Nonsensical request |
| 11 | **COS can be transferred out of own team** | transfers resolve | Team left without COS |
| 12 | **Type enum not validated at API layer** | POST/PUT teams | Invalid type values stored |
| 13 | **Agent existence not validated in agentIds** | createTeam, updateTeam | Ghost agents in team |
| 14 | **No cascade on team delete** | deleteTeam | Orphan transfers, tasks, meetings |
| 15 | **No message-filter test file** | tests/ | Critical business logic untested |
| 16 | **`isMeshForwarded` declared but unused** | message-filter.ts | Dead field in interface |

### LOW PRIORITY

| # | Gap | Location | Risk |
|---|-----|----------|------|
| 17 | No rate limiting on reachable endpoint | governance/reachable/route.ts | Performance abuse |
| 18 | No name length/format validation | teams POST/PUT | Very long or special char names |
| 19 | MANAGER can also be COS | chief-of-staff/route.ts | Role confusion |
| 20 | No ACL on team creation | teams/route.ts POST | Any agent can create teams |

---

## 12. Architecture Diagram

```
                     +---------------------------+
                     |     Web UI / Agent CLI     |
                     +---------------------------+
                                |
           +--------------------+--------------------+
           |                    |                    |
    POST /api/teams      PUT /api/teams/[id]   POST /api/teams/[id]/chief-of-staff
    (create team)        (update team)          (assign/remove COS)
           |                    |                    |
           |                    |                    +--- verifyPassword()
           |                    |                    +--- getTeam()
           |                    +--- checkTeamAccess()   updateTeam()
           |                    +--- updateTeam()
           +--- createTeam()
           |
           v
    +-------------------+        +-------------------+
    | lib/team-registry |  <-->  | lib/governance    |
    | teams.json        |        | governance.json   |
    | (CRUD, no rules)  |        | (password, roles) |
    +-------------------+        +-------------------+
                                        |
                                        v
    +-------------------+        +-------------------+
    | lib/team-acl      |        | lib/message-filter|
    | (access control)  |        | (reachability)    |
    +-------------------+        +-------------------+
                                        |
                                        v
    +-------------------+        +-------------------+
    | lib/transfer-     |        | lib/message-send  |
    | registry          |        | (applies filter)  |
    | (approval flow)   |        +-------------------+
    +-------------------+
```
