# Team Governance — Design Rules & Requirements

**Version:** 2.0
**Date:** 2026-04-05 (updated from 2026-02-16)
**Branch:** `feature/team-governance`
**Source:** Extracted from user instructions, audit reports, and logical inference

---

## Overview

AI Maestro implements a team governance model with seven titles (MANAGER, CHIEF-OF-STAFF, ORCHESTRATOR, ARCHITECT, INTEGRATOR, MEMBER, AUTONOMOUS), teams (isolated messaging + ACL), and groups (lightweight broadcast collections). Teams require a MANAGER to function. Groups are unstructured agent collections with no governance.

---

## R1. Teams and Groups (v2.0)

| ID | Rule | Source |
|----|------|--------|
| R1.1 | **Teams** have isolated messaging, ACL, governance titles, and a COS. Former "closed teams" | Explicit |
| R1.2 | **Groups** are lightweight agent collections for broadcast messaging. No governance, no COS, no kanban. Former "open teams" | Explicit |
| R1.3 | Every team **SHOULD** have a COS assigned — the COS manages membership and external communication | Explicit |
| R1.4 | Teams require a **MANAGER** to exist on the host before they can be created | Explicit (v2.0) |
| R1.5 | Teams without a MANAGER are **blocked** (`team.blocked = true`) — all operations frozen | Explicit (v2.0) |
| R1.6 | Groups have no governance constraints — any agent can subscribe/unsubscribe freely | Explicit |

**Rationale:** The COS is the team's operational leader. The MANAGER is the host-wide governance authority. Without either, the team cannot function safely. Groups exist for lightweight coordination without governance overhead.

---

## R2. Team Name Rules

| ID | Rule | Source |
|----|------|--------|
| R2.1 | Team names must be unique (case-insensitive comparison) — no two teams can share the same name | Explicit |
| R2.2 | Duplicate name check must be enforced both server-side (API rejects with 409) and client-side (UI shows inline error before POST) | Implicit (both creation surfaces exist) |
| R2.3 | Renaming a team via update must also check uniqueness against all other teams (excluding the team being renamed) | Implicit (rename is an update operation) |

---

## R3. Role Hierarchy Rules

| ID | Rule | Source |
|----|------|--------|
| R3.1 | Seven governance titles exist: **MANAGER** (global singleton), **CHIEF-OF-STAFF** (per team), **ORCHESTRATOR** (per team), **ARCHITECT**, **INTEGRATOR**, **MEMBER** (default team title), **AUTONOMOUS** (no team) | Explicit (v2.0) |
| R3.2 | Only ONE agent can be MANAGER at any given time (singleton constraint) | Explicit |
| R3.3 | COS is a per-team title — each team has exactly one COS | Explicit |
| R3.4 | An agent can be COS of only **ONE** team at any time | Explicit (corrected 2026-03-26) |
| R3.5 | All role changes (assign/remove MANAGER, assign/remove COS) require the governance password | Explicit |
| R3.6 | MANAGER has full authority over all teams: can add/remove agents, assign COS, approve transfers, create/delete teams, message anyone | Explicit |
| R3.7 | COS is responsible for **external communication** of their team — they are the contact point for outside agents | Explicit |
| R3.8 | COS decides the **staff composition** (add/remove agents) of their team — this is why they are called "chief-of-staff" | Explicit |
| R3.9 | MANAGER can do everything COS can, but **usually delegates** to the COS | Explicit |
| R3.10 | Typical workflow: MANAGER creates a team, assigns a COS, and lets the COS manage the team from there | Explicit |
| R3.11 | Reassigning MANAGER to a new agent immediately revokes the role from the old agent (only one MANAGER exists) | Implicit (singleton) |
| R3.12 | COS changes (assign/remove) on a team must **NOT** be possible via the generic `PUT /api/teams/[id]` endpoint — only via the dedicated `POST /api/teams/[id]/chief-of-staff` endpoint which requires the governance password | Implicit (prevents bypass of password protection) |

---

## R4. Agent Membership Rules

