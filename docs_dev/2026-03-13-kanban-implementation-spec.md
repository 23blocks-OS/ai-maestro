# Configurable Kanban & Extended Task Model — Implementation Spec

## Overview

Extend AI Maestro's hardcoded 5-status kanban to support per-team configurable columns (up to 8+), and extend the Task model with new fields needed for role-plugin integration (orchestrator, integrator, etc.).

## 1. types/task.ts Changes

### TaskStatus: string (no longer union)
```typescript
// OLD: export type TaskStatus = 'backlog' | 'pending' | 'in_progress' | 'review' | 'completed'
// NEW:
export type TaskStatus = string
```

### DEFAULT_STATUSES constant (for backward compat)
```typescript
export const DEFAULT_STATUSES: TaskStatus[] = ['backlog', 'pending', 'in_progress', 'review', 'completed']
```

### Extended Task interface
Add these NEW fields to Task (all optional to preserve backward compat):
```typescript
export interface Task {
  // ... existing fields unchanged ...

  // NEW fields
  labels?: string[]              // tags: status:*, assign:*, priority:*
  taskType?: string              // feature, bug, chore, epic
  externalRef?: string           // GitHub issue URL or number
  externalProjectRef?: string    // GitHub Projects V2 item ID
  previousStatus?: string        // for Blocked->restore flow
  acceptanceCriteria?: string[]  // from AMOA module specs
  handoffDoc?: string            // path to handoff document
  prUrl?: string                 // PR URL when in review
  reviewResult?: string          // pass|fail from integrator
}
```

### TaskWithDeps: add labels display
```typescript
export interface TaskWithDeps extends Task {
  blocks: string[]
  isBlocked: boolean
  assigneeName?: string
}
```

## 2. types/team.ts Changes

Add KanbanColumnConfig type and kanbanConfig field to Team:
```typescript
export interface KanbanColumnConfig {
  id: string           // e.g., "ai-review"
  label: string        // e.g., "AI Review"
  color: string        // tailwind dot color class e.g., "bg-purple-400"
  icon?: string        // lucide icon name (optional, resolved at render)
}

// Add to Team interface:
export interface Team {
  // ... existing fields ...
  kanbanConfig?: KanbanColumnConfig[]  // NEW: per-team column config (if undefined, use DEFAULT_COLUMNS)
}
```

### DEFAULT_COLUMNS constant:
```typescript
export const DEFAULT_KANBAN_COLUMNS: KanbanColumnConfig[] = [
  { id: 'backlog', label: 'Backlog', color: 'bg-gray-500', icon: 'Archive' },
  { id: 'pending', label: 'To Do', color: 'bg-gray-400', icon: 'Circle' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-blue-400', icon: 'PlayCircle' },
  { id: 'review', label: 'Review', color: 'bg-amber-400', icon: 'Eye' },
  { id: 'completed', label: 'Done', color: 'bg-emerald-400', icon: 'CheckCircle2' },
]
```

## 3. lib/task-registry.ts Changes

### createTask: accept new fields
Update the `data` parameter to include all new optional fields:
- labels, taskType, externalRef, externalProjectRef, previousStatus
- acceptanceCriteria, handoffDoc, prUrl, reviewResult
- Also accept `status` parameter (currently hardcoded to 'pending')

### updateTask: accept new fields
Update the `updates` Partial<Pick<...>> to include all new fields.

### saveTasks/loadTasks: no changes needed (JSON serialization handles new fields)

## 4. services/teams-service.ts Changes

### CreateTaskParams: add new fields
```typescript
export interface CreateTaskParams {
  subject: string
  description?: string
  assigneeAgentId?: string | null
  blockedBy?: string[]
  priority?: number
  status?: string           // NEW: allow specifying initial status
  labels?: string[]         // NEW
  taskType?: string         // NEW
  externalRef?: string      // NEW
  externalProjectRef?: string // NEW
  acceptanceCriteria?: string[] // NEW
  handoffDoc?: string       // NEW
  prUrl?: string            // NEW
  requestingAgentId?: string
}
```

### UpdateTaskParams: add new fields
Same new fields as CreateTaskParams, plus:
```typescript
  previousStatus?: string   // NEW
  reviewResult?: string     // NEW
```

### listTeamTasks: add query filtering
Accept optional filter params: `assignee`, `status`, `label`, `taskType`
Filter tasks after loading.

### Kanban config functions:
```typescript
export function getKanbanConfig(teamId: string): ServiceResult<{ columns: KanbanColumnConfig[] }>
export async function setKanbanConfig(teamId: string, columns: KanbanColumnConfig[]): Promise<ServiceResult<{ columns: KanbanColumnConfig[] }>>
```

### VALID_TASK_STATUSES: make dynamic
Instead of hardcoded array, derive from team's kanban config columns.

## 5. API Routes

### GET /api/teams/[id]/tasks — add query params
- `?assignee=agentId` — filter by assignee
- `?status=in_progress` — filter by status
- `?label=priority:high` — filter by label
- `?taskType=feature` — filter by task type

### PUT /api/teams/[id]/tasks/[taskId] — dynamic status validation
Instead of hardcoded `VALID_TASK_STATUSES`, load team's kanban config and validate against those column IDs.

### NEW: GET /api/teams/[id]/kanban-config
Returns the team's kanban column configuration (or DEFAULT_KANBAN_COLUMNS if not set).

### NEW: PUT /api/teams/[id]/kanban-config
Sets the team's kanban column configuration. Body: `{ columns: KanbanColumnConfig[] }`

## 6. UI Changes

### TaskKanbanBoard.tsx
- Remove hardcoded COLUMNS array
- Accept `columns: KanbanColumnConfig[]` prop (or fetch from API)
- Map columns dynamically with icon resolution

### KanbanColumn.tsx
- Already accepts `ColumnConfig` — just needs to work with string status instead of TaskStatus union

### KanbanCard.tsx
- Remove hardcoded `statusIcon` Record
- Show labels as colored pills if present
- Show taskType badge if present

### TaskCard.tsx
- Remove hardcoded `statusConfig` Record
- Dynamic status cycling based on available columns

### TaskDetailView.tsx
- Add fields for labels, taskType, externalRef, prUrl, reviewResult
- Dynamic status dropdown based on available columns

### TaskCreateForm.tsx
- Add optional fields: taskType, labels, externalRef

### TaskPanel.tsx
- Dynamic section grouping based on available columns

## 7. Headless Router

Add routes for kanban-config:
```
GET  /api/teams/[id]/kanban-config
PUT  /api/teams/[id]/kanban-config
```

## 8. Backward Compatibility

- All new Task fields are optional — existing tasks load fine
- TaskStatus is now `string` but DEFAULT_STATUSES preserves the old 5 values
- Teams without kanbanConfig use DEFAULT_KANBAN_COLUMNS
- API validation falls back to DEFAULT_STATUSES when no kanban config is set
- UI renders DEFAULT_KANBAN_COLUMNS when team has no custom config
