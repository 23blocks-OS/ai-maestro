
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

import { loadTeams, createTeam, getTeam, updateTeam, deleteTeam, TeamValidationException } from '@/lib/team-registry'
import { loadTasks, resolveTaskDeps, createTask, getTask, updateTask, deleteTask, wouldCreateCycle } from '@/lib/task-registry'
import { loadDocuments, createDocument, getDocument, updateDocument, deleteDocument } from '@/lib/document-registry'
import type { TaskStatus, TaskWithDeps } from '@/types/task'
import { DEFAULT_STATUSES } from '@/types/task'
import type { Team, KanbanColumnConfig } from '@/types/team'
import { DEFAULT_KANBAN_COLUMNS } from '@/types/team'
import type { TeamDocument } from '@/types/document'
import { getAgent, loadAgents } from '@/lib/agent-registry'
import { notifyAgent } from '@/lib/notification-service'
import { getManagerId, isManager } from '@/lib/governance'
import { checkTeamAccess } from '@/lib/team-acl'
import { isValidUuid } from '@/lib/validation'
import type { TeamType } from '@/types/governance'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { ServiceResult } from '@/types/service'
// NT-006: ServiceResult re-export removed — import directly from @/types/service

export interface CreateTeamParams {
  name: string
  description?: string
  agentIds?: string[]
  type?: TeamType
  chiefOfStaffId?: string
  requestingAgentId?: string
}

export interface UpdateTeamParams {
  name?: string
  description?: string
  agentIds?: string[]
  lastMeetingAt?: string
  instructions?: string
  lastActivityAt?: string
  type?: TeamType
  chiefOfStaffId?: string | null
  requestingAgentId?: string
}

export interface CreateTaskParams {
  subject: string
  description?: string
  // SF-007: Allow null to explicitly unassign -- matches task-registry's `string | null` type
  assigneeAgentId?: string | null
  blockedBy?: string[]
  priority?: number
  status?: string
  labels?: string[]
  taskType?: string
  externalRef?: string
  externalProjectRef?: string
  acceptanceCriteria?: string[]
  handoffDoc?: string
  prUrl?: string
  requestingAgentId?: string
}

export interface UpdateTaskParams {
  subject?: string
  description?: string
  status?: string
  // SF-008: Allow null to explicitly unassign -- matches task-registry's `string | null` type
  assigneeAgentId?: string | null
  blockedBy?: string[]
  priority?: number
  labels?: string[]
  taskType?: string
  externalRef?: string
  externalProjectRef?: string
  previousStatus?: string
  acceptanceCriteria?: string[]
  handoffDoc?: string
  prUrl?: string
  reviewResult?: string
  requestingAgentId?: string
}

export interface CreateDocumentParams {
  title: string
  content?: string
  pinned?: boolean
  tags?: string[]
  requestingAgentId?: string
}

export interface UpdateDocumentParams {
  title?: string
  content?: string
  pinned?: boolean
  tags?: string[]
  requestingAgentId?: string
}

export interface NotifyTeamParams {
  agentIds: string[]
  teamName: string
}

// SF-004: Concrete type for notification results (replaces any[])
export interface AgentNotifyResult {
  agentId: string
  agentName?: string
  success: boolean
  reason?: string
  error?: string
}

const VALID_TASK_STATUSES = DEFAULT_STATUSES

// ===========================================================================
// PUBLIC API -- called by API routes
// ===========================================================================

// ---------------------------------------------------------------------------
// Teams CRUD
// ---------------------------------------------------------------------------

/**
 * List all teams.
 */
export function listAllTeams(): ServiceResult<{ teams: Team[] }> {
  const teams = loadTeams()
  return { data: { teams }, status: 200 }
}

/**
 * Create a new team.
 * Governance: validates team type, passes managerId and agentNames to createTeam
 * for business rule enforcement (R1-R4).
 */
export async function createNewTeam(params: CreateTeamParams): Promise<ServiceResult<{ team: any }>> {
  const { name, description, agentIds } = params

  if (!name || typeof name !== 'string') {
    return { error: 'Team name is required', status: 400 }
  }

  if (agentIds && !Array.isArray(agentIds)) {
    return { error: 'agentIds must be an array', status: 400 }
  }

  // Governance: validate type field
  if (params.type && params.type !== 'open' && params.type !== 'closed') {
    return { error: 'type must be "open" or "closed"', status: 400 }
  }

  // Governance: only MANAGER or web UI (no requestingAgentId) can create teams
  if (params.requestingAgentId) {
    const managerId = getManagerId()
    if (managerId && managerId !== params.requestingAgentId) {
      return { error: 'Only the MANAGER agent can create teams. Use the dashboard to create teams without manager role.', status: 403 }
    }
  }

  try {
    // Pass governance context (managerId + agent names for collision checks) to createTeam
    const managerId = getManagerId()
    const agentNames = loadAgents().map(a => a.name).filter(Boolean)
    const team = await createTeam(
      { name, description, agentIds: agentIds || [], type: params.type, chiefOfStaffId: params.chiefOfStaffId },
      managerId,
      agentNames
    )
    return { data: { team }, status: 201 }
  } catch (error) {
    // TeamValidationException carries a specific HTTP status code from governance rules
    if (error instanceof TeamValidationException) {
      return { error: error.message, status: error.code }
    }
    console.error('Failed to create team:', error)
    return { error: error instanceof Error ? error.message : 'Failed to create team', status: 500 }
  }
}