| ID | Rule | Source |
|----|------|--------|
| R4.1 | Non-MANAGER agents can be in at most **ONE team** at any given time (single-team membership) | Explicit (v2.0) |
| R4.2 | Any agent can subscribe to **unlimited groups** simultaneously (groups have no governance) | Explicit (v2.0) |
| R4.3 | **MANAGER** is not in any team — MANAGER operates at the host level | Explicit (v2.0) |
| R4.4 | When an agent joins a team, it is auto-assigned the **MEMBER** title and the programmer plugin | Explicit (v2.0) |
| R4.5 | An agent cannot be added to a team they are already a member of (no duplicate membership in `agentIds`) | Explicit |
| R4.6 | COS **must** be a member of the team they lead (present in `agentIds[]`) — they manage the team staff and the message filter relies on `agentIds` for same-team communication | Implicit (logical necessity) |
| R4.7 | Removing a COS from a team's `agentIds` while they remain `chiefOfStaffId` is **forbidden** — COS title can only be removed by deleting the team | Implicit (COS immutability invariant) |
| R4.8 | The UI must **always show team memberships** when selecting agents for any operation (add to team, remove from team, transfer, team creation agent selection) | Explicit |
| R4.9 | Agent existence must be validated when adding to a team — `agentIds` must reference agents that actually exist in the registry | Implicit (referential integrity) |

---

## R5. Transfer Rules

| ID | Rule | Source |
|----|------|--------|
| R5.1 | Moving a normal agent **FROM** a team requires a transfer request (approval workflow) — the agent cannot simply leave | Explicit (implemented) |
| R5.2 | Only MANAGER or COS can **create** transfer requests | Explicit (enforced) |
| R5.3 | Only the source team's COS or MANAGER can **approve/reject** transfers | Explicit (enforced) |
| R5.4 | COS **cannot be transferred out** of their own team — COS title is immutable to team lifecycle | Implicit (COS immutability invariant) |
| R5.5 | **Destination team must exist** at the time the transfer request is created | Implicit (referential integrity) |
| R5.6 | Source and destination teams must be **different** (no self-transfer) | Implicit (nonsensical operation) |
| R5.7 | On transfer approval, the **single-team constraint** (R4.1) must be checked: verify the agent is not already in another team | Implicit (logical consequence) |
| R5.8 | Duplicate pending transfer requests (same agent + same source + same destination) must be prevented | Explicit (enforced) |

---

## R6. Messaging Rules (Communication Graph, v2.0)

All teams are closed. Messaging between agents is governed by a title-based directed communication graph. Missing connections are forbidden.

**Adjacency matrix** (Y = allowed, empty = forbidden):

| Sender \ Recipient | MANAGER | COS | ORCHESTRATOR | ARCHITECT | INTEGRATOR | MEMBER | AUTONOMOUS |
|---------------------|:-------:|:---:|:------------:|:---------:|:----------:|:------:|:----------:|
| **MANAGER**         |    Y    |  Y  |      Y       |     Y     |     Y      |   Y    |     Y      |
| **CHIEF-OF-STAFF**  |    Y    |  Y  |      Y       |     Y     |     Y      |   Y    |     Y      |
| **ORCHESTRATOR**    |         |  Y  |              |     Y     |     Y      |   Y    |            |
| **ARCHITECT**       |         |  Y  |      Y       |           |            |        |            |
| **INTEGRATOR**      |         |  Y  |      Y       |           |            |        |            |
| **MEMBER**          |         |  Y  |      Y       |           |            |        |            |
| **AUTONOMOUS**      |    Y    |  Y  |              |           |            |        |     Y      |

| ID | Rule | Source |
|----|------|--------|
| R6.1 | Communication rules are defined by the directed graph above — each (sender, recipient) pair must be explicitly listed | Explicit |
| R6.2 | **MANAGER** and **COS** can message all titles (full graph access) | Explicit |
| R6.3 | **ORCHESTRATOR** can message COS, ARCHITECT, INTEGRATOR, MEMBER (not MANAGER or AUTONOMOUS) | Explicit |
| R6.4 | **ARCHITECT**, **INTEGRATOR**, **MEMBER** can only message COS and ORCHESTRATOR | Explicit |
| R6.5 | **AUTONOMOUS** can message MANAGER, COS, and other AUTONOMOUS agents | Explicit |
| R6.6 | The **user** is exempt from the graph — can message any agent and receive responses from all | Explicit |
| R6.7 | When a message is blocked, the error must include a **routing suggestion** (e.g., "INTEGRATOR cannot message MANAGER. Route through CHIEF-OF-STAFF instead.") | Explicit |
| R6.8 | **Three layers of enforcement**: (1) API server validates sender/recipient titles before delivery, (2) Role-plugin main-agent .md files list allowed recipients, (3) Sub-agents are forbidden from using AMP messaging entirely | Explicit |
| R6.9 | Sub-agents have no AMP identity and cannot authenticate — they communicate only with their spawning main-agent | Explicit |

