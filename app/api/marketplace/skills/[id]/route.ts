/**
 * Single Skill API
 *
 * GET /api/marketplace/skills/:id - Get a single skill by ID
 *
 * Skill ID format: marketplace:plugin:skill
 * Example: claude-plugins-official:code-review:code-review
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSkillById } from '@/lib/marketplace-skills'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Decode the skill ID (may be URL encoded)
    const skillId = decodeURIComponent(id)

    // Validate format
    const parts = skillId.split(':')
    if (parts.length !== 3) {
      return NextResponse.json(
        {
          error: 'Invalid skill ID format',
          details: 'Skill ID must be in format: marketplace:plugin:skill',
        },
        { status: 400 }
      )
    }

    // Get the skill with full content
    const skill = await getSkillById(skillId, true)

    if (!skill) {
      return NextResponse.json(
        {
          error: 'Skill not found',
          skillId,
        },
        { status: 404 }
      )
    }

    return NextResponse.json(skill)
  } catch (error) {
    console.error('Error fetching skill:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch skill',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
