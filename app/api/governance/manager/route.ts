import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, setManager, removeManager, loadGovernance } from '@/lib/governance'
import { getAgent } from '@/lib/agent-registry'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agentId, password } = body

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Governance password is required' }, { status: 400 })
    }

    const config = loadGovernance()
    if (!config.passwordHash) {
      return NextResponse.json({ error: 'Governance password not set. Set a password first via POST /api/governance/password' }, { status: 400 })
    }

    if (!verifyPassword(password)) {
      return NextResponse.json({ error: 'Invalid governance password' }, { status: 401 })
    }

    if (agentId === null) {
      removeManager()
      return NextResponse.json({ success: true, managerId: null })
    }

    if (typeof agentId !== 'string' || !agentId.trim()) {
      return NextResponse.json({ error: 'agentId must be a non-empty string or null' }, { status: 400 })
    }

    // Verify agent exists
    const agent = getAgent(agentId)
    if (!agent) {
      return NextResponse.json({ error: `Agent '${agentId}' not found` }, { status: 404 })
    }

    setManager(agentId)
    return NextResponse.json({ success: true, managerId: agentId, managerName: agent.name || agent.alias })
  } catch (error) {
    console.error('Failed to set manager:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set manager' },
      { status: 500 }
    )
  }
}
