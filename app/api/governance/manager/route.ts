import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, setManager, removeManager, loadGovernance } from '@/lib/governance'
import { getAgent } from '@/lib/agent-registry'
import { checkRateLimit, recordFailure, resetRateLimit } from '@/lib/rate-limit'

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

    // Rate limit password verification to prevent brute-force attacks
    const rateCheck = checkRateLimit('governance-password')
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many failed password attempts. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s` },
        { status: 429 }
      )
    }

    if (!(await verifyPassword(password))) {
      recordFailure('governance-password')
      return NextResponse.json({ error: 'Invalid governance password' }, { status: 401 })
    }
    // Password verified successfully — reset rate limit counter
    resetRateLimit('governance-password')

    // agentId === null removes the manager role; undefined/missing is invalid
    if (agentId === null) {
      await removeManager()
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

    await setManager(agentId)
    return NextResponse.json({ success: true, managerId: agentId, managerName: agent.name || agent.alias })
  } catch (error) {
    console.error('[governance] manager POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set manager' },
      { status: 500 }
    )
  }
}
