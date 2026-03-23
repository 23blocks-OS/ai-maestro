# API Surface Analysis: feature/team-governance vs main
**Date:** 2026-02-27  
**Branch:** feature/team-governance  
**Scope:** Complete governance and team management APIs

---

## 1. GOVERNANCE CONFIGURATION ENDPOINTS

### ENDPOINT: GET /api/governance
- **Auth:** None (localhost-only, Phase 1)
- **Request body:** None
- **Response:** `{ hasPassword: boolean, hasManager: boolean, managerId: string | null, managerName: string | null }`
- **ACL:** Public (all localhost clients)
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: POST /api/governance/password
- **Auth:** None (sets initial password or updates existing)
- **Request body:** `{ password: string, currentPassword?: string }`
- **Response:** `{ success: true } | { error: string, status: 400|500 }`
- **ACL:** Public for initial setup; current password required for change
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: POST /api/governance/manager
- **Auth:** None (requires governance password as proof of manager authority)
- **Request body:** `{ agentId: string | null, password: string }`
  - `agentId === null` removes the manager role
  - `agentId === string` sets the manager to that agent UUID
- **Response:** `{ success: true, managerId: string | null, managerName?: string }`
- **ACL:** Requires valid governance password (rate-limited to 5 attempts per 15min)
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: GET /api/governance/trust
- **Auth:** None
- **Request body:** None
- **Response:** `ManagerTrust[]` where `ManagerTrust = { hostId: string, addedBy: string, addedAt: string }`
- **ACL:** Public (localhost-only)
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: POST /api/governance/trust
- **Auth:** None (requires governance password in body)
- **Request body:** `{ hostId: string, password: string }`
- **Response:** `{ success: true, trust: ManagerTrust } | { error: string, status: 400|401|500 }`
- **ACL:** Requires valid governance password
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: DELETE /api/governance/trust/[hostId]
- **Auth:** None (requires governance password in body)
- **Request body:** `{ password: string }`
- **Response:** `{ success: true } | { error: string, status: 400|401|500 }`
- **ACL:** Requires valid governance password
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: GET /api/governance/reachable
- **Auth:** None
- **Request body:** None
- **Query params:** `?agentId=<uuid>` (optional)
- **Response:** `{ reachableAgentIds: string[] }`
  - If agentId provided: agents reachable by that agent's governance rules
  - If no agentId: all agents reachable in the mesh
- **ACL:** Public
- **New in this PR:** Yes
- **Breaking change:** N/A

---

## 2. TEAM MANAGEMENT ENDPOINTS

### ENDPOINT: GET /api/teams
- **Auth:** X-Agent-Id header optional (triggers ACL checks if present)
- **Request body:** None
- **Response:** `{ teams: Team[] }`
- **ACL:** Public for localhost; ACL checks trigger for agent-authenticated requests
- **New in this PR:** Yes (modified from previous stub)
- **Breaking change:** No (previously returned empty, now returns real teams)

### ENDPOINT: POST /api/teams
- **Auth:** X-Agent-Id header (via Authorization: Bearer)
- **Request body:** `{ name: string, description?: string, agentIds: string[], type?: 'open' | 'closed' }`
- **Response:** `{ team: Team } | { error: string, status: 400|401|409|500 }`
  - Status 409 if team name already exists
- **ACL:** Any authenticated agent can create teams
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: GET /api/teams/[id]
- **Auth:** X-Agent-Id header optional
- **Request body:** None
- **Response:** `{ team: Team } | { error: string, status: 400|401|403|404|500 }`
  - Status 401 if auth header present but invalid
  - Status 403 if closed team and requester not manager/COS/member
  - Status 404 if team not found
- **ACL:** Web UI (no X-Agent-Id) always allowed; agents checked against team membership
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: PUT /api/teams/[id]
- **Auth:** X-Agent-Id header required (via Authorization: Bearer)
- **Request body:** `{ name?: string, description?: string, agentIds?: string[] }`
  - Note: `type` and `chiefOfStaffId` cannot be set via this endpoint (defense-in-depth)
- **Response:** `{ team: Team } | { error: string, status: 400|401|403|404|500 }`
- **ACL:** Web UI (no X-Agent-Id) always allowed; agents must be team creator or manager
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: DELETE /api/teams/[id]
- **Auth:** X-Agent-Id header required (via Authorization: Bearer)
- **Request body:** None
- **Response:** `{ success: true } | { error: string, status: 400|401|403|404|500 }`
- **ACL:** Web UI (no X-Agent-Id) always allowed; agents must be team creator or manager
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: GET /api/teams/names
- **Auth:** None
- **Request body:** None
- **Response:** `{ teamNames: string[], agentNames: string[] }`
- **ACL:** Public (called by Create Team dialog for collision checking)
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: POST /api/teams/[id]/chief-of-staff
- **Auth:** None (requires governance password)
- **Request body:** `{ agentId: string | null, password: string }`
  - `agentId === null` removes COS role (downgrades team from closed to open)
  - `agentId === string` assigns COS role (upgrades team to closed)
