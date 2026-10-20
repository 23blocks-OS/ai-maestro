/**
 * SQL write requests at the request level (F037).
 *
 *   GET  /api/agents/[id]/sql-write-requests        the chat polls this agent's pending write requests
 *   POST /api/agents/[id]/sql-write-requests/[rid]  the person answers: { action: 'approve', environment } or { action: 'reject' }
 *
 * The agentic-sql write wrapper (safe-psql-write) proposes a change and stores a request file
 * (lib/sql-write-requests.ts). This service shows it and makes the same state change the wrapper's
 * approve and reject make. It never runs the wrapper and never touches the database; the agent then
 * runs `safe-psql-write apply`, which repeats every check.
 *
 * Answering is accepted only from a real browser page of this server (Sec-Fetch-Site: same-origin, or an
 * Origin whose host is the Host), and approving needs the environment name typed. That stops an agent
 * approving by accident or with a plain curl. It does NOT stop an agent that forges headers or edits the
 * request file: AI Maestro has no app-level authentication by design, and the agent and the person share
 * one OS user. The database login's own limits are the backstop.
 */
import os from 'os'
import { getAgent } from '@/lib/agent-registry'
import { findPeerHostUrl } from '@/lib/owning-host'
import { isSelf } from '@/lib/hosts-config'
import { isSafeAgentId } from '@/lib/safe-ids'
import {
  REQUEST_ID_RE, finishRequest, fingerprintHolds, listRequests, loadRequest, markApproved, toView, type SqlWriteRequest,
} from '@/lib/sql-write-requests'
import { agentNotFound, forbidden, invalidField, notFound, serviceError, type ServiceResult } from '@/services/service-errors'

const PROXY_TIMEOUT_MS = 15000

/** The headers that tell a page of this server from a script. */
export interface AnswerHeaders {
  secFetchSite?: string | null
  origin?: string | null
  host?: string | null
}

export function isSameOriginBrowser(h: AnswerHeaders): boolean {
  if (h.secFetchSite) return h.secFetchSite === 'same-origin'
  if (!h.origin || !h.host) return false
  try {
    return new URL(h.origin).host === h.host
  } catch {
    return false
  }
}

function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}

async function checkAgent(agentId: string): Promise<ServiceResult<never> | { agent: any; remoteUrl?: string }> {
  if (!isSafeAgentId(agentId)) return agentNotFound(agentId)
  const agent = getAgent(agentId)
  if (!agent) {
    // An agent this host does not know may live on a peer, which owns its requests
    const peer = await findPeerHostUrl(agentId)
    return peer ? { agent: null, remoteUrl: peer } : agentNotFound(agentId)
  }
  const isLocal = !agent.hostId || isSelf(agent.hostId) || (agent.hostUrl ? isSelf(agent.hostUrl) : false)
  return { agent, remoteUrl: isLocal ? undefined : agent.hostUrl }
}

/** Forwards to the host that owns the agent (its requests live there). The page was already checked here. */
async function proxy(remoteUrl: string, method: 'GET' | 'POST', path: string, payload?: unknown): Promise<ServiceResult<any>> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)
    const response = await fetch(`${remoteUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: new URL(remoteUrl).origin },
      body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
      signal: controller.signal,
    })
    clearTimeout(timer)
    return { data: await response.json(), status: response.status }
  } catch {
    return { data: { error: `Remote host is unreachable (${remoteUrl})` } as any, status: 502 }
  }
}

/** The wrapper stamps requests with AIM_AGENT_NAME, else AIM_AGENT_ID, else $USER. */
function belongsTo(r: SqlWriteRequest, agent: any): boolean {
  return r.agent === agent.name || r.agent === agent.id
}

export async function listSqlWriteRequests(agentId: string): Promise<ServiceResult<any>> {
  const where = await checkAgent(agentId)
  if ('status' in where) return where
  if (where.remoteUrl) return proxy(where.remoteUrl, 'GET', `/api/agents/${agentId}/sql-write-requests`)
  const now = Date.now() / 1000
  const requests = listRequests().filter((r) => r.status === 'pending' && r.expires > now && belongsTo(r, where.agent)).map(toView)
  return { data: { requests }, status: 200 }
}

/** Tell the agent what happened. The line carries the request id only, never a value. */
async function notifyAgent(agent: any, requestId: string, text: string, subject: string): Promise<boolean> {
  try {
    const { runWakeChain } = await import('@/lib/wake-chain')
    const wake = await runWakeChain({
      agentId: agent.id,
      agentName: agent.name || agent.id,
      injectText: `[SQL WRITE] ${text}`,
      injectBody: text,
      senderName: 'AI Maestro',
      subject,
      messageId: `sqlwrite-${requestId}`,
      messageType: 'notification',
    })
    return wake.confirmed || wake.notified || wake.deferred
  } catch {
    return false
  }
}

export async function answerSqlWriteRequest(agentId: string, requestId: string, rawBody: unknown, headers: AnswerHeaders): Promise<ServiceResult<any>> {
  const where = await checkAgent(agentId)
  if ('status' in where) return where
  if (!isSameOriginBrowser(headers)) {
    return forbidden('Approve or reject this in the AI Maestro chat, from the browser page. A script, curl or an agent cannot answer for you.')
  }
  if (!REQUEST_ID_RE.test(requestId)) return invalidField('requestId', 'invalid request id')
  const body = asObject(rawBody)
  if (body.action !== 'approve' && body.action !== 'reject') return invalidField('action', "action must be 'approve' or 'reject'")

  if (where.remoteUrl) return proxy(where.remoteUrl, 'POST', `/api/agents/${agentId}/sql-write-requests/${requestId}`, body)

  const req = loadRequest(requestId)
  if (!req || !belongsTo(req, where.agent)) return notFound('Request', requestId)
  if (req.status !== 'pending') return serviceError('invalid_state', `This request is ${String(req.status).slice(0, 20)}, not pending.`, 409)

  if (body.action === 'reject') {
    finishRequest(req, 'rejected', { by: os.userInfo().username })
    const notified = await notifyAgent(where.agent, requestId,
      `The user rejected SQL write request ${requestId}. Do not retry it or a wider version of it; ask the user what they want instead.`,
      `SQL write rejected: ${requestId}`)
    return { data: { rejected: true, id: requestId, notified }, status: 200 }
  }

  if (Date.now() / 1000 > req.expires) {
    finishRequest(req, 'expired')
    return serviceError('gone', 'This request expired. Ask the agent to propose it again.', 410)
  }
  if (!fingerprintHolds(req)) {
    return serviceError('invalid_state', 'The request was changed after it was proposed, so it cannot be approved. Ask the agent to propose it again.', 409)
  }
  const typed = typeof body.environment === 'string' ? body.environment.trim() : ''
  if (typed !== req.environment) {
    return invalidField('environment', `Type the environment name exactly (${req.environment.slice(0, 40)}) to approve.`)
  }
  markApproved(req, process.env.USER || os.userInfo().username || 'unknown')
  const notified = await notifyAgent(where.agent, requestId,
    `The user approved SQL write request ${requestId}. Run: safe-psql-write apply ${requestId}`,
    `SQL write approved: ${requestId}`)
  return { data: { approved: true, id: requestId, notified }, status: 200 }
}
