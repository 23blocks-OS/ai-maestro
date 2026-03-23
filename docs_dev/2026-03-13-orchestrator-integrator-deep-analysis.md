# Deep Analysis: Orchestrator & Integrator Task/Kanban/Notification Systems

**Date:** 2026-03-13
**Status:** VERIFIED against source code
**Purpose:** Define exactly what AI Maestro's kanban must support to replicate the AMOA/AMIA workflow

## 1. ORCHESTRATOR KANBAN COLUMN SYSTEM (VERIFIED)

### 1.1 Exact 8-Column System

Source: `amoa_kanban_manager.py:36-45` (VERIFIED)

```python
KANBAN_COLUMNS = {
    "backlog": "Backlog",
    "todo": "Todo",
    "in-progress": "In Progress",
    "ai-review": "AI Review",
    "human-review": "Human Review",
    "merge-release": "Merge/Release",
    "done": "Done",
    "blocked": "Blocked",
}
```

### 1.2 Column Control Matrix

| # | Column | Status Label | Who Controls | Purpose |
|---|--------|-------------|--------------|---------|
| 1 | Backlog | `status:backlog` | Orchestrator | Entry point for new tasks |
| 2 | Todo | `status:todo` | Orchestrator | Ready to start, dependencies resolved |
| 3 | In Progress | `status:in-progress` | Programmer (starts), Orchestrator (assigns) | Active implementation |
| 4 | AI Review | `status:ai-review` | Integrator (reviews), Programmer (submits) | Integrator reviews ALL tasks |
| 5 | Human Review | `status:human-review` | Orchestrator (decides) | User reviews BIG tasks only |
| 6 | Merge/Release | `status:merge-release` | Reviewer (after approval) | Approved, ready to merge |
| 7 | Done | `status:done` | Orchestrator (after merge) | Completed |
| 8 | Blocked | `status:blocked` | Any agent (reports blocker) | Blocked at any stage |

### 1.3 Valid Transitions

```
Backlog -> Todo -> In Progress -> AI Review -> Human Review -> Merge/Release -> Done
                                      |              |
                                      +--> Merge/Release (small tasks skip Human Review)
                                      |
                                      +--> In Progress (changes requested, sent back)

Any column -> Blocked (blocker reported)
Blocked -> Previous column (blocker resolved)
```

### 1.4 vs AI Maestro Current (5 statuses)

| AI Maestro Current | AMOA Column(s) | Gap |
|-------------------|----------------|-----|
| `backlog` | Backlog | OK |
| `pending` | Todo | Rename needed |
| `in_progress` | In Progress | OK |
| `review` | AI Review + Human Review | MISSING: 2 separate review columns |
| `completed` | Done + Merge/Release | MISSING: Merge/Release pre-done stage |
| (none) | Blocked | MISSING entirely |

**Gap: AI Maestro lacks 3 columns** (AI Review, Human Review, Blocked) and conflates Merge/Release with Done.

## 2. TASK LIFECYCLE

### 2.1 Design Doc -> Tasks

Design docs are broken into "modules" stored in:
```
.claude/orchestrator-exec-phase.local.md
```

Module data structure:
```python
{
    "id": "module_id",
    "name": "module_name",
    "status": "todo",  # backlog, todo, assigned, in-progress, done
    "priority": "medium",  # critical, high, medium, low
    "dependencies": ["other_module_id"],
    "description": "...",
    "github_issue": 42,
    "acceptance_criteria": ["criterion 1", "criterion 2"]
}
```

### 2.2 Task Assignment Workflow

From `skills/amoa-task-distribution/references/op-assign-task.md`:

```
1. QUERY READY TASKS
   gh issue list --label status:ready --state open

2. SORT BY PRIORITY
   critical > high > normal > low

3. FILTER DEPENDENCIES
   Skip tasks where blockedBy is NOT empty

4. SELECT AGENT (load balancing + skill match)
   - Check availability (exclude hibernated/offline)
   - Calculate skill match score
   - Check capacity (0-2 tasks OK, 3+ at capacity)
   - Sort: skill match desc, current load asc, recent experience

5. ASSIGN TASK
   a. Remove any existing assign:* label
   b. Add assign:<agent-name> label
   c. Update status:ready -> status:in-progress

6. SEND NOTIFICATION via AMP (amp-send.sh)

7. WAIT FOR ACK (2 min timeout, then retry, then escalate)

8. LOG ASSIGNMENT in delegation log
```

