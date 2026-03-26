# Team Governance — Design Rules & Requirements

**Version:** 1.0
**Date:** 2026-02-16
**Branch:** `feature/team-governance`
**Source:** Extracted from user instructions, audit reports, and logical inference

---

## Overview

AI Maestro implements a team governance model with three roles (MANAGER, Chief-of-Staff, Normal), two team types (open, closed), messaging isolation for closed teams, and a transfer request workflow for moving agents between closed teams. This document captures all requirements and rules that the implementation must enforce.

---

## R1. Team Type Rules

| ID | Rule | Source |
|----|------|--------|
| R1.1 | Teams have exactly two types: `open` and `closed` | Explicit |
| R1.2 | New teams are created as `open` by default | Explicit |
| R1.3 | Changing a team to `closed` **REQUIRES** designating a Chief-of-Staff (COS) | Explicit |
| R1.4 | A closed team **MUST** always have a COS — this is an invariant that must never be violated | Explicit |
| R1.5 | Removing COS from a closed team **immediately** downgrades it to `open` | Explicit |
| R1.6 | To re-close a downgraded team, a MANAGER or COS must edit it and assign a new COS | Explicit |
| R1.7 | `TeamType` must be validated at the API layer — only `'open'` or `'closed'` accepted, anything else is rejected | Implicit (audit gap) |
| R1.8 | COS can only be set on a team of type `closed` — setting COS on an open team is invalid unless the operation also changes the type to closed | Implicit (logical consequence of R1.3) |

**Rationale:** The COS is the gatekeeper of a closed team. Without a COS, the team cannot function as closed because no one can authorize external communication or manage membership.

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
| R3.1 | Three governance roles exist: **MANAGER** (global singleton), **Chief-of-Staff** (per closed team), **Normal** (no privileges) | Explicit |
| R3.2 | Only ONE agent can be MANAGER at any given time (singleton constraint) | Explicit |
| R3.3 | COS is a per-team role — each closed team has exactly one COS | Explicit |
| R3.4 | An agent can be COS of only **ONE** closed team at any time | Explicit (corrected 2026-03-26) |
| R3.5 | All role changes (assign/remove MANAGER, assign/remove COS) require the governance password | Explicit |
| R3.6 | MANAGER has full authority over all teams: can add/remove agents, assign COS, approve transfers, create/delete teams, message anyone | Explicit |
| R3.7 | COS is responsible for **external communication** of their closed team — they are the contact point for outside agents | Explicit |
| R3.8 | COS decides the **staff composition** (add/remove agents) of their closed team — this is why they are called "chief-of-staff" | Explicit |
| R3.9 | MANAGER can do everything COS can, but **usually delegates** to the COS | Explicit |
| R3.10 | Typical workflow: MANAGER creates a closed team, assigns a COS, and lets the COS manage the team from there | Explicit |
| R3.11 | Reassigning MANAGER to a new agent immediately revokes the role from the old agent (only one MANAGER exists) | Implicit (singleton) |
| R3.12 | COS changes (assign/remove) on a team must **NOT** be possible via the generic `PUT /api/teams/[id]` endpoint — only via the dedicated `POST /api/teams/[id]/chief-of-staff` endpoint which requires the governance password | Implicit (prevents bypass of password protection) |

---

## R4. Agent Membership Rules

| ID | Rule | Source |
|----|------|--------|
| R4.1 | **Normal agents** can be in at most **ONE closed team** at any given time | Explicit |
| R4.2 | **Normal agents** can be in **unlimited open teams** simultaneously | Explicit |
| R4.3 | **MANAGER** agents can be in **multiple closed teams** simultaneously | Explicit |
| R4.4 | **COS** agents can be in **multiple closed teams** simultaneously | Explicit |
| R4.5 | An agent cannot be added to a team they are already a member of (no duplicate membership in `agentIds`) | Explicit |
| R4.6 | COS **must** be a member of the team they lead (present in `agentIds[]`) — they manage the team staff and the message filter relies on `agentIds` for same-team communication | Implicit (logical necessity) |
| R4.7 | Removing a COS from a team's `agentIds` while they remain `chiefOfStaffId` is **forbidden** — must remove the COS role first, which auto-downgrades the team to open | Implicit (integrity constraint from R1.4 + R4.6) |
| R4.8 | The UI must **always show team memberships** when selecting agents for any operation (add to team, remove from team, transfer, team creation agent selection) | Explicit |
| R4.9 | Agent existence must be validated when adding to a team — `agentIds` must reference agents that actually exist in the registry | Implicit (referential integrity) |

