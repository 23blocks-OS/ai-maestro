/**
 * Secret requests at the request level (F033).
 *
 *   POST /api/agents/[id]/secret-requests        an agent (aim-secret request NAME) asks for a credential
 *   GET  /api/agents/[id]/secret-requests        the chat polls the pending requests (names only)
 *   POST /api/agents/[id]/secret-requests/[rid]  the person answers: { value, name? } or { decline: true }
 *
 * The value is the one thing this file must never leak. It arrives in a request body, goes to
 * the vault (lib/secret-vault.mjs, which hands it to the OS keychain on stdin) and is dropped.
 * It is never logged, never put in an error message or a response, never stored in a request
 * record, and never sent to the agent: the agent is only told the NAME was stored.
 * A remote agent's request is forwarded to its host, which owns the vault.
 */
import { getAgent } from '@/lib/agent-registry'
import { isSelf } from '@/lib/hosts-config'
import { isSafeAgentId } from '@/lib/safe-ids'
import { createRequest, listRequests, getRequest, removeRequest } from '@/lib/secret-requests'
import { assertSecretName, hasSecret, setSecret } from '@/lib/secret-vault.mjs'
import { agentNotFound, invalidField, invalidRequest, missingField, serviceError, type ServiceResult } from '@/services/service-errors'

const PROXY_TIMEOUT_MS = 15000
const MAX_VALUE = 64 * 1024

function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}

/** Where the agent lives: undefined when it is on this host, otherwise its host URL. */
function remoteHostOf(agentId: string): { known: boolean; remoteUrl?: string } {
  const agent = getAgent(agentId)
  if (!agent) return { known: false }
  const isLocal = !agent.hostId || isSelf(agent.hostId) || (agent.hostUrl ? isSelf(agent.hostUrl) : false)
  return { known: true, remoteUrl: isLocal ? undefined : agent.hostUrl }
}

/** Forwards to the host that owns the agent. Logs the path only, never a body. */
async function proxy(remoteUrl: string, method: 'GET' | 'POST', path: string, payload?: unknown): Promise<ServiceResult<any>> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)
    const response = await fetch(`${remoteUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
      signal: controller.signal,
    })
    clearTimeout(timer)
    return { data: await response.json(), status: response.status }
  } catch {
    return { data: { error: `Remote host is unreachable (${remoteUrl})` } as any, status: 502 }
  }
}

function checkAgent(agentId: string): ServiceResult<never> | { remoteUrl?: string } {
  if (!isSafeAgentId(agentId)) return agentNotFound(agentId)
  const where = remoteHostOf(agentId)
  if (!where.known) return agentNotFound(agentId)
  return { remoteUrl: where.remoteUrl }
}

function validName(raw: unknown): { name: string } | ServiceResult<never> {
  if (typeof raw !== 'string' || raw === '') return missingField('name')
  try {
    return { name: assertSecretName(raw) }
  } catch {
    return invalidField('name', 'name must be upper case letters, digits and underscores, starting with a letter (for example OPENAI_API_KEY)')
  }
}

/** Tell the agent what happened. The line carries the NAME only. */
async function notifyAgent(agentId: string, requestId: string, text: string, subject: string): Promise<boolean> {
  try {
    const { runWakeChain } = await import('@/lib/wake-chain')
    const agent = getAgent(agentId)
    const wake = await runWakeChain({
      agentId,
      agentName: agent?.name || agentId,
      injectText: `[SECRET] ${text}`,
      injectBody: text,
      senderName: 'AI Maestro',
      subject,
      messageId: `secret-${requestId}`,
      messageType: 'notification',
    })
    return wake.confirmed || wake.notified || wake.deferred
  } catch {
    return false
  }
}

export async function createSecretRequest(agentId: string, rawBody: unknown): Promise<ServiceResult<any>> {
  const where = checkAgent(agentId)
  if ('status' in where) return where
  const body = asObject(rawBody)
  const named = validName(body.name)
  if ('status' in named) return named

  if (where.remoteUrl) {
    return proxy(where.remoteUrl, 'POST', `/api/agents/${agentId}/secret-requests`, { name: named.name, note: body.note })
  }
  if (await hasSecret(named.name)) {
    return { data: { alreadyStored: true, name: named.name }, status: 200 }
  }
  const req = createRequest(agentId, named.name, body.note)
  return { data: { requestId: req.id, name: req.name, alreadyStored: false }, status: 201 }
}

export async function listSecretRequests(agentId: string): Promise<ServiceResult<any>> {
  const where = checkAgent(agentId)
  if ('status' in where) return where
  if (where.remoteUrl) return proxy(where.remoteUrl, 'GET', `/api/agents/${agentId}/secret-requests`)
  return {
    data: { requests: listRequests(agentId).map((r) => ({ id: r.id, name: r.name, note: r.note ?? null, createdAt: r.createdAt })) },
    status: 200,
  }
}

export async function answerSecretRequest(agentId: string, requestId: string, rawBody: unknown): Promise<ServiceResult<any>> {
  const where = checkAgent(agentId)
  if ('status' in where) return where
  if (!/^[A-Za-z0-9-]{8,64}$/.test(requestId)) return invalidField('requestId', 'invalid request id')
  const body = asObject(rawBody)

  if (where.remoteUrl) {
    return proxy(where.remoteUrl, 'POST', `/api/agents/${agentId}/secret-requests/${requestId}`, body)
  }

  const req = getRequest(requestId)
  if (!req || req.agentId !== agentId) return serviceError('not_found', 'No such request (it may have expired).', 404)

  if (body.decline === true) {
    removeRequest(requestId)
    const notified = await notifyAgent(agentId, requestId,
      `The user declined to store ${req.name}. Continue without it, and do not ask again unless you cannot go on.`,
      `Secret declined: ${req.name}`)
    return { data: { declined: true, name: req.name, notified }, status: 200 }
  }

  const named = validName(body.name ?? req.name)
  if ('status' in named) return named
  const value = body.value
  if (typeof value !== 'string' || value.length === 0) return missingField('value')
  if (value.length > MAX_VALUE) return invalidField('value', 'value is too long')

  try {
    await setSecret(named.name, value)
  } catch (e) {
    // The message of a VaultError never contains the value (it names the problem and the way out).
    const message = e instanceof Error ? e.message : 'the vault could not store it'
    return invalidRequest(`Could not store ${named.name}: ${message}`.slice(0, 300))
  }
  removeRequest(requestId)

  const renamed = named.name !== req.name ? ` (the agent asked for ${req.name}; the user chose ${named.name}, so use ${named.name})` : ''
  const notified = await notifyAgent(agentId, requestId,
    `The user stored ${named.name} in the vault${renamed}. Continue your task. Use it with: aim-secret exec --use ${named.name} -- <command>. Never print or ask for its value.`,
    `Secret stored: ${named.name}`)
  return { data: { stored: true, name: named.name, notified }, status: 200 }
}
