# Repository Audit: ai-maestro-chief-of-staff
Generated: 2026-02-27

## Overview

**Plugin Name**: `ai-maestro-chief-of-staff`
**Version**: 2.0.0
**Minimum AI Maestro**: 0.26.0 (informational only — the Claude Code plugin spec has no version pinning mechanism)
**Repository**: https://github.com/Emasoft/ai-maestro-chief-of-staff
**License**: MIT
**Author**: Emasoft (713559+Emasoft@users.noreply.github.com)
**Distribution**: Independent GitHub repo (NOT part of emasoft-plugins marketplace)

The AMCOS (AI Maestro Chief of Staff) plugin is a **per-team agent lifecycle manager**. One instance exists per team. It handles staff planning, agent create/terminate/hibernate/wake, approval workflows, failure recovery, plugin/skill configuration, and performance reporting. It coordinates with the MANAGER (AMAMA), Orchestrator, Architect, and Integrator agents.

**IMPORTANT**: This plugin is an **independent** AI Maestro plugin distributed via its own GitHub repo. It is NOT related to any `emasoft-chief-of-staff` plugin in the emasoft-plugins marketplace. However, the codebase contains **massive legacy naming contamination** (548 references to EAMA/EOA/EAA/EIA/emasoft prefixes) that needs to be cleaned up — see Finding C3.

---

## 1. Plugin Structure

### Compliance with Claude Code Plugin Spec

**`.claude-plugin/plugin.json`**: PRESENT and valid.

```json
{
  "name": "ai-maestro-chief-of-staff",
  "version": "2.0.0",
  "agents": ["./agents/amcos-chief-of-staff-main-agent.md", ...],
  "skills": "./skills/"
}
```

**Observations**:
- Uses `skills: "./skills/"` (directory reference) instead of listing individual skills — this is a bulk skill registration pattern.
- Contains `agents` array listing all 10 agent .md files explicitly.
- No `commands` array in plugin.json — commands directory exists (23 commands) but they are NOT declared in the manifest. This is a potential structural issue: commands may not be auto-loaded if the spec requires explicit listing.
- No `hooks` key in plugin.json — hooks are defined in `hooks/hooks.json` which is the correct location per spec (hooks get their own file, not declared in plugin.json).
- No `mcp` key — no MCP server declarations.

**Directory Layout**:

```
.claude-plugin/plugin.json    ✓ Present
agents/                       ✓ 10 agent .md files
commands/                     ✓ 23 slash command .md files
skills/                       ✓ 14 skill directories, each with SKILL.md + references/
hooks/hooks.json              ✓ 5 hooks defined
scripts/                      ✓ 30+ Python scripts
shared/                       ✓ Shared templates (handoffs, messages, onboarding)
docs/                         ✓ 4 documentation files
git-hooks/pre-push            ✓ Git hook script
.github/workflows/            ✓ 2 CI workflows (validate.yml, release.yml)
```

**Agents (10)**:
- `amcos-chief-of-staff-main-agent.md` — main COS coordinator
- `amcos-staff-planner.md`
- `amcos-lifecycle-manager.md`
- `amcos-team-coordinator.md`
- `amcos-plugin-configurator.md`
- `amcos-skill-validator.md`
- `amcos-resource-monitor.md`
- `amcos-performance-reporter.md`
- `amcos-recovery-coordinator.md`
- `amcos-approval-coordinator.md`

**Skills (14)**:
- `amcos-agent-lifecycle`, `amcos-failure-recovery`, `amcos-label-taxonomy`
- `amcos-notification-protocols`, `amcos-onboarding`, `amcos-performance-tracking`
- `amcos-permission-management`, `amcos-plugin-management`, `amcos-resource-monitoring`
- `amcos-session-memory-library`, `amcos-skill-management`, `amcos-staff-planning`
- `amcos-team-coordination`, `amcos-transfer-management`

**Hooks (5)**:
- `SessionStart` → `amcos_session_start.py`
- `SessionEnd` → `amcos_session_end.py`
- `UserPromptSubmit` → `amcos_resource_check.py` (timeout: 5s)
- `UserPromptSubmit` → `amcos_heartbeat_check.py` (timeout: 5s)
- `Stop` → `amcos_stop_check.py`

**ISSUE**: All hooks use `python3` invocation (`python3 ${CLAUDE_PLUGIN_ROOT}/scripts/...`). On macOS, `python3` may point to system Python, not a project venv. Scripts using `uv run` or a venv path would be more reliable.

---

## 2. AI Maestro Compatibility

### API References

**VERIFIED**: Extensive use of `$AIMAESTRO_API` (default `http://localhost:23000`).

REST API endpoints referenced throughout:
- `GET /api/teams` — team membership validation
- `POST /api/teams` — create team
- `GET /api/teams/{id}/agents` — list team agents
- `PATCH /api/teams/{id}` — update team
- `POST /api/agents/register` — register agent
- `POST /api/agents/{id}/hibernate` — hibernate
- `POST /api/agents/{id}/wake` — wake
- `DELETE /api/agents/{id}` — terminate
- `GET /api/agents/{id}/health` — health check
- `POST /api/v1/governance/requests` — submit GovernanceRequest
- `GET /api/v1/governance/requests/{id}` — poll state

**CRITICAL GAP**: Several API endpoints referenced by AMCOS (`/api/agents/register`, `/api/agents/{id}/hibernate`, `/api/agents/{id}/wake`, `/api/v1/governance/requests`) do NOT currently exist in the AI Maestro codebase. The plugin assumes an API surface that is not yet implemented. Note: the "minimum AI Maestro 0.26.0" stated in the README is informational only — the Claude Code plugin specification has no mechanism for plugins to declare or enforce platform version requirements.

### AMP Messaging

