# Chief of Staff Plugin (AMCOS) -- AI Maestro Integration Analysis

**Date**: 2026-03-13
**Plugin**: `ai-maestro-chief-of-staff` v2.10.2
**Location**: `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff`
**Repository**: `https://github.com/Emasoft/ai-maestro-chief-of-staff`

---

## 1. Plugin Overview

AMCOS is a **per-team** Chief of Staff plugin. One instance manages one team's agent lifecycle: spawning, hibernating, waking, terminating, configuring, and monitoring agents. It coordinates with the Manager (EAMA), Orchestrator (EOA), Architect (EAA), and Integrator (EIA) via AMP messaging.

### Component Inventory

| Category | Count | Notes |
|----------|-------|-------|
| Agents (sub-agents) | 10 | Main agent + 9 specialists |
| Skills | 26 | All `amcos-*` prefixed |
| Commands | 23 | All `/amcos-*` prefixed |
| Scripts (Python) | 35+ | Operational + validation |
| Hooks | 5 | SessionStart, SessionEnd, 2x UserPromptSubmit, Stop |
| Shared templates | 5 | Handoff, messages, onboarding, performance, thresholds |
| Docs | 4 | ROLE_BOUNDARIES, FULL_PROJECT_WORKFLOW, TEAM_REGISTRY_SPEC, AGENT_OPERATIONS |

---

## 2. Agent Creation / Staffing

### How It Creates Agents

AMCOS creates agents via `aimaestro-agent.sh` CLI (the `ai-maestro-agents-management` skill wrapper). The flow is:

1. **Governance approval** -- submits `GovernanceRequest` to `POST /api/v1/governance/requests`
2. **Plugin install** -- copies plugin from `~/.claude/plugins/cache/ai-maestro/<plugin>/<version>/` to `~/agents/<session>/.claude/plugins/<plugin>/`
3. **Agent creation** -- calls `aimaestro-agent.sh create <name> --dir <path> --task <desc> -- --dangerously-skip-permissions --chrome --add-dir /tmp --plugin-dir <path> --agent <agent-name>`
4. **Registry** -- calls `amcos_team_registry.py add-agent` to register in team via `POST /api/teams/{id}/agents`
5. **Welcome message** -- sends onboarding AMP message

### Does It Use Haephestos?

**NO.** AMCOS has no awareness of Haephestos at all. No references to `.agent.toml`, Haephestos, or the agent creation helper exist anywhere in the plugin. It creates agents exclusively through `aimaestro-agent.sh` CLI and hardcoded plugin-to-role mappings.

### Does It Use the AI Maestro Agent API?

**Partially.** The `TODO` comment at the top of `amcos_spawn_agent.py` says:
```
# TODO: Migrate to AI Maestro REST API (POST /api/agents/register, etc.)
# Current implementation uses ai-maestro-agents-management skill
```

The same TODO appears in `amcos_terminate_agent.py`. So agent lifecycle is via CLI, not REST API.

---

## 3. Team Management

### How It Manages Teams

Team management uses **direct REST API calls** via `amcos_team_registry.py`:

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Create team | `/api/teams` | POST |
| Add agent | `/api/teams/{id}/agents` | POST |
| Remove agent | `/api/teams/{id}/agents/{agentId}` | DELETE |
| Update team | `/api/teams/{id}` | PATCH |
| List teams | `/api/teams` | GET |

**Hardcoded role constraints** in `amcos_team_registry.py`:
```python
ROLE_CONSTRAINTS = {
    "orchestrator": RoleConstraint(1, 1, "ai-maestro-orchestrator-agent", "member"),
    "architect": RoleConstraint(1, 1, "ai-maestro-architect-agent", "member"),
    "integrator": RoleConstraint(0, 10, "ai-maestro-integrator-agent", "member"),
    "programmer": RoleConstraint(1, 20, "ai-maestro-programmer-agent", "member"),
}
```

### VIOLATION: Plugin Abstraction Principle

The team registry script makes **direct HTTP calls** to the AI Maestro REST API using `urllib.request`. Per the Plugin Abstraction Principle, external plugins MUST use Layer 2 scripts (`aimaestro-agent.sh`, `amp-send.sh`, etc.) -- never call the API directly. The `amcos_team_registry.py` bypasses this by using raw `urllib`.

Similarly, `amcos_approval_manager.py`, `amcos_heartbeat_check.py`, `amcos_notify_agent.py`, and `amcos_generate_team_report.py` all make direct HTTP calls to the AI Maestro API.

---

## 4. Messaging (AMP Integration)

### How It Uses AMP

AMCOS uses AMP correctly through two channels:

1. **`amp-send` CLI** -- the `amcos_notify_agent.py` and `amcos_approval_manager.py` scripts call `amp-send` as a subprocess. This is correct per the Plugin Abstraction Principle.

