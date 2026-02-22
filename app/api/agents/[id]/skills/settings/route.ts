/**
 * Agent Skill Settings API
 *
 * GET /api/agents/:id/skills/settings — Get skill settings
 * PUT /api/agents/:id/skills/settings — Save skill settings
 *
 * Thin wrapper — business logic in services/agents-skills-service.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSkillSettings, saveSkillSettings } from '@/services/agents-skills-service'
import { authenticateAgent } from '@/lib/agent-auth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const result = await getSkillSettings(agentId)
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Skill Settings API] GET Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    // CC-P2-007: Guard against malformed JSON body
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }
    const auth = authenticateAgent(request.headers.get('Authorization'), request.headers.get('X-Agent-Id'))
    const requestingAgentId = auth.error ? null : (auth.agentId || null)
    const result = await saveSkillSettings(agentId, body.settings, requestingAgentId)
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Skill Settings API] PUT Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
