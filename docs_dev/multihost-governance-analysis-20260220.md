# Multi-Host Mesh Governance Analysis

**Date:** 2026-02-20
**Branch:** `feature/team-governance` (v0.25.2)
**Scope:** Pure investigation — no code changes

---

## Executive Summary

AI Maestro has a **mature mesh networking layer** (AMP) that enables cross-host agent communication, agent transfer, terminal proxying, and peer discovery. However, the **governance system is 100% localhost-scoped** — every governance component (manager role, teams, ACL, message filter, transfers) reads and writes local files with no awareness of other hosts. This creates a fundamental architectural gap: the communication fabric exists for multi-host operation, but the authorization and control fabric does not.

The 11 scenarios investigated below reveal that multi-host governance is **feasible but requires significant architectural additions**. No unsolvable blockers exist — the changes are additive, not contradictory.

---

## Current Architecture: What Exists

### What WORKS Cross-Host Today

| Capability | Mechanism | Status |
|------------|-----------|--------|
| Agent-to-agent messaging | AMP mesh (HTTP forwarding + relay queue) | Working |
| Agent discovery across hosts | Mesh agent lookup (parallel peer queries) | Working |
| Agent transfer between hosts | Export ZIP + HTTP import | Working |
| Remote terminal viewing | WebSocket proxy through local AI Maestro | Working |
| Host discovery & registration | Bidirectional peer sync with propagation | Working |
| Docker agent creation on remote host | HTTP forwarding to remote API | Working |
| Ed25519 message signing | Mandatory for mesh/federated messages | Working |
| Organization-wide identity | `agent@org.aimaestro.local` addresses | Working |

### What is LOCAL-ONLY (Cannot Cross Host Boundaries)

| Component | Storage | Impact |
|-----------|---------|--------|
| Manager identity | `~/.aimaestro/governance.json` per host | Each host has independent MANAGER |
| Governance password | bcrypt hash in local `governance.json` | Each host has independent password |
| Team definitions | `~/.aimaestro/teams/teams.json` per host | Teams invisible to other hosts |
| Team ACL checks | `lib/team-acl.ts` reads local files | Remote agents bypass all ACL |
| Message filter rules | `lib/message-filter.ts` reads local state | Cross-host messages use incomplete rules |
| Transfer requests | `~/.aimaestro/governance-transfers.json` per host | Cannot reference remote teams |
| COS/role detection | `lib/governance.ts` reads local files | COS on Host A invisible to Host B |
| Tmux operations | `lib/agent-runtime.ts` via local `tmux` CLI | Cannot operate remote tmux |

---

## Scenario Analysis

### Scenario 1: Are Governance Rules Applicable Across Hosts?

**Verdict: NO — governance rules are silently unenforced across host boundaries.**

The governance rules (v2) implicitly assume a single flat namespace of agents and teams on one host. Key breakdowns:

1. **MANAGER singleton**: Rule says "only one agent can be MANAGER at any time." In multi-host mesh, each host independently appoints its own MANAGER via local `governance.json`. No coordination ensures a single global MANAGER.

2. **`isManager(agentId)`** reads local file: A MANAGER appointed on Host A is unrecognized on Host B. If Host A's MANAGER sends a message to an agent on Host B, the message arrives as mesh-forwarded (`senderAgentId: null`), and Host B cannot verify the sender is a MANAGER.

3. **`checkTeamAccess()`** reads local teams and governance: An agent on Host B requesting a team resource on Host A gets checked against Host A's local governance — which knows nothing about Host B's governance state.

4. **`checkMessageAllowed()`** has one multi-host accommodation: mesh-forwarded messages (`senderAgentId === null`) are blanket-denied for closed-team recipients and blanket-allowed for open-team recipients. This is safe but overly restrictive — a legitimate MANAGER message from another host is denied if the recipient is in a closed team.

**Required changes:**
- Governance state must be replicated or queried cross-host
- `isManager()`, `isChiefOfStaff()` need host-aware lookups
- Message filter needs mesh sender identity verification (TODO already exists at `message-filter.ts:53`)

---

### Scenario 2: Teams With Agents Across Different Hosts

**Verdict: PARTIALLY POSSIBLE — teams can reference remote agent UUIDs, but governance enforcement fails.**

**What works:**
- Team `agentIds` are bare UUIDs. Nothing prevents adding a remote agent's UUID to a local team.
- The agent registry has `hostId` on every agent, so the host of each team member is discoverable.