2. **`agent-messaging` skill** -- the main agent and sub-agents reference the global `agent-messaging` skill for messaging. Commands and skills describe message templates but delegate actual sending to the skill.

### Issues Found

- **`amcos_notify_agent.py` calls `curl` for agent resolution** -- before sending a message, it queries `$AIMAESTRO_API/api/agents?name=<name>` via `curl -sf`. This is a direct API call that bypasses the abstraction layer.

- **`amcos_approval_manager.py` sends AMP to hardcoded recipient** -- at line 585: `to="ai-maestro-assistant-manager-agent"`. This is a hardcoded session name assumption. The actual manager's session name should be discovered dynamically.

- **Several skill reference docs contain `curl` examples** -- The `amcos-failure-detection`, `amcos-recovery-execution`, `amcos-agent-replacement`, and `amcos-agent-termination` skills contain example `curl` commands with direct API calls like `curl -s "$AIMAESTRO_API/api/agents"` and `curl -X POST "$AIMAESTRO_API/api/messages"`. These violate the Plugin Abstraction Principle (skills should reference the `agent-messaging` skill, not embed `curl` commands).

---

## 5. Governance

### GovernanceRequest System

AMCOS has a sophisticated governance implementation:

- **`amcos_approval_manager.py`** -- Full GovernanceRequest client with API-first + YAML fallback pattern
- **`GovernanceAPI` class** -- HTTP client for `POST/GET/PATCH /api/v1/governance/requests`
- **State machine**: `pending -> local-approved / remote-approved -> dual-approved -> executed / rejected`
- **Local YAML mirror** at `.claude/approvals/{pending,completed}/` for audit trail
- **Governance password** support for critical operations

### Role Checks and Permissions

- 3 governance roles enforced: `manager`, `chief-of-staff`, `member`
- Messaging restrictions (R6.1-R6.7) prevent cross-team direct messaging
- Dual-manager approval required for cross-team operations
- Operations requiring approval: spawn, terminate, hibernate, wake, replace, install, critical

### Issues Found

- **`/api/v1/governance/requests` endpoint path is hardcoded** in `amcos_approval_manager.py` as `GOVERNANCE_API_PATH = "/api/v1/governance/requests"`. If the AI Maestro governance API version changes, this breaks.

- **Governance password is passed via command arguments and API payload** -- The `amcos-request-approval` command accepts `--governance-password <PWD>`. This is passed as a field in the GovernanceRequest JSON body. No X-Governance-Password header pattern is used.

- **The `amcos-request-approval` command embeds API endpoint syntax** (`POST /api/v1/governance/requests`, `GET /api/v1/governance/requests/{requestId}`) directly in the command markdown. This violates the Plugin Abstraction Principle which says commands MUST NOT embed API syntax.

---

## 6. Design Document Distribution

### How It Works

AMCOS distributes design documents via the **handoff document system**:

1. **Handoff templates** in `shared/handoff_template.md` define the YAML-fronted markdown format
2. **Handoff files** stored in `docs_dev/handoffs/` with naming: `handoff-{uuid}-{from}-to-{to}.md`
3. **Distribution via AMP** -- handoff document path is included in AMP messages (onboarding, role briefing)
4. **No file transfer** -- only file paths are sent; agents must have filesystem access to read them

### Issues Found

- **No actual file distribution mechanism** -- the plugin assumes all agents can access the same filesystem (local-only). There is no mechanism for distributing design docs to agents on remote hosts.

- **The FULL_PROJECT_WORKFLOW.md describes the design flow** (User -> EAMA -> EAA -> EOA -> agents) but AMCOS does NOT directly distribute design documents. The workflow says the Manager sends requirements to the Architect, and the Orchestrator distributes task-requirements-documents. AMCOS only handles agent lifecycle, not content distribution.

---

## 7. Hardcoded Assumptions

### API URLs and Endpoints

| File | Hardcoded Value |
|------|----------------|
| `amcos_team_registry.py:30` | `API_BASE = os.environ.get("AIMAESTRO_API", "http://localhost:23000")` |
| `amcos_approval_manager.py:47` | `DEFAULT_API_BASE = "http://localhost:23000"` |
| `amcos_approval_manager.py:48` | `GOVERNANCE_API_PATH = "/api/v1/governance/requests"` |
| `amcos_notify_agent.py:35` | `api_base = os.environ.get("AIMAESTRO_API", "http://localhost:23000")` |
| `amcos_heartbeat_check.py:268` | `api_base = os.environ.get("AIMAESTRO_API", "http://localhost:23000")` |
| `amcos_generate_team_report.py:38` | `DEFAULT_API_BASE = "http://localhost:23000"` |