/**
 * Get a single team by ID.
 * Governance: validates UUID format, enforces team ACL for closed teams.
 */
export function getTeamById(id: string, requestingAgentId?: string): ServiceResult<{ team: any }> {
  // Validate UUID format to prevent path traversal and invalid lookups
  if (!isValidUuid(id)) {
    return { error: 'Invalid team ID format', status: 400 }
  }

  const team = getTeam(id)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  // Governance ACL: closed teams restrict access to manager, COS, and members
  // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
  const access = checkTeamAccess({ teamId: id, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  return { data: { team }, status: 200 }
}

/**
 * Update a team by ID.
 * Governance: enforces ACL for closed teams, passes managerId + agentNames
 * to updateTeam for business rule enforcement (R1-R4).
 */
export async function updateTeamById(id: string, params: UpdateTeamParams): Promise<ServiceResult<{ team: any }>> {
  // Validate UUID format for consistency with getTeamById (CC-008)
  if (!isValidUuid(id)) {
    return { error: 'Invalid team ID', status: 400 }
  }

  try {
    // Destructure requestingAgentId, type, and chiefOfStaffId out so they do not leak
    // into the lib update call. Governance type/COS changes must go through dedicated
    // endpoints, not the general update path (CC-007 defense-in-depth).
    const { requestingAgentId, type: _type, chiefOfStaffId: _cos, ...updateFields } = params

    // Governance ACL: closed teams restrict mutations to manager, COS, and members
    // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
    const access = checkTeamAccess({ teamId: id, requestingAgentId })
    if (!access.allowed) {
      return { error: access.reason || 'Access denied', status: 403 }
    }

    // Pass governance context (managerId + agent names for collision checks) to updateTeam
    const managerId = getManagerId()
    const agentNames = loadAgents().map(a => a.name).filter(Boolean)
    const team = await updateTeam(id, updateFields, managerId, agentNames)
    if (!team) {
      return { error: 'Team not found', status: 404 }
    }
    return { data: { team }, status: 200 }
  } catch (error) {
    // TeamValidationException carries a specific HTTP status code from governance rules
    if (error instanceof TeamValidationException) {
      return { error: error.message, status: error.code }
    }
    console.error('Failed to update team:', error)
    return { error: error instanceof Error ? error.message : 'Failed to update team', status: 500 }
  }
}

/**
 * Delete a team by ID.
 * Governance: closed team deletion requires MANAGER or COS authority.
 */
export async function deleteTeamById(id: string, requestingAgentId?: string): Promise<ServiceResult<{ success: boolean }>> {
  // Validate UUID format for consistency with getTeamById (CC-008)
  if (!isValidUuid(id)) {
    return { error: 'Invalid team ID', status: 400 }
  }

  const team = getTeam(id)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  // Governance ACL: closed teams restrict mutations to manager, COS, and members
  // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
  const access = checkTeamAccess({ teamId: id, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  // Governance: closed team deletion requires MANAGER or Chief-of-Staff authority
  if (team.type === 'closed') {
    if (!requestingAgentId) {
      return { error: 'Closed team deletion requires agent identity (X-Agent-Id header)', status: 400 }
    }
    const managerId = getManagerId()
    if (requestingAgentId !== managerId && team.chiefOfStaffId !== requestingAgentId) {
      return { error: 'Only MANAGER or the team Chief-of-Staff can delete a closed team', status: 403 }
    }
  }

  const deleted = await deleteTeam(id)
  if (!deleted) {
    return { error: 'Team not found', status: 404 }
  }
  return { data: { success: true }, status: 200 }
}

// ---------------------------------------------------------------------------
// Bulk Stats (SF-028: Eliminates N+1 fetch for team task/document counts)
// ---------------------------------------------------------------------------

/**
 * Get task and document counts for all teams in a single call.
 * Returns a map of teamId -> { taskCount, docCount }.
 */
export function getTeamsBulkStats(): ServiceResult<Record<string, { taskCount: number; docCount: number }>> {
  const teams = loadTeams()
  const stats: Record<string, { taskCount: number; docCount: number }> = {}
  for (const team of teams) {
    const tasks = loadTasks(team.id)
    const documents = loadDocuments(team.id)
    stats[team.id] = { taskCount: tasks.length, docCount: documents.length }
  }
  return { data: stats, status: 200 }
}

// ---------------------------------------------------------------------------
// Tasks CRUD
// ---------------------------------------------------------------------------

/**
 * List all tasks for a team, with resolved dependencies.
 * Governance: enforces team ACL for closed teams.
 */
export function listTeamTasks(teamId: string, requestingAgentId?: string, filters?: { assignee?: string; status?: string; label?: string; taskType?: string }): ServiceResult<{ tasks: TaskWithDeps[] }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  // Governance ACL: closed teams restrict access to manager, COS, and members
  // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  const tasks = loadTasks(teamId)
  const resolved = resolveTaskDeps(tasks)
  let filtered = resolved
  if (filters) {
    if (filters.assignee) filtered = filtered.filter(t => t.assigneeAgentId === filters.assignee)
    if (filters.status) filtered = filtered.filter(t => t.status === filters.status)
    if (filters.label) filtered = filtered.filter(t => t.labels?.includes(filters.label!) || false)
    if (filters.taskType) filtered = filtered.filter(t => t.taskType === filters.taskType)
  }
  return { data: { tasks: filtered }, status: 200 }
}

/**
 * Get a single task by ID within a team.
 * Governance: enforces team ACL for closed teams.
 * SF-010: Added to support GET /api/teams/[id]/tasks/[taskId]
 */
export function getTeamTask(teamId: string, taskId: string, requestingAgentId?: string): ServiceResult<{ task: any }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  const task = getTask(teamId, taskId)
  if (!task) {
    return { error: 'Task not found', status: 404 }
  }

  return { data: { task }, status: 200 }
}

/**
 * Create a new task for a team.
 * Governance: enforces team ACL for closed teams.
 */
export async function createTeamTask(teamId: string, params: CreateTaskParams): Promise<ServiceResult<{ task: any }>> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  // Governance ACL: closed teams restrict mutations to manager, COS, and members
  // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
  const { requestingAgentId, ...taskFields } = params
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  const { subject, description, assigneeAgentId, blockedBy, priority } = taskFields

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
    const task = await createTask({
      teamId,
      subject: subject.trim(),
      description,
      assigneeAgentId,
      blockedBy,
      priority,
      status: taskFields.status,
      labels: taskFields.labels,
      taskType: taskFields.taskType,
      externalRef: taskFields.externalRef,
      externalProjectRef: taskFields.externalProjectRef,
      acceptanceCriteria: taskFields.acceptanceCriteria,
      handoffDoc: taskFields.handoffDoc,
      prUrl: taskFields.prUrl,
    })
    return { data: { task }, status: 201 }
  } catch (error) {
    console.error('Failed to create task:', error)
    return { error: error instanceof Error ? error.message : 'Failed to create task', status: 500 }
  }
}

