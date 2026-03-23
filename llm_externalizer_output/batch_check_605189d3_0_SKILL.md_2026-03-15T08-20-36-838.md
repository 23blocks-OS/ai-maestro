# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:20:36.838Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/SKILL.md`
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

```markdown /tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/SKILL.md
---
name: amoa-kanban-management
description: GitHub Projects V2 kanban board management. Use when creating boards, adding columns, moving items. Trigger with kanban or column requests.
license: Apache-2.0
compatibility: Requires gh CLI authenticated with project scopes. Requires AI Maestro installed.
metadata:
  author: Emasoft
  version: 1.0.0
context: fork
user-invocable: false
agent: amoa-main
---

# Kanban Board Management Skill

## Overview

Manage GitHub Projects V2 kanban boards: create boards, columns, move items, sync status.

## Prerequisites

`gh` CLI authenticated with `project` and `read:project` OAuth scopes. See [references/gh-auth-scopes.md](references/gh-auth-scopes.md)
<!-- TOC: Troubleshooting - Common scope-related errors | How to check current scopes - Verifying your authentication -->

## Instructions

1. Verify scopes: `gh auth status 2>&1 | grep -q "project" || echo "ERROR: gh auth refresh -h github.com -s project,read:project"`
2. Query board/column IDs via GraphQL. See [references/kanban-procedures.md](references/kanban-procedures.md)
<!-- TOC: PROCEDURE 4: Sync Kanban Status | PROCEDURE 1: Create Project Board -->
3. Execute procedure. NEVER call `updateProjectV2Field` directly -- use `scripts/gh-project-add-columns.py`
4. Verify JSON output. Columns: [references/kanban-column-system.md](references/kanban-column-system.md)
<!-- TOC: Standard 8-Column System | Available Scripts -->

Copy this checklist and track your progress:

- [ ] Verify OAuth scopes with pre-flight check
- [ ] Query board/column IDs, execute procedure from [references/kanban-procedures.md](references/kanban-procedures.md)
<!-- TOC: PROCEDURE 4: Sync Kanban Status | PROCEDURE 1: Create Project Board -->
- [ ] Confirm JSON output matches expected format

## Output

JSON from GraphQL mutations and board state reports.

## Examples

**Input:** `move-item --project 42 --item ITEM_ID --column "AI Review"`
**Output:** `{"updateProjectV2ItemFieldValue":{"projectV2Item":{"id":"ITEM_ID"}}}`
See [references/kanban-examples.md](references/kanban-examples.md)
<!-- TOC: Example 1: Pre-Flight Scope Check | Example 3: Move Item to AI Review -->

## Error Handling

See [references/kanban-error-handling.md](references/kanban-error-handling.md)
<!-- TOC: Error Reference Table | Output Specification | Script Output Rules -->

## Resources

- [Auth & OAuth Scopes](references/gh-auth-scopes.md)
<!-- TOC: Troubleshooting - Common scope-related errors | How to check current scopes - Verifying your authentication -->
- [GraphQL Mutations](references/github-projects-v2-graphql.md)
<!-- TOC: Deleting a project item - deleteProjectV2Item mutation | Common parameter mistakes - fieldId vs projectId confusion -->
- [Pitfalls & Guards](references/kanban-pitfalls.md)
<!-- TOC: Safe column addition procedure | How to detect if an issue was auto-closed -->
- [Procedures](references/kanban-procedures.md)
<!-- TOC: PROCEDURE 4: Sync Kanban Status | PROCEDURE 1: Create Project Board -->
- [Column System](references/kanban-column-system.md)
<!-- TOC: Available Scripts | Standard 8-Column System -->
- [Checklists](references/kanban-checklist.md)
<!-- TOC: Pre-Flight Checklist | Board Setup Checklist -->
- [Error Handling](references/kanban-error-handling.md)
<!-- TOC: Script Output Rules | Output Specification -->
- [Examples](references/kanban-examples.md)
<!-- TOC: Example 1: Pre-Flight Scope Check | Example 3: Move Item to AI Review -->
```
### Analysis of `/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/SKILL.md`

This file is the main skill definition and provides an overview of the kanban management capabilities. It references other files for detailed information.

