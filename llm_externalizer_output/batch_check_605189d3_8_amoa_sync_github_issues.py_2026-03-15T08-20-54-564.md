# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:20:54.564Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_sync_github_issues.py`
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

## `/tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_sync_github_issues.py`

### 1. Custom Kanban Columns/Statuses

This script does not define or expect custom kanban columns directly. Instead, it maps module statuses to GitHub labels, which can then be used to represent kanban columns in GitHub Projects.

### 2. GitHub Projects v2 GraphQL Operations

This script primarily uses the GitHub CLI (`gh`) which abstracts away the direct GraphQL API calls. However, based on the `gh` commands executed, we can infer the underlying GraphQL operations:

*   **Queries:**
    *   `find_existing_issue`: Performs a search for issues based on labels and title. This likely translates to a `search` query in GraphQL, filtering by `label`, `state`, and `title` (or body content). It also retrieves `number`, `title`, `labels`, and `state` for the found issues.
    *   `get_issue_labels`: Retrieves labels for a specific issue. This would involve a query to get an `Issue` node by its number and then accessing its `labels` connection.

*   **Mutations:**
    *   `ensure_label_exists`: Creates a new label if it doesn't exist. This corresponds to a `createLabel` mutation.
    *   `create_issue_for_module`: Creates a new GitHub issue. This corresponds to a `createIssue` mutation.
    *   `update_issue_labels`: Modifies labels on an existing issue (adding and removing). This would involve `addLabelsToLabelable` and `removeLabelsFromLabelable` mutations.
    *   `close_issue`: Closes a GitHub issue. This corresponds to a `closeIssue` mutation.

### 3. Status Transitions and Workflow Rules

The script enforces the following workflow rules and status transitions:

*   **Creation:** A module without an existing GitHub issue can be created as a new issue (`create_issue_for_module`). The initial status label will be based on the module's `status` field.
*   **Status Update:** If a module's status changes, the corresponding GitHub issue's status label is updated (`update_issue_labels`). This involves:
    *   Removing any existing `status:*` labels that do not match the new status.
    *   Adding the new `status:<new_status>` label.
*   **Completion/Closing:** Modules with a `status` of "complete" or "done" will have their corresponding GitHub issues closed (`close_issue`). The reason for closing is set to "completed".

### 4. Label Taxonomy and How Labels Map to Kanban Columns

The script defines a clear label taxonomy for module statuses and a general module identifier:

*   **`MODULE_LABEL`**: "module" - This label is applied to all GitHub issues created for modules, serving as a primary identifier.
*   **`STATUS_LABEL_MAP`**: This dictionary defines the mapping from internal module statuses to GitHub labels. These labels are intended to represent kanban columns or states.
    *   `planning` -> `status:planning` (Color: `BFD4F2`)
    *   `assigned` -> `status:assigned` (Color: `D4C5F9`)
    *   `in-progress` -> `status:in-progress` (Color: `FBCA04`)
    *   `review` -> `status:review` (Color: `F9D0C4`)
    *   `verified` -> `status:verified` (Color: `0E8A16`)
    *   `complete` -> `status:complete` (Color: `006B75`)
*   **`ALL_STATUS_LABELS`**: A list of all `status:*` labels, used to identify and remove stale status labels during updates.

### 5. Any Custom Fields on GitHub Project Items

The script does not directly interact with GitHub Projects v2 custom fields. It populates the issue body with structured information that could be manually parsed or used to infer custom field values if a GitHub Project were configured to do so. The fields extracted from the module and included in the issue body are:

*   **Module ID**: `module.get("id")`
*   **Status**: `module.get("status")` (also mapped to a label)
*   **Priority**: `module.get("priority")` (e.g., "medium")
*   **Assigned To**: `module.get("assigned_to")`
*   **Dependencies**: `module.get("dependencies")` (a list)
*   **Description**: `module.get("description")`

### 6. Sync Operations Between AI Maestro Kanban API and GitHub Project Boards

The script acts as a one-way synchronization tool from the AI Maestro orchestration state (which can be considered its internal kanban API/state) to GitHub Issues, which can then be visualized on GitHub Project Boards.

*   **Source of Truth**: The `.ai-maestro/orchestration-state.json` file is the source of truth for module information.
*   **Sync Direction**: AI Maestro orchestration state -> GitHub Issues.
*   **Operations Performed**:
    *   **Create Missing Issues**: If a module exists in the orchestration state but no corresponding GitHub issue is found (via `find_existing_issue`), a new issue is created (`create_issue_for_module`).
    *   **Update Status Labels**: If a module's status in the orchestration state differs from the status label on its corresponding GitHub issue, the issue's labels are updated (`update_issue_labels`).
    *   **Close Completed Issues**: If a module's status in the orchestration state is "complete" or "done", its corresponding GitHub issue is closed (`close_issue`).
*   **No Bidirectional Sync**: The script does not read changes from GitHub Issues back into the AI Maestro orchestration state. It's a push-only mechanism.

---

## Model: x-ai/grok-4.1-fast

### File: /tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_sync_github_issues.py

1. **Custom kanban columns/statuses it defines or expects (exact names and any mapping)**:
   - Status values from orchestration state (`modules_status` list in `.ai-maestro/orchestration-state.json`): `planning`, `assigned`, `in-progress`, `review`, `verified`, `complete`, `done` (treated as equivalent to `complete` for closing).
   - Mapped directly to GitHub issue labels via `STATUS_LABEL_MAP` dictionary:
     - `planning` → `status:planning`
     - `assigned` → `status:assigned`
     - `in-progress` → `status:in-progress`
     - `review` → `status:review`
     - `verified` → `status:verified`
     - `complete` → `status:complete`
   - All status labels collected in `ALL_STATUS_LABELS` list for removal of stale ones.
   - No explicit kanban columns defined; statuses are represented via issue labels, likely for use in GitHub Projects or boards filtering/grouping by labels.
   - Default status fallback: `planning`.
   - `MODULE_LABEL = "module"` applied to all module issues (not a status, but a categorization label).

