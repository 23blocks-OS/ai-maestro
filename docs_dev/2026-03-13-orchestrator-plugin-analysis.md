# Orchestrator Plugin (AMOA) -- AI Maestro Integration Analysis

**Date**: 2026-03-13
**Plugin**: `ai-maestro-orchestrator-agent` v1.5.3
**Location**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/`
**Scope**: Research-only analysis of all integration points with AI Maestro

---

## Table of Contents

1. [Plugin Structure Overview](#1-plugin-structure-overview)
2. [Kanban/Task Management](#2-kanbantask-management)
3. [Messaging](#3-messaging)
4. [Governance](#4-governance)
5. [Agent Management](#5-agent-management)
6. [Hardcoded Assumptions](#6-hardcoded-assumptions)
7. [Gaps: What AI Maestro Features AMOA Should Use But Doesn't](#7-gaps-what-ai-maestro-features-amoa-should-use-but-doesnt)
8. [Summary Table](#8-summary-table)

---

## 1. Plugin Structure Overview

The orchestrator plugin is a comprehensive Claude Code plugin with:

| Component | Count | Purpose |
|-----------|-------|---------|
| Agents | 6 | Main orchestrator + 5 sub-agents (team-orchestrator, task-summarizer, checklist-compiler, docker-expert, experimenter) |
| Commands | 15 | Slash commands for orchestration workflow |
| Skills | 16 | Knowledge bases covering patterns, templates, kanban, etc. |
| Hooks | 4 | Stop enforcement, verification check, polling reminder, file tracker |
| Scripts | 56+ | Python scripts for kanban, polling, verification, replacement, etc. |
| Shared | 2 | `thresholds.py` (constants), `report_writer.py` (output redirection) |
| Docs | 4 | ROLE_BOUNDARIES, FULL_PROJECT_WORKFLOW, TEAM_REGISTRY_SPECIFICATION, AGENT_OPERATIONS |

**Role hierarchy documented in the plugin:**
```
USER -> AMAMA (Manager) -> AMCOS (Chief of Staff) -> AMOA (Orchestrator) -> Implementers
                                                  -> AMAA (Architect)
                                                  -> AMIA (Integrator)
