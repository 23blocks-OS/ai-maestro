# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:17.761Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-compliance-chief-of-staff.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown /Users/emanuelesabetta/ai-maestro/docs_dev/plugin-compliance-chief-of-staff.md
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

**Current**: 10 sub-agents (staff-planner, lifecycle-manager, project-coordinator, plugin-configurator, skill-validator, resource-monitor, performance-reporter, recovery