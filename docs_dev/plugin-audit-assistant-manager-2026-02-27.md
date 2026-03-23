# Plugin Audit: ai-maestro-assistant-manager-agent
Generated: 2026-02-27

**Repository**: https://github.com/Emasoft/ai-maestro-assistant-manager-agent
**Clone path**: /tmp/audit-assistant-manager
**Plugin version**: 2.0.0
**Architecture version**: v2

---

## Overview

The `ai-maestro-assistant-manager-agent` (AMAMA) is a Claude Code plugin implementing the **manager** governance role in the AI Maestro multi-agent ecosystem. Version 2.0.0 represents a full architecture migration from the earlier v1 plugin (`emasoft-assistant-manager-agent` v1.1.6), with substantial governance model changes. It is the sole user-facing agent in the 4-plugin hierarchy (AMAMA → AMCOS → AMAA/AMOA/AMIA). The README references AI Maestro >= 0.26.0 but this is informational only (the plugin spec has no version pinning mechanism).

---

## 1. Plugin Structure

### Claude Code Plugin Spec Compliance

The plugin has a valid `.claude-plugin/plugin.json` manifest:

```json
{
  "name": "ai-maestro-assistant-manager-agent",
  "version": "2.0.0",
  "description": "User's right hand - sole interlocutor with user, directs other roles.",
  "agents": [
    "./agents/amama-assistant-manager-main-agent.md",
    "./agents/amama-report-generator.md"
  ],
  "skills": "./skills/"
}
```

**Assessment**: The manifest is valid but INCOMPLETE by spec standards:
- Missing `commands` field (plugin has 4 slash commands in `commands/` directory but they are not listed in plugin.json)
- Missing `hooks` field (plugin has `hooks/hooks.json` but it is not referenced from plugin.json)
- Missing `marketplace` field (no marketplace URL specified — the plugin floats without marketplace attribution)
- Missing explicit `scope` field (cannot determine if local or global install is intended)

### Directory Structure

```
.claude-plugin/
  plugin.json                              ✓ Present (incomplete)
agents/
  amama-assistant-manager-main-agent.md   ✓ Main agent definition
  amama-report-generator.md               ✓ Report generator sub-agent
commands/
  amama-approve-plan.md                   ✓ Slash command
  amama-orchestration-status.md          ✓ Slash command
  amama-planning-status.md               ✓ Slash command
  amama-respond-to-amcos.md              ✓ Slash command
hooks/
  hooks.json                              ✓ 3 hooks (SessionStart, SessionEnd, Stop)
scripts/
  amama_*.py (13 functional scripts)      ✓ All functional
  validate_*.py (17 validation scripts)   ✓ Full validation suite
shared/
  handoff_template.md                     ✓ Handoff format definition
  message_templates.md                    ✓ Inter-agent message templates
  thresholds.py                           ✓ Governance constants
skills/ (8 skills total)
  amama-amcos-coordination/              ✓ COS coordination
  amama-approval-workflows/              ✓ GovernanceRequest approval
  amama-github-routing/                  ✓ GitHub operation routing
  amama-label-taxonomy/                  ✓ GitHub label management
  amama-role-routing/                    ✓ Request routing
  amama-session-memory/                  ✓ CozoDB-backed memory
  amama-status-reporting/                ✓ AI Maestro API status queries
  amama-user-communication/             ✓ User interaction patterns
docs/
  AGENT_OPERATIONS.md                    ✓ Manager role operations
  FULL_PROJECT_WORKFLOW.md              ✓ Team workflow phases
  ROLE_BOUNDARIES.md                    ✓ Permission matrix
  TEAM_REGISTRY_SPECIFICATION.md       ✓ Registry schema
git-hooks/
  pre-push                               ✓ Git pre-push hook
.github/workflows/
  validate.yml                           ✓ CI validation
  release.yml                            ✓ Release workflow
```

**Plugin spec conformance**: PARTIAL. The plugin correctly uses agent definition files with YAML front-matter, skill SKILL.md convention, and hooks.json format. However, the plugin.json is missing commands and hooks references.

---

## 2. AI Maestro Compatibility

### API Surface Used

The plugin references the AI Maestro API extensively (166 occurrences across all files). All references use the `$AIMAESTRO_API` environment variable (defaulting to `http://localhost:23000`). Explicit `localhost:23000` hardcoding is NOT found — the plugin correctly uses the env var.

