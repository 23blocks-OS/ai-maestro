import { NextRequest, NextResponse } from 'next/server'
import { wakeAgent } from '@/services/agents-core-service'
import { getAgent } from '@/lib/agent-registry'
import { isSelf } from '@/lib/hosts-config'
import { toResponse } from '@/app/api/_helpers'

/**
 * POST /api/agents/[id]/wake
 * Wake a hibernated agent. If the agent lives on a remote host,
 * proxy the request server-side to avoid browser CORS issues.
 *
 * Remote detection: checks local registry first, then falls back to
 * the `hostUrl` field passed in the request body (for agents not in
 * the local registry, e.g. discovered via unified endpoint).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Parse optional body
  let startProgram = true
  let sessionIndex = 0
  let program: string | undefined
  let hostUrl: string | undefined
  let projectDirectory: string | undefined
  let allowHostFallback = false
  try {
    const body = await request.json()
    console.log(`[Wake] Received body:`, JSON.stringify(body))
    if (body.startProgram === false) {
      startProgram = false
    }
    if (typeof body.sessionIndex === 'number') {
      sessionIndex = body.sessionIndex
    }
    if (typeof body.program === 'string') {
      program = (body.program as string).toLowerCase()
    }
    if (typeof body.hostUrl === 'string') {
      hostUrl = body.hostUrl
    }
    if (typeof body.projectDirectory === 'string') {
      projectDirectory = body.projectDirectory
    }
    if (body.allowHostFallback === true) {
      allowHostFallback = true
    }
  } catch (e) {
    console.log(`[Wake] No body or invalid JSON, using defaults. Error:`, e)
  }

  // Determine if the agent is remote — check local registry first, then body.hostUrl
  // IMPORTANT: Check both hostId AND hostUrl, because hostId can be stale after a
  // hostname change (e.g. milo-dock.internal → shanes-m3-pro-mbp) while hostUrl
  // still points to this machine's Tailscale IP. Without the hostUrl check,
  // the agent appears "remote" and we'd proxy to ourselves in an infinite loop.
  const agent = getAgent(id)
  const isLocalAgent = !agent?.hostId || isSelf(agent.hostId) || (agent?.hostUrl ? isSelf(agent.hostUrl) : false)
  const remoteHostUrl = !isLocalAgent ? agent?.hostUrl : hostUrl

  if (remoteHostUrl) {
    console.log(`[Wake] Agent ${id} is on remote host (${remoteHostUrl}), proxying...`)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(`${remoteHostUrl}/api/agents/${id}/wake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startProgram, sessionIndex, program, projectDirectory, allowHostFallback }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    } catch (error) {
      console.error(`[Wake] Failed to proxy to remote host ${remoteHostUrl}:`, error)
      return NextResponse.json(
        { error: `Remote host is unreachable (${remoteHostUrl})` },
        { status: 502 }
      )
    }
  }

  const result = await wakeAgent(id, { startProgram, sessionIndex, program, projectDirectory, allowHostFallback })
  return toResponse(result)
}