```

AMOA is project-linked (one per project), receives work from AMCOS, distributes to implementers, reports back to AMCOS.

---

## 2. Kanban/Task Management

### 2.1 AMOA's Kanban System: GitHub Projects V2

AMOA uses **GitHub Projects V2** as its kanban system. This is the core finding.

**8-column system:**

| # | Column | Code | Label |
|---|--------|------|-------|
| 1 | Backlog | `backlog` | `status:backlog` |
| 2 | Todo | `todo` | `status:todo` |
| 3 | In Progress | `in-progress` | `status:in-progress` |
| 4 | AI Review | `ai-review` | `status:ai-review` |
| 5 | Human Review | `human-review` | `status:human-review` |
| 6 | Merge/Release | `merge-release` | `status:merge-release` |
| 7 | Done | `done` | `status:done` |
| 8 | Blocked | `blocked` | `status:blocked` |

**Task fields (GitHub Issues):**
- Title/body (requirements)
- Assignee (agent or human GitHub user)
- Labels: `status:*`, `priority:*`, `type:*`, `assign:*`, `component:*`, `effort:*`, `platform:*`, `toolchain:*`, `review:*`
- Milestone (deadline)
- Project column position
- Custom fields (Assigned Agent)
- Dependencies (tracked via issue references and state files)

**Key scripts:**
- `amoa_kanban_manager.py` -- Main kanban manager (create-task, assign-task, update-status, set-dependency, check-ready-tasks, notify-agent, sync-from-github)
- `amoa_sync_kanban.py` -- Sync modules with GitHub Projects board
- `amoa_reassign_kanban_tasks.py` -- Reassign tasks between agents
- `gh-project-add-columns.py` -- Create kanban columns on GitHub Projects
- `check-github-projects.py` -- Check GitHub Projects setup

**Task routing rules:**
- Small tasks: In Progress -> AI Review -> Merge/Release -> Done
- Big tasks: In Progress -> AI Review -> Human Review -> Merge/Release -> Done
- Blocked can be set from any column

### 2.2 AI Maestro's Kanban System: File-Based Task Registry

AI Maestro has its own built-in kanban with a **5-status system** stored in `~/.aimaestro/teams/tasks-{teamId}.json`.

**5 statuses:**

| # | Status | Code |
|---|--------|------|
| 1 | Backlog | `backlog` |
| 2 | Pending | `pending` |
| 3 | In Progress | `in_progress` |
| 4 | Review | `review` |
| 5 | Completed | `completed` |

**Task fields (AI Maestro):**
- `id` (UUID)
- `teamId` (team association)
- `subject` (title)
- `description` (optional)
- `status` (TaskStatus enum)
- `assigneeAgentId` (optional, agent UUID)
- `blockedBy` (array of task IDs for dependency chains)
- `priority` (number, 0=highest)
- `createdAt`, `updatedAt`, `startedAt`, `completedAt`

**Derived fields (TaskWithDeps):**
- `blocks` (reverse dependency)
- `isBlocked` (computed)
- `assigneeName` (resolved display name)

**API endpoints:**
- `GET /api/teams/{id}/tasks` -- List tasks
- `POST /api/teams/{id}/tasks` -- Create task
- `GET /api/teams/{id}/tasks/{taskId}` -- Get task
- `PATCH /api/teams/{id}/tasks/{taskId}` -- Update task
- `DELETE /api/teams/{id}/tasks/{taskId}` -- Delete task

**Key functions in `lib/task-registry.ts`:**
- `createTask()`, `getTask()`, `updateTask()`, `deleteTask()`
- `resolveTaskDeps()` -- Computes blocks/isBlocked
- `wouldCreateCycle()` -- Prevents circular dependencies
- `loadTasks()`, `saveTasks()` -- File I/O

### 2.3 Comparison: AMOA vs AI Maestro Kanban

| Dimension | AMOA (GitHub Projects) | AI Maestro (Built-in) |
|-----------|----------------------|----------------------|
| **Storage** | GitHub Projects V2 API | JSON files on disk |
| **Columns/Statuses** | 8 columns | 5 statuses |
| **Missing in AI Maestro** | AI Review, Human Review, Merge/Release, Blocked | -- |
| **Missing in AMOA** | -- | Pending (separate from Backlog) |
| **Task Identity** | GitHub Issue # | UUID |
| **Assignment** | GitHub labels (`assign:*`) + assignee | `assigneeAgentId` |
| **Dependencies** | Issue references + state files | `blockedBy` array with cycle detection |
| **Labels** | Rich taxonomy (status, priority, type, component, effort, platform, toolchain, review) | None (only status + priority number) |
| **Integration** | Needs `gh` CLI + OAuth scopes | Native REST API |
| **Visibility** | Public GitHub board | Dashboard UI only |
| **Sync** | Manual script (`amoa_sync_kanban.py`) | Real-time via polling (5s) |

**Critical gap:** AMOA does not use AI Maestro's kanban API at all. It has a completely independent task management system on GitHub Projects.

---

## 3. Messaging

### 3.1 How AMOA Communicates

AMOA uses AI Maestro's messaging in two ways:

**A. Via the `agent-messaging` skill (recommended in docs/skills)**
The plugin extensively references the `agent-messaging` skill (the global AI Maestro skill) for natural-language messaging. This is the **correct abstraction layer** per the Plugin Abstraction Principle. Found in:
- All 6 agent definitions
- Multiple skills (messaging-templates, remote-agent-coordinator, orchestration-patterns, etc.)
- Multiple commands (assign-module, check-agents, etc.)
- Documentation (FULL_PROJECT_WORKFLOW, TEAM_REGISTRY_SPECIFICATION, AGENT_OPERATIONS)

**B. Via direct API calls (VIOLATION of Plugin Abstraction Principle)**
Two Python scripts call the AI Maestro API directly:

1. **`scripts/amoa_notify_agent.py`** -- Calls `POST {AIMAESTRO_API}/api/messages` directly via curl subprocess
   - Hardcodes `DEFAULT_API_URL = "http://localhost:23000"`
   - Falls back to `AIMAESTRO_API` env var
   - Builds JSON payload manually with `to`, `subject`, `priority`, `content` fields
   - Uses curl subprocess for HTTP

2. **`scripts/amoa_confirm_replacement.py`** -- Calls both:
   - `GET {AIMAESTRO_API}/api/messages?agent={agent}&action=list&status=unread` (read inbox)
   - `POST {AIMAESTRO_API}/api/messages` (send message)
   - Hardcodes `AIMAESTRO_API = os.environ.get("AIMAESTRO_API", "http://localhost:23000")`

**These two scripts violate the Plugin Abstraction Principle** which states: "Plugin hooks/scripts MUST NOT call the API directly. They call globally-installed AI Maestro scripts (`amp-send.sh`, `amp-inbox.sh`, etc.)."

### 3.2 Message Content Types Used

| Type | Purpose | Example |
|------|---------|---------|
| `task` | Task assignment | "Implement feature X" |
| `status` | Status update | "Completed 3/5 tasks" |
| `blocker` | Blocking issue | "API dependency missing" |
| `request` | Information request | "Need architectural guidance" |
| `report` | Detailed report | "Test results attached" |
| `info` | General info | (used in scripts) |
| `progress-report` | Progress update | (used in team registry spec) |
| `registry-update` | Team registry changed | (used in team registry spec) |

### 3.3 Message Priority Levels

| Priority | When | Response Time |
|----------|------|---------------|
| `urgent` | Blockers, critical errors, AMCOS directives | Immediate |
| `high` | Task assignments, deadlines | 5 minutes |
| `normal` | Status updates, progress | 15 minutes |
| `low` | FYI, non-actionable | When convenient |

### 3.4 Does it use `amp-send.sh` / `amp-inbox.sh`?

**No.** The plugin does NOT use the globally-installed AMP scripts (`amp-send.sh`, `amp-inbox.sh`, `amp-read.sh`). The two scripts that need programmatic messaging call the API directly via curl. The rest of the plugin relies on the `agent-messaging` skill (which is correct for agent-level messaging in natural language context).

---

## 4. Governance

### 4.1 Does AMOA Check Governance?

**No.** The orchestrator plugin has **zero governance integration**.

- No references to `team-governance` skill
- No references to `/api/governance` endpoints
- No role permission checks via the governance API
- No team membership validation via governance
- The word "governance" appears exactly once in the entire plugin, in a generic reference to "audit and governance requirements" in an archive structure doc

### 4.2 What AMOA Does Instead

AMOA enforces role boundaries through:

1. **Documentation-based rules** (`docs/ROLE_BOUNDARIES.md`): Defines what each role CAN and CANNOT do
2. **Agent persona instructions**: Each agent `.md` file lists explicit constraints in tables
3. **Plugin mutual exclusivity**: Each agent instance loads ONLY its own plugin (cannot access other role plugins)
4. **Skill-level enforcement**: Skills contain guardrails, checklists, and forbidden-action lists

This is purely **instruction-based** enforcement (the agent is told what not to do), not **API-enforced** governance.

### 4.3 Role Boundaries Hardcoded in Plugin

From `docs/ROLE_BOUNDARIES.md`:

| Responsibility | AMAMA | AMCOS | AMOA | AMIA | AMAA |
|----------------|-------|-------|------|------|------|
| Create projects | Yes | No | No | No | No |
| Create agents | Approves | Yes | Requests | No | No |
| Configure agents | No | Yes | No | No | No |
| Assign tasks | No | No | Yes | No | No |
| Manage kanban | No | No | Yes | No | No |
| Code review | No | No | No | Yes | No |
| Architecture | No | No | No | No | Yes |
| Talk to user | Yes | No | No | No | No |

These rules are **duplicated as static text** in the plugin, not queried from AI Maestro's governance API at runtime.

---

## 5. Agent Management

### 5.1 How AMOA Manages Agents

AMOA does NOT create agents directly. It:

1. **Requests agents from AMCOS** via AI Maestro messages
2. **Registers agents** in its local state file (`.claude/orchestrator-exec-phase.local.md` with YAML frontmatter) using `amoa_register_agent.py`
3. **Assigns modules** to registered agents using `amoa_assign_module.py`
4. **Monitors agents** via polling (`amoa_poll_agent.py`, `amoa_check_remote_agents.py`)
5. **Replaces agents** via handoff protocol (`amoa_generate_replacement_handoff.py`, `amoa_confirm_replacement.py`, `amoa_reassign_kanban_tasks.py`)

### 5.2 References to AI Maestro Agent Management

AMOA references the `ai-maestro-agents-management` skill (the global skill) in 10 places:
- `docs/AGENT_OPERATIONS.md` (7 references): For spawning, waking, hibernating, and terminating AMOA instances
- `skills/amoa-progress-monitoring/references/op-handle-reassignment.md` (1 reference): For querying agent registry
- `skills/amoa-task-distribution/references/op-select-agent.md` (1 reference): For querying agent availability

This is the **correct abstraction** per the Plugin Abstraction Principle -- referencing the global skill rather than embedding API calls.

### 5.3 Agent State Management

AMOA maintains its own agent state in local files:
- `.claude/orchestrator-exec-phase.local.md` -- YAML frontmatter with registered agents, assignments, verification status
- `.ai-maestro/orchestration-state.json` -- JSON state for replacement workflow
- `.ai-maestro/team-registry.json` -- Team contacts (expected to be git-tracked in the project repo)

This is **separate from** AI Maestro's agent registry (`~/.aimaestro/agents/registry.json`).

---

## 6. Hardcoded Assumptions

### 6.1 Hardcoded API URLs

| File | Hardcoded Value |
|------|----------------|
| `scripts/amoa_notify_agent.py:48` | `DEFAULT_API_URL = "http://localhost:23000"` |
| `scripts/amoa_confirm_replacement.py:68` | `AIMAESTRO_API = os.environ.get("AIMAESTRO_API", "http://localhost:23000")` |
| `skills/amoa-orchestration-patterns/SKILL.md:85` | `http://localhost:23000` mentioned in prerequisites |

