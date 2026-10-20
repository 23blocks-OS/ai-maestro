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

/** Eisenhower quadrants: urgent + important = q1 (do first), important only = q2 (schedule), urgent only = q3 (delegate), neither = q4 (delete) */
export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4'

export const QUADRANTS: Record<Quadrant, { label: string; urgent: boolean; important: boolean }> = {
  q1: { label: 'Do first', urgent: true, important: true },
  q2: { label: 'Schedule', urgent: false, important: true },
  q3: { label: 'Delegate', urgent: true, important: false },
  q4: { label: 'Delete', urgent: false, important: false },
}

/**
 * The quadrant of a card, derived and never stored. Only when BOTH answers are given: false/false is
 * a real placement (q4), so a card with a missing answer is "not placed" (null), not q4.
 */
export function quadrantOf(t: { urgent?: boolean | null; important?: boolean | null }): Quadrant | null {
  if (typeof t.urgent !== 'boolean' || typeof t.important !== 'boolean') return null
  return t.urgent ? (t.important ? 'q1' : 'q3') : (t.important ? 'q2' : 'q4')
}

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
  /** The organization (a slug, like the `org:` tag value) this card is for; unset = the assignee's organization */
  org?: string | null
  blockedBy: string[]            // Task IDs that must complete first
  priority?: number              // 0=highest (optional ordering)
  waitingOn?: WaitingOn          // Required while status is 'waiting'
  waitingNote?: string
  /** true / false when placed, null or missing when not placed yet */
  urgent?: boolean | null
  important?: boolean | null
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
  projectName?: string
  /** For a project card: the host that stores the project (with projectId, its address) */
  hostId?: string
  /** Derived from urgent and important; null when not placed */
  quadrant?: Quadrant | null
}

export interface TasksFile {
  version: 1
  tasks: Task[]
}