### 2.3 Notification Mechanism (VERIFIED)

Source: `amoa_notify_agent.py` (VERIFIED - uses `amp-send.sh`, NOT direct API)

```python
# amoa_notify_agent.py uses amp-send.sh wrapper
cmd = [
    amp_send_path,    # ~/.local/bin/amp-send.sh
    agent_id,         # target agent session name
    subject,          # message subject
    message,          # message body
    "--priority", priority,  # urgent|high|normal|low
    "--type", amp_type,      # request|notification|status
]
```

Type mapping:
```python
_TYPE_MAP = {
    "request": "request",
    "info": "notification",
    "status": "status",
}
```

## 3. NOTIFICATION & MESSAGING SYSTEM

### 3.1 All Message Types

| Type | Direction | Template Subject |
|------|-----------|-----------------|
| Task Assignment | AMOA -> Programmer | "Task Assignment: {title}" |
| Task Completion | Programmer -> AMOA | "Task Complete: {title}" |
| Status Request | AMOA -> Programmer | "Status Request: {task_id}" |
| Status Response | Programmer -> AMOA | "Status: {task_id}" |
| Integration Request | AMOA -> AMIA | "Integration Request: PR #{pr}" |
| Integration Result | AMIA -> AMOA | "Integration Result: PR #{pr}" |
| Blocker Escalation | AMOA -> AMAMA | "BLOCKER: Task #{issue} - {summary}" |
| Change Notification | AMOA -> Agent | "Change: {category} - {summary}" |
| Task Cancelled | AMOA -> Agent | "Task Cancelled: {title}" |
| Task Paused | AMOA -> Agent | "Task Paused: {title}" |
| Task Resumed | AMOA -> Agent | "Task Resumed: {title}" |
| Stop Work | AMOA -> Agent | "STOP: {reason}" |
| Broadcast | AMOA -> All | varies |

### 3.2 Task Assignment Message Format

```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Task Assignment: <task-title>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "You are assigned: <description>. Success criteria: <criteria>.",
    "data": {
      "task_id": "<uuid>",
      "issue_number": "<github-issue>",
      "title": "<title>",
      "priority": "<critical|high|normal|low>",
      "handoff_doc": "docs_dev/handoffs/<filename>.md",
      "dependencies": ["task_id_1"],
      "acceptance_criteria": ["criterion 1"]
    }
  }
}
```

### 3.3 Agent ACK Format

```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "ACK: Task Assignment: <task-title>",
  "priority": "low",
  "content": {
    "type": "acknowledgment",
    "message": "Received and understood.",
    "data": {
      "task_id": "<task-id>",
      "action_planned": "begin_implementation"
    }
  }
}
```

### 3.4 Integration Request (AMOA -> AMIA)

```json
{
  "from": "orchestrator",
  "to": "integrator",
  "subject": "Integration Request: PR #<pr-number>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "Review and verify PR #<pr>: <title>. Run full verification.",
    "data": {
      "pr_number": 123,
      "pr_url": "https://github.com/owner/repo/pull/123",
      "request_type": "full_verification"
    }
  }
}
```

### 3.5 Integration Result (AMIA -> AMOA)

```json
{
  "from": "integrator",
  "to": "orchestrator",
  "subject": "Integration Result: PR #<pr-number>",
  "priority": "high",
  "content": {
    "type": "response",
    "message": "[PASS|FAIL] PR #<pr>. <summary>.",
    "data": {
      "pr_number": 123,
      "result": "pass|fail",
      "ci_status": "passing",
      "review_status": "approved",
      "report_file": "docs_dev/integration/reports/pr-123-verification.md"
    }
  }
}
```

### 3.6 Priority Levels & Timeouts

| Priority | Used For | ACK Timeout |
|----------|----------|-------------|
| `urgent` | Stop Work | Immediate |
| `high` | Task Assignment, Integration | 2 min |
| `normal` | Status Updates, Completion | 3 min |
| `low` | Acknowledgments | No timeout |