- **Response:** `{ success: true, team: Team, chiefOfStaffName?: string }`
  - Auto-rejects pending config requests from old COS if removed (R1.5 safeguard)
- **ACL:** Requires valid governance password (rate-limited per team, 5 attempts per 15min)
- **New in this PR:** Yes
- **Breaking change:** N/A

---

## 3. CROSS-HOST GOVERNANCE REQUEST ENDPOINTS

### ENDPOINT: POST /api/v1/governance/requests
- **Auth:** Host signature (X-Host-Id, X-Host-Signature, X-Host-Timestamp headers) for remote receives; governance password for local submissions
- **Request body (Local Submission):** 
  ```json
  {
    "type": "add-to-team" | "remove-from-team" | "assign-cos" | "remove-cos" | 
            "transfer-agent" | "create-agent" | "delete-agent" | "configure-agent",
    "password": "string",
    "targetHostId": "string",
    "requestedBy": "string (agentId UUID)",
    "requestedByRole": "manager" | "chief-of-staff" | "member",
    "payload": {
      "agentId": "string (required)",
      "teamId?": "string",
      "fromTeamId?": "string",
      "toTeamId?": "string",
      "role?": "manager" | "chief-of-staff" | "member",
      "configuration?": {
        "operation": "add-skill" | "remove-skill" | ... | "bulk-config",
        "scope": "local" | "user" | "project",
        "skills?": ["string"],
        "plugins?": ["string"],
        "hooks?": {},
        "mcpServers?": {},
        "model?": "string",
        "programArgs?": "string"
      }
    }
  }
  ```
- **Request body (Remote Receive):**
  ```json
  {
    "fromHostId": "string",
    "request": { GovernanceRequest fields }
  }
  ```
- **Response:** `{ request: GovernanceRequest } | { error: string, status: 400|401|403|404|500 }`
- **ACL:** 
  - Local: requires governance password
  - Remote: requires valid Ed25519 host signature (sender must be registered in hosts.json)
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: GET /api/v1/governance/requests
- **Auth:** None (reads local requests only)
- **Request body:** None
- **Query params:** `?status=<status>&type=<type>&hostId=<hostId>&agentId=<agentId>`
  - Valid statuses: pending, remote-approved, local-approved, dual-approved, executed, rejected
  - Valid types: add-to-team, remove-from-team, assign-cos, remove-cos, transfer-agent, create-agent, delete-agent, configure-agent
- **Response:** `{ requests: GovernanceRequest[] } | { error: string, status: 400|500 }`
- **ACL:** Public (reads local requests only, no cross-host exposure)
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: POST /api/v1/governance/requests/[id]/approve
- **Auth:** None (requires governance password)
- **Request body:** `{ approverAgentId: string (UUID), password: string }`
- **Response:** `{ request: GovernanceRequest } | { error: string, status: 400|401|404|500 }`
- **ACL:** Requires valid governance password and approverAgentId must be manager or appropriate COS
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: POST /api/v1/governance/requests/[id]/reject
- **Auth:** Password-based (local rejection) OR host signature (remote notification)
- **Request body:**
  - Local: `{ rejectorAgentId: string, password: string, reason?: string }`
  - Remote: `{ rejectorAgentId: string, reason?: string }` (signature in headers)
- **Response:** `{ request: GovernanceRequest } | { error: string, status: 400|401|403|404|500 }`
- **ACL:** 
  - Local: governance password + rejectorAgentId must be manager/COS
  - Remote: valid Ed25519 host signature (sender in hosts.json)
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: GET /api/v1/governance/sync
- **Auth:** Ed25519 host signature required (X-Host-Id, X-Host-Signature, X-Host-Timestamp headers)
- **Request body:** None
- **Response:** `{ managerId: string | null, managerName: string | null, teams: PeerTeamSummary[] }`
- **ACL:** Must be registered host in hosts.json with valid public key
- **New in this PR:** Yes
- **Breaking change:** N/A

### ENDPOINT: POST /api/v1/governance/sync
- **Auth:** Ed25519 host signature required
- **Request body:** `GovernanceSyncMessage` with type one of: manager-changed, team-updated, team-deleted, transfer-update
- **Response:** `{ success: true } | { error: string, status: 400|401|403|500 }`
- **ACL:** Must be registered host with valid signature (5min timestamp freshness window)
- **New in this PR:** Yes
- **Breaking change:** N/A

