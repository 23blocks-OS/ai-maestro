# AMAMA (Assistant Manager Agent) Plugin Analysis

**Date**: 2026-03-13
**Plugin**: `ai-maestro-assistant-manager-agent` v2.5.2
**Repo**: https://github.com/Emasoft/ai-maestro-assistant-manager-agent
**License**: MIT

---

## 1. What the Assistant Manager Does

AMAMA is the **user's sole interlocutor** -- the only agent that communicates directly with the user. It holds the `manager` governance role (singleton per host). Its responsibilities:

- **Receive user requests** -- parse intent, clarify ambiguities
- **Create teams** -- via `POST /api/teams` (open or closed)
- **Assign COS** -- assign chief-of-staff governance role to an existing agent via `PATCH /api/teams/{id}/chief-of-staff`
- **Approve/reject operations** -- both operational (from COS) and governance (GovernanceRequests with password)
- **Route work** -- send work requests to COS for specialist dispatch via AMP messaging
- **Report status** -- aggregate status from all agents and present to user
- **Manage governance** -- set governance password, handle cross-host GovernanceRequests, maintain governance state

**Key constraint**: AMAMA never implements code, never contacts specialist agents directly, never spawns agents. All specialist routing goes through COS.

---

## 2. Plugin Components Inventory

### Agents (2)
| File | Description |
|------|-------------|
| `agents/amama-assistant-manager-main-agent.md` | Main agent -- 494 lines, comprehensive persona with governance awareness, routing logic, sub-agent rules, response templates |
| `agents/amama-report-generator.md` | Sub-agent for generating formatted status reports (read-only intelligence gatherer) |

### Skills (8, with 55 reference docs total)
| Skill | Refs | Purpose |
|-------|------|---------|
| `amama-user-communication` | 6 | User interaction patterns (clarification, options, approval, completion) |
| `amama-amcos-coordination` | 16 | COS coordination: assignment, approvals, delegation, completions, ACK protocol |
| `amama-approval-workflows` | 11 | GovernanceRequest API workflows (governance track) |
| `amama-role-routing` | 4 | Intent parsing and routing to specialist agents via COS |
| `amama-github-routing` | 7 | GitHub operations routing via team labels, task sync |
| `amama-label-taxonomy` | 2 | GitHub label management (priority, status, type labels) |
| `amama-session-memory` | 5 | CozoDB-backed session memory, preferences, handoff tracking |
| `amama-status-reporting` | 4 | Status report generation via AI Maestro APIs |

### Commands (4)
| Command | Description |
|---------|-------------|
| `/amama-planning-status` | View plan phase progress |
| `/amama-orchestration-status` | View orchestration phase status |
| `/amama-approve-plan` | Approve plan, transition to orchestration, create GitHub issues |
| `/amama-respond-to-amcos` | Respond to COS approval requests (approve/deny/defer) |

### Hooks (3)
| Hook | Event | Script | Purpose |
|------|-------|--------|---------|
| `amama-memory-load` | SessionStart | `amama_session_start.py` | Load memory context |
| `amama-memory-save` | SessionEnd | `amama_session_end.py` | Save memory context |
| `amama-stop-check` | Stop | `amama_stop_check.py` | Block exit until coordination complete |

### Scripts (40 total, 14 functional + 26 validation/infrastructure)

**Functional scripts** (14):
- `amama_session_start.py`, `amama_session_end.py`, `amama_stop_check.py` -- hooks
- `amama_report_writer.py` -- shared report writer
- `amama_memory_manager.py`, `amama_memory_operations.py` -- memory CRUD
- `amama_notify_agent.py` -- send notifications to agents (uses `amp-send`)
- `amama_approve_plan.py`, `amama_planning_status.py`, `amama_orchestration_status.py` -- commands
- `amama_design_search.py`, `amama_download.py`, `amama_init_design_folders.py` -- utilities
- `smart_exec.py` -- command execution wrapper

**Validation/infrastructure** (26): CPV validators, publish, bump_version, lint, etc.

### Shared Resources (3)
- `shared/handoff_template.md` -- handoff document format with YAML front-matter
- `shared/message_templates.md` -- message type templates (task assignment, status, completion, approval, etc.)
- `shared/thresholds.py` -- governance constants (valid roles, specializations, timeouts)

### Docs (4)
- `docs/AGENT_OPERATIONS.md` -- manager operations reference
- `docs/FULL_PROJECT_WORKFLOW.md` -- 6-phase team workflow
- `docs/ROLE_BOUNDARIES.md` -- 3-role permission matrix
- `docs/TEAM_REGISTRY_SPECIFICATION.md` -- registry schema and API

