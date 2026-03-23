# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:20:54.458Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_sync_kanban.py`
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

## `/tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_sync_kanban.py`

### 1. Custom kanban columns/statuses it defines or expects (exact names and any mapping)

The script defines a mapping from internal status names to GitHub Project column names in the `STATUS_TO_COLUMN` dictionary:

-   **Internal Status**: `backlog` -> **GitHub Column**: `Backlog`
-   **Internal Status**: `todo` -> **GitHub Column**: `Todo`
-   **Internal Status**: `assigned` -> **GitHub Column**: `In Progress`
-   **Internal Status**: `in-progress` -> **GitHub Column**: `In Progress`
-   **Internal Status**: `ai-review` -> **GitHub Column**: `AI Review`
-   **Internal Status**: `human-review` -> **GitHub Column**: `Human Review`
-   **Internal Status**: `merge-release` -> **GitHub Column**: `Merge/Release`
-   **Internal Status**: `blocked` -> **GitHub Column**: `Blocked`
-   **Internal Status**: `done` -> **GitHub Column**: `Done`
-   **Internal Status**: `complete` -> **GitHub Column**: `Done`

The default status for a module if not specified is `todo`, which maps to the `Todo` column.

### 2. GitHub Projects v2 GraphQL operations it performs (mutations, queries)

**Queries:**

-   **`get_project_items`**:
    -   Retrieves `id`, `content` (issue number, title for issues; title for draft issues), and `fieldValues` (text and single-select values) for up to 100 items from a specified ProjectV2.
    -   GraphQL Query Name: `query($projectId: ID!)`
    -   Fields retrieved: `id`, `content { number, title }`, `fieldValues { text, name, field { name } }`
-   **`get_project_fields`**:
    -   Retrieves `id`, `name` for all fields, and `options { id, name }` for `ProjectV2SingleSelectField` types (specifically looking for "Status" and "Priority" fields) from a specified ProjectV2.
    -   GraphQL Query Name: `query($projectId: ID!)`
    -   Fields retrieved: `id`, `name`, `options { id, name }`

**Mutations:**

-   **`create_project_item`**:
    -   Creates a new draft issue in a specified ProjectV2 with a given `title` and `body`.
    -   GraphQL Mutation Name: `addProjectV2DraftIssue`
    -   Input variables: `projectId`, `title`, `body`
    -   Returns: `projectItem { id }`
-   **`update_project_item_field`**:
    -   Updates a single-select field value for a specific project item within a ProjectV2.
    -   GraphQL Mutation Name: `updateProjectV2ItemFieldValue`
    -   Input variables: `projectId`, `itemId`, `fieldId`, `value { singleSelectOptionId }`
    -   Returns: `projectV2Item { id }`

### 3. Status transitions and workflow rules it enforces

The script does not explicitly define or enforce status transitions or complex workflow rules. It performs direct updates to the "Status" field based on the `status` attribute of the module data.

-   When `sync_module_to_project` is called, it takes the `status` from the module data (e.g., `module.get("status", "todo")`) and maps it to a GitHub Project column name using `STATUS_TO_COLUMN`.
-   It then attempts to update the "Status" field of the corresponding GitHub Project item to that column.
-   There are no checks for valid transitions (e.g., preventing a direct jump from "Backlog" to "Done" without passing through "In Progress").

### 4. Label taxonomy and how labels map to kanban columns

The script **does not use GitHub labels** for kanban column mapping. It relies entirely on a custom "Status" single-select field within the GitHub Project.

### 5. Any custom fields on GitHub project items (priority, assignee, module, etc.)

The script explicitly interacts with two custom fields on GitHub Project items:

-   **Status**: This is a single-select field. The script expects options corresponding to the values in `STATUS_TO_COLUMN` (e.g., "Backlog", "Todo", "In Progress", "AI Review", "Human Review", "Merge/Release", "Blocked", "Done").
-   **Priority**: This is a single-select field. The script defines a mapping for priority values in `PRIORITY_VALUES`:
    -   **Internal Priority**: `critical` -> **GitHub Priority Option**: `Critical`
    -   **Internal Priority**: `high` -> **GitHub Priority Option**: `High`
    -   **Internal Priority**: `medium` -> **GitHub Priority Option**: `Medium`
    -   **Internal Priority**: `low` -> **GitHub Priority Option**: `Low`
    The default priority for a module if not specified is `medium`, which maps to the `Medium` option.