---

## 4. AGENT TRANSFER ENDPOINT

### ENDPOINT: POST /api/agents/[id]/transfer
- **Auth:** None (business logic in service layer)
- **Request body:** Transfer request parameters (schema in agents-transfer-service.ts)
- **Response:** `{ success: true, transferId: string } | { error: string, status: 400|404|500 }`
- **ACL:** Requires manager or chief-of-staff authority
- **New in this PR:** Yes (modified from previous stub)
- **Breaking change:** No (previously non-functional)

---

## 5. AUTHENTICATION & LIBRARY FUNCTIONS

### Library: lib/agent-auth.ts
**Function: `authenticateAgent(authHeader: string | null, agentIdHeader: string | null): AgentAuthResult`**

- **Outcomes:**
  1. No auth headers → `{ }` (system owner / web UI)
  2. Valid Authorization: Bearer → `{ agentId: 'uuid' }`
  3. Invalid Bearer or X-Agent-Id without Bearer → `{ error: string, status: 401 | 403 }`
  
- **Headers read:**
  - `Authorization: Bearer <api-key>` (via Authorization param)
  - `X-Agent-Id: <uuid>` (optional, must match authenticated agent)
  
- **New in this PR:** Yes

### Library: lib/governance.ts
**Exported functions:**

| Function | Signature | Purpose | New in PR |
|----------|-----------|---------|-----------|
| `loadGovernance()` | `(): GovernanceConfig` | Load governance config from ~/.aimaestro/governance.json | Yes |
| `saveGovernance(config)` | `(config: GovernanceConfig): void` | Save governance config atomically | Yes |
| `setPassword(plaintext)` | `async (plaintext: string): Promise<void>` | Hash and store governance password (bcrypt 12 rounds) | Yes |
| `verifyPassword(plaintext)` | `async (plaintext: string): Promise<boolean>` | Verify plaintext against stored hash | Yes |
| `getManagerId()` | `(): string \| null` | Get current manager agent UUID | Yes |
| `setManager(agentId)` | `async (agentId: string): Promise<void>` | Set manager + broadcast to mesh peers | Yes |
| `removeManager()` | `async (): Promise<void>` | Remove manager + broadcast to mesh peers | Yes |
| `isManager(agentId)` | `(agentId: string): boolean` | Check if agent is the singleton manager | Yes |
| `isChiefOfStaff(agentId, teamId)` | `(agentId: string, teamId: string): boolean` | Check if agent is COS for specific team | Yes |
| `isChiefOfStaffAnywhere(agentId)` | `(agentId: string): boolean` | Check if agent is COS in any closed team | Yes |
| `getClosedTeamForAgent(agentId)` | `(agentId: string): Team \| null` | Get first closed team where agent is member | Yes |
| `getClosedTeamsForAgent(agentId)` | `(agentId: string): Team[]` | Get all closed teams where agent is member | Yes |

**Storage:** `~/.aimaestro/governance.json` (version 1, atomic writes with temp-then-rename)

### Library: lib/team-acl.ts
**Function: `checkTeamAccess(input: TeamAccessInput): TeamAccessResult`**

- **Decision tree:**
  1. Web UI (agentId undefined) → allowed
  2. Team not found → denied
  3. Open team → allowed
  4. Requester is MANAGER → allowed
  5. Requester is COS → allowed
  6. Requester is member → allowed
  7. Otherwise → denied
  
- **New in this PR:** Yes

### Library: lib/governance-request-registry.ts
**Exported functions:**

| Function | Signature | Purpose | New in PR |
|----------|-----------|---------|-----------|
| `loadGovernanceRequests()` | `(): GovernanceRequestsFile` | Load requests from ~/.aimaestro/governance-requests.json | Yes |
| `saveGovernanceRequests(file)` | `(file: GovernanceRequestsFile): void` | Save requests atomically | Yes |
| `getGovernanceRequest(id)` | `(id: string): GovernanceRequest \| null` | Fetch single request by UUID | Yes |
| `listGovernanceRequests(filter?)` | `(filter?: {...}): GovernanceRequest[]` | List with optional status/type/hostId/agentId filtering | Yes |
| `createGovernanceRequest(params)` | `async (params: {...}): Promise<GovernanceRequest>` | Create new request, assign UUID | Yes |
| `updateGovernanceRequest(id, updates)` | `async (id: string, updates: Partial<GovernanceRequest>): Promise<GovernanceRequest>` | Update status, approvals, rejection reason | Yes |
| `approveGovernanceRequest(id, approverRole, approverId)` | `async (id: string, approverRole: AgentRole, approverId: string): Promise<GovernanceRequest>` | Record approval, update status if dual-approved | Yes |
| `rejectGovernanceRequest(id, rejectorId, reason)` | `async (id: string, rejectorId: string, reason: string): Promise<GovernanceRequest>` | Mark as rejected with reason | Yes |

