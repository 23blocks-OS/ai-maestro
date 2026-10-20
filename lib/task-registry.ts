/**
 * Task Registry - File-based CRUD for task persistence, in three scopes.
 *
 * Storage:
 *   team    ~/.aimaestro/teams/tasks-{teamId}.json
 *   agent   ~/.aimaestro/agents/{agentId}/tasks.json     (on the host where the agent lives)
 *   project ~/.aimaestro/projects/{projectId}/tasks.json (on the owner agent's host)
 * The team-only functions (loadTasks(teamId) ...) are kept for existing callers.
 * Mirrors the pattern from lib/team-registry.ts
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { loadAgents } from '@/lib/agent-registry'
import { quadrantOf, type Task, type TaskComment, type TaskScope, type TaskWithDeps, type TasksFile } from '@/types/task'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const TEAMS_DIR = path.join(AIMAESTRO_DIR, 'teams')

/** Ids become file names, so only characters that cannot climb out of the folder are accepted. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export function isSafeScopeId(id: string): boolean {
  return typeof id === 'string' && SAFE_ID.test(id)
}

export const teamScope = (id: string): TaskScope => ({ kind: 'team', id })
export const agentScope = (id: string): TaskScope => ({ kind: 'agent', id })
export const projectScope = (id: string): TaskScope => ({ kind: 'project', id })

function scopeDir(scope: TaskScope): string {
  if (!isSafeScopeId(scope.id)) throw new Error(`Invalid ${scope.kind} id`)
  if (scope.kind === 'team') return TEAMS_DIR
  if (scope.kind === 'agent') return path.join(AIMAESTRO_DIR, 'agents', scope.id)
  return path.join(AIMAESTRO_DIR, 'projects', scope.id)
}

function tasksFilePath(scope: TaskScope): string {
  const dir = scopeDir(scope)
  return scope.kind === 'team' ? path.join(dir, `tasks-${scope.id}.json`) : path.join(dir, 'tasks.json')
}

function ensureScopeDir(scope: TaskScope) {
  const dir = scopeDir(scope)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function loadScopeTasks(scope: TaskScope): Task[] {
  try {
    const filePath = tasksFilePath(scope)
    if (!fs.existsSync(filePath)) {
      return []
    }
    const data = fs.readFileSync(filePath, 'utf-8')
    const parsed: TasksFile = JSON.parse(data)
    return Array.isArray(parsed.tasks) ? parsed.tasks : []
  } catch (error) {
    console.error(`Failed to load tasks for ${scope.kind} ${scope.id}:`, error)
    return []
  }
}

export function saveScopeTasks(scope: TaskScope, tasks: Task[]): boolean {
  try {
    ensureScopeDir(scope)
    const file: TasksFile = { version: 1, tasks }
    fs.writeFileSync(tasksFilePath(scope), JSON.stringify(file, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error(`Failed to save tasks for ${scope.kind} ${scope.id}:`, error)
    return false
  }
}

export function loadTasks(teamId: string): Task[] {
  return loadScopeTasks(teamScope(teamId))
}

export function saveTasks(teamId: string, tasks: Task[]): boolean {
  return saveScopeTasks(teamScope(teamId), tasks)
}

/**
 * Resolve task dependencies and compute derived fields
 */
export function resolveTaskDeps(tasks: Task[]): TaskWithDeps[] {
  const agents = loadAgents()
  const taskMap = new Map(tasks.map(t => [t.id, t]))

  return tasks.map(task => {
    // Compute blocks (reverse of blockedBy)
    const blocks = tasks
      .filter(t => t.blockedBy.includes(task.id))
      .map(t => t.id)

    // Compute isBlocked
    const isBlocked = task.blockedBy.some(depId => {
      const dep = taskMap.get(depId)
      return dep && dep.status !== 'completed'
    })

    // Resolve assignee name
    let assigneeName: string | undefined
    if (task.assigneeAgentId) {
      const agent = agents.find(a => a.id === task.assigneeAgentId)
      if (agent) {
        assigneeName = agent.label || agent.name || agent.alias || agent.id.slice(0, 8)
      }
    }

    return {
      ...task,
      blocks,
      isBlocked,
      assigneeName,
      quadrant: quadrantOf(task),
    }
  })
}

export function createScopeTask(scope: TaskScope, data: {
  subject: string
  description?: string
  assigneeAgentId?: string | null
  blockedBy?: string[]
  priority?: number
  org?: string | null
}): Task {
  const tasks = loadScopeTasks(scope)
  const now = new Date().toISOString()

  const task: Task = {
    id: uuidv4(),
    ...(scope.kind === 'team' && { teamId: scope.id }),
    ...(scope.kind === 'project' && { projectId: scope.id }),
    ...(scope.kind === 'agent' && { ownerAgentId: scope.id }),
    subject: data.subject,
    description: data.description,
    status: 'pending',
    // An agent's own card is that agent's unless it is given to someone else
    assigneeAgentId: data.assigneeAgentId || (scope.kind === 'agent' ? scope.id : null),
    ...(data.org ? { org: data.org } : {}),
    blockedBy: data.blockedBy || [],
    priority: data.priority,
    createdAt: now,
    updatedAt: now,
  }

  tasks.push(task)
  saveScopeTasks(scope, tasks)
  return task
}

export function createTask(data: {
  teamId: string
  subject: string
  description?: string
  assigneeAgentId?: string | null
  blockedBy?: string[]
  priority?: number
}): Task {
  const { teamId, ...rest } = data
  return createScopeTask(teamScope(teamId), rest)
}