Full spec: `docs_dev/2026-04-03-communication-graph.md`

---

## R7. UI Robustness Rules

| ID | Rule | Source |
|----|------|--------|
| R7.1 | **Prevent accidental multiple operations** from fast repeated clicks — all mutating buttons must have `submitting` guards | Explicit |
| R7.2 | Show **loading spinners** for all async operations (API calls, data fetching) | Explicit |
| R7.3 | Show **error messages** for all failures — no silent failures allowed | Explicit |
| R7.4 | Handle all **edge cases** and possible errors gracefully | Explicit |
| R7.5 | No **infinite loops** or **blocking operations** in the UI | Explicit |
| R7.6 | Show **role badges** (MANAGER: amber/gold, COS: indigo) next to agent names throughout the UI | Implicit |
| R7.7 | Show **blocked badge** on teams when no MANAGER exists | Implicit (v2.0) |
| R7.8 | **Resolve COS UUID** to human-readable agent name everywhere it is displayed — never show raw UUIDs to users | Implicit (UX requirement) |
| R7.9 | When governance data is loading, show **loading state** — do not show stale/default "normal" role which would be misleading | Implicit |

---

## R8. Data Integrity Rules

| ID | Rule | Source |
|----|------|--------|
| R8.1 | All write operations on teams use **file locking** (`withLock`) to prevent corruption from concurrent writes | Implemented |
| R8.2 | `chiefOfStaffId` and `type` changes must **NOT** be accepted in the generic team update (`PUT /api/teams/[id]`) — must use dedicated password-protected endpoints | Implicit (prevents governance bypass) |
| R8.3 | Team deletion should **clean up related transfers** (cancel pending transfer requests involving the deleted team) | Implicit (referential integrity) |
| R8.4 | `Agent.team` free-text field is **display-only** — it is NOT connected to `Team.id` in the governance system, membership is tracked solely via `Team.agentIds[]` | Documented |

---

## Invariants (Must Never Be Violated)

These are hard invariants that the system must maintain at all times:

1. **COS-membership invariant**: `team.chiefOfStaffId === agentId` implies `team.agentIds.includes(agentId)`
2. **Singleton-MANAGER invariant**: At most one agent has `managerId === agentId` globally
3. **Single-team invariant**: A non-MANAGER agent appears in `agentIds` of at most one team
4. **Name-uniqueness invariant**: No two teams have the same name (case-insensitive)
5. **COS-immutability invariant**: COS title can only be removed by deleting the team (not by title reassignment)
6. **Manager-team invariant**: Teams cannot exist in an active (non-blocked) state without a MANAGER on the host
7. **Team-agent-lifecycle invariant**: Team agents cannot be woken while teams are blocked (no MANAGER)
8. **Title-plugin invariant**: Every titled agent (non-AUTONOMOUS) has exactly one role-plugin installed matching their title

---

## Role-Based Permission Matrix

| Action | MEMBER | COS (own team) | ORCHESTRATOR | ARCHITECT / INTEGRATOR | MANAGER | AUTONOMOUS |
|--------|--------|----------------|--------------|----------------------|---------|------------|
| Join team | Via MANAGER/COS | Via MANAGER | Via MANAGER/COS | Via MANAGER/COS | N/A (host-level) | Via MANAGER/COS |
| Leave team | No (transfer) | No (COS locked) | No (transfer) | No (transfer) | N/A | No (transfer) |
| Add agent to own team | No | Yes | No | No | Yes | No |
| Remove agent from own team | No | Yes | No | No | Yes | No |
| Assign COS | No | No | No | No | Yes (password) | No |
| Create team | No | No | No | No | Yes (password) | No |
| Delete team | No | No | No | No | Yes (password) | No |
| Create transfer request | No | Yes (own team) | No | No | Yes | No |
| Approve/reject transfer | No | Yes (own team) | No | No | Yes | No |
| Wake agent | No | Own team only | No | No | Any agent | No |
| Hibernate agent | No | Own team only | No | No | Any agent | No |
| Message (see R6 graph) | COS + ORCH | All titles | COS+ARCH+INTEG+MEM | COS + ORCH | All titles | MGR+COS+AUTO |
| Wake agent | No | Yes (own team) | No | Yes |
| Hibernate agent | No | Yes (own team) | No | Yes |
| Create team | No | No | No | Yes (password) |

