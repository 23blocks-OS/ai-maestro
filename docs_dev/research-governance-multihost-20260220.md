# Governance System Multi-Host Mesh Analysis

**Generated:** 2026-02-20
**Branch:** `feature/team-governance`
**Scope:** All governance, ACL, messaging, team, transfer, and agent registry modules

---

## Executive Summary

The governance system is **entirely localhost-scoped** and has **zero host-awareness**. Every governance component (password, manager role, teams, ACL, message filter, transfers) operates on local files with no concept of host identity. The agent registry *does* have host-awareness (`hostId`, `hostName`, `hostUrl`), but none of the governance modules consume or check these fields. In a multi-host mesh, governance rules would be **silently unenforced** for cross-host interactions, creating security bypasses and data inconsistency.

---

## File-by-File Findings

### 1. `docs_dev/governance_rules_v2.md` — Rules Spec

**Host scope:** Not mentioned at all. The rules document describes MANAGER, COS, and normal agent roles without any reference to hosts, mesh, or distributed scenarios.

**Key observation:** The rules assume a single flat namespace of agents and teams. Phrases like "only one agent can be MANAGER at any time" and "the MANAGER can assign/remove agents to/from teams" implicitly assume all agents and teams are co-located on one host.

**Multi-host gap:** No rule addresses:
- Whether MANAGER authority is global (across all hosts) or per-host
- Whether a team can contain agents from different hosts
- Whether COS authority extends to agents on remote hosts
- Whether messaging isolation applies to cross-host messages
- Whether transfer requests can target agents/teams on other hosts

---

### 2. `lib/governance.ts` — Password & Manager Role

**Storage:** `~/.aimaestro/governance.json` (local file per host)

**Manager identification:** The `managerId` field stores a single agent UUID. The `isManager()` function does a simple string equality check:
```typescript
// lib/governance.ts:122-127
export function isManager(agentId: string): boolean {
  const config = loadGovernance()
  if (!config.managerId || !agentId) return false
  return config.managerId === agentId
}
```

**Password storage:** bcrypt hash stored in local file. No cross-host password sync.

**VERIFIED localhost assumptions** (explicit comments in code):
- Line 81: `"Phase 1: No lock on read. Minor TOCTOU with setPassword(). Acceptable for single-user localhost."`
- Line 88-89: `"Phase 1 (localhost-only): timing difference between 'no password' and 'wrong password' is accepted risk. No remote attackers can observe timing in this deployment model."`
- Lines 95, 120, 129, 140, 149, 160: All repeat `"Phase 1: Re-reads governance.json per call. Acceptable for localhost."`

**Multi-host breakage:**
- **CRITICAL:** Each host has its own `governance.json`. If Host A sets Agent X as MANAGER, Host B has no knowledge of this. Host B's `isManager(agentId)` returns `false` for Agent X.
- **CRITICAL:** Each host has its own password. There is no mechanism to sync governance passwords across hosts.
- **CRITICAL:** The `isChiefOfStaff()` function delegates to `getTeam()` from team-registry (also local file). COS status is invisible to other hosts.

---

### 3. `lib/team-acl.ts` — Team Resource Access Control

**Host references:** ZERO. No `hostId`, no `host` references anywhere in the file.

**Decision logic:**
```typescript
// lib/team-acl.ts:35-74
export function checkTeamAccess(input: TeamAccessInput): TeamAccessResult {
  // 1. Web UI (no agentId) → always allowed
  // 2. Team not found → denied
  // 3. Open team → allowed
  // 4. MANAGER → allowed
  // 5. COS → allowed
  // 6. Member → allowed
  // 7. Everyone else → denied
}
```

**VERIFIED localhost assumption** (explicit comment):
- Lines 37-41: `"KNOWN LIMITATION (Phase 1, localhost-only): Any local process that omits X-Agent-Id gets full access, not just the web UI."`

**Multi-host breakage:**
- **CRITICAL:** `checkTeamAccess` calls `isManager()` which reads local `governance.json`. A MANAGER appointed on Host A is not recognized on Host B. The ACL check on Host B would deny the MANAGER.
- **CRITICAL:** `getTeam()` reads local `teams.json`. If Host B does not have the same teams file, all team-based ACL checks fail or return incorrect results.
- No concept of "is this agent local or remote?" -- any agent UUID is treated the same way regardless of origin host.

---

### 4. `lib/message-filter.ts` — Messaging Isolation

**Host references:** Minimal and only for mesh-forwarded messages.

