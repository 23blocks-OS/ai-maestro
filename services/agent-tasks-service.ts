/**
 * Agent Tasks Service
 *
 * The board of one agent: its own cards (agent scope), the cards of its teams assigned to it
 * (team scope), and comments from the operator that are handed to the agent's session.
 * Routes are thin wrappers that call these functions.
 *
 * An operator comment is a convention on a trusted network, not proof of who wrote it:
 * AI Maestro has no login, so the server trusts the `author.kind` it is given. Anything that
 * is not exactly "operator" is treated as an agent comment, which is stored but never injected.
 */

import {
  agentScope, teamScope, loadScopeTasks, createScopeTask, getScopeTask, updateScopeTask, deleteScopeTask,
  wouldCreateScopeCycle, addScopeComment, markCommentDelivered, resolveTaskDeps, isSafeScopeId, projectScope,
} from '@/lib/task-registry'
import { getProject, loadProjects } from '@/lib/project-registry'
import { getHosts, getSelfHostId, isSelf } from '@/lib/hosts-config'
import { getAgent, loadAgents } from '@/lib/agent-registry'
import { loadTeams, getTeam } from '@/lib/team-registry'
import { injectMeetingPrompt } from '@/services/agents-chat-service'
import {
  type ServiceResult, missingField, notFound, invalidField, operationFailed, invalidRequest,
  circularDependency, selfReference,
} from '@/services/service-errors'
import { quadrantOf, type Quadrant, type Task, type TaskComment, type TaskScope, type TaskStatus, type TaskWithDeps, type WaitingOn } from '@/types/task'

const STATUSES: TaskStatus[] = ['backlog', 'pending', 'in_progress', 'review', 'waiting', 'completed']
const WAITING_FIXED = ['juan', 'outside', 'hold']
const MAX_TEXT = 4000

export interface TaskParams {
  subject?: string
  description?: string
  status?: string
  assigneeAgentId?: string | null
  blockedBy?: string[]
  priority?: number
  waitingOn?: string
  waitingNote?: string
  /** true, false, or null to clear (not placed) */
  urgent?: boolean | null
  important?: boolean | null
}

/** urgent and important are true, false, or null (= not placed); anything else is a mistake, not "false" */
function checkPlacement(params: TaskParams): ServiceResult<never> | null {
  for (const key of ['urgent', 'important'] as const) {
    const v = params[key]
    if (v !== undefined && v !== null && typeof v !== 'boolean') return invalidField(key, `${key} must be true, false or null`)
  }
  return null
}

/**
 * Who a card can be assigned to. On an agent's own board and on a team's board that is an agent this host knows.
 * On a project board it is any agent on any host (the project is stored on its owner's host, its cards are
 * for whoever does the work), so only the form of the id or name is checked.
 */
function assigneeOk(scope: TaskScope, id: string): boolean {
  if (scope.kind === 'project') return /^[A-Za-z0-9][A-Za-z0-9._@-]{0,99}$/.test(id)
  return !!getAgent(id)
}

/** An agent a card can wait on: an id or a name, any host (the mesh knows agents this host does not). */
const WAITING_AGENT = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,99}$/

/**
 * A card waiting must say what on: juan, outside, hold, or an agent (id or name). The agent is
 * NOT looked up: this host's registry knows only its own agents, and most waits are on an agent
 * on another host. It is shown as given; the dashboard resolves ids to names when it can.
 */
function checkWaiting(status: string | undefined, waitingOn: string | undefined, existing?: Task): ServiceResult<never> | null {
  const effective = status ?? existing?.status
  if (effective !== 'waiting') return null
  const on = waitingOn ?? existing?.waitingOn
  if (!on) return invalidField('waitingOn', 'A waiting card needs waitingOn: juan, outside, hold, or an agent id or name')
  if (!WAITING_FIXED.includes(on) && !WAITING_AGENT.test(on)) return invalidField('waitingOn', 'waitingOn must be juan, outside, hold, or an agent id or name (letters, digits, . _ @ -)')
  return null
}

function clean(text: string): string {
  // Keep newlines and tabs, drop other control characters
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAX_TEXT)
}

function resolved(tasks: Task[]): TaskWithDeps[] {
  return resolveTaskDeps(tasks)
}

// ── Board (agent + team cards) ──────────────────────────────────────────────

export interface BoardCard extends TaskWithDeps {
  scope: 'agent' | 'team'
  teamName?: string
}

/**
 * Everything on one agent's board on this host: its own cards, and cards on the boards of the
 * teams it belongs to that are assigned to it. Project cards live on the project's host and are
 * fetched by the client (0.86.0).
 */
