# Chief-of-Staff Plugin Compliance Audit

**Plugin**: `emasoft-chief-of-staff` (v1.3.9)
**Audited Against**: AI Maestro `feature/team-governance` branch (v0.26.0)
**Date**: 2026-02-27

---

## Executive Summary

The ECOS plugin was designed around an **organization-wide single-COS** model. AI Maestro governance implements a **per-team COS** model with strict messaging isolation. This is the fundamental architectural mismatch — nearly every other gap flows from it.

**Critical changes required: 14 | Major changes: 8 | Minor changes: 6**

---

## CRITICAL CHANGES (Must fix — governance violations)

### C1. COS Scope: Organization-Wide → Per-Team

**Current (WRONG)**: Main agent says "PROJECT-INDEPENDENT: One ECOS for all projects. You are NOT assigned to any specific project."

**Required**: In AI Maestro, COS is **per closed team**, not per organization. Each closed team has its own COS. The COS's authority is scoped to the team it manages.

**Changes**:
- `agents/ecos-chief-of-staff-main-agent.md`: Remove "PROJECT-INDEPENDENT" constraint. Replace with: "TEAM-SCOPED: You manage ONE closed team. Your authority does not extend to other teams."
- Remove all references to "cross-project coordination" and "multi-project tracking"
- The agent file header should include a `team` field identifying which team this COS manages
- Remove the `ecos-multi-project` skill entirely (or repurpose as team-internal coordination)

### C2. Communication Restrictions

**Current (WRONG)**: COS can message ALL agents freely — there are no messaging restrictions in the plugin.

**Required** (from `lib/message-filter.ts` rules R6.1–R6.7):
- COS **CAN** message: MANAGER, other Chiefs-of-Staff, own team members, agents NOT in any closed team
- COS **CANNOT** message: members of OTHER closed teams directly
- COS **CANNOT** message: unresolved aliases from a closed team context

**Changes**:
- `agents/ecos-chief-of-staff-main-agent.md`: Add "MESSAGING RULES" section documenting exactly who COS can and cannot message
- All skills that send messages must check the recipient against these rules BEFORE sending
- `skills/ecos-notification-protocols/SKILL.md`: Must document which recipients are reachable and which are not

### C3. Agent Assignment: Cross-Team → Own-Team Only

**Current (WRONG)**: COS can "assign agents to teams" across all projects/teams.

**Required**: COS can only manage membership within its OWN team. To add/remove agents:
- Adding an agent to own team: COS can do this directly (if team is closed, requires governance password)
- Moving an agent to a DIFFERENT team: requires a **Transfer Request** (`types/governance.ts: TransferRequest`) that the destination team's COS must approve
- Cross-host agent operations: require **GovernanceRequest** with dual-manager approval

**Changes**:
- `skills/ecos-agent-lifecycle/SKILL.md`: Agent creation must register the agent in the COS's own team, not arbitrary teams
- `commands/ecos-replace-agent.md`: Replacement agent must be assigned to the SAME team
- Remove or restrict `commands/ecos-team-assign.md` and `commands/ecos-team-remove.md` to own-team only

### C4. Team Registry: Project-Local → AI Maestro Global

**Current (WRONG)**: Uses `.emasoft/team-registry.json` per project (custom format).

**Required**: AI Maestro stores teams in `~/.aimaestro/teams/registry.json` (global). The COS must use AI Maestro's team registry API (`/api/teams/`) instead of a custom file.

**Changes**:
- `scripts/ecos_team_registry.py`: Must be rewritten to call AI Maestro's REST API (`POST /api/teams`, `PATCH /api/teams/[id]`, etc.) instead of directly managing a JSON file
- Remove `docs/TEAM_REGISTRY_SPECIFICATION.md` or mark it as superseded
- All skills referencing team-registry.json must use the API instead

### C5. Approval Flow: EAMA-Only → Governance Password + Dual-Manager

**Current (WRONG)**: All operations require approval from EAMA (the manager agent). Approvals are simple message-based yes/no.

**Required**: AI Maestro governance uses:
1. **Governance password** for sensitive operations (setting manager, modifying closed teams)
2. **Cross-host governance requests** with status progression: `pending → remote-approved/local-approved → dual-approved → executed/rejected`
3. **GovernanceApprovals** tracking `sourceCOS`, `sourceManager`, `targetCOS`, `targetManager` approvals separately
4. **Rate limiting** on password attempts (per-agent keys)

**Changes**:
- `skills/ecos-permission-management/SKILL.md`: Must use AI Maestro governance request API (`/api/v1/governance/requests`) instead of custom approval messages
- `agents/ecos-approval-coordinator.md`: Must understand the GovernanceRequest state machine (pending → dual-approved → executed)
- `commands/ecos-request-approval.md`: Must submit proper GovernanceRequests, not just messages to EAMA
- Add governance password handling — COS needs to provide the password when submitting cross-host requests

