# Governance Type System Audit
Generated: 2026-02-16

## Summary

The governance type system is spread across 16 source files (excluding tests, docs, chat history). It defines three implicit roles (MANAGER, CHIEF-OF-STAFF, WORKER/normal) with no enum -- roles are derived from data. There is NO enforcement preventing an agent from being in multiple closed teams; only a comment says "at most one." The `Agent` type has a `team?: string` field but it is a free-text display label, NOT a foreign key to `Team.id`.

---

## 1. Types Defined

### `/Users/emanuelesabetta/ai-maestro/types/governance.ts`

| Line | Definition | Purpose |
|------|-----------|---------|
| 9 | `export type TeamType = 'open' \| 'closed'` | Team access type |
| 12-17 | `export interface GovernanceConfig { version, passwordHash, passwordSetAt, managerId }` | Singleton governance config |
| 20-25 | `export const DEFAULT_GOVERNANCE_CONFIG` | Default values (all null) |
| 28 | `export type TransferRequestStatus = 'pending' \| 'approved' \| 'rejected'` | Transfer request status |
| 31-43 | `export interface TransferRequest { id, agentId, fromTeamId, toTeamId, requestedBy, status, ... }` | Agent transfer between closed teams |
| 46-49 | `export interface TransfersFile { version, requests[] }` | Transfer storage format |

### `/Users/emanuelesabetta/ai-maestro/types/team.ts`

| Line | Definition | Purpose |
|------|-----------|---------|
| 11 | `import type { TeamType } from './governance'` | Imports TeamType |
| 13-25 | `export interface Team { id, name, description?, agentIds[], instructions?, type?, chiefOfStaffId?, ... }` | Team entity |
| 17 | `agentIds: string[]` | Agent membership (array of UUIDs) |
| 19 | `type?: TeamType` | 'open' (default) or 'closed' |
| 20 | `chiefOfStaffId?: string` | Agent UUID of team's COS |

### `/Users/emanuelesabetta/ai-maestro/types/agent.ts`

| Line | Definition | Purpose |
|------|-----------|---------|
| 152-228 | `export interface Agent { ... }` | Agent entity |
| 187 | `team?: string` | **Free-text display label**, NOT a Team.id reference |

**NOTE:** Agent has NO `teamId` field. Membership is determined solely by `Team.agentIds[]`. The `team?: string` field on Agent is a display-only label (e.g., "Backend Team") that is NOT connected to the governance system.

### `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts`

| Line | Definition | Purpose |
|------|-----------|---------|
| 7 | `export type GovernanceRole = 'manager' \| 'chief-of-staff' \| 'normal'` | Client-side role type (derived, not stored) |
| 9-28 | `export interface GovernanceState { ... }` | Full governance hook state |

---

## 2. All `chiefOfStaffId` References (source files only, excluding docs/chat history)

### Type Definitions (DEFINE)
| File | Line | Code | Action |
|------|------|------|--------|
| `/Users/emanuelesabetta/ai-maestro/types/team.ts` | 20 | `chiefOfStaffId?: string` | Defines the field on Team |