**Storage:** `~/.aimaestro/governance-requests.json` (version 1)

### Library: lib/transfer-registry.ts
**Exported functions:**

| Function | Signature | Purpose | New in PR |
|----------|-----------|---------|-----------|
| `loadTransfers()` | `(): TransferRequest[]` | Load all transfer requests from ~/.aimaestro/governance-transfers.json | Yes |
| `createTransferRequest(params)` | `async (params: {...}): Promise<TransferRequest>` | Create pending transfer, check duplicates | Yes |
| `approveTransferRequest(id, approverId)` | `async (id: string, approverId: string): Promise<TransferRequest>` | Approve transfer, update status | Yes |
| `rejectTransferRequest(id, rejectorId, reason)` | `async (id: string, rejectorId: string, reason: string): Promise<TransferRequest>` | Reject transfer with reason | Yes |
| `getTransferRequest(id)` | `(id: string): TransferRequest \| null` | Fetch single transfer request | Yes |
| `listTransferRequests(filter?)` | `(filter?: {...}): TransferRequest[]` | List with optional filtering | Yes |

**Storage:** `~/.aimaestro/governance-transfers.json` (version 1)

**Transfer Request States:**
- `pending` → created, awaiting COS approval from source team
- `approved` → COS approved, ready to execute
- `rejected` → COS rejected with reason

---

## 6. TYPE DEFINITIONS

### types/governance.ts
```typescript
interface GovernanceConfig {
  version: 1
  passwordHash: string | null        // bcrypt hash
  passwordSetAt: string | null       // ISO timestamp
  managerId: string | null           // UUID of manager agent
}

type GovernanceSyncType = 
  | 'manager-changed' 
  | 'team-updated' 
  | 'team-deleted' 
  | 'transfer-update'

interface GovernanceSyncMessage {
  type: GovernanceSyncType
  fromHostId: string
  timestamp: string                  // ISO
  payload: Record<string, unknown>
}

interface GovernancePeerState {
  hostId: string
  managerId: string | null
  managerName: string | null
  teams: PeerTeamSummary[]
  lastSyncAt: string                // ISO
  ttl: number                       // seconds
}
```

### types/governance-request.ts
```typescript
type GovernanceRequestType =
  | 'add-to-team' | 'remove-from-team' | 'assign-cos' | 'remove-cos'
  | 'transfer-agent' | 'create-agent' | 'delete-agent' | 'configure-agent'

type GovernanceRequestStatus =
  | 'pending' | 'remote-approved' | 'local-approved' | 'dual-approved'
  | 'executed' | 'rejected'

interface GovernanceRequest {
  id: string                        // UUID
  type: GovernanceRequestType
  sourceHostId: string
  targetHostId: string
  requestedBy: string               // agentId UUID
  requestedByRole: AgentRole
  payload: GovernanceRequestPayload
  approvals: GovernanceApprovals
  status: GovernanceRequestStatus
  createdAt: string                // ISO
  updatedAt: string                // ISO
  note?: string
  rejectReason?: string
}

interface ConfigurationPayload {
  operation: ConfigOperationType    // add-skill, remove-skill, etc.
  scope: 'local' | 'user' | 'project'
  skills?: string[]
  plugins?: string[]
  hooks?: Record<string, unknown>
  mcpServers?: Record<string, unknown>
  model?: string
  programArgs?: string
}
```

---

## 7. SECURITY & AUTHENTICATION MATRIX

