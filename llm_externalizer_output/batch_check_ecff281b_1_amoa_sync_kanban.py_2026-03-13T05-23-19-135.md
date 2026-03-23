# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/scripts/amoa_sync_kanban.py`
- **Task**: You are analyzing Python scripts from the "AI Maestro Orchestrator Agent" (AMOA) plugin. These scripts manage kanban operations and agent notifications.

For each script, extract:
1. EXACT KANBAN COLUMNS: What column names/IDs are used? Are they hardcoded or configurable?
2. GITHUB PROJECTS V2 API: What GraphQL queries/mutations are used? What fields?
3. TASK DATA MODEL: What fields does a task/card have? How are tasks created/moved?
4. NOTIFICATION MECHANISM: How are agents notified? Does it use AMP (amp-send.sh) or direct API calls? What message format?
5. API CALLS: Any direct calls to AI Maestro API (localhost:23000)? What endpoints?
6. SYNC LOGIC: How does sync between GitHub and local state work? What state is tracked?

Extract exact code patterns, hardcoded values, and data structures.
- **Model**: `minimax/minimax-m2.5`

---


The user wants me to analyze the Python script `amoa_sync_kanban.py` and extract specific information about:

1. EXACT KANBAN COLUMNS: What column names/IDs are used? Are they hardcoded or configurable?
2. GITHUB PROJECTS V2 API: What GraphQL queries/mutations are used? What fields?
3. TASK DATA MODEL: What fields does a task/card have? How are tasks created/moved?
4. NOTIFICATION MECHANISM: How are agents notified? Does it use AMP (amp-send.sh) or direct API calls? What message format?
5. API CALLS: Any direct calls to AI Maestro API (localhost:23000)? What endpoints?
6. SYNC LOGIC: How does sync between GitHub and local state work? What state is tracked?

Let me analyze the code:

## 1. EXACT KANBAN COLUMNS

Looking at `STATUS_TO_COLUMN` dictionary (lines 28-40):
```python
STATUS_TO_COLUMN = {
    "backlog": "Backlog",
    "todo": "Todo",
    "assigned": "In Progress",
    "in-progress": "In Progress",
    "ai-review": "AI Review",
    "human-review": "Human Review",
    "merge-release": "Merge/Release",
    "blocked": "Blocked",
    "done": "Done",
    "complete": "Done",
}
```

These are hardcoded column mappings. The actual column names in GitHub Projects are: "Backlog", "Todo", "In Progress", "AI Review", "Human Review", "Merge/Release", "Blocked", "Done"

Priority values (lines 43-48):
```python
PRIORITY_VALUES = {
    "critical": "Critical",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
}
```

These are also hardcoded.

## 2. GITHUB PROJECTS V2 API


The script uses three primary GraphQL operations to interact with GitHub Projects. First, it retrieves all items from a project using a query that fetches item IDs, content (issues and draft issues), and field values including text and single-select fields. Second, it queries the project fields to get the field IDs for "Status" and "Priority" along with their available options. Third, it creates new draft issues as project items and updates individual field values on existing items.

## 3. TASK DATA MODEL

Looking at the module structure and how tasks are created, the task data model includes identifiers like module ID and name, status and priority fields that map to single-select options in the project, and metadata like dependencies and descriptions. Tasks are created through the mutation that generates draft issues with a title and optional body text.

## 4. NOTIFICATION MECHANISM

There's no notification system implemented in this script. I don't see any amp-send.sh calls or webhook notifications—the script only synchronizes task data with the GitHub Projects board.

## 5. API CALLS

The script doesn't interact with the AI Maestro API at localhost:23000. It's limited to GitHub CLI commands for project synchronization.

## 6. SYNC LOGIC

The script reads from `.claude/orchestrator-exec-phase.local.md` as its state file, pulling module_status or module data from there. During synchronization, it compares the current task state against what's already in the project, then creates new items or updates existing ones as needed. Each sync operation gets timestamped with `last_kanban_sync`.
# Analysis of `amoa_sync_kanban.py`

## 1. EXACT KANBAN COLUMNS

**Hardcoded column names** in `STATUS_TO_COLUMN` (lines 28-40):
- `"backlog"` → `"Backlog"`
- `"todo"` → `"Todo"`
- `"assigned"` → `"In Progress"`
- `"in-progress"` → `"In Progress"`
- `"ai-review"` → `"AI Review"`
- `"human-review"` → `"Human Review"`
- `"merge-release"` → `"Merge/Release"`
- `"blocked"` → `"Blocked"`
- `"done"`/`"complete"` → `"Done"`

