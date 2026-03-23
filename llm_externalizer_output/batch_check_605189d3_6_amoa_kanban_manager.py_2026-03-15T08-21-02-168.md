# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:21:02.168Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_kanban_manager.py`
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

## `/tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_kanban_manager.py`

### 1. Custom kanban columns/statuses it defines or expects (exact names and any mapping)

The plugin defines the following kanban columns and their internal keys:

*   **Internal Key**: `backlog` -> **Display Name**: `Backlog`
*   **Internal Key**: `todo` -> **Display Name**: `Todo`
*   **Internal Key**: `in-progress` -> **Display Name**: `In Progress`
*   **Internal Key**: `ai-review` -> **Display Name**: `AI Review`
*   **Internal Key**: `human-review` -> **Display Name**: `Human Review`
*   **Internal Key**: `merge-release` -> **Display Name**: `Merge/Release`
*   **Internal Key**: `done` -> **Display Name**: `Done`
*   **Internal Key**: `blocked` -> **Display Name**: `Blocked`

These are defined in the `KANBAN_COLUMNS` dictionary.

### 2. GitHub Projects v2 GraphQL operations it performs (mutations, queries)

The plugin primarily uses the `gh` CLI tool, which abstracts away the direct GraphQL operations. However, based on the `gh` commands used, we can infer the underlying GitHub API interactions, which for Projects v2 would typically involve GraphQL.

**Inferred GraphQL Operations (via `gh` CLI commands):**

*   **`create_task_issue` function:**
    *   `gh issue create`: Implies a mutation to create an issue, which then can be added to a project.
*   **`assign_task_to_agent` function:**
    *   `gh issue view --json labels`: Implies a query to fetch issue details, specifically labels.
    *   `gh issue edit --remove-label`: Implies a mutation to remove labels from an issue.
    *   `gh issue edit --add-label`: Implies a mutation to add labels to an issue.
    *   `gh issue view --json title,labels`: Implies a query to fetch issue title and labels.
*   **`update_task_status` function:**
    *   `gh issue view --json labels`: Implies a query to fetch issue details, specifically labels.
    *   `gh issue edit --remove-label`: Implies a mutation to remove labels from an issue.
    *   `gh issue edit --add-label`: Implies a mutation to add labels to an issue.
    *   `gh issue view --json title`: Implies a query to fetch issue title.
*   **`close_issue_safely` function:**
    *   `gh issue view --json state`: Implies a query to fetch issue state.
    *   `gh issue close`: Implies a mutation to close an issue.
*   **`set_task_dependency` function:**
    *   `gh issue edit --add-label`: Implies a mutation to add labels to an issue.
    *   `gh issue comment`: Implies a mutation to add a comment to an issue.
*   **`check_dependencies_resolved` function:**
    *   `gh issue view --json state`: Implies a query to fetch issue state for multiple issues.
*   **`get_ready_tasks` function:**
    *   `gh issue list --state open --json number,title,labels,body`: Implies a query to list open issues with specific fields.

The plugin does not directly use GitHub Projects v2 GraphQL mutations or queries, but rather relies on the `gh` CLI which interacts with the GitHub API (including Projects v2 for project-related actions, though the code primarily manipulates issues and labels). The `GITHUB_PROJECT_ID` environment variable is defined but not explicitly used in the provided code for direct Projects v2 GraphQL operations, suggesting that project item management (like moving items between columns) might be handled implicitly by GitHub's automation based on issue labels or state, or by other parts of the `gh` CLI not explicitly detailed here.

### 3. Status transitions and workflow rules it enforces

The plugin enforces workflow rules primarily through label manipulation and issue state changes:

*   **Status Update (`update_task_status` function):**
    *   When `update_task_status` is called with a new status, it first removes any existing `status:<old_status>` labels and then adds `status:<new_status>`.
    *   **Transition to "done":** If a task's status is updated to `"done"`, the `close_issue_safely` function is called. This function attempts to close the GitHub issue. It first checks if the issue is already closed (e.g., by GitHub's Projects v2 automation when an item moves to a "Done" column) to avoid redundant operations.
