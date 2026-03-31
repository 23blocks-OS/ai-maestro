
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
 *   GET    /api/teams/[id]/tasks/[taskId]      -> getTeamTask
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
// Local task-registry removed (governance simplification 2026-03-27) — kanban uses GitHub Projects exclusively
import { loadDocuments, createDocument, getDocument, updateDocument, deleteDocument } from '@/lib/document-registry'
import * as ghProject from '@/lib/github-project'
import type { TaskWithDeps } from '@/types/task'
import type { Team, KanbanColumnConfig } from '@/types/team'
import { DEFAULT_KANBAN_COLUMNS } from '@/types/team'
import type { TeamDocument } from '@/types/document'
import { getAgent, loadAgents } from '@/lib/agent-registry'
import { notifyAgent } from '@/lib/notification-service'
import { getManagerId, isManager, isChiefOfStaffAnywhere, verifyPassword, loadGovernance } from '@/lib/governance'
import { checkAndRecordAttempt, resetRateLimit } from '@/lib/rate-limit'
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
  orchestratorId?: string | null
  githubProject?: { owner: string; repo: string; number: number } | null
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

// Local VALID_TASK_STATUSES removed — task status validation done by GitHub Projects

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
 * Create a new team (always closed after governance simplification).
 * Governance: passes managerId and agentNames to createTeam for business rule enforcement.
 * All teams are closed — the type parameter is ignored.
 */