**VERIFIED**: Exclusive use of AMP protocol for all inter-agent messaging.

Key patterns:
- `amp-send.sh` for all outbound messages
- `amp-inbox.sh` / `amp-read.sh` / `amp-reply.sh` for inbox management
- All messages are Ed25519-signed automatically
- `amp-init.sh --auto` required once per agent session
- `amp-send.sh --to <agent>` uses AI Maestro address resolution (session name → UUID)

The notification-protocols skill explicitly forbids direct HTTP API calls for messaging: "Send: Use `amp-send.sh` for all outbound messages. Never call the HTTP API directly."

### Agent Registry

**VERIFIED**: Uses AI Maestro REST API exclusively for team registry. The doc `TEAM_REGISTRY_SPECIFICATION.md` explicitly states: "The file-based `.ai-maestro/team-registry.json` approach is superseded. Team registries are now managed exclusively via the AI Maestro REST API."

Python script `amcos_team_registry.py` exists for legacy local operations but carries a `TODO: Migrate to AI Maestro REST API` comment — migration is in progress.

### Governance & Teams

**VERIFIED**: References governance rules R6.1–R6.7 (message routing), GovernanceRequest API, and dual-manager approval. Closed team concept is enforced via messaging rules.

### tmux Sessions

**VERIFIED**: Deep tmux integration. Agents run as separate Claude Code instances in dedicated tmux sessions. AMCOS uses `aimaestro-agent.sh` CLI (from the AI Maestro distribution) to create/terminate sessions. Session naming follows format `<role-prefix>-<project>[-number]`.

### CLI Invocation

**VERIFIED**: The README specifies:
```bash
claude --agent amcos-chief-of-staff-main-agent
```
This is the correct per-agent injection pattern (not `--agent maestro-chief-of-staff-agent`). The `--agent` flag value matches the `name:` field in `agents/amcos-chief-of-staff-main-agent.md`.

---

## 3. Governance Compliance

### Team Type (Open/Closed)

**PARTIALLY VERIFIED**: The plugin enforces "closed team" messaging rules (R6.1–R6.7) throughout. AMCOS manages ONE closed team. Cross-team messaging is blocked and requires GovernanceRequests. However, there is no explicit `teamType: open|closed` field check in the code — the restriction is behavioral (routing logic) rather than a field-level check against a team object.

**GAP**: The plugin does not read or validate a `teamType` field from the AI Maestro team registry. It assumes all teams it manages are "closed" by design. If the AI Maestro API adds an open/closed field, AMCOS would need an explicit check.

### Manager Role / chiefOfStaffId

**PARTIALLY VERIFIED**: The governance hierarchy (EAMA as manager, AMCOS as chief-of-staff) is well-defined. The GovernanceRequest payload includes `sourceCOS` and `sourceManager` fields. However, the plugin does not verify `chiefOfStaffId` via an API call to `GET /api/teams/{id}` — it assumes the running AMCOS instance IS the authorized COS for its team. No check like `if team.chiefOfStaffId != mySessionId { abort }` was found.

### Message Routing for Closed Teams

**VERIFIED**: Implemented via the `amcos-notification-protocols` skill.

The COS acts as a message relay:
- `Team member → MANAGER`: COS intercepts, reviews, forwards
- `Team member → external`: COS checks reachability (R6.1-R6.7), forwards if allowed
- `External → team member`: Must go through COS or MANAGER

Enforcement: Before every `amp-send.sh` call, validate recipient against `GET /api/teams`.

### Governance Password

**VERIFIED**: Implemented in `amcos-permission-management`. Critical operations (`risk_level=critical`) require a manager-provided governance password included in the GovernanceRequest payload. The API validates the password before state transition. Post-submission, the password is not logged or stored.

### GovernanceRequest State Machine

**VERIFIED**: Full state machine implemented:
```
pending → remote-approved/local-approved → dual-approved → executed/rejected
```
- Local operations: `sourceManager` only needed
- Cross-team: dual-manager approval required
- Rate limiting: 10 requests/minute per COS, exponential backoff on 429
- Audit trail: written to `docs_dev/audit/amcos-governance-{date}.yaml`
- Offline degradation mode: operates with YAML-only when API unreachable

---

## 4. Team Management Capabilities

### Agent Lifecycle Operations

**VERIFIED**: Full lifecycle management:
- **Spawn**: Copy plugin from AI Maestro distribution cache → create tmux session → launch Claude Code with `--plugin-dir` and `--agent` flags → register in team registry
- **Hibernate**: Detach tmux session, mark status `hibernated` in registry, preserve state at `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<name>/context.json`
- **Wake**: Reattach tmux session with `--continue`, restore state, update registry to `running`
- **Terminate**: Kill tmux session, unregister from registry, free resources

### Agent vs Sub-Agent Distinction

**VERIFIED**: The lifecycle skill explicitly defines:
- **Agent**: A Claude Code instance running as a separate process in its own tmux session — created via `ai-maestro-agents-management` skill
- **Sub-agent**: An agent spawned INSIDE the same Claude Code instance via the Task tool

This distinction is important: Task tool spawning does NOT create a real remote agent.

### Team Composition

**VERIFIED**: AMCOS manages team composition via the AI Maestro REST API. Validated composition rules:
- Exactly 1 orchestrator per team
- Exactly 1 architect per team
- At least 1 implementer per team
- Manager is organization-wide (not per-team)
- AMCOS itself is per-team (1 per team)

### Agent Configuration (Skills, Plugins, MCP)

**VERIFIED**: Plugin configurator supports:
- Install/remove/enable/disable plugins per agent
- `--scope local` (`.claude/settings.local.json`) or `--scope project` (`.claude/settings.json`)
- Remote config via GovernanceRequest (different host or team)
- `ConfigOperationType` values: `add-skill`, `remove-skill`, `add-plugin`, `remove-plugin`, `update-hooks`, `update-mcp`, `update-model`, `bulk-config`

