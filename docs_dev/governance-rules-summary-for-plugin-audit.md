# AI Maestro Governance Rules -- Comprehensive Summary for Plugin Audit

**Generated:** 2026-02-27
**Source files analyzed:** 13 files across `lib/`, `types/`, and `services/`

---

## 1. ROLE TAXONOMY

Three roles exist, defined in `types/agent.ts` as `AgentRole`, aliased as `GovernanceRole` in `types/governance.ts`:

| Role | Value | Scope |
|------|-------|-------|
| **MANAGER** | `'manager'` | Global singleton -- exactly one agent per host |
| **Chief-of-Staff (COS)** | `'chief-of-staff'` | Per-team -- one COS per closed team |
| **Member** | `'member'` | Default role -- regular team agents |

---

## 2. MANAGER ROLE

### 2.1 Singleton Constraint
- **Exactly one MANAGER per host.** Stored as `managerId` (UUID) in `~/.aimaestro/governance.json`.
- Setting a new manager replaces the previous one (no co-managers).

### 2.2 Assignment / Removal
- **Requires governance password** (bcrypt-verified, 12 salt rounds).
- `setManager(agentId)` -- sets the manager and broadcasts to mesh peers.
- `removeManager()` -- clears the manager (sets to null) and broadcasts.
- Rate-limited: atomic `checkAndRecordAttempt('governance-manager-auth')` prevents brute-force.

### 2.3 Permissions
- **Team ACL bypass:** MANAGER always has access to all closed teams (`team-acl.ts` step 4).
- **Transfer requests:** Can create and resolve transfers (source COS OR global MANAGER).
- **Closed team deletion:** Only MANAGER or COS of that team can delete a closed team.
- **Cross-host governance:** Can submit, approve, and reject cross-host requests.
- **Manager trust:** Can be added to the trust registry for auto-approval of cross-host requests.
- **Membership flexibility:** MANAGER is exempt from the "one closed team" restriction -- can be in multiple closed teams (`v2 Rule 20`).
- **Open team memberships preserved:** When a normal agent joins a closed team, their open team memberships are revoked, but MANAGER is exempt from this revocation.

### 2.4 Cross-Host MANAGER Recognition
- `isManagerOnAnyHost(agentId)` checks local governance first, then all non-expired peer states.
- Peer states cached in `~/.aimaestro/governance-peers/{hostId}.json` with 5-minute TTL.

---

## 3. CHIEF-OF-STAFF (COS) ROLE

### 3.1 Scope
- **Per closed team only.** Open teams cannot have a COS (enforced at `assign-cos` execution: `team.type !== 'closed'` check).
- Stored as `team.chiefOfStaffId` on the `Team` object.

### 3.2 Constraints
- **One COS per team:** Each closed team has at most one COS.
- **One team per COS (G3, v2 Rule 7):** An agent can only be COS of one closed team at a time. Enforced in cross-host `assign-cos` execution: checks `teams.find(t => t.id !== team.id && t.chiefOfStaffId === agentId)`.
- **COS must be a team member (R4.6):** When assigning COS, the agent is auto-added to `agentIds` if not already present.
- **Cannot transfer COS out:** A COS cannot be transferred out of their team -- the COS role must be removed first (`governance-service.ts` createTransferReq check).

### 3.3 Permissions
- **Team ACL:** COS of a closed team has access to that team's resources (`team-acl.ts` step 5).
- **Transfer requests:** COS of the *source* team can create and resolve transfers.
- **Cross-host governance:** COS can submit, approve, and reject cross-host requests (as `sourceCOS` or `targetCOS`).
- **Membership flexibility:** COS keeps open team memberships when joining a closed team (exempt from G4 revocation, `v2 Rule 21`).
- **Team deletion:** COS of a closed team can delete that team.

### 3.4 Cross-Host COS Recognition
- `isChiefOfStaffOnAnyHost(agentId)` checks local closed teams first, then peer states.
- Only closed teams with matching `chiefOfStaffId` are considered.

---

## 4. TEAM TYPES

### 4.1 Open Teams (`type: 'open'`)
- **Default type.** No messaging restrictions.
- **No ACL enforcement:** Any agent can access open team resources.
- **No COS assignment:** Open teams cannot have a chiefOfStaffId.
- **No transfer requests needed:** Direct team update suffices for open teams.
- **Backward compatible:** Teams without a type are treated as open.

