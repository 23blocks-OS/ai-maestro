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
    const body = await request.json()
    const result = await saveSkillSettings(agentId, body.settings)
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