MCP server configuration is supported via the `update-mcp` ConfigOperationType — AMCOS can update MCP config on remote agents via GovernanceRequest.

**Plugin mutual exclusivity enforced**: Each agent can load only ONE role plugin. Loading multiple role plugins causes hook/skill/command conflicts.

### Resource Limits

Default limits (configurable):
- Max 5 concurrent agents
- Max 2GB memory per agent
- 100 API req/min rate limit
- 30-minute idle timeout triggers hibernation

---

## 5. Skill Suggester Integration

### Perfect Skill Suggester (PSS) Reference

**VERIFIED**: Deep PSS integration throughout the plugin.

Key references:
- `amcos-skill-management` skill has a dedicated PSS reindexing procedure
- `~/.claude/skills-index.json` — the PSS index file
- `/pss-reindex-skills` — slash command to trigger reindex
- `scripts/pss_reindex_skills.py` — Python script for programmatic reindexing
- `references/pss-integration.md` — detailed PSS optimization guide

PSS integration features:
- Skill description optimization ("Use when..." pattern)
- Keyword embedding in headings
- Co-usage relationship hints
- Category mappings (16 categories: orchestration, planning, development, testing, etc.)
- Weighted scoring: primary keyword (1.0), secondary keyword (0.5), category (0.3), co-usage (0.2)

### PSS Invocation Workflow

1. AMCOS can invoke `/pss-suggest <query>` to discover skills for an agent
2. AMCOS can trigger `/pss-reindex-skills` after adding new skills to update the index
3. PSS uses 2-pass generation: Pass 1 extracts factual data, Pass 2 extracts AI co-usage relationships
4. `skills-ref` CLI tool used for validation and XML generation

**GAP**: No explicit "suggest optimal skill set for a project" workflow was found. PSS is used for skill *discovery* but there is no `/amcos-suggest-agent-config` command that takes a project description and returns a recommended skill/plugin combination for an agent. The skill management is reactive (validate, reindex, configure) rather than proactive (suggest optimal config for a project).

### Dynamic Agent Reconfiguration

**VERIFIED**: The plugin configurator agent supports dynamic reconfiguration of running agents:
- Install skills/plugins on remote agents via GovernanceRequest
- Send notification to agent before config changes
- Trigger agent restart after plugin changes
- Verify post-installation state

---

## 6. .agent.toml Workflow

### Does AMCOS support .agent.toml?

**NOT FOUND**: No references to `.agent.toml` files anywhere in the repository (verified via grep for `agent.toml`, `.agent.toml`, `toml` — only `pyproject.toml` and `plugin.json` toml-related references found).

**AMCOS uses a different configuration model**:
- Agent configuration is defined by the `--plugin-dir` and `--agent` flags at spawn time
- Plugin configuration is managed via `claude plugin install/uninstall` CLI commands
- Settings stored in `.claude/settings.local.json` (local scope) or `.claude/settings.json` (project scope)
- No `.agent.toml` profile concept exists in this plugin

### .agent.toml Workflow Verdict

The full lifecycle of `profile → suggest → apply` via `.agent.toml` is:
- **NOT IMPLEMENTED** in this plugin
- **NOT referenced** in any documentation
- The plugin uses a different paradigm: plugin-per-role, spawned with explicit CLI flags

If the AI Maestro system were to adopt `.agent.toml` as an agent profile format, AMCOS would need to be updated to:
1. Read an agent's existing `.agent.toml` profile
2. Pass it to PSS for optimal skill/plugin suggestions
3. Apply the new configuration atomically

---

## 7. Naming and Marketplace Issues

### Independence from emasoft-plugins Marketplace

**IMPORTANT**: This plugin (`ai-maestro-chief-of-staff`) is an **independent** AI Maestro plugin. It is NOT related to the `emasoft-chief-of-staff` plugin in the emasoft-plugins marketplace. They are separate projects with separate codebases. Any references to emasoft-* naming inside this repo are bugs that need to be fixed.

### CRITICAL: Emasoft Naming Contamination (548 References)

**Emasoft naming contamination check**: **HEAVILY CONTAMINATED** — grep found **548 references** to legacy emasoft naming across the entire repo. This is a CRITICAL issue — the plugin was forked/adapted from the emasoft version but legacy naming was never fully cleaned up.

**Contaminated naming patterns found:**

| Pattern | Count | Files |
|---------|-------|-------|
| `EAMA` (emasoft assistant manager) | ~80+ | `agents/amcos-chief-of-staff-main-agent.md`, `docs/FULL_PROJECT_WORKFLOW.md`, `docs/ROLE_BOUNDARIES.md`, multiple skills |
| `EOA` (emasoft orchestrator agent) | ~60+ | Same files — should be "Orchestrator" or project-neutral |
| `EAA` (emasoft architect agent) | ~50+ | Same files — should be "Architect" or project-neutral |
| `EIA` (emasoft integrator agent) | ~40+ | Same files — should be "Integrator" or project-neutral |
| `EPA` (emasoft performance agent) | ~10+ | Performance reporting docs |
| `emasoft` (direct references) | ~20+ | `shared/handoff_template.md`, scripts, agent personas |

**Most affected files (by reference count):**
1. `docs/FULL_PROJECT_WORKFLOW.md` — 84 references
2. `docs/ROLE_BOUNDARIES.md` — 45 references
3. `agents/amcos-chief-of-staff-main-agent.md` — 15 references
4. `shared/handoff_template.md` — 3 references
5. `agents/amcos-recovery-coordinator.md` — 1 reference
6. `scripts/*.py` — 6 references across various scripts
7. `commands/*.md` — scattered references