1.  **Custom kanban columns/statuses it defines or expects:**
    *   The skill refers to a "Standard 8-Column System" in `references/kanban-column-system.md`.
    *   An example input `move-item --project 42 --item ITEM_ID --column "AI Review"` explicitly mentions an "AI Review" column.

2.  **GitHub Projects v2 GraphQL operations it performs:**
    *   The skill mentions "Query board/column IDs via GraphQL."
    *   It explicitly states "NEVER call `updateProjectV2Field` directly -- use `scripts/gh-project-add-columns.py`", implying that `updateProjectV2Field` is a relevant GraphQL mutation for updating item fields (like status/column).
    *   The example output `{"updateProjectV2ItemFieldValue":{"projectV2Item":{"id":"ITEM_ID"}}}` indicates the use of the `updateProjectV2ItemFieldValue` mutation.
    *   It also references "GraphQL Mutations" in `references/github-projects-v2-graphql.md`, which will contain more specific operations like `deleteProjectV2Item`.

3.  **Status transitions and workflow rules it enforces:**
    *   The skill mentions "Sync Kanban Status" as `PROCEDURE 4` in `references/kanban-procedures.md`, implying workflow rules for status synchronization.
    *   It also refers to "Safe column addition procedure" in `references/kanban-pitfalls.md`, suggesting specific rules for adding columns.

4.  **Label taxonomy and how labels map to kanban columns:**
    *   This file does not directly define label taxonomy or mappings. It's likely detailed in one of the referenced files, possibly `references/kanban-column-system.md` or `references/kanban-procedures.md`.

5.  **Any custom fields on GitHub project items (priority, assignee, module, etc.):**
    *   This file does not explicitly list custom fields, but the mention of `updateProjectV2ItemFieldValue` implies that custom fields can be updated. The specific fields would be defined in the project's schema, which might be referenced in other documentation.

6.  **Sync operations between AI Maestro kanban API and GitHub project boards:**
    *   The skill's description states "sync status."
    *   It explicitly mentions "PROCEDURE 4: Sync Kanban Status" in `references/kanban-procedures.md`, indicating a dedicated process for synchronization.

---

## Model: x-ai/grok-4.1-fast

### /tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/SKILL.md

1. **Custom kanban columns/statuses defined or expected**:
   - "AI Review" (explicitly used in example command: `move-item --project 42 --item ITEM_ID --column "AI Review"`)
   - References a "Standard 8-Column System" (via link to [references/kanban-column-system.md]), but exact column names not listed in this file.
   - General expectation of columns managed via board creation, addition, and item movement (e.g., via `scripts/gh-project-add-columns.py`).

2. **GitHub Projects v2 GraphQL operations performed**:
   - `updateProjectV2ItemFieldValue` (mutation; example output: `{"updateProjectV2ItemFieldValue":{"projectV2Item":{"id":"ITEM_ID"}}}`; used for moving items to columns).
   - Queries for board/column IDs (unspecified query name; instructed to "Query board/column IDs via GraphQL").
   - Referenced (but not directly performed here): `deleteProjectV2Item` (mutation for deleting project items, via [references/github-projects-v2-graphql.md]).

3. **Status transitions and workflow rules enforced**:
   - Item movement to specific columns (e.g., from any status to "AI Review" via `move-item` command).
   - Sync kanban status (via "PROCEDURE 4: Sync Kanban Status" in [references/kanban-procedures.md]), implying transitions during sync.
   - No explicit transition rules or allowed paths defined in this file (e.g., no "from X to Y only" logic).

4. **Label taxonomy and how labels map to kanban columns**:
   - No label taxonomy or mappings defined or mentioned in this file.

5. **Any custom fields on GitHub project items**:
   - No custom fields (e.g., priority, assignee, module) defined or mentioned.
   - Uses `updateProjectV2Field` indirectly via scripts (instructed: "NEVER call `updateProjectV2Field` directly -- use `scripts/gh-project-add-columns.py`"), implying field updates for status/columns but no specifics.

6. **Sync operations between AI Maestro kanban API and GitHub project boards**:
   - "Sync Kanban Status" (PROCEDURE 4 in [references/kanban-procedures.md]; manages syncing status between boards).
   - General sync via "move items, sync status" in overview.
   - Board state reports as JSON output from GraphQL mutations.
   - Procedures for creating boards (PROCEDURE 1: Create Project Board) and syncing, using `gh` CLI with project scopes.