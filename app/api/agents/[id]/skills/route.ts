/**
 * Agent Skills API
 *
 * GET    /api/agents/:id/skills — Get skills configuration
 * PATCH  /api/agents/:id/skills — Update skills (add/remove marketplace)
 * POST   /api/agents/:id/skills — Add a custom skill
 * DELETE /api/agents/:id/skills?skill=X — Remove a skill
 *
 * Thin wrapper — business logic in services/agents-skills-service.ts
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSkillsConfig, updateSkills, addSkill, removeSkill } from '@/services/agents-skills-service'
import { authenticateAgent } from '@/lib/agent-auth'
import { isValidUuid } from '@/lib/validation'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const result = getSkillsConfig(id)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error fetching agent skills:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agent skills' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    // CC-P2-006: Guard against malformed JSON body
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
    const result = await updateSkills(id, body, requestingAgentId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error updating agent skills:', error)
    return NextResponse.json(
      { error: 'Failed to update agent skills' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    // CC-P2-006: Guard against malformed JSON body
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
    const result = await addSkill(id, body, requestingAgentId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error adding custom skill:', error)
    return NextResponse.json(
      { error: 'Failed to add custom skill' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const searchParams = request.nextUrl.searchParams
    const skill = searchParams.get('skill')
    const type = searchParams.get('type') || 'auto'

    if (!skill) {
      return NextResponse.json({ error: 'Missing required query parameter: skill' }, { status: 400 })
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
    const result = await removeSkill(id, skill, type, requestingAgentId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error removing skill:', error)
    return NextResponse.json(
      { error: 'Failed to remove skill' },
      { status: 500 }
    )
  }
}
