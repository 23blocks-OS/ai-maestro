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
import { parseKindAndOrigin } from '@/lib/task-origin'
import { parseDueInput, parseOwnersInput } from '@/lib/task-due'
import { getSelfHostId } from '@/lib/hosts-config'
import { loadTasks, resolveTaskDeps, createTask, getTask, updateTask, deleteTask, wouldCreateCycle } from '@/lib/task-registry'
import { loadDocuments, createDocument, getDocument, updateDocument, deleteDocument } from '@/lib/document-registry'
import type { TaskStatus } from '@/types/task'
import { getAgent } from '@/lib/agent-registry'
import { notifyAgent } from '@/lib/notification-service'
import { findPeerHostUrl } from '@/lib/owning-host'
import { type ServiceResult, missingField, notFound, invalidField, operationFailed, selfReference, circularDependency } from '@/services/service-errors'

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
  kind?: string
  origin?: unknown
  due?: unknown
  owners?: unknown
}

export interface UpdateTaskParams {
  subject?: string
  description?: string
  status?: TaskStatus
  assigneeAgentId?: string
  blockedBy?: string[]
  priority?: number
  waitingOn?: string
  waitingNote?: string
  urgent?: boolean | null
  important?: boolean | null
  /** YYYY-MM-DD, or null to clear */
  due?: unknown
  /** Extra owners (agent ids or names); a list replaces, null or [] clears */
  owners?: unknown
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

const VALID_TASK_STATUSES = ['backlog', 'pending', 'in_progress', 'review', 'waiting', 'completed']

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
    return missingField('name')
  }

  if (agentIds && !Array.isArray(agentIds)) {
    return invalidField('agentIds', 'agentIds must be an array')
  }

  try {
    const team = createTeam({ name, description, agentIds: agentIds || [] })
    return { data: { team }, status: 201 }
  } catch (error) {
    console.error('Failed to create team:', error)
    return operationFailed('create team', (error as Error).message)
  }
}

/**
 * Get a single team by ID.
 */
export function getTeamById(id: string): ServiceResult<{ team: any }> {
  const team = getTeam(id)
  if (!team) {
    return notFound('Team', id)
  }
  return { data: { team }, status: 200 }
}

/**
 * Update a team by ID.
 */
export function updateTeamById(id: string, params: UpdateTeamParams): ServiceResult<{ team: any }> {
  try {
    // Filter out undefined values to avoid overwriting existing fields
    const updates: Record<string, unknown> = {}
    if (params.name !== undefined) updates.name = params.name
    if (params.description !== undefined) updates.description = params.description
    if (params.agentIds !== undefined) updates.agentIds = params.agentIds
    if (params.lastMeetingAt !== undefined) updates.lastMeetingAt = params.lastMeetingAt
    if (params.instructions !== undefined) updates.instructions = params.instructions
    if (params.lastActivityAt !== undefined) updates.lastActivityAt = params.lastActivityAt
    const team = updateTeam(id, updates as any)
    if (!team) {
      return notFound('Team', id)
    }
    return { data: { team }, status: 200 }
  } catch (error) {
    console.error('Failed to update team:', error)
    return operationFailed('update team', (error as Error).message)
  }
}

/**
 * Delete a team by ID.
 */
