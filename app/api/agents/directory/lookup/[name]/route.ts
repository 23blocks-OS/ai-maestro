/**
 * Agent Directory Lookup API
 *
 * GET /api/agents/directory/lookup/[name]
 *   Looks up an agent by name in the directory
 *   Returns the host location and AMP address if found
 *
 * This endpoint is part of Phase 3 of the AMP Protocol Fix:
 * - Fast agent name -> host location lookups
 * - Used by message routing to find agent destinations
 */

import { NextRequest, NextResponse } from 'next/server'
import { lookupAgent, rebuildLocalDirectory } from '@/lib/agent-directory'

interface AgentLookupResponse {
  found: boolean
  agent?: {
    name: string
    hostId: string
    hostUrl?: string
    ampAddress?: string
    ampRegistered: boolean
    source: 'local' | 'remote'
    lastSeen: string
  }
}

/**
 * GET /api/agents/directory/lookup/[name]
 *
 * Look up an agent by name in the directory
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
): Promise<NextResponse<AgentLookupResponse>> {
  try {
    const { name } = await params
    const decodedName = decodeURIComponent(name).toLowerCase()

    // Ensure directory is up to date
    rebuildLocalDirectory()

    // Look up agent
    const entry = lookupAgent(decodedName)

    if (!entry) {
      return NextResponse.json({
        found: false
      })
    }

    return NextResponse.json({
      found: true,
      agent: {
        name: entry.name,
        hostId: entry.hostId,
        hostUrl: entry.hostUrl,
        ampAddress: entry.ampAddress,
        ampRegistered: entry.ampRegistered,
        source: entry.source,
        lastSeen: entry.lastSeen
      }
    })
  } catch (error) {
    console.error('[Agent Directory Lookup API] Error:', error)
    return NextResponse.json(
      { found: false },
      { status: 500 }
    )
  }
}
