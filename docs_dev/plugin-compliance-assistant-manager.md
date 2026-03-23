# Assistant Manager (MANAGER) Plugin Compliance Audit

**Plugin**: `emasoft-assistant-manager-agent` (v1.1.6)
**Audited Against**: AI Maestro `feature/team-governance` branch (v0.26.0)
**Date**: 2026-02-27

---

## Executive Summary

The EAMA plugin was designed around a **hierarchical project management** model (EAMA > ECOS > EOA/EIA/EAA). AI Maestro governance implements a **flat role-based** model with 3 roles: `manager`, `chief-of-staff`, `member`. The MANAGER role in AI Maestro largely aligns with EAMA's authority, but the interaction patterns, approval workflows, and team management differ significantly.

**Critical changes required: 8 | Major changes: 7 | Minor changes: 5**

---

## CRITICAL CHANGES (Must fix — governance violations)

### C1. Role Name Mapping: EAMA → MANAGER

**Current (CONFUSING)**: Plugin calls itself "Assistant Manager" (EAMA). The main agent reports to "the user" as a separate entity from the manager.

**Required**: In AI Maestro, this IS the `manager` role agent (AgentRole = `'manager'`). There is exactly ONE manager per host. The agent registry must have `role: 'manager'` set.

**Changes**:
- `agents/eama-assistant-manager-main-agent.md`: Clarify that this agent holds the `manager` governance role
- The agent's entry in AI Maestro registry must have `role: 'manager'`
- The governance password must be set to appoint this agent as manager (`/api/governance/manager`)
- Add awareness that `isManager(agentId)` in the codebase checks this agent's authority

### C2. COS Relationship: Spawns → Assigns

**Current (WRONG)**: EAMA "spawns ECOS instances" — creates new Claude Code sessions for each COS.

**Required**: In AI Maestro, the MANAGER **assigns** the COS role to an existing agent via:
1. The agent must already exist in the registry
2. MANAGER assigns the agent as COS of a specific team via `PATCH /api/teams/[id]/chief-of-staff`
3. For cross-host COS assignment: requires a `GovernanceRequest` of type `assign-cos`

**Changes**:
- `skills/eama-ecos-coordination/SKILL.md`: Replace "spawn ECOS" workflow with "assign COS role to agent" workflow
- `references/creating-ecos-instance.md`: Rewrite as "assigning-cos-role.md"
- `references/creating-ecos-procedure.md`: Rewrite to use AI Maestro's team API
- Update all references from "ECOS instances" to "COS-assigned agents"

### C3. Project Model → Team Model

**Current (WRONG)**: EAMA creates "projects" and assigns one ECOS per project. Projects are directory-based.

**Required**: AI Maestro doesn't have a "project" concept in governance. It has **teams**:
- Teams are created via `POST /api/teams`
- Teams can be `open` or `closed` (TeamType)
- Each closed team can have one COS
- Teams are stored globally in `~/.aimaestro/teams/registry.json`

**Changes**:
- `agents/eama-assistant-manager-main-agent.md`: Replace "project creation" with "team creation"
- `skills/eama-ecos-coordination/SKILL.md`: Replace all project references with team references
- `commands/eama-approve-plan.md`: Adapt to team-based workflow
- The "one ECOS per project" model becomes "one COS per closed team"

### C4. Approval Authority: Message-Based → GovernanceRequest API

**Current (WRONG)**: ECOS sends approval request messages, EAMA replies with approve/reject messages.

**Required**: AI Maestro uses structured `GovernanceRequest` objects with a status machine:
```
pending → remote-approved / local-approved → dual-approved → executed
pending → rejected (at any step)
```

MANAGER approves via: `POST /api/v1/governance/requests/[id]/approve` with governance password.
MANAGER rejects via: `POST /api/v1/governance/requests/[id]/reject`.

**Changes**:
- `skills/eama-approval-workflows/SKILL.md`: **Rewrite** to use GovernanceRequest API
- `references/rule-14-enforcement.md`: Map RULE 14 operations to GovernanceRequestTypes
- `commands/eama-approve-plan.md`: Must call the governance API, not send a message
- `commands/eama-respond-to-ecos.md`: Must approve/reject GovernanceRequests via API

### C5. Communication Rules: Must Understand Messaging Isolation

**Current (PARTIAL)**: EAMA communicates freely with everyone via AI Maestro messaging.

**Required**: As MANAGER, this agent CAN message anyone (R6.3). However, MANAGER must understand:
- Closed-team members CANNOT directly message MANAGER (they go through COS) — so MANAGER should not expect direct messages from members
- MANAGER should communicate with COS, who relays to team members
- AMP protocol is the messaging standard

**Changes**:
- `agents/eama-assistant-manager-main-agent.md`: Add "GOVERNANCE MESSAGING RULES" section explaining:
  - MANAGER can message anyone
  - Messages to closed-team members bypass COS isolation (by governance design)
  - Preferred chain-of-command: MANAGER → COS → members (even though MANAGER CAN bypass)
  - AMP message signing with Ed25519

### C6. Governance Password Management