export function deleteTeamById(id: string): ServiceResult<{ success: boolean }> {
  const deleted = deleteTeam(id)
  if (!deleted) {
    return notFound('Team', id)
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
    return notFound('Team', teamId)
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
    return notFound('Team', teamId)
  }

  const { subject, description, assigneeAgentId, blockedBy, priority } = params
  const ko = parseKindAndOrigin(params as { kind?: unknown; origin?: unknown }, getSelfHostId())
  if (!ko.ok) return invalidField(ko.field, ko.message)
  const due = parseDueInput(params.due)
  if (!due.ok) return invalidField('due', due.message)
  const owners = parseOwnersInput(params.owners, [assigneeAgentId])
  if (!owners.ok) return invalidField('owners', owners.message)

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return missingField('subject')
  }

  // Validate blockedBy is an array of strings if provided
  if (blockedBy !== undefined) {
    if (!Array.isArray(blockedBy) || !blockedBy.every((id: unknown) => typeof id === 'string')) {
      return invalidField('blockedBy', 'blockedBy must be an array of task ID strings')
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
      due: due.value,
      owners: owners.value,
      kind: ko.value.kind,
      origin: ko.value.origin,
    })
    return { data: { task }, status: 201 }
  } catch (error) {
    console.error('Failed to create task:', error)
    return operationFailed('create task', (error as Error).message)
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
    return notFound('Team', teamId)
  }

  const existing = getTask(teamId, taskId)
  if (!existing) {
    return notFound('Task', taskId)
  }

  const { subject, description, status, assigneeAgentId, blockedBy, priority, waitingOn, waitingNote, urgent, important } = params
  for (const [key, v] of [['urgent', urgent], ['important', important]] as const) {
    if (v !== undefined && v !== null && typeof v !== 'boolean') return invalidField(key, `${key} must be true, false or null`)
  }

  const due = parseDueInput(params.due)
  if (!due.ok) return invalidField('due', due.message)
  const owners = parseOwnersInput(params.owners, [assigneeAgentId === undefined ? existing.assigneeAgentId : assigneeAgentId])
  if (!owners.ok) return invalidField('owners', owners.message)

  // Validate blockedBy to prevent circular dependencies
  if (Array.isArray(blockedBy)) {
    for (const depId of blockedBy) {
      if (typeof depId !== 'string') {
        return invalidField('blockedBy', 'blockedBy must contain only string task IDs')
      }
      if (depId === taskId) {
        return selfReference('A task cannot depend on itself')
      }
      if (wouldCreateCycle(teamId, taskId, depId)) {
        return circularDependency(`Adding dependency on task ${depId} would create a circular reference`)
      }
    }
  }

  // Validate status enum
  if (status !== undefined && !VALID_TASK_STATUSES.includes(status)) {
    return invalidField('status', 'Invalid status. Must be backlog, pending, in_progress, review, waiting, or completed')
  }

  // A waiting card says what it waits on: juan, outside, hold, or an agent id
  if ((status ?? existing.status) === 'waiting' && !(waitingOn ?? existing.waitingOn)) {
    return invalidField('waitingOn', 'A waiting card needs waitingOn: juan, outside, hold, or an agent id or name')
  }

  try {
    const result = updateTask(teamId, taskId, {
      subject,
      description,
      status,
      assigneeAgentId,
      blockedBy,
      priority,
      waitingOn,
      waitingNote,
      urgent,
      important,
      due: due.value,
      owners: owners.value,
    })

    if (!result.task) {
      return notFound('Task', taskId)
    }

    return { data: { task: result.task, unblocked: result.unblocked }, status: 200 }
  } catch (error) {
    console.error('Failed to update task:', error)
    return operationFailed('update task', (error as Error).message)
  }
}

/**
 * Delete a task from a team.
 */
export function deleteTeamTask(teamId: string, taskId: string): ServiceResult<{ success: boolean }> {
  const team = getTeam(teamId)
  if (!team) {
    return notFound('Team', teamId)
  }

  const deleted = deleteTask(teamId, taskId)
  if (!deleted) {
    return notFound('Task', taskId)
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
    return notFound('Team', teamId)
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
    return notFound('Team', teamId)
  }

  const { title, content, pinned, tags } = params

  if (!title || typeof title !== 'string') {
    return missingField('title')
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
    return operationFailed('create document', (error as Error).message)
  }
}

/**
 * Get a single document by ID.
 */
export function getTeamDocument(teamId: string, docId: string): ServiceResult<{ document: any }> {
  const team = getTeam(teamId)
  if (!team) {
    return notFound('Team', teamId)
  }

  const document = getDocument(teamId, docId)
  if (!document) {
    return notFound('Document', docId)
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
      return notFound('Document', docId)
    }

    return { data: { document }, status: 200 }
  } catch (error) {
    console.error('Failed to update document:', error)
    return operationFailed('update document', (error as Error).message)
  }
}

/**
 * Delete a document by ID.
 */
export function deleteTeamDocument(teamId: string, docId: string): ServiceResult<{ success: boolean }> {
  const deleted = deleteDocument(teamId, docId)
  if (!deleted) {
    return notFound('Document', docId)
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
    return missingField('agentIds')
  }

  if (!teamName || typeof teamName !== 'string') {
    return missingField('teamName')
  }

  try {
    const results = await Promise.all(
      agentIds.map(async (agentId: string) => {
        const agent = getAgent(agentId)
        if (!agent) {
          // Not on this host: the host that has it sends the notification
          const peer = await findPeerHostUrl(agentId)
          if (!peer) return { agentId, success: false, reason: 'Agent not found on any host' }
          try {
            const res = await fetch(`${peer.replace(/\/$/, '')}/api/teams/notify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ agentIds: [agentId], teamName }),
              signal: AbortSignal.timeout(10_000),
            })
            const data = await res.json().catch(() => ({}))
            const first = Array.isArray(data?.results) ? data.results[0] : undefined
            return res.ok && first ? first : { agentId, success: false, reason: `the host answered ${res.status}` }
          } catch (error) {
            return { agentId, success: false, reason: 'the host did not answer' }
          }
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
    return operationFailed('notify team', (error as Error).message)
  }
}