All other API references use `AIMAESTRO_API` env var or delegate to the `agent-messaging` skill.

### 6.2 Hardcoded API Endpoints

| File | Endpoint |
|------|----------|
| `scripts/amoa_notify_agent.py:87` | `{api_url}/api/messages` (POST) |
| `scripts/amoa_confirm_replacement.py:162` | `{AIMAESTRO_API}/api/messages?agent={agent}&action=list&status=unread` (GET) |
| `scripts/amoa_confirm_replacement.py:387` | `{AIMAESTRO_API}/api/messages` (POST) |

### 6.3 Hardcoded Governance Rules

The entire role boundary matrix is hardcoded in `docs/ROLE_BOUNDARIES.md` and repeated across multiple agent definitions and skill references. These are **static text**, not dynamically queried.

### 6.4 Hardcoded Team Structure

- `docs/TEAM_REGISTRY_SPECIFICATION.md` defines exact roles: manager, chief-of-staff, orchestrator, architect, integrator, implementer, tester, devops
- Cardinality rules are hardcoded: "Exactly 1 orchestrator per team", "Exactly 1 architect per team"
- Organization agents are hardcoded: `amama-assistant-manager`, `amcos-chief-of-staff`

### 6.5 Hardcoded Agent Session Names

- `scripts/amoa_confirm_replacement.py:71` -- `DEFAULT_AMCOS_SESSION = "amcos-controller"`
- Various docs reference `amcos-chief-of-staff-one`, `amama-main-manager`, etc.