export function getAgentBoard(agentId: string): ServiceResult<{ cards: BoardCard[] }> {
  const agent = getAgent(agentId)
  if (!agent) return notFound('Agent', agentId)

  const cards: BoardCard[] = resolved(loadScopeTasks(agentScope(agentId))).map(t => ({ ...t, scope: 'agent' as const }))
  for (const team of loadTeams()) {
    if (!team.agentIds?.includes(agentId)) continue
    const all = resolved(loadScopeTasks(teamScope(team.id)))
    for (const t of all) {
      if (t.assigneeAgentId === agentId) cards.push({ ...t, scope: 'team', teamName: team.name })
    }
  }
  return { data: { cards }, status: 200 }
}

const QUADRANT_FILTERS = ['q1', 'q2', 'q3', 'q4', 'unplaced']

function byQuadrant<T extends { quadrant?: Quadrant | null }>(tasks: T[], quadrant?: string): T[] {
  if (!quadrant) return tasks
  return tasks.filter(t => (quadrant === 'unplaced' ? !t.quadrant : t.quadrant === quadrant))
}

export function listAgentTasks(agentId: string, filter: { status?: string; waitingOn?: string; quadrant?: string } = {}): ServiceResult<{ tasks: TaskWithDeps[] }> {
  const agent = getAgent(agentId)
  if (!agent) return notFound('Agent', agentId)
  if (filter.quadrant && !QUADRANT_FILTERS.includes(filter.quadrant)) return invalidField('quadrant', `quadrant must be one of ${QUADRANT_FILTERS.join(', ')}`)
  let tasks = resolved(loadScopeTasks(agentScope(agentId)))
  if (filter.status) tasks = tasks.filter(t => t.status === filter.status)
  if (filter.waitingOn) tasks = tasks.filter(t => t.status === 'waiting' && t.waitingOn === filter.waitingOn)
  tasks = byQuadrant(tasks, filter.quadrant)
  return { data: { tasks }, status: 200 }
}

// ── Host-wide read: every open card on this host ────────────────────────────

export interface OpenCard extends TaskWithDeps {
  /** The agent the card is for: its owner, or the assignee of a team card */
  agentId: string
  agentName: string
}

/**
 * Open (not completed) cards across every agent and team on this host: the one read the mesh-wide
 * Matrix and the "Waiting on Juan" filter fan out over. Each host answers for what it holds.
 */
export function getOpenTasks(filter: { quadrant?: string; waitingOn?: string; agent?: string } = {}): ServiceResult<{ cards: OpenCard[] }> {
  if (filter.quadrant && !QUADRANT_FILTERS.includes(filter.quadrant)) return invalidField('quadrant', `quadrant must be one of ${QUADRANT_FILTERS.join(', ')}`)
  const agents = loadAgents()
  const nameOf = (id: string) => {
    const a = agents.find(x => x.id === id)
    return a ? (a.label || a.name || a.alias || id.slice(0, 8)) : id.slice(0, 8)
  }
  const cards: OpenCard[] = []
  for (const a of agents) {
    for (const t of resolved(loadScopeTasks(agentScope(a.id)))) {
      if (t.status !== 'completed') cards.push({ ...t, scope: 'agent', agentId: t.assigneeAgentId || a.id, agentName: nameOf(t.assigneeAgentId || a.id) })
    }
  }
  for (const team of loadTeams()) {
    for (const t of resolved(loadScopeTasks(teamScope(team.id)))) {
      if (t.status !== 'completed' && t.assigneeAgentId) {
        cards.push({ ...t, scope: 'team', teamName: team.name, agentId: t.assigneeAgentId, agentName: nameOf(t.assigneeAgentId) })
      }
    }
  }
  for (const project of loadProjects()) {
    for (const t of resolved(loadScopeTasks(projectScope(project.id)))) {
      if (t.status !== 'completed' && t.assigneeAgentId) {
        cards.push({ ...t, scope: 'project', projectName: project.name, hostId: getSelfHostId(), agentId: t.assigneeAgentId, agentName: nameOf(t.assigneeAgentId) })
      }
    }
  }
  let out = byQuadrant(cards, filter.quadrant)
  if (filter.waitingOn) out = out.filter(c => c.status === 'waiting' && c.waitingOn === filter.waitingOn)
  if (filter.agent) out = out.filter(c => c.agentId === filter.agent || c.agentName === filter.agent)
  return { data: { cards: out }, status: 200 }
}