**Required fix**: All `EAMA` references should be replaced with `AMAMA` (AI Maestro Assistant Manager Agent). `EOA`, `EAA`, `EIA`, `EPA` should be replaced with their AI Maestro equivalents or made role-generic (e.g., "Orchestrator", "Architect", "Integrator"). All `emasoft` references should be removed entirely.

### Marketplace Attribution

This plugin does NOT belong to the emasoft-plugins marketplace. It needs its own marketplace registration (an `ai-maestro-plugins` marketplace or direct GitHub repo installation) before it can be installed via `claude plugin install`. The plugin.json does not specify a marketplace source. Any documentation referencing emasoft-plugins marketplace installation should be corrected.

---

## 8. Installation Architecture

### Installation Method

```bash
# Normal use (bundled with AI Maestro v0.26.0+)
claude --agent amcos-chief-of-staff-main-agent

# Development only (local plugin dir)
claude --plugin-dir ./ai-maestro-chief-of-staff
```

### Per-Agent Assignment

**VERIFIED**: The plugin is designed for per-agent assignment. Each AMCOS instance is a separate Claude Code session running in its own tmux session. AMCOS is created by the MANAGER only (not self-spawning). The `--plugin-dir` flag loads the plugin into that specific agent session.

### Scope Qualifier

The plugin README states it is "Bundled with AI Maestro v0.26.0+." There is no `--scope local` installation concept here — the plugin is distributed as part of the AI Maestro distribution cache at `~/.claude/plugins/cache/ai-maestro/ai-maestro-chief-of-staff/<version>/` and copied to each agent's local `.claude/plugins/` directory when spawned.

### CI/CD

- `validate.yml`: Runs `validate_plugin.py --verbose` on push/PR (strict mode, all exit codes block)
- `release.yml`: Release workflow (not fully read but present)
- Git pre-push hook: `amcos_pre_push_hook.py` runs manifest validation, hook validation, lint, Unicode compliance

---

## 9. Agent Persona Analysis

### Main Agent: amcos-chief-of-staff-main-agent.md

**Model**: `opus` (Claude Opus — most capable, appropriate for coordination tasks)
**Team**: `""` (blank — populated at runtime per team assignment)

**Chief-of-Staff Role Definition** — VERIFIED:
- Team-scoped: manages ONE closed team
- Reports to MANAGER (referred to as "EAMA" in the source — **legacy emasoft naming, should be AMAMA**)
- Coordinates with "EOA", "EAA", "EIA" (**legacy emasoft naming, should be Orchestrator/Architect/Integrator**)
- 3-role governance: manager / chief-of-staff / member

**Message Routing for Closed Teams** — VERIFIED:
- Rules R6.1–R6.7 defined in agent frontmatter
- Before sending any message: `GET /api/teams` to verify team membership
- Cross-team messages require GovernanceRequest

**Agent Lifecycle Management** — VERIFIED:
- Full spawn/terminate/hibernate/wake lifecycle with governance approval
- Delegates to `amcos-lifecycle-manager` sub-agent

**.agent.toml Awareness** — NOT PRESENT: No mention of `.agent.toml` in agent persona.

**Project-based Agent Reconfiguration** — PARTIALLY PRESENT:
- AMCOS can dynamically reconfigure agents via `ConfigOperationType`
- No explicit "read project requirements → suggest optimal config" flow

### Persona Strengths
1. Clear team-scoping with explicit boundary definitions
2. Comprehensive sub-agent routing table (9 specialized sub-agents)
3. Detailed output format specifications (operations, status reports, escalations)
4. 10+ skills covering all aspects of agent lifecycle management
5. Governance password enforcement for critical operations
6. AMP-only messaging with Ed25519 signing

### Persona Gaps
1. No `.agent.toml` profile concept
2. No PSS-driven proactive "suggest optimal config" workflow
3. The `team: ""` field is blank in the agent definition — requires runtime population

---

## 10. Findings Summary

### CRITICAL Findings

| # | Finding | Detail |
|---|---------|--------|
| C1 | API endpoints not yet implemented in AI Maestro | `/api/agents/register`, `/api/agents/{id}/hibernate/wake`, `/api/v1/governance/requests` — referenced throughout but not yet in the AI Maestro codebase at current version |
| C2 | `commands/` directory not declared in plugin.json | 23 commands exist but plugin.json has no `commands` array. Commands may not auto-load depending on Claude Code plugin spec version. |
| C3 | **MASSIVE emasoft naming contamination (548 references)** | The codebase contains 548 references to legacy emasoft naming (EAMA, EOA, EAA, EIA, EPA, emasoft) across agents, docs, scripts, commands, and shared templates. The plugin claims to be independent from the emasoft-plugins version but the naming has never been cleaned up. This creates confusion about plugin identity and affiliations. See Section 7 for full breakdown. |

### HIGH Findings

| # | Finding | Detail |
|---|---------|--------|
| H1 | No `.agent.toml` support | The full profile→suggest→apply workflow via `.agent.toml` is absent. If AI Maestro adopts `.agent.toml` as a standard, AMCOS needs updating. |
| H2 | `teamType` open/closed not validated via API | Behavioral enforcement only — no `GET /api/teams/{id}` check for `teamType` field. |
| H3 | `chiefOfStaffId` not verified at startup | AMCOS does not check if it is the authorized COS for its assigned team via a registry lookup. |
| H4 | Python hooks use `python3` not `uv run` | `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/...` may use system Python on macOS. Should use `uv run --project ${CLAUDE_PLUGIN_ROOT}` or ensure venv activation. |

### MEDIUM Findings

