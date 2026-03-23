# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:20:39.771Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/references/kanban-procedures.md`
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

```markdown
## File: /tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/references/kanban-procedures.md

### 1. Custom kanban columns/statuses it defines or expects (exact names and any mapping)

*   **Standard Columns (8):** The document mentions "8 standard columns" added by `gh-project-add-columns.py` but does not explicitly list their names.
*   **Custom Columns:** "AI Review", "Human Review" (mentioned as examples for adding new columns).
*   **Specific Status:** "Done" (mentioned in relation to auto-closing linked issues).

### 2. GitHub Projects v2 GraphQL operations it performs (mutations, queries)

*   **`updateProjectV2Field` (Mutation):** Used for adding or modifying columns. The document explicitly warns about its behavior of replacing all options if existing option IDs are not included.

### 3. Status transitions and workflow rules it enforces

*   **Moving to "Done":** If an item is moved to "Done", the system checks if the linked issue was auto-closed. This implies a potential workflow rule where moving to "Done" might trigger issue closure.

### 4. Label taxonomy and how labels map to kanban columns

*   The document mentions "label-based status" and "label status matches board column" in the context of `PROCEDURE 4: Sync Kanban Status`. This implies a mapping between GitHub issue labels and kanban board columns, but the specific labels and their corresponding columns are not detailed in this document.

### 5. Any custom fields on GitHub project items (priority, assignee, module, etc.)

*   **"Status" field:** This is the primary custom field discussed, representing the kanban columns.
*   No other custom fields like priority, assignee, or module are explicitly mentioned in this document.

### 6. Sync operations between AI Maestro kanban API and GitHub project boards

*   **`amoa_sync_kanban.py` script:** This script is responsible for synchronizing "label-based status with the GitHub Project board, or vice versa."
*   **Conflict Resolution:** "board takes precedence for manual moves" indicates a rule for resolving discrepancies between label status and board column assignments during synchronization.
```

---

## Model: x-ai/grok-4.1-fast

### File: /tmp/ai-maestro-orchestrator-agent-review/skills/amoa-kanban-management/references/kanban-procedures.md

1. **Custom kanban columns/statuses it defines or expects (exact names and any mapping)**:
   - 8 standard columns (added via `gh-project-add-columns.py` during project creation; exact names not enumerated in this file).
   - "AI Review" (added via `--add "AI Review"` in `gh-project-add-columns.py`).
   - "Human Review" (added via `--add "Human Review"` in `gh-project-add-columns.py`).
   - "In Progress" (source column in move example: from "In Progress" to "AI Review").
   - "Done" (target column; triggers check for auto-closed linked issue).
   - All columns exist under the "Status" field (single-select field on GitHub Project V2).

2. **GitHub Projects v2 GraphQL operations it performs (mutations, queries)**:
   - `updateProjectV2Field` mutation (explicitly referenced; used to add/modify columns but warned against manual use without preserving existing option IDs, as it replaces all options).

3. **Status transitions and workflow rules it enforces**:
   - Transition example: "In Progress" → "AI Review".
   - Transition to "Done": After move, verify if linked issue was auto-closed (references pitfalls in external `kanban-pitfalls.md`).
   - No other explicit transitions defined.
   - Workflow rule: Board takes precedence over labels for manual moves during sync (conflicts resolved in favor of board).
   - General rule: Preserve existing column option IDs during modifications to avoid losing assignments.

4. **Label taxonomy and how labels map to kanban columns**:
   - Labels represent "label-based status" (synced bidirectionally with "Status" field columns).
   - No explicit label names or direct label-to-column mappings provided.
   - Sync ensures label status matches board column (or vice versa).

5. **Any custom fields on GitHub project items (priority, assignee, module, etc.)**:
   - "Status" field (single-select field; target for column adds/modifies/moves via `--field "Status"`; uses option IDs for assignments).

6. **Sync operations between AI Maestro kanban API and GitHub project boards**:
   - `amoa_sync_kanban.py` script: Synchronizes label-based status with GitHub Project board columns (or vice versa).
   - Post-sync verification: Confirm label status matches board column.
   - Conflict resolution: Board takes precedence for manual moves.
   - No explicit AI Maestro kanban API endpoints or calls detailed; sync is label-to-board focused.
   - Project registration: Store project number in `.github/project.json` for ongoing management.