const OWN_BOARD = "A card on an agent's own board stays that agent's; use a team or a project to share work"

export function createAgentTask(agentId: string, params: TaskParams): ServiceResult<{ task: Task }> {
  if (params.assigneeAgentId && params.assigneeAgentId !== agentId) return invalidField('assigneeAgentId', OWN_BOARD)
  return createInScope(agentScope(agentId), params, () => (getAgent(agentId) ? null : notFound('Agent', agentId)))
}

export function createInScope(scope: TaskScope, params: TaskParams, guard?: () => ServiceResult<never> | null): ServiceResult<{ task: Task }> {
  const g = guard?.()
  if (g) return g
  if (!params.subject || typeof params.subject !== 'string' || !params.subject.trim()) return missingField('subject')
  if (params.blockedBy !== undefined && (!Array.isArray(params.blockedBy) || params.blockedBy.some(b => typeof b !== 'string'))) {
    return invalidField('blockedBy', 'blockedBy must be an array of task ID strings')
  }
  if (params.assigneeAgentId && !assigneeOk(scope, params.assigneeAgentId)) return invalidField('assigneeAgentId', scope.kind === 'project' ? 'assigneeAgentId must be an agent id or name' : 'Unknown agent')
  if (params.status && !STATUSES.includes(params.status as TaskStatus)) return invalidField('status', `status must be one of ${STATUSES.join(', ')}`)
  const w = checkWaiting(params.status, params.waitingOn)
  if (w) return w
  const pl = checkPlacement(params)
  if (pl) return pl
  try {
    const task = createScopeTask(scope, {
      subject: params.subject.trim(),
      description: params.description,
      assigneeAgentId: params.assigneeAgentId,
      blockedBy: params.blockedBy,
      priority: params.priority,
    })
    const wantsStatus = !!params.status && params.status !== 'pending'
    const wantsPlace = params.urgent !== undefined || params.important !== undefined
    if (wantsStatus || wantsPlace) {
      const r = updateScopeTask(scope, task.id, {
        ...(wantsStatus && { status: params.status as TaskStatus, waitingOn: params.waitingOn as WaitingOn | undefined, waitingNote: params.waitingNote }),
        urgent: params.urgent, important: params.important,
      })
      return { data: { task: r.task || task }, status: 201 }
    }
    return { data: { task }, status: 201 }
  } catch (error) {
    return operationFailed('create task', (error as Error).message)
  }
}

export function updateAgentTask(agentId: string, taskId: string, params: TaskParams): ServiceResult<{ task: Task; unblocked?: Task[] }> {
  if (!getAgent(agentId)) return notFound('Agent', agentId)
  if (params.assigneeAgentId && params.assigneeAgentId !== agentId) return invalidField('assigneeAgentId', OWN_BOARD)
  return updateInScope(agentScope(agentId), taskId, params)
}

export function updateInScope(scope: TaskScope, taskId: string, params: TaskParams): ServiceResult<{ task: Task; unblocked?: Task[] }> {
  if (!isSafeScopeId(scope.id)) return invalidField('id', 'Invalid id')
  const existing = getScopeTask(scope, taskId)
  if (!existing) return notFound('Task', taskId)
  if (params.status !== undefined && !STATUSES.includes(params.status as TaskStatus)) return invalidField('status', `status must be one of ${STATUSES.join(', ')}`)
  if (params.assigneeAgentId && !assigneeOk(scope, params.assigneeAgentId)) return invalidField('assigneeAgentId', scope.kind === 'project' ? 'assigneeAgentId must be an agent id or name' : 'Unknown agent')
  if (params.blockedBy !== undefined) {
    if (!Array.isArray(params.blockedBy) || params.blockedBy.some(b => typeof b !== 'string')) return invalidField('blockedBy', 'blockedBy must contain only string task IDs')
    for (const dep of params.blockedBy) {
      if (dep === taskId) return selfReference('A task cannot depend on itself')
      if (wouldCreateScopeCycle(scope, taskId, dep)) return circularDependency(`Adding dependency on task ${dep} would create a circular reference`)
    }
  }
  const w = checkWaiting(params.status, params.waitingOn, existing)
  if (w) return w
  const pl = checkPlacement(params)
  if (pl) return pl
  try {
    const result = updateScopeTask(scope, taskId, {
      subject: params.subject,
      description: params.description,
      status: params.status as TaskStatus | undefined,
      assigneeAgentId: params.assigneeAgentId,
      blockedBy: params.blockedBy,
      priority: params.priority,
      waitingOn: params.waitingOn as WaitingOn | undefined,
      waitingNote: params.waitingNote,
      urgent: params.urgent,
      important: params.important,
    })
    if (!result.task) return notFound('Task', taskId)
    return { data: { task: result.task, unblocked: result.unblocked }, status: 200 }
  } catch (error) {
    return operationFailed('update task', (error as Error).message)
  }
}

