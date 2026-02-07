/**
 * Task Registry - File-based CRUD for team task persistence
 *
 * Storage: ~/.aimaestro/teams/tasks-{teamId}.json (one per team)
 * Mirrors the pattern from lib/team-registry.ts
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { loadAgents } from '@/lib/agent-registry'
import type { Task, TaskWithDeps, TasksFile } from '@/types/task'

const TEAMS_DIR = path.join(os.homedir(), '.aimaestro', 'teams')

function ensureTeamsDir() {
  if (!fs.existsSync(TEAMS_DIR)) {
    fs.mkdirSync(TEAMS_DIR, { recursive: true })
  }
}

function tasksFilePath(teamId: string): string {
  return path.join(TEAMS_DIR, `tasks-${teamId}.json`)
}

export function loadTasks(teamId: string): Task[] {
  try {
    ensureTeamsDir()
    const filePath = tasksFilePath(teamId)
    if (!fs.existsSync(filePath)) {
      return []
    }
    const data = fs.readFileSync(filePath, 'utf-8')
    const parsed: TasksFile = JSON.parse(data)
    return Array.isArray(parsed.tasks) ? parsed.tasks : []
  } catch (error) {
    console.error(`Failed to load tasks for team ${teamId}:`, error)
    return []
  }
}

export function saveTasks(teamId: string, tasks: Task[]): boolean {
  try {
    ensureTeamsDir()
    const file: TasksFile = { version: 1, tasks }
    fs.writeFileSync(tasksFilePath(teamId), JSON.stringify(file, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error(`Failed to save tasks for team ${teamId}:`, error)
    return false
  }
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
    }
  })
}

export function createTask(data: {
  teamId: string
  subject: string
  description?: string
  assigneeAgentId?: string | null
  blockedBy?: string[]
  priority?: number
}): Task {
  const tasks = loadTasks(data.teamId)
  const now = new Date().toISOString()

  const task: Task = {
    id: uuidv4(),
    teamId: data.teamId,
    subject: data.subject,
    description: data.description,
    status: 'pending',
    assigneeAgentId: data.assigneeAgentId || null,
    blockedBy: data.blockedBy || [],
    priority: data.priority,
    createdAt: now,
    updatedAt: now,
  }

  tasks.push(task)
  saveTasks(data.teamId, tasks)
  return task
}

export function getTask(teamId: string, taskId: string): Task | null {
  const tasks = loadTasks(teamId)
  return tasks.find(t => t.id === taskId) || null
}

/**
 * Update a task and return newly unblocked tasks if status changed to completed
 */
export function updateTask(
  teamId: string,
  taskId: string,
  updates: Partial<Pick<Task, 'subject' | 'description' | 'status' | 'assigneeAgentId' | 'blockedBy' | 'priority'>>
): { task: Task | null; unblocked: Task[] } {
  const tasks = loadTasks(teamId)
  const index = tasks.findIndex(t => t.id === taskId)
  if (index === -1) return { task: null, unblocked: [] }

  const now = new Date().toISOString()
  const wasCompleted = tasks[index].status === 'completed'
  const isNowCompleted = updates.status === 'completed'

  tasks[index] = {
    ...tasks[index],
    ...updates,
    updatedAt: now,
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

  saveTasks(teamId, tasks)
  return { task: tasks[index], unblocked }
}

/**
 * Delete a task and clean up references in other tasks' blockedBy arrays
 */
export function deleteTask(teamId: string, taskId: string): boolean {
  const tasks = loadTasks(teamId)
  const filtered = tasks
    .filter(t => t.id !== taskId)
    .map(t => ({
      ...t,
      blockedBy: t.blockedBy.filter(id => id !== taskId),
    }))

  if (filtered.length === tasks.length) return false
  saveTasks(teamId, filtered)
  return true
}

/**
 * Check if adding a dependency would create a circular reference
 */
export function wouldCreateCycle(teamId: string, taskId: string, dependencyId: string): boolean {
  const tasks = loadTasks(teamId)
  const visited = new Set<string>()

  function hasCycle(currentId: string): boolean {
    if (currentId === taskId) return true
    if (visited.has(currentId)) return false
    visited.add(currentId)

    const task = tasks.find(t => t.id === currentId)
    if (!task) return false

    // Check what this task blocks (tasks that depend on it)
    const blockers = tasks.filter(t => t.blockedBy.includes(currentId))
    return blockers.some(b => hasCycle(b.id))
  }

  return hasCycle(dependencyId)
}
