/**
 * Wake / hibernate at the request level.
 *
 * POST /api/agents/[id]/wake and /hibernate take a loosely typed body, lowercase
 * the program, decide whether the agent lives on another host and proxy there.
 * That logic used to sit inline in the Next.js routes, so the headless router
 * (which called wakeAgent with the raw body and always acted locally) drifted
 * from it (B012). Both now call these two functions.
 */

import { wakeAgent, hibernateAgent, type WakeAgentParams } from '@/services/agents-core-service'
import { getAgent } from '@/lib/agent-registry'
import { isSelf } from '@/lib/hosts-config'
import type { ServiceResult } from '@/services/service-errors'

const PROXY_TIMEOUT_MS = 15000

function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

async function proxyPost(remoteHostUrl: string, agentId: string, action: 'wake' | 'hibernate', payload: unknown, label: string): Promise<ServiceResult<any>> {
  console.log(`[${label}] Agent ${agentId} is on remote host (${remoteHostUrl}), proxying...`)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)
    const response = await fetch(`${remoteHostUrl}/api/agents/${agentId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    const data = await response.json()
    return { data, status: response.status }
  } catch (error) {
    console.error(`[${label}] Failed to proxy to remote host ${remoteHostUrl}:`, error)
    return { data: { error: `Remote host is unreachable (${remoteHostUrl})` } as any, status: 502 }
  }
}

/**
 * Wake an agent from a raw request body (anything JSON-parsed, or {} when the
 * body was missing or invalid). Remote agents are proxied to their host.
 */
export async function wakeAgentRequest(agentId: string, rawBody: unknown): Promise<ServiceResult<any>> {
  const body = asObject(rawBody)
  const startProgram = body.startProgram === false ? false : true
  const sessionIndex = typeof body.sessionIndex === 'number' ? body.sessionIndex : 0
  const program = typeof body.program === 'string' ? body.program.toLowerCase() : undefined
  const hostUrl = typeof body.hostUrl === 'string' ? body.hostUrl : undefined
  const projectDirectory = typeof body.projectDirectory === 'string' ? body.projectDirectory : undefined
  const permissionMode = typeof body.permissionMode === 'string' ? body.permissionMode : undefined
  const allowHostFallback = body.allowHostFallback === true

  // Check both hostId AND hostUrl: hostId can be stale after a hostname change
  // while hostUrl still points at this machine; without the hostUrl check the
  // agent looks remote and we would proxy to ourselves in a loop.
  const agent = getAgent(agentId)
  const isLocalAgent = !agent?.hostId || isSelf(agent.hostId) || (agent?.hostUrl ? isSelf(agent.hostUrl) : false)
  const remoteHostUrl = !isLocalAgent ? agent?.hostUrl : hostUrl

  if (remoteHostUrl) {
    return proxyPost(remoteHostUrl, agentId, 'wake',
      { startProgram, sessionIndex, program, projectDirectory, permissionMode, allowHostFallback }, 'Wake')
  }

  return wakeAgent(agentId, {
    startProgram, sessionIndex, program, projectDirectory,
    permissionMode: permissionMode as WakeAgentParams['permissionMode'],
    allowHostFallback,
  })
}

/** Hibernate an agent from a raw request body; remote agents are proxied. */
export async function hibernateAgentRequest(agentId: string, rawBody: unknown): Promise<ServiceResult<any>> {
  const body = asObject(rawBody)
  const sessionIndex = typeof body.sessionIndex === 'number' ? body.sessionIndex : 0
  const hostUrl = typeof body.hostUrl === 'string' ? body.hostUrl : undefined

  const agent = getAgent(agentId)
  const remoteHostId = agent?.hostId && !isSelf(agent.hostId) ? agent.hostId : null
  const remoteHostUrl = remoteHostId ? agent?.hostUrl : hostUrl

  if (remoteHostUrl) {
    return proxyPost(remoteHostUrl, agentId, 'hibernate', { sessionIndex }, 'Hibernate')
  }

  return hibernateAgent(agentId, { sessionIndex })
}
