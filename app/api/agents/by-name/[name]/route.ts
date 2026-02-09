/**
 * Agent Lookup by Name API
 *
 * GET /api/agents/by-name/[name]
 *
 * Looks up an agent by name on this host using rich resolution:
 *   1. Exact name match
 *   2. UUID match
 *   3. Alias match
 *   4. Session name match
 *   5. Partial match on last segment (e.g. "rag" → "23blocks-api-rag")
 *
 * This is used by mesh peers during checkMeshAgentExists() discovery
 * and must support the same short-name resolution as local delivery.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAgent } from '@/lib/agent-registry'
import { resolveAgentIdentifier } from '@/lib/messageQueue'
import { getSelfHostId } from '@/lib/hosts-config'

interface AgentLookupResponse {
  exists: boolean
  agent?: {
    id: string
    name: string
    hostId: string
    ampRegistered?: boolean
  }
}

/**
 * GET /api/agents/by-name/[name]
 *
 * Check if an agent exists by name on this host (rich resolution)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
): Promise<NextResponse<AgentLookupResponse>> {
  try {
    const { name } = await params
    const decodedName = decodeURIComponent(name)
    const selfHostId = getSelfHostId()

    // Use the same rich resolution as the routing endpoint:
    // exact name → UUID → alias → session name → partial last segment
    const resolved = resolveAgentIdentifier(decodedName)

    if (!resolved?.agentId) {
      return NextResponse.json({
        exists: false
      })
    }

    // Get full agent record for the response
    const agent = getAgent(resolved.agentId)
    if (!agent) {
      return NextResponse.json({
        exists: false
      })
    }

    // Return minimal info
    return NextResponse.json({
      exists: true,
      agent: {
        id: agent.id,
        name: agent.name || agent.alias || '',
        hostId: agent.hostId || selfHostId,
        ampRegistered: agent.ampRegistered
      }
    })
  } catch (error) {
    console.error('[Agent Lookup API] Error:', error)
    return NextResponse.json(
      { exists: false },
      { status: 500 }
    )
  }
}
