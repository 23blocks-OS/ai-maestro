import { NextRequest, NextResponse } from 'next/server'
import { hibernateAgent } from '@/services/agents-core-service'
import { getAgent } from '@/lib/agent-registry'
import { isSelf } from '@/lib/hosts-config'

/**
 * POST /api/agents/[id]/hibernate
 * Hibernate an agent by stopping its session and updating status.
 * If the agent lives on a remote host, proxy the request server-side.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Parse optional body
  let sessionIndex = 0
  let hostUrl: string | undefined
  try {
    const body = await request.json()
    if (typeof body.sessionIndex === 'number') {
      sessionIndex = body.sessionIndex
    }
    if (typeof body.hostUrl === 'string') {
      hostUrl = body.hostUrl
    }
  } catch {
    // No body or invalid JSON, use defaults
  }

  // Determine if the agent is remote — check local registry first, then body.hostUrl
  const agent = getAgent(id)
  const remoteHostId = agent?.hostId && !isSelf(agent.hostId) ? agent.hostId : null
  const remoteHostUrl = remoteHostId ? agent?.hostUrl : hostUrl

  if (remoteHostUrl) {
    console.log(`[Hibernate] Agent ${id} is on remote host (${remoteHostUrl}), proxying...`)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(`${remoteHostUrl}/api/agents/${id}/hibernate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIndex }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    } catch (error) {
      console.error(`[Hibernate] Failed to proxy to remote host ${remoteHostUrl}:`, error)
      return NextResponse.json(
        { error: `Remote host is unreachable (${remoteHostUrl})` },
        { status: 502 }
      )
    }
  }

  const result = await hibernateAgent(id, { sessionIndex })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