### 6.6 Hardcoded Kanban Columns

- `scripts/amoa_kanban_manager.py:36-45` -- 8-column dict hardcoded
- `scripts/amoa_sync_kanban.py:29-40` -- Status-to-column mapping hardcoded
- Multiple skill references and docs duplicate the column definitions

### 6.7 Hardcoded GitHub Configuration

- `scripts/amoa_kanban_manager.py:29` -- `GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "Emasoft")`
- Various scripts assume `gh` CLI with specific OAuth scopes (`project`, `read:project`)

---

## 7. Gaps: What AI Maestro Features AMOA Should Use But Doesn't

### 7.1 CRITICAL: AI Maestro's Task/Kanban API

**Gap**: AMOA uses GitHub Projects V2 exclusively for kanban. It does NOT use AI Maestro's built-in task management API (`/api/teams/{id}/tasks`).

**Impact**:
- Tasks on the AI Maestro dashboard kanban board are completely disconnected from AMOA's GitHub kanban
- The dashboard shows empty kanban for teams managed by AMOA
- No way to view AMOA's task state from the dashboard without going to GitHub
- Dependency tracking is duplicated (AI Maestro has `blockedBy` + cycle detection; AMOA uses issue references)

**Recommendation**: AMOA should **sync** its GitHub Project state to AI Maestro's task API, or use AI Maestro as the authoritative task store and sync TO GitHub Projects. The `amoa_sync_kanban.py` script already syncs modules to GitHub -- a reverse sync to AI Maestro would close this gap.