### 3.7 Status Polling

Orchestrator polls agents every ~15 minutes for progress updates.

## 4. GITHUB PROJECTS V2 INTEGRATION (VERIFIED)

### 4.1 GraphQL Operations

Source: `amoa_sync_kanban.py` (VERIFIED)

**Get project items:**
```graphql
query($projectId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: 100) {
        nodes {
          id
          content { ... on Issue { number, title } }
          fieldValues(first: 8) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue { name, optionId }
            }
          }
        }
      }
    }
  }
}
```

**Get project fields:**
```graphql
query($projectId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      fields(first: 20) {
        nodes {
          ... on ProjectV2SingleSelectField { id, name, options { id, name } }
        }
      }
    }
  }
}
```

**Create draft issue:**
```graphql
mutation($projectId: ID!, $title: String!, $body: String) {
  addProjectV2DraftIssue(input: {projectId: $projectId, title: $title, body: $body}) {
    projectItem { id }
  }
}
```

**Move card (update status):**
```graphql
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId,
    itemId: $itemId,
    fieldId: $fieldId,
    value: { singleSelectOptionId: $optionId }
  }) {
    projectV2Item { id }
  }
}
```

### 4.2 Sync Direction

**GitHub -> AI Maestro (MISSING)**: Currently no sync. Orchestrator only writes to GitHub.
**AI Maestro -> GitHub (MISSING)**: Currently no sync. AI Maestro doesn't know about GitHub.

**This is the critical gap**: Both systems are blind to each other.

### 4.3 Project Fields

| Field | Type | Values |
|-------|------|--------|
| Status | SingleSelect | Backlog, Todo, In Progress, AI Review, Human Review, Merge/Release, Done |
| Priority | SingleSelect | Critical, High, Medium, Low |
| Platform | SingleSelect | (project-specific) |
| Agent | Text | (agent session name) |

## 5. INTEGRATOR SPECIFICS

### 5.1 Columns Integrator Interacts With

| Column | Read | Write | Action |
|--------|------|-------|--------|
| AI Review | Yes | Yes | Receives tasks for review |
| Human Review | - | Yes | Escalates big tasks |
| Merge/Release | - | Yes | Moves approved tasks |
| In Progress | - | Yes | Sends back rejected tasks |

### 5.2 Quality Gates (4-Gate Pipeline)

Source: `amia_github_pr_gate.py` (VERIFIED)

| Gate | Check | Criteria |
|------|-------|----------|
| `draft` | `check_draft_gate(pr)` | PR is not a draft |
| `mergeable` | `check_mergeable_gate(pr)` | No merge conflicts |
| `tests` | `check_tests_gate(pr)` | CI checks SUCCESS |
| `reviews` | `check_reviews_gate(pr, min_approvals)` | Required approvals |
| `spec` | `check_spec_gate(pr, project_root)` | Feature linked to spec |
| `issues` | `check_linked_issues_gate(pr)` | PR linked to issues |

### 5.3 Integrator Notification Flow

```
1. Orchestrator sends "Integration Request" via AMP
2. Integrator receives notification (via AMP inbox polling or push)
3. Integrator runs 4-gate quality checks
4. Integrator sends "Integration Result" via AMP
5. Orchestrator processes result:
   - PASS: move task to Merge/Release (or Human Review if big)
   - FAIL: move task back to In Progress, notify programmer
```

**KEY INSIGHT**: The integrator does NOT directly move cards on the kanban. It reports results to the orchestrator, and the orchestrator makes all kanban changes. This is the authority model: **orchestrator is the sole kanban controller**.

## 6. AI MAESTRO SYNC REQUIREMENTS

### 6.1 Configurable Column System

AI Maestro must support per-team configurable columns:

```typescript
interface TeamKanbanConfig {
  columns: Array<{
    id: string           // e.g., "ai-review"
    label: string        // e.g., "AI Review"
    color: string        // dot color
    icon?: string        // lucide icon name
    permissions?: string[] // roles that can move TO this column
  }>
  defaultColumn: string  // where new tasks go (usually "backlog")
}
```