---

## R5. Transfer Rules

| ID | Rule | Source |
|----|------|--------|
| R5.1 | Moving a normal agent **FROM** a closed team requires a transfer request (approval workflow) — the agent cannot simply leave | Explicit (implemented) |
| R5.2 | Only MANAGER or COS can **create** transfer requests | Explicit (enforced) |
| R5.3 | Only the source team's COS or MANAGER can **approve/reject** transfers | Explicit (enforced) |
| R5.4 | COS **cannot be transferred out** of their own team — this would orphan the closed team without a COS, violating R1.4 | Implicit (prevents COS-less closed team) |
| R5.5 | **Destination team must exist** at the time the transfer request is created | Implicit (referential integrity) |
| R5.6 | Source and destination teams must be **different** (no self-transfer) | Implicit (nonsensical operation) |
| R5.7 | On transfer approval, the **multi-closed-team constraint** (R4.1) must be checked: if the destination is a closed team and the agent is normal, verify they are not already in another closed team | Implicit (logical consequence) |
| R5.8 | Duplicate pending transfer requests (same agent + same source + same destination) must be prevented | Explicit (enforced) |

---

## R6. Messaging Rules

| ID | Rule | Source |
|----|------|--------|
| R6.1 | **Normal closed-team agents** can only message: same-team members + their own COS | Explicit |
| R6.2 | **COS** can message: own team members + other COS agents + MANAGER | Explicit |
| R6.3 | **MANAGER** can message **any** agent without restriction | Explicit |
| R6.4 | **Open-world agents** (not in any closed team) can message anyone who is also not in a closed team | Explicit |
| R6.5 | Cannot message **into** a closed team from outside — to reach a closed-team member, you must go through that team's COS | Explicit |
| R6.6 | When a team downgrades from closed to open (e.g., COS removed), messaging restrictions **lift immediately** — the team is now open | Implicit (team type changed) |
| R6.7 | Message filter must use `getClosedTeamsForAgent` (plural) not `getClosedTeamForAgent` (singular) for COS agents who may belong to multiple closed teams — otherwise they can only message members of their first team | Implicit (bug fix) |

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
| R7.7 | Show **team type badges** (lock icon for closed, unlock for open) next to team names | Implicit (partially done) |
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

1. **Closed-COS invariant**: `team.type === 'closed'` implies `team.chiefOfStaffId !== null`
2. **COS-membership invariant**: `team.chiefOfStaffId === agentId` implies `team.agentIds.includes(agentId)`
3. **Singleton-MANAGER invariant**: At most one agent has `managerId === agentId` globally
4. **One-closed-team invariant**: A normal agent (not MANAGER, not COS) appears in `agentIds` of at most one closed team
5. **Name-uniqueness invariant**: No two teams have the same name (case-insensitive)

---

## Role-Based Permission Matrix

| Action | Normal | COS (own team) | COS (other team) | MANAGER |
|--------|--------|----------------|-------------------|---------|
| Join open team | Yes | Yes | Yes | Yes |
| Join closed team | No (UI hides) | Yes | No (transfer) | Yes |
| Leave open team | Yes | Yes | Yes | Yes |
| Leave closed team | No (transfer) | No (remove COS first) | No (transfer) | Yes |
| Add agent to own team | No | Yes | No | Yes |
| Remove agent from own team | No | Yes | No | Yes |
| Change team type | No | No | No | Yes |
| Assign COS | No | No | No | Yes (password) |
| Remove COS | No | No | No | Yes (password) |
| Create transfer request | No | Yes (own team) | No | Yes |
| Approve/reject transfer | No | Yes (own team) | No | Yes |
| Message same-team agent | Yes | Yes | N/A | Yes |
| Message other-team agent | No | Yes (if COS/MGR) | No | Yes |
| Message external (open) agent | No | Yes (if COS) | No | Yes |