**Status mapping needed:**

| AMOA Column | AI Maestro Status |
|-------------|-------------------|
| backlog | `backlog` |
| todo | `pending` |
| in-progress | `in_progress` |
| ai-review | `review` |
| human-review | `review` |
| merge-release | `review` |
| done | `completed` |
| blocked | `in_progress` (with blockedBy populated) |

### 7.2 CRITICAL: Governance API

**Gap**: AMOA hardcodes all role boundaries and permission rules in static documentation. It does NOT use AI Maestro's governance API to:
- Validate that it has permission to assign tasks
- Check team membership before sending messages
- Verify agent roles before delegation
- Enforce the role boundary matrix dynamically

**Impact**:
- Role violations are only caught by agent instructions (soft enforcement)
- If governance rules change in AI Maestro, AMOA's hardcoded rules become stale
- No audit trail of governance checks

**Recommendation**: AMOA should read role boundaries from the `team-governance` skill at runtime rather than hardcoding them.

### 7.3 MODERATE: AMP Scripts Instead of Direct curl

**Gap**: Two scripts (`amoa_notify_agent.py`, `amoa_confirm_replacement.py`) call the AI Maestro API directly via curl instead of using `amp-send.sh` and `amp-inbox.sh`.

**Impact**:
- Violates the Plugin Abstraction Principle
- If AI Maestro's messaging API changes, these scripts break while the AMP scripts get updated
- No benefit to direct curl calls (AMP scripts do the same thing)

**Recommendation**: Refactor both scripts to call `amp-send.sh` and `amp-inbox.sh` instead of raw curl.

### 7.4 MODERATE: AI Maestro Agent Registry

**Gap**: AMOA maintains its own agent registry in local state files (`.claude/orchestrator-exec-phase.local.md`, `.ai-maestro/team-registry.json`). It does NOT query AI Maestro's agent registry (`~/.aimaestro/agents/registry.json`) for agent metadata.

**Impact**:
- Agent status may be stale (AMOA's local state vs. AI Maestro's live registry)
- Duplicate source of truth for agent availability
- No awareness of agents managed by AI Maestro that aren't in AMOA's local state

**Recommendation**: AMOA should query AI Maestro's sessions/agents API (`/api/sessions`) for live agent status instead of maintaining a parallel registry.

### 7.5 MINOR: AI Maestro Teams API

**Gap**: AMOA uses a git-tracked `team-registry.json` in the project repo but does not use AI Maestro's teams API (`/api/teams`).

**Impact**:
- Team membership visible in AMOA's file but not in AI Maestro's dashboard
- Cannot leverage AI Maestro's team meeting features, task board, or chat for AMOA-managed teams