**What breaks:**
- `validateTeamMutation()` checks multi-closed-team constraints against **local teams only**. An agent could be in Closed Team Alpha on Host A and Closed Team Beta on Host B — neither host detects the violation.
- When notifying team agents, `notifyTeamAgents` skips remote agents (notification-service checks `isSelf(agentHost)` and returns `{ notified: false }` for remote agents).
- Team tasks and documents are stored locally per team. No cross-host task/document sync.

**Required changes:**
- Add `hostId` qualifier to `agentIds` in teams (e.g., `agentId@hostId` or a separate mapping)
- Cross-host `validateTeamMutation()` must query remote hosts' team registries
- Team notifications need AMP-based delivery for remote members (not tmux)

---

### Scenario 3: Remote Agents Following Local COS/Manager Instructions

**Verdict: COMMUNICATION WORKS, ENFORCEMENT DOES NOT.**

**What works:**
- AMP messaging delivers messages from a local COS/Manager to a remote agent reliably
- The message content (instructions, task assignments) reaches the remote agent
- The remote agent can read its inbox and act on the message

**What breaks:**
- The remote agent's host has no governance context about the sender's role. If the remote agent's code (or a human operator) checks "is this message from my COS?", it must query a governance authority — which doesn't exist cross-host.
- The remote host's message filter may block the message if the remote agent is in a closed team (mesh-forwarded messages are blanket-denied for closed teams).

**Required changes:**
- Mesh-forwarded messages need sender role attestation (e.g., the sending host attests "sender is MANAGER" in a signed header)
- Remote host's message filter must verify the attestation against the sending host's governance state

---

### Scenario 4: Local Agents Under Remote Manager Control

**Verdict: NOT CURRENTLY POSSIBLE.**

**Detailed breakdown:**

1. A remote Manager (on Host B) sends a command to a local agent (on Host A) via AMP.
2. The message arrives at Host A as a mesh-forwarded message (`X-Forwarded-From: hostB`).
3. Host A's `routeMessage()` authenticates it as `mesh-hostB` (trusted host) and delivers locally.
4. If the recipient agent is in a closed team, the message filter **denies** it (mesh-forwarded messages blanket-denied for closed teams).
5. Even if the message gets through, the local agent has no way to verify "this message is from the MANAGER" because `isManager()` on Host A checks Host A's `governance.json`, where Host B's MANAGER is not recorded.

**Required changes:**
- A "host governance authority" concept: each host trusts a designated governance source (could be a primary host, or a consensus mechanism)
- Message filter must accept mesh-forwarded messages from authenticated MANAGERs
- Local `isManager()` needs a fallback: query the sender's host if the agentId is not the local MANAGER

---

### Scenario 5: Manager, COS, and Agent on 3 Different Hosts

**Verdict: COMMUNICATION WORKS, GOVERNANCE CHAIN BREAKS AT EVERY HOP.**

Consider: Manager on Host A, COS on Host B, Agent on Host C.

| Interaction | What Happens | Result |
|-------------|-------------|--------|
| Manager (A) → COS (B) | AMP delivers via mesh. Host B's filter: sender is null (mesh-forwarded). COS is in closed team. | **DENIED** (mesh → closed team) |
| COS (B) → Agent (C) | AMP delivers via mesh. Host C's filter: sender is null. Agent is in closed team. | **DENIED** (mesh → closed team) |
| Agent (C) → COS (B) | AMP delivers via mesh. Host B's filter: sender is null. COS in closed team. | **DENIED** (mesh → closed team) |
| COS (B) → Manager (A) | AMP delivers via mesh. Host A's filter: sender is null. Manager not in closed team. | **ALLOWED** (but Manager can't verify sender is COS) |

Every cross-host interaction involving a closed team fails. The only messages that get through are those to agents NOT in closed teams.

**Required changes:**
- Mesh-forwarded messages need sender identity attestation from the forwarding host
- Each host needs a replicated view of the global team/role state, or a query mechanism to verify roles on remote hosts
- The message filter needs a new step: "verify mesh sender role via host attestation"

---

### Scenario 6: Create/Delete Agents on Remote Hosts

**Verdict: API EXISTS BUT IS UNGOVERNED.**

**What works:**
- `POST /api/agents` on a remote host creates an agent (no authentication required!)
- `DELETE /api/agents/:id` on a remote host deletes an agent (no auth required!)
- `POST /api/agents/docker/create` with `hostId` forwards to the remote host's API
- `POST /api/agents/:id/transfer` moves an agent between hosts via ZIP export/import