export function deleteAgentTask(agentId: string, taskId: string): ServiceResult<{ success: boolean }> {
  if (!getAgent(agentId)) return notFound('Agent', agentId)
  if (!deleteScopeTask(agentScope(agentId), taskId)) return notFound('Task', taskId)
  return { data: { success: true }, status: 200 }
}

// ── Comments and delivery ───────────────────────────────────────────────────

export interface CommentParams {
  author?: { kind?: string; id?: string }
  text?: string
  deliver?: boolean
}

function envelope(task: Task, comment: TaskComment, authorLabel: string, where?: string): string {
  const when = new Date(comment.createdAt).toISOString().replace('T', ' ').slice(0, 16)
  return `[TASK ${task.id.slice(0, 8)}] ${clean(task.subject).replace(/\s+/g, ' ').slice(0, 120)} - instruction from ${authorLabel} (AI Maestro board${where ? `, ${where}` : ''}, ${when} UTC): ${comment.text}`
}

/**
 * Hand an instruction to an agent that lives on ANOTHER host. A project card can be assigned to any agent
 * on any host, but the comment is written on the project's host, which only knows its own agents: ask each
 * peer host whose agent it is, and stop at the first that takes it. Nothing is invented: if no host answers
 * for the agent the comment stays "not sent" and can be retried.
 */
