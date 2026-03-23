# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:20:38.713Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/docs/STATUS_MAPPING.md`
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

## File: `/tmp/ai-maestro-orchestrator-agent-review/docs/STATUS_MAPPING.md`

### 1. Custom Kanban Columns/Statuses

**AMOA Columns (GitHub Projects Kanban):**
*   Backlog
*   Todo
*   In Progress
*   AI Review
*   Human Review
*   Merge/Release
*   Done
*   Blocked

**AI Maestro Statuses:**
*   `backlog`
*   `pending`
*   `in_progress`
*   `review`
*   `completed`

### 2. GitHub Projects v2 GraphQL Operations

This document does not directly define GraphQL operations but implies the need for operations to:
*   Read/update GitHub Project item status.
*   Read/update GitHub Project item labels.
*   Read/update custom fields like `blockedBy` and `reviewType`.
*   Read/update `merged` metadata.

### 3. Status Transitions and Workflow Rules

**AMOA → AI Maestro:**
*   `AI Review` collapses with `Human Review` to `review`.
*   `Merge/Release` collapses with `Done` to `completed`.
*   `Blocked` maps to `in_progress` (with `blockedBy` metadata).

**AI Maestro → AMOA (Reverse Mapping):**
*   `backlog` maps to `Backlog`.
*   `pending` maps to `Todo`.
*   `in_progress` maps to `In Progress`, but if `blockedBy` metadata is present, it maps to `Blocked`.
*   `review` maps to `AI Review` by default, but if `reviewType: human` metadata is present, it maps to `Human Review`.
*   `completed` maps to `Done` by default, but if `merged: false` metadata is present, it maps to `Merge/Release`.

### 4. Label Taxonomy and How Labels Map to Kanban Columns

**GitHub Labels (expected to be applied to items in AMOA Columns):**
*   `status:backlog` maps to `Backlog`
*   `status:todo` maps to `Todo`
*   `status:in-progress` maps to `In Progress`
*   `status:ai-review` maps to `AI Review`
*   `status:human-review` maps to `Human Review`
*   `status:merge-release` maps to `Merge/Release`
*   `status:done` maps to `Done`
*   `status:blocked` maps to `Blocked`

### 5. Any Custom Fields on GitHub Project Items

*   `blockedBy`: Used to disambiguate `in_progress` AI Maestro status to `Blocked` AMOA column.
*   `reviewType`: Used to disambiguate `review` AI Maestro status to `Human Review` AMOA column (if `reviewType: human`).
*   `merged`: Used to disambiguate `completed` AI Maestro status to `Merge/Release` AMOA column (if `merged: false`).

### 6. Sync Operations Between AI Maestro Kanban API and GitHub Project Boards

The document describes a bidirectional mapping for syncing:
*   **AMOA → AI Maestro:** GitHub Project column/label status is translated into an AI Maestro status. This direction can be "lossy" for certain pairs of AMOA columns.
*   **AI Maestro → AMOA:** AI Maestro status is translated into an AMOA column, using additional metadata (`blockedBy`, `reviewType`, `merged`) for disambiguation where the mapping is not 1:1.

---

## Model: x-ai/grok-4.1-fast

### File: /tmp/ai-maestro-orchestrator-agent-review/docs/STATUS_MAPPING.md

#### 1. Custom kanban columns/statuses defined or expected (exact names and mappings)
- **AMOA (GitHub Projects) 8-column kanban**:
  - Backlog
  - Todo
  - In Progress
  - AI Review
  - Human Review
  - Merge/Release
  - Done
  - Blocked

- **AI Maestro 5-status task system**:
  - `backlog`
  - `pending`
  - `in_progress`
  - `review`
  - `completed`

- **Bidirectional mappings** (from Status Mapping Table):
  | AMOA Column     | AI Maestro Status | Direction       | Notes |
  |-----------------|-------------------|-----------------|-------|
  | Backlog        | `backlog`        | bidirectional  | 1:1 match |
  | Todo           | `pending`        | bidirectional  | 1:1 match |
  | In Progress    | `in_progress`    | bidirectional  | 1:1 match |
  | AI Review      | `review`         | AMOA → Maestro | collapses with Human Review |
  | Human Review   | `review`         | AMOA → Maestro | collapses with AI Review |
  | Merge/Release  | `completed`      | AMOA → Maestro | collapses with Done |
  | Done           | `completed`      | AMOA → Maestro | collapses with Merge/Release |
  | Blocked        | `in_progress`    | AMOA → Maestro | uses `blockedBy` metadata |

- **Reverse mappings (AI Maestro → AMOA)**:
  | AI Maestro Status | Default AMOA Column | Disambiguation |
  |-------------------|---------------------|----------------|
  | `backlog`        | Backlog            | direct |
  | `pending`        | Todo               | direct |
  | `in_progress`    | In Progress        | check `blockedBy` → Blocked if present |
  | `review`         | AI Review          | default; use Human Review if `reviewType: human` metadata present |
  | `completed`      | Done               | default; use Merge/Release if `merged: false` metadata present |

- **Lossy mappings** (AMOA → AI Maestro):
  - AI Review / Human Review → `review`
  - Merge/Release / Done → `completed`
  - Blocked → `in_progress` (with metadata)

#### 2. GitHub Projects v2 GraphQL operations (mutations, queries)
- None explicitly defined or mentioned in this file.

#### 3. Status transitions and workflow rules enforced
- **AMOA → AI Maestro** (lossy):
  - AI Review → `review`
  - Human Review → `review`
  - Merge/Release → `completed`
  - Done → `completed`
  - Blocked → `in_progress` (preserves via `blockedBy` metadata)
- **AI Maestro → AMOA** (with disambiguation rules):
  - `in_progress` → In Progress (default); → Blocked if `blockedBy` metadata present
  - `review` → AI Review (default); → Human Review if `reviewType: human` metadata present
  - `completed` → Done (default); → Merge/Release if `merged: false` metadata present
- Future: Phase 3 supports configurable columns to eliminate lossy mappings via custom status codes.
- No explicit linear workflow or forbidden transitions defined.

#### 4. Label taxonomy and label-to-kanban column mappings
- **GitHub Labels** (prefixed with `status:`):
  - `status:backlog` → Backlog column
  - `status:todo` → Todo column
  - `status:in-progress` → In Progress column
  - `status:ai-review` → AI Review column
  - `status:human-review` → Human Review column
  - `status:merge-release` → Merge/Release column
  - `status:done` → Done column
  - `status:blocked` → Blocked column
- Labels enable bidirectional status mapping between AMOA columns and AI Maestro statuses.

#### 5. Custom fields on GitHub project items
- `blockedBy` (metadata): Used to disambiguate `in_progress` → Blocked; preserves Blocked state in lossy `in_progress` mapping.
- `reviewType: human` (metadata): Disambiguates `review` → Human Review.
- `merged: false` (metadata): Disambiguates `completed` → Merge/Release.

#### 6. Sync operations between AI Maestro kanban API and GitHub project boards
- **Bidirectional sync** via defined mappings.
- **AMOA → AI Maestro**: Applies forward mapping table; lossy for review/completed/blocked pairs (uses metadata preservation).
- **AI Maestro → AMOA**: Applies reverse mapping with conditional disambiguation based on metadata (`blockedBy`, `reviewType: human`, `merged: false`).
- Sync assumes GitHub labels (`status:*`) drive column positioning in the 8-column kanban.
- Versioned (1.6.0); future Phase 3 enables non-lossy sync via configurable columns/custom status codes.