### Server-side Logic (ENFORCE/READ)
| File | Line | Code | Action |
|------|------|------|--------|
| `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` | 113 | `return team.chiefOfStaffId === agentId` | **ENFORCES** - isChiefOfStaff() check |
| `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` | 120 | `(team) => team.type === 'closed' && team.chiefOfStaffId === agentId` | **ENFORCES** - isChiefOfStaffAnywhere() |
| `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` | 58 | `if (team.chiefOfStaffId === input.requestingAgentId)` | **ENFORCES** - ACL check allows COS access |
| `/Users/emanuelesabetta/ai-maestro/lib/message-filter.ts` | 84 | `if (senderTeam.chiefOfStaffId === recipientAgentId)` | **ENFORCES** - allows closed-team member to message their COS |
| `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts` | 72 | `createTeam(data: { ...; chiefOfStaffId?: string })` | **WRITES** - accepts chiefOfStaffId on create |
| `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts` | 83 | `chiefOfStaffId: data.chiefOfStaffId` | **WRITES** - stores chiefOfStaffId |
| `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts` | 94 | `updateTeam(id, updates: Partial<Pick<Team, ...'chiefOfStaffId'>>)` | **WRITES** - accepts chiefOfStaffId on update |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts` | 45 | `const isSourceCOS = fromTeam.chiefOfStaffId === resolvedBy` | **ENFORCES** - only COS or MANAGER can resolve |
| `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts` | 39 | `updateTeam(id, { chiefOfStaffId: undefined })` | **WRITES** - removes COS |
| `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts` | 52 | `updateTeam(id, { chiefOfStaffId: agentId })` | **WRITES** - assigns COS |
| `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts` | 36 | `const { ..., chiefOfStaffId } = body` | **WRITES** - destructures from PUT body |
| `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts` | 38 | `updateTeam(id, { ..., chiefOfStaffId })` | **WRITES** - passes to updateTeam |
| `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts` | 15 | `const { ..., chiefOfStaffId } = body` | **WRITES** - destructures from POST body |
| `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts` | 25 | `createTeam({ ..., chiefOfStaffId })` | **WRITES** - passes to createTeam |

### Client-side UI (READ)
| File | Line | Code | Action |
|------|------|------|--------|
| `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts` | 44 | `t.type === 'closed' && t.chiefOfStaffId === agentId` | **READS** - derives role |
| `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts` | 52 | `allTeams.filter((t) => t.type === 'closed' && t.chiefOfStaffId === agentId)` | **READS** - derives cosTeams |
| `/Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx` | 67 | `if (fromTeam?.chiefOfStaffId === agentId) return true` | **READS** - determines if agent can resolve transfer |
| `/Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx` | 77 | `t.type === 'closed' && t.chiefOfStaffId && t.chiefOfStaffId !== agentId` | **READS** - checks if agent is in closed team led by someone else |
| `/Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx` | 188 | `team.type === 'closed' && team.chiefOfStaffId === agentId` | **READS** - shows COS badge |
| `/Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx` | 213 | `fromTeam?.chiefOfStaffId === agentId` | **READS** - can resolve transfers |
| `/Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx` | 270 | `team.chiefOfStaffId && team.chiefOfStaffId !== agentId` | **READS** - shows existing COS warning |
| `/Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx` | 272 | `(current COS: ${team.chiefOfStaffId})` | **READS** - displays current COS id |

---

## 3. All `team.type` / 'open' / 'closed' References (source files only)

### Type Definitions
| File | Line | Code | Action |
|------|------|------|--------|
| `/Users/emanuelesabetta/ai-maestro/types/governance.ts` | 9 | `export type TeamType = 'open' \| 'closed'` | Defines the type |
| `/Users/emanuelesabetta/ai-maestro/types/team.ts` | 11 | `import type { TeamType } from './governance'` | Imports |
| `/Users/emanuelesabetta/ai-maestro/types/team.ts` | 19 | `type?: TeamType` | Field on Team |

### Server-side Logic
| File | Line | Code | Action |
|------|------|------|--------|
| `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` | 120 | `team.type === 'closed' && team.chiefOfStaffId === agentId` | **READS** - isChiefOfStaffAnywhere |
| `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` | 129 | `team.type === 'closed' && team.agentIds.includes(agentId)` | **READS** - getClosedTeamForAgent |
| `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` | 138 | `team.type === 'closed' && team.agentIds.includes(agentId)` | **READS** - getClosedTeamsForAgent |
| `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` | 48 | `if (team.type !== 'closed') { return { allowed: true } }` | **ENFORCES** - open teams have no ACL |
| `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts` | 13 | `import type { TeamType } from '@/types/governance'` | Imports |
| `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts` | 72 | `createTeam(data: { ...; type?: TeamType; ... })` | **WRITES** - accepts type |
| `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts` | 82 | `type: data.type \|\| 'open'` | **WRITES** - defaults to 'open' |
| `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts` | 3 | `import type { TeamType } from '@/types/governance'` | Imports |
| `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts` | 33 | `if (team.type !== 'closed') { return error }` | **ENFORCES** - COS only for closed teams |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts` | 62 | `if (fromTeam.type !== 'closed') { return error }` | **ENFORCES** - transfers only for closed teams |