2. **GitHub Projects v2 GraphQL operations it performs (mutations, queries)**:
   - None. This script uses GitHub CLI (`gh`) commands exclusively for issue management, not GraphQL or Projects v2 API.
   - Relevant `gh` commands executed via `gh_command` function:
     - `gh issue list --label module --state open --search <module_id> --json number,title,labels,state --limit 20` (in `find_existing_issue`).
     - `gh issue view <number> --json labels` (in `get_issue_labels`).
     - `gh label create <label> --color <hex> --force` (in `ensure_label_exists`).
     - `gh issue create --title <title> --body <body> --label <labels>` (in `create_issue_for_module`).
     - `gh issue edit <number> --remove-label <old_label>` (in `update_issue_labels`).
     - `gh issue edit <number> --add-label <new_label>` (in `update_issue_labels`).
     - `gh issue close <number> --reason completed` (in `close_issue`).

3. **Status transitions and workflow rules it enforces**:
   - No enforced transitions (e.g., no validation like "cannot go from planning to complete"); it blindly syncs any state from `orchestration-state.json` to labels.
   - Updates: In `update_issue_labels`, removes all existing `status:*` labels (via `labels_to_remove` filtered from `ALL_STATUS_LABELS` excluding the new one), then adds the new `status_label` from `STATUS_LABEL_MAP`. Skips if already correct.
   - Closing rule: In `main`, closes issues if module `status` is `"complete"` or `"done"` and `--close-completed` flag is set (via `close_issue`).
   - Creation: Only if no existing issue found (via `find_existing_issue` matching title containing `module_id` and `module` label) and `--create-missing` flag.
   - Operations conditional on CLI flags: `--create-missing`, `--update-labels`, `--close-completed`.
   - Dry-run mode previews without changes.
   - Label colors auto-assigned in `ensure_label_exists` based on status substring:
     | Status substring | Color   |
     |------------------|---------|
     | planning         | BFD4F2 |
     | assigned         | D4C5F9 |
     | in-progress      | FBCA04 |
     | review           | F9D0C4 |
     | verified         | 0E8A16 |
     | complete         | 006B75 |
     - Default: 0052CC.

4. **Label taxonomy and how labels map to kanban columns**:
   - Core labels:
     - `module`: Applied to **all** module issues (default categorization).
     - Status labels (`status:planning`, `status:assigned`, `status:in-progress`, `status:review`, `status:verified`, `status:complete`): One per issue, updated to match module `status`.
   - Mapping: Module `status` → label via `STATUS_LABEL_MAP` (bidirectional inference possible since labels are `status:<status>`).
   - Management:
     - Ensures labels exist before use (`ensure_label_exists`).
     - On update (`update_issue_labels`): Removes stale `status:*` labels, adds new one.
     - No other labels added/removed.
   - No explicit kanban column mapping; labels are for filtering/grouping issues into kanban views (e.g., GitHub Projects grouped by label).
   - Existing issue detection: Open issues with `module` label and title containing `module_id`.

5. **Any custom fields on GitHub project items (priority, assignee, module, etc.)**:
   - None on GitHub Projects (script does not interact with Projects v2 or custom fields).
   - Pseudo-fields embedded in issue **body** markdown table (created in `create_issue_for_module`):
     | Field          | Source from module dict                  |
     |----------------|------------------------------------------|
     | Module ID      | `module["id"]` (title also `[Module] <id>`) |
     | Status         | `module["status"]`                       |
     | Priority       | `module["priority"]` (default: `"medium"`) |
     | Assigned To    | `module["assigned_to"]` (optional)       |
     | Dependencies   | `module["dependencies"]` (optional, comma-joined) |
   - Additional body sections: `## Description` from `module["description"]`.
   - Footer: "*This issue was created by the AMOA orchestration system.*"
   - No assignees set via API (only displayed in body); no milestones, projects, or custom fields.

6. **Sync operations between AI Maestro kanban API and GitHub project boards**:
   - No AI Maestro kanban API or GitHub project boards (Projects v2); syncs **orchestration state file** (`.ai-maestro/orchestration-state.json`) → **GitHub Issues**.
   - Source: `load_state` → `get_modules` extracts `state["modules_status"]` list (each module: `{"id": str, "status": str, optional: "github_issue", "description", "priority", "assigned_to", "dependencies"}`).
   - Target: GitHub repo issues (current repo or `--repo OWNER/REPO`).
   - Sync logic in `main` (loop over modules):
     | Operation              | Condition                                      | Function Called                  | Updates State? |
     |------------------------|------------------------------------------------|----------------------------------|----------------|
     | Find existing issue    | Always (uses `module["github_issue"]` or search)| `find_existing_issue`           | No             |
     | Create issue           | No existing + `--create-missing`               | `create_issue_for_module`       | No (but extracts `issue_number` for logging) |
     | Update labels          | Existing issue + `--update-labels`             | `update_issue_labels`           | No             |
     | Close issue            | Existing + `status` in `("complete", "done")` + `--close-completed` | `close_issue` | No             |
   - One-way sync: State → GitHub (no GitHub → state updates).
   - Outputs JSON summary with `operations` list (each: `action`, `module_id`/`issue_number`, `success`, details).
   - `--dry-run`: Previews all.
   - CWD: `--project-root` (default `.`). State path: `{project_root}/.ai-maestro/orchestration-state.json`.