**Recommendation**: AMOA should register its teams with AI Maestro's teams API and keep them in sync.

### 7.6 MINOR: Push Notifications

**Gap**: AMOA uses a polling hook (`amoa-polling-reminder` every `UserPromptSubmit`) to remind the orchestrator to check agent progress. It does NOT leverage AI Maestro's push notification system (tmux notifications on message arrival).

**Impact**:
- Orchestrator may miss urgent messages between polls
- Polling overhead vs. event-driven notification

**Recommendation**: AI Maestro already pushes tmux notifications on message arrival. AMOA should document reliance on this and remove the polling reminder hook or reduce its frequency.

### 7.7 MINOR: Subconscious / Memory Integration

**Gap**: AMOA does not use AI Maestro's subconscious/memory system for conversation indexing or long-term memory consolidation.

**Impact**: Low -- AMOA is a coordination agent, not a knowledge worker. Memory integration would be nice-to-have but not critical.

---

## 8. Summary Table

| Integration Point | Used Correctly? | Details |
|-------------------|-----------------|---------|
| **AMP Messaging (skill)** | YES | References `agent-messaging` skill throughout |
| **AMP Messaging (scripts)** | VIOLATION | 2 scripts call API directly via curl |
| **Agent Management (skill)** | YES | References `ai-maestro-agents-management` skill |
| **Governance API** | NOT USED | All rules hardcoded in docs |
| **Task/Kanban API** | NOT USED | Uses GitHub Projects V2 exclusively |
| **Teams API** | NOT USED | Uses local `team-registry.json` |
| **Agent Registry API** | NOT USED | Maintains own state files |
| **Push Notifications** | PARTIAL | Uses polling hook instead |
| **Subconscious/Memory** | NOT USED | Not applicable for orchestrator role |

### Files With Direct API Violations

1. `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/scripts/amoa_notify_agent.py` -- Direct `POST /api/messages` via curl
2. `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/scripts/amoa_confirm_replacement.py` -- Direct `GET /api/messages` and `POST /api/messages` via curl

### Hardcoded Values Summary

| What | Where | Value |
|------|-------|-------|
| API URL | `amoa_notify_agent.py:48` | `http://localhost:23000` |
| API URL | `amoa_confirm_replacement.py:68` | `http://localhost:23000` |
| AMCOS session | `amoa_confirm_replacement.py:71` | `amcos-controller` |
| GitHub owner | `amoa_kanban_manager.py:29` | `Emasoft` |
| Kanban columns | `amoa_kanban_manager.py:36-45` | 8-column dict |
| Status mapping | `amoa_sync_kanban.py:29-40` | Status-to-column dict |
| Role boundaries | `docs/ROLE_BOUNDARIES.md` | Full permission matrix |
| Team structure | `docs/TEAM_REGISTRY_SPECIFICATION.md` | Role cardinality rules |

---

## Key Recommendations (Priority Order)

1. **P1 -- Sync tasks to AI Maestro's kanban API**: Either make AI Maestro the authoritative task store (and sync to GitHub Projects as a view) or add a reverse sync from GitHub Projects to AI Maestro's `/api/teams/{id}/tasks` endpoint. This closes the biggest visibility gap.

2. **P2 -- Replace direct curl calls with AMP scripts**: Refactor `amoa_notify_agent.py` and `amoa_confirm_replacement.py` to use `amp-send.sh` and `amp-inbox.sh`. This fixes the Plugin Abstraction Principle violation.

3. **P3 -- Read governance rules from `team-governance` skill**: Instead of hardcoding the role boundary matrix, AMOA should discover governance rules at runtime. This makes the system resilient to governance changes.

4. **P4 -- Query AI Maestro agent registry for live status**: Use `/api/sessions` to check agent liveness rather than maintaining a parallel registry.

5. **P5 -- Register teams with AI Maestro teams API**: Keep AI Maestro's team list in sync with AMOA's team registry.

---

*End of analysis report.*