| # | Finding | Detail |
|---|---------|--------|
| M1 | No proactive PSS "suggest optimal config" workflow | PSS integration is present but reactive only. No command to suggest an optimal skill/plugin set for a given project description. |
| M2 | `amcos_team_registry.py` still file-based | Has `TODO: Migrate to AI Maestro REST API` comment. Incomplete migration. |
| M3 | `team: ""` in agent frontmatter | The `amcos-chief-of-staff-main-agent.md` has `team: ""` — requires documentation on how this is populated at runtime. |
| M4 | Agent `--agent` flag mapping inconsistency | `AGENT_OPERATIONS.md` maps Orchestrator to `amcos-orchestrator-main-agent` but `amcos-agent-lifecycle/SKILL.md` maps it to `eoa-orchestrator-main-agent`. Naming conflict between documents. |
| M5 | Plugin not declared in plugin.json `commands` | If Claude Code requires explicit command declarations, this will silently fail. |

### LOW Findings

| # | Finding | Detail |
|---|---------|--------|
| L1 | `amcos-session-memory-library` skill extremely large | 80+ reference files with deep session memory documentation. Likely inflates agent context significantly. |
| L2 | Governance audit trail location hardcoded | `docs_dev/audit/amcos-governance-{date}.yaml` — this folder is gitignored per workspace rules. |
| L3 | `hooks.json` uses `python3` not absolute path | Should be `uv run python ...` or include venv activation for reliability. |
| L4 | No tests for Python scripts | No test files found in `tests/` directory (directory not present). Validation scripts exist but no unit tests. |
| L5 | `perfect-skill-suggester` PSS commands reference `~/.claude/skills-index.json` | This path assumes single-user macOS installation. May break in multi-user or Docker environments. |

---

## 12. Required Plugin Changes

This section provides detailed change requirements for the AMCOS plugin to work correctly with the AI Maestro governance system. Each change specifies the file to modify, what to add or change, why it is needed, and which protocol flow it supports.

### Summary Table

| ID | Severity | Change | File(s) | Flow(s) |
|----|----------|--------|---------|---------|
| RC-1 | CRITICAL | Add commands to plugin.json | plugin.json | ALL |
| RC-2 | CRITICAL | Verify COS authorization on startup | amcos_session_start.py | ALL |
| RC-3 | CRITICAL | Fix 548 emasoft naming references | Multiple (see Sec 7) | ALL |
| RC-4 | HIGH | Fix agent flag naming inconsistency | AGENT_OPERATIONS.md, lifecycle SKILL.md | Flows 6,9 |
| RC-5 | HIGH | Add teamType validation | amcos_session_start.py | Flows 2,3 |
| RC-6 | HIGH | Fix transfer model (4-party -> 2-party) | amcos-transfer-management/SKILL.md | Flows 4,7,8 |
| RC-7 | MEDIUM | Complete REST API migration | amcos_team_registry.py | ALL |
| RC-8 | MEDIUM | Add proactive PSS config workflow | amcos-skill-management/SKILL.md | Flows 6,9 |
| RC-9 | MEDIUM | Fix Python hook invocation | hooks/hooks.json | ALL |
| RC-10 | MEDIUM | Implement .agent.toml profile support | New skill + command | Flow 6 |
| RC-11 | LOW | Update authority matrix docs | ROLE_BOUNDARIES.md | All |

---

### RC-1: Fix plugin.json -- Add Missing `commands` Field (CRITICAL)

**File:** `.claude-plugin/plugin.json`
**Current:** Only `agents` and `skills` declared. 23 commands in `commands/` directory are NOT listed.
**Required:** Add `commands` array listing all 23 command files:

```json
{
  "name": "ai-maestro-chief-of-staff",
  "version": "2.0.0",
  "agents": ["./agents/amcos-chief-of-staff-main-agent.md", "..."],
  "skills": "./skills/",
  "commands": [
    "./commands/amcos-agent-status.md",
    "./commands/amcos-approve-request.md",
    "... (all 23 commands)"
  ]
}
```

**Why:** Without explicit declaration, Claude Code may not auto-discover commands from the `commands/` directory. The 23 slash commands (including critical ones like `/amcos-approve-request`, `/amcos-create-agent`, `/amcos-transfer-agent`) become invisible.
**Flows affected:** ALL flows -- commands are the primary user interface for COS operations.

---

### RC-2: Implement `chiefOfStaffId` Verification on Startup (CRITICAL)

**File:** `scripts/amcos_session_start.py`
**Current:** Session starts without verifying that this AMCOS instance is the authorized COS for its team.
**Required:** Add a startup check:

```python
import os, json, urllib.request

def verify_cos_authorization():
    """Verify this AMCOS instance is the authorized COS for its assigned team."""
    api = os.environ.get('AIMAESTRO_API', 'http://localhost:23000')
    session_name = os.environ.get('SESSION_NAME', '')

    # 1. Get my agent ID from registry
    resp = urllib.request.urlopen(f'{api}/api/agents?name={session_name}')
    agents = json.loads(resp.read())
    my_agent = next((a for a in agents.get('agents', []) if a.get('name') == session_name), None)
    if not my_agent:
        print(f'WARNING: Agent {session_name} not found in registry')
        return False

    my_id = my_agent['id']

    # 2. Find my team assignment
    resp = urllib.request.urlopen(f'{api}/api/teams')
    teams = json.loads(resp.read())
    my_team = None
    for team in teams.get('teams', []):
        if my_id in (team.get('agentIds') or []):
            my_team = team
            break

    if not my_team:
        print(f'WARNING: Agent {my_id} not assigned to any team')
        return False

    # 3. Verify I am the COS of this team
    if my_team.get('chiefOfStaffId') != my_id:
        print(f'ERROR: Agent {my_id} is NOT the COS of team {my_team["name"]}. '
              f'COS is {my_team.get("chiefOfStaffId")}')
        return False

    print(f'Verified: COS of team "{my_team["name"]}" (type: {my_team.get("type", "open")})')
    return True
```