**Current (MISSING)**: No concept of governance password.

**Required**: MANAGER must:
1. Set the governance password initially via `POST /api/governance/password`
2. Provide the governance password when approving cross-host requests
3. Understand that the password is bcrypt-hashed and stored in `~/.aimaestro/governance.json`
4. Be rate-limited on password attempts (5 attempts then 60s cooldown)

**Changes**:
- Add new skill `eama-governance-password` or add section to `eama-approval-workflows/SKILL.md`
- The main agent must know how to set and use the governance password
- Include rate-limit awareness in the approval workflow

### C7. Cross-Host Governance Awareness

**Current (MISSING)**: No concept of multi-host mesh or cross-host operations.

**Required**: AI Maestro supports a mesh of hosts. MANAGER must understand:
- Hosts are registered via `~/.aimaestro/hosts.json`
- Cross-host operations require GovernanceRequests with dual-manager approval
- Governance state is replicated via GovernanceSyncMessages
- Peer governance state is cached in `~/.aimaestro/governance-peers/`
- `shouldAutoApprove()` in `lib/manager-trust.ts` can auto-approve requests from trusted peers

**Changes**:
- Add awareness of multi-host operations in the main agent file
- `skills/eama-approval-workflows/SKILL.md`: Include cross-host request handling
- Add ability to manage trusted hosts and auto-approve policies

### C8. Agent Role Assignment

**Current (WRONG)**: EAMA assigns custom roles (EAA=Architect, EOA=Orchestrator, EIA=Integrator).

**Required**: AI Maestro has 3 governance roles only: `manager`, `chief-of-staff`, `member`. Plugin-level specializations (architect, orchestrator, integrator) are expressed through:
- Agent skills (different skills for different specialties)
- Agent metadata/tags
- NOT through the `role` field in the agent registry

**Changes**:
- `skills/eama-role-routing/SKILL.md`: Clarify that routing is based on agent skills/specialization, NOT governance role
- When creating agents, set `role: 'member'` for all non-COS agents
- The "routing to EAA/EOA/EIA" is a plugin-level concern, not a governance concept

---

## MAJOR CHANGES (Important for correctness)

### M1. Team Creation API

**Current**: EAMA creates projects (directories with git repos).

**Required**: Team creation uses AI Maestro API:
```
POST /api/teams { name, description, type: 'open'|'closed', agentIds }
```

**Changes**: Add team creation workflow to `skills/eama-ecos-coordination/SKILL.md`.

### M2. Agent Creation API

**Current**: EAMA instructs ECOS to create agents via messages.

**Required**: Agent creation via AI Maestro:
```
POST /api/agents/register { name, workingDirectory, role: 'member', ... }
```
For agents on remote hosts, use GovernanceRequest type `create-agent`.

**Changes**: Update `skills/eama-ecos-coordination/references/creating-ecos-procedure.md`.

### M3. Status Reporting via AI Maestro APIs

**Current**: EAMA aggregates status from messages.

**Required**: Use AI Maestro's API for real-time status:
- `GET /api/sessions` — agent session status
- `GET /api/agents/health` — agent health
- `GET /api/teams/[id]` — team status
- `GET /api/teams/[id]/tasks` — task status (Kanban)

**Changes**: `skills/eama-status-reporting/SKILL.md` must query AI Maestro APIs.

### M4. Kanban/Tasks Integration

**Current**: EAMA delegates kanban to EOA who manages GitHub Projects.

**Required**: AI Maestro has its own task system:
- Tasks stored per-team in `~/.aimaestro/teams/tasks-{teamId}.json`
- 5 statuses: `backlog → pending → in_progress → review → completed`
- Dependency chains between tasks
- Kanban board in the web UI

MANAGER can also use GitHub Projects, but the AI Maestro task system should be the primary tracking.

**Changes**: Add awareness of AI Maestro task system to status reporting and work routing.

### M5. Transfer Request Handling

**Current (MISSING)**: No concept of transfer requests.

**Required**: When agents need to move between closed teams, a `TransferRequest` is created:
- `POST /api/governance/transfers { agentId, fromTeamId, toTeamId, note }`
- COS of the destination team approves/rejects
- MANAGER can also approve transfers

**Changes**: Add transfer request handling to approval workflows.

### M6. GitHub Routing Alignment

**Current**: `eama-github-routing/SKILL.md` handles GitHub issues and project management.

**Required**: This is fine as a plugin-level feature, but:
- GitHub operations should respect team boundaries
- Issues should be tagged with team labels
- Kanban operations should sync with AI Maestro's task system

**Changes**: Update the GitHub routing skill to tag issues with team context.

### M7. Session Memory → AI Maestro Agent Memory

**Current**: `eama-session-memory/SKILL.md` uses custom file-based record-keeping.

**Required**: AI Maestro has built-in agent memory:
- Agent database (CozoDB) at `~/.aimaestro/agents/<id>/`
- Subconscious memory indexing (conversation history → semantic search)
- Long-term memory consolidation

**Changes**: Integrate with AI Maestro's memory system instead of custom files.

---

## MINOR CHANGES (Nice to have)