/**
 * Update a task within a team.
 * Governance: enforces team ACL for closed teams.
 */
export async function updateTeamTask(
  teamId: string,
  taskId: string,
  params: UpdateTaskParams
): Promise<ServiceResult<{ task: any; unblocked?: any[] }>> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  // Governance ACL: closed teams restrict mutations to manager, COS, and members
  // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
  const { requestingAgentId, ...taskFields } = params
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  const existing = getTask(teamId, taskId)
  if (!existing) {
    return { error: 'Task not found', status: 404 }
  }

  const { subject, description, status, assigneeAgentId, blockedBy, priority } = taskFields

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

  // Validate status against team's kanban config columns (or default statuses)
  if (status !== undefined) {
    const validStatuses = (team.kanbanConfig || DEFAULT_KANBAN_COLUMNS).map(c => c.id)
    if (!validStatuses.includes(status)) {
      return { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`, status: 400 }
    }
  }

  try {
    const result = await updateTask(teamId, taskId, {
      subject,
      description,
      status,
      assigneeAgentId,
      blockedBy,
      priority,
      labels: taskFields.labels,
      taskType: taskFields.taskType,
      externalRef: taskFields.externalRef,
      externalProjectRef: taskFields.externalProjectRef,
      previousStatus: taskFields.previousStatus,
      acceptanceCriteria: taskFields.acceptanceCriteria,
      handoffDoc: taskFields.handoffDoc,
      prUrl: taskFields.prUrl,
      reviewResult: taskFields.reviewResult,
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
 * Governance: enforces team ACL for closed teams.
 */
export async function deleteTeamTask(teamId: string, taskId: string, requestingAgentId?: string): Promise<ServiceResult<{ success: boolean }>> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  // Governance ACL: closed teams restrict mutations to manager, COS, and members
  // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  const deleted = await deleteTask(teamId, taskId)
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
 * Governance: enforces team ACL for closed teams.
 */
export function listTeamDocuments(teamId: string, requestingAgentId?: string): ServiceResult<{ documents: TeamDocument[] }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  // Governance ACL: closed teams restrict access to manager, COS, and members
  // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  const documents = loadDocuments(teamId)
  return { data: { documents }, status: 200 }
}

/**
 * Create a new document for a team.
 * Governance: enforces team ACL for closed teams.
 */
export async function createTeamDocument(teamId: string, params: CreateDocumentParams): Promise<ServiceResult<{ document: any }>> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  // Governance ACL: closed teams restrict mutations to manager, COS, and members
  // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
  const { requestingAgentId, ...docFields } = params
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  const { title, content, pinned, tags } = docFields

  if (!title || typeof title !== 'string') {
    return { error: 'title is required', status: 400 }
  }

  try {
    const document = await createDocument({
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
 * Governance: enforces team ACL for closed teams.
 */
export function getTeamDocument(teamId: string, docId: string, requestingAgentId?: string): ServiceResult<{ document: any }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  // Governance ACL: closed teams restrict access to manager, COS, and members
  // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  const document = getDocument(teamId, docId)
  if (!document) {
    return { error: 'Document not found', status: 404 }
  }

  return { data: { document }, status: 200 }
}

/**
 * Update a document by ID.
 * Governance: enforces team ACL for closed teams.
 */
export async function updateTeamDocument(
  teamId: string,
  docId: string,
  params: UpdateDocumentParams
): Promise<ServiceResult<{ document: any }>> {
  // Validate team exists before attempting document update (CC-005)
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  // Governance ACL: closed teams restrict mutations to manager, COS, and members
  // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
  const { requestingAgentId, ...docFields } = params
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  try {
    const updates: Record<string, unknown> = {}
    if (docFields.title !== undefined) updates.title = docFields.title
    if (docFields.content !== undefined) updates.content = docFields.content
    if (docFields.pinned !== undefined) updates.pinned = docFields.pinned
    if (docFields.tags !== undefined) updates.tags = docFields.tags

    const document = await updateDocument(teamId, docId, updates as any)
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
 * Governance: enforces team ACL for closed teams.
 */
export async function deleteTeamDocument(teamId: string, docId: string, requestingAgentId?: string): Promise<ServiceResult<{ success: boolean }>> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  // Governance ACL: closed teams restrict mutations to manager, COS, and members
  // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  const deleted = await deleteDocument(teamId, docId)
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
export async function notifyTeamAgents(params: NotifyTeamParams): Promise<ServiceResult<{ results: AgentNotifyResult[] }>> {
  const { agentIds, teamName } = params

  if (!agentIds || !Array.isArray(agentIds)) {
    return { error: 'agentIds array is required', status: 400 }
  }

  if (!teamName || typeof teamName !== 'string') {
    return { error: 'teamName is required', status: 400 }
  }

  // Strip control characters to prevent command injection via tmux send-keys
  const safeTeamName = teamName.replace(/[\x00-\x1F\x7F]/g, '')

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
            subject: `Team "${safeTeamName}" is starting`,
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

// ---------------------------------------------------------------------------
// Kanban Configuration
// ---------------------------------------------------------------------------

/**
 * Get kanban column configuration for a team.
 * Returns team's custom config or DEFAULT_KANBAN_COLUMNS.
 */
export function getKanbanConfig(teamId: string, requestingAgentId?: string): ServiceResult<{ columns: KanbanColumnConfig[] }> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }
  return { data: { columns: team.kanbanConfig || DEFAULT_KANBAN_COLUMNS }, status: 200 }
}

/**
 * Set kanban column configuration for a team.
 */
export async function setKanbanConfig(teamId: string, columns: KanbanColumnConfig[], requestingAgentId?: string): Promise<ServiceResult<{ columns: KanbanColumnConfig[] }>> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    return { error: 'columns must be a non-empty array', status: 400 }
  }
  for (const col of columns) {
    if (!col.id || !col.label || !col.color) {
      return { error: 'Each column must have id, label, and color', status: 400 }
    }
  }
  try {
    await updateTeam(teamId, { kanbanConfig: columns } as any)
    return { data: { columns }, status: 200 }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to update kanban config', status: 500 }
  }
}