**API endpoints referenced:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/teams` | POST | Create teams |
| `/api/teams/{id}` | GET, PATCH, DELETE | Team management |
| `/api/teams/{id}/chief-of-staff` | PATCH | COS assignment (v2 endpoint) |
| `/api/teams/{id}/cos` | POST | COS assignment (v1-style, also present in docs) |
| `/api/teams/{id}/tasks` | GET | Task Kanban data |
| `/api/teams/{id}/members` | POST, DELETE | Team member management |
| `/api/agents` | GET | List agents |
| `/api/agents/register` | POST | Register new agent |
| `/api/agents/health` | GET | Agent health checks |
| `/api/sessions` | GET | Session status |
| `/api/messages` | POST, GET | AMP messaging |
| `/api/governance/password` | POST | Set governance password |
| `/api/v1/governance/requests` | GET | List GovernanceRequests |
| `/api/v1/governance/requests/{id}/approve` | POST | Approve GovernanceRequests |
| `/api/v1/governance/requests/{id}/reject` | POST | Reject GovernanceRequests |
| `/api/v1/governance/requests/{id}` | GET | Get specific GovernanceRequest |
| `/api/v1/health` | GET | Health check |
| `/api/v1/messages/pending` | GET | AMP message polling |
| `/api/memory/` | GET/POST | CozoDB memory endpoints |
| `/api/governance/transfers` | POST | Transfer agent requests |

**ISSUE - API inconsistency**: The plugin uses two different COS assignment endpoints:
- `PATCH /api/teams/[id]/chief-of-staff` (in agent persona and SKILL.md)
- `POST /api/teams/{id}/cos` (in AGENT_OPERATIONS.md and TEAM_REGISTRY_SPECIFICATION.md)

These must be reconciled to match the actual AI Maestro server implementation.

### AMP Messaging

The plugin uses the `agent-messaging` skill for all inter-agent communication. It does NOT directly call `amp-send.sh` / `amp-inbox.sh` scripts. Instead it instructs the agent to use the `agent-messaging` skill (a globally-installed AI Maestro skill) as an abstraction layer. This is the correct pattern for v2 plugins.

**Message types used:**
- `work_request`, `approval_request`, `approval_decision`, `status_query`, `status_report`
- `ping` / `pong` (health checks)
- `cos-role-assignment` / `cos-role-accepted`
- `autonomy_grant` / `autonomy_revoke`
- `operation_complete`, `user_decision`, `ack`

### Agent Registry

- References `~/.aimaestro/agents/registry.json` for agent lookup
- Uses `GET /api/agents` for listing agents
- Uses `POST /api/agents/register` for registering new agents
- Checks `isManager(agentId)` function (references AI Maestro's governance check API)
- References `~/.aimaestro/agents/<agent-id>/memory.cozo` for CozoDB memory
- References `~/.aimaestro/teams/registry.json` for team registry
- References `~/.aimaestro/teams/tasks-{teamId}.json` for task storage

### Governance

- Full governance model awareness (3 roles: manager, chief-of-staff, member)
- GovernanceRequest state machine: `pending → remote-approved/local-approved → dual-approved → executed`
- Dual-manager approval for cross-host operations
- Governance peers cached at `~/.aimaestro/governance-peers/`

### tmux Sessions

The plugin does NOT reference tmux directly. It uses the AI Maestro `agent-messaging` skill and the AI Maestro API for all inter-agent communication. Agent session names are used in the domain-subdomain-name format for AMP addressing.

### CLI Command

The plugin is designed to be loaded with:
```bash
claude --agent amama-assistant-manager-main-agent
```
Or during development:
```bash
claude --plugin-dir /path/to/ai-maestro-assistant-manager-agent
```
There is NO `claude --agent ai-maestro-assistant-manager` shorthand documented.

### AI Maestro Version Requirement

The plugin README references AI Maestro >= 0.26.0. Note: the Claude Code plugin specification has no mechanism for plugins to declare or enforce platform version requirements. The version reference in the README is informational only and cannot be validated or enforced at install time. Plugins cannot pin or gate on AI Maestro versions.

---

## 3. Governance Compliance

### Team Type Awareness (open/closed)

VERIFIED: The plugin explicitly handles both team types:
- `open`: Members can communicate freely, including messaging manager directly
- `closed`: Members communicate ONLY through their COS

References found in: main agent persona (lines 83-84), ROLE_BOUNDARIES.md, TEAM_REGISTRY_SPECIFICATION.md, FULL_PROJECT_WORKFLOW.md, amama-amcos-coordination SKILL.md.

### Manager Role / Chief-of-Staff Role

VERIFIED: The plugin correctly understands and enforces:
- Exactly ONE manager per host (singleton constraint)
- Manager is the ONLY agent that creates teams and assigns COS roles
- COS role is assigned to an EXISTING registered agent (not spawned new — this is the key v2 change)
- The `isManager(agentId)` check is referenced for authority validation
- Permission matrix is documented in ROLE_BOUNDARIES.md

### Governance Password

VERIFIED: The plugin correctly implements governance password:
- Set via `POST /api/governance/password`
- bcrypt-hashed, stored in `~/.aimaestro/governance.json`
- Required for all GovernanceRequest approvals
- Rate-limited: 5 failed attempts → 60-second cooldown (429 Too Many Requests)
- Security rules: NEVER store in plaintext, NEVER include in inter-agent messages

### chiefOfStaffId Field

The plugin references the COS assignment via API endpoints (`PATCH /api/teams/{id}/chief-of-staff` and `POST /api/teams/{id}/cos`). In the team registry schema (`TEAM_REGISTRY_SPECIFICATION.md`), the field is represented as:
```json
{
  "cos": "svgbbox-cos"
}
```
The plugin does NOT reference a field named `chiefOfStaffId` explicitly — it uses the `cos` field in the registry schema and the API endpoint path `/{id}/chief-of-staff`. This is consistent with the AI Maestro team model but the field name inconsistency (API path vs registry schema) should be verified against the actual server implementation.

### Governance Request Types

The plugin handles all 8 GovernanceRequest types:
`add-to-team`, `remove-from-team`, `assign-cos`, `remove-cos`, `transfer-agent`, `create-agent`, `delete-agent`, `configure-agent`

### Specialization Model (Critical Correctness)

VERIFIED AND CORRECT: The plugin correctly distinguishes between governance roles and specializations:
- Governance role field: ONLY `manager`, `chief-of-staff`, or `member`
- Specializations (architect, orchestrator, integrator) are expressed via `skills` and `tags` metadata
- `thresholds.py` codifies this: `VALID_GOVERNANCE_ROLES = frozenset(["manager", "chief-of-staff", "member"])` and `VALID_SPECIALIZATIONS = frozenset(["architect", "orchestrator", "integrator"])`

---

## 4. Naming and Marketplace Issues

### Independence from emasoft-plugins Marketplace

**IMPORTANT**: This plugin (`ai-maestro-assistant-manager-agent`) is an **independent** plugin, NOT related to the `emasoft-assistant-manager-agent` plugin in the emasoft-plugins marketplace. They are separate projects with separate codebases. Any references to emasoft-* naming inside this repo would be a bug.

**Emasoft naming contamination check**: **CLEAN** — grep found 0 references to "emasoft", "EAMA", "EOA", "EAA", "EIA", or "ema-" across all files. The `amama-` prefix is used consistently throughout. This plugin has been properly cleaned of legacy naming.

### Marketplace Attribution Gap

The plugin.json does NOT specify a marketplace. This plugin needs its own marketplace registration (either a new `ai-maestro` marketplace or distribution via the AI Maestro bundled plugin system) before it can be installed via `claude plugin install`. It should NOT be added to the emasoft-plugins marketplace.

---

## 5. Installation Architecture

### Scope

The plugin.json does NOT include an explicit `scope` field. The README states:
```
This plugin ships with AI Maestro. It is installed automatically when AI Maestro provisions an Assistant Manager agent.
```

This implies the plugin is intended to be installed **automatically by AI Maestro itself** rather than manually by users. There is no documented mechanism for `--scope local` installation to assign it to specific agents only.

### Installation Methods

Two installation methods are documented:

1. **Automatic** (production): AI Maestro provisions it when creating an assistant manager agent
2. **Development**: `claude --plugin-dir /path/to/ai-maestro-assistant-manager-agent`

No `claude plugin install` marketplace path is documented for this v2 plugin.

### External Dependency

The main agent explicitly states it requires the `ai-maestro-agents-management` skill:
```yaml
skills:
  - ai-maestro-agents-management   # Global, installed by AI Maestro