**Why:** Without this check, a rogue or misconfigured AMCOS instance could operate on a team it does not own. The server's `checkTeamAccess()` catches unauthorized mutations, but the agent does not know it is unauthorized until it gets 403s. Early detection prevents wasted operations.
**Flows affected:** ALL flows -- authorization baseline.

---

### RC-3: Fix emasoft Naming Contamination -- 548 References (CRITICAL)

**Files:** Multiple (see Section 7 of this audit report for full breakdown)
**Required replacements:**

| Find | Replace With | Count |
|------|-------------|-------|
| `EAMA` | `AMAMA` (AI Maestro Assistant Manager Agent) | ~80+ |
| `EOA` | `Orchestrator` or `AMOA` (AI Maestro Orchestrator Agent) | ~60+ |
| `EAA` | `Architect` or `AMAA` (AI Maestro Architect Agent) | ~50+ |
| `EIA` | `Integrator` or `AMIA` (AI Maestro Integrator Agent) | ~40+ |
| `EPA` | `Performance Agent` | ~10+ |
| `emasoft` | Remove or replace with `AI Maestro` | ~20+ |

**Most affected files (by count):**
1. `docs/FULL_PROJECT_WORKFLOW.md` -- 84 references
2. `docs/ROLE_BOUNDARIES.md` -- 45 references
3. `agents/amcos-chief-of-staff-main-agent.md` -- 15 references
4. `shared/handoff_template.md` -- 3 references
5. Various scripts and commands -- scattered

**Why:** The naming inconsistency creates identity confusion. The LLM may use `EAMA` instead of `AMAMA` in AMP messages, causing delivery failures (AMP resolves by session name, and there is no agent named `EAMA`).
**Flows affected:** ALL flows -- agent identity and AMP addressing.

---

### RC-4: Fix Agent Flag Naming Inconsistency (HIGH)

**Files:**
- `docs/AGENT_OPERATIONS.md` -- maps Orchestrator to `amcos-orchestrator-main-agent`
- `skills/amcos-agent-lifecycle/SKILL.md` -- maps Orchestrator to `eoa-orchestrator-main-agent`

**Required:** Standardize ALL role-to-agent-flag mappings across all files:

| Role | --agent Flag | Plugin Name |
|------|-------------|-------------|
| orchestrator | `amoa-orchestrator-main-agent` | `ai-maestro-orchestrator-agent` |
| architect | `amaa-architect-main-agent` | `ai-maestro-architect-agent` |
| integrator | `amia-integrator-main-agent` | `ai-maestro-integrator-agent` |

The legacy `eoa-*`, `eaa-*`, `eia-*` names from the emasoft era must be replaced everywhere. And the `amcos-orchestrator-main-agent` variant in AGENT_OPERATIONS.md is also wrong -- that implies the orchestrator is a sub-agent of AMCOS, when it is actually a separate plugin.

**Why:** When AMCOS spawns an agent with `claude --agent eoa-orchestrator-main-agent`, the agent will not load if the plugin uses `amoa-orchestrator-main-agent` as its agent name. The spawn fails silently.
**Flows affected:** Flow 6 (PSS agent creation), Flow 9 (COS creates agents).

---

### RC-5: Add `teamType` Validation via API (HIGH)

**File:** `scripts/amcos_session_start.py` or `skills/amcos-team-coordination/SKILL.md`
**Current:** The plugin assumes all teams it manages are "closed" by behavioral convention, but never checks the `type` field.
**Required:** After verifying COS authorization (RC-2), also verify the team type:

```python
if my_team.get('type') != 'closed':
    print(f'WARNING: Team "{my_team["name"]}" is type "{my_team.get("type")}", '
          f'expected "closed". COS assignment auto-closes the team -- '
          f'this may indicate an API inconsistency.')
```

**Why:** The AI Maestro server auto-sets `type: "closed"` when a COS is assigned (Flow 2, Rule R1.5). If the team is somehow still "open" despite having a COS, it indicates a data inconsistency that should be flagged.
**Flows affected:** Flow 2 (COS assignment), Flow 3 (team access control).

---

### RC-6: Fix Transfer Management -- 4-Party vs 2-Party Model (HIGH)

**File:** `skills/amcos-transfer-management/SKILL.md`
**Current:** The skill defines a 4-party transfer model requiring: source-cos, source-manager, target-cos, target-manager approvals.
**Actual server implementation:** Only source team's COS OR MANAGER approval is required (2-party). The server's `resolveTransferReq()` checks: `fromTeam.chiefOfStaffId === resolvedBy || isManager(resolvedBy)`.

**Required:** Update the transfer management skill to match the actual server behavior:
- Same-host transfer: Source team's COS or MANAGER approves -- done.
- Cross-host transfer: Dual-manager approval via GovernanceRequest state machine (pending -> local-approved -> remote-approved -> dual-approved -> executed).
- Remove the 4-party approval requirement -- it is more restrictive than the server and will cause the COS to wait for approvals that will never come.

**Why:** The skill instructs AMCOS to collect 4 approvals, but the server only requires 1-2. AMCOS will get stuck waiting for non-required approvals.
**Flows affected:** Flow 4 (reassign from closed team), Flow 7 (transfer same host), Flow 8 (transfer cross-host).

---

### RC-7: Complete REST API Migration for `amcos_team_registry.py` (MEDIUM)

**File:** `scripts/amcos_team_registry.py`
**Current:** Has `TODO: Migrate to AI Maestro REST API` comment. Uses local file-based JSON.
**Required:** Replace all file-based operations with REST API calls:

