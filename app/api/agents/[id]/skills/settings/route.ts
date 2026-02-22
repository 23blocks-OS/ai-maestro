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
import { isValidUuid } from '@/lib/validation'

// Phase 1: no auth required for reads (localhost-only). Phase 2 should add auth for sensitive settings.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const result = await getSkillSettings(agentId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Skill Settings API] GET Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
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
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    // CC-P2-007: Guard against malformed JSON body
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    // SF-009: Distinguish "no auth attempted" from "auth attempted but failed"
    const authHeader = request.headers.get('Authorization')
    const agentIdHeader = request.headers.get('X-Agent-Id')
    let requestingAgentId: string | null = null
    if (authHeader || agentIdHeader) {
      const auth = authenticateAgent(authHeader, agentIdHeader)
      if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: 401 })
      }
      requestingAgentId = auth.agentId || null
    }
    // SF-044: Type guard for body.settings before passing to service
    if (!body.settings || typeof body.settings !== 'object' || Array.isArray(body.settings)) {
      return NextResponse.json({ error: 'body.settings must be a non-null object' }, { status: 400 })
    }
    const result = await saveSkillSettings(agentId, body.settings, requestingAgentId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Skill Settings API] PUT Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