### Client-side UI
| File | Line | Code | Action |
|------|------|------|--------|
| `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts` | 44 | `t.type === 'closed'` | **READS** - role derivation |
| `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts` | 52 | `t.type === 'closed'` | **READS** - cosTeams derivation |
| `/Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx` | 58 | `t.type !== 'closed'` | **READS** - normal agents can only join open teams |
| `/Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx` | 77 | `t.type === 'closed'` | **READS** - checks closed team constraints |
| `/Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx` | 158 | `team.type === 'closed'` | **READS** - shows lock/unlock icon |
| `/Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx` | 182 | `team.type === 'closed'` | **READS** - shows lock/unlock icon |
| `/Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx` | 188 | `team.type === 'closed'` | **READS** - shows COS badge |
| `/Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx` | 85 | `governance.allTeams.filter((t) => t.type === 'closed')` | **READS** - filters closed teams for COS assignment |

---

## 4. All `agentIds` References in Team-Related Code

### Type Definitions
| File | Line | Code |
|------|------|------|
| `/Users/emanuelesabetta/ai-maestro/types/team.ts` | 17 | `agentIds: string[]` (on Team) |
| `/Users/emanuelesabetta/ai-maestro/types/team.ts` | 40 | `agentIds: string[]` (on Meeting) |

### Server-side (governance-related)
| File | Line | Code | Action |
|------|------|------|--------|
| `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` | 129 | `team.agentIds.includes(agentId)` | **READS** - getClosedTeamForAgent |
| `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` | 138 | `team.agentIds.includes(agentId)` | **READS** - getClosedTeamsForAgent |
| `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` | 63 | `team.agentIds.includes(input.requestingAgentId)` | **ENFORCES** - membership check for ACL |
| `/Users/emanuelesabetta/ai-maestro/lib/message-filter.ts` | 68 | `senderTeam.agentIds.includes(recipientAgentId)` | **ENFORCES** - same-team messaging |
| `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts` | 72-94 | `createTeam/updateTeam` | **WRITES** - stores agentIds |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts` | 57-68 | agentIds manipulation on approve | **WRITES** - moves agent between teams |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts` | 57 | `fromTeam.agentIds.includes(agentId)` | **ENFORCES** - verifies agent is in source team |

### Client-side (governance-related)
| File | Line | Code | Action |
|------|------|------|--------|
| `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts` | 57 | `t.agentIds.includes(agentId)` | **READS** - derives memberTeams |
| `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts` | 162-164 | Add agent to agentIds | **WRITES** - addAgentToTeam |
| `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts` | 191 | Filter agent from agentIds | **WRITES** - removeAgentFromTeam |

---

## 5. All `isManager` / `getManagerId` References

### Definitions
| File | Line | Code |
|------|------|------|
| `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` | 80 | `export function getManagerId(): string \| null` |
| `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` | 104 | `export function isManager(agentId: string): boolean` |

### Usage (ENFORCE)
| File | Line | Code | Action |
|------|------|------|--------|
| `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` | 10 | `import { isManager } from './governance'` | Import |
| `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` | 53 | `if (isManager(input.requestingAgentId))` | **ENFORCES** - MANAGER always has ACL access |
| `/Users/emanuelesabetta/ai-maestro/lib/message-filter.ts` | 10 | `import { isManager, ... } from './governance'` | Import |
| `/Users/emanuelesabetta/ai-maestro/lib/message-filter.ts` | 53 | `if (isManager(senderAgentId))` | **ENFORCES** - MANAGER can message anyone |
| `/Users/emanuelesabetta/ai-maestro/lib/message-filter.ts` | 60 | `if (isManager(recipientAgentId))` | **ENFORCES** - COS can reach MANAGER |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts` | 9 | `import { isManager } from '@/lib/governance'` | Import |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts` | 46 | `const isGlobalManager = isManager(resolvedBy)` | **ENFORCES** - MANAGER can resolve transfers |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts` | 10 | `import { isManager, isChiefOfStaffAnywhere } from '@/lib/governance'` | Import |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts` | 47 | `if (!isManager(requestedBy) && !isChiefOfStaffAnywhere(requestedBy))` | **ENFORCES** - only MANAGER/COS can request transfers |

### Usage (READ only, no enforcement)
| File | Line | Code | Action |
|------|------|------|--------|
| `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts` | 42 | `if (managerId === agentId) return 'manager'` | **READS** - derives role client-side (using managerId from API, NOT calling isManager directly) |

---

## 6. Multi-Closed-Team Constraint Analysis

