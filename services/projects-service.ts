/**
 * Projects Service
 *
 * A project is a named piece of work across agents and teams, with its own board. It is stored on the
 * host of its owner agent; every route here answers for the projects THIS host stores. Routes are thin
 * wrappers that call these functions.
 */

import {
  loadProjects, getProject, createProject as createProjectRecord, updateProject as updateProjectRecord,
  deleteProject as deleteProjectRecord, PROJECT_STATUSES,
} from '@/lib/project-registry'
import { loadScopeTasks, projectScope, resolveTaskDeps } from '@/lib/task-registry'
import { getAgent } from '@/lib/agent-registry'
import { getSelfHostId } from '@/lib/hosts-config'
import {
  createInScope, updateInScope, addCommentInScope, deliverComment, type TaskParams, type CommentParams,
} from '@/services/agent-tasks-service'
import { deleteScopeTask } from '@/lib/task-registry'
import { type ServiceResult, missingField, notFound, invalidField, operationFailed } from '@/services/service-errors'
import type { Project, ProjectStatus, ProjectView } from '@/types/project'
import type { Task, TaskComment, TaskWithDeps } from '@/types/task'

const MAX_NAME = 80
const MAX_DESCRIPTION = 2000

function view(p: Project): ProjectView {
  const tasks = loadScopeTasks(projectScope(p.id))
  return {
    ...p,
    hostId: getSelfHostId(),
    counts: {
      open: tasks.filter(t => t.status !== 'completed' && t.status !== 'backlog').length,
      waiting: tasks.filter(t => t.status === 'waiting').length,
      total: tasks.length,
    },
  }
}

export interface ProjectParams {
  name?: unknown
  description?: unknown
  ownerAgentId?: unknown
  status?: unknown
}

function checkFields(params: ProjectParams, creating: boolean): ServiceResult<never> | null {
  if (creating || params.name !== undefined) {
    if (typeof params.name !== 'string' || !params.name.trim()) return missingField('name')
    if (params.name.trim().length > MAX_NAME) return invalidField('name', `name can be at most ${MAX_NAME} characters`)
  }
  if (params.description !== undefined && (typeof params.description !== 'string' || params.description.length > MAX_DESCRIPTION)) {
    return invalidField('description', `description must be text of at most ${MAX_DESCRIPTION} characters`)
  }
  if (params.status !== undefined && !PROJECT_STATUSES.includes(params.status as ProjectStatus)) {
    return invalidField('status', `status must be one of ${PROJECT_STATUSES.join(', ')}`)
  }
  if (params.ownerAgentId !== undefined && params.ownerAgentId !== null) {
    if (typeof params.ownerAgentId !== 'string' || !getAgent(params.ownerAgentId)) {
      return invalidField('ownerAgentId', "The owner must be an agent on this host: a project is stored on its owner's host")
    }
  }
  return null
}

/** Projects stored on this host. With `assignee`, only projects that have cards for that agent, and those cards. */
export type ProjectWithCards = ProjectView & { cards?: TaskWithDeps[] }

/** Projects stored on this host. With `assignee`, only projects that have cards for that agent, and those cards. */
export function listProjects(filter: { assignee?: string } = {}): ServiceResult<{ projects: ProjectWithCards[] }> {
  const out: ProjectWithCards[] = []
  for (const p of loadProjects()) {
    const v = view(p)
    if (!filter.assignee) { out.push(v); continue }
    const cards = resolveTaskDeps(loadScopeTasks(projectScope(p.id))).filter(t => t.assigneeAgentId === filter.assignee)
      .map(t => ({ ...t, scope: 'project' as const, projectName: p.name, hostId: v.hostId }))
    if (cards.length > 0) out.push({ ...v, cards })
  }
  return { data: { projects: out }, status: 200 }
}

export function createProject(params: ProjectParams): ServiceResult<{ project: ProjectView }> {
  const bad = checkFields(params, true)
  if (bad) return bad
  try {
    const p = createProjectRecord({
      name: (params.name as string).trim(),
      description: typeof params.description === 'string' ? params.description.trim() : undefined,
      ownerAgentId: (params.ownerAgentId as string | null | undefined) ?? null,
    })
    return { data: { project: view(p) }, status: 201 }
  } catch (error) {
    return operationFailed('create project', (error as Error).message)
  }
}

export function getProjectById(id: string): ServiceResult<{ project: ProjectView }> {
  const p = getProject(id)
  if (!p) return notFound('Project', id)
  return { data: { project: view(p) }, status: 200 }
}

export function updateProject(id: string, params: ProjectParams): ServiceResult<{ project: ProjectView }> {
  if (!getProject(id)) return notFound('Project', id)
  const bad = checkFields(params, false)
  if (bad) return bad
  try {
    const p = updateProjectRecord(id, {
      name: typeof params.name === 'string' ? params.name.trim() : undefined,
      description: typeof params.description === 'string' ? params.description.trim() : undefined,
      status: params.status as ProjectStatus | undefined,
      ownerAgentId: params.ownerAgentId as string | null | undefined,
    })
    if (!p) return notFound('Project', id)
    return { data: { project: view(p) }, status: 200 }
  } catch (error) {
    return operationFailed('update project', (error as Error).message)
  }
}

export function deleteProject(id: string): ServiceResult<{ success: boolean }> {
  if (!deleteProjectRecord(id)) return notFound('Project', id)
  return { data: { success: true }, status: 200 }
}

// ── Cards of a project ──────────────────────────────────────────────────────

export function listProjectTasks(id: string, filter: { assignee?: string; status?: string } = {}): ServiceResult<{ project: ProjectView; tasks: TaskWithDeps[] }> {
  const p = getProject(id)
  if (!p) return notFound('Project', id)
  const v = view(p)
  let tasks = resolveTaskDeps(loadScopeTasks(projectScope(id))).map(t => ({ ...t, scope: 'project' as const, projectName: p.name, hostId: v.hostId }))
  if (filter.assignee) tasks = tasks.filter(t => t.assigneeAgentId === filter.assignee)
  if (filter.status) tasks = tasks.filter(t => t.status === filter.status)
  return { data: { project: v, tasks }, status: 200 }
}

export function createProjectTask(id: string, params: TaskParams): ServiceResult<{ task: Task }> {
  return createInScope(projectScope(id), params, () => (getProject(id) ? null : notFound('Project', id)))
}

export function updateProjectTask(id: string, taskId: string, params: TaskParams): ServiceResult<{ task: Task; unblocked?: Task[] }> {
  if (!getProject(id)) return notFound('Project', id)
  return updateInScope(projectScope(id), taskId, params)
}

export function deleteProjectTask(id: string, taskId: string): ServiceResult<{ success: boolean }> {
  if (!getProject(id)) return notFound('Project', id)
  if (!deleteScopeTask(projectScope(id), taskId)) return notFound('Task', taskId)
  return { data: { success: true }, status: 200 }
}

export async function addProjectTaskComment(id: string, taskId: string, params: CommentParams): Promise<ServiceResult<{ comment: TaskComment; delivered?: boolean; reason?: string }>> {
  if (!getProject(id)) return notFound('Project', id)
  return addCommentInScope(projectScope(id), taskId, params)
}

export async function retryProjectTaskComment(id: string, taskId: string, commentId: string) {
  if (!getProject(id)) return notFound('Project', id)
  return deliverComment(projectScope(id), taskId, commentId)
}