---

## 3. Delegation Model

### Communication Hierarchy
```
USER <-> AMAMA (manager) <-> AMCOS (chief-of-staff) <-> Specialist Agents (member)
```

### How Delegation Works
1. AMAMA parses user intent using `amama-role-routing` skill
2. Creates handoff document with UUID in `docs_dev/handoffs/`
3. Sends work request to COS via AMP messaging
4. COS dispatches to appropriate specialist (architect/orchestrator/integrator)
5. Results flow back: specialist -> COS -> AMAMA -> user

### Autonomous Mode
AMAMA can grant COS autonomous mode for routine operations:
- Configured via `autonomy_grant` message with operation types, expiry, scope limits
- Certain operations (production deploy, security changes, data deletion) ALWAYS require AMAMA approval
- Can be revoked at any time

### Sub-Agent Delegation
AMAMA delegates only one sub-agent: `amama-report-generator` for generating formatted reports. All other work goes through the COS channel.

---

## 4. AMP Messaging Integration

### Message Types Used
| Type | Direction | Purpose |
|------|-----------|---------|
| `work_request` | AMAMA -> COS | Route user work |
| `approval_request` | COS -> AMAMA | Request approval |
| `approval_decision` | AMAMA -> COS | Respond approve/deny/defer |
| `status_query` / `status_report` | bidirectional | Status |
| `ping` / `pong` | bidirectional | Health check (30s timeout) |
| `cos-role-assignment` / `cos-role-accepted` | AMAMA <-> agent | COS assignment |
| `autonomy_grant` / `autonomy_revoke` | AMAMA -> COS | Delegation control |
| `operation_complete` | COS -> AMAMA | Completion notification |
| `user_decision` | AMAMA -> COS | Forward user decision |

### Messaging Approach
- **Skills reference `agent-messaging` skill by name** -- this is correct per Plugin Abstraction Principle
- **Most messaging instructions are descriptive** -- "Send using the agent-messaging skill" rather than embedding curl commands
- **One script uses `amp-send` directly**: `amama_notify_agent.py` calls `amp-send` subprocess -- this is acceptable per the Plugin Abstraction Principle (scripts call globally-installed scripts)

### Stop Hook Integration
`amama_stop_check.py` checks for unread messages via `curl` to `$AIMAESTRO_API/api/messages?agent={name}&action=unread-count` -- this is a hook script making a direct API call, which is a borderline violation of the Plugin Abstraction Principle but acceptable since hooks need to work at the script level.

---

## 5. Governance Integration

### Role Model
Plugin correctly implements the 3-role governance model:
- `manager` (AMAMA) -- singleton per host
- `chief-of-staff` -- assigned to existing agents, one per closed team
- `member` -- specialist agents with skills/tags for specialization

### GovernanceRequest Handling
- Polls pending requests: `GET /api/v1/governance/requests?status=pending`
- Approves with password: `POST /api/v1/governance/requests/{id}/approve`
- Rejects: `POST /api/v1/governance/requests/{id}/reject`
- Supports state machine: pending -> local-approved/remote-approved -> dual-approved -> executed
- 8 GovernanceRequest types defined: add-to-team, remove-from-team, assign-cos, remove-cos, transfer-agent, create-agent, delete-agent, configure-agent

### Governance Password
- Set via `POST /api/v1/governance/password`
- Required for approve/reject actions
- Rate limited: 5 failed attempts -> 60s cooldown
- Never stored in plaintext in files/messages

### Cross-Host
- Supports dual-manager approval for cross-host operations
- References `~/.aimaestro/governance-peers/` for peer state
- Presents cross-host requests to user with remote host details

### Permission Matrix (from `docs/ROLE_BOUNDARIES.md`)
Correctly defines: manager talks to user, creates teams, assigns COS, approves GovernanceRequests. COS coordinates members, submits GovernanceRequests, assigns tasks. Members execute tasks, create PRs, report to COS.

---

## 6. Hardcoded Assumptions and Violations

### CRITICAL: Hardcoded `http://localhost:23000` URLs (VIOLATION)
**File**: `skills/amama-amcos-coordination/references/spawn-failure-recovery.md`