**What breaks:**
- No governance check on remote agent creation/deletion. Governance Rule v2 says only MANAGER can create/delete agents (via COS who needs MANAGER approval). But the API routes have zero governance enforcement for these operations.
- Agent CRUD routes have no authentication at all. Any process that can reach the API can create or delete agents on any host.

**Required changes:**
- Agent CRUD routes must require authentication (at minimum, AMP API key)
- Agent creation/deletion should check governance rules: is the requester a MANAGER? Is the requester a COS with MANAGER approval?
- Cross-host governance approval workflow: "Host A wants to create an agent on Host B" → Host B's MANAGER must approve

---

### Scenario 7: Multi-Host Teams Obeying Governance

**Verdict: NOT CURRENTLY POSSIBLE. Teams are local-only.**

**Fundamental issue:** Each host stores teams in its own `~/.aimaestro/teams/teams.json`. There is no team replication, no cross-host team sync, and no way for Host B to know about teams on Host A.

**Consequences:**
- If a team contains agents from Hosts A, B, and C, only Host A (where the team is defined) knows the full membership. Hosts B and C have no team records.
- `checkTeamAccess()` on Host B returns "team not found" for a team defined on Host A.
- `checkMessageAllowed()` on Host B cannot enforce closed-team messaging rules for a team it doesn't know about.
- `validateTeamMutation()` cannot check multi-closed-team constraints across hosts.

**Required changes (two design options):**

**Option A: Centralized team authority**
- One host (the "governance primary") owns all team definitions
- Other hosts query the primary for team lookups, or receive push updates
- All team mutations routed through the primary

**Option B: Replicated team state**
- When a team is created/modified, the change is broadcast via AMP to all peer hosts
- Each host maintains a local replica of the global team state
- Eventual consistency with conflict resolution (last-write-wins or version vectors)

Option A is simpler and avoids split-brain. Option B is more resilient to primary failure.

---

### Scenario 8: Conflicting Manager Orders From Different Hosts

**Verdict: CURRENTLY UNDETECTED. Each host operates independently.**

**Problem statement:** Host A's MANAGER says "move Agent X to Team Alpha." Host B's MANAGER says "move Agent X to Team Beta." If Agent X is on Host C, both requests arrive at Host C's API. Since Host C has its own governance state, it has no basis to prefer one MANAGER over the other.

**Current behavior:**
- Each host has its own MANAGER. If Host C gets two conflicting requests, the last one to execute wins (no conflict detection).
- If governance is not enforced at all (current state for many routes), both operations succeed silently, leaving inconsistent state.

**Required changes:**

This is the **hardest multi-host problem**. Options:

**Option 1: Single global MANAGER (simple but centralized)**
- One MANAGER across the entire mesh (like a Kubernetes cluster-admin)
- All governance mutations must be signed by this MANAGER's Ed25519 key
- Other hosts verify the signature before applying changes

**Option 2: Per-host MANAGER with domain authority (distributed)**
- Each host has a MANAGER that governs agents on that host
- Cross-host operations require approval from BOTH the source and target host MANAGERs
- This avoids single-point-of-failure but requires a cross-host approval protocol

**Option 3: Hierarchical governance (hybrid)**
- A "super-MANAGER" (organization admin) can override per-host MANAGERs
- Per-host MANAGERs have authority over their own agents
- Cross-host operations require super-MANAGER approval or mutual MANAGER consent

**Recommendation: Option 2** — it aligns with the scenario 9 requirement and is most natural for a mesh topology.

---

### Scenario 9: Each Manager Governs Its Own Host — Approve Remote Operations

**Verdict: THIS IS THE NATURAL DESIGN. Achievable with moderate effort.**

**Design:**
- Each host has one MANAGER who controls agents on that host
- Any operation on a host's agents from an external source must be approved by the host's MANAGER
- The governance password is per-host (already the case)
- Teams can span hosts, but team operations that affect a host's agents require that host's MANAGER approval

**What already exists:**
- Each host already has independent `governance.json` with its own `managerId`
- The AMP messaging system can carry approval requests between hosts
- The transfer request system (`governance-transfers.json`) already has a request/approve workflow
- The agent registry already has `hostId` on every agent

**What needs to be added:**

1. **Cross-host operation request protocol:**
   ```
   Host A (requester) → AMP message → Host B (target)
   Subject: "governance-request"
   Payload: { action: "add-agent-to-team", agentId: "...", teamId: "...", requestedBy: "..." }
   ```

