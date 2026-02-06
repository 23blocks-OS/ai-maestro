import { NextRequest, NextResponse } from 'next/server'
import { getAgent } from '@/lib/agent-registry'
import { notifyAgent } from '@/lib/notification-service'

// POST /api/teams/notify - Notify team agents about a meeting
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agentIds, teamName } = body

    if (!agentIds || !Array.isArray(agentIds)) {
      return NextResponse.json({ error: 'agentIds array is required' }, { status: 400 })
    }

    if (!teamName || typeof teamName !== 'string') {
      return NextResponse.json({ error: 'teamName is required' }, { status: 400 })
    }

    const results = await Promise.all(
      agentIds.map(async (agentId: string) => {
        const agent = getAgent(agentId)
        if (!agent) {
          return { agentId, success: false, reason: 'Agent not found' }
        }

        const agentName = agent.name || agent.alias || 'unknown'
        try {
          const result = await notifyAgent({
            agentId: agent.id,
            agentName,
            agentHost: agent.hostId,
            fromName: 'AI Maestro',
            subject: `Team "${teamName}" is starting`,
            messageId: `meeting-${Date.now()}`,
            messageType: 'notification',
          })
          return { agentId, agentName, ...result }
        } catch (error) {
          return { agentId, agentName, success: false, error: String(error) }
        }
      })
    )

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Failed to notify team:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to notify team' },
      { status: 500 }
    )
  }
}