**Mesh-forward handling (line 51-58):**
```typescript
// Step 1: Mesh-forwarded messages (senderAgentId === null)
if (senderAgentId === null) {
  // Deny if recipient is in a closed team (unverified sender)
  // TODO Phase 2: Verify mesh sender identity against registered hosts
  const recipientInClosedTeam = closedTeams.some(t => t.agentIds.includes(recipientAgentId))
  if (recipientInClosedTeam) {
    return { allowed: false, reason: 'Mesh message denied: recipient is in a closed team and sender identity is unverified' }
  }
  return { allowed: true }
}
```

**Key design:** The message filter uses `senderAgentId: string | null` where `null` means "mesh-forwarded message." This is the *only* acknowledgment of multi-host messaging in the governance system.

**Multi-host breakage:**
- **MODERATE:** Mesh-forwarded messages to agents in closed teams are blanket-denied. This is a safe default but means a MANAGER on Host A cannot message a closed-team member on Host B via mesh forwarding (the message arrives with `senderAgentId: null`).
- **CRITICAL:** Non-null sender checks call `loadGovernance()` and `loadTeams()` which read local files. If Host B routes a message where the sender is the MANAGER (according to Host A's governance.json), Host B does not know this and applies normal-agent rules, potentially blocking the message.
- **CRITICAL:** The COS-to-COS bridge (`agentIsCOS(senderAgentId)`) checks `closedTeams.some(t => t.chiefOfStaffId === id)` against local teams. A COS on Host A sending to a COS on Host B would not be recognized if teams are not replicated.
- **TODO noted:** Line 53: `"TODO Phase 2: Verify mesh sender identity against registered hosts"`

---

### 5. `lib/team-registry.ts` — Team Storage

**Storage:** `~/.aimaestro/teams/teams.json` (local file per host)

**Host references:** ZERO. No `hostId`, no host-related fields in team operations. The `Team` type has no host field.

**Team membership:** `agentIds: string[]` stores bare UUIDs with no host qualifier:
```typescript
// types/team.ts:17
agentIds: string[]      // Agent UUIDs (order = display order)
```

**Multi-host breakage:**
- **CRITICAL:** Teams are stored locally per host. Host A's teams are invisible to Host B.
- **CRITICAL:** `agentIds` are bare UUIDs. If two hosts have agents with the same UUID (unlikely but possible with manual registry edits), the wrong agent could be affected.
- **CRITICAL:** There is no mechanism to sync team state across hosts. If Agent X is added to a closed team on Host A, Host B does not know this and will not enforce messaging isolation for that agent.
- **MODERATE:** The `validateTeamMutation()` function checks multi-closed-team constraints against local teams only. An agent could be in closed teams on multiple hosts without either host detecting the violation.

---

### 6. `lib/agent-registry.ts` — Agent Identity

**Host-awareness:** YES, this is the only module with host awareness.

**Key host fields on Agent:**
```typescript
// types/agent.ts:172-174
hostId: string                // Host identifier (e.g., "local", "mac-mini")
hostName?: string             // Human-readable host name
hostUrl?: string              // Host URL for API/WebSocket
```

**Host-scoped operations:**
- `getAgentByName(name, hostId?)` — defaults to self host, can scope to specific host
- `getAgentByNameAnyHost(name)` — global search across all hosts in local registry
- `createAgent()` — auto-assigns `hostId` from `getSelfHost()` or `getSelfHostId()`
- Agent names are unique per-host (like email: `auth@macbook-pro` != `auth@mac-mini`)

**Qualified agent support:** `types/qualified-agent.ts` defines `agent@host` format:
```typescript
export type QualifiedAgentId = `${string}@${string}`
```

**Multi-host gap for governance:**
- **CRITICAL:** The agent registry knows about hosts, but governance ignores this entirely. When `governance.ts` stores `managerId: string`, it stores a bare UUID with no host qualifier. If the MANAGER agent is on Host A, Host B cannot determine which host the MANAGER lives on.
- **CRITICAL:** Team `agentIds[]` are bare UUIDs. The team registry does not know which host each agent belongs to. A team could theoretically reference agents from multiple hosts, but no governance check validates or handles this.
- The `loadAgents()` function returns all agents including remote ones cached in the local registry. But governance functions only check `governance.json` and `teams.json` which are local-only.

---

### 7. `services/governance-service.ts` — Governance API Logic

**Host references:** ZERO. No `hostId`, no host checks in any function.

**Key functions analyzed:**

**`setManagerRole()`** — Sets manager by agent UUID lookup:
```typescript
const agent = getAgent(agentId)
if (!agent) return { error: `Agent '${agentId}' not found`, status: 404 }
await setManager(agentId)
```
Uses `getAgent(id)` which searches the local registry (including cached remote agents). But `setManager()` writes to local `governance.json` only.

**`getReachableAgents()`** — Iterates all agents and checks `checkMessageAllowed()`:
```typescript
const allAgents = loadAgents()
for (const agent of allAgents) {
  if (agent.deletedAt) continue
  const result = checkMessageAllowed({ senderAgentId: agentId, recipientAgentId: agent.id })
  if (result.allowed) reachableAgentIds.push(agent.id)
}
```
This includes remote agents from `loadAgents()`, but `checkMessageAllowed()` only checks local governance state. A remote agent in a closed team on Host B would not be blocked by Host A's message filter (because Host A's `loadTeams()` does not have Host B's teams).

**`createTransferReq()`** — Transfer requests reference teams and agents by bare UUID with no host validation.

**`resolveTransferReq()`** — Moves agent between teams using local `loadTeams()` and `saveTeams()`. No cross-host coordination.

**Multi-host breakage:**
- **CRITICAL:** Setting a MANAGER on Host A does not propagate to Host B. Each host has independent governance state.
- **CRITICAL:** Reachable agents computation mixes local and remote agents but applies only local governance rules.
- **CRITICAL:** Transfer requests are purely local — there is no mechanism to transfer an agent between teams on different hosts.

---

### 8. `services/teams-service.ts` — Team Operations

**Host references:** One occurrence (line 632) — passes `agent.hostId` to notification service:
```typescript
const result = await notifyAgent({
  agentId: agent.id,
  agentName,
  agentHost: agent.hostId,
  fromName: 'AI Maestro',
  subject: `Team "${safeTeamName}" is starting`,
  ...
})
```

**Notification service behavior** (from `lib/notification-service.ts`):
```typescript
if (agentHost && agentHost !== 'local' && !isSelf(agentHost)) {
  // Remote host - skip notification
  return { success: true, notified: false, reason: `Remote host: ${agentHost}` }
}
```

**Multi-host breakage:**
- **MODERATE:** Team notifications silently skip remote agents. If a closed team contains agents from multiple hosts, only local agents receive notifications.
- **CRITICAL:** All team CRUD operations (create, update, delete) operate on local `teams.json` only. No sync with other hosts.
- `createNewTeam()` calls `loadAgents().map(a => a.name)` for name collision checks, which includes cached remote agents. But the created team is stored locally only.

---

### 9. `lib/transfer-registry.ts` — Agent Transfers

**Storage:** `~/.aimaestro/governance-transfers.json` (local file per host)

**Host references:** ZERO. No hostId, no host fields in `TransferRequest` type.

**Transfer request fields:**
```typescript
interface TransferRequest {
  id: string
  agentId: string       // bare UUID
  fromTeamId: string    // bare UUID
  toTeamId: string      // bare UUID
  requestedBy: string   // bare UUID
  status: 'pending' | 'approved' | 'rejected'
  ...
}
```

**Multi-host breakage:**
- **CRITICAL:** Transfer requests are local-only. There is no mechanism to request or approve a transfer involving teams or agents on other hosts.
- **CRITICAL:** When a transfer is approved, `resolveTransferReq()` in governance-service.ts modifies local `teams.json`. If the source or destination team is on another host, the transfer silently fails or produces inconsistent state.

---

### 10. `types/governance.ts`, `types/team.ts`, `types/agent.ts` — Type Definitions

**`types/governance.ts`:**
- `GovernanceConfig` — No host fields. `managerId` is a bare UUID.
- `TransferRequest` — No host fields. All IDs are bare UUIDs.

**`types/team.ts`:**
- `Team` — No host fields. `agentIds` are bare UUIDs. `chiefOfStaffId` is a bare UUID.
- `Meeting` — No host fields.

**`types/agent.ts`:**
- `Agent` — HAS host fields: `hostId`, `hostName`, `hostUrl`
- `QualifiedAgentId` (in `types/qualified-agent.ts`) — `agent@host` format exists but is not used by governance

---

## Summary Table: Where Governance Breaks in Multi-Host

| Component | Host-Aware? | Multi-Host Behavior | Severity |
|-----------|:-----------:|---------------------|----------|
| `governance.json` (password, managerId) | NO | Each host has independent password and MANAGER. No sync. | CRITICAL |
| `teams.json` (teams, COS, membership) | NO | Each host has independent teams. No replication. | CRITICAL |
| `governance-transfers.json` | NO | Transfer requests are local-only. Cannot cross hosts. | CRITICAL |
| `lib/governance.ts` (isManager, isChiefOfStaff) | NO | Role checks use local files. Remote roles invisible. | CRITICAL |
| `lib/team-acl.ts` (checkTeamAccess) | NO | ACL checks use local governance + teams. Remote state invisible. | CRITICAL |
| `lib/message-filter.ts` (checkMessageAllowed) | PARTIAL | Mesh-forwarded messages (null sender) blanket-denied for closed teams. Non-null sender checks use local state only. | CRITICAL |
| `lib/team-registry.ts` (CRUD) | NO | All operations read/write local files. No cross-host sync. | CRITICAL |
| `lib/transfer-registry.ts` | NO | Local-only. Cannot reference remote teams/agents. | CRITICAL |
| `services/governance-service.ts` | NO | All governance API logic reads local state. `getReachableAgents` mixes local/remote agents with local-only rules. | CRITICAL |
| `services/teams-service.ts` | MINIMAL | Passes `agentHost` to notification service (which skips remote). No other host awareness. | MODERATE |
| `types/governance.ts` | NO | No host fields in any governance type. | DESIGN GAP |
| `types/team.ts` | NO | No host fields in Team or Meeting types. | DESIGN GAP |
| `types/agent.ts` | YES | Agent has `hostId`, `hostName`, `hostUrl`. Only module with host concept. | OK (but unused by governance) |

---

## Where Governance Could Extend to Multi-Host

### Low-Effort Extensions (Possible Without Architectural Changes)

1. **Add `hostId` to `GovernanceConfig.managerId`** — Store `managerId@hostId` or add a `managerHostId` field. Each host's governance config could reference the canonical MANAGER regardless of where it lives.

2. **Add `hostId` to `Team.agentIds`** — Use qualified agent IDs (`agentId@hostId`) instead of bare UUIDs. This would let teams contain agents from multiple hosts.

3. **Governance config replication** — On governance changes (password set, manager assigned), broadcast via AMP to all peer hosts. Receiving hosts update their local `governance.json`.

### Medium-Effort Extensions

4. **Central governance authority** — Designate one host as the "governance primary." All governance mutations go through it. Other hosts query it (or receive push updates).

5. **Transfer requests across hosts** — When a transfer involves a remote team, the governance service sends an AMP message to the target host's governance API instead of modifying local files.

6. **Message filter with mesh sender verification** — The TODO on line 53 of `message-filter.ts` points to this: verify mesh sender identity against registered hosts. This would allow MANAGER and COS messages to be routed across hosts without being blanket-denied.

### High-Effort Extensions (Require Architectural Redesign)

7. **Distributed consensus for governance state** — Use a Raft-like protocol or CRDT for governance.json and teams.json so all hosts converge to the same state.

8. **Federated governance** — Each host manages its own teams, but a global governance layer coordinates cross-host membership, transfer requests, and role assignments.

---

## Where Governance Fundamentally Breaks

These are not "gaps to fill" but architectural incompatibilities:

1. **Single MANAGER singleton assumption** — The rules say "only one agent can be MANAGER at any time." In a multi-host mesh, enforcing this singleton requires distributed coordination (consensus, leader election, or a designated primary). Without it, each host could independently appoint a different MANAGER.

2. **File-based state with no replication** — All governance state (`governance.json`, `teams.json`, `governance-transfers.json`) is stored in local files read synchronously. There is no pub/sub, no event bus, and no replication. Adding multi-host support requires either (a) centralizing state on one host, (b) adding a replication layer, or (c) replacing file storage with a distributed store.

3. **COS-team invariant across hosts** — Rule R1.4 says "a closed team MUST always have a COS." If the COS agent is on Host A and Host B has a copy of the team, Host B cannot verify the COS is alive or accessible. The invariant is unenforceable without cross-host health checking.

4. **Multi-closed-team constraint** — Rule R4.1 says normal agents can only be in one closed team. If Host A puts Agent X in Closed Team Alpha, and Host B independently puts Agent X in Closed Team Beta, neither host detects the violation because `validateTeamMutation()` only checks local teams.

5. **Timing-safe password verification** — The code explicitly accepts timing leaks as safe because "no remote attackers can observe timing in this deployment model." In a multi-host mesh (especially over Tailscale/WireGuard), remote attackers on the VPN could theoretically observe timing differences.

---

## Recommendations

1. **Short term (Phase 1 compatibility):** Add explicit comments/guards to governance APIs that reject requests from remote agents. Currently, remote agents cached in the local registry could pass governance checks they should fail.

2. **Medium term (Phase 2):** Implement governance config replication via AMP. When a host sets a MANAGER or creates a team, broadcast to all peer hosts. Accept eventual consistency.

3. **Long term (Phase 3):** Designate a governance primary host. All governance mutations are routed to it. Other hosts read from replicated copies with a freshness TTL.