```

This skill is NOT bundled in the plugin — it must be globally installed by AI Maestro. If AI Maestro is not installed or running, the COS assignment and agent lifecycle management will not function.

### Python Runtime

All scripts use `python3` (not `uv run`). The hooks.json runs:
```
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/amama_session_start.py
```

The scripts use Python 3.8+ stdlib only (no external dependencies), so this is fine for portability.

---

## 6. Agent Persona Analysis

### Main Agent (amama-assistant-manager-main-agent.md)

**YAML front-matter**:
```yaml
name: amama-assistant-manager-main-agent
description: "Assistant Manager main agent - user's right hand, sole interlocutor with user."
model: opus
skills:
  - amama-user-communication
  - amama-amcos-coordination
  - amama-approval-workflows
  - amama-role-routing
  - amama-label-taxonomy
  - amama-github-routing
  - amama-session-memory
  - amama-status-reporting
  - ai-maestro-agents-management  # External global skill
```

**Role Definition**: Comprehensive and well-defined. The persona correctly:
- Defines itself as `manager` governance role, singleton per host
- Lists key constraints (SOLE USER INTERFACE, TEAM CREATION, COS ASSIGNMENT, APPROVAL AUTHORITY, NO IMPLEMENTATION, NO DIRECT TASK ASSIGNMENT)
- Documents response formats for different user interaction types

**AI Maestro Awareness**: High. The persona includes:
- Full governance model (3 roles, authority matrix)
- COS assignment procedure via API
- Cross-host GovernanceRequest handling
- Governance password management
- Team type handling (open/closed)
- AMP messaging patterns with full session name format
- Required message types and priority levels

**Teams and Governance**: Excellent coverage. The persona directly references:
- `POST /api/teams` for team creation
- `PATCH /api/teams/[id]/chief-of-staff` for COS assignment
- `POST /api/v1/governance/requests/[id]/approve` with governance password
- `~/.aimaestro/governance-peers/` for cross-host peer state

**.agent.toml Awareness**: NOT present. The plugin does NOT reference or produce `.agent.toml` files (see section 7).

**Skill Suggester Integration**: NOT present. The plugin does not reference the `perfect-skill-suggester` or any skill-suggester integration. Skills are listed directly in the agent YAML front-matter.

### Report Generator Agent (amama-report-generator.md)

**YAML front-matter**:
```yaml
name: amama-report-generator
model: opus
description: Generates status reports and project summaries.
type: local-helper
trigger_conditions: [list of 6 conditions]
auto_skills:
  - amama-session-memory
