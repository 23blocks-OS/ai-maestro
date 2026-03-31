/**
 * Task types for the Shared Task List feature
 *
 * Tasks belong to teams and support dependency chains
 * with auto-unblocking when dependencies complete.
 *
 * TaskStatus is a string to support per-team configurable kanban columns.
 * DEFAULT_STATUSES preserves backward compatibility with the original 5-column system.
 */

export type TaskStatus = string

/** The original 5 statuses — used when a team has no custom kanban config */
export const DEFAULT_STATUSES: string[] = ['backlog', 'pending', 'in_progress', 'review', 'completed']

export interface Task {
  id: string                     // UUID
  teamId: string                 // Team this task belongs to
  subject: string                // "Implement user auth endpoint"
  description?: string           // Detailed description / acceptance criteria
  status: TaskStatus
  assigneeAgentId?: string | null
  blockedBy: string[]            // Task IDs that must complete first
  priority?: number              // 0=highest (optional ordering)
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string

  // Extended fields for role-plugin integration (orchestrator, integrator, etc.)
  labels?: string[]              // Tags: status:*, assign:*, priority:*
  taskType?: string              // feature, bug, chore, epic
  externalRef?: string           // GitHub issue URL or number
  externalProjectRef?: string    // GitHub Projects V2 item ID
  previousStatus?: string        // For Blocked->restore flow (save column before moving to blocked)
  acceptanceCriteria?: string[]  // From AMOA module specs
  handoffDoc?: string            // Path to handoff document
  prUrl?: string                 // PR URL when in review
  reviewResult?: string          // pass|fail from integrator
}

export interface TaskWithDeps extends Task {
  blocks: string[]               // Derived: task IDs this blocks (computed on read)
  isBlocked: boolean             // true if any blockedBy task not completed
  assigneeName?: string          // Resolved agent display name
  assigneeAvatar?: string        // Agent avatar URL (e.g., "/avatars/men_01.jpg")
}

export interface TasksFile {
  version: 1
  tasks: Task[]
}
