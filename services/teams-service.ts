/**
 * Teams Service
 *
 * Pure business logic extracted from app/api/teams/** routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/teams                          -> listAllTeams
 *   POST   /api/teams                          -> createNewTeam
 *   GET    /api/teams/[id]                     -> getTeamById
 *   PUT    /api/teams/[id]                     -> updateTeamById
 *   DELETE /api/teams/[id]                     -> deleteTeamById
 *   GET    /api/teams/[id]/tasks               -> listTeamTasks
 *   POST   /api/teams/[id]/tasks               -> createTeamTask
 *   PUT    /api/teams/[id]/tasks/[taskId]      -> updateTeamTask
 *   DELETE /api/teams/[id]/tasks/[taskId]      -> deleteTeamTask
 *   GET    /api/teams/[id]/documents            -> listTeamDocuments
 *   POST   /api/teams/[id]/documents            -> createTeamDocument
 *   GET    /api/teams/[id]/documents/[docId]    -> getTeamDocument
 *   PUT    /api/teams/[id]/documents/[docId]    -> updateTeamDocument
 *   DELETE /api/teams/[id]/documents/[docId]    -> deleteTeamDocument
 *   POST   /api/teams/notify                    -> notifyTeamAgents
 */

import { loadTeams, createTeam, getTeam, updateTeam, deleteTeam } from '@/lib/team-registry'
import { loadTasks, resolveTaskDeps, createTask, getTask, updateTask, deleteTask, wouldCreateCycle } from '@/lib/task-registry'
import { loadDocuments, createDocument, getDocument, updateDocument, deleteDocument } from '@/lib/document-registry'
import type { TaskStatus } from '@/types/task'
import { getAgent } from '@/lib/agent-registry'
import { notifyAgent } from '@/lib/notification-service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number  // HTTP-like status code for the route to use
}

export interface CreateTeamParams {
  name: string
  description?: string
  agentIds?: string[]
}

export interface UpdateTeamParams {
  name?: string
  description?: string
  agentIds?: string[]
  lastMeetingAt?: string
  instructions?: string
  lastActivityAt?: string
}

export interface CreateTaskParams {
  subject: string
  description?: string
  assigneeAgentId?: string
  blockedBy?: string[]
  priority?: number
}

export interface UpdateTaskParams {
  subject?: string
  description?: string
  status?: TaskStatus
  assigneeAgentId?: string
  blockedBy?: string[]
  priority?: number
}

export interface CreateDocumentParams {
  title: string
  content?: string
  pinned?: boolean
  tags?: string[]
}

export interface UpdateDocumentParams {
  title?: string
  content?: string
  pinned?: boolean
  tags?: string[]
}

export interface NotifyTeamParams {
  agentIds: string[]
  teamName: string
}

const VALID_TASK_STATUSES = ['backlog', 'pending', 'in_progress', 'review', 'completed']

// ===========================================================================
// PUBLIC API -- called by API routes
// ===========================================================================

// ---------------------------------------------------------------------------
// Teams CRUD
// ---------------------------------------------------------------------------

/**
 * List all teams.
 */
export function listAllTeams(): ServiceResult<{ teams: any[] }> {
  const teams = loadTeams()
  return { data: { teams }, status: 200 }
}

/**
 * Create a new team.
 */
export function createNewTeam(params: CreateTeamParams): ServiceResult<{ team: any }> {
  const { name, description, agentIds } = params

  if (!name || typeof name !== 'string') {
    return { error: 'Team name is required', status: 400 }
  }

  if (agentIds && !Array.isArray(agentIds)) {
    return { error: 'agentIds must be an array', status: 400 }
  }

  try {
    const team = createTeam({ name, description, agentIds: agentIds || [] })
    return { data: { team }, status: 201 }
  } catch (error) {
    console.error('Failed to create team:', error)
    return { error: error instanceof Error ? error.message : 'Failed to create team', status: 500 }
  }
}

/**
 * Get a single team by ID.
 */
