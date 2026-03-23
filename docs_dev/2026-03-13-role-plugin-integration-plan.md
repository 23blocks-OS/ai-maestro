# Role Plugin Integration Plan — AI Maestro

**Date:** 2026-03-13
**Status:** Planning (research phase — agent reports pending)
**Scope:** Full integration of 6 role plugins into AI Maestro ecosystem

## Problem Statement

The 6 Emasoft role plugins (Chief-of-Staff, Architect, Orchestrator, Integrator, Programmer, Assistant Manager) were designed as standalone Claude Code plugins. They work, but they don't deeply integrate with AI Maestro's:

1. **Kanban/Task System** — Orchestrator uses GitHub Projects kanban, but doesn't mirror tasks to AI Maestro's kanban
2. **Governance System** — Plugins may hardcode role checks instead of querying AI Maestro's governance API
3. **Messaging** — Some plugins may use direct methods instead of AMP
4. **Agent Registry** — Plugins may create agents without going through AI Maestro's registry
5. **Naming Conventions** — Quad-match rule violations (already filed as issues #2 across 4 repos)

## Current State

### AI Maestro Kanban (v0.20.19+)

**5 fixed columns:**
| Column | Status Key | Description |
|--------|-----------|-------------|
| Backlog | `backlog` | Unprocessed items |
| To Do | `pending` | Ready for work |
| In Progress | `in_progress` | Active work |
| Review | `review` | Needs review |
| Done | `completed` | Finished |

**Task fields:**
- `id` (UUID), `teamId`, `subject`, `description`
- `status` (one of 5 fixed values)
- `assigneeAgentId`, `blockedBy[]`, `priority`
- `createdAt`, `updatedAt`, `startedAt`, `completedAt`

**Missing (needed by orchestrator):**
- Custom columns / configurable statuses
- Labels / tags
- Task types (feature, bug, chore, epic)
- Milestones / sprints
- Due dates / estimates
- Comments / activity log
- Attachments (design docs, requirement docs)
- Sub-tasks / checklists
- Custom fields

### Proposed Kanban (from staffing workflow design)

**6 columns:**
| Column | Status Key | Who Controls | Notes |
|--------|-----------|-------------|-------|
| Feature Request | `feature_request` | Manager only | Non-actionable proposals, limbo |
| TODO | `todo` | Orchestrator | Actionable task requirements |
| In Progress | `in_progress` | Programmers | Active implementation |
| Review | `review` | Integrator | Code review + integration |
| Testing | `testing` | Integrator/QA | Verification |
| Completed | `completed` | Auto | Done |

### GitHub Projects Kanban (what Orchestrator likely uses)

GitHub Projects supports:
- Custom columns (unlimited, user-defined names)
- Custom fields (text, number, date, single-select, iteration)
- Labels (multiple per issue)
- Milestones
- Assignees (multiple)
- Issue types (via labels or custom field)
- Sub-issues (task lists)
- Priority field (custom)
- Iteration/sprint tracking
- Views (board, table, roadmap)
- Automated workflows (auto-move on PR merge, etc.)

## Integration Gaps Per Plugin

### 1. Orchestrator Agent

**Primary gap: Kanban synchronization**

The orchestrator breaks down design docs into tasks and manages the project workflow. It likely uses GitHub Projects as its kanban. But AI Maestro has its own kanban visible in the Team Meeting UI. These need to stay in sync.

**Required AI Maestro changes:**
- [ ] Extend `TaskStatus` to support configurable columns
- [ ] Add labels/tags to Task type
- [ ] Add task type field (feature, bug, chore, epic)
- [ ] Add due date field
- [ ] Add comments/activity log
- [ ] Add attachment references (paths to design docs)
- [ ] Add sub-task support (or at least checklist items)
- [ ] Add `feature_request` and `testing` statuses
- [ ] API: Bulk task creation endpoint
- [ ] API: Task filtering by label, assignee, type, priority

**Required plugin changes:**
- [ ] After creating/updating GitHub issues, also sync to AI Maestro kanban via API
- [ ] Read AI Maestro kanban state, not just GitHub state
- [ ] Use AMP to notify team members of task assignments

### 2. Architect Agent

**Primary gap: Design document delivery**

The architect creates actionable project design documents. These need to be:
- Stored where team members can access them
- Referenced by kanban tasks
- Delivered via AMP to CoS and Orchestrator

**Required AI Maestro changes:**
- [ ] Task attachment support (link design docs to tasks)
- [ ] Shared team file storage or document references

**Required plugin changes:**
- [ ] Use AMP messaging to deliver design docs
- [ ] Store design docs in team-accessible location
- [ ] Notify CoS when design is complete

### 3. Chief of Staff

**Primary gap: Agent creation via AI Maestro API**

The CoS creates and manages team agents. It should use AI Maestro's agent registry API, not just `claude` CLI directly.

**Required AI Maestro changes:**
- [ ] Agent creation API with role plugin installation
- [ ] Team auto-staffing endpoint

**Required plugin changes:**
- [ ] Use AI Maestro agent creation API (via `aimaestro-agent.sh`)
- [ ] Use AMP for all team communications
- [ ] Use governance API for role assignments
- [ ] Use Haephestos or simple wizard for agent profiling

### 4. Integrator Agent

**Primary gap: Integration status reporting**

The integrator merges work, runs CI/CD, manages dependencies. Status needs to flow back to AI Maestro kanban.

**Required AI Maestro changes:**
- [ ] Task status updates via API (already exists)
- [ ] CI/CD status integration (future)

**Required plugin changes:**
- [ ] Update AI Maestro kanban when PRs are merged/reviewed
- [ ] Use AMP to report integration results
- [ ] Use governance API to check permissions

### 5. Programmer Agent

**Primary gap: Task assignment reception**

The programmer receives tasks from the orchestrator. It should pick up tasks from AI Maestro kanban, not just GitHub issues.

**Required AI Maestro changes:**
- [ ] "My tasks" API endpoint (tasks assigned to me)
- [ ] Task claim/unclaim API
- [ ] Status update hooks (notify orchestrator on status change)

**Required plugin changes:**
- [ ] Poll or receive AMP notifications for task assignments
- [ ] Update task status in AI Maestro kanban as work progresses
- [ ] Report completion via AMP

### 6. Assistant Manager Agent

**Primary gap: Delegation and oversight**

The assistant manager assists the human manager with delegation and monitoring.

**Required AI Maestro changes:**
- [ ] Dashboard metrics API (team velocity, task completion rates)
- [ ] Manager-level overview endpoints

**Required plugin changes:**
- [ ] Use governance API for role verification
- [ ] Use AMP for communication
- [ ] Query AI Maestro for team status

## AI Maestro Kanban Enhancement Plan

### Phase 1: Extended Task Model

Update `types/task.ts`:
```typescript
export type TaskStatus = string  // No longer a fixed union — configurable per team

export interface Task {
  id: string
  teamId: string
  subject: string
  description?: string
  status: TaskStatus
  assigneeAgentId?: string | null
  blockedBy: string[]
  priority?: number
  labels: string[]              // NEW: tags/labels
  taskType?: string             // NEW: feature, bug, chore, epic
  dueDate?: string              // NEW: ISO date
  estimate?: number             // NEW: story points or hours
  attachments?: string[]        // NEW: file paths or URLs
  parentTaskId?: string | null  // NEW: for sub-tasks
  externalRef?: string          // NEW: link to GitHub issue/PR
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
}
```

### Phase 2: Configurable Columns

Add team-level column configuration:
```typescript
export interface TeamKanbanConfig {
  columns: Array<{
    id: string           // unique key
    label: string        // display name
    color: string        // dot color
    icon?: string        // lucide icon name
    permissions?: string[] // roles that can move tasks here
  }>
  defaultColumn: string  // where new tasks go
}
```

Default columns for AI Maestro teams:
```json
[
  {"id": "feature_request", "label": "Feature Request", "permissions": ["manager"]},
  {"id": "todo", "label": "TODO"},
  {"id": "in_progress", "label": "In Progress"},
  {"id": "review", "label": "Review"},
  {"id": "testing", "label": "Testing"},
  {"id": "completed", "label": "Completed"}
]
```

### Phase 3: Task API Extensions

New endpoints:
- `GET /api/teams/{id}/tasks?assignee={agentId}&label={label}&type={type}&status={status}` — filtered listing
- `POST /api/teams/{id}/tasks/bulk` — bulk create
- `POST /api/teams/{id}/tasks/{taskId}/comments` — add comment
- `GET /api/teams/{id}/kanban-config` — get column configuration
- `PUT /api/teams/{id}/kanban-config` — set column configuration

### Phase 4: UI Updates

- Kanban board reads columns from config instead of hardcoded array
- Support arbitrary number of columns
- Column-level permissions (e.g., only manager can approve Feature Requests)
- Task card shows labels, type, due date
- Task detail view shows comments, attachments, sub-tasks

## GitHub Issues to File

### Per-Plugin Issues (to be filed after agent analysis completes)

For each of the 6 repos, file issues covering:

1. **Kanban Integration** — Sync task status with AI Maestro kanban API
2. **AMP Messaging** — Use AMP for all inter-agent communication
3. **Governance API** — Query governance service instead of hardcoding rules
4. **Agent Registry** — Use AI Maestro registry for agent operations
5. **Plugin Abstraction** — Follow the Plugin Abstraction Principle (no direct API calls)

### AI Maestro Issues (on Emasoft/ai-maestro repo)

1. **Extended Task Model** — Add labels, types, due dates, attachments, sub-tasks
2. **Configurable Kanban Columns** — Per-team column configuration
3. **Feature Request Column** — Manager-only limbo column for non-actionable proposals
4. **Testing Column** — Add testing status between review and completed
5. **Task API Filtering** — Filter by assignee, label, type, status
6. **Bulk Task Creation** — Create multiple tasks in one API call
7. **Task Comments API** — Activity log / comments on tasks
8. **Haephestos v2 Completion** — Remove v1 terminal parsing, wire real TerminalView
9. **Simple Wizard Completion** — 5 predefined role buttons, plugin installation
10. **Team Auto-Staffing Dialog** — Prompt when team is empty

## Research Agent Reports (COMPLETED)

All 7 research agents completed successfully on 2026-03-13.

- [x] Orchestrator analysis: `docs_dev/2026-03-13-orchestrator-plugin-analysis.md`
- [x] Architect analysis: `docs_dev/2026-03-13-architect-plugin-analysis.md`
- [x] Chief-of-Staff analysis: `docs_dev/2026-03-13-chief-of-staff-plugin-analysis.md`
- [x] Integrator analysis: `docs_dev/2026-03-13-integrator-plugin-analysis.md`
- [x] Programmer analysis: `docs_dev/2026-03-13-programmer-plugin-analysis.md`
- [x] Assistant Manager analysis: `docs_dev/2026-03-13-assistant-manager-plugin-analysis.md`
- [x] Haephestos v2 gaps: `docs_dev/2026-03-13-haephestos-v2-gaps-audit.md`

## Cross-Plugin Findings Summary

### Universal Issues (All 6 Plugins)

| Issue | Severity | Details |
|-------|----------|---------|
| **Kanban column mismatch** | CRITICAL | All plugins document 8-column system; AI Maestro has 5 statuses |
| **No governance API integration** | CRITICAL | None query `team-governance` skill at runtime; all hardcode role boundaries |
| **Duplicate role docs** | HIGH | ROLE_BOUNDARIES.md, FULL_PROJECT_WORKFLOW.md, TEAM_REGISTRY_SPECIFICATION.md duplicated across all 6 plugins — will inevitably drift |
| **No AI Maestro task API usage** | HIGH | All use file-based or GitHub Projects task tracking instead |

### Per-Plugin PAP Violations

| Plugin | Direct API Calls | Embedded curl in Skills | Hardcoded URLs |
|--------|-----------------|------------------------|----------------|
| **AMOA (Orchestrator)** | 2 scripts (notify, confirm-replacement) | 0 | 3 locations |
| **AMAA (Architect)** | 0 | 0 | 0 (clean!) |
| **AMCOS (Chief of Staff)** | 5 scripts (registry, approval, heartbeat, notify, report) | 4 skills | 6 locations |
| **AMIA (Integrator)** | 1 script (ci_webhook_handler) | 1 doc (phase-procedures) | 1 location |
| **AMPA (Programmer)** | 0 | 1 skill (handoff-management) | 2 locations |
| **AMAMA (Asst Manager)** | 1 script (stop hook curl) | ~50 curl commands across 13 files | 15+ locations |

### Per-Plugin Specific Issues

| Plugin | Unique Issues |
|--------|---------------|
| **AMOA** | Uses GitHub Projects V2 exclusively; maintains own agent registry; no AI Maestro kanban sync |
| **AMAA** | Inconsistent recipient names (ecos vs orchestrator-master); separate memory system; stop hook doesn't notify |
| **AMCOS** | thresholds.py missing "programmer" role; no Haephestos integration; 3 different naming conventions |
| **AMIA** | File-based task tracking at docs_dev/integration/status/; no .agent.toml; localhost-only webhook |
| **AMPA** | References non-existent /api/health; empty hooks.json; no task read-back capability |
| **AMAMA** | References 5+ non-existent API endpoints; missing team-governance dependency; ~50 embedded curl commands |

## GitHub Issues Filed (2026-03-13)

### Role Plugin Repos (26 issues total)

| Repo | Issues | Topics |
|------|--------|--------|
| `ai-maestro-chief-of-staff` | #1-#5 | .agent.toml, stale docs, PAP violations, governance hardcoding, kanban+Haephestos |
| `ai-maestro-assistant-manager-agent` | #1-#5 | .agent.toml, stale docs, 50+ embedded curl, missing team-governance dep, kanban+Haephestos |
| `ai-maestro-orchestrator-agent` | #2-#6 | .agent.toml, stale docs, PAP violations, governance hardcoding, GitHub-only kanban |
| `ai-maestro-architect-agent` | #2-#6 | .agent.toml, stale docs, governance+hardcoded names, kanban+duplicate docs, memory system |
| `ai-maestro-integrator-agent` | #2-#6 | .agent.toml, stale docs, PAP violations, governance, kanban+task system |
| `ai-maestro-programmer-agent` | #2-#6 | .agent.toml, stale docs, PAP violation, kanban mismatch, no task read-back |

### AI Maestro Platform (4 issues)

| Issue | Title |
|-------|-------|
| Extended Task Model | Add labels, types, due dates, attachments, sub-tasks |
| Configurable Kanban Columns | Per-team column configuration (TeamKanbanConfig) |
| Haephestos v2 Completion | Archive v1 legacy code (1629 LOC dead) |
| Simple Wizard Role Selection | 5 predefined roles with plugin installation |

## Issue Specification Document

Full issue bodies: `docs_dev/2026-03-13-github-issues-to-file.md`