### 4.2 Closed Teams (`type: 'closed'`)
- **Isolated messaging.** External messages routed through the COS.
- **ACL enforced:** Only MANAGER, COS, and team members can access resources.
- **COS is gateway:** Messages from outside the team are routed through COS.
- **Transfer requests required:** Moving agents between closed teams requires a formal transfer workflow.

---

## 5. TEAM ACCESS CONTROL LIST (ACL)

Defined in `lib/team-acl.ts`, the `checkTeamAccess()` function evaluates access in this order:

| Priority | Condition | Result |
|----------|-----------|--------|
| 1 | Web UI (no agentId / no X-Agent-Id header) | **ALLOWED** (Phase 1 localhost trust) |
| 2 | Team not found | **DENIED** (reason: "Team not found") |
| 3 | Team is open or type undefined | **ALLOWED** |
| 4 | Requester is MANAGER | **ALLOWED** |
| 5 | Requester is COS of this team | **ALLOWED** |
| 6 | Requester is a member of this team | **ALLOWED** |
| 7 | Otherwise | **DENIED** (reason: "Access denied: you are not a member of this closed team") |

**ACL is enforced on:** Team CRUD, task CRUD, document CRUD (all via `teams-service.ts`).

---

## 6. AGENT MEMBERSHIP RULES

### 6.1 Normal Agents (Members)
- **One closed team maximum:** A normal agent can belong to at most one closed team at a time.
- **G4 Rule (v2 Rule 22):** When a normal agent joins a closed team, all their open team memberships are automatically revoked.
- **Must formally transfer:** Moving between closed teams requires a transfer request approved by COS or MANAGER.

### 6.2 Privileged Agents (MANAGER and COS)
- **MANAGER:** Can be in multiple closed teams simultaneously (`v2 Rule 20`).
- **COS:** Keeps open team memberships when joining a closed team (`v2 Rule 21`), but can only be COS of one team (G3).

### 6.3 Agent Assignment to Teams
- On `add-to-team` execution (cross-host): Agent is added to `team.agentIds`. If the team is closed and the agent is normal (not MANAGER, not COS of that team), their open team memberships are revoked.
- On `remove-from-team` execution: Agent is removed from `team.agentIds`.

---

## 7. TRANSFER REQUESTS (LOCAL)

Defined in `types/governance.ts` as `TransferRequest`:

### 7.1 Statuses
```
pending -> approved | rejected
```

### 7.2 Who Can Create
- Only **MANAGER** or **COS** (anywhere) -- checked via `isManager(requestedBy) || isChiefOfStaffAnywhere(requestedBy)`.

### 7.3 Who Can Resolve
- Only **source team COS** or **global MANAGER** can approve/reject a transfer.

### 7.4 Constraints
- Source and destination teams must be different.
- Agent must be in the source team.
- Cannot transfer the COS out of their team (remove COS role first).
- Transfer requests are only meaningful for closed teams -- open teams use direct team update.
- Duplicate pending transfers (same agent + fromTeam + toTeam) are rejected with 409.
- On approval: closed-team constraint is checked (normal agent not already in another closed team).
- On approval failure (saveTeams error): transfer is reverted to 'pending' (compensating action).

---

## 8. CROSS-HOST GOVERNANCE REQUESTS

### 8.1 Request Types
Defined in `types/governance-request.ts`:

| Type | Description |
|------|-------------|
| `add-to-team` | Add agent to a team on the target host |
| `remove-from-team` | Remove agent from a team on the target host |
| `assign-cos` | Set COS on a team on the target host |
| `remove-cos` | Clear COS on a team on the target host |
| `transfer-agent` | Move agent between teams on the target host |
| `create-agent` | Create agent on target host (NOT YET IMPLEMENTED) |
| `delete-agent` | Delete agent on target host (NOT YET IMPLEMENTED) |
| `configure-agent` | Deploy config (skills, plugins, hooks, MCP, model, etc.) to agent on target host |

### 8.2 Status State Machine
```
pending -> remote-approved | local-approved
         -> dual-approved
         -> executed | rejected
```

Naming convention is from the **target host's** perspective:
- `remote-approved` = the *source* (remote) side approved
- `local-approved` = the *target* (local) side approved
- `dual-approved` = both sides have at least COS approval, but not both managers yet
- `executed` = both managers approved (auto-execute trigger)
- `rejected` = rejected by either side

