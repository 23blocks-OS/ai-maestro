/**
 * Agent Skills API
 *
 * GET /api/agents/:id/skills - Get agent's skills configuration
 * PATCH /api/agents/:id/skills - Update agent's skills (add/remove marketplace skills)
 * POST /api/agents/:id/skills - Add a custom skill to the agent
 * DELETE /api/agents/:id/skills?skill=X - Remove a skill from the agent
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  getAgentSkills,
  addMarketplaceSkills,
  removeMarketplaceSkills,
  addCustomSkill,
  removeCustomSkill,
  updateAiMaestroSkills,
  getAgent,
} from '@/lib/agent-registry'
import { getSkillById } from '@/lib/marketplace-skills'

/**
 * GET /api/agents/:id/skills
 * Get agent's current skills configuration
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const skills = getAgentSkills(id)
    if (!skills) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(skills)
  } catch (error) {
    console.error('Error fetching agent skills:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch agent skills',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/agents/:id/skills
 * Update agent's skills - add or remove marketplace skills, update AI Maestro config
 *
 * Body:
 * {
 *   add?: string[]           // Skill IDs to add (marketplace:plugin:skill format)
 *   remove?: string[]        // Skill IDs to remove
 *   aiMaestro?: {            // Update AI Maestro skills config
 *     enabled?: boolean
 *     skills?: string[]
 *   }
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const agent = getAgent(id)
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    // Handle skill additions
    if (body.add && Array.isArray(body.add) && body.add.length > 0) {
      const skillsToAdd: Array<{
        id: string
        marketplace: string
        plugin: string
        name: string
        version?: string
      }> = []

      for (const skillId of body.add) {
        // Fetch skill details from marketplace
        const skill = await getSkillById(skillId, false)
        if (!skill) {
          return NextResponse.json(
            { error: `Skill not found: ${skillId}` },
            { status: 400 }
          )
        }

        skillsToAdd.push({
          id: skill.id,
          marketplace: skill.marketplace,
          plugin: skill.plugin,
          name: skill.name,
          version: skill.version,
        })
      }

      const result = addMarketplaceSkills(id, skillsToAdd)
      if (!result) {
        return NextResponse.json(
          { error: 'Failed to add skills' },
          { status: 500 }
        )
      }
    }

    // Handle skill removals
    if (body.remove && Array.isArray(body.remove) && body.remove.length > 0) {
      const result = removeMarketplaceSkills(id, body.remove)
      if (!result) {
        return NextResponse.json(
          { error: 'Failed to remove skills' },
          { status: 500 }
        )
      }
    }

    // Handle AI Maestro config update
    if (body.aiMaestro) {
      const result = updateAiMaestroSkills(id, body.aiMaestro)
      if (!result) {
        return NextResponse.json(
          { error: 'Failed to update AI Maestro skills' },
          { status: 500 }
        )
      }
    }

    // Return updated skills
    const updatedSkills = getAgentSkills(id)
    return NextResponse.json({
      success: true,
      skills: updatedSkills,
    })
  } catch (error) {
    console.error('Error updating agent skills:', error)
    return NextResponse.json(
      {
        error: 'Failed to update agent skills',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents/:id/skills
 * Add a custom skill to the agent
 *
 * Body:
 * {
 *   name: string       // Skill name
 *   content: string    // Full SKILL.md content
 *   description?: string
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const agent = getAgent(id)
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      )
    }

    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: content' },
        { status: 400 }
      )
    }

    // Validate name format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(body.name)) {
      return NextResponse.json(
        { error: 'Invalid skill name. Use only alphanumeric characters, hyphens, and underscores.' },
        { status: 400 }
      )
    }

    const result = addCustomSkill(id, {
      name: body.name,
      content: body.content,
      description: body.description,
    })

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to add custom skill' },
        { status: 500 }
      )
    }

    // Return updated skills
    const updatedSkills = getAgentSkills(id)
    return NextResponse.json({
      success: true,
      skills: updatedSkills,
    })
  } catch (error) {
    console.error('Error adding custom skill:', error)
    return NextResponse.json(
      {
        error: 'Failed to add custom skill',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/agents/:id/skills?skill=X
 * Remove a skill from the agent
 *
 * Query params:
 * - skill: Skill ID (for marketplace) or skill name (for custom)
 * - type: 'marketplace' | 'custom' (default: auto-detect)
 */
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
      return NextResponse.json(
        { error: 'Missing required query parameter: skill' },
        { status: 400 }
      )
    }

    const agent = getAgent(id)
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    let result = null

    // Auto-detect type based on skill ID format
    const isMarketplaceSkill = type === 'marketplace' || (type === 'auto' && skill.includes(':'))

    if (isMarketplaceSkill) {
      result = removeMarketplaceSkills(id, [skill])
    } else {
      result = removeCustomSkill(id, skill)
    }

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to remove skill' },
        { status: 500 }
      )
    }

    // Return updated skills
    const updatedSkills = getAgentSkills(id)
    return NextResponse.json({
      success: true,
      skills: updatedSkills,
    })
  } catch (error) {
    console.error('Error removing skill:', error)
    return NextResponse.json(
      {
        error: 'Failed to remove skill',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
