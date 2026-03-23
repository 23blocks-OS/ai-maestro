# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:20:58.348Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/scripts/gh-project-add-columns.py`
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

## Analysis of `/tmp/ai-maestro-orchestrator-agent-review/scripts/gh-project-add-columns.py`

This script is a utility for safely adding new columns to a GitHub Project V2 "Status" field. It focuses on preserving existing column IDs to prevent data loss.

### 1. Custom Kanban Columns/Statuses

*   **Custom Kanban Columns Defined/Expected:**
    *   The script does not define specific custom kanban columns. Instead, it *expects* a field named `"Status"` to exist in the GitHub Project V2.
    *   It takes new column names as command-line arguments via `--add <name>`, allowing the user to define any column names they wish to add.
    *   It preserves all existing column names and their associated IDs.

*   **Mapping:**
    *   There is no explicit mapping defined within the script. It operates directly on the GitHub Project V2's single-select field options.

### 2. GitHub Projects V2 GraphQL Operations

*   **Queries:**
    *   **`query($owner: String!, $number: Int!) { ... }`**: This query is used in the `main` function to retrieve information about a specific GitHub Project V2.
        *   It fetches the `id` of the project.
        *   It fetches the `id`, `name`, and `options` (including `id` and `name` for each option) of the first 20 fields associated with the project.
        *   It specifically looks for a field with the name specified by the `field_name` argument (defaulting to `"Status"`) and ensures it's a `ProjectV2SingleSelectField`.

*   **Mutations:**
    *   **`mutation($fieldId: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) { ... }`**: This mutation is used in the `main` function to update a GitHub Project V2 field.
        *   **`updateProjectV2Field`**: This is the primary mutation used.
        *   It requires `fieldId` (the ID of the field to update), `name` (the name of the field, which is preserved), and `singleSelectOptions` (an array of `ProjectV2SingleSelectFieldOptionInput` objects).
        *   Each `ProjectV2SingleSelectFieldOptionInput` object can contain an `id` (for existing options) and a `name`. New options are added by providing only a `name`.
        *   The mutation returns the `id`, `name`, and `options` (including `id` and `name`) of the updated `ProjectV2SingleSelectField` for verification.

### 3. Status Transitions and Workflow Rules

*   The script does not define or enforce any status transitions or workflow rules. Its sole purpose is to modify the available options (columns) within a single-select field.

### 4. Label Taxonomy and How Labels Map to Kanban Columns

*   The script does not interact with GitHub issue/PR labels at all. It operates exclusively on Project V2 fields.

### 5. Custom Fields on GitHub Project Items

*   **Custom Fields Expected/Modified:**
    *   The script explicitly targets a single-select custom field, defaulting to the name `"Status"`.
    *   It modifies the *options* available for this single-select field.
    *   It does not define or interact with other types of custom fields (e.g., priority, assignee, module).

### 6. Sync Operations between AI Maestro Kanban API and GitHub Project Boards

*   The script is a standalone utility that uses the `gh` CLI to interact with GitHub's GraphQL API.
*   It does not contain any code for syncing with an "AI Maestro kanban API." It's a tool that could be *used by* an AI Maestro orchestrator agent, but it doesn't implement the sync itself.

---

## Model: x-ai/grok-4.1-fast

### /tmp/ai-maestro-orchestrator-agent-review/scripts/gh-project-add-columns.py

1. **Custom kanban columns/statuses it defines or expects (exact names and any mapping)**:
   - No hardcoded custom kanban columns or statuses defined.
   - Expects an existing `ProjectV2SingleSelectField` named `"Status"` (default via `--field` arg) with existing options (columns) that must be preserved by ID.
   - Adds arbitrary new columns via `--add <name>` (repeated), skipping duplicates based on name matching.
   - Preserves all existing option IDs and names; new options added as `{"name": "<new_col>"}` without IDs (GitHub auto-generates).
   - No mappings defined; treats options as opaque names/IDs.

2. **GitHub Projects v2 GraphQL operations it performs (mutations, queries)**:
   - **Query** (unnamed, inline):
     ```
     query($owner: String!, $number: Int!) {
       user(login: $owner) {
         projectV2(number: $number) {
           id
           fields(first: 20) {
             nodes {
               ... on ProjectV2SingleSelectField {
                 id
                 name
                 options {
                   id
                   name
                 }
               }
             }
           }
         }
       }
     }
     ```
     - Fetches `user.projectV2.fields.nodes` filtered to `ProjectV2SingleSelectField` matching `--field` name; extracts `id`, `name`, `options {id, name}`.
   - **Mutation** (`updateProjectV2Field`):
     ```
     mutation($fieldId: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
       updateProjectV2Field(input: {
         fieldId: $fieldId
         name: $name
         singleSelectOptions: $options
       }) {
         projectV2Field {
           ... on ProjectV2SingleSelectField {
             id
             name
             options {
               id
               name
             }
           }
         }
       }
     }
     ```
     - Updates the field's `name` and fully replaces `singleSelectOptions` with preserved existing `[{"id": "...", "name": "..."}]` + new `[{"name": "..."}]`.
     - Re-queries post-mutation to verify option preservation.

3. **Status transitions and workflow rules it enforces**:
   - None. Script only adds options (columns) to the field; no transitions, assignments, or rules enforced.
   - Verifies post-update that all pre-existing option `id`s remain (warns if not, to prevent item column loss).

4. **Label taxonomy and how labels map to kanban columns**:
   - None. No labels referenced, parsed, or mapped.

5. **Any custom fields on GitHub project items (priority, assignee, module, etc.)**:
   - None beyond targeting one `ProjectV2SingleSelectField` (expects `"Status"` by default).
   - Queries all `projectV2.fields(first: 20)` but only processes the matching single-select field.

6. **Sync operations between AI Maestro kanban API and GitHub project boards**:
   - None. Standalone setup script using `gh` CLI (`gh api graphql`); no AI Maestro API integration, no sync logic, no ongoing polling/updates. One-time mutation to add columns.