### 8.3 Approval Types
Four approval slots per request:

| Slot | Who | Host |
|------|-----|------|
| `sourceCOS` | COS on source host | Source |
| `sourceManager` | MANAGER on source host | Source |
| `targetCOS` | COS on target host | Target |
| `targetManager` | MANAGER on target host | Target |

### 8.4 Auto-Execute Rule
**Both MANAGER approvals required for execution:**
- `sourceManager.approved === true` AND `targetManager.approved === true` --> status becomes `executed`.
- COS approvals alone are NOT sufficient for execution (they advance to `dual-approved` at most).

### 8.5 Submission Rules
- Requires governance password.
- Requester must exist in local agent registry.
- Role must match: if claiming `manager`, must actually be the MANAGER; if claiming `chief-of-staff`, must actually be COS somewhere.
- Target host must be a known peer (not self).
- `configure-agent` requires a `configuration` payload with an `operation` field.
- Cross-host `configure-agent` only supports `'local'` scope (user/project scopes are local-only).

### 8.6 Receive Rules (Target Host)
- Sender must be a known host.
- Request fields validated: `id`, `type`, `requestedBy`, `payload.agentId` all required.
- `requestedByRole` must be a valid `AgentRole` (`manager`, `chief-of-staff`, `member`).
- `sourceHostId` must match the actual sender.
- **Security:** Received requests are ALWAYS reset to `status: 'pending'` with empty `approvals`, regardless of what the remote host sent. This prevents a malicious peer from sending pre-approved or pre-executed requests.

### 8.7 Approval Rules
- Requires governance password.
- Only MANAGER or COS can approve.
- Approver must be on source or target host of the request.
- Terminal states (`executed`, `rejected`) cannot be re-approved (409 Conflict).
- TOCTOU protection: pre-approval status is captured to detect races.

### 8.8 Rejection Rules
- Requires governance password.
- Only MANAGER or COS can reject.
- Cannot reject an already-executed request.
- If the request originated from another host, the source host is notified of rejection (fire-and-forget).

### 8.9 Execution Details
The `performRequestExecution()` function handles the actual mutation:

- **add-to-team:** Adds agent to team; if closed team and normal agent, revokes open team memberships (G4).
- **remove-from-team:** Removes agent from team.
- **assign-cos:** Sets COS (only on closed teams, one COS per agent, auto-adds to agentIds).
- **remove-cos:** Clears COS.
- **transfer-agent:** Removes from source, adds to destination.
- **configure-agent:** Deploys config via `agents-config-deploy-service`.

Execution failures are logged but do NOT revert the `executed` status (Phase 2 will add a `'failed'` status). Instead, `executionError` and `executionFailedAt` fields are set on the request.

---

## 9. MANAGER TRUST (LAYER 4)

### 9.1 Purpose
Auto-approve cross-host governance requests from trusted MANAGERs without requiring manual MANAGER approval on the target host.

### 9.2 Storage
`~/.aimaestro/manager-trust.json` containing `ManagerTrust[]`:
```typescript
{
  hostId: string       // Trusted host ID
  managerId: string    // Trusted manager's agent UUID
  managerName: string  // Display name
  trustedAt: string    // ISO timestamp
  autoApprove: boolean // Whether to auto-approve (default: true)
}
```

### 9.3 Trust Operations
- **Add trust:** Requires governance password. Keyed by `hostId` (one trust record per host, upserted).
- **Remove trust:** Requires governance password.

### 9.4 Auto-Approve Logic (`shouldAutoApprove`)
Returns true ONLY if ALL three conditions are met:
1. A trust record exists for `request.sourceHostId`
2. The trust record's `autoApprove === true`
3. The trust record's `managerId === request.requestedBy` (the requesting agent is the trusted manager)

### 9.5 Auto-Approve Execution
When a new request is received and `shouldAutoApprove(request)` returns true:
1. The local MANAGER's ID is used to record a `targetManager` approval.
2. If both managers have now approved (source already approved before sending), the request auto-executes.
3. Only genuinely new requests are auto-approved (duplicates are skipped).

---

## 10. ROLE ATTESTATION (LAYER 2)

### 10.1 Purpose
Cryptographically prove an agent's role when forwarding messages across hosts.

