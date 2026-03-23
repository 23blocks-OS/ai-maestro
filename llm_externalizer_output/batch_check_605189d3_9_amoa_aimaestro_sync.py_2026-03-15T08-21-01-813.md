# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:21:01.813Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_aimaestro_sync.py`
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

### `/tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_aimaestro_sync.py`

1.  **Custom kanban columns/statuses it defines or expects:**
    *   **AMOA 8-column kanban statuses (internal representation):**
        *   `backlog`
        *   `todo`
        *   `in-progress`
        *   `ai-review`
        *   `human-review`
        *   `merge-release`
        *   `done`
        *   `blocked`
    *   **AI Maestro status keys (external API representation):**
        *   `backlog`
        *   `todo`
        *   `in-progress`
        *   `ai-review`
        *   `human-review`
        *   `merge-release`
        *   `done`
        *   `blocked`
    *   **Mapping:** The `AMOA_TO_AIMAESTRO_STATUS` and `AIMAESTRO_TO_AMOA_STATUS` dictionaries show a direct 1:1 mapping between the AMOA internal kanban column names and the AI Maestro status keys.

2.  **GitHub Projects v2 GraphQL operations it performs:**
    *   This script does **not** directly perform GitHub Projects v2 GraphQL operations. It uses the GitHub CLI (`gh`) to interact with GitHub issues.
    *   **GitHub CLI operations:**
        *   `gh issue list --json number,title,labels,state,assignees`: This command is used in the `get_github_issues` function to retrieve issue data, including number, title, labels, state, and assignees. This implicitly queries GitHub's issue API, which is distinct from the Projects v2 GraphQL API.

3.  **Status transitions and workflow rules it enforces:**
    *   **`sync_task` function:**
        *   When `status` is "blocked", it records the `previousStatus` in the AI Maestro task data. This implies a workflow rule where the previous status is relevant when an item becomes blocked.
        *   When `status` is "done", it sets `completedAt` to the current UTC time. This implies a workflow rule for marking task completion.

4.  **Label taxonomy and how labels map to kanban columns:**
    *   **`extract_status_from_labels` function:**
        *   Labels starting with `status:` are used to determine the AMOA kanban status.
        *   Example: A label `status:in-progress` maps to the `in-progress` status.
        *   Default status if no `status:` label is found: `backlog`.
    *   **`extract_agent_from_labels` function:**
        *   Labels starting with `assign:` are used to extract the assigned agent ID.
        *   Example: A label `assign:agent-name` maps to the `agent-name` agent ID.
    *   **`extract_priority_from_labels` function:**
        *   Labels starting with `priority:` are used to extract the priority level.
        *   Example: A label `priority:high` maps to the `high` priority.
        *   Default priority if no `priority:` label is found: `normal`.
    *   **`sync_task` function:**
        *   All labels associated with a GitHub issue are passed directly to the AI Maestro task as `labels`.