The script also creates a `body` for new draft issues that includes "Module ID" and "Priority" as bolded text, and optionally "Dependencies" and a "description". This is not a custom field but rather structured content within the item's description.

### 6. Sync operations between AI Maestro kanban API and GitHub project boards

The script acts as a one-way synchronization from AI Maestro's internal module state to a GitHub Project board.

-   **Source of Truth**: The AI Maestro orchestration state file (`.claude/orchestrator-exec-phase.local.md`) is the source of truth for module data, including `id`, `name`, `status`, `priority`, `dependencies`, and `description`.
-   **Target**: A specified GitHub Project (ProjectV2).
-   **Synchronization Logic (`sync_module_to_project`)**:
    1.  Reads `modules` (or `modules_status`) from the AI Maestro state file.
    2.  For each module, it constructs a `title` for the GitHub Project item in the format `[module_id] module_name`.
    3.  It attempts to find an existing GitHub Project item with this exact title.
    4.  **If an item exists**:
        -   It updates the "Status" custom field based on the module's `status` (mapped via `STATUS_TO_COLUMN`).
        -   It updates the "Priority" custom field based on the module's `priority` (mapped via `PRIORITY_VALUES`).
    5.  **If an item does not exist and `--create-missing` is enabled**:
        -   It creates a new draft issue in the GitHub Project with the constructed `title` and a `body` containing module details (ID, Priority, Dependencies, Description).
        -   After creation, it updates the "Status" and "Priority" custom fields of the newly created item based on the module's data.
    6.  **If an item does not exist and `--create-missing` is *not* enabled**:
        -   The module is reported as "missing" and no action is taken on GitHub.
-   **State File Update**: After a successful sync (not a dry run), the `last_kanban_sync` timestamp in the AI Maestro state file is updated.
-   **Direction**: The sync is unidirectional: AI Maestro module state -> GitHub Project. Changes made directly in GitHub Project are not pulled back into the AI Maestro state by this script.

---

## Model: x-ai/grok-4.1-fast

### File: /tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_sync_kanban.py

1. **Custom kanban columns/statuses it defines or expects (exact names and any mapping)**:
   - Internal AI Maestro statuses (from module dict `status` field): `"backlog"`, `"todo"`, `"assigned"`, `"in-progress"`, `"ai-review"`, `"human-review"`, `"merge-release"`, `"blocked"`, `"done"`, `"complete"`.
   - Mapped to GitHub ProjectV2 "Status" field single-select options (exact column names): `"Backlog"`, `"Todo"`, `"In Progress"`, `"AI Review"`, `"Human Review"`, `"Merge/Release"`, `"Blocked"`, `"Done"`.
   - Full mapping in `STATUS_TO_COLUMN` dict:
     | Internal Status   | GitHub Column     |
     |-------------------|-------------------|
     | `"backlog"`      | `"Backlog"`      |
     | `"todo"`         | `"Todo"`         |
     | `"assigned"`     | `"In Progress"`  |
     | `"in-progress"`  | `"In Progress"`  |
     | `"ai-review"`    | `"AI Review"`    |
     | `"human-review"` | `"Human Review"` |
     | `"merge-release"`| `"Merge/Release"`|
     | `"blocked"`      | `"Blocked"`      |
     | `"done"`         | `"Done"`         |
     | `"complete"`     | `"Done"`         |
   - Default fallback for unmapped status: `"Todo"`.
   - Internal priorities (from module dict `priority` field, default `"medium"`): `"critical"`, `"high"`, `"medium"`, `"low"`.
   - Mapped to GitHub ProjectV2 "Priority" field single-select options in `PRIORITY_VALUES` dict:
     | Internal Priority | GitHub Option |
     |-------------------|---------------|
     | `"critical"`     | `"Critical"` |
     | `"high"`         | `"High"`     |
     | `"medium"`       | `"Medium"`   |
     | `"low"`          | `"Low"`      |
   - Default fallback for unmapped priority: `"Medium"`.