*   **Dependency Management (`set_task_dependency` and `check_dependencies_resolved` functions):**
    *   When `set_task_dependency` is called, it adds a `blocked` label to the issue and adds a comment indicating which issues it is blocked by.
    *   The `get_ready_tasks` function explicitly checks for the presence of the `blocked` label or `status:blocked` label to determine if a task is *not* ready.
    *   `check_dependencies_resolved` checks if all blocking issues are in a "CLOSED" state.
*   **Task Readiness (`get_ready_tasks` function):**
    *   A task is considered "ready" if:
        *   It is assigned to an agent (has an `assign:<agent_name>` label).
        *   It is *not* `blocked` (no `blocked` or `status:blocked` label).
        *   It is *not* already `in-progress` or `ai-review` (no `status:in-progress` or `status:ai-review` label).
        *   It is in the `todo` status or has no explicit status label (implying `backlog` or `todo` by default).
*   **Assignment (`assign_task_to_agent` function):**
    *   When a task is assigned, any existing `assign:*` labels are removed, and a new `assign:<agent_name>` label is added.

### 4. Label taxonomy and how labels map to kanban columns

The plugin uses a label-based system to represent kanban statuses and other task attributes.

**Label Prefixes and Their Meanings:**

*   **`status:<kanban_column_key>`**: Used to indicate the current kanban status of an issue.
    *   Examples: `status:backlog`, `status:todo`, `status:in-progress`, `status:ai-review`, `status:human-review`, `status:merge-release`, `status:done`, `status:blocked`.
    *   The `update_task_status` function manages these labels.
*   **`assign:<agent_name>`**: Used to indicate which agent a task is assigned to.
    *   Examples: `assign:agent-alpha`, `assign:agent-beta`.
    *   The `create_task_issue` and `assign_task_to_agent` functions manage these labels.
*   **`priority:<priority_level>`**: Used to indicate the priority of a task.
    *   Examples: `priority:normal`, `priority:high`, `priority:low`.
    *   The `create_task_issue` function sets this label.
*   **`blocked`**: A standalone label used to indicate that a task is blocked by dependencies.
    *   The `set_task_dependency` function adds this label.
    *   The `get_ready_tasks` function checks for this label.

**Mapping to Kanban Columns:**

The `KANBAN_COLUMNS` dictionary defines the canonical set of statuses. The plugin expects these to be represented by `status:` prefixed labels on GitHub issues.

*   `backlog` -> `status:backlog`
*   `todo` -> `status:todo`
*   `in-progress` -> `status:in-progress`
*   `ai-review` -> `status:ai-review`
*   `human-review` -> `status:human-review`
*   `merge-release` -> `status:merge-release`
*   `done` -> `status:done`
*   `blocked` -> `status:blocked` (though a standalone `blocked` label is also used for dependency tracking).

### 5. Any custom fields on GitHub project items (priority, assignee, module, etc.)

The plugin does not explicitly define or interact with GitHub Projects v2 *custom fields* in the GraphQL sense. Instead, it uses GitHub **issue labels** and **issue body content** to store and manage custom attributes:

*   **Priority**: Stored as an issue label (e.g., `priority:normal`, `priority:high`).
*   **Assignee**: Stored as an issue label (e.g., `assign:agent-name`). Also recorded in the "Task Assignment" section of the issue body.
*   **Dependencies**: Indicated by a `blocked` label and detailed in a comment and the "Task Assignment" section of the issue body.
*   **Assigned At**: Recorded in the "Task Assignment" section of the issue body.
*   **Assigned By**: Recorded in the "Task Assignment" section of the issue body.
*   **Task Requirements Document**: If provided, its content is appended to the issue body.

### 6. Sync operations between AI Maestro kanban API and GitHub project boards

The plugin integrates with an AI Maestro sync API (via `amoa_aimaestro_sync` module) for synchronization.

*   **`create_task_issue` function:**
    *   After a new GitHub issue is created, `sync_task` is called to sync the new task to AI Maestro.
    *   It sends the `team_id`, `issue_number`, `issue_title`, initial `status` ("todo"), `agent_id`, and `priority`.
*   **`assign_task_to_agent` function:**
    *   After an agent is assigned (or reassigned) to a task, `sync_task` is called to update the assignment in AI Maestro.
    *   It sends the `team_id`, `issue_number`, `issue_title`, current `status` (derived from labels), and the new `agent_id`.