### 10.2 Attestation Format
```typescript
{
  role: AgentRole           // 'manager' | 'chief-of-staff' | 'member'
  agentId: string           // Agent UUID
  hostId: string            // Host that created the attestation
  timestamp: string         // ISO
  signature: string         // Ed25519 signature (base64)
  recipientHostId?: string  // Prevents cross-target replay attacks
}
```

### 10.3 Signed Data Format
```
"role|agentId|hostId|timestamp[|recipientHostId]"
```

### 10.4 Verification Checks
1. **Timestamp freshness:** Attestation must be within 5 minutes (`ATTESTATION_MAX_AGE_MS = 300,000ms`).
2. **Recipient binding:** If `expectedRecipientHostId` is provided, `attestation.recipientHostId` must match.
3. **Signature validity:** Ed25519 signature verified against expected host's public key.

### 10.5 Serialization
Attestations are base64-encoded JSON for transport in HTTP headers.
Deserialization validates all required fields and checks role against an allowlist: `['manager', 'chief-of-staff', 'member']`.

---

## 11. GOVERNANCE SYNC (LAYER 1)

### 11.1 Design
Full-snapshot sync (not incremental). Every sync message includes the complete governance state.

### 11.2 Sync Types
```typescript
type GovernanceSyncType = 'manager-changed' | 'team-updated' | 'team-deleted' | 'transfer-update'
```

### 11.3 Broadcast Triggers
- `setManager()` / `removeManager()` broadcast `'manager-changed'`.
- After cross-host request execution, `'team-updated'` is broadcast.

### 11.4 Peer State
Each peer's governance state is cached at `~/.aimaestro/governance-peers/{hostId}.json`:
```typescript
{
  hostId: string
  managerId: string | null
  managerName: string | null
  teams: PeerTeamSummary[]
  lastSyncAt: string    // ISO
  ttl: number           // Seconds (default 300 = 5 minutes)
}
```

### 11.5 Stale Data Filtering
- `getAllPeerGovernance()` filters out entries whose `(now - lastSyncAt) > ttl * 1000`.
- Entries with unparseable timestamps are also filtered out.

### 11.6 Security
- Outbound: Signed with host's Ed25519 key (`X-Host-Signature` header).
- Inbound: Validates sender matches message envelope.
- Payload validation: `managerId` (string|null), `managerName` (string|null), `teams` (array).
- Path traversal protection: `hostId` is validated against `/[\/\\]|\.\./` pattern.

---

## 12. GOVERNANCE PASSWORD

### 12.1 Storage
Bcrypt hash stored in `governance.json` as `passwordHash` (12 salt rounds).

### 12.2 Constraints
- Minimum 6 characters, maximum 72 characters (bcrypt limit).
- Changing an existing password requires the current password.

### 12.3 Rate Limiting
All password-protected endpoints use atomic `checkAndRecordAttempt()` with per-key rate limiting:
- `governance-manager-auth`
- `governance-password-change`
- `governance-trust-auth`
- `cross-host-gov-submit:{agentId}`
- `cross-host-gov-approve:{agentId}`
- `cross-host-gov-reject:{agentId}`

---

## 13. REQUEST TTL AND PURGING

### 13.1 Pending Request TTL
- Non-terminal statuses (`pending`, `remote-approved`, `local-approved`, `dual-approved`) are auto-rejected after **7 days**.
- Reason: `"Request expired (TTL: 7d, was: <previous status>)"`

### 13.2 Terminal Request Purging
- Executed and rejected requests are purged after **30 days** (configurable `maxAgeDays`).
- Prevents unbounded growth of `governance-requests.json`.

---

## 14. CONFIGURE-AGENT OPERATIONS

### 14.1 Operation Types
```typescript
type ConfigOperationType =
  | 'add-skill' | 'remove-skill'
  | 'add-plugin' | 'remove-plugin'
  | 'update-hooks' | 'update-mcp'
  | 'update-model' | 'update-program-args'
  | 'bulk-config'
```

### 14.2 Scope
```typescript
type ConfigScope = 'local' | 'user' | 'project'
```
Cross-host only supports `'local'` scope.

### 14.3 Deployment
Executed via `deployConfigToAgent()` from `agents-config-deploy-service`. Records `ConfigDiff` with before/after state.

---