2. **Host B's governance service processes the request:**
   - Verify requester is a MANAGER or COS on their host (via sender attestation)
   - Check if the operation is allowed under local governance rules
   - If MANAGER approval needed, queue it for the local MANAGER
   - Respond with approve/reject via AMP reply

3. **Automatic approval for trusted operations:**
   - If the requesting MANAGER has been explicitly trusted by the local MANAGER, auto-approve
   - Trust can be established via a one-time handshake (MANAGER-to-MANAGER introduction)

**Required new components:**
- `GovernanceRequest` type (similar to `TransferRequest`)
- `CrossHostGovernanceService` that receives/processes remote governance requests
- Manager-to-Manager trust registry (persistent, per-host)

---

### Scenario 10: Local COS Assigned to Remote Team

**Verdict: REQUIRES CROSS-HOST TEAM SYNC + MANAGER APPROVAL PROTOCOL.**

**Detailed flow:**

1. Local MANAGER on Host A wants to assign local COS Agent X to Team Alpha on Host B.
2. Host A sends governance request to Host B: `{ action: "assign-cos", agentId: "X@hostA", teamId: "alpha", requestedBy: "managerA" }`
3. Host B receives the request. Its governance service:
   a. Verifies `managerA` is actually a MANAGER on Host A (via host attestation or cached governance state)
   b. Checks if Team Alpha exists locally
   c. Checks if Agent X is eligible for COS (not already COS elsewhere — this requires querying ALL hosts)
   d. Queues for Host B's MANAGER approval (or auto-approves if MANAGER trust exists)
4. Host B's MANAGER approves. Host B updates Team Alpha: `chiefOfStaffId = "X"`, adds X to `agentIds`.
5. Host B notifies Host A of the approval.
6. Host A updates its local governance state to record that Agent X is COS of a remote team (for multi-COS prevention).

**Key challenges:**
- **COS uniqueness check (G3)**: "Agent is already COS of another team" must be checked across ALL hosts. This requires either (a) a distributed COS registry, or (b) querying all peer hosts during validation.
- **Team state sync**: Host A needs to know Team Alpha's membership to enforce messaging rules for Agent X. Without replication, Host A's message filter cannot properly handle COS-to-member messages for a remote team.

---

### Scenario 11: COS-to-COS Cross-Host Agent Transfer

**Verdict: MOST COMPLEX SCENARIO. Requires double-approval protocol.**

**Full scenario:** COS-Alpha (on Host A, team Alpha) wants to transfer Agent X (member of closed Team Beta on Host B, COS-Beta is COS) to Team Alpha.

**Permission chain analysis:**

Per governance rules v2:
- COS can transfer agents FROM their own team to another team (with MANAGER approval)
- COS can assign unaffiliated agents to their own closed team (with MANAGER approval)
- Only COS or MANAGER can remove an agent from a closed team

**Therefore, this transfer requires:**

1. **COS-Beta's permission** to release Agent X from Team Beta (COS-Beta is the authority over Team Beta's members)
2. **Host B's MANAGER approval** (COS-Beta needs MANAGER approval for the removal, per rule 25)
3. **Host A's MANAGER approval** (COS-Alpha needs MANAGER approval to add Agent X to Team Alpha, per rule 25)
4. **COS-Alpha initiates** the request (as the receiving COS)

**Proposed protocol:**

```
Step 1: COS-Alpha (Host A) → AMP → Host B governance API
        Request: "Transfer Agent X from Team Beta to Team Alpha"

Step 2: Host B governance service receives request
        - Validates COS-Alpha is actually a COS (via attestation from Host A)
        - Notifies COS-Beta: "COS-Alpha requests Agent X for their team"

Step 3: COS-Beta approves/rejects
        - If approves → request queued for Host B's MANAGER

Step 4: Host B's MANAGER approves/rejects
        - If approves → Agent X removed from Team Beta on Host B
        - Host B notifies Host A: "Agent X released from Team Beta"

Step 5: Host A governance service receives release confirmation
        - Queues request for Host A's MANAGER: "Add Agent X to Team Alpha"

Step 6: Host A's MANAGER approves/rejects
        - If approves → Agent X added to Team Alpha on Host A
        - Both hosts update their local team state
```

**Does COS-Alpha need to ask both MANAGERs, or does COS-Beta handle the remote permission?**