*   **`update_task_status` function:**
    *   After a task's status label is updated on GitHub, `sync_task` is called to reflect this change in AI Maestro.
    *   It sends the `team_id`, `issue_number`, `issue_title`, and the new `status`.
*   **`sync-to-aimaestro` command (`main` function):**
    *   The `bulk_sync` function (from `amoa_aimaestro_sync`) is called to perform a full synchronization from GitHub to AI Maestro.
    *   After `bulk_sync` completes, `notify_sync_result` is called to report the outcome of the sync operation to AI Maestro.

---

## Model: x-ai/grok-4.1-fast

### File: /tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_kanban_manager.py

#### 1. Custom kanban columns/statuses it defines or expects (exact names and any mapping)
- Defined in `KANBAN_COLUMNS` dictionary (keys are internal status identifiers used in code/labels; values are expected GitHub project column display names):
  | Internal Key | Display Name     |
  |--------------|------------------|
  | backlog     | Backlog         |
  | todo        | Todo            |
  | in-progress | In Progress     |
  | ai-review   | AI Review       |
  | human-review| Human Review    |
  | merge-release | Merge/Release |
  | done        | Done            |
  | blocked     | Blocked         |
- Valid statuses for `update_task_status` and `--status` arg: exactly `list(KANBAN_COLUMNS.keys())` = `['backlog', 'todo', 'in-progress', 'ai-review', 'human-review', 'merge-release', 'done', 'blocked']`.
- Defaults/mappings:
  - New tasks (`create_task_issue`): defaults to `status="todo"` for `sync_task`.
  - Reassignment (`assign_task_to_agent`): defaults to `status="backlog"` if no `status:*` label exists; otherwise extracts from existing `status:*` label via `lbl["name"].removeprefix("status:")`.
  - No status label: treated as `todo` in `get_ready_tasks` (`is_todo = "status:todo" in labels or not any(label.startswith("status:") for label in labels)`).

#### 2. GitHub Projects v2 GraphQL operations it performs (mutations, queries)
- **None directly**. All GitHub interactions use `gh` CLI commands via `run_gh_command` (e.g., `gh issue create`, `gh issue edit`, `gh issue view`, `gh issue list`, `gh issue close`, `gh issue comment`).
- Indirect Projects v2 relevance:
  - Checks `project` and `read:project` scopes in `check_gh_project_scopes` (via `gh auth status`), required for any Projects v2 ops, but no project-specific `gh project` commands executed.
  - Assumes Projects v2 auto-closes issues when moved to "Done" column (`close_issue_safely` guards against this).
  - `PROJECT_ID` env var defined but unused.
- No raw GraphQL queries/mutations; `gh` CLI handles them internally for issues (Projects v2 integration implied but not explicit).

#### 3. Status transitions and workflow rules it enforces
- **Transitions** (`update_task_status`): Fully flexible—any valid status (`KANBAN_COLUMNS.keys()`) to any other. Enforces:
  - Remove **all** existing `status:*` labels first (`status_labels = [f"status:{s}" for s in KANBAN_COLUMNS.keys()]`; removes matches).
  - Add single new `status:{new_status}` label.
  - Invalid status: error (`if status not in KANBAN_COLUMNS`).
- **Special rules**:
  - `done`: After label update, calls `close_issue_safely` to close issue (checks `state` via `gh issue view --json state`; skips if already `CLOSED`; assumes Projects v2 "Done" column auto-close).
  - `get_ready_tasks`: Filters open issues (`--state open`) for "ready":
    | Condition              | Ready? |
    |------------------------|--------|
    | Has `assign:*` label   | Yes (extract `assigned_agent`) |
    | `blocked` label or `status:blocked` | No    |
    | `status:in-progress` or `status:ai-review` | No |
    | `status:todo` or **no `status:*` label** | Yes (`is_todo`) |
    | Agent in registry      | Yes    |
  - `check_dependencies_resolved`: All deps must be `CLOSED` (`gh issue view --json state` per dep).
  - `set_task_dependency`: Adds plain `blocked` label + comment; no status change.
- No cyclic/sequence enforcement beyond ready-task logic; CLI `choices=list(KANBAN_COLUMNS.keys())` for `--status`.

