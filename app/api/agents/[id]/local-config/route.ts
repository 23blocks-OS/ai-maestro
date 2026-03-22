import { NextRequest, NextResponse } from 'next/server'
import { isValidUuid } from '@/lib/validation'
import { scanAgentLocalConfig } from '@/services/agent-local-config-service'

/**
 * GET /api/agents/[id]/local-config
 *
 * Scans the agent's project .claude/ directory and returns all locally
 * installed elements (skills, agents, hooks, rules, commands, MCP, LSP,
 * plugins, role-plugin, settings).
 *
 * Used by the AgentProfilePanel for real-time polling (3-5s interval).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }

    const result = scanAgentLocalConfig(id)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[local-config GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