| Operation | File-based (current) | REST API (target) |
|-----------|---------------------|-------------------|
| List teams | `json.load(open('teams.json'))` | `GET /api/teams` |
| Get team | Direct JSON read | `GET /api/teams/{id}` |
| Update team | Direct JSON write | `PUT /api/teams/{id}` |
| List agents | Direct JSON read | `GET /api/sessions` or `GET /api/agents` |

Include proper auth headers (`Authorization: Bearer <key>`, `X-Agent-Id: <cos-uuid>`).

**Why:** File-based operations bypass governance checks (team ACL, COS verification, type enforcement). The REST API enforces all governance rules. Using file-based access is a security bypass.
**Flows affected:** ALL flows -- data access layer.

---

### RC-8: Add PSS Integration for Proactive Config Suggestion (MEDIUM)

**File:** `skills/amcos-skill-management/SKILL.md`
**Current:** PSS integration is reactive (reindex, validate, configure). No proactive "suggest optimal config" workflow.
**Required:** Add a new workflow section:

```markdown
## Proactive Agent Configuration via PSS

When creating a new agent (Flow 9), use PSS to determine optimal configuration:

1. Write the agent's purpose and role description to a temp `.md` file
2. If design requirements exist, include them with `--requirements`
3. Invoke: `/pss-setup-agent /tmp/agent-desc.md --requirements /path/to/requirements.md`
4. Read the generated `.agent.toml` from `team/agents-cfg/<name>.agent.toml`
5. Parse the TOML to extract:
   - `skills.primary` -> install as primary skills
   - `skills.secondary` -> install as secondary skills
   - `mcp.recommended` -> configure MCP servers
   - `lsp.recommended` -> configure LSP servers
6. Apply the configuration to the newly spawned agent via:
   - `claude plugin install <skill-name> --scope local` for each skill
   - Settings update for MCP/LSP configuration
```

**Why:** Without this workflow, COS creates agents with hardcoded generic configurations, ignoring the project-specific requirements that MANAGER sent.
**Flows affected:** Flow 6 (PSS agent creation), Flow 9 (COS design requirements).

---

### RC-9: Fix Python Hook Invocation (MEDIUM)

**File:** `hooks/hooks.json`
**Current:** All 5 hooks use `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/...`
**Required:** Change to `uv run --project ${CLAUDE_PLUGIN_ROOT} python ...` or ensure a portable invocation:

```json
{
  "type": "command",
  "command": "python3 \"${CLAUDE_PLUGIN_ROOT}/scripts/amcos_session_start.py\"",
  "..."
}
```

**Better option (if uv is available):**
```json
{
  "type": "command",
  "command": "uv run --project \"${CLAUDE_PLUGIN_ROOT}\" python \"${CLAUDE_PLUGIN_ROOT}/scripts/amcos_session_start.py\"",
  "..."
}
```

**Why:** On macOS, `python3` may point to the Xcode command-line tools Python (3.9) which lacks some modules. Using `uv run` ensures the correct interpreter and any declared dependencies are available. However, since the scripts use only stdlib, `python3` works in practice. This is a robustness improvement, not a blocker.
**Flows affected:** ALL flows -- hook execution reliability.

---

### RC-10: Implement `.agent.toml` Profile Support (MEDIUM)

**New files to create:**
- `skills/amcos-agent-profiles/SKILL.md` -- skill for reading, suggesting, and applying `.agent.toml` profiles
- `commands/amcos-apply-agent-profile.md` -- `/amcos-apply-agent-profile <path>` slash command