### m1. Plugin Naming

Consider renaming from "assistant-manager" to just "manager" to align with AI Maestro's `manager` role name.

### m2. Custom Message Templates → AMP Standard

All message templates in `references/` should use AMP format consistently.

### m3. Record-Keeping Location

**Current**: `docs_dev/projects/`, `docs_dev/approvals/`, `docs_dev/sessions/`
**Suggested**: Use AI Maestro's agent metadata or a standardized location under `~/.aimaestro/`.

### m4. Version Compatibility

Add `minMaestroVersion: "0.26.0"` to plugin.json.

### m5. Remove Python `__pycache__` from Repo

`scripts/__pycache__/` directories with `.pyc` files should be gitignored.

---

## Files Requiring Changes (Summary)

| File | Change Type | Effort |
|------|-------------|--------|
| `agents/eama-assistant-manager-main-agent.md` | **Major rewrite** — role mapping, governance awareness | High |
| `agents/eama-report-generator.md` | Minor — team-scoped reports | Low |
| `skills/eama-ecos-coordination/SKILL.md` | **Rewrite** — COS assignment, team API | High |
| `skills/eama-approval-workflows/SKILL.md` | **Rewrite** — GovernanceRequest API, password | High |
| `skills/eama-role-routing/SKILL.md` | Major — governance roles vs plugin roles | Medium |
| `skills/eama-github-routing/SKILL.md` | Major — team boundary awareness | Medium |
| `skills/eama-session-memory/SKILL.md` | Major — AI Maestro memory integration | Medium |
| `skills/eama-status-reporting/SKILL.md` | Major — AI Maestro API queries | Medium |
| `skills/eama-user-communication/SKILL.md` | Minor — governance messaging context | Low |
| `skills/eama-label-taxonomy/SKILL.md` | Minor — team-aware labels | Low |
| `commands/eama-approve-plan.md` | Major — GovernanceRequest API | Medium |
| `commands/eama-respond-to-ecos.md` | Major — GovernanceRequest approval | Medium |
| `commands/eama-orchestration-status.md` | Minor — AI Maestro API | Low |
| `commands/eama-planning-status.md` | Minor — team context | Low |
| `docs/ROLE_BOUNDARIES.md` | **Rewrite** — per-team COS, 3-role system | High |
| `docs/FULL_PROJECT_WORKFLOW.md` | **Rewrite** — team-based workflow | High |
| `docs/AGENT_OPERATIONS.md` | Major — AI Maestro API | Medium |
| `shared/message_templates.md` | Major — AMP format | Medium |
| `shared/handoff_template.md` | Minor — team context | Low |
| `.claude-plugin/plugin.json` | Minor — version compat, description | Low |
| Multiple `references/*.md` | Moderate — governance API, AMP format | Medium |
| Multiple `scripts/*.py` | Minor — validation updates | Low |

---

## Mapping: Plugin Concepts → AI Maestro Concepts

| Plugin Concept | AI Maestro Equivalent |
|----------------|----------------------|
| EAMA (Assistant Manager) | MANAGER role (`role: 'manager'`) |
| ECOS (Chief of Staff) | COS role (`role: 'chief-of-staff'`) per team |
| EOA (Orchestrator) | member agent with orchestration skills |
| EIA (Integrator) | member agent with integration/review skills |
| EAA (Architect) | member agent with architecture skills |
| Worker Agent | member agent (`role: 'member'`) |
| Project | Team (`POST /api/teams`) |
| Project creation | Team creation (`POST /api/teams { type: 'closed' }`) |
| ECOS spawning | COS role assignment (`PATCH /api/teams/[id]/chief-of-staff`) |
| Approval message | GovernanceRequest (`POST /api/v1/governance/requests`) |
| Approve response | Approve API (`POST /api/v1/governance/requests/[id]/approve`) |
| Custom team registry | AI Maestro team registry (`~/.aimaestro/teams/registry.json`) |
| AI Maestro messages | AMP protocol (`amp-send.sh`, `amp-inbox.sh`) |
| RULE 14 | GovernanceRequest + governance password |
| Health check ping | AMP message or `/api/agents/health` |

---

## Key Governance Rules for Reference

### MANAGER Authority (from `lib/governance.ts` + `lib/team-acl.ts`)
```
- Singleton per host (one managerId in governance.json)
- Can message anyone (R6.3 — message-filter.ts)
- Has access to ALL closed teams (team-acl.ts step 4)
- Appoints/removes itself via governance password (bcrypt, 12 rounds)
- Approves/rejects GovernanceRequests
- Cross-host: both local and remote MANAGER must approve (dual-manager)
```

### GovernanceRequest Types
```
'add-to-team' | 'remove-from-team' | 'assign-cos' | 'remove-cos' |
'transfer-agent' | 'create-agent' | 'delete-agent' | 'configure-agent'
```

### GovernanceRequest Status Machine
```
pending → remote-approved / local-approved → dual-approved → executed
pending → rejected (at any step)
```

### GovernanceApprovals Structure
```
{ sourceCOS?, sourceManager?, targetCOS?, targetManager? }
```
