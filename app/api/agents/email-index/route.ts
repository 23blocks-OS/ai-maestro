import { NextResponse } from 'next/server'
import { getEmailIndex, findAgentByEmail, getAgent, getAgentEmailAddresses } from '@/lib/agent-registry'
import type { EmailIndexResponse } from '@/types/agent'

/**
 * GET /api/agents/email-index
 *
 * Returns a mapping of email addresses to agent identity.
 * Used by external gateways to build routing tables.
 *
 * Query parameters:
 *   ?address=email@example.com - Lookup single address
 *   ?agentId=uuid-123 - Get all addresses for an agent
 *
 * Response format:
 * {
 *   "email@example.com": {
 *     "agentId": "uuid-...",
 *     "agentName": "my-agent",
 *     "hostId": "mac-mini",
 *     "displayName": "My Agent",
 *     "primary": true
 *   }
 * }
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const addressQuery = searchParams.get('address')
    const agentIdQuery = searchParams.get('agentId')

    // Single address lookup
    if (addressQuery) {
      const agentId = findAgentByEmail(addressQuery)
      if (!agentId) {
        return NextResponse.json({}, { status: 200 })
      }

      const agent = getAgent(agentId)
      if (!agent) {
        return NextResponse.json({}, { status: 200 })
      }

      const addresses = getAgentEmailAddresses(agentId)
      const matchingAddr = addresses.find(
        a => a.address.toLowerCase() === addressQuery.toLowerCase()
      )

      if (!matchingAddr) {
        return NextResponse.json({}, { status: 200 })
      }

      const result: EmailIndexResponse = {
        [matchingAddr.address.toLowerCase()]: {
          agentId: agent.id,
          agentName: agent.name || agent.alias || 'unknown',
          hostId: agent.hostId || 'local',
          displayName: matchingAddr.displayName,
          primary: matchingAddr.primary || false,
          metadata: matchingAddr.metadata,
        }
      }

      return NextResponse.json(result)
    }

    // Get all addresses for a specific agent
    if (agentIdQuery) {
      const agent = getAgent(agentIdQuery)
      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }

      const addresses = getAgentEmailAddresses(agentIdQuery)
      const result: EmailIndexResponse = {}

      for (const addr of addresses) {
        result[addr.address.toLowerCase()] = {
          agentId: agent.id,
          agentName: agent.name || agent.alias || 'unknown',
          hostId: agent.hostId || 'local',
          displayName: addr.displayName,
          primary: addr.primary || false,
          metadata: addr.metadata,
        }
      }

      return NextResponse.json(result)
    }

    // Return full index
    const index = getEmailIndex()
    return NextResponse.json(index)

  } catch (error) {
    console.error('Failed to get email index:', error)
    return NextResponse.json(
      { error: 'Failed to get email index' },
      { status: 500 }
    )
  }
}