export async function forwardInstruction(
  assignee: string, text: string, fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; reason?: string }> {
  const peers = getHosts().filter(h => !isSelf(h.id) && h.enabled !== false && h.url)
  let reason = 'No host I can reach knows this agent'
  for (const host of peers) {
    try {
      const res = await fetchImpl(`${host.url.replace(/\/$/, '')}/api/agents/${encodeURIComponent(assignee)}/task-instruction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(8000),
      })
      if (res.status === 404) continue // not this host's agent
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.delivered) return { ok: true }
      reason = `${host.name || host.id}: ${data?.reason || data?.message || `HTTP ${res.status}`}`
    } catch (error) {
      reason = `${host.name || host.id} did not answer (${error instanceof Error ? error.message : 'error'})`
    }
  }
  return { ok: false, reason }
}

/** The assignee's side of a forwarded instruction: type it into the agent's session on this host. */
export async function receiveInstruction(agentId: string, body: { text?: unknown }): Promise<ServiceResult<{ delivered: boolean; reason?: string }>> {
  // A card may name its assignee ("pas-lola") instead of holding the id; this host knows it by either
  const agent = getAgent(agentId)
    || loadAgents().find(a => !a.deletedAt && a.name?.toLowerCase() === agentId.toLowerCase())
  if (!agent) return notFound('Agent', agentId)
  if (typeof body.text !== 'string' || !body.text.trim()) return missingField('text')
  const result = await injectMeetingPrompt({ agentId: agent.id, injection: clean(body.text) })
  if (result.status >= 200 && result.status < 300) return { data: { delivered: true }, status: 200 }
  const reason = (result.data as { message?: string; error?: string } | undefined)?.message || (result.data as { error?: string } | undefined)?.error || 'The agent could not take it'
  return { data: { delivered: false, reason }, status: 200 }
}

/**
 * Hand an operator comment to the card's assignee. Never throws; the comment stays stored
 * with deliveredAt null when the session cannot take it, and can be sent again.
 */
export async function deliverComment(scope: TaskScope, taskId: string, commentId: string): Promise<ServiceResult<{ delivered: boolean; reason?: string }>> {
  const task = getScopeTask(scope, taskId)
  const comment = task?.comments?.find(c => c.id === commentId)
  if (!task || !comment) return notFound('Comment', commentId)
  if (comment.author.kind !== 'operator') return invalidRequest('Only operator comments are sent to the agent')
  if (!task.assigneeAgentId) return { data: { delivered: false, reason: 'No one is assigned to this card yet' }, status: 200 }
  const where = scope.kind === 'project' ? `project ${clean(getProject(scope.id)?.name || scope.id).slice(0, 60)}` : undefined
  const text = envelope(task, comment, 'the operator', where)
  // A project card may be assigned to an agent on another host: this host then hands the text to that host
  if (scope.kind === 'project' && !getAgent(task.assigneeAgentId)) {
    const fwd = await forwardInstruction(task.assigneeAgentId, text)
    if (fwd.ok) {
      markCommentDelivered(scope, taskId, commentId)
      return { data: { delivered: true }, status: 200 }
    }
    return { data: { delivered: false, reason: fwd.reason }, status: 200 }
  }
  const result = await injectMeetingPrompt({ agentId: task.assigneeAgentId, injection: text })
  if (result.status >= 200 && result.status < 300) {
    markCommentDelivered(scope, taskId, commentId)
    return { data: { delivered: true }, status: 200 }
  }
  const reason = (result.data as { message?: string; error?: string } | undefined)?.message || (result.data as { error?: string } | undefined)?.error || 'The agent could not take it'
  return { data: { delivered: false, reason }, status: 200 }
}

export async function addCommentInScope(
  scope: TaskScope,
  taskId: string,
  params: CommentParams
): Promise<ServiceResult<{ comment: TaskComment; delivered?: boolean; reason?: string }>> {
  if (!isSafeScopeId(scope.id)) return invalidField('id', 'Invalid id')
  if (typeof params.text !== 'string' || !params.text.trim()) return missingField('text')
  if (!getScopeTask(scope, taskId)) return notFound('Task', taskId)
  // Only the exact word "operator" counts; a missing or odd value is an agent comment and is never injected
  const kind: 'operator' | 'agent' = params.author?.kind === 'operator' ? 'operator' : 'agent'
  const authorId = typeof params.author?.id === 'string' ? params.author.id.slice(0, 80) : undefined
  const comment = addScopeComment(scope, taskId, { author: { kind, ...(authorId && { id: authorId }) }, text: clean(params.text).trim() })
  if (!comment) return notFound('Task', taskId)
  if (kind === 'operator' && params.deliver !== false) {
    const r = await deliverComment(scope, taskId, comment.id)
    const d = r.data as { delivered: boolean; reason?: string }
    return { data: { comment: { ...comment, deliveredAt: d.delivered ? new Date().toISOString() : null }, delivered: d.delivered, reason: d.reason }, status: 201 }
  }
  return { data: { comment }, status: 201 }
}

export async function addAgentTaskComment(agentId: string, taskId: string, params: CommentParams) {
  if (!getAgent(agentId)) return notFound('Agent', agentId)
  return addCommentInScope(agentScope(agentId), taskId, params)
}

export async function addTeamTaskComment(teamId: string, taskId: string, params: CommentParams) {
  if (!getTeam(teamId)) return notFound('Team', teamId)
  return addCommentInScope(teamScope(teamId), taskId, params)
}

/** Send an operator comment again (the Retry button). */
export async function retryAgentTaskComment(agentId: string, taskId: string, commentId: string) {
  if (!getAgent(agentId)) return notFound('Agent', agentId)
  return deliverComment(agentScope(agentId), taskId, commentId)
}

export async function retryTeamTaskComment(teamId: string, taskId: string, commentId: string) {
  if (!getTeam(teamId)) return notFound('Team', teamId)
  return deliverComment(teamScope(teamId), taskId, commentId)
}

// ── Summary for the agent list ──────────────────────────────────────────────

export interface TaskCounts { open: number; waiting: number; waitingOnJuan: number }

/** Open cards per agent on this host (own cards + team cards assigned to it): one call for the whole list. */
export function getTaskSummary(): ServiceResult<{ agents: Record<string, TaskCounts> }> {
  const out: Record<string, TaskCounts> = {}
  const add = (agentId: string | null | undefined, t: Task) => {
    if (!agentId || t.status === 'completed' || t.status === 'backlog') return
    const c = out[agentId] || (out[agentId] = { open: 0, waiting: 0, waitingOnJuan: 0 })
    c.open += 1
    if (t.status === 'waiting') {
      c.waiting += 1
      if (t.waitingOn === 'juan') c.waitingOnJuan += 1
    }
  }
  for (const a of loadAgents()) {
    for (const t of loadScopeTasks(agentScope(a.id))) add(t.assigneeAgentId || a.id, t)
  }
  for (const team of loadTeams()) {
    for (const t of loadScopeTasks(teamScope(team.id))) add(t.assigneeAgentId, t)
  }
  // Project cards held on this host count for their assignee, wherever that agent lives; the browser adds the hosts up
  for (const project of loadProjects()) {
    for (const t of loadScopeTasks(projectScope(project.id))) add(t.assigneeAgentId, t)
  }
  return { data: { agents: out }, status: 200 }
}
