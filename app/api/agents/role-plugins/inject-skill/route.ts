import { NextRequest, NextResponse } from 'next/server'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { injectAiMaestroSkills } from '@/services/role-plugin-service'

const PLUGINS_DIR = join(homedir(), 'agents', 'role-plugins', 'plugins')

/**
 * POST /api/agents/role-plugins/inject-skill
 * Inject AI Maestro compatibility skills into an existing custom role-plugin.
 * Body: { pluginName: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { pluginName } = await request.json()
    if (!pluginName || typeof pluginName !== 'string') {
      return NextResponse.json({ error: 'pluginName is required' }, { status: 400 })
    }

    // Validate plugin name (no path traversal)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(pluginName)) {
      return NextResponse.json({ error: 'Invalid plugin name' }, { status: 400 })
    }

    const pluginDir = join(PLUGINS_DIR, pluginName)
    if (!existsSync(pluginDir)) {
      return NextResponse.json(
        { error: `Plugin "${pluginName}" not found in local marketplace` },
        { status: 404 }
      )
    }

    const skills = await injectAiMaestroSkills(pluginDir)
    return NextResponse.json({ success: true, pluginName, skills })
  } catch (error) {
    return NextResponse.json(
      { error: `Skill injection failed: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}
