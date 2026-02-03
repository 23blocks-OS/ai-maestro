/**
 * Agent Lookup by Name API
 *
 * GET /api/agents/by-name/[name]
 *
 * Looks up an agent by name on this host.
 * Used for mesh-wide uniqueness checks - peer hosts call this endpoint
 * to verify if an agent name exists before allowing registration.
 *
 * This endpoint is part of Phase 2 of the AMP Protocol Fix:
 * - Enables mesh-wide uniqueness checks for agent names
 * - Returns minimal agent info to avoid data leakage
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAgentByName } from '@/lib/agent-registry'
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
 * Check if an agent exists by name on this host
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
): Promise<NextResponse<AgentLookupResponse>> {
  try {
    const { name } = await params
    const decodedName = decodeURIComponent(name).toLowerCase()
    const selfHostId = getSelfHostId()

    // Look up agent by name on this host
    const agent = getAgentByName(decodedName, selfHostId)

    if (!agent) {
      return NextResponse.json({
        exists: false
      })
    }

    // Return minimal info - just enough for uniqueness check
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