### C6. Agent Roles: Custom → AI Maestro's 3-Role System

**Current (WRONG)**: Plugin defines custom roles (EAA=Architect, EOA=Orchestrator, EIA=Integrator) that don't exist in AI Maestro's role system.

**Required**: AI Maestro has exactly 3 roles: `manager`, `chief-of-staff`, `member`. All other role distinctions are plugin-level concerns, NOT governance-level. The EOA, EIA, EAA are all `member` role agents with different skills.

**Changes**:
- `agents/ecos-chief-of-staff-main-agent.md`: Communication hierarchy must use AI Maestro roles. EOA, EIA, EAA are team `member` agents.
- `docs/ROLE_BOUNDARIES.md`: Must clarify that "role" in the plugin sense (Orchestrator, Integrator, Architect) is different from "governance role" (`manager`/`chief-of-staff`/`member`)
- When creating agents, the `role` field in the agent registry must be set to `member` for all worker/specialist agents, not custom role names

### C7. Agent Configuration Changes: Direct → GovernanceRequest

**Current (WRONG)**: COS directly configures agents with skills and plugins.

**Required**: In AI Maestro governance, configuring an agent (especially on a different host) requires a `GovernanceRequest` of type `configure-agent` with a `ConfigurationPayload`:
```
ConfigOperationType: 'add-skill' | 'remove-skill' | 'add-plugin' | 'remove-plugin' | 'update-hooks' | 'update-mcp' | 'update-model' | 'update-program-args' | 'bulk-config'
```

**Changes**:
- `agents/ecos-plugin-configurator.md`: Must use GovernanceRequest API for config changes on remote agents
- `skills/ecos-plugin-management/SKILL.md`: Must submit `configure-agent` requests through the governance pipeline
- Local agent configuration (same host, same team) can still be done directly

### C8. Messaging Protocol: Custom → AMP (Agent Messaging Protocol)

**Current (PARTIAL)**: Plugin references AI Maestro messaging but uses custom message formats and templates.

**Required**: All inter-agent messaging must use AMP protocol:
- `amp-send.sh <recipient> <subject> <message>`
- `amp-inbox.sh` to check inbox
- Messages are Ed25519-signed for authenticity
- AMP addresses: `agent@host.local` or `agent@provider.domain`

**Changes**:
- `skills/ecos-notification-protocols/SKILL.md`: All message templates must be AMP-compatible
- `references/ai-maestro-message-templates.md`: Update to use AMP format
- Remove any direct HTTP API calls for messaging — use AMP scripts exclusively
- Ensure the COS agent has AMP initialized (`amp-init.sh --auto`)

---

## MAJOR CHANGES (Important for correctness)

### M1. Sub-Agent Scope Restriction

**Current**: 10 sub-agents (staff-planner, lifecycle-manager, project-coordinator, plugin-configurator, skill-validator, resource-monitor, performance-reporter, recovery-coordinator, approval-coordinator) operate organization-wide.

**Required**: Sub-agents must be scoped to the COS's own team. They should not have visibility into other teams' agents or resources.

**Changes**: Add team-scoping to all 10 sub-agent `.md` files — each must operate only within the team boundary.

### M2. Remove ecos-project-coordinator Agent

**Current**: Tracks agents across multiple projects.

**Required**: COS is per-team, not per-project. Cross-project coordination is the MANAGER's responsibility, not COS.

**Changes**: Delete `agents/ecos-project-coordinator.md` or repurpose as intra-team coordinator.

### M3. Remove ecos-multi-project Skill

**Current**: `skills/ecos-multi-project/SKILL.md` manages cross-project tracking.

**Required**: Not applicable for per-team COS.

**Changes**: Remove entirely.

### M4. Transfer Request Support

**Current**: No concept of transfer requests between teams.

**Required**: When COS needs an agent from another team, it must create a `TransferRequest` (pending → approved/rejected by destination COS).

**Changes**: Add a new skill `ecos-transfer-management` that handles creating and tracking transfer requests via `/api/governance/transfers/`.

### M5. Cross-Host Awareness

**Current**: No concept of multi-host operations.

**Required**: AI Maestro supports a mesh of hosts. COS must be aware that:
- Agents may live on different hosts
- Cross-host operations need GovernanceRequests
- Peer governance state is replicated via `GovernanceSyncMessage`

**Changes**: Add host awareness to lifecycle and configuration skills.

### M6. Closed Team Messaging Enforcement on Own Team

**Current**: No enforcement of messaging rules.

**Required**: COS must enforce that its team members follow messaging rules:
- Members can only message teammates and their COS
- Members CANNOT directly message MANAGER (must go through COS)
- COS relays messages to/from MANAGER on behalf of team members

**Changes**: Add message relay capability — COS intercepts outbound messages from members to MANAGER and forwards them (after review/approval).

### M7. Remove/Restrict Commands That Cross Team Boundaries