export function getScopeTask(scope: TaskScope, taskId: string): Task | null {
  return loadScopeTasks(scope).find(t => t.id === taskId) || null
}

export function getTask(teamId: string, taskId: string): Task | null {
  return getScopeTask(teamScope(teamId), taskId)
}

/**
 * Update a task and return newly unblocked tasks if status changed to completed
 */
export function updateScopeTask(
  scope: TaskScope,
  taskId: string,
  updates: Partial<Pick<Task, 'subject' | 'description' | 'status' | 'assigneeAgentId' | 'blockedBy' | 'priority' | 'waitingOn' | 'waitingNote' | 'urgent' | 'important' | 'org'>>
): { task: Task | null; unblocked: Task[] } {
  const tasks = loadScopeTasks(scope)
  const index = tasks.findIndex(t => t.id === taskId)
  if (index === -1) return { task: null, unblocked: [] }

  const now = new Date().toISOString()
  const wasCompleted = tasks[index].status === 'completed'
  const isNowCompleted = updates.status === 'completed'

  // Filter out undefined values to prevent overwriting existing fields
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  )

  tasks[index] = {
    ...tasks[index],
    ...cleanUpdates,
    updatedAt: now,
  }

  // org: null takes the card off its organization (the assignee's applies again)
  if (updates.org === null) delete tasks[index].org

  // A card that stops waiting forgets what it waited on
  if (updates.status && updates.status !== 'waiting') {
    delete tasks[index].waitingOn
    delete tasks[index].waitingNote
  }

  // Set timestamps based on status changes
  if ((updates.status === 'in_progress' || updates.status === 'review') && !tasks[index].startedAt) {
    tasks[index].startedAt = now
  }
  if (updates.status === 'completed' && !tasks[index].completedAt) {
    tasks[index].completedAt = now
  }

  // Find newly unblocked tasks when a task is completed
  let unblocked: Task[] = []
  if (!wasCompleted && isNowCompleted) {
    unblocked = tasks.filter(t => {
      if (!t.blockedBy.includes(taskId)) return false
      // Check if ALL blockers are now completed
      return t.blockedBy.every(depId => {
        const dep = tasks.find(d => d.id === depId)
        return dep && dep.status === 'completed'
      })
    })
  }

  saveScopeTasks(scope, tasks)
  return { task: tasks[index], unblocked }
}

export function updateTask(
  teamId: string,
  taskId: string,
  updates: Partial<Pick<Task, 'subject' | 'description' | 'status' | 'assigneeAgentId' | 'blockedBy' | 'priority' | 'waitingOn' | 'waitingNote' | 'urgent' | 'important' | 'org'>>
): { task: Task | null; unblocked: Task[] } {
  return updateScopeTask(teamScope(teamId), taskId, updates)
}

/**
 * Delete a task and clean up references in other tasks' blockedBy arrays
 */
export function deleteScopeTask(scope: TaskScope, taskId: string): boolean {
  const tasks = loadScopeTasks(scope)
  const filtered = tasks
    .filter(t => t.id !== taskId)
    .map(t => ({
      ...t,
      blockedBy: t.blockedBy.filter(id => id !== taskId),
    }))

  if (filtered.length === tasks.length) return false
  saveScopeTasks(scope, filtered)
  return true
}

export function deleteTask(teamId: string, taskId: string): boolean {
  return deleteScopeTask(teamScope(teamId), taskId)
}

/**
 * Would making `taskId` wait on `dependencyId` create a loop? It would if
 * `dependencyId` already waits on `taskId`, directly or through other cards:
 * follow each card's blockedBy from the dependency and see whether we reach taskId.
 */
export function wouldCreateScopeCycle(scope: TaskScope, taskId: string, dependencyId: string): boolean {
  const tasks = loadScopeTasks(scope)
  const visited = new Set<string>()
  const stack = [dependencyId]
  while (stack.length > 0) {
    const currentId = stack.pop() as string
    if (currentId === taskId) return true
    if (visited.has(currentId)) continue
    visited.add(currentId)
    const task = tasks.find(t => t.id === currentId)
    if (task) stack.push(...task.blockedBy)
  }
  return false
}

export function wouldCreateCycle(teamId: string, taskId: string, dependencyId: string): boolean {
  return wouldCreateScopeCycle(teamScope(teamId), taskId, dependencyId)
}

// ── Comments ────────────────────────────────────────────────────────────────

export function addScopeComment(
  scope: TaskScope,
  taskId: string,
  data: { author: TaskComment['author']; text: string }
): TaskComment | null {
  const tasks = loadScopeTasks(scope)
  const task = tasks.find(t => t.id === taskId)
  if (!task) return null
  const comment: TaskComment = {
    id: uuidv4(),
    author: data.author,
    text: data.text,
    createdAt: new Date().toISOString(),
    deliveredAt: null,
  }
  task.comments = [...(task.comments || []), comment]
  task.updatedAt = comment.createdAt
  saveScopeTasks(scope, tasks)
  return comment
}

export function markCommentDelivered(scope: TaskScope, taskId: string, commentId: string): boolean {
  const tasks = loadScopeTasks(scope)
  const comment = tasks.find(t => t.id === taskId)?.comments?.find(c => c.id === commentId)
  if (!comment) return false
  if (!comment.deliveredAt) {
    comment.deliveredAt = new Date().toISOString()
    saveScopeTasks(scope, tasks)
  }
  return true
}
