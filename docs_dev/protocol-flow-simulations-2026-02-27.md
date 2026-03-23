# Protocol Flow Simulations -- AI Maestro Governance System

**Date:** 2026-02-27
**Scope:** 9 step-by-step protocol flows + authority matrix
**Based on:** Actual codebase (routes, services, lib, types) as of commit b30df8a

---

## Table of Contents

1. [Flow 1: User Creates Team via AMAMA (Manager Plugin)](#flow-1-user-creates-team-via-amama-manager-plugin)
2. [Flow 2: User Assigns Chief-of-Staff](#flow-2-user-assigns-chief-of-staff)
3. [Flow 3: Path A -- Reassign Unassigned Agent to Team](#flow-3-path-a----reassign-unassigned-agent-to-team)
4. [Flow 4: Path A -- Reassign Agent from Closed Team (Transfer)](#flow-4-path-a----reassign-agent-from-closed-team-transfer)
5. [Flow 5: Path B -- Create Agent via Haephestos (Agent Creation Helper)](#flow-5-path-b----create-agent-via-haephestos-agent-creation-helper)
6. [Flow 6: Path C -- Create Agent with PSS (Skill Suggester)](#flow-6-path-c----create-agent-with-pss-skill-suggester)
7. [Flow 7: Path D -- Transfer from Closed Team (Same Host)](#flow-7-path-d----transfer-from-closed-team-same-host)
8. [Flow 8: Path D -- Transfer from Closed Team (Cross-Host)](#flow-8-path-d----transfer-from-closed-team-cross-host)
9. [Flow 9: COS Receives Design Requirements and Creates Agents](#flow-9-cos-receives-design-requirements-and-creates-agents)
10. [Authority Matrix](#authority-matrix)

---

## Flow 1: User Creates Team via AMAMA (Manager Plugin)

### Actors
- **User** (instructs AMAMA via natural language in tmux session)
- **AMAMA** (Manager plugin agent, agentId matches `governance.managerId`)

### Preconditions
- Governance password is set (`governance.json.passwordHash != null`)
- AMAMA agent is registered in agent registry (`~/.aimaestro/agents/registry.json`)
- AMAMA agent's UUID is set as `managerId` in `~/.aimaestro/governance.json`
- AMAMA has a valid AMP API key (registered with AI Maestro provider)

### Steps

```
  User                    AMAMA                      AI Maestro API
   |                        |                              |
   |-- "Create team X" ---->|                              |
   |                        |                              |
   |                        |-- POST /api/teams ---------->|
   |                        |   Headers:                   |
   |                        |     Authorization: Bearer <key>
   |                        |     X-Agent-Id: <managerId>  |
   |                        |   Body: {                    |
   |                        |     "name": "Team X",        |
   |                        |     "description": "...",    |
   |                        |     "agentIds": [],          |
   |                        |     "type": "open"           |
   |                        |   }                          |
   |                        |                              |
   |                        |   <-- 201 { team: {...} } ---|
   |                        |                              |
   |<-- "Team X created" ---|                              |
```

### Server Checks (in order)

1. **`authenticateAgent()`** (lib/agent-auth.ts):
   - Authorization header present --> validate AMP API key via `authenticateRequest()`
   - API key resolves to agentId; if X-Agent-Id header present, must match authenticated agentId
   - Failure: 401 `Invalid or expired API key` or 403 `X-Agent-Id does not match`

2. **`createNewTeam()`** (services/teams-service.ts L141-183):
   - Validates `name` is non-empty string
   - Validates `agentIds` is array (if provided)
   - Validates `type` is `"open"` or `"closed"` (if provided)
   - **Governance ACL** (L157-163): `requestingAgentId` is present (AMAMA is an agent, not web UI).
     Loads `managerId` from governance.json. If `managerId` is set AND `requestingAgentId !== managerId`, returns 403:
     `"Only the MANAGER agent can create teams."`
   - If AMAMA's UUID matches managerId: proceeds

3. **`createTeam()`** (lib/team-registry.ts):
   - Team name collision check against existing teams and agent names
   - Assigns UUID, sets `createdAt`
   - Defaults type to `"open"` if not specified
   - Writes to `~/.aimaestro/teams/teams.json`

### Success Condition
- HTTP 201 returned with team object
- Team persisted in `teams.json` with type `"open"`, empty `agentIds`, `chiefOfStaffId: null`

### Failure Points
| Point | Condition | HTTP | Error |
|-------|-----------|------|-------|
| Auth | Invalid/expired API key | 401 | `Invalid or expired API key` |
| Auth | X-Agent-Id mismatch | 403 | `X-Agent-Id does not match authenticated agent identity` |
| ACL | Agent is not MANAGER | 403 | `Only the MANAGER agent can create teams` |
| Validation | Empty team name | 400 | `Team name is required` |
| Collision | Team name already exists | 409 | `Team name already exists` |

### Governance Rules Exercised
- **G1**: Only MANAGER or web UI can create teams (teams-service.ts L157-163)

---

## Flow 2: User Assigns Chief-of-Staff

### Actors
- **User** (via dashboard UI or direct API call)
- **AI Maestro API** (validates governance password)

### Preconditions
- Team exists in `teams.json`
- Target agent exists in agent registry
- Governance password is set in `governance.json`
- User knows the governance password

### Steps

```
  User (Dashboard)              AI Maestro API
   |                                  |
   |-- POST /api/teams/{teamId}/chief-of-staff -->|
   |   Body: {                        |
   |     "agentId": "<cos-agent-uuid>",|
   |     "password": "<gov-password>" |
   |   }                              |
   |   (No Authorization header       |
   |    = web UI / system owner)      |
   |                                  |
   |   Server:                        |
   |   1. Validate UUID format        |
   |   2. Parse body                  |
   |   3. Check rate limit            |
   |   4. Verify governance password  |
   |   5. Load team                   |
   |   6. Update team:                |
   |      - chiefOfStaffId = cosAgent |
   |      - type = 'closed' (auto)    |
   |   7. Persist to teams.json       |
   |                                  |
   |<-- 200 { success: true,          |
   |          team: {...} }      -----|
```

### Server Checks (in order)

1. **UUID validation**: `isValidUuid(id)` on team ID path parameter --> 400 if invalid
2. **Body parsing**: Must contain `password` (string) and `agentId` (string or null)
3. **Rate limiting** (lib/rate-limit.ts):
   - Key: `governance-cos-auth:{teamId}`
   - `checkRateLimit()` first (separate check/record pattern)
   - On failure: `recordAttempt()` increments counter
   - On success: `resetRateLimit()` clears counter
   - If rate-limited: 429 with retry-after
4. **Password verification**: `verifyPassword(password)` via bcrypt.compare against `governance.json.passwordHash`
   - Failure: 401 `Invalid governance password` + rate limit recorded
5. **Team existence**: `getTeam(id)` --> 404 if not found
6. **COS assignment** (when `agentId` is a UUID, not null):
   - `updateTeam(id, { chiefOfStaffId: agentId, type: 'closed' }, managerId)`
   - Team auto-upgrades from `"open"` to `"closed"` (Rule R1.5 inverse)
7. **COS removal** (when `agentId === null`):
   - `updateTeam(id, { chiefOfStaffId: null, type: 'open' }, managerId)`
   - Team auto-downgrades from `"closed"` to `"open"` (Rule R1.5)
   - Auto-rejects pending `configure-agent` governance requests from removed COS (11a safeguard)

### Success Condition
- HTTP 200 returned
- Team's `chiefOfStaffId` updated; `type` set to `"closed"` (if assigning) or `"open"` (if removing)

### Failure Points
| Point | Condition | HTTP | Error |
|-------|-----------|------|-------|
| Format | Invalid team UUID | 400 | `Invalid team ID format` |
| Body | Missing password | 400 | `Governance password is required` |
| Rate limit | Too many failures | 429 | `Too many failed password attempts` |
| Auth | Wrong password | 401 | `Invalid governance password` |
| Not found | Team does not exist | 404 | `Team not found` |
| Config | Password not yet set | 400 | `Governance password not set` |

### Governance Rules Exercised
- **G2**: Only governance password holder (user) can assign COS
- **R1.5**: Assigning COS auto-closes team; removing COS auto-opens team
- **11a**: Removing COS auto-rejects pending configure-agent requests from that COS

---

## Flow 3: Path A -- Reassign Unassigned Agent to Team

### Actors
- **MANAGER** (AMAMA) or **COS** (AMCOS) -- via API call with auth headers
- **Web UI** (user via dashboard) -- no auth headers

### Preconditions
- Target team exists
- Agent exists in agent registry
- Agent is NOT currently in a closed team (or is in an open team)
- Requester has appropriate role (MANAGER, COS of target team, or web UI)

### Steps

```
  MANAGER/COS/User          AI Maestro API
   |                              |
   |-- PUT /api/teams/{teamId} -->|
   |   Headers:                   |
   |     Authorization: Bearer <key>  (agents only)
   |     X-Agent-Id: <agentId>        (agents only)
   |   Body: {                    |
   |     "agentIds": ["existing1", "existing2", "newAgent"]
   |   }                          |
   |                              |
   |   Server:                    |
   |   1. authenticateAgent()     |
   |   2. UUID validate teamId    |
   |   3. Strip type/chiefOfStaffId from body (defense-in-depth CC-005)
   |   4. checkTeamAccess()       |
   |   5. updateTeam()            |
   |      - G4: if newAgent was in an open team,
   |        auto-revoke from that team
   |   6. Persist                 |
   |                              |
   |<-- 200 { team: {...} }  -----|
```

### Server Checks (in order)

1. **`authenticateAgent()`**: Validates Bearer token + X-Agent-Id consistency.
   No headers = web UI (agentId undefined, always allowed).
2. **UUID validation**: teamId path param
3. **Body stripping** (route.ts L59): `type` and `chiefOfStaffId` are stripped from body.
   Defense-in-depth: `updateTeamById()` in teams-service.ts ALSO strips them (SF-015).
4. **`checkTeamAccess()`** (lib/team-acl.ts):
   - Web UI (no agentId): always allowed
   - Open team: always allowed
   - Closed team: allowed if requester is MANAGER, COS of this team, or team member
   - Denied otherwise: 403 `Access denied: you are not a member of this closed team`
5. **`updateTeam()`** (lib/team-registry.ts):
   - Validates updated agentIds
   - **G4 rule**: If an agent being added is currently in an open team, it is auto-revoked from that open team (single-assignment enforcement)
   - Persists to `teams.json`

### Success Condition
- HTTP 200 with updated team object
- New agent appears in `team.agentIds`
- If agent was in an open team, removed from that team

### Failure Points
| Point | Condition | HTTP | Error |
|-------|-----------|------|-------|
| Auth | Invalid API key | 401 | `Invalid or expired API key` |
| ACL | Not MANAGER/COS/member of closed team | 403 | `Access denied` |
| Not found | Team does not exist | 404 | `Team not found` |
| Validation | Invalid agentIds format | 400 | Validation error |

### Governance Rules Exercised
- **Team ACL**: Closed teams restrict mutations to MANAGER, COS, and members
- **G4**: Agent auto-revoked from open team when added to another team
- **CC-005**: Type and chiefOfStaffId stripped from update body (defense-in-depth)

---

## Flow 4: Path A -- Reassign Agent from Closed Team (Transfer)

### Actors
- **Requester**: MANAGER or COS (of source or target team)
- **Approver**: Source team's COS or MANAGER

### Preconditions
- Agent is in a closed source team
- Agent is NOT the COS of the source team
- Destination team exists
- No duplicate pending transfer exists for this agent+teams combination
- Source team type is `"closed"` (open teams use direct update, not transfers)

### Steps

```
  Requester (COS/MANAGER)           AI Maestro API              Approver
   |                                      |                        |
   |-- POST /api/governance/transfers --->|                        |
   |   Headers:                           |                        |
   |     Authorization: Bearer <key>      |                        |
   |     X-Agent-Id: <requesterId>        |                        |
   |   Body: {                            |                        |
   |     "agentId": "<agent-uuid>",       |                        |
   |     "fromTeamId": "<source-uuid>",   |                        |
   |     "toTeamId": "<dest-uuid>",       |                        |
   |     "note": "optional note"          |                        |
   |   }                                  |                        |
   |   (requestedBy derived from auth,    |                        |
   |    NOT from body -- anti-spoofing)   |                        |
   |                                      |                        |
   |<-- 201 { success, request } ---------|                        |
   |                                      |                        |
   |   ... time passes ...                |                        |
   |                                      |                        |
   |                                      |<-- POST .../resolve ---|
   |                                      |   Headers:             |
   |                                      |     Authorization: Bearer <key>
   |                                      |     X-Agent-Id: <approverId>
   |                                      |   Body: {              |
   |                                      |     "action": "approve"|
   |                                      |   }                    |
   |                                      |                        |
   |                                      |   Server:              |
   |                                      |   1. Validate transfer exists, status=pending
   |                                      |   2. Verify resolver is MANAGER or COS
   |                                      |   3. Acquire 'teams' lock
   |                                      |   4. Move agent: remove from source, add to dest
   |                                      |   5. Save teams.json atomically
   |                                      |   6. Update transfer status -> 'approved'
   |                                      |   7. Notify agent of transfer
   |                                      |   8. Release lock
   |                                      |                        |
   |                                      |-- 200 { success } ---->|
```

### Server Checks -- POST /api/governance/transfers (Create)

1. **`authenticateAgent()`**: Bearer token validation
2. **requestedBy** derived from `auth.agentId` (not body -- prevents impersonation)
3. **Field validation**: agentId, fromTeamId, toTeamId required, all strings, all valid UUIDs
4. **Authority check**: `isManager(requestedBy) || isChiefOfStaffAnywhere(requestedBy)` -- 403 if neither
5. **Note validation**: optional, max 1000 chars
6. **Self-transfer check**: `fromTeamId !== toTeamId` -- 400 if same
7. **Source team exists** and agent is a member
8. **Destination team exists**
9. **COS protection**: Cannot transfer COS out of their team (must remove COS role first) -- 400
10. **Source team type**: Must be `"closed"` (open teams use direct PUT) -- 400
11. **Duplicate check**: No existing pending transfer for same agent+teams -- 409

### Server Checks -- POST /api/governance/transfers/{id}/resolve (Resolve)

1. **`authenticateAgent()`**: Bearer token validation
2. **resolvedBy** derived from auth (not body)
3. **UUID validation** on transfer ID
4. **Transfer exists** and `status === 'pending'` -- 404/409 otherwise
5. **Action validation**: must be `"approve"` or `"reject"`
6. **Authority check**: resolvedBy must be MANAGER or COS
7. **Acquire `teams` lock** for atomic read-validate-write cycle
8. **Team existence re-check** under lock (TOCTOU protection)
9. **Move agent** atomically: remove from source `agentIds`, add to destination `agentIds`
10. **Save** teams.json
11. **Update** transfer status
12. **Notify** affected agent via notification service

### Success Condition
- Transfer created as `"pending"`, then resolved to `"approved"`
- Agent's `agentIds` array updated in both source and destination teams
- Transfer record updated with resolvedBy, resolvedAt, status

### Failure Points
| Point | Condition | HTTP | Error |
|-------|-----------|------|-------|
| Auth | No/invalid API key | 401 | Auth error |
| Authority | Not MANAGER or COS | 403 | `Only MANAGER or Chief-of-Staff can request transfers` |
| COS guard | Trying to transfer COS | 400 | `Cannot transfer the Chief-of-Staff out of their team` |
| Type guard | Source team not closed | 400 | `Transfer requests are only needed for closed teams` |
| Duplicate | Same transfer pending | 409 | `A transfer request...already exists` |
| Stale | Transfer already resolved | 409 | `Transfer request is already resolved` |

### Governance Rules Exercised
- **G3**: Transfers from closed teams require approval
- **COS immobility**: COS cannot be transferred (must be unassigned first)
- **Anti-impersonation**: requestedBy/resolvedBy from auth headers, not body
- **TOCTOU protection**: `teams` lock held during resolve

---

## Flow 5: Path B -- Create Agent via Haephestos (Agent Creation Helper)

### Actors
- **User** (via dashboard UI, interacting with Haephestos chat)
- **Haephestos** (creation helper agent, UI-only -- NOT an API caller)

### Preconditions
- Dashboard is running on localhost:23000
- User has access to the creation helper UI component
- If assigning to team: team exists

### Steps

```
  User (Browser)             Dashboard UI             AI Maestro API
   |                              |                         |
   |-- Opens Creation Helper ---->|                         |
   |                              |                         |
   |-- Chats with Haephestos ---->|                         |
   |   "I need an agent for..."   |                         |
   |                              |                         |
   |<-- Haephestos suggests ------|                         |
   |   name, skills, config       |                         |
   |                              |                         |
   |-- Selects team (dropdown) -->|                         |
   |                              |                         |
   |-- Clicks "Accept" ---------->|                         |
   |                              |                         |
   |                              |-- POST /api/sessions/create -->|
   |                              |   Body: {               |
   |                              |     "name": "agent-name",
   |                              |     "workingDirectory": "...",
   |                              |     ...config           |
   |                              |   }                     |
   |                              |   (No auth headers      |
   |                              |    = web UI request)    |
   |                              |                         |
   |                              |<-- 201 { session } -----|
   |                              |                         |
   |                              |   IF teamId selected:   |
   |                              |-- PUT /api/teams/{teamId} ->|
   |                              |   Body: {               |
   |                              |     "agentIds": [..., newId]
   |                              |   }                     |
   |                              |   (No auth headers)     |
   |                              |                         |
   |                              |<-- 200 { team } --------|
   |                              |                         |
   |<-- "Agent created!" ---------|                         |
```

### Server Checks

1. **Session creation** (`POST /api/sessions/create`):
   - No auth headers = web UI (system owner, always authorized)
   - Validates agent name format
   - Creates tmux session + registers agent

2. **Team assignment** (`PUT /api/teams/{teamId}`):
   - No auth headers = web UI (system owner)
   - `checkTeamAccess()`: undefined requestingAgentId --> always allowed
   - Body stripping: type/chiefOfStaffId removed (CC-005)
   - `updateTeam()` persists updated agentIds

### Success Condition
- New agent session created in tmux
- Agent registered in `registry.json`
- If team selected: agent added to team's `agentIds`

### Failure Points
| Point | Condition | HTTP | Error |
|-------|-----------|------|-------|
| Name | Invalid agent name format | 400 | Validation error |
| Duplicate | Agent name already exists | 409 | Name collision |
| Team | Team not found (if assigning) | 404 | `Team not found` |
| tmux | tmux not running | 500 | Session creation failure |

### Governance Rules Exercised
- **Web UI bypass**: No auth headers = system owner, always authorized
- **CC-005**: Type and COS stripped from team update body
- **G4**: If agent was in an open team, auto-revoked on new team assignment

---

## Flow 6: Path C -- Create Agent with PSS (Skill Suggester)

### Actors
- **MANAGER** (AMAMA) or **COS** (AMCOS) -- initiates the process
- **PSS** (Skill Suggester plugin) -- generates agent configuration
- **COS** (AMCOS) -- creates and registers the agent

### Preconditions
- Agent definition file exists (describes desired agent capabilities)
- PSS plugin is installed and accessible
- COS has AMP API key + appropriate role
- If COS is requester: needs GovernanceRequest approval from MANAGER

### Steps

```
  MANAGER/COS         PSS                 COS                AI Maestro API
   |                    |                   |                       |
   |-- /pss-setup ----->|                   |                       |
   |   (agent def file) |                   |                       |
   |                    |                   |                       |
   |<-- .agent.toml ----|                   |                       |
   |   (generated config)                   |                       |
   |                    |                   |                       |
   |   [If COS is requester, needs MANAGER approval first]         |
   |-- POST /api/governance/requests ------>|                       |
   |   Body: {                              |                       |
   |     "type": "create-agent",            |                       |
   |     "payload": { agentId, teamId }     |                       |
   |   }                                    |                       |
   |<-- 201 { request } -------------------|                       |
   |                                        |                       |
   |   ... MANAGER approves ...             |                       |
   |                                        |                       |
   |                                        |-- aimaestro-agent.sh create -->
   |                                        |   (CLI creates session)|
   |                                        |                       |
   |                                        |-- POST /api/sessions/create ->|
   |                                        |   Headers: Bearer <key>|
   |                                        |   X-Agent-Id: <cosId> |
   |                                        |                       |
   |                                        |<-- 201 { session } ---|
   |                                        |                       |
   |                                        |-- POST /api/agents/register ->|
   |                                        |   Headers: Bearer <key>|
   |                                        |   Body: { agent config }
   |                                        |                       |
   |                                        |<-- 201 { agent } -----|
   |                                        |                       |
   |                                        |-- PUT /api/teams/{id} ->|
   |                                        |   Body: { agentIds: [..., new] }
   |                                        |                       |
   |                                        |<-- 200 { team } ------|
```

### Server Checks

1. **GovernanceRequest creation** (if COS is requester):
   - `type: 'create-agent'` with payload containing agent details
   - Status starts as `"pending"`
   - MANAGER must approve before COS can proceed

2. **Session creation**: Auth validated, session spawned in tmux

3. **Agent registration**: Agent metadata stored in `registry.json`

4. **Team assignment**:
   - COS authenticated via Bearer token
   - `checkTeamAccess()`: COS is chiefOfStaffId of team --> allowed
   - Agent added to team's `agentIds`

### Success Condition
- GovernanceRequest approved (if COS-initiated)
- Agent session running in tmux
- Agent registered in registry
- Agent assigned to target team

### Failure Points
| Point | Condition | HTTP | Error |
|-------|-----------|------|-------|
| GovernanceRequest | MANAGER rejects | N/A | Request status: `"rejected"` |
| PSS | Invalid agent definition | N/A | Config generation fails |
| Session | tmux error | 500 | Session creation failure |
| ACL | COS not authorized for team | 403 | `Access denied` |

### Governance Rules Exercised
- **G5**: COS needs MANAGER approval for agent creation (via GovernanceRequest)
- **MANAGER auto-approves**: MANAGER can skip GovernanceRequest and create directly
- **Team ACL**: COS can only assign to own team

---

## Flow 7: Path D -- Transfer from Closed Team (Same Host)

### Actors
- **Target COS/MANAGER** -- initiates transfer request
- **Source COS or MANAGER** -- approves/rejects

### Preconditions
- Both teams exist on the same host
- Source team is `type: "closed"`
- Agent is a member of source team
- Agent is NOT the COS of source team
- No duplicate pending transfer exists

### Steps

```
  Target COS/MANAGER        AI Maestro API           Source COS/MANAGER
   |                              |                         |
   |-- POST /api/governance/      |                         |
   |   transfers --------------->|                         |
   |   Headers: Bearer <key>     |                         |
   |   Body: {                   |                         |
   |     agentId, fromTeamId,    |                         |
   |     toTeamId, note          |                         |
   |   }                         |                         |
   |                              |                         |
   |   Checks:                   |                         |
   |   - Auth + identity         |                         |
   |   - isManager OR isCOS      |                         |
   |   - source is closed        |                         |
   |   - agent in source         |                         |
   |   - agent is NOT source COS |                         |
   |   - no duplicate pending    |                         |
   |                              |                         |
   |<-- 201 { request } ---------|                         |
   |                              |                         |
   |   [notification to source COS/MANAGER]                |
   |                              |                         |
   |                              |<-- POST .../resolve ----|
   |                              |   Headers: Bearer <key> |
   |                              |   Body: { action:       |
   |                              |     "approve" }         |
   |                              |                         |
   |                              |   Checks:               |
   |                              |   - Auth + identity     |
   |                              |   - isManager OR isCOS  |
   |                              |   - transfer is pending |
   |                              |   - Acquire 'teams' lock|
   |                              |   - Verify both teams   |
   |                              |   - Move agent atomically|
   |                              |   - Release lock        |
   |                              |                         |
   |                              |-- 200 { success } ----->|
   |                              |                         |
   |   [agent notified of move]   |                         |
```

### Server Checks -- Create Transfer

1. Auth: Bearer token validated, identity extracted
2. Authority: `isManager(requestedBy) || isChiefOfStaffAnywhere(requestedBy)` -- 403 if neither
3. UUID validation on all IDs
4. Source team exists and is `"closed"` -- 400 if open
5. Agent is in source team -- 400 if not
6. Agent is not source COS -- 400 `Cannot transfer the Chief-of-Staff`
7. Destination team exists -- 404 if not
8. No duplicate pending transfer -- 409 if exists
9. Transfer record created with status `"pending"`

### Server Checks -- Resolve Transfer

1. Auth: Bearer token validated, identity extracted
2. Transfer exists and is `"pending"` -- 404/409
3. resolvedBy is MANAGER or COS -- 403
4. Acquires `teams` file lock (prevents TOCTOU)
5. Re-validates both teams exist under lock
6. Atomic move: `source.agentIds.splice(...)` + `dest.agentIds.push(...)`
7. `saveTeams()` atomically (temp file + rename)
8. `resolveTransferRequest()` updates transfer status to `"approved"`
9. `notifyAgent()` sends tmux notification to transferred agent
10. Releases lock

### Success Condition
- Transfer status: `"approved"`
- Agent removed from `source.agentIds`
- Agent added to `dest.agentIds`
- Both teams persisted atomically
- Agent notified

### Failure Points
| Point | Condition | HTTP | Error |
|-------|-----------|------|-------|
| Authority | Not MANAGER or COS | 403 | Auth error |
| Source type | Source team is open | 400 | `Transfer requests are only needed for closed teams` |
| COS guard | Agent is source COS | 400 | `Cannot transfer the Chief-of-Staff` |
| Duplicate | Same transfer pending | 409 | `A transfer request...already exists` |
| Race | Teams lock contention | 500 | Lock timeout |
| Stale | Transfer already resolved | 409 | `Transfer request is already resolved` |

### Governance Rules Exercised
- **G3**: Closed team transfers require approval from source authority
- **COS immobility**: COS cannot be transferred out
- **TOCTOU protection**: `teams` lock during resolve
- **Atomic writes**: temp-file-then-rename for teams.json
- **Anti-impersonation**: resolvedBy from auth, not body

---

## Flow 8: Path D -- Transfer from Closed Team (Cross-Host)

### Actors
- **Target MANAGER** (on target host) -- initiates GovernanceRequest
- **Source MANAGER** (on source host) -- approves (dual-manager approval)

### Preconditions
- Both hosts are AI Maestro mesh peers (registered in `~/.aimaestro/hosts.json`)
- Both hosts have MANAGER roles set
- Hosts can reach each other via network (Tailscale or direct)
- Agent exists on source host in a closed team

### Steps

```
  Target MANAGER (Host B)       Host B API        Host A API       Source MANAGER (Host A)
   |                                |                 |                    |
   |-- POST /api/governance/        |                 |                    |
   |   requests ------------------>|                 |                    |
   |   Headers: Bearer <key>       |                 |                    |
   |   Body: {                     |                 |                    |
   |     "type": "transfer-agent", |                 |                    |
   |     "sourceHostId": "hostA",  |                 |                    |
   |     "targetHostId": "hostB",  |                 |                    |
   |     "payload": {              |                 |                    |
   |       "agentId": "<uuid>",    |                 |                    |
   |       "fromTeamId": "<uuid>", |                 |                    |
   |       "toTeamId": "<uuid>"    |                 |                    |
   |     }                         |                 |                    |
   |   }                           |                 |                    |
   |                                |                 |                    |
   |<-- 201 { request }            |                 |                    |
   |   status: "pending"           |                 |                    |
   |                                |                 |                    |
   |   ... Host B forwards to A ...|-- sync msg ---->|                    |
   |                                |                 |                    |
   |                                |                 |   [MANAGER notified]
   |                                |                 |                    |
   |                                |                 |<-- PUT .../resolve-|
   |                                |                 |   Body: {          |
   |                                |                 |     "action":      |
   |                                |                 |     "approve"      |
   |                                |                 |   }                |
   |                                |                 |                    |
   |   State machine transitions:  |                 |                    |
   |   pending                     |                 |                    |
   |     -> local-approved (B approves)              |                    |
   |     -> remote-approved (A approves)             |                    |
   |     -> dual-approved (both approve)             |                    |
   |     -> executed (operation performed)           |                    |
   |                                |                 |                    |
   |   Both MANAGERs must approve  |                 |                    |
   |   for state to reach          |                 |                    |
   |   "dual-approved"             |                 |                    |
   |                                |                 |                    |
   |   On dual-approved:           |                 |                    |
   |   Host A removes agent from source team         |                    |
   |   Host B adds agent to target team              |                    |
   |   Status -> "executed"        |                 |                    |
```

### State Machine

```
                     pending
                    /       \
           local-approved  remote-approved
                    \       /
                 dual-approved
                      |
                   executed

  (rejected can occur from any non-terminal state)
```

- `pending`: Initial state, awaiting approvals
- `local-approved`: Target host's MANAGER approved
- `remote-approved`: Source host's MANAGER approved
- `dual-approved`: Both MANAGERs approved, ready for execution
- `executed`: Transfer completed
- `rejected`: Any approver rejected

### Server Checks

1. **GovernanceRequest creation** (POST /api/governance/requests):
   - Type: `"transfer-agent"`
   - sourceHostId / targetHostId identified
   - Payload contains agentId, fromTeamId, toTeamId
   - Requester must be MANAGER
   - Request persisted in `governance-requests.json`

2. **Cross-host sync**: Request forwarded to source host via GovernanceSyncMessage

3. **Approval flow**:
   - Each MANAGER approves independently on their host
   - `GovernanceApprovals` tracks: `sourceManager`, `targetManager` (+ optional COS approvals)
   - Status transitions enforce ordering

4. **Execution** (on dual-approved):
   - Source host: removes agent from source team
   - Target host: adds agent to target team
   - Status set to `"executed"`

### Success Condition
- GovernanceRequest status: `"executed"`
- Agent removed from source team on Host A
- Agent added to target team on Host B
- Both registries updated

### Failure Points
| Point | Condition | Result |
|-------|-----------|--------|
| Network | Hosts cannot reach each other | Sync message fails, request stays pending |
| Authority | Requester not MANAGER | 403 |
| Rejection | Either MANAGER rejects | Status: `"rejected"` |
| Stale | Source team no longer exists | Execution fails |
| Trust | Host not in trusted peers | Sync rejected |

### Governance Rules Exercised
- **Dual-manager approval**: Both source and target MANAGERs must approve
- **State machine**: Deterministic progression through approval states
- **Cross-host sync**: GovernanceSyncMessage broadcast between mesh peers
- **Host trust**: Only trusted peers can exchange governance requests

---

## Flow 9: COS Receives Design Requirements and Creates Agents

### Actors
- **MANAGER** (AMAMA) -- sends work request, approves agent creation
- **COS** (AMCOS) -- receives requirements, plans team composition, creates agents

### Preconditions
- COS is assigned to a closed team
- MANAGER has AMP API key and identity
- COS has AMP API key and identity
- Plugin mappings are configured (role --> plugin name)

### Steps

```
  MANAGER (AMAMA)         AMP / AI Maestro           COS (AMCOS)
   |                            |                        |
   |-- amp-send.sh cos          |                        |
   |   "Design Requirements"    |                        |
   |   { type: "work_request",  |                        |
   |     message: "Build X..." }|                        |
   |                            |                        |
   |                            |-- [push notification]->|
   |                            |   [MESSAGE] From: mgr  |
   |                            |                        |
   |                            |                        |-- amp-inbox.sh
   |                            |                        |   amp-read.sh <id>
   |                            |                        |
   |                            |                        |-- Analyzes requirements
   |                            |                        |   Decides roles needed:
   |                            |                        |   - orchestrator
   |                            |                        |   - architect
   |                            |                        |   - implementer x2
   |                            |                        |   - tester
   |                            |                        |
   |  FOR EACH AGENT TO CREATE: |                        |
   |                            |                        |
   |                            |<-- POST /api/governance/requests --|
   |                            |   { type: "create-agent",          |
   |                            |     payload: {                     |
   |                            |       agentId: "<planned-uuid>",   |
   |                            |       teamId: "<team-uuid>"        |
   |                            |     },                             |
   |                            |     requestedBy: "<cos-uuid>",     |
   |                            |     requestedByRole: "cos"         |
   |                            |   }                                |
   |                            |                                    |
   |<-- [notification: pending  |                                    |
   |     governance request] ---|                                    |
   |                            |                                    |
   |-- PUT .../requests/{id} -->|                                    |
   |   { action: "approve" }    |                                    |
   |                            |                                    |
   |                            |-- [notification: approved] ------->|
   |                            |                                    |
   |                            |                        |-- Execute spawn:
   |                            |                        |
   |                            |                        |   1. Map role to plugin:
   |                            |                        |      orchestrator -> ai-maestro-orchestrator-agent
   |                            |                        |      architect -> ai-maestro-architect-agent
   |                            |                        |      implementer -> ai-maestro-implementer-agent
   |                            |                        |      tester -> ai-maestro-tester-agent
   |                            |                        |
   |                            |                        |   2. Copy plugin to agent workspace
   |                            |                        |
   |                            |                        |   3. aimaestro-agent.sh create <name>
   |                            |                        |      -> POST /api/sessions/create
   |                            |                        |
   |                            |                        |   4. Verify agent online:
   |                            |                        |      GET /api/sessions
   |                            |                        |
   |                            |                        |   5. Register in registry:
   |                            |                        |      POST /api/agents/register
   |                            |                        |
   |                            |                        |   6. Assign to team:
   |                            |                        |      PUT /api/teams/{teamId}
   |                            |                        |      { agentIds: [..., newAgent] }
   |                            |                        |
   |                            |                        |-- amp-send.sh manager
   |                            |                        |   "Agent <name> created and assigned"
   |                            |                        |
   |<-- [push notification] ----|                        |
```

### Role-to-Plugin Mapping

| Role | Plugin Name |
|------|-------------|
| orchestrator | `ai-maestro-orchestrator-agent` |
| architect | `ai-maestro-architect-agent` |
| implementer | `ai-maestro-implementer-agent` |
| tester | `ai-maestro-tester-agent` |
| reviewer | `ai-maestro-reviewer-agent` |
| documenter | `ai-maestro-documenter-agent` |

### Server Checks

1. **GovernanceRequest creation**: COS submits `type: "create-agent"`, status starts `"pending"`
2. **MANAGER approval**: PUT resolves request, status -> `"executed"` (single-host, no dual approval needed)
3. **Session creation**: Standard auth + validation
4. **Agent registration**: Metadata persisted in `registry.json`
5. **Team assignment**: COS authenticated, `checkTeamAccess()` confirms COS has access to own team

### Success Condition
- All GovernanceRequests approved by MANAGER
- All agent sessions running in tmux
- All agents registered in registry
- All agents assigned to COS's team
- MANAGER notified of completion

### Failure Points
| Point | Condition | Result |
|-------|-----------|--------|
| AMP delivery | Message not delivered | COS never receives requirements |
| Approval | MANAGER rejects request | Agent not created |
| Plugin | Plugin not found | Agent spawn fails |
| tmux | Session creation error | Agent not online |
| Concurrency | Multiple agents created simultaneously | File lock contention |

### Governance Rules Exercised
- **G5**: COS needs MANAGER approval for agent creation
- **GovernanceRequest workflow**: pending -> approved -> executed
- **Team ACL**: COS can assign agents to own team
- **AMP messaging**: Inter-agent communication for coordination
- **Push notifications**: Instant notification on message arrival

---

## Authority Matrix

The definitive matrix of who can perform each governance operation:

| Operation | User (Dashboard) | Manager (AMAMA) | COS (AMCOS) | Normal Member |
|-----------|:-:|:-:|:-:|:-:|
| **Create team** | YES | YES (on user instruction) | NO | NO |
| **Delete team** | YES | YES | YES (own team) | NO |
| **Assign COS** | YES (governance password) | NO | NO | NO |
| **Add agent to open team** | YES | YES | YES | NO |
| **Add agent to closed team** | YES | YES | YES (own team) | NO |
| **Create new agent (CLI)** | YES | YES | YES (needs MANAGER approval) | NO |
| **Create agent via Haephestos** | YES | NO | NO | NO |
| **Transfer from open team** | YES | YES | YES | NO |
| **Transfer from closed team** | YES | YES (auto-approves) | YES (needs source COS approval) | NO |
| **Cross-host transfer** | YES | YES (needs remote MANAGER) | YES (needs both MANAGERs) | NO |
| **Approve GovernanceRequests** | YES | YES (governance password) | NO | NO |

### Legend

- **User (Dashboard)**: Requests arrive with no `Authorization` or `X-Agent-Id` headers. Treated as system owner. Always passes `checkTeamAccess()`. Some operations (assign COS, approve governance) require the governance password.
- **Manager (AMAMA)**: Authenticated via `Authorization: Bearer <key>` + `X-Agent-Id`. UUID matches `governance.json.managerId`. Highest agent authority.
- **COS (AMCOS)**: Authenticated via Bearer token. UUID matches `team.chiefOfStaffId` for one or more closed teams. Authority scoped to own team(s) unless MANAGER approval is obtained.
- **Normal Member**: Authenticated via Bearer token. UUID is in `team.agentIds` but is neither MANAGER nor COS. Can read own team data but cannot mutate membership or governance state.

### Auth Flow Summary

```
  Request arrives
       |
       v
  Authorization header present?
       |              |
      YES             NO
       |              |
       v              v
  Validate Bearer   X-Agent-Id header present?
  API key              |              |
       |              YES             NO
       |               |              |
       v               v              v
  agentId from     REJECT (401)   System Owner
  API key lookup   (identity      (web UI)
       |            spoofing)     -> always allowed
       v
  X-Agent-Id matches?
       |              |
      YES             NO
       |              |
       v              v
  Authenticated    REJECT (403)
  Agent            (mismatch)
       |
       v
  Check role:
  isManager? isCOS? isMember?
```

### Governance Config Storage

```
~/.aimaestro/
  governance.json              # { passwordHash, managerId, version: 1 }
  teams/
    teams.json                 # [{ id, name, type, agentIds, chiefOfStaffId, ... }]
  agents/
    registry.json              # [{ id, name, alias, sessions, ... }]
  governance-requests.json     # { version: 1, requests: [GovernanceRequest, ...] }
  transfers.json               # { version: 1, requests: [TransferRequest, ...] }
  hosts.json                   # Mesh peer host registry
```