#### 4. Label taxonomy and how labels map to kanban columns
- **Full taxonomy** (all labels read/written):
  | Label Pattern          | Purpose                  | Read In                  | Written In                  | Maps To Column/Status? |
  |------------------------|--------------------------|--------------------------|-----------------------------|------------------------|
  | `assign:{agent_name}` (e.g., `assign:integrator`) | Assignee/agent          | `get_ready_tasks`, `assign_task_to_agent` (removes prior `assign:*`) | `create_task_issue`, `assign_task_to_agent` (removes prior `assign:*`) | No (assignee field)   |
  | `priority:{priority}` (e.g., `priority:normal`, `priority:high`) | Priority level          | N/A                     | `create_task_issue`         | No (priority field)   |
  | `status:{key}` (e.g., `status:todo`, `status:done`; keys from `KANBAN_COLUMNS`) | Kanban column/status    | `get_ready_tasks`, `assign_task_to_agent`, `update_task_status` | `update_task_status`        | **Yes**: `status:{key}` → column `KANBAN_COLUMNS[key]` (e.g., `status:todo` → "Todo") |
  | `blocked` (plain)     | Blocked/dependency state| `get_ready_tasks`       | `set_task_dependency`       | Partial (treated as blocked; separate from `status:blocked`) |
- **Label-to-column mapping**: Exclusive via `status:{key}` → `KANBAN_COLUMNS[key]` display name. Extraction: `lbl["name"].removeprefix("status:")`.
- Label ops always via `gh issue view --json labels`, `gh issue edit --add-label/--remove-label`.

#### 5. Any custom fields on GitHub project items (priority, assignee, module, etc.)
- **None**. No `gh project` commands, no project item/field updates (e.g., no `--field`, no GraphQL for `ProjectV2ItemField*`).
- Fields simulated via **issue labels** (not project custom fields):
  | Field      | Via Label Pattern       | Values/Example                  |
  |------------|-------------------------|---------------------------------|
  | Assignee  | `assign:{agent_name}`  | `assign:integrator`            |
  | Priority  | `priority:{priority}`  | `priority:normal`, `priority:high` (from `--priority` arg) |
  | Status    | `status:{key}`         | `status:todo` → "Todo" column  |
  | Blocked   | `blocked`              | Boolean (plain label)          |
- No mentions of project custom fields like priority, assignee, module, etc. (e.g., no `ProjectV2FieldConfiguration`).

#### 6. Sync operations between AI Maestro kanban API and GitHub project boards
- **Direction**: GitHub → AI Maestro (one-way; no GitHub pulls from AI Maestro).
- **Functions** (from `amoa_aimaestro_sync`; called conditionally if `TEAM_ID` set):
  | Function              | Triggered In                  | Parameters                                      | Notes |
  |-----------------------|-------------------------------|-------------------------------------------------|-------|
  | `sync_task(...)`     | `create_task_issue`          | `team_id=TEAM_ID`, `issue_number`, `issue_title=title`, `status="todo"`, `agent_id=assigned_agent`, `priority=priority` | After issue creation. |
  | `sync_task(...)`     | `assign_task_to_agent`       | `team_id=TEAM_ID`, `issue_number`, `issue_title` (from `gh issue view --json title,labels`), `status` ("backlog" or from `status:*` label), `agent_id=agent_name` | After label update. |
  | `sync_task(...)`     | `update_task_status`         | `team_id=TEAM_ID`, `issue_number`, `issue_title` (from `gh issue view --json title`), `status=new_status` | After label update (no `agent_id`/`priority`). |
  | `bulk_sync(team_id)` | `main()` ("sync-to-aimaestro") | `team_id` (CLI `--team-id` or `TEAM_ID`)       | Full GitHub → AI Maestro sync; returns `counts` dict. |
  | `notify_sync_result(team_id, counts)` | After `bulk_sync`           | `team_id`, `counts` (from `bulk_sync`)         | Notifies AI Maestro of sync results. |
- Usage comment mentions `sync-from-github` but unimplemented (no parser).
- Agent notifications: `send_ai_maestro_message` via `amp-send` CLI to `ai_maestro_address` (from `team-registry.json`); types: `"task-assignment"`, `"pr-review-request"`. Not kanban sync.
- No project board sync (e.g., no adding items to `PROJECT_ID` or column moves).