Contains **15+ instances** of hardcoded `http://localhost:23000` URLs instead of `$AIMAESTRO_API`:
```
curl -s "http://localhost:23000/api/health" | jq .
curl -s "http://localhost:23000/api/agents?name=<agent-name>" | jq .
curl -s "http://localhost:23000/api/teams/<team-id>" | jq '{id, name, type, chief_of_staff}'
curl -X PATCH "http://localhost:23000/api/teams/<team-id>/chief-of-staff" \
```

This will break on any non-default port or remote host. Should use `$AIMAESTRO_API` variable everywhere.

### SIGNIFICANT: Embedded API Syntax in Skills (Plugin Abstraction Principle Violation)
Per the Plugin Abstraction Principle: "Plugin skills/commands/agents MUST NOT embed API syntax (no curl commands, no endpoint URLs, no header patterns)."

The following files contain embedded `curl` commands with full API syntax:
- `skills/amama-approval-workflows/references/api-endpoints.md` -- 6 curl commands
- `skills/amama-amcos-coordination/references/creating-amcos-procedure.md` -- 8 curl commands
- `skills/amama-amcos-coordination/references/workflow-checklists.md` -- 4 curl commands
- `skills/amama-amcos-coordination/references/spawn-failure-recovery.md` -- 15+ curl commands
- `skills/amama-amcos-coordination/references/creating-amcos-instance.md` -- 3 curl commands
- `skills/amama-status-reporting/references/api-endpoints.md` -- 8 curl commands
- `skills/amama-session-memory/references/handoff-format.md` -- 1 curl command
- `skills/amama-session-memory/references/memory-triggers.md` -- 2 curl commands
- `skills/amama-session-memory/references/examples.md` -- 3 curl commands
- `skills/amama-approval-workflows/references/examples.md` -- 5 curl commands
- `skills/amama-approval-workflows/references/expiry-workflow.md` -- 2 curl commands
- `skills/amama-approval-workflows/references/governance-password.md` -- 1 curl command
- `docs/TEAM_REGISTRY_SPECIFICATION.md` -- 1 curl command
- `agents/amama-assistant-manager-main-agent.md` -- references API paths inline (acceptable for the main agent, as AMAMA IS the provider's own plugin)

**Mitigating factor**: AMAMA is AI Maestro's own plugin, so the Plugin Abstraction Principle doc says "AI Maestro's own plugin is the exception -- it IS the provider of these abstractions." However, AMAMA is NOT the provider plugin; it is a role plugin that USES AI Maestro's abstractions. The provider plugin is `ai-maestro` itself (the one at `plugin/plugins/ai-maestro/`). So **AMAMA should reference the `team-governance` skill for API syntax rather than embedding it**.

### MODERATE: References Non-Existent API Endpoints
The following API endpoints referenced in AMAMA skills do not currently exist in AI Maestro:

| Referenced Endpoint | File | Status |
|---------------------|------|--------|
| `GET /api/health` | main agent, spawn-failure-recovery | **Does NOT exist** (AI Maestro uses `/api/sessions` for health) |
| `GET /api/agents/health` | status-reporting SKILL.md | **Uncertain** -- needs verification |
| `GET /api/teams/{id}/tasks` | status-reporting SKILL.md | **Uncertain** -- tasks are file-based at `~/.aimaestro/teams/tasks-{teamId}.json` |
| `POST /api/memory/store` | session-memory references | **Does NOT exist** -- memory is CozoDB-based, not API-based |
| `GET /api/memory/search` | session-memory examples | **Does NOT exist** |
| `GET /api/agents?status=available` | workflow-checklists | **Uncertain** -- may not support status filter |
| `POST /api/agents/register` | creating-amcos-procedure | **Uncertain** -- may be `aimaestro-agent.sh register` instead |

### MINOR: Session Name Convention Mismatch
AMAMA's `shared/message_templates.md` defines session name patterns like `amama-{project}-session`, `amcos-{project}-session`. But AI Maestro's CLAUDE.md defines the convention as `domain-subdomain-name` format (e.g., `libs-svg-svgbbox`). These don't match.

### MINOR: Kanban Column Mismatch
AMAMA's `docs/AGENT_OPERATIONS.md` defines 8 kanban columns:
```
backlog | todo | in-progress | ai-review | human-review | merge-release | done | blocked
```

But AI Maestro's `types/task.ts` defines only 5 statuses:
```
backlog | pending | in_progress | review | completed
```

These are incompatible and will cause sync issues.

### MINOR: Team Registry Path Inconsistency
- AMAMA references `~/.aimaestro/teams/registry.json` (correct)
- But also references per-repo registry at `<repo-root>/.aimaestro/team-registry.json` which may not exist in AI Maestro

---

## 7. What AI Maestro Features AMAMA SHOULD Use But Doesn't

### 7.1 `team-governance` Skill (Not Referenced)
AMAMA declares dependency on `ai-maestro-agents-management` skill but does NOT reference the `team-governance` skill. The `team-governance` skill is the canonical reference for:
- Team CRUD API syntax
- COS assignment
- Governance request handling
- Auth headers

**AMAMA should list `team-governance` as an external dependency** alongside `ai-maestro-agents-management` and `agent-messaging`, and remove all embedded API syntax from its own skills in favor of referencing the `team-governance` skill.

### 7.2 `aimaestro-agent.sh` CLI (Not Used)
The `creating-amcos-procedure.md` uses raw `curl` commands for agent registration (`POST /api/agents/register`). It should use the `aimaestro-agent.sh register` command instead, per the Plugin Abstraction Principle.

### 7.3 Task API Integration (Partial)
AMAMA's `amama-github-routing` skill references task files at `~/.aimaestro/teams/tasks-{teamId}.json` and the `GET /api/teams/{id}/tasks` endpoint. It should verify these APIs exist and use the correct task status values (5 statuses, not 8 kanban columns).

### 7.4 Agent Health API (Not Verified)
`amama-status-reporting` references `GET /api/agents/health` which may not exist. Should verify and use the correct health-checking mechanism.

### 7.5 Subconscious/Memory API (Not Available)
`amama-session-memory` references `POST /api/memory/store` and `GET /api/memory/search` which do not exist as REST endpoints. Memory is managed through CozoDB directly. The skill should be updated to reflect the actual memory architecture.

### 7.6 Push Notifications (Not Leveraged)
AI Maestro supports push notifications via tmux when messages arrive. AMAMA's stop check hook polls the inbox API instead of relying on push notifications. The main agent persona also describes polling-based inbox checking rather than leveraging push.

### 7.7 Haephestos Agent Creation (Not Integrated)
AMAMA references creating agents via `POST /api/agents/register` but doesn't mention Haephestos v2 for creating specialized agent types. For custom agent creation, AMAMA should route to Haephestos.

---

## 8. Overall Assessment

### Strengths
1. **Well-structured plugin** -- 8 skills with progressive disclosure (55 reference docs)
2. **Clear governance model** -- correctly implements 3-role system
3. **Comprehensive messaging** -- 10+ message types with templates
4. **Token conservation** -- scripts write to report files, return minimal stdout
5. **Subagent awareness** -- hooks skip for subagents (Claude Code 2.1.69+ compatibility)
6. **Robust stop hook** -- checks 5 sources before allowing exit
7. **Good separation of concerns** -- manager vs. COS vs. member boundaries well-defined

### Issues to Fix
1. **CRITICAL**: 15+ hardcoded `http://localhost:23000` URLs in `spawn-failure-recovery.md`
2. **SIGNIFICANT**: ~50 embedded `curl` commands in skill reference docs violate Plugin Abstraction Principle (should reference `team-governance` skill)
3. **SIGNIFICANT**: Missing `team-governance` skill dependency declaration
4. **MODERATE**: References 5+ non-existent API endpoints (`/api/health`, `/api/memory/store`, etc.)
5. **MODERATE**: Kanban column count mismatch (8 vs 5)
6. **MINOR**: Session name convention mismatch with AI Maestro
7. **MINOR**: Should use `aimaestro-agent.sh` CLI instead of raw curl for agent registration

### Plugin Abstraction Principle Compliance Score
**Partial** -- The main SKILL.md files mostly describe functionality and reference the `agent-messaging` skill correctly. However, the reference docs embed extensive API syntax that should be in the `team-governance` skill instead. The exception clause ("AI Maestro's own plugin is the exception") does NOT apply to AMAMA -- it applies only to the `ai-maestro` plugin at `plugin/plugins/ai-maestro/`.

---

## Appendix: File Count Summary

| Directory | Files | Lines (approx) |
|-----------|-------|----------------|
| agents/ | 2 | ~700 |
| skills/ (SKILL.md) | 8 | ~850 |
| skills/ (references/) | 55 | ~4000 |
| commands/ | 4 | ~450 |
| hooks/ | 1 | ~42 |
| scripts/ (functional) | 14 | ~1800 |
| scripts/ (validation) | 26 | ~8000 |
| shared/ | 3 | ~180 |
| docs/ | 4 | ~280 |
| **Total** | **117** | **~16,300** |