| Endpoint | Auth Method | Rate Limit | Signature | Notes |
|----------|-------------|-----------|-----------|-------|
| GET /api/governance | None | — | — | Public, Phase 1 localhost-only |
| POST /api/governance/password | None | — | — | Initial setup unprotected; change requires old password |
| POST /api/governance/manager | Gov password | 5/15min | — | TOCTOU window acceptable for Phase 1 |
| GET /api/governance/trust | None | — | — | Public |
| POST /api/governance/trust | Gov password | — | — | Adds cross-host manager |
| DELETE /api/governance/trust/[id] | Gov password | — | — | Removes cross-host manager |
| GET /api/governance/reachable | None | — | — | Public; cage logic in service |
| GET /api/teams | X-Agent-Id optional | — | — | ACL checks if authenticated |
| POST /api/teams | X-Agent-Id required | — | AMP API key | Bearer token validation |
| GET /api/teams/[id] | X-Agent-Id optional | — | — | Team ACL enforced |
| PUT /api/teams/[id] | X-Agent-Id required | — | AMP API key | Type/COS fields stripped |
| DELETE /api/teams/[id] | X-Agent-Id required | — | AMP API key | — |
| GET /api/teams/names | None | — | — | Public collision check |
| POST /api/teams/[id]/chief-of-staff | Gov password | 5/15min (per team) | — | Auto-rejects pending config requests |
| POST /api/v1/governance/requests | Gov password OR host sig | — | Ed25519 | Dual-path auth |
| GET /api/v1/governance/requests | None | — | — | Local requests only |
| POST /api/v1/governance/requests/[id]/approve | Gov password | — | — | — |
| POST /api/v1/governance/requests/[id]/reject | Gov password OR host sig | — | Ed25519 (optional) | Dual-path auth |
| GET /api/v1/governance/sync | Host signature | — | Ed25519 | 5min timestamp window |
| POST /api/v1/governance/sync | Host signature | — | Ed25519 | 5min timestamp window |
| POST /api/agents/[id]/transfer | Internal | — | — | Service-layer ACL |

---

## 8. ERROR RESPONSES & STATUS CODES

All endpoints follow consistent error format:
```json
{
  "error": "Human-readable message",
  "status": 400
}
```

**Common status codes:**
- `400` — Invalid request body, missing required fields, validation failed
- `401` — Authentication failed (invalid password, invalid API key, missing headers)
- `403` — Forbidden (insufficient privileges, team ACL denied, host unknown)
- `404` — Resource not found (team, agent, request, host)
- `409` — Conflict (team name collision, duplicate transfer request)
- `429` — Rate limited (governance password attempts)
- `500` — Internal server error (file I/O, bcrypt, service exceptions)

---

## 9. PHASE 1 LIMITATIONS & PHASE 2 ROADMAP

### Phase 1 (Current)
- ✅ Localhost-only (no remote authentication)
- ✅ Single-user (no per-session CSRF tokens)
- ✅ Governance password (shared secret)
- ✅ Manager role (singleton)
- ✅ Chief-of-Staff role (per team)
- ✅ Team ACL (manager/COS/members only for closed teams)
- ⚠️ Optional agent authentication (endpoints skip governance checks if no X-Agent-Id header)

### Phase 2 Roadmap
- [ ] Mandatory agent authentication on all governance endpoints (SF-058)
- [ ] X-Request-Source header + CSRF tokens for web UI vs agent distinction
- [ ] Per-session agent authentication with revocable tokens
- [ ] In-memory governance cache (avoid re-reading JSON per call)
- [ ] Discriminated union types for GovernanceSyncMessage payloads (NT-038)
- [ ] Remote SSH sessions (Phase 3)

---

## 10. EXTERNAL PLUGIN COMPATIBILITY NOTES

**For 3 external plugins auditing this API:**

1. **Team Management**
   - Teams are created with `type: 'open' | 'closed'`
   - Closed teams restrict access to manager + COS + members
   - Web UI requests (no X-Agent-Id) bypass ACL; agents require Bearer token
   - All team operations return `Team` object with `id`, `name`, `agentIds`, `chiefOfStaffId`, `type`

2. **Governance Request Lifecycle**
   - Request status: pending → dual-approved/rejected → executed
   - Approvals tracked per role (sourceCOS, sourceManager, targetCOS, targetManager)
   - Configuration operations support: add-skill, remove-skill, add-plugin, remove-plugin, update-hooks, update-mcp, update-model, update-program-args, bulk-config
   - Cross-host requests require Ed25519 host signatures

3. **Authentication & Authorization**
   - X-Agent-Id header with Authorization: Bearer <api-key> (via AMP)
   - Governance password protects manager role, team COS assignment, cross-host trust
   - Team ACL: manager always allowed; COS allowed only in their team; members allowed in their teams only

4. **Storage Locations**
   - ~/.aimaestro/governance.json — governance config (password, manager)
   - ~/.aimaestro/governance-requests.json — cross-host request queue
   - ~/.aimaestro/governance-transfers.json — team transfer requests
   - ~/.aimaestro/teams/ — team registry (per-team files)

5. **Rate Limiting**
   - Governance password: 5 failed attempts per 15 minutes (per operation)
   - All rate limits checked + recorded atomically (no TOCTOU window)

---

**Report generated:** 2026-02-27 (automated analysis)  
**Total endpoints:** 22 (all new in feature/team-governance PR)  
**Breaking changes:** 0