All scripts use `$AIMAESTRO_API` env var with `http://localhost:23000` fallback. This is acceptable but the direct API calls themselves violate the abstraction principle.

### Hardcoded Role/Plugin Mappings

| File | Assumption |
|------|-----------|
| `amcos_team_registry.py:52-57` | 4 roles hardcoded: orchestrator, architect, integrator, programmer |
| `AGENT_OPERATIONS.md` | Role-to-plugin mapping table (6 roles) |
| `amcos-agent-spawning/SKILL.md` | `--agent` flag values hardcoded for 4 roles |
| `shared/thresholds.py:89` | `VALID_ROLES = frozenset(["architect", "orchestrator", "integrator"])` -- **missing programmer!** |
| `shared/thresholds.py:92-97` | `ROLE_PREFIX_MAP` with 4 prefixes (amcos-, eaa-, eoa-, eia-) -- **missing epa-!** |

### Hardcoded Session Name Patterns

- `AGENT_OPERATIONS.md` defines `amcos-orch-`, `amcos-arch-`, `amcos-intg-`, `amcos-prog-` prefixes
- `amcos_approval_manager.py:585` sends to `"ai-maestro-assistant-manager-agent"` (hardcoded manager name)

### Hardcoded Governance Rules

- `amcos_team_registry.py` hardcodes `RoleConstraint` (min/max per role, required plugin per role)
- `ROLE_BOUNDARIES.md` hardcodes the 3-role governance model
- `TEAM_REGISTRY_SPECIFICATION.md` hardcodes the 8-column kanban system
- The Plugin Abstraction Principle says governance rules should be discovered at runtime by reading the `team-governance` skill -- AMCOS does NOT do this

---

## 8. What AI Maestro Features AMCOS SHOULD Use But Does NOT

### 8.1 Haephestos / `.agent.toml` System
AMCOS has no concept of `.agent.toml` profiles or the Haephestos creation flow. It creates agents using hardcoded plugin-to-role mappings and `aimaestro-agent.sh`. It should integrate with the Role-Plugin system where `.agent.toml` defines the agent persona and gets converted to a plugin.

### 8.2 Plugin Abstraction Principle (Layer 2 Scripts)
Multiple scripts make direct `urllib` calls to the AI Maestro REST API instead of using `aimaestro-agent.sh` or `amp-send.sh` wrappers:
- `amcos_team_registry.py` -- should use a future `aimaestro-team.sh` or delegate to the `team-governance` skill
- `amcos_approval_manager.py` -- should use a governance wrapper script or the `team-governance` skill
- `amcos_heartbeat_check.py` -- should use `aimaestro-agent.sh` health check
- `amcos_notify_agent.py` -- uses `curl` for agent resolution instead of `aimaestro-agent.sh`
- `amcos_generate_team_report.py` -- direct API calls

### 8.3 `team-governance` Skill (Runtime Discovery)
AMCOS hardcodes governance rules (role constraints, permission matrices, approval requirements) instead of discovering them at runtime from the `team-governance` skill. When AI Maestro updates governance rules, AMCOS will be out of sync.

### 8.4 Agent Registry REST API for Lifecycle
The `amcos_spawn_agent.py` and `amcos_terminate_agent.py` scripts contain a TODO to migrate from `aimaestro-agent.sh` CLI to the REST API (`POST /api/agents/register`). However, per the Plugin Abstraction Principle, they should keep using the CLI wrapper -- not migrate to direct API calls. The TODO is misleading.

### 8.5 Team Stats API
AI Maestro has a `GET /api/teams/stats/` endpoint. AMCOS does not use it for its resource monitoring or performance reporting -- it uses manual file-based state tracking instead.

### 8.6 Subconscious / Memory System
AMCOS has its own memory management (`amcos_memory_manager.py`, `amcos_memory_operations.py`, `amcos_snapshot_memory.py`) with session memory, context management, and progress tracking. It does NOT use AI Maestro's built-in subconscious/CozoDB memory system. This is a parallel implementation that may conflict.

### 8.7 Push Notifications for Messages
AMCOS uses heartbeat polling (`amcos_heartbeat_check.py`) to detect agent health, running on every `UserPromptSubmit` hook. AI Maestro has a push notification system that sends instant tmux notifications when messages arrive. AMCOS should leverage this instead of polling.

---

## 9. Plugin Abstraction Violations Summary