export async function createNewTeam(params: CreateTeamParams): Promise<ServiceResult<{ team: any; needsChiefOfStaff?: boolean }>> {
  const { name, description, agentIds } = params

  if (!name || typeof name !== 'string') {
    return { error: 'Team name is required', status: 400 }
  }

  if (agentIds && !Array.isArray(agentIds)) {
    return { error: 'agentIds must be an array', status: 400 }
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
      { name, description, agentIds: agentIds || [], type: 'closed', chiefOfStaffId: params.chiefOfStaffId },
      managerId,
      agentNames
    )

    // Auto-COS chain: auto-assign the COS role-plugin so the agent gets its governance persona.
    // All teams are closed, so always attempt COS plugin assignment when chiefOfStaffId is provided.
    if (params.chiefOfStaffId) {
      try {
        const { autoAssignRolePluginForTitle } = await import('@/services/role-plugin-service')
        await autoAssignRolePluginForTitle('chief-of-staff', params.chiefOfStaffId)
      } catch (err) {
        // Non-blocking — team creation succeeds even if plugin install fails
        console.warn('[teams] Failed to auto-assign COS role-plugin:', err instanceof Error ? err.message : err)
      }
    }

    // Flag if team still needs a COS
    const needsChiefOfStaff = !team.chiefOfStaffId
    return { data: { team, needsChiefOfStaff }, status: 201 }
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
    const { requestingAgentId, type: _type, chiefOfStaffId: _cos, githubProject: ghProj, ...updateFields } = params

    // Governance ACL: closed teams restrict mutations to manager, COS, and members
    // Always call checkTeamAccess -- it handles undefined requestingAgentId (returns allowed: true)
    const access = checkTeamAccess({ teamId: id, requestingAgentId })
    if (!access.allowed) {
      return { error: access.reason || 'Access denied', status: 403 }
    }

    // Convert null to undefined to unlink githubProject; omit entirely if unchanged
    const finalFields = {
      ...updateFields,
      ...(ghProj !== undefined && { githubProject: ghProj ?? undefined }),
    }

    // Pass governance context (managerId + agent names for collision checks) to updateTeam
    const managerId = getManagerId()
    const agentNames = loadAgents().map(a => a.name).filter(Boolean)
    const team = await updateTeam(id, finalFields, managerId, agentNames)
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
export async function deleteTeamById(id: string, requestingAgentId?: string, password?: string): Promise<ServiceResult<{ success: boolean }>> {
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

  // Governance: team deletion is a destructive USER-only operation requiring governance password.
  // This prevents agents from deleting teams without human authorization.
  const config = loadGovernance()
  if (config.passwordHash) {
    if (!password || typeof password !== 'string') {
      return { error: 'Team deletion requires governance password', status: 400 }
    }
    // MF-001: Apply rate limiting to prevent brute-force of governance password, consistent
    // with setManagerRole and setGovernancePassword in governance-service.ts.
    const rateLimitKey = `team-delete-password:${id}`
    const rateCheck = checkAndRecordAttempt(rateLimitKey)
    if (!rateCheck.allowed) {
      const retryAfterSeconds = Math.ceil(rateCheck.retryAfterMs / 1000)
      return { error: `Too many failed attempts. Try again in ${retryAfterSeconds}s`, status: 429 }
    }
    if (!(await verifyPassword(password))) {
      return { error: 'Invalid governance password', status: 401 }
    }
    resetRateLimit(rateLimitKey)
  }

  // Governance: team deletion requires MANAGER, Chief-of-Staff, or system owner (web UI)
  // System owner (requestingAgentId === undefined) is allowed — they already provided the password above
  if (requestingAgentId) {
    const managerId2 = getManagerId()
    if (requestingAgentId !== managerId2 && team.chiefOfStaffId !== requestingAgentId) {
      return { error: 'Only MANAGER or the team Chief-of-Staff can delete a team', status: 403 }
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
    // Local task storage removed — task counts come from GitHub Projects (fetched async per-team, not in bulk)
    // Return 0 for taskCount in bulk stats; UI should use per-team GitHub Project queries for accurate counts
    const documents = loadDocuments(team.id)
    stats[team.id] = { taskCount: 0, docCount: documents.length }
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
export async function listTeamTasks(teamId: string, requestingAgentId?: string, filters?: { assignee?: string; status?: string; label?: string; taskType?: string }): Promise<ServiceResult<{ tasks: TaskWithDeps[] }>> {
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

  let resolved: TaskWithDeps[]

  if (!team.githubProject) {
    // No GitHub Project linked — team has no task source after local task storage removal
    return { data: { tasks: [] }, status: 200 }
  }

  // GitHub Project is source of truth — fetch from GitHub
  const ghAuth = ghProject.checkGhAuth()
  if (ghAuth) return { error: ghAuth, status: 503 }
  try {
    const tasks = await ghProject.listTasks(team.githubProject, teamId)
    resolved = ghProject.resolveTaskDeps(tasks)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'GitHub API error', status: 502 }
  }

  // Enrich tasks with agent display names and avatars from the registry.
  // assigneeAgentId may be a UUID, an agent name, or a GitHub login (from assign: label).
  const allAgents = loadAgents()
  for (const task of resolved) {
    if (task.assigneeAgentId && !task.assigneeAvatar) {
      const agentId = task.assigneeAgentId
      const agent = allAgents.find(a =>
        a.id === agentId ||
        a.name === agentId ||
        a.alias === agentId ||
        (a.label && a.label.toLowerCase() === agentId.toLowerCase())
      )
      if (agent) {
        task.assigneeName = agent.label || agent.name || agent.alias || agent.id.slice(0, 8)
        task.assigneeAvatar = agent.avatar
      }
    }
  }

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
export async function getTeamTask(teamId: string, taskId: string, requestingAgentId?: string): Promise<ServiceResult<{ task: any }>> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }

  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  if (!team.githubProject) {
    // No GitHub Project linked — no task source after local task storage removal
    return { error: 'Task not found (team has no GitHub Project linked)', status: 404 }
  }

  // GitHub-backed: find task in the full list (cached 10s)
  const ghAuth = ghProject.checkGhAuth()
  if (ghAuth) return { error: ghAuth, status: 503 }
  try {
    const tasks = await ghProject.listTasks(team.githubProject, teamId)
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { error: 'Task not found', status: 404 }
    return { data: { task }, status: 200 }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'GitHub API error', status: 502 }
  }
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

  if (!team.githubProject) {
    return { error: 'Cannot create task: team has no GitHub Project linked', status: 400 }
  }

  try {
    // Create issue + project item on GitHub (source of truth)
    const ghAuth = ghProject.checkGhAuth()
    if (ghAuth) return { error: ghAuth, status: 503 }
    const task = await ghProject.createTask(team.githubProject, teamId, {
      subject: subject.trim(),
      description,
      status: taskFields.status,
      priority,
      labels: taskFields.labels,
      assigneeLogin: assigneeAgentId === null ? undefined : assigneeAgentId, // For GitHub-backed teams, this is a GitHub login
      taskType: taskFields.taskType,
      blockedBy,
      acceptanceCriteria: taskFields.acceptanceCriteria,
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

  const { subject, description, status, assigneeAgentId, blockedBy, priority } = taskFields

  if (!team.githubProject) {
    return { error: 'Cannot update task: team has no GitHub Project linked', status: 400 }
  }

  // GitHub Project is source of truth — update project item fields
  const ghAuth = ghProject.checkGhAuth()
  if (ghAuth) return { error: ghAuth, status: 503 }

  // Basic blockedBy validation (no cycle check for GitHub — deps are issue-number references)
  if (Array.isArray(blockedBy)) {
    for (const depId of blockedBy) {
      if (typeof depId !== 'string') {
        return { error: 'blockedBy must contain only string task IDs', status: 400 }
      }
    }
  }

  try {
    const task = await ghProject.updateTask(team.githubProject, teamId, taskId, {
      subject,
      description,
      status,
      priority,
      labels: taskFields.labels,
      assigneeLogin: assigneeAgentId !== undefined
        ? (assigneeAgentId || undefined) // null → unassign
        : undefined,
      taskType: taskFields.taskType,
      blockedBy,
      acceptanceCriteria: taskFields.acceptanceCriteria,
      prUrl: taskFields.prUrl,
      previousStatus: taskFields.previousStatus,
    })
    if (!task) {
      return { error: 'Task not found', status: 404 }
    }
    return { data: { task, unblocked: [] }, status: 200 }
  } catch (error) {
    console.error('Failed to update task:', error)
    return { error: error instanceof Error ? error.message : 'GitHub API error', status: 502 }
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

  if (!team.githubProject) {
    return { error: 'Cannot delete task: team has no GitHub Project linked', status: 400 }
  }

  // GitHub Project is source of truth — remove item from project
  const ghAuth = ghProject.checkGhAuth()
  if (ghAuth) return { error: ghAuth, status: 503 }
  let deleted: boolean
  try {
    deleted = await ghProject.deleteTask(team.githubProject, taskId, true)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'GitHub API error', status: 502 }
  }

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
    // Build a Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>> that
    // matches updateDocument's parameter type exactly — no type assertion needed.
    const updates: Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>> = {}
    if (docFields.title !== undefined) updates.title = docFields.title
    if (docFields.content !== undefined) updates.content = docFields.content
    if (docFields.pinned !== undefined) updates.pinned = docFields.pinned
    if (docFields.tags !== undefined) updates.tags = docFields.tags

    const document = await updateDocument(teamId, docId, updates)
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
export async function getKanbanConfig(teamId: string, requestingAgentId?: string): Promise<ServiceResult<{ columns: KanbanColumnConfig[] }>> {
  const team = getTeam(teamId)
  if (!team) {
    return { error: 'Team not found', status: 404 }
  }
  const access = checkTeamAccess({ teamId, requestingAgentId })
  if (!access.allowed) {
    return { error: access.reason || 'Access denied', status: 403 }
  }

  if (team.githubProject) {
    // Columns derived from GitHub Project Status field options
    const ghAuth = ghProject.checkGhAuth()
    if (ghAuth) return { error: ghAuth, status: 503 }
    try {
      const columns = await ghProject.getKanbanColumns(team.githubProject)
      return { data: { columns }, status: 200 }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'GitHub API error', status: 502 }
    }
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
    if (team.githubProject) {
      // Update GitHub Project Status field options directly
      const ghAuth = ghProject.checkGhAuth()
      if (ghAuth) return { error: ghAuth, status: 503 }
      await ghProject.updateKanbanColumns(team.githubProject, columns)
      return { data: { columns }, status: 200 }
    }
    await updateTeam(teamId, { kanbanConfig: columns })
    return { data: { columns }, status: 200 }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to update kanban config', status: 500 }
  }
}