memory_requirements: low
```

Note: `type: local-helper` is a non-standard field (not in the Claude Code plugin spec). This agent is intended to be spawned as a sub-agent by the main AMAMA agent to offload report generation.

---

## 7. .agent.toml Support

**FINDING**: The plugin does NOT reference, produce, or consume `.agent.toml` files anywhere.

A search across all files (`.md`, `.json`, `.py`) found zero references to `agent.toml`. The plugin uses:
- YAML front-matter in `.md` files for agent/skill definitions (standard Claude Code plugin format)
- `~/.aimaestro/agents/registry.json` for agent registry (AI Maestro's own format)
- `~/.aimaestro/teams/registry.json` for team registry

If the broader AI Maestro ecosystem uses `.agent.toml` for agent configuration, this plugin does not participate in that system. This may be intentional if `.agent.toml` is handled by the AI Maestro provisioning layer rather than individual plugins.

---

## 8. Cross-Plugin Interaction

### With Chief-of-Staff (AMCOS plugin)

**Primary interaction point**. All work routing goes through AMCOS.

**Interactions**:
- AMAMA assigns COS role to agent via `PATCH /api/teams/{id}/chief-of-staff`
- AMAMA sends `work_request` messages to AMCOS (via AMP)
- AMCOS sends `approval_request` messages to AMAMA (via AMP)
- AMAMA responds with `approval_decision` (approve/deny/defer)
- AMCOS sends `status_report` and `operation_complete` to AMAMA
- AMAMA sends `autonomy_grant` / `autonomy_revoke` to AMCOS
- Health check via `ping` / `pong` (AMAMA pings AMCOS every 10 minutes during active sessions)

**Handoff protocol**: Uses `.md` files with UUID in `docs_dev/handoffs/` directory with format `handoff-{uuid}-{from}-to-{to}.md`

**Message ACK protocol**: All messages require ACK within timeouts:
- Approval decisions: 30 seconds
- Work requests: 60 seconds
- Health pings: 30 seconds
- Status queries: 30 seconds

**AMAMA does NOT directly communicate with specialist agents** (AMAA, AMOA, AMIA). All goes through AMCOS.

### With Skill Suggester (perfect-skill-suggester)

**No direct integration**. The plugin does not reference the skill-suggester in any file. The agent's skills are hardcoded in the YAML front-matter. This is a potential enhancement opportunity — the skill-suggester could be used to activate skills contextually rather than loading all 8 upfront.

### With Architect Agent (AMAA)

Indirect only — routed via AMCOS. AMAMA identifies "design/plan/architect" user intents and sends `work_request` to AMCOS specifying "architect specialization" target. AMAMA does not communicate directly with AMAA agents.

### With Orchestrator Agent (AMOA) and Integrator Agent (AMIA)

Same pattern as AMAA — indirect via AMCOS only.

### GitHub Integration

AMAMA uses `gh` CLI for GitHub issue/PR operations via the `amama-github-routing` and `amama-label-taxonomy` skills. It manages a canonical 8-column Kanban system:
```
backlog → todo → in-progress → ai-review → human-review → merge-release → done → [blocked at any stage]
```

Note: The AI Maestro task system uses a 5-status model (`backlog → pending → in_progress → review → completed`) while the GitHub Kanban uses 8 columns. The plugin handles the mapping between these in `amama-github-routing/references/task-system-sync.md`.

---

## 9. Findings Summary

### CRITICAL

| ID | Finding | Impact | Location |
|----|---------|--------|----------|
| C1 | **Informational — version reference**: Plugin README references AI Maestro >= 0.26.0. No version pinning mechanism exists in the Claude Code plugin specification — plugins cannot declare platform version requirements. Version references in README are informational only. | No enforcement possible | README.md |
| C2 | **`commands/` and `hooks/` not referenced in plugin.json**: The 4 slash commands and 3 hooks are defined but the plugin.json manifest omits them. Claude Code will not register the commands or execute the hooks on plugin load. | Commands silently not registered; hooks silently not run | `.claude-plugin/plugin.json` |
| C3 | **External skill dependency (`ai-maestro-agents-management`) not bundled**: COS assignment and agent lifecycle management will fail if AI Maestro is not installed globally. No fallback or graceful degradation documented. | COS management non-functional without AI Maestro | `agents/amama-assistant-manager-main-agent.md:14` |

### HIGH

| ID | Finding | Impact | Location |
|----|---------|--------|----------|
| H1 | **COS assignment endpoint inconsistency**: Plugin uses `PATCH /api/teams/[id]/chief-of-staff` in the agent persona and SKILL.md, but `POST /api/teams/{id}/cos` in AGENT_OPERATIONS.md and TEAM_REGISTRY_SPECIFICATION.md. One of these must be wrong. | COS assignment may fail with 404 | Multiple files |
| H2 | **No marketplace registration for v2**: The new plugin is not in any marketplace, making it impossible to install via `claude plugin install`. It can only be loaded via `--plugin-dir` or automatic AI Maestro provisioning. | Cannot be installed by users | Missing in emasoft-plugins marketplace |
| H3 | **v1 and v2 coexist with no migration path**: The `emasoft-assistant-manager-agent` v1.1.2 is still published in the marketplace. Users upgrading to AI Maestro 0.26+ need guidance to switch from v1 to v2. No migration guide exists. | User confusion, potential duplicate installs | README.md (no migration section) |
| H4 | **`amama_stop_check.py` inbox check is a stub**: `check_ai_maestro_inbox()` always returns `(0, [])` with a comment "Message retrieval is not supported by the AMP CLI." This means the Stop hook never blocks on unread messages, defeating one of its stated purposes. | Incomplete stop guard | `scripts/amama_stop_check.py:42-48` |
| H5 | **Session start hook loads wrong memory path**: `amama_session_start.py` loads from `.claude/amama/` (relative to CWD). The v2 memory architecture uses CozoDB at `~/.aimaestro/agents/<id>/memory.cozo`. The hook reads v1-style file-based memory and ignores CozoDB entirely. | Session continuity degraded; CozoDB memory not loaded on session start | `scripts/amama_session_start.py:42` |

### MEDIUM

| ID | Finding | Impact | Location |
|----|---------|--------|----------|
| M1 | **No `.agent.toml` support**: Plugin does not produce or consume `.agent.toml` files. If AI Maestro ecosystem uses this for agent configuration, AMAMA agents will lack that configuration layer. | Potential ecosystem integration gap | All files |
| M2 | **No skill-suggester integration**: All 8 skills are always loaded (Claude Code must process all of them). Using `perfect-skill-suggester` could reduce token usage by activating only contextually relevant skills. | Higher token usage per session | `agents/amama-assistant-manager-main-agent.md` |
| M3 | **5-status vs 8-column mismatch**: AI Maestro task system uses 5 statuses; GitHub Kanban uses 8 columns. The mapping logic exists in reference docs but is complex and error-prone. | Potential sync failures | `amama-github-routing/references/task-system-sync.md` |
| M4 | **Monitoring schedule polling is aggressive**: The agent is instructed to check AI Maestro inbox every 2 minutes and ping AMCOS every 10 minutes. In a Claude Code session this means constant API calls, which may impact performance. | Resource usage | `skills/amama-user-communication/SKILL.md:259-265` |
| M5 | **`amama-approve-plan` command references legacy plan-phase workflow**: The command references `.claude/orchestrator-plan-phase.local.md` and `/start-orchestration` — these are v1 orchestration concepts not present in the v2 architecture. This command appears to be a legacy artifact. | Stale command | `commands/amama-approve-plan.md` |

### LOW

| ID | Finding | Impact | Location |
|----|---------|--------|----------|
| L1 | **Report generator uses `type: local-helper`**: This is a non-standard front-matter field not in the Claude Code plugin spec. It will be silently ignored by Claude Code. | No functional impact; cosmetic | `agents/amama-report-generator.md:6` |
| L2 | **`hooks.json` structure uses non-standard `_id` fields**: The hooks have `_id` and `_description` (underscore-prefixed) nested within outer objects with a `hooks` array inside. This double-nesting and use of underscore-prefixed metadata fields is non-standard. | Hooks may not be parsed correctly | `hooks/hooks.json` |
| L3 | **Plugin ships with 17 validation scripts** that are not relevant at runtime. These are development/CI tools bundled in the plugin unnecessarily. | Larger plugin package size | `scripts/validate_*.py` |
| L4 | **CozoDB dependency assumed but not verified**: The `amama-session-memory` skill assumes CozoDB is available at `~/.aimaestro/agents/<agent-id>/`. If AI Maestro was not set up with CozoDB, the primary memory tier silently falls back to file-based storage without user notification. | Silent degraded mode | `skills/amama-session-memory/SKILL.md` |
| L5 | **RULE 14 enforcement**: The plugin defines "RULE 14: User Requirements Are Immutable" as a cross-cutting concern. This is enforced textually in agent personas and skills but there is no automated enforcement mechanism. | Relies entirely on LLM compliance | Multiple skill files |

---

## 10. Required Plugin Changes

This section provides detailed change requirements for the AMAMA plugin to work correctly with the AI Maestro governance system. Each change specifies the file to modify, what to add or change, why it is needed, and which protocol flow it supports.

### Changes Summary

| ID | Severity | Change | File(s) | Flow(s) |
|----|----------|--------|---------|---------|
| RC-1 | CRITICAL | Add commands + hooks to plugin.json | plugin.json | ALL |
| RC-2 | HIGH | Fix COS assignment endpoint | docs/*.md | Flow 2 |
| RC-3 | HIGH | Implement Stop hook inbox check | amama_stop_check.py | ALL |
| RC-4 | HIGH | Fix session start memory path | amama_session_start.py | ALL |
| RC-5 | MEDIUM | Add auth headers to scripts | scripts/*.py | Flows 1,3,9 |
| RC-6 | MEDIUM | Modernize approve-plan command | amama-approve-plan.md | Flows 6,9 |
| RC-7 | MEDIUM | Fix status reporting endpoints | amama-status-reporting/SKILL.md | Monitoring |
| RC-8 | LOW | Add .agent.toml awareness | agent persona .md | Flows 6,9 |
| RC-9 | LOW | Remove v1 legacy references | amama-approve-plan.md | Housekeeping |
| RC-10 | LOW | Update authority matrix docs | ROLE_BOUNDARIES.md | All |

---

### RC-1: Fix plugin.json — Add Missing `commands` and `hooks` Fields (CRITICAL)

**File:** `.claude-plugin/plugin.json`
**Current:** Only `agents` and `skills` declared
**Required:** Add `commands` array and `hooks` reference

```json
{
  "name": "ai-maestro-assistant-manager-agent",
  "version": "2.0.0",
  "description": "User's right hand - sole interlocutor with user, directs other roles.",
  "agents": [
    "./agents/amama-assistant-manager-main-agent.md",
    "./agents/amama-report-generator.md"
  ],
  "skills": "./skills/",
  "commands": [
    "./commands/amama-approve-plan.md",
    "./commands/amama-orchestration-status.md",
    "./commands/amama-planning-status.md",
    "./commands/amama-respond-to-amcos.md"
  ],
  "hooks": "./hooks/"
}
```

**Why:** Without this, Claude Code will NOT register the 4 slash commands or execute the 3 hooks (SessionStart, SessionEnd, Stop). The agent loads but its hooks are dead and commands are invisible. This is the #1 blocker.
**Flows affected:** ALL flows — SessionStart hook initializes memory, Stop hook guards session end.

---

### RC-2: Fix COS Assignment Endpoint Inconsistency (HIGH)

**Files to audit:**
- `agents/amama-assistant-manager-main-agent.md` — uses `PATCH /api/teams/[id]/chief-of-staff` CORRECT
- `skills/amama-amcos-coordination/SKILL.md` — verify which endpoint is used
- `docs/AGENT_OPERATIONS.md` — uses `POST /api/teams/{id}/cos` WRONG
- `docs/TEAM_REGISTRY_SPECIFICATION.md` — uses `POST /api/teams/{id}/cos` WRONG

**Required change:** Replace ALL instances of `POST /api/teams/{id}/cos` with `POST /api/teams/{id}/chief-of-staff`. The actual AI Maestro server endpoint is `POST /api/teams/[id]/chief-of-staff` with body `{ agentId, password }`.

**Why:** The wrong endpoint causes 404 errors when AMAMA tries to guide the user through COS assignment.
**Flow affected:** Flow 2 (User Assigns Chief-of-Staff)

---

### RC-3: Fix Stop Hook Inbox Stub (HIGH)

**File:** `scripts/amama_stop_check.py`
**Current (line ~42-48):** `check_ai_maestro_inbox()` always returns `(0, [])` with comment "Message retrieval is not supported by the AMP CLI."
**Required:** Replace the stub with an actual call to `amp-inbox.sh` to check for unread messages:

```python
import subprocess
import json

