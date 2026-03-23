# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:20:43.269Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/references/kanban-examples.md`
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
/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/references/kanban-examples.md
1. Custom kanban columns/statuses:
   - `status:todo` (implied as a label for initial status)
   - `AI Review` (explicitly mentioned as a column to move items to)
   - `Done` (implied as a column that might auto-close issues)

2. GitHub Projects v2 GraphQL operations:
   - The examples use `gh` CLI commands, which abstract GraphQL operations.
     - `gh auth status`: Checks authentication scopes.
     - `gh auth refresh`: Refreshes authentication scopes.
     - `gh issue create`: Creates a GitHub issue, which implicitly adds an item to a project if configured.
     - `gh project item-add`: Adds an item (issue/pull request) to a GitHub Project.
     - `gh project item-list`: Lists items in a GitHub Project.
     - `gh project item-edit`: Edits an item in a GitHub Project, specifically to change a field value.
     - `gh issue view`: Views details of a GitHub issue.
     - `gh issue close`: Closes a GitHub issue.

3. Status transitions and workflow rules:
   - An item can be moved to `AI Review`.
   - Moving an item to the `Done` column might automatically close the associated GitHub issue.
   - A safeguard checks if an issue is already closed before attempting to close it, implying a workflow where the `Done` column can trigger issue closure.

4. Label taxonomy and how labels map to kanban columns:
   - `assign:ampa-impl-01`: An assignee label.
   - `priority:high`: A priority label.
   - `status:todo`: A status label, likely mapping to an initial "To Do" or similar column.

5. Custom fields on GitHub project items:
   - `Status` field (implied by `--field-id <status-field-id>` and `--single-select-option-id <ai-review-option-id>`).
   - `Priority` (implied by `priority:high` label, though not explicitly shown as a custom field in project operations).
   - `Assignee` (implied by `assign:ampa-impl-01` label, though not explicitly shown as a custom field in project operations).

6. Sync operations between AI Maestro kanban API and GitHub project boards:
   - The examples demonstrate direct manipulation of GitHub Projects and Issues using the `gh` CLI. There's no explicit mention of an "AI Maestro kanban API" or sync operations with it in these examples. The `gh` commands are the direct interface to GitHub.
```

---

## Model: x-ai/grok-4.1-fast

### File: /tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/references/kanban-examples.md

1. **Custom kanban columns/statuses it defines or expects (exact names and any mapping)**:
   - `todo`: Expected as initial status via issue label `status:todo`; maps to "todo" column/status.
   - `AI Review`: Explicit column/status to move items to, referenced via `<ai-review-option-id>` in `gh project item-edit`.
   - `Done`: Explicit column/status that may auto-close issues upon item placement.

2. **GitHub Projects v2 GraphQL operations it performs (mutations, queries)**:
   - Query: `gh project item-list <project-number> --owner Emasoft --format json` (lists project items to find `ITEM_ID` by matching `.content.number == $ISSUE_NUMBER`; corresponds to `projectV2 { items(...) { id content { ... } } }` query pattern).
   - Mutation: `gh project item-add <project-number> --owner Emasoft --url "$ISSUE_URL"` (adds issue to project; corresponds to `projectV2AddProjectV2ItemById` or `projectV2AddProjectV2ItemFromIssue`).
   - Mutation: `gh project item-edit --project-id <project-id> --id "$ITEM_ID" --field-id <status-field-id> --single-select-option-id <ai-review-option-id>` (edits status field single-select value; corresponds to `projectV2UpdateProjectV2FieldConfiguration` or `updateProjectV2ItemFieldValue` for single-select option).
   - No other direct queries/mutations; `gh issue create`, `gh issue view --json state`, `gh issue close` are Issues API v3 (not Projects v2).

3. **Status transitions and workflow rules it enforces**:
   - `todo` → `AI Review`: Explicit move via `gh project item-edit` to `<ai-review-option-id>`.
   - `Done` → auto-close issue: `Done` column triggers auto-closure (checked via `gh issue view --json state` before manual `gh issue close`).
   - Pre-closure safeguard: Before closing issue, check if `state == "CLOSED"` (likely from `Done` auto-close); if not closed, add comment and close.
   - Initial placement: New issues labeled `status:todo` added to board (implies `todo` as entry point).
   - No other enforced transitions or rules (e.g., no validation on moves, no cycles prevented).

4. **Label taxonomy and how labels map to kanban columns**:
   - `status:todo`: Maps to `todo` column/status (applied on issue creation via `--label "status:todo"`; sets initial project status).
   - `priority:high`: Defines priority taxonomy (high); no explicit column mapping, but implies project field sync (e.g., priority single-select).
   - `assign:ampa-impl-01`: Defines assignee/module taxonomy (`ampa-impl-01` as value); no explicit column mapping, but implies project field (assignee or module).
   - Labels applied as comma-separated: `--label "assign:ampa-impl-01,priority:high,status:todo"`.
   - No other labels or mappings.

5. **Any custom fields on GitHub project items (priority, assignee, module, etc.)**:
   - `status` field: Single-select custom field (ID: `<status-field-id>`); options include `todo` (via label), `AI Review` (option ID: `<ai-review-option-id>`), `Done`.
   - `priority` field: Implied single-select (values like `high` via label `priority:high`).
   - `assign` field: Implied text/selection/people (values like `ampa-impl-01` via label `assign:ampa-impl-01`; likely assignee or module).
   - No other fields (e.g., no explicit `module`, `assignee` beyond `assign`; no iteration, estimate).

6. **Sync operations between AI Maestro kanban API and GitHub project boards**:
   - None defined or performed. All operations are unilateral GitHub-side via `gh` CLI (issue create/add-to-project/move/close). No AI Maestro API calls, webhooks, polling, or bidirectional sync mentioned. Examples are standalone GitHub kanban scripts.