Default for AMOA-managed teams:
```json
[
  {"id": "backlog", "label": "Backlog", "permissions": ["orchestrator"]},
  {"id": "todo", "label": "Todo", "permissions": ["orchestrator"]},
  {"id": "in-progress", "label": "In Progress", "permissions": ["orchestrator", "programmer"]},
  {"id": "ai-review", "label": "AI Review", "permissions": ["orchestrator", "programmer"]},
  {"id": "human-review", "label": "Human Review", "permissions": ["orchestrator"]},
  {"id": "merge-release", "label": "Merge/Release", "permissions": ["orchestrator"]},
  {"id": "done", "label": "Done", "permissions": ["orchestrator"]},
  {"id": "blocked", "label": "Blocked", "permissions": ["orchestrator", "programmer", "integrator"]}
]
```

### 6.2 Extended Task Model

Current AI Maestro task fields + required additions:

```typescript
interface Task {
  // EXISTING
  id: string
  teamId: string
  subject: string
  description?: string
  status: string            // CHANGE: was union type, now configurable string
  assigneeAgentId?: string | null
  blockedBy: string[]
  priority?: number
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string

  // NEW - Required for AMOA integration
  labels: string[]              // status:*, assign:*, priority:*
  taskType?: string             // feature, bug, chore, epic
  externalRef?: string          // GitHub issue URL or number
  externalProjectRef?: string   // GitHub Projects V2 item ID
  previousStatus?: string       // for Blocked->restore flow
  acceptanceCriteria?: string[] // from AMOA module specs
  handoffDoc?: string           // path to handoff document
  prUrl?: string                // PR URL when in review
  reviewResult?: string         // pass|fail from integrator
}
```

### 6.3 Bidirectional GitHub Sync

AI Maestro needs a sync service that:

1. **On AI Maestro task change** -> update GitHub Projects V2 via GraphQL
2. **On GitHub issue/PR event** -> update AI Maestro task via webhook or polling
3. **Sync fields**: status, assignee, priority, labels
4. **Conflict resolution**: Last-write-wins with timestamp, or orchestrator-wins

Required API endpoints:
```
POST /api/teams/{id}/kanban-config         # Set column configuration
GET  /api/teams/{id}/kanban-config         # Get column configuration
GET  /api/teams/{id}/tasks?assignee=X&status=Y&label=Z  # Filtered listing
POST /api/teams/{id}/tasks/bulk            # Bulk create from design doc
POST /api/teams/{id}/tasks/{id}/sync       # Trigger GitHub sync
GET  /api/teams/{id}/github-sync-status    # Check sync health
```

### 6.4 Notification Integration

AI Maestro's AMP messaging already handles the notification protocol. The key requirement is that:

1. **Kanban changes trigger AMP messages** - When orchestrator moves a task, the assigned agent gets notified
2. **AMP messages reference task IDs** - So agents can look up tasks on the AI Maestro kanban
3. **Agent inbox shows task assignments** - Agents can see their assigned tasks by checking AI Maestro's kanban (not just AMP messages)

### 6.5 Authority Model

**The orchestrator is the SOLE kanban controller.** Other agents:
- Programmers: CAN move tasks to `in-progress` (starting) and `ai-review` (submitting)
- Integrator: reports results to orchestrator; orchestrator moves tasks
- All agents: CAN report blockers (move to `blocked`)
- Only orchestrator: assigns tasks, resolves blockers, decides human-review vs merge

This authority model should be enforced via the `permissions` field in `TeamKanbanConfig`.

## 7. IMPLEMENTATION PRIORITY

1. **P0: Configurable columns** - Remove hardcoded 5-status union type, add `TeamKanbanConfig`
2. **P0: Extended task fields** - Add `labels`, `externalRef`, `previousStatus`, `prUrl`
3. **P1: Task filtering API** - `GET /api/teams/{id}/tasks?assignee=X&status=Y`
4. **P1: Kanban config API** - `GET/POST /api/teams/{id}/kanban-config`
5. **P2: GitHub Projects V2 sync** - Bidirectional sync service
6. **P2: Kanban-triggered notifications** - AMP messages on task status change
7. **P3: Bulk task creation** - From design doc breakdown
8. **P3: Quality gate integration** - Integrator quality checks visible in AI Maestro