**Hardcoded priority values** in `PRIORITY_VALUES` (lines 43-48):
- `"critical"` → `"Critical"`
- `"high"` → `"High"`
- `"medium"` → `"Medium"`
- `"low"` → `"Low"`

These are **not configurable** - they are hardcoded constants at module level.

---

## 2. GITHUB PROJECTS V2 API

**GraphQL Queries:**

1. **`get_project_items`** (lines 97-127): Fetches items with:
   - `id` (item ID)
   - `content.number`, `content.title` (for Issues)
   - `content.title` (for DraftIssues)
   - `fieldValues` (text and single-select fields)

2. **`get_project_fields`** (lines 129-161): Gets field definitions:
   - `id`, `name` for all fields
   - `options.id`, `options.name` for single-select fields
   - Filters for `"Status"` and `"Priority"` fields only

**GraphQL Mutations:**

1. **`create_project_item`** (lines 163-188): Creates draft issue:
   ```graphql
   addProjectV2DraftIssue(input: {projectId, title, body})
   ```

2. **`update_project_item_field`** (lines 190-214): Updates single-select field:
   ```graphql
   updateProjectV2ItemFieldValue(input: {
     projectId, itemId, fieldId,
     value: { singleSelectOptionId: $optionId }
   })
   ```

---

## 3. TASK DATA MODEL

**Module/task fields** (from `sync_module_to_project`, lines 249-255):
- `id` - Module ID
- `name` - Module name
- `status` - Current status (default: `"todo"`)
- `priority` - Priority level (default: `"medium"`)
- `dependencies` - List of dependencies (optional)
- `description` - Module description (optional)

**Project item creation** (lines 289-297): Creates body with:
```markdown
**Module ID:** {module_id}
**Priority:** {priority}

**Dependencies:** {comma-separated}
{description}
```

**Task movement**: Done via `update_project_item_field` using single-select option IDs mapped from `STATUS_TO_COLUMN` and `PRIORITY_VALUES`.

---

## 4. NOTIFICATION MECHANISM

**NONE** - This script does **not** implement any notification mechanism. There are:
- No calls to `amp-send.sh`
- No HTTP requests to notification endpoints
- No message formatting for agent notifications

This script only performs **GitHub Projects synchronization**.

---

## 5. API CALLS

**NONE** - There are **no direct calls to AI Maestro API** (localhost:23000). The script:
- Uses `gh` CLI exclusively for GitHub API calls
- Reads from local file system (`EXEC_STATE_FILE` at `.claude/orchestrator-exec-phase.local.md`)
- Does not make any HTTP calls to AI Maestro

---

## 6. SYNC LOGIC

**State file location** (line 24):
```python
EXEC_STATE_FILE = Path(".claude/orchestrator-exec-phase.local.md")
```

**State tracked** (read from state file via `parse_frontmatter`, lines 53-74):
- `github_project_id` - GitHub Project ID
- `modules_status` - List of modules with status (execution phase)
- `modules` - List of modules (plan phase fallback)
- `last_kanban_sync` - Timestamp of last sync (written after sync)

**Sync flow** (lines 344-408):
1. Parse state file with YAML frontmatter
2. Get project ID from args or state file
3. Get modules from `modules_status` or `modules`
4. Fetch existing project items and fields
5. For each module:
   - Find existing item by title: `"[{module_id}] {module_name}"`
   - If exists → update Status and Priority fields
   - If not exists and `--create-missing` → create new draft issue with body
   - If not exists and no flag → mark as "missing"
6. Write `last_kanban_sync` timestamp to state file

**Dry-run support**: With `--dry-run`, no actual API calls are made (lines 269-271, 279-281).

---

## Summary Table

| Aspect | Details |
|--------|---------|
| **Kanban Columns** | Hardcoded: Backlog, Todo, In Progress, AI Review, Human Review, Merge/Release, Blocked, Done |
| **GitHub API** | GraphQL via `gh api graphql` - queries items/fields, mutations for create/update |
| **Task Fields** | id, name, status, priority, dependencies, description |
| **Notifications** | NONE - no notification mechanism |
| **AI Maestro API** | NONE - no localhost:23000 calls |
| **Sync State** | File-based (`orchestrator-exec-phase.local.md`), tracks last sync timestamp |