COS-Beta handles the remote side. COS-Alpha's request goes to Host B's governance service, which routes it through COS-Beta and Host B's MANAGER internally. COS-Alpha only needs their own MANAGER's approval (Host A's MANAGER). The cross-host protocol handles the rest.

**This is analogous to the existing transfer request system** but extended cross-host. The current `TransferRequest` type and `resolveTransferReq()` workflow can be extended with:
- `sourceHostId` / `targetHostId` fields
- AMP-based request delivery between governance services
- Multi-step approval state machine (`pending → remote-approved → local-approved → executed`)

---

## Architecture Additions Required

### Layer 1: Governance State Replication (Foundation)

**Problem:** Governance state is local-only.
**Solution:** Replicate essential governance state across the mesh via AMP.

**What to replicate:**
| State | Replication Strategy |
|-------|---------------------|
| Manager identity | Push on change to all peers (small payload, infrequent) |
| Team definitions | Push on change to all peers (medium payload, moderate frequency) |
| COS assignments | Embedded in team state |
| Transfer requests | Push to involved hosts only (source + target) |
| Governance password | DO NOT replicate — per-host by design |

**Implementation:**
- New AMP message type: `governance-sync` with subtypes: `manager-changed`, `team-updated`, `team-deleted`, `transfer-created`, `transfer-resolved`
- Each host maintains a `governance-peers.json` with replicated state from other hosts, TTL-cached
- On sync message receipt: validate signature, update local replica, do NOT propagate further (source pushes to all directly)

### Layer 2: Cross-Host Identity Attestation

**Problem:** Mesh-forwarded messages lose sender identity.
**Solution:** The forwarding host attests sender's role.

**Mechanism:**
- When Host A forwards a message for a MANAGER, it includes a signed attestation header:
  ```
  X-AMP-Sender-Role: manager
  X-AMP-Sender-Attestation: <Ed25519 signature by Host A's host key>
  ```
- The receiving Host B verifies the attestation against Host A's known public key
- If valid, the message filter treats the sender as having the attested role

**Requires:**
- Host-level Ed25519 keypairs (in addition to per-agent keys)
- Attestation format and verification logic
- Trust-on-first-register for host keys (already exists for host mesh)

### Layer 3: Cross-Host Governance Request Protocol

**Problem:** Governance operations don't cross host boundaries.
**Solution:** AMP-based request/approve workflow between governance services.

**New message types:**
```typescript
interface GovernanceRequest {
  id: string
  type: 'add-to-team' | 'remove-from-team' | 'assign-cos' | 'transfer-agent' | 'create-agent' | 'delete-agent'
  sourceHostId: string
  targetHostId: string
  requestedBy: string           // qualified: agentId@hostId
  requestedByRole: 'manager' | 'cos'
  payload: {
    agentId: string
    teamId?: string
    fromTeamId?: string
    toTeamId?: string
  }
  approvals: {
    sourceCOS?: { approved: boolean; agentId: string; at: string }
    sourceManager?: { approved: boolean; agentId: string; at: string }
    targetCOS?: { approved: boolean; agentId: string; at: string }
    targetManager?: { approved: boolean; agentId: string; at: string }
  }
  status: 'pending' | 'partially-approved' | 'approved' | 'rejected' | 'executed'
}
```

### Layer 4: Host-Scoped Manager Authority

**Problem:** Multiple MANAGERs give conflicting orders.
**Solution:** Each MANAGER has authority over its own host's agents.

**Rules:**
1. A host's MANAGER has final authority over agents on that host
2. Cross-host operations require the target host's MANAGER approval
3. No operation can modify a remote host's agents without going through its governance service
4. Manager-to-Manager trust can be established for auto-approval of routine operations

---

## Unsolvable Problems (Hard Constraints)

### 1. CAP Theorem: Consistency vs. Availability

In a mesh of hosts communicating via HTTP over potentially unreliable networks (Tailscale, internet), you cannot have:
- **Consistent** governance state (all hosts agree on team membership at all times)
- **Available** governance operations (operations succeed even when some hosts are unreachable)
- **Partition-tolerant** behavior (system works when network links fail)

**AI Maestro must choose 2 of 3.** Recommended: AP (availability + partition tolerance) with eventual consistency. Operations proceed using local state + TTL-cached replicas. Conflicts detected and resolved when connectivity resumes.

### 2. Split-Brain Governance

If the mesh splits into two partitions (e.g., Tailscale tunnel goes down), each partition could independently:
- Appoint a different MANAGER
- Create conflicting teams
- Approve conflicting transfers

**Mitigation:** Designate a "governance primary" host. Only the primary can create teams and appoint MANAGERs. Other hosts can only create governance REQUESTS that must be approved by the primary. If the primary is unreachable, governance mutations are queued (not executed).

### 3. Timing Attacks on Cross-Host Auth

The current code has explicit "Phase 1: timing safe for localhost" comments. In a multi-host mesh, timing attacks become feasible if hosts communicate over networks where an attacker can observe latency. The `timingSafeEqual` fix in v0.25.2 addresses API key comparison, but password verification (`bcrypt.compare`) timing is still observable.

**Mitigation:** Already partially addressed by requiring Tailscale (encrypted tunnel). For non-Tailscale deployments, TLS termination via nginx is required.

### 4. Tmux is Fundamentally Local

There is no way to run `tmux send-keys` or `tmux capture-pane` on a remote host. All terminal operations require a local AI Maestro instance. This means:
- Agent creation that involves starting a tmux session must happen on the host where the session will run
- Notifications via tmux are local-only (remote notifications must use AMP)
- Terminal viewing for remote agents works via WebSocket proxy but is read-only at the local level

**This is NOT a limitation but a design feature:** Each host is sovereign over its local resources. Remote operations go through the API, not direct tmux access.

---

## Implementation Roadmap

### Phase 2a: Foundation (Minimum Viable Multi-Host Governance)

| Component | Effort | Description |
|-----------|--------|-------------|
| Governance state push | Medium | On manager/team change, broadcast via AMP to all peers |
| Governance state cache | Low | `governance-peers.json` with TTL-cached replicas |
| Host-level keypairs | Low | Generate Ed25519 keypair per host for attestation |
| Sender role attestation | Medium | Attach signed role headers to mesh-forwarded messages |
| Message filter mesh upgrade | Medium | Verify attestation, allow attested MANAGER/COS messages |
| Auth on agent CRUD routes | Medium | Require AMP API key for create/delete/modify agents |

### Phase 2b: Cross-Host Operations

| Component | Effort | Description |
|-----------|--------|-------------|
| GovernanceRequest type | Low | New type for cross-host requests |
| Cross-host governance API | High | AMP-based request/approve/reject protocol |
| Multi-host team membership | Medium | Qualified agent IDs (`agentId@hostId`) in teams |
| Cross-host transfer requests | High | Extend transfer system with sourceHostId/targetHostId |
| Manager-to-Manager trust | Medium | Persistent trust registry for auto-approval |

### Phase 3: Advanced

| Component | Effort | Description |
|-----------|--------|-------------|
| Governance primary election | High | Designate one host as governance authority |
| Conflict detection & resolution | High | Detect split-brain, merge governance state |
| COS approval workflow across hosts | High | Multi-step approval state machine |
| Audit trail for cross-host operations | Medium | Log all governance mutations with host provenance |

---

## Summary: Scenario Feasibility Matrix

| # | Scenario | Current State | Feasibility | Effort |
|---|----------|---------------|-------------|--------|
| 1 | Governance rules across hosts | Silently unenforced | Feasible | Phase 2a |
| 2 | Cross-host teams | UUIDs work, enforcement fails | Feasible | Phase 2b |
| 3 | Remote agents follow local COS/Manager | Communication works, enforcement doesn't | Feasible | Phase 2a |
| 4 | Local agents under remote Manager | Not possible (role not recognized) | Feasible | Phase 2a |
| 5 | Manager/COS/Agent on 3 hosts | Communication works, governance chain breaks | Feasible | Phase 2a+2b |
| 6 | Create/delete agents remotely | API exists but ungoverned | Feasible | Phase 2a (auth) |
| 7 | Multi-host teams with governance | Not possible (teams are local) | Feasible | Phase 2b |
| 8 | Conflicting manager orders | Undetected, last-write-wins | Feasible | Phase 2b+3 |
| 9 | Per-host Manager with approval | Natural design, partially exists | Feasible | Phase 2a+2b |
| 10 | Local COS to remote team | Not possible (no cross-host teams) | Feasible | Phase 2b |
| 11 | COS-to-COS cross-host transfer | Not possible (no cross-host protocol) | Feasible | Phase 2b+3 |

**No unsolvable architectural blockers exist.** All scenarios are achievable with the additions described above. The mesh networking layer (AMP) provides the communication foundation. The governance layer needs to be extended to use it.