2. **GitHub Projects v2 GraphQL operations it performs (mutations, queries)**:
   - **Queries**:
     - `get_project_items`: GraphQL query `query($projectId: ID!) { node(id: $projectId) { ... on ProjectV2 { items(first: 100) { nodes { id content { ... on Issue { number title } ... on DraftIssue { title } } fieldValues(first: 10) { nodes { ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } } ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } } } } } } } }`. Fetches all project items (up to 100), their content (Issue/DraftIssue titles), and field values (text/single-select).
     - `get_project_fields`: GraphQL query `query($projectId: ID!) { node(id: $projectId) { ... on ProjectV2 { fields(first: 20) { nodes { ... on ProjectV2Field { id name } ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }`. Fetches project fields (up to 20), focusing on single-select fields like "Status" and "Priority" with their option IDs.
   - **Mutations**:
     - `create_project_item`: GraphQL mutation `mutation($projectId: ID!, $title: String!, $body: String) { addProjectV2DraftIssue(input: {projectId: $projectId, title: $title, body: $body}) { projectItem { id } } }`. Creates a new DraftIssue in the project and returns its projectItem ID.
     - `update_project_item_field`: GraphQL mutation `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) { updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { singleSelectOptionId: $optionId } }) { projectV2Item { id } } }`. Updates a single-select field (e.g., Status or Priority) on a project item to a specific option ID.

3. **Status transitions and workflow rules it enforces**:
   - No explicit status transitions or workflow rules enforced (e.g., no validation of allowed moves, no automation of sequences).
   - Sync is one-way overwrite: Directly sets GitHub "Status" to mapped column from module `status` (via `sync_module_to_project` -> `update_project_item_field`).
   - Sync is one-way overwrite: Directly sets GitHub "Priority" to mapped value from module `priority`.
   - No blocking, validation, or conditional logic on transitions (e.g., allows jumping from "backlog" to "done" directly).
   - Item matching is strict by exact title `"[module_id] {module_name}"` in `find_item_by_title`.

4. **Label taxonomy and how labels map to kanban columns**:
   - No labels used, referenced, or mapped anywhere in the code.
   - No GitHub issue labels queried, created, or synchronized.
   - Kanban relies solely on ProjectV2 "Status" single-select field, not labels.

5. **Any custom fields on GitHub project items (priority, assignee, module, etc.)**:
   - `"Status"`: Single-select field (expects options matching mapped columns: "Backlog", "Todo", "In Progress", "AI Review", "Human Review", "Merge/Release", "Blocked", "Done"). ID and options fetched via `get_project_fields`.
   - `"Priority"`: Single-select field (expects options: "Critical", "High", "Medium", "Low"). ID and options fetched via `get_project_fields`.
   - No other custom fields read, written, or assumed (e.g., no assignee, module, dependencies, description fields).
   - Project items are DraftIssues with:
     - Title: `"[module_id] {module_name}"`.
     - Body (on create): Includes `**Module ID:** {module_id}`, `**Priority:** {priority}`, `**Dependencies:** {comma-joined list}` (if present), `{module.description}` (if present).
   - Field values are read generically but only "Status" and "Priority" are updated.

6. **Sync operations between AI Maestro kanban API and GitHub project boards**:
   - **Direction**: One-way from AI Maestro local state to GitHub ProjectV2 (no reverse sync).
   - **Source**: Parses YAML frontmatter from `EXEC_STATE_FILE` (`.claude/orchestrator-exec-phase.local.md`). Loads `modules_status` list (preferred) or fallback `modules` list. Each module dict has keys: `id`, `name`, `status` (default "todo"), `priority` (default "medium"), `dependencies` (list), `description` (str).
   - **Target**: GitHub ProjectV2 (ID from `--project-id` arg or state `github_project_id`).
   - **Core logic** in `sync_module_to_project` (called per module in `main`):
     | Action          | Condition                          | Operations |
     |-----------------|------------------------------------|------------|
     | Update         | Existing item found by title      | Fetch fields/items once upfront; update "Status" and "Priority" via `update_project_item_field`. |
     | Create         | `--create-missing` + no existing  | `create_project_item` (DraftIssue); then set "Status"/"Priority". |
     | Skip (missing) | No existing + no `--create-missing`| Log as "missing". |
   - **Modes**:
     - `--dry-run`: Simulates (fetches fields/items but skips mutations), logs actions.
     - `--create-missing`: Enables creation of missing items.
   - **Post-sync**: Updates state file with `"last_kanban_sync": ISO UTC timestamp` via `write_state_file`.
   - **Item lifecycle**: Matches/creates DraftIssues (not published Issues); no deletion or archival.
   - **Error handling**: Skips failed updates/creates; continues with others. Requires `gh` CLI.
   - **Output**: JSON or human-readable summary (updated/created/missing/failed counts).