| Violation | Location | Rule Violated |
|-----------|----------|---------------|
| Direct API calls in scripts | `amcos_team_registry.py`, `amcos_approval_manager.py`, `amcos_heartbeat_check.py`, `amcos_notify_agent.py`, `amcos_generate_team_report.py` | Layer 2: scripts MUST NOT call API directly |
| API syntax in commands | `amcos-request-approval.md` contains `POST /api/v1/governance/requests` | Layer 1: commands MUST NOT embed API syntax |
| `curl` examples in skills | `amcos-failure-detection`, `amcos-recovery-execution`, `amcos-agent-replacement` skills | Layer 1: skills MUST NOT embed API calls |
| Hardcoded governance rules | `amcos_team_registry.py` RoleConstraint, `ROLE_BOUNDARIES.md`, `thresholds.py` | Governance rules MUST be discovered at runtime |
| Hardcoded manager session name | `amcos_approval_manager.py:585` | Session names MUST be resolved dynamically |

---

## 10. Inconsistencies and Bugs

### 10.1 `thresholds.py` Missing Roles
`VALID_ROLES` is `["architect", "orchestrator", "integrator"]` but does not include `"programmer"`. `ROLE_PREFIX_MAP` maps only 4 prefixes and is missing `epa-` (programmer prefix). Yet the team registry and AGENT_OPERATIONS.md both document programmer as a valid role.

### 10.2 Naming Inconsistency Between Docs
- `AGENT_OPERATIONS.md` uses prefixes `amcos-orch-`, `amcos-arch-`, `amcos-intg-`, `amcos-prog-` for ALL agents
- `TEAM_REGISTRY_SPECIFICATION.md` uses prefixes based on repo name: `svgbbox-orchestrator`, `svgbbox-architect`
- `amcos-agent-spawning/SKILL.md` uses yet another pattern: `epa-svgbbox-impl`
- The `--agent` flag values in the spawning skill use `eoa-orchestrator-main-agent` while `AGENT_OPERATIONS.md` uses `amcos-orchestrator-main-agent`

These naming patterns are inconsistent and will cause confusion.

### 10.3 Handoff Template Uses Old Prefix
`shared/handoff_template.md` still references `ecos` as the COS prefix (from the old emasoft-chief-of-staff plugin) instead of `amcos`. The communication hierarchy diagram shows `USER <-> AMCOS` but the handoff files use `ecos` in the naming convention.

### 10.4 ROLE_BOUNDARIES.md Hierarchy Mismatch
The doc says EAMA is "1 per organization" but the team registry naming shows `eama-assistant-manager` as a fixed entity. It is unclear how multiple EAMA instances would work in a multi-team scenario.

---

## 11. Architecture Assessment

### Strengths
1. **Well-structured plugin** -- Clean separation of agents, skills, commands, scripts, hooks, shared, docs
2. **Governance-first approach** -- All destructive operations require approval
3. **AMP messaging discipline** -- Most communication goes through AMP
4. **API-first with YAML fallback** -- The approval manager gracefully degrades when API is down
5. **Comprehensive documentation** -- 4 detailed docs + per-skill references
6. **Validation scripts** -- Extensive `validate_*.py` suite for self-checking

### Weaknesses
1. **Plugin Abstraction Violations** -- Multiple direct API calls bypass the abstraction layer
2. **No Haephestos integration** -- Creates agents via hardcoded mappings, no `.agent.toml` support
3. **Hardcoded governance rules** -- Should discover from `team-governance` skill at runtime
4. **Parallel memory system** -- Own memory management conflicts with AI Maestro's subconscious
5. **Naming inconsistencies** -- Three different agent naming conventions across docs
6. **Missing roles in thresholds** -- `programmer` missing from `VALID_ROLES` and `ROLE_PREFIX_MAP`

---

## 12. Recommendations

### P0 (Critical)
1. **Remove all direct API calls from scripts** -- Replace `urllib` calls in `amcos_team_registry.py`, `amcos_approval_manager.py`, etc. with calls to `aimaestro-agent.sh`, `amp-send.sh`, or future `aimaestro-team.sh` wrappers
2. **Remove curl/API syntax from skills and commands** -- Replace with references to AI Maestro skills
3. **Discover governance rules at runtime** -- Read the `team-governance` skill instead of hardcoding role constraints

### P1 (High)
4. **Integrate with Haephestos / `.agent.toml`** -- Support role-plugin creation flow
5. **Fix `thresholds.py`** -- Add `programmer` to `VALID_ROLES` and `epa-` to `ROLE_PREFIX_MAP`
6. **Fix hardcoded manager session name** -- Resolve dynamically via team registry or discovery
7. **Unify naming conventions** -- Pick one agent naming pattern and use it everywhere

### P2 (Medium)
8. **Evaluate memory system overlap** -- Determine if AMCOS memory should delegate to AI Maestro's subconscious
9. **Use push notifications** -- Replace heartbeat polling with AI Maestro's tmux push notification system
10. **Fix handoff template** -- Update `ecos` references to `amcos`
11. **Use `/api/teams/stats/`** -- Leverage existing stats endpoint for resource monitoring

---

**END OF ANALYSIS**