---

## R9. Manager Requirement (v2.0)

| ID | Rule | Source |
|----|------|--------|
| R9.1 | A MANAGER agent **MUST** exist on the host before any team can be created | Explicit |
| R9.2 | If no MANAGER exists, all existing teams are **blocked** (`team.blocked = true`) | Explicit |
| R9.3 | When teams are blocked, no agents can be added to or removed from them | Explicit |
| R9.4 | When teams are blocked, all agents belonging to those teams are **forcefully hibernated** (tmux sessions killed) | Explicit |
| R9.5 | AUTONOMOUS agents (not in any team) are **unaffected** by team blocking — they can remain active | Explicit |
| R9.6 | When a MANAGER is assigned (title change), all teams are **unblocked** (`team.blocked = false`) | Explicit |
| R9.7 | Unblocking does **NOT** auto-wake agents — agents remain hibernated until manually woken by the user or the MANAGER | Explicit |
| R9.8 | If a MANAGER is deleted or their title is removed, the blocking cascade triggers immediately (same as startup without MANAGER) | Explicit |
| R9.9 | At server startup, if no MANAGER is detected, team blocking + agent hibernation runs as a startup task | Explicit |

**Rationale:** Without a MANAGER, no governance authority exists to oversee teams. Blocking prevents unsupervised team operations and ensures the system is in a safe state until governance is restored.

---

## R10. Agent Lifecycle Governance (v2.0)

| ID | Rule | Source |
|----|------|--------|
| R10.1 | Only the **user** (web UI, no auth headers) or the **MANAGER** agent can wake ANY agent | Explicit |
| R10.2 | Only the **user** or the **MANAGER** agent can hibernate ANY agent | Explicit |
| R10.3 | The **CHIEF-OF-STAFF** can wake or hibernate agents that belong to **their own team only** | Explicit |
| R10.4 | All other agents (MEMBER, ORCHESTRATOR, ARCHITECT, INTEGRATOR, AUTONOMOUS) **cannot** wake or hibernate any agent | Explicit |
| R10.5 | Team agents cannot be woken if no MANAGER exists on the host (even by the user — assign MANAGER first) | Explicit |
| R10.6 | The restart endpoint follows the same governance rules as the wake endpoint | Explicit |

**Enforcement points:**
- `POST /api/agents/[id]/wake` — checks auth headers, validates caller is user/MANAGER/COS-of-team
- `POST /api/agents/[id]/hibernate` — same checks
- `POST /api/sessions/[id]/restart` — checks if target agent is in a team without MANAGER

---

## R11. Title-Plugin Binding (v2.0)

| ID | Rule | Source |
|----|------|--------|
| R11.1 | Every governance title (including MEMBER) has a corresponding default role-plugin | Explicit |
| R11.2 | MEMBER title installs `ai-maestro-programmer-agent` via ChangeTitle pipeline | Explicit |
| R11.3 | AUTONOMOUS title installs no role-plugin (plugin is uninstalled) | Explicit |
| R11.4 | When an agent joins a team, ChangeTeam calls ChangeTitle('member') which auto-installs the programmer plugin | Explicit |
| R11.5 | When an agent leaves a team, ChangeTeam calls ChangeTitle('autonomous') which removes the role-plugin | Explicit |
| R11.6 | The N:1 compatibility model allows multiple plugins to serve one title — the UI shows a dropdown when 2+ plugins are compatible | Explicit |

**Title → Default Plugin mapping:**

| Title | Default Role-Plugin |
|-------|-------------------|
| MANAGER | ai-maestro-assistant-manager-agent |
| CHIEF-OF-STAFF | ai-maestro-chief-of-staff |
| ORCHESTRATOR | ai-maestro-orchestrator-agent |
| ARCHITECT | ai-maestro-architect-agent |
| INTEGRATOR | ai-maestro-integrator-agent |
| MEMBER | ai-maestro-programmer-agent |
| AUTONOMOUS | (none) |

---

## Updated Invariants (v2.0)

Added to the existing invariant list:

6. **Manager-team invariant**: Teams cannot exist in an active (non-blocked) state without a MANAGER on the host
7. **Team-agent-lifecycle invariant**: Team agents cannot be woken while teams are blocked (no MANAGER)
8. **Title-plugin invariant**: Every titled agent (non-AUTONOMOUS) has exactly one role-plugin installed matching their title
