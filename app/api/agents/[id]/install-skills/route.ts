/**
 * POST /api/agents/{id}/install-skills
 *
 * Install all ai-maestro skills from Claude into a non-Claude agent's skill directory.
 * Uses the cross-client skill conversion service to copy skills from Claude's
 * plugin cache to the target client's skill path.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAgent } from '@/lib/agent-registry'
import { detectClientType } from '@/lib/client-capabilities'
import { convertSkill, listClientSkills } from '@/services/cross-client-skill-service'
import { isValidUuid } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }

  const agent = getAgent(id)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const clientType = detectClientType(agent.program || 'claude')

  if (clientType === 'claude') {
    return NextResponse.json(
      { error: 'Claude agents use the plugin system — use claude plugin install ai-maestro' },
      { status: 400 }
    )
  }

  // Get all Claude skills and convert each to the target client
  const claudeSkills = await listClientSkills('claude')
  const results = { installed: [] as string[], skipped: [] as string[], errors: [] as Array<{ skill: string; error: string }> }

  for (const skillName of claudeSkills) {
    const result = await convertSkill(skillName, 'claude', clientType)
    if (result.success) {
      results.installed.push(skillName)
    } else if (result.error?.includes('not found')) {
      results.skipped.push(skillName)
    } else {
      results.errors.push({ skill: skillName, error: result.error || 'Unknown error' })
    }
  }

  return NextResponse.json(results)
}