## 15. KEY INVARIANTS FOR PLUGIN AUDIT

A plugin MUST respect these invariants:

1. **MANAGER is singleton per host.** Never assume multiple managers.
2. **COS is per-closed-team and one-team-per-COS.** Never assign COS to open teams.
3. **Normal agents: one closed team max.** MANAGER and COS are exempt.
4. **G4 Rule:** When a normal agent joins a closed team, revoke their open team memberships.
5. **Closed team ACL:** Only MANAGER, COS, and members can access closed team resources.
6. **Web UI bypass:** Requests without `X-Agent-Id` header are treated as web UI and always allowed (Phase 1).
7. **Transfer COS prohibition:** Cannot transfer COS out of their team without removing the role first.
8. **Cross-host requests need dual MANAGER approval** to execute (COS alone is insufficient).
9. **Received requests are always reset to pending** with empty approvals (prevents pre-approved injection).
10. **Role attestations expire after 5 minutes** and are bound to recipient host.
11. **Governance password is required** for all privileged governance operations.
12. **Rate limiting** is enforced on all password-verified endpoints.
13. **Peer governance states expire after 5 minutes** (TTL-based).
14. **Pending requests expire after 7 days.** Terminal requests are purged after 30 days.
15. **Auto-approve** only fires when a trusted manager's UUID matches the requestor AND autoApprove is true.
16. **`configure-agent` cross-host: local scope only.** User/project scopes are local-only by design.
17. **All governance state mutations broadcast to mesh peers** via full-snapshot sync.

---

## 16. FILE LOCATIONS

| File | Purpose |
|------|---------|
| `~/.aimaestro/governance.json` | Governance config (password, managerId) |
| `~/.aimaestro/governance-requests.json` | Cross-host governance requests |
| `~/.aimaestro/governance-peers/{hostId}.json` | Cached peer governance states |
| `~/.aimaestro/manager-trust.json` | Trusted manager relationships |
| `~/.aimaestro/teams.json` | Team definitions (via team-registry) |

---

## 17. SOURCE FILE INDEX

| File | Layer | Key Functions |
|------|-------|---------------|
| `lib/governance.ts` | Core | `isManager`, `isChiefOfStaff`, `setManager`, `removeManager`, `setPassword`, `verifyPassword`, `getClosedTeamForAgent`, `getClosedTeamsForAgent` |
| `lib/team-acl.ts` | ACL | `checkTeamAccess` |
| `lib/governance-peers.ts` | L1 Cache | `isManagerOnAnyHost`, `isChiefOfStaffOnAnyHost`, `getTeamFromAnyHost`, `getPeerTeamsForAgent` |
| `lib/governance-sync.ts` | L1 Sync | `broadcastGovernanceSync`, `handleGovernanceSyncMessage`, `requestPeerSync` |
| `lib/governance-request-registry.ts` | L3 CRUD | `createGovernanceRequest`, `approveGovernanceRequest`, `rejectGovernanceRequest`, `executeGovernanceRequest`, `purgeOldRequests` |
| `lib/role-attestation.ts` | L2 Crypto | `createRoleAttestation`, `verifyRoleAttestation` |
| `lib/manager-trust.ts` | L4 Trust | `addTrustedManager`, `removeTrustedManager`, `isTrustedManager`, `shouldAutoApprove` |
| `types/governance.ts` | Types | `GovernanceConfig`, `GovernanceRole`, `PeerTeamSummary`, `HostAttestation`, `GovernanceSyncType` |
| `types/governance-request.ts` | Types | `GovernanceRequest`, `GovernanceRequestType`, `GovernanceRequestStatus`, `GovernanceApprovals`, `ConfigurationPayload` |
| `types/team.ts` | Types | `Team`, `TeamType` |
| `services/governance-service.ts` | Service | `setManagerRole`, `setGovernancePassword`, `getReachableAgents`, `createTransferReq`, `resolveTransferReq`, `addTrust`, `removeTrust` |
| `services/cross-host-governance-service.ts` | Service | `submitCrossHostRequest`, `receiveCrossHostRequest`, `approveCrossHostRequest`, `rejectCrossHostRequest`, `receiveRemoteRejection` |
| `services/teams-service.ts` | Service | `createNewTeam`, `updateTeamById`, `deleteTeamById`, all task/document CRUD with ACL enforcement |