def check_ai_maestro_inbox():
    try:
        result = subprocess.run(
            ['amp-inbox.sh', '--format', 'json'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            messages = json.loads(result.stdout)
            unread = [m for m in messages if m.get('status') == 'unread']
            return (len(unread), unread)
    except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError):
        pass
    return (0, [])
```

**Why:** The Stop hook is supposed to warn the user if there are unread messages before closing the session. The stub defeats this safety check entirely.
**Flow affected:** All flows — session lifecycle safety

---

### RC-4: Fix Session Start Memory Path (HIGH)

**File:** `scripts/amama_session_start.py`
**Current (line ~42):** Loads memory from `.claude/amama/` (relative path, v1-style)
**Required:** Load memory from `~/.aimaestro/agents/<agent-id>/memory.cozo` (v2 CozoDB path)

The script should:
1. Determine the agent's UUID from the AI Maestro registry: `GET $AIMAESTRO_API/api/agents?name=$SESSION_NAME`
2. Check for CozoDB memory at `~/.aimaestro/agents/<uuid>/memory.cozo`
3. Fall back to file-based memory at `.claude/amama/` if CozoDB not found
4. Log which memory tier is in use

**Why:** The v2 architecture uses CozoDB for memory. The session start hook loads stale v1 file-based memory, ignoring all CozoDB-stored knowledge.
**Flow affected:** All flows — session continuity and memory initialization

---

### RC-5: Add X-Agent-Id Header to All API Calls (MEDIUM)

**Files:** All scripts that call the AI Maestro API
**Required:** Every `curl` or HTTP request to the AI Maestro API must include:
- `Authorization: Bearer <amp-api-key>` (from AMP registration)
- `X-Agent-Id: <manager-agent-uuid>` (from agent registry)

**Current state:** The agent persona instructs the LLM to use these headers, but the Python hook scripts (which run outside the LLM context) do NOT include them. Scripts that call `/api/teams`, `/api/governance/*`, or `/api/agents` must authenticate.

**Why:** The new team creation restriction (G1) requires `X-Agent-Id` to identify the caller as MANAGER. Without this header, the server treats the request as a web UI call (which is allowed, but the audit trail is incomplete — no requestingAgentId is logged).
**Flow affected:** Flow 1 (team creation), Flow 3 (agent reassignment), Flow 9 (COS design requirements)

---

### RC-6: Add `amama-approve-plan` Command Modernization (MEDIUM)

**File:** `commands/amama-approve-plan.md`
**Current:** References legacy `.claude/orchestrator-plan-phase.local.md` and `/start-orchestration` — v1 concepts not present in v2.
**Required:** Update to reference the v2 GovernanceRequest approval workflow:
- The command should list pending GovernanceRequests: `GET /api/v1/governance/requests?status=pending`
- Present each request with type, payload, requester
- Allow the user to approve or reject: `PUT /api/v1/governance/requests/{id}` with `{ action: "approve", password: "<governance-password>" }`

**Why:** The command is non-functional in v2. It references v1 orchestration concepts that no longer exist.
**Flow affected:** Flow 6 (PSS agent creation), Flow 9 (COS creates agents)

---

### RC-7: Verify `amama-status-reporting` Skill API Endpoints (MEDIUM)

**File:** `skills/amama-status-reporting/SKILL.md`
**Current:** References several AI Maestro API endpoints for status queries
**Required verification:**
- `GET /api/teams` — exists
- `GET /api/sessions` — exists
- `GET /api/agents/health` — does NOT exist (no `/api/agents/health` route)
- `GET /api/v1/health` — does NOT exist as documented (AI Maestro has `/api/sessions` as health check, not `/api/v1/health`)

**Fix:** Replace `/api/agents/health` with per-agent health checks via the session list: `GET /api/sessions` returns all active sessions. An agent is "healthy" if it appears in the session list with `status: 'online'`.

Replace `/api/v1/health` with `/api/sessions` (the documented health check for AI Maestro).

**Why:** Non-existent endpoints return 404 and the status reporting fails silently.
**Flow affected:** Monitoring and health checks

---

### RC-8: Add `.agent.toml` Awareness for PSS Integration (LOW)

**File:** `agents/amama-assistant-manager-main-agent.md` (agent persona)
**Required:** Add a section to the agent persona explaining that:
1. When creating agents, AMAMA can instruct COS to use `/pss-setup-agent` for optimal configuration
2. The resulting `.agent.toml` file describes recommended skills, plugins, MCP servers for the agent
3. AMAMA should include `.agent.toml` recommendations in `work_request` messages to COS when specifying design requirements
4. Example: "Create an architect agent. Use /pss-setup-agent to determine optimal skills."

**Why:** Without this awareness, AMAMA never tells COS to use PSS, and agents are created with generic configurations.
**Flow affected:** Flow 6 (PSS agent creation), Flow 9 (COS design requirements)

---

### RC-9: Remove Legacy `amama-approve-plan` v1 References (LOW)

**File:** `commands/amama-approve-plan.md`
**Current:** References `.claude/orchestrator-plan-phase.local.md`, `/start-orchestration`, and v1 phase concepts
**Required:** Remove all v1 references. Either modernize the command (see RC-6) or mark it as deprecated and remove it from the commands list in plugin.json.

**Why:** Stale v1 commands confuse the LLM and may trigger hallucinated v1 workflows.
**Flow affected:** None directly — housekeeping

---

### RC-10: Add Governance Authority Documentation (LOW)

**File:** `docs/ROLE_BOUNDARIES.md`
**Required:** Add or update the authority matrix to match the verified AI Maestro implementation:

| Operation | User | Manager (AMAMA) | COS (AMCOS) | Normal Member |
|-----------|------|-----------------|-------------|---------------|
| Create team | YES (dashboard) | YES (on user instruction) | NO | NO |
| Delete team | YES | YES | YES (own team) | NO |
| Assign COS | YES (governance password) | NO | NO | NO |
| Add agent to open team | YES | YES | YES | NO |
| Add agent to closed team | YES | YES | YES (own team) | NO |
| Create new agent (CLI) | YES | YES | YES (needs MANAGER approval) | NO |
| Transfer from closed team | YES | YES (auto-approves) | YES (needs source COS approval) | NO |
| Cross-host transfer | YES | YES (needs remote MANAGER) | YES (needs both MANAGERs) | NO |
| Approve GovernanceRequests | YES | YES (governance password) | NO | NO |

**Why:** The existing ROLE_BOUNDARIES.md may not match the verified server implementation.
**Flow affected:** All flows — reference documentation

---

## 11. PR Compatibility Conflicts (feature/team-governance)

> **Design principle:** Plugin skills should reference AI Maestro's global skills by name (not embed API syntax). Plugin hooks should call global scripts (not curl). See [docs/PLUGIN-ABSTRACTION-PRINCIPLE.md](../docs/PLUGIN-ABSTRACTION-PRINCIPLE.md).

The following conflicts exist between this plugin and the current PR:

### CONFLICT-1: Parallel Team Registry (CRITICAL)

**Problem:** AMAMA creates ECOS and manages teams via `.emasoft/team-registry.json`, but the PR introduces a server-side team registry at `/api/teams` with full CRUD, ACL enforcement, and team types (open/closed).

**Current plugin behavior:** AMAMA's `eama-ecos-coordination` skill creates ECOS by running tmux commands directly and never calls any team API. Team composition exists only in `.emasoft/team-registry.json`.

**Required change:** Replace `.emasoft/team-registry.json` usage with AI Maestro's `team-governance` skill patterns. The skill teaches all team operations (create, list, update, get) with proper authentication. AMAMA skill descriptions should instruct agents to follow the `team-governance` skill for team management instead of maintaining a local file registry.

### CONFLICT-2: No Authentication Headers (HIGH)

**Problem:** AMAMA makes no API calls with `Authorization: Bearer` or `X-Agent-Id` headers. The PR's `lib/agent-auth.ts` uses these headers to establish agent identity. Without them, AMAMA's API calls are treated as "web UI" requests, bypassing the new MANAGER-only team creation restriction and all team ACL checks.

**Current plugin behavior:** Zero auth headers on any API call.

**Required change:** The `team-governance` skill already teaches the correct authentication pattern with `Authorization: Bearer <api-key>` and `X-Agent-Id` headers. AMAMA agents gain proper auth by following the `team-governance` skill — no manual header construction needed in plugin scripts. Ensure agents have AMP registration (via `amp-init.sh --auto` from the `agent-messaging` skill) on startup so API credentials exist.

### CONFLICT-3: Agent Creation Bypasses Governance (HIGH)

**Problem:** AMAMA creates ECOS by directly running `tmux new-session` + copying plugin files. The PR introduces a GovernanceRequest type `create-agent` for formal agent creation approval.

**Current plugin behavior:** `eama-ecos-coordination` → tmux session → plugin copy → AMP init check. No GovernanceRequest created.

**Required change:** For agent creation, AMAMA should use `aimaestro-agent.sh` (from the `ai-maestro-agents-management` skill) for agent lifecycle operations. For governance approval in closed teams, the `team-governance` skill teaches the GovernanceRequest workflow. AMAMA skill descriptions should instruct agents to submit a GovernanceRequest before creating agents for closed teams, following the `team-governance` skill patterns.

### CONFLICT-4: Approval System Mismatch (HIGH)

**Problem:** AMAMA's `eama-approval-workflows` skill uses AMP messages for approval requests/responses. The PR introduces a formal GovernanceRequest system with state machine (pending → approved → executed) and governance password authentication.

**Current plugin behavior:** Receives AMP `approval-request` messages → presents to user → sends AMP `approval-response`. No GovernanceRequest involvement.

**Required change:** Transition approval handling to the GovernanceRequest system as taught by the `team-governance` skill. AMAMA skill descriptions should instruct agents to check pending GovernanceRequests and approve/reject them using the `team-governance` skill patterns (which include governance password authentication). Keep AMP messaging (via `agent-messaging` skill) as a notification layer for real-time alerts, but GovernanceRequest is the source of truth.

### CONFLICT-5: COS Assignment Not Integrated (MEDIUM)

**Problem:** The PR introduces `POST /api/teams/{id}/chief-of-staff` to formally assign COS (requires governance password, auto-closes team). AMAMA creates ECOS agents but never calls this endpoint.

**Current plugin behavior:** ECOS exists as a tmux session with the COS plugin loaded, but is not formally assigned as COS in AI Maestro's team system.

**Required change:** After creating ECOS and confirming it's running, AMAMA should guide the user to assign COS using the `team-governance` skill's COS assignment pattern. The governance password is user-controlled — AMAMA cannot store it but can prompt the user to provide it or use the dashboard for assignment.

---

## Summary Table

| Category | Count | Summary |
|----------|-------|---------|
| CRITICAL | 3 | Version reference (informational only), plugin.json missing commands/hooks, unbundled external skill |
| HIGH | 5 | COS endpoint inconsistency, no marketplace registration, no migration path, stub inbox check, wrong session start memory path |
| MEDIUM | 5 | No .agent.toml, no skill-suggester, status model mismatch, aggressive polling, legacy command |
| LOW | 5 | Non-standard field, hooks structure, bundled dev scripts, silent CozoDB fallback, RULE 14 reliance |

**Overall Assessment**: The plugin represents a substantial and well-designed v2 architecture that is not yet production-ready for the AI Maestro ecosystem as deployed here. The most critical blocker is the incomplete plugin.json manifest which will silently prevent commands and hooks from being registered. Once these structural issues are resolved, the governance model is well-implemented and compatible with AI Maestro's 3-role system.