**Required workflow:**
1. **Read**: Parse `.agent.toml` (TOML format) to extract skills, agents, commands, rules, MCP, LSP recommendations.
2. **Suggest**: Present the profile to the user/MANAGER for review.
3. **Apply**: For each recommended element:
   - Skills: `claude plugin install <skill-name> --scope local` (on the target agent's session)
   - MCP: Update `.claude/settings.local.json` with MCP server config
   - Rules: Copy rule `.md` files to `.claude/rules/`
   - Hooks: Merge hook configs into `hooks/hooks.json`

**Why:** PSS generates `.agent.toml` files but nothing applies them. Without this capability, the `.agent.toml` is a dead artifact. AMCOS needs to bridge the gap between PSS output and agent configuration.
**Flows affected:** Flow 6 (PSS agent creation).

---

### RC-11: Add Governance Authority Documentation (LOW)

**File:** `docs/ROLE_BOUNDARIES.md`
**Required:** Update to match the verified AI Maestro authority matrix (same as the AMAMA report RC-10). Ensure the COS column accurately reflects:
- COS CANNOT create teams (403 since the new restriction).
- COS CAN create agents (needs MANAGER GovernanceRequest approval).
- COS CAN transfer agents from own team (initiates transfer request).
- COS CAN assign agents to own closed team.
- COS CANNOT approve GovernanceRequests.

---

## 14. PR Compatibility Conflicts (feature/team-governance)

> **Design principle:** Plugin skills should reference AI Maestro's global skills by name (not embed API syntax). Plugin hooks should call global scripts (not curl). See [docs/PLUGIN-ABSTRACTION-PRINCIPLE.md](../docs/PLUGIN-ABSTRACTION-PRINCIPLE.md).

The following conflicts exist between this plugin and the current PR:

### CONFLICT-1: Parallel Team Registry (CRITICAL)

**Problem:** AMCOS maintains team composition in `.emasoft/team-registry.json` (used by ecos-label-taxonomy, ecos-agent-lifecycle, ecos-team-coordination skills). The PR introduces server-side teams at `/api/teams` with ACL, types, and COS tracking.

**Current plugin behavior:**
- `ecos-label-taxonomy`: reads/writes `.emasoft/team-registry.json` via `jq` commands
- `ecos-agent-lifecycle`: updates `.emasoft/team-registry.json` on spawn/terminate
- `ecos-team-coordination`: references `.emasoft/team-registry.json` for team awareness

**Required change:** Replace ALL `.emasoft/team-registry.json` usage with AI Maestro's `team-governance` skill patterns. The skill teaches team listing, membership updates, and team detail queries with proper authentication headers. Update `ecos-team-coordination`, `ecos-label-taxonomy`, and `ecos-agent-lifecycle` skill descriptions to instruct agents to follow the `team-governance` skill for team operations.

### CONFLICT-2: No Authentication Headers (HIGH)

**Problem:** AMCOS's only API call (`curl -s "http://localhost:23000/api/sessions"` in ecos-team-coordination) sends no auth headers. The PR's team ACL requires `Authorization: Bearer <api-key>` + `X-Agent-Id` for agent-authenticated requests to closed teams.

**Current plugin behavior:** Zero auth headers. All calls treated as "web UI" → bypasses ACL.

**Required change:** The `team-governance` skill already teaches the correct authentication pattern (`Authorization: Bearer <api-key>` + `X-Agent-Id` headers). AMCOS agents gain proper auth by following the `team-governance` skill — no manual header construction needed in plugin scripts. Ensure agents have AMP registration (via `amp-init.sh --auto` from the `agent-messaging` skill) on startup so API credentials exist.

### CONFLICT-3: Agent Creation Bypasses Governance (HIGH)

**Problem:** AMCOS creates agents via `ai-maestro-agents-management` skill + tmux sessions, without creating GovernanceRequests. The PR requires `create-agent` GovernanceRequest for closed-team agents.

**Current plugin behavior:** `ecos-agent-lifecycle` skill → spawns tmux session → registers in AI Maestro. No GovernanceRequest.

**Required change:** For agent creation, continue using `aimaestro-agent.sh` (from the `ai-maestro-agents-management` skill) for the agent lifecycle. For governance approval in closed teams, the `team-governance` skill teaches the GovernanceRequest workflow. Update `ecos-agent-lifecycle` skill descriptions to instruct agents to submit a GovernanceRequest (following `team-governance` skill patterns) before spawning agents for closed teams, then use the skill's team membership pattern to register the agent in the team.

### CONFLICT-4: Approval System Mismatch (HIGH)

**Problem:** AMCOS `ecos-permission-management` skill sends AMP `approval-request` messages to manager. The PR introduces GovernanceRequest system with formal state machine and governance password.

**Current plugin behavior:** AMP-based approvals (send request message → wait for reply message). No state persistence beyond AMP inbox.

**Required change:** Replace AMP-based approval flow with the GovernanceRequest system as taught by the `team-governance` skill. Update `ecos-permission-management` skill descriptions to instruct agents to create GovernanceRequests and check their status using `team-governance` skill patterns. Keep AMP messaging (via `agent-messaging` skill) as a notification layer for real-time alerts, but GovernanceRequest is the source of truth. The governance password provides the security gate that AMP messaging lacks.

### CONFLICT-5: Transfer System Not Integrated (MEDIUM)

**Problem:** The PR introduces `POST /api/governance/transfers` for formal agent transfers between teams. AMCOS's `ecos-failure-recovery` skill handles work handoff via AMP `emergency-handoff` messages without creating transfer requests.

**Current plugin behavior:** Agent replacement = terminate old + spawn new. No formal transfer.

**Required change:** When moving an agent between teams, use the transfer workflow taught by the `team-governance` skill. The skill teaches the transfer request API with proper authentication. If source team is closed, wait for source COS approval through the governance system. Keep AMP emergency-handoff as a notification mechanism alongside the formal transfer.

### CONFLICT-6: COS Startup Verification (MEDIUM)

**Problem:** The PR assigns COS formally via `POST /api/teams/{id}/chief-of-staff`. AMCOS skills assume COS role by convention (plugin loaded = COS), not by formal assignment.

**Current plugin behavior:** No verification that AMCOS is actually the assigned COS for a team in AI Maestro.

**Required change:** On startup, AMCOS should verify its COS assignment using the `team-governance` skill's team query patterns. The skill teaches how to query teams and check COS assignment. If AMCOS is not formally assigned as COS for any team, it should warn the user and instruct them to use the dashboard or the `team-governance` skill's COS assignment workflow.

---

## 15. Recommendations

1. **Implement missing AI Maestro API endpoints** (C1): `/api/agents/register`, `/api/agents/{id}/hibernate`, `/api/agents/{id}/wake`, `/api/v1/governance/requests` are required for AMCOS to function. These must be added to the AI Maestro server before v0.26.0 release.

2. **Add `commands` to plugin.json** (C2, H5): Verify whether Claude Code auto-discovers commands from `commands/` directory or requires explicit listing in `plugin.json`. If explicit listing required, add a `commands` array.

3. **Validate `chiefOfStaffId` on startup** (H3): Add a startup check in `amcos_session_start.py` that verifies the current session is the authorized COS for its team via `GET /api/teams/{id}`.

4. **Implement `.agent.toml` profile support** (H1): If AI Maestro adopts `.agent.toml` as standard, add: `amcos-read-agent-profile`, `amcos-suggest-profile`, and `amcos-apply-profile` commands.

5. **Fix hook Python invocation** (H4): Replace `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/...` with `uv run --project ${CLAUDE_PLUGIN_ROOT} python ...` to ensure correct interpreter and dependencies.

6. **Complete REST API migration** (M2): Finish migrating `amcos_team_registry.py` from file-based JSON to REST API calls.

7. **Resolve `--agent` flag naming inconsistency** (M4): Audit all documents and ensure Orchestrator maps to exactly one `--agent` flag value consistently.