### The Comment (intent)
| File | Line | Code |
|------|------|------|
| `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` | 124 | `/** Get the first closed team where agentId is a member (normal agents belong to at most one) */` |

### Actual Enforcement: NONE

There is **no code anywhere** that prevents an agent from being added to multiple closed teams. Specifically:

1. **`createTeam()`** (`lib/team-registry.ts:72`) -- accepts any agentIds array, no uniqueness check against other closed teams
2. **`updateTeam()`** (`lib/team-registry.ts:94`) -- same, no cross-team validation
3. **`addAgentToTeam()`** (`hooks/useGovernance.ts:152`) -- only checks if agent is already in THIS team, not other closed teams
4. **`app/api/teams/route.ts` POST** -- no validation that agents aren't already in another closed team
5. **`app/api/teams/[id]/route.ts` PUT** -- no validation either
6. **Transfer resolve** (`app/api/governance/transfers/[id]/resolve/route.ts:60-68`) -- adds agent to destination team, but does NOT verify they're not already in another closed team besides the source

### How `getClosedTeamForAgent` vs `getClosedTeamsForAgent` work:
- `getClosedTeamForAgent()` (line 125): uses `.find()` -- returns the FIRST match. The comment says "at most one" but this is not enforced.
- `getClosedTeamsForAgent()` (line 135): uses `.filter()` -- returns ALL matches. Explicitly says "MANAGER/COS can be in multiple."

### UI-level Soft Constraint:
- `TeamMembershipSection.tsx:53-58`: Normal agents can only see non-closed teams in the join dropdown. But MANAGER/COS agents (`canJoinClosedTeams`) can join any team. This is a UI filter, not a server-side enforcement.
- `TeamMembershipSection.tsx:76-83`: If agent is in a closed team led by someone else, a transfer request is created instead of direct join. But this only triggers when trying to join from the UI -- the API has no such guard.

---

## 7. Architecture Map

```
GovernanceConfig (governance.json)     Team (teams.json)
  managerId -----> Agent.id            agentIds[] -----> Agent.id[]
                                       chiefOfStaffId -> Agent.id
                                       type: 'open'|'closed'

Role derivation (client-side):
  managerId === agentId         -> 'manager'
  any closed team COS === agentId -> 'chief-of-staff'
  otherwise                     -> 'normal'

Agent.team (string)  <-- NOT connected to Team.id, display-only label
```

### Enforcement Points

```
Message Filter (lib/message-filter.ts)
  MANAGER -> anyone: ALLOW
  COS -> MANAGER/COS/own-team: ALLOW
  closed-member -> same-team + own COS: ALLOW
  outside -> closed-team member: DENY

Team ACL (lib/team-acl.ts)
  Web UI: ALLOW
  Open team: ALLOW
  MANAGER: ALLOW
  COS of team: ALLOW
  Member of team: ALLOW
  Others: DENY

Transfer System (app/api/governance/transfers/)
  Only MANAGER/COS can request
  Only source COS or MANAGER can approve/reject
  On approve: removes from source agentIds, adds to dest agentIds

COS Assignment (app/api/teams/[id]/chief-of-staff/)
  Requires governance password
  Team must be 'closed'
```

---

## 8. Key Findings and Gaps

1. **No multi-closed-team enforcement**: The comment at `lib/governance.ts:124` says "normal agents belong to at most one" closed team, but nothing enforces this at the API or registry level.

2. **Agent.team is disconnected**: The `team?: string` field on `Agent` (types/agent.ts:187) is a free-text display label with no connection to `Team.id` or the governance system.

3. **No GovernanceRole enum on server**: The `GovernanceRole` type only exists client-side in `hooks/useGovernance.ts`. Server-side code uses function calls (`isManager()`, `isChiefOfStaff()`) rather than a stored role.

4. **COS not required to be a member**: The `chiefOfStaffId` on a closed team does NOT need to be in that team's `agentIds[]`. The COS gets access via `team-acl.ts:58` checking `chiefOfStaffId` separately from `agentIds`. This is by design (COS can supervise without being "in" the team).

5. **RoleAssignmentDialog shows raw UUID**: At `RoleAssignmentDialog.tsx:272`, when showing the current COS, it displays `team.chiefOfStaffId` (the raw UUID) rather than resolving it to an agent name.