export function getTeamById(id: string): ServiceResult<{ team: any }> {
  const team = getTeam(id)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }
  return { data: { team }, status: 200 }
}

/**
 * Update a team by ID.
 */
export function updateTeamById(id: string, params: UpdateTeamParams): ServiceResult<{ team: any }> {
  try {
    const { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt } = params
    const team = updateTeam(id, { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt })
    if (!team) {
      return { error: 'Team not found', status: 404 }
    }
    return { data: { team }, status: 200 }
  } catch (error) {
    console.error('Failed to update team:', error)
    return { error: error instanceof Error ? error.message : 'Failed to update team', status: 500 }
  }
}

/**
 * Delete a team by ID.
 */
export function deleteTeamById(id: string): ServiceResult<{ success: boolean }> {
  const deleted = deleteTeam(id)
  if (!deleted) {
    return { error: 'Team not found', status: 404 }
  }
  return { data: { success: true }, status: 200 }
}

// ---------------------------------------------------------------------------
// Tasks CRUD
// ---------------------------------------------------------------------------

/**
 * List all tasks for a team, with resolved dependencies.
 */
export function listTeamTasks(teamId: string): ServiceResult<{ tasks: any[] }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  const tasks = loadTasks(teamId)
  const resolved = resolveTaskDeps(tasks)
  return { data: { tasks: resolved }, status: 200 }
}

/**
 * Create a new task for a team.
 */
export function createTeamTask(teamId: string, params: CreateTaskParams): ServiceResult<{ task: any }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  const { subject, description, assigneeAgentId, blockedBy, priority } = params

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return { error: 'Subject is required', status: 400 }
  }

  // Validate blockedBy is an array of strings if provided
  if (blockedBy !== undefined) {
    if (!Array.isArray(blockedBy) || !blockedBy.every((id: unknown) => typeof id === 'string')) {
      return { error: 'blockedBy must be an array of task ID strings', status: 400 }
    }
  }

  try {
    const task = createTask({
      teamId,
      subject: subject.trim(),
      description,
      assigneeAgentId,
      blockedBy,
      priority,
    })
    return { data: { task }, status: 201 }
  } catch (error) {
    console.error('Failed to create task:', error)
    return { error: error instanceof Error ? error.message : 'Failed to create task', status: 500 }
  }
}

/**
 * Update a task within a team.
 */
export function updateTeamTask(
  teamId: string,
  taskId: string,
  params: UpdateTaskParams
): ServiceResult<{ task: any; unblocked?: any[] }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  const existing = getTask(teamId, taskId)
  if (!existing) {
    return { error: 'Task not found', status: 404 }
  }

  const { subject, description, status, assigneeAgentId, blockedBy, priority } = params

  // Validate blockedBy to prevent circular dependencies
  if (Array.isArray(blockedBy)) {
    for (const depId of blockedBy) {
      if (typeof depId !== 'string') {
        return { error: 'blockedBy must contain only string task IDs', status: 400 }
      }
      if (depId === taskId) {
        return { error: 'A task cannot depend on itself', status: 400 }
      }
      if (wouldCreateCycle(teamId, taskId, depId)) {
        return { error: `Adding dependency on task ${depId} would create a circular reference`, status: 400 }
      }
    }
  }

  // Validate status enum
  if (status !== undefined && !VALID_TASK_STATUSES.includes(status)) {
    return { error: 'Invalid status. Must be backlog, pending, in_progress, review, or completed', status: 400 }
  }

  try {
    const result = updateTask(teamId, taskId, {
      subject,
      description,
      status,
      assigneeAgentId,
      blockedBy,
      priority,
    })

    if (!result.task) {
      return { error: 'Task not found', status: 404 }
    }

    return { data: { task: result.task, unblocked: result.unblocked }, status: 200 }
  } catch (error) {
    console.error('Failed to update task:', error)
    return { error: error instanceof Error ? error.message : 'Failed to update task', status: 500 }
  }
}

/**
 * Delete a task from a team.
 */
