# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:20:47.870Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-label-taxonomy/SKILL.md`
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

```
/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-label-taxonomy/SKILL.md
1. Custom kanban columns/statuses it defines or expects:
    - `backlog`
    - `todo`
    - `in-progress`
    - `ai-review`
    - `human-review`
    - `merge-release`
    - `done`
    - `blocked`

2. GitHub Projects v2 GraphQL operations it performs:
    - None explicitly mentioned, but implies `gh issue edit` which uses GitHub API (likely REST, but GraphQL could be underlying for some operations).

3. Status transitions and workflow rules it enforces:
    - `backlog` → `todo` → `in-progress` → `ai-review` → `human-review` → `merge-release` → `done`
    - `blocked` is a separate status.
    - Every issue MUST have: `status:*`, `priority:*`, `type:*` labels.

4. Label taxonomy and how labels map to kanban columns:
    - Label categories:
        - `assign:` (0-1 cardinality)
        - `status:` (1 cardinality)
        - `priority:` (1 cardinality)
        - `type:` (1 cardinality)
        - `component:` (1+ cardinality)
        - `effort:` (1 cardinality)
        - `platform:` (0+ cardinality)
        - `toolchain:` (0+ cardinality)
        - `review:` (0-1 cardinality)
    - Specific label values for `status:` are expected to map to the kanban columns, e.g., `status:backlog`, `status:todo`, `status:in-progress`, etc.
    - Workflow rule: If updating, remove conflicting labels first (e.g., `assign:*`, `status:*`).

5. Any custom fields on GitHub project items:
    - None explicitly defined as custom fields, but the label categories imply custom attributes that would typically be custom fields in a project board:
        - Priority (via `priority:` labels)
        - Assignee (via `assign:` labels)
        - Type (via `type:` labels)
        - Component (via `component:` labels)
        - Effort (via `effort:` labels)
        - Platform (via `platform:` labels)
        - Toolchain (via `toolchain:` labels)
        - Review (via `review:` labels)

6. Sync operations between AI Maestro kanban API and GitHub project boards:
    - Not explicitly detailed, but the plugin's purpose is to manage GitHub project kanbans using AI Maestro orchestration. The `gh issue edit` command is used to apply labels, which in turn drive the kanban status. This implies a one-way or two-way synchronization where AI Maestro actions (like assigning tasks or changing status) are reflected on GitHub issues via label manipulation, which then updates the GitHub Project board.
```

---

## Model: x-ai/grok-4.1-fast

### File: /tmp/ai-maestro-orchestrator-agent-review/skills/amoa-label-taxonomy/SKILL.md

#### 1. Custom kanban columns/statuses defined or expected (exact names and any mapping)
- Kanban columns/statuses explicitly defined: `backlog`, `todo`, `in-progress`, `ai-review`, `human-review`, `merge-release`, `done`.
- Additional status: `blocked` (noted as overlay with `+blocked`).
- Mapping: These are expected as values in `status:<value>` labels (e.g., `status:backlog`, `status:todo`, `status:in-progress`, `status:ai-review`, `status:human-review`, `status:merge-release`, `status:done`, `status:blocked`).
- Requirement: Every issue **MUST** have exactly one `status:*` label (cardinality: `status:`(1)).

#### 2. GitHub Projects v2 GraphQL operations (mutations, queries)
- None defined or mentioned in the file.
- Operations use GitHub CLI (`gh`) commands only, such as `gh issue edit --remove-label` and `--add-label` for label management (e.g., `gh issue edit 42 --remove-label "assign:implementer-1" --add-label "assign:implementer-2"`).

#### 3. Status transitions and workflow rules enforced
- **Linear workflow transitions**: `backlog` → `todo` → `in-progress` → `ai-review` → `human-review` → `merge-release` → `done`.
- **Overlay status**: `+blocked` (can apply to any column).
- **Workflow rules**:
  - Label application instructions: Remove conflicting labels first (e.g., `assign:*`, `status:*`).
  - Mandatory labels on every issue: `status:*` (exactly 1), `priority:*` (exactly 1), `type:*` (exactly 1).
  - Cardinality rules for all categories (enforced via checklist and validation):
    | Category    | Cardinality |
    |-------------|-------------|
    | `assign:`   | 0-1        |
    | `status:`   | 1          |
    | `priority:` | 1          |
    | `type:`     | 1          |
    | `component:`| 1+         |
    | `effort:`   | 1          |
    | `platform:` | 0+         |
    | `toolchain:`| 0+         |
    | `review:`   | 0-1        |
  - Validation steps: Check cardinality (references/usage-rules.md), remove conflicts, apply via `gh`, verify.
  - Label lifecycle and common mistakes referenced but not detailed here (see usage-rules.md).

#### 4. Label taxonomy and how labels map to kanban columns
- **Format**: `<category>:<value>` (e.g., `status:backlog`, `priority:high`).
- **Full label categories/taxonomy**:
  | Category     | Description/Purpose                  | Cardinality | Maps to Kanban Column? |
  |--------------|--------------------------------------|-------------|------------------------|
  | `assign:`    | Assignee/agent assignment            | 0-1        | No                     |
  | `status:`    | Kanban status                        | 1          | Yes (direct: `status:backlog` → `backlog` column, etc.) |
  | `priority:`  | Priority level                       | 1          | No                     |
  | `type:`      | Issue/task type                      | 1          | No                     |
  | `component:` | Module/component                     | 1+         | No                     |
  | `effort:`    | Effort estimate                      | 1          | No                     |
  | `platform:`  | Target platform(s)                   | 0+         | No                     |
  | `toolchain:` | Toolchain(s)                         | 0+         | No                     |
  | `review:`    | Review status                        | 0-1        | No                     |
- **Label-to-kanban column mapping**: Exclusive to `status:*` labels, where `status:<column-name>` maps directly to the kanban column (e.g., `status:in-progress` → `in-progress` column). Conflicts must be removed before applying new `status:*`.
- CLI-based label management: Query (`gh issue view`), update (`gh issue edit --add-label/--remove-label`), validate cardinality.
- Detailed categories referenced in label-categories-detailed.md.

#### 5. Any custom fields on GitHub project items (priority, assignee, module, etc.)
- No native GitHub Projects v2 custom fields mentioned (uses labels as pseudo-fields).
- Labels simulate custom fields:
  | Label Category | Acts as Custom Field |
  |----------------|----------------------|
  | `priority:*`   | Priority (mandatory, exactly 1) |
  | `assign:*`     | Assignee/agent (0-1) |
  | `type:*`       | Type (mandatory, exactly 1) |
  | `component:*`  | Module/component (1+) |
  | `effort:*`     | Effort (exactly 1) |
  | `platform:*`   | Platform (0+) |
  | `toolchain:*`  | Toolchain (0+) |
  | `review:*`     | Review status (0-1) |
  | `status:*`     | Status/kanban position (mandatory, exactly 1) |
- No explicit GitHub Projects v2 single-select, iteration, or text fields; all via labels.

#### 6. Sync operations between AI Maestro kanban API and GitHub project boards
- None defined or mentioned.
- Label changes via `gh` CLI are manual/one-off; no automated sync, API calls, or kanban API integration described.
- References CLI commands (cli-commands.md) for label ops: Create, Query, Update, Validate.
- Validation reports and confirmations as output (e.g., "Updated issue #42").