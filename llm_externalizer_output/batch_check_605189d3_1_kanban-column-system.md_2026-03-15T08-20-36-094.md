# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:20:36.094Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/references/kanban-column-system.md`
- **Task**: This is an AI Maestro orchestrator agent plugin that manages GitHub project kanbans. I need you to extract ALL kanban customizations this plugin makes. For each file, list:

1. Custom kanban columns/statuses it defines or expects (exact names and any mapping)
2. GitHub Projects v2 GraphQL operations it performs (mutations, queries)
3. Status transitions and workflow rules it enforces
4. Label taxonomy and how labels map to kanban columns
5. Any custom fields on GitHub project items (priority, assignee, module, etc.)
6. Sync operations between AI Maestro kanban API and GitHub project boards

Be exhaustive. List every column name, every status value, every GraphQL operation, every label-to-status mapping.

---

## Model: google/gemini-2.5-flash

```markdown /tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/references/kanban-column-system.md
## Table of Contents
- [Standard 8-Column System](#standard-8-column-system)
- [Available Scripts](#available-scripts)

---

## Standard 8-Column System

| Column | Status Label | Description |
|--------|-------------|-------------|
| Backlog | `status:backlog` | Tasks identified but not yet scheduled |
| Todo | `status:todo` | Tasks scheduled for current sprint |
| In Progress | `status:in-progress` | Tasks actively being worked on |
| AI Review | `status:ai-review` | Code submitted for automated review |
| Human Review | `status:human-review` | Code awaiting human review |
| Merge/Release | `status:merge-release` | Approved and ready to merge |
| Done | `status:done` | Completed tasks |
| Blocked | `status:blocked` | Tasks blocked by dependencies |

---

## Available Scripts

The AMOA plugin includes these kanban management scripts in `scripts/`:

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `amoa_kanban_manager.py` | Create tasks, assign agents, update status, check ready tasks | Day-to-day kanban operations |
| `amoa_sync_kanban.py` | Sync label status with GitHub Project board | After manual board changes or to reconcile state |
| `check-github-projects.py` | Query project board for pending items | Stop-hook checks, status queries |
| `gh-project-add-columns.py` | Safely add columns preserving existing assignments | When adding new columns to a live board |

```
### Analysis of `/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/references/kanban-column-system.md`

This file defines the standard 8-column kanban system and lists associated scripts.

1.  **Custom kanban columns/statuses it defines or expects:**
    *   Backlog
    *   Todo
    *   In Progress
    *   AI Review
    *   Human Review
    *   Merge/Release
    *   Done
    *   Blocked

2.  **GitHub Projects v2 GraphQL operations it performs:**
    *   This markdown file does not directly perform GraphQL operations. It describes scripts that would.

3.  **Status transitions and workflow rules it enforces:**
    *   This markdown file does not explicitly define status transitions or workflow rules. It defines the columns that would be part of such a workflow.

4.  **Label taxonomy and how labels map to kanban columns:**
    *   Backlog: `status:backlog`
    *   Todo: `status:todo`
    *   In Progress: `status:in-progress`
    *   AI Review: `status:ai-review`
    *   Human Review: `status:human-review`
    *   Merge/Release: `status:merge-release`
    *   Done: `status:done`
    *   Blocked: `status:blocked`

5.  **Any custom fields on GitHub project items:**
    *   This markdown file does not define any custom fields.

6.  **Sync operations between AI Maestro kanban API and GitHub project boards:**
    *   The script `amoa_sync_kanban.py` is described as syncing label status with the GitHub Project board, implying a reconciliation of state between the AI Maestro's understanding (likely based on these labels) and the GitHub Project board's actual state.
    *   The script `amoa_kanban_manager.py` is described as performing "day-to-day kanban operations" including creating tasks, assigning agents, and updating status, which implies interaction with the GitHub Project board.
    *   The script `check-github-projects.py` queries the project board for pending items.
    *   The script `gh-project-add-columns.py` adds columns to a live board, indicating direct manipulation of the GitHub Project board structure.

---

## Model: x-ai/grok-4.1-fast

### File: `/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/references/kanban-column-system.md`

1. **Custom kanban columns/statuses defined or expected**:
   - **Standard 8-Column System** explicitly defined:
     | Column          | Status Label          | Description                          |
     |-----------------|-----------------------|--------------------------------------|
     | Backlog        | `status:backlog`     | Tasks identified but not yet scheduled |
     | Todo           | `status:todo`        | Tasks scheduled for current sprint   |
     | In Progress    | `status:in-progress` | Tasks actively being worked on       |
     | AI Review      | `status:ai-review`   | Code submitted for automated review  |
     | Human Review   | `status:human-review`| Code awaiting human review           |
     | Merge/Release  | `status:merge-release`| Approved and ready to merge          |
     | Done           | `status:done`        | Completed tasks                      |
     | Blocked        | `status:blocked`     | Tasks blocked by dependencies        |
   - Mapping pattern: Column names map directly to labels prefixed with `status:` and converted to lowercase with hyphens (e.g., "In Progress" → `status:in-progress`).

2. **GitHub Projects v2 GraphQL operations**:
   - None explicitly defined or mentioned in the file.

3. **Status transitions and workflow rules**:
   - None explicitly defined or mentioned in the file. (Implied forward progression via column descriptions, e.g., Backlog → Todo → In Progress → AI Review → Human Review → Merge/Release → Done, with Blocked as a side state, but no enforced rules or transitions specified.)

4. **Label taxonomy and how labels map to kanban columns**:
   - Labels follow the pattern `status:<column-name-lowercase-with-hyphens>`.
   - Exact mappings (bidirectional between labels and columns):
     | Label                | Maps to Column     |
     |----------------------|--------------------|
     | `status:backlog`    | Backlog           |
     | `status:todo`       | Todo              |
     | `status:in-progress`| In Progress       |
     | `status:ai-review`  | AI Review         |
     | `status:human-review`| Human Review    |
     | `status:merge-release`| Merge/Release  |
     | `status:done`       | Done              |
     | `status:blocked`    | Blocked           |
   - No other label taxonomies mentioned.

5. **Any custom fields on GitHub project items**:
   - None mentioned (no references to priority, assignee, module, or other custom fields).

6. **Sync operations between AI Maestro kanban API and GitHub project boards**:
   - `amoa_sync_kanban.py`: Syncs label status (e.g., `status:*` labels) with GitHub Project board positions/columns. Used after manual board changes or to reconcile state.
   - `amoa_kanban_manager.py`: Performs day-to-day operations including create tasks, assign agents, update status (implies label updates syncing to board), check ready tasks.
   - `check-github-projects.py`: Queries project board for pending items (implies read-sync for status checks, e.g., in stop-hooks).
   - `gh-project-add-columns.py`: Adds new columns to GitHub project board while preserving existing item assignments (supports schema evolution without breaking sync).