export function deleteTeamTask(teamId: string, taskId: string): ServiceResult<{ success: boolean }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  const deleted = deleteTask(teamId, taskId)
  if (!deleted) {
    return { error: 'Task not found', status: 404 }
  }

  return { data: { success: true }, status: 200 }
}

// ---------------------------------------------------------------------------
// Documents CRUD
// ---------------------------------------------------------------------------

/**
 * List all documents for a team.
 */
export function listTeamDocuments(teamId: string): ServiceResult<{ documents: any[] }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  const documents = loadDocuments(teamId)
  return { data: { documents }, status: 200 }
}

/**
 * Create a new document for a team.
 */
export function createTeamDocument(teamId: string, params: CreateDocumentParams): ServiceResult<{ document: any }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  const { title, content, pinned, tags } = params

  if (!title || typeof title !== 'string') {
    return { error: 'title is required', status: 400 }
  }

  try {
    const document = createDocument({
      teamId,
      title,
      content: content || '',
      pinned,
      tags,
    })
    return { data: { document }, status: 201 }
  } catch (error) {
    console.error('Failed to create document:', error)
    return { error: error instanceof Error ? error.message : 'Failed to create document', status: 500 }
  }
}

/**
 * Get a single document by ID.
 */
export function getTeamDocument(teamId: string, docId: string): ServiceResult<{ document: any }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  const document = getDocument(teamId, docId)
  if (!document) {
    return { error: 'Document not found', status: 404 }
  }

  return { data: { document }, status: 200 }
}

/**
 * Update a document by ID.
 */
export function updateTeamDocument(
  teamId: string,
  docId: string,
  params: UpdateDocumentParams
): ServiceResult<{ document: any }> {
  try {
    const updates: Record<string, unknown> = {}
    if (params.title !== undefined) updates.title = params.title
    if (params.content !== undefined) updates.content = params.content
    if (params.pinned !== undefined) updates.pinned = params.pinned
    if (params.tags !== undefined) updates.tags = params.tags

    const document = updateDocument(teamId, docId, updates as any)
    if (!document) {
      return { error: 'Document not found', status: 404 }
    }

    return { data: { document }, status: 200 }
  } catch (error) {
    console.error('Failed to update document:', error)
    return { error: error instanceof Error ? error.message : 'Failed to update document', status: 500 }
  }
}

/**
 * Delete a document by ID.
 */
export function deleteTeamDocument(teamId: string, docId: string): ServiceResult<{ success: boolean }> {
  const deleted = deleteDocument(teamId, docId)
  if (!deleted) {
    return { error: 'Document not found', status: 404 }
  }

  return { data: { success: true }, status: 200 }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Notify team agents about a meeting.
 */
export async function notifyTeamAgents(params: NotifyTeamParams): Promise<ServiceResult<{ results: any[] }>> {
  const { agentIds, teamName } = params

  if (!agentIds || !Array.isArray(agentIds)) {
    return { error: 'agentIds array is required', status: 400 }
  }

  if (!teamName || typeof teamName !== 'string') {
    return { error: 'teamName is required', status: 400 }
  }

  try {
    const results = await Promise.all(
      agentIds.map(async (agentId: string) => {
        const agent = getAgent(agentId)
        if (!agent) {
          return { agentId, success: false, reason: 'Agent not found' }
        }

        const agentName = agent.name || agent.alias || 'unknown'
        try {
          const result = await notifyAgent({
            agentId: agent.id,
            agentName,
            agentHost: agent.hostId,
            fromName: 'AI Maestro',
            subject: `Team "${teamName}" is starting`,
            messageId: `meeting-${Date.now()}`,
            messageType: 'notification',
          })
          return { agentId, agentName, ...result }
        } catch (error) {
          return { agentId, agentName, success: false, error: String(error) }
        }
      })
    )

    return { data: { results }, status: 200 }
  } catch (error) {
    console.error('Failed to notify team:', error)
    return { error: error instanceof Error ? error.message : 'Failed to notify team', status: 500 }
  }
}
