import { NextRequest, NextResponse } from 'next/server'
import { checkMessageAllowed } from '@/lib/message-filter'
import { loadAgents } from '@/lib/agent-registry'

export async function GET(request: NextRequest) {
  try {
    const agentId = request.nextUrl.searchParams.get('agentId')

    if (!agentId) {
      return NextResponse.json({ error: 'agentId query parameter is required' }, { status: 400 })
    }

    // Load all registered agents (includes soft-deleted)
    const allAgents = loadAgents()

    // Check which agents the sender can reach based on governance rules
    const reachableAgentIds: string[] = []

    for (const agent of allAgents) {
      // Skip self
      if (agent.id === agentId) continue
      // Skip soft-deleted agents
      if (agent.deletedAt) continue

      const result = checkMessageAllowed({
        senderAgentId: agentId,
        recipientAgentId: agent.id,
      })

      if (result.allowed) {
        reachableAgentIds.push(agent.id)
      }
    }

    return NextResponse.json({ reachableAgentIds })
  } catch (error) {
    console.error('Error computing reachable agents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
