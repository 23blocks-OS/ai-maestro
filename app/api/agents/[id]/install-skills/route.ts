/**
 * POST /api/agents/{id}/install-skills
 *
 * Manually trigger ai-maestro skill installation for a non-Claude agent.
 * Downloads skills from GitHub and copies them to the client-specific skill directory.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAgent } from '@/lib/agent-registry'
import { detectClientType } from '@/lib/client-capabilities'
import { installSkillsForClient } from '@/services/cross-client-skill-service'
import { isValidUuid } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // SF-009: Validate UUID format for agent ID (defense-in-depth)
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }

  const agent = getAgent(id)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const clientType = detectClientType(agent.program || 'claude')

  // Claude agents use the plugin system -- direct skill copy is not applicable
  if (clientType === 'claude') {
    return NextResponse.json(
      { error: 'Claude agents use the plugin system — use claude plugin install ai-maestro' },
      { status: 400 }
    )
  }

  // Aider has no skill support at all
  if (clientType === 'aider') {
    return NextResponse.json(
      { error: 'Aider does not support skills' },
      { status: 400 }
    )
  }

  const workDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
  if (!workDir) {
    return NextResponse.json(
      { error: 'Agent has no working directory — cannot determine skill target path' },
      { status: 400 }
    )
  }

  try {
    const result = await installSkillsForClient(clientType, workDir)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to install skills' },
      { status: 500 }
    )
  }
}
