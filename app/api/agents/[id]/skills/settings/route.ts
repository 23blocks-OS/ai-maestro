import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
import fs from 'fs/promises'
import path from 'path'

/**
 * Skill settings are stored per-agent in ~/.aimaestro/agents/<id>/skill-settings.json
 */

async function getSettingsPath(agentId: string): Promise<string> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  return path.join(homeDir, '.aimaestro', 'agents', agentId, 'skill-settings.json')
}

/**
 * GET /api/agents/:id/skills/settings
 * Get skill settings for an agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    // Verify agent exists
    const agent = await agentRegistry.getAgent(agentId)
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      )
    }

    const settingsPath = await getSettingsPath(agentId)

    try {
      const content = await fs.readFile(settingsPath, 'utf-8')
      const settings = JSON.parse(content)
      return NextResponse.json({
        success: true,
        settings
      })
    } catch {
      // Settings file doesn't exist, return defaults
      return NextResponse.json({
        success: true,
        settings: null
      })
    }
  } catch (error) {
    console.error('[Skill Settings API] GET Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/agents/:id/skills/settings
 * Save skill settings for an agent
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json()
    const { settings } = body

    if (!settings) {
      return NextResponse.json(
        { success: false, error: 'Settings are required' },
        { status: 400 }
      )
    }

    // Verify agent exists
    const agent = await agentRegistry.getAgent(agentId)
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      )
    }

    const settingsPath = await getSettingsPath(agentId)

    // Ensure directory exists
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })

    // Save settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')

    // If memory settings changed, update the subconscious
    if (settings.memory) {
      const subconscious = agent.getSubconscious()
      if (subconscious) {
        // Update subconscious configuration
        // The subconscious will pick up these settings on next consolidation
        console.log(`[Skill Settings API] Updated memory settings for agent ${agentId.substring(0, 8)}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Settings saved'
    })
  } catch (error) {
    console.error('[Skill Settings API] PUT Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