5.  **Any custom fields on GitHub project items:**
    *   This script does not directly interact with GitHub Projects v2 custom fields. Instead, it derives custom field-like information from GitHub issue labels:
        *   **Status:** Derived from `status:` labels.
        *   **Assignee Agent ID:** Derived from `assign:` labels. (Note: This is distinct from GitHub's native assignee field, though the `gh issue list` command does retrieve `assignees`).
        *   **Priority:** Derived from `priority:` labels.

6.  **Sync operations between AI Maestro kanban API and GitHub project boards:**
    *   **`sync_task` function:**
        *   **Direction:** GitHub Issue (via `gh issue list`) → AI Maestro Task API.
        *   **Operation:** "Upsert" (create or update) a single task in AI Maestro.
        *   **Data synced:**
            *   `subject` (from GitHub issue title)
            *   `status` (derived from GitHub issue labels using `extract_status_from_labels`)
            *   `externalRef` (constructed from GitHub issue URL: `https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/issues/{issue_number}`)
            *   `priority` (derived from GitHub issue labels using `extract_priority_from_labels`)
            *   `assigneeAgentId` (if an agent is extracted from labels using `extract_agent_from_labels`)
            *   `labels` (all GitHub issue labels)
            *   `previousStatus` (if the new status is "blocked")
            *   `completedAt` (if the new status is "done")
        *   **Tool:** Uses `aimaestro-task.sh upsert` command.
    *   **`bulk_sync` function:**
        *   **Direction:** GitHub Issues (via `gh issue list`) → AI Maestro Task API.
        *   **Operation:** Full reconciliation.
        *   **Process:**
            1.  Fetches all open/closed GitHub issues.
            2.  Fetches all AI Maestro tasks for a given team.
            3.  Iterates through GitHub issues:
                *   Extracts status, agent, and priority from issue labels.
                *   Calls `sync_task` for each issue to create or update the corresponding AI Maestro task.
                *   Tracks "created" and "updated" counts.
            4.  Identifies "orphaned" AI Maestro tasks (those remaining in AI Maestro's list after all GitHub issues have been processed, implying they no longer have a GitHub counterpart).
        *   **Tool:** Uses `gh issue list` and `aimaestro-task.sh list` and `aimaestro-task.sh upsert`.
    *   **`get_aimaestro_tasks` function:**
        *   **Direction:** AI Maestro Task API → Local script.
        *   **Operation:** Retrieves a list of tasks from AI Maestro.
        *   **Tool:** Uses `aimaestro-task.sh list --format json`.
    *   **`get_github_issues` function:**
        *   **Direction:** GitHub Issue API (via GitHub CLI) → Local script.
        *   **Operation:** Retrieves a list of issues from a GitHub repository.
        *   **Tool:** Uses `gh issue list --json number,title,labels,state,assignees`.

---

## Model: x-ai/grok-4.1-fast

### File: /tmp/ai-maestro-orchestrator-agent-review/scripts/amoa_aimaestro_sync.py

1. **Custom kanban columns/statuses it defines or expects (exact names and any mapping)**:
   - AMOA kanban columns (8-column setup): `"backlog"`, `"todo"`, `"in-progress"`, `"ai-review"`, `"human-review"`, `"merge-release"`, `"done"`, `"blocked"`.
   - Direct 1:1 bidirectional mapping via `AMOA_TO_AIMAESTRO_STATUS` and `AIMAESTRO_TO_AMOA_STATUS` dictionaries to/from AI Maestro status keys (exact same names: `"backlog"`, `"todo"`, `"in-progress"`, `"ai-review"`, `"human-review"`, `"merge-release"`, `"done"`, `"blocked"`).
   - Used in `kanban_column_to_aimaestro_status` (AMOA column → AI Maestro status) and `aimaestro_status_to_kanban_column` (AI Maestro status → AMOA column).
   - Default fallback: unknown status/column passes through unchanged.
   - Expected on GitHub via labels (see #4); synced to AI Maestro `status` field.
   - Priority levels (separate): `"critical"` (1), `"high"` (2), `"normal"` (3), `"low"` (4) via `PRIORITY_MAP` and `priority_to_number`.

2. **GitHub Projects v2 GraphQL operations it performs (mutations, queries)**:
   - None. No direct GraphQL usage. Interacts with GitHub via `gh` CLI (`_run_gh_command` → `gh issue list --json number,title,labels,state,assignees`). No project nodes, items, fields, or boards queried/mutated. Assumes kanban state via issue labels, not project columns.

3. **Status transitions and workflow rules it enforces**:
   - `"blocked"`: Sets AI Maestro `previousStatus` field if `previous_status` provided in `sync_task` (via `--previous-status` arg or manual call).
   - `"done"`: Sets AI Maestro `completedAt` to current UTC ISO timestamp in `sync_task`.
   - In `bulk_sync`: Skips GitHub issues lacking any `"status:"` label (defaults to `"backlog"` via `extract_status_from_labels` if present but no match).
   - No other transitions, validations, or enforcement (e.g., no prevention of invalid moves, no automation of label changes). Sync is one-way GitHub → AI Maestro; no AI Maestro → GitHub updates.
   - `full-sync` reconciles by upserting all labeled issues, marking existing as "updated", new as "created", AI Maestro-only as "orphaned".

4. **Label taxonomy and how labels map to kanban columns**:
   - **Status labels**: Prefix `"status:"` → column name via `extract_status_from_labels`. Exact mappings (from AMOA columns):
     - `"status:backlog"` → `"backlog"`
     - `"status:todo"` → `"todo"`
     - `"status:in-progress"` → `"in-progress"`
     - `"status:ai-review"` → `"ai-review"`
     - `"status:human-review"` → `"human-review"`
     - `"status:merge-release"` → `"merge-release"`
     - `"status:done"` → `"done"`
     - `"status:blocked"` → `"blocked"`
     - Default: `"backlog"` if no `"status:"` label.
   - **Agent/Assignee labels**: Prefix `"assign:"` → agent ID string via `extract_agent_from_labels` (e.g., `"assign:agent123"` → `"agent123"`). Synced to AI Maestro `assigneeAgentId`.
   - **Priority labels**: Prefix `"priority:"` → level via `extract_priority_from_labels`. Exact:
     - `"priority:critical"` → `"critical"` (1)
     - `"priority:high"` → `"high"` (2)
     - `"priority:normal"` → `"normal"` (3)
     - `"priority:low"` → `"low"` (4)
     - Default: `"normal"`.
   - All issue labels passed as `labels` list to AI Maestro task `labels` field in `sync_task`.
   - Fetches issue `labels` and `assignees` via `gh issue list`, but ignores `assignees` (uses labels only).

5. **Any custom fields on GitHub project items (priority, assignee, module, etc.)**:
   - None. No GitHub Projects v2 custom fields (e.g., no `projectV2singleSelectFieldValue`, `projectV2iterationField`, `priority`, `assignee`, `module`). No project item updates/queries.
   - Priority, assignee (agent), status derived from issue labels only.
   - Issue fields used: `number`, `title`, `labels` (for status/agent/priority), `state` (fetched but unused).

6. **Sync operations between AI Maestro kanban API and GitHub project boards**:
   - **One-way sync**: GitHub issues → AI Maestro tasks (no reverse sync).
   - **Single task** (`sync_task`, `sync-task` CLI): Builds task dict (`subject`=title, `status`=mapped column, `externalRef`=GH URL, `priority`=numeric, optional `assigneeAgentId`, `labels`=list, `previousStatus` for blocked, `completedAt` for done) → `aimaestro-task.sh upsert --team <id> --external-ref <url> --data <json>`.
   - **List AI Maestro tasks** (`get_aimaestro_tasks`, `get-tasks` CLI): `aimaestro-task.sh list --team <id> --format json` → parses `tasks` list or root array, indexes by `externalRef`.
   - **Full sync** (`bulk_sync`, `full-sync` CLI):
     - Fetch GH: `get_github_issues` → `gh issue list --state all --limit 500 --json number,title,labels,state,assignees`.
     - Fetch AM: `get_aimaestro_tasks`.
     - For each GH issue with `"status:"` label: extract status/agent/priority/labels → `sync_task` upsert.
     - Counts: `"created"` (new `externalRef`), `"updated"` (existing), `"orphaned"` (AM tasks without GH issue).
     - Notify: `amp-send.sh` to "amama-assistant-manager" with counts (`notify_sync_result`).
   - External ref format: `"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/issues/{number}"` (defaults: `GITHUB_OWNER="Emasoft"`, `GITHUB_REPO=""` from env).
   - Uses AMP wrappers (`aimaestro-task.sh`, `amp-send.sh`) per Plugin Abstraction Principle; no direct API calls.