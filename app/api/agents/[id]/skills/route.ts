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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = getSkillsConfig(id)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error fetching agent skills:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agent skills', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // CC-P2-006: Guard against malformed JSON body
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const auth = authenticateAgent(request.headers.get('Authorization'), request.headers.get('X-Agent-Id'))
    const requestingAgentId = auth.error ? null : (auth.agentId || null)
    const result = await updateSkills(id, body, requestingAgentId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error updating agent skills:', error)
    return NextResponse.json(
      { error: 'Failed to update agent skills', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // CC-P2-006: Guard against malformed JSON body
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const auth = authenticateAgent(request.headers.get('Authorization'), request.headers.get('X-Agent-Id'))
    const requestingAgentId = auth.error ? null : (auth.agentId || null)
    const result = await addSkill(id, body, requestingAgentId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error adding custom skill:', error)
    return NextResponse.json(
      { error: 'Failed to add custom skill', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const skill = searchParams.get('skill')
    const type = searchParams.get('type') || 'auto'

    if (!skill) {
      return NextResponse.json({ error: 'Missing required query parameter: skill' }, { status: 400 })
    }

    const auth = authenticateAgent(request.headers.get('Authorization'), request.headers.get('X-Agent-Id'))
    const requestingAgentId = auth.error ? null : (auth.agentId || null)
    const result = await removeSkill(id, skill, type, requestingAgentId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error removing skill:', error)
    return NextResponse.json(
      { error: 'Failed to remove skill', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