**Current commands that violate team scope**:
- `ecos-broadcast-notification.md` — broadcasts to ALL agents (should be team-only)
- `ecos-notify-agents.md` — notifies arbitrary agents (should be team-only)
- `ecos-replace-agent.md` — replaces agents in any team (should be own-team only)
- `ecos-team-assign.md` — assigns to any team (should be own-team only)

**Changes**: Restrict all these to operate within the COS's team boundary only.

### M8. Agent Lifecycle Operations Must Use AI Maestro APIs

**Current**: Some operations use custom scripts and local file manipulation.

**Required**: All agent lifecycle operations should go through AI Maestro's REST API:
- Create agent: `POST /api/agents/register`
- Hibernate: `POST /api/agents/[id]/hibernate`
- Wake: `POST /api/agents/[id]/wake`
- Delete: `DELETE /api/agents/[id]`

**Changes**: Update `skills/ecos-agent-lifecycle/SKILL.md` to use AI Maestro API exclusively.

---

## MINOR CHANGES (Nice to have, best practice)

### m1. Plugin Name Should Reflect Per-Team Scope

Current name "chief-of-staff" is fine, but documentation should clarify it's per-team.

### m2. Record-Keeping Location

**Current**: `docs_dev/chief-of-staff/agent-lifecycle.log`
**Suggested**: Use AI Maestro's agent metadata or a team-scoped log location.

### m3. Health Check via AMP, Not Custom Pings

Use AMP's built-in message delivery confirmation instead of custom health ping messages.

### m4. ECOS Naming Convention

**Current**: Fixed name `ecos-<project-name>`
**Required**: Should be `cos-<team-name>` or similar to reflect team scope.

### m5. Version Compatibility

Add a `minMaestroVersion: "0.26.0"` field to plugin.json to prevent installation on older versions that lack governance.

### m6. GovernanceRole Type Usage

When interacting with AI Maestro APIs, use `GovernanceRole` type (`'manager' | 'chief-of-staff' | 'member'`) instead of custom role names.

---

## Files Requiring Changes (Summary)

| File | Change Type | Effort |
|------|-------------|--------|
| `agents/ecos-chief-of-staff-main-agent.md` | **Rewrite** — scope, communication, constraints | High |
| `agents/ecos-staff-planner.md` | Major — team-scoping | Medium |
| `agents/ecos-lifecycle-manager.md` | Major — API changes, team-scoping | Medium |
| `agents/ecos-project-coordinator.md` | **Delete or repurpose** | Low |
| `agents/ecos-plugin-configurator.md` | Major — GovernanceRequest API | Medium |
| `agents/ecos-skill-validator.md` | Minor — team-scoping | Low |
| `agents/ecos-resource-monitor.md` | Minor — team-scoping | Low |
| `agents/ecos-performance-reporter.md` | Minor — team-scoping | Low |
| `agents/ecos-recovery-coordinator.md` | Major — team-scoping | Medium |
| `agents/ecos-approval-coordinator.md` | **Rewrite** — GovernanceRequest API | High |
| `skills/ecos-agent-lifecycle/SKILL.md` | Major — AI Maestro API, team scope | High |
| `skills/ecos-permission-management/SKILL.md` | **Rewrite** — governance password, GovernanceRequest | High |
| `skills/ecos-notification-protocols/SKILL.md` | Major — AMP protocol | Medium |
| `skills/ecos-multi-project/SKILL.md` | **Delete** | Low |
| `skills/ecos-staff-planning/SKILL.md` | Major — team-scoped | Medium |
| `skills/ecos-plugin-management/SKILL.md` | Major — GovernanceRequest for config | Medium |
| `scripts/ecos_team_registry.py` | **Rewrite** — use AI Maestro REST API | High |
| `docs/ROLE_BOUNDARIES.md` | **Rewrite** — per-team COS model | Medium |
| `docs/TEAM_REGISTRY_SPECIFICATION.md` | **Delete or supersede** | Low |
| `.claude-plugin/plugin.json` | Minor — version compat, description | Low |
| Multiple `commands/*.md` | Moderate — restrict to team scope | Medium |

---

## Key Governance Rules for Reference

### Messaging Rules (from `lib/message-filter.ts`)
```
R6.1: Closed-team MEMBER → can message: teammates, own COS
R6.2: COS → can message: MANAGER, other COS, own team members, agents not in any closed team
R6.3: MANAGER → can message anyone
R6.4: Open-world agents (not in closed team) → no restrictions
R6.5: Outside agent → closed-team member: DENIED
R6.7: COS can be in multiple teams (uses getClosedTeamsForAgent plural)
```

### Team ACL (from `lib/team-acl.ts`)
```
1. Web UI (no agentId) → allowed
2. Team not found → denied
3. Open team → allowed
4. MANAGER → allowed
5. COS of this team → allowed
6. Team member → allowed
7. Everyone else → denied
```

### GovernanceRequest Status Machine
```
pending → remote-approved / local-approved → dual-approved → executed
pending → rejected (at any step)
```
