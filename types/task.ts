/**
 * Task types for the board.
 *
 * A task lives in exactly one scope: an agent's own board, a team's board, or a project's board.
 * Which one is implied by where it is stored (teamId or projectId set, otherwise the agent's own).
 * Tasks support dependency chains with auto-unblocking when dependencies complete.
 */

export type TaskStatus = 'backlog' | 'pending' | 'in_progress' | 'review' | 'waiting' | 'completed'

/** Who a `waiting` card waits on: the operator, another agent (by id), someone outside, or "hold" (paused on purpose). */
export type WaitingOn = 'juan' | 'outside' | 'hold' | (string & {})

export type TaskScopeKind = 'agent' | 'team' | 'project'
export interface TaskScope { kind: TaskScopeKind; id: string }

export interface TaskComment {
  id: string
  /** operator = typed in the dashboard; agent = written by an agent. A convention on a trusted network, not proof of identity. */
  author: { kind: 'operator' | 'agent'; id?: string }
  text: string
  createdAt: string
  /** When an operator comment was handed to the assignee's session (queued, or typed in). null = not yet. */
  deliveredAt: string | null
}

export interface Task {
  id: string                     // UUID
  teamId?: string                // Set when the task lives on a team board
  projectId?: string             // Set when the task lives on a project board
  ownerAgentId?: string          // Set when the task lives on an agent's own board
  subject: string                // "Implement user auth endpoint"
  description?: string           // Detailed description / acceptance criteria
  status: TaskStatus
  assigneeAgentId?: string | null
  blockedBy: string[]            // Task IDs that must complete first
  priority?: number              // 0=highest (optional ordering)
  waitingOn?: WaitingOn          // Required while status is 'waiting'
  waitingNote?: string
  comments?: TaskComment[]
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
}

export interface TaskWithDeps extends Task {
  blocks: string[]               // Derived: task IDs this blocks (computed on read)
  isBlocked: boolean             // true if any blockedBy task not completed
  assigneeName?: string          // Resolved agent display name
  scope?: 'agent' | 'team' | 'project'  // Which board the card lives on (set on an agent's board)
  teamName?: string
}

export interface TasksFile {
  version: 1
  tasks: Task[]
}
