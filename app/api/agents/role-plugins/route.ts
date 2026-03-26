/**
 * Role Plugins API
 *
 * GET  /api/agents/role-plugins         — List available role plugins
 * POST /api/agents/role-plugins         — Generate a role plugin from .agent.toml
 * DELETE /api/agents/role-plugins?name= — Delete a role plugin
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  generatePluginFromToml,
  listRolePlugins,
  deleteRolePlugin,
  PREDEFINED_ROLE_PLUGINS,
} from '@/services/role-plugin-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const plugins = await listRolePlugins()
    return NextResponse.json({ plugins })
  } catch (error) {
    console.error('[role-plugins] List failed:', error)
    return NextResponse.json({ error: 'Failed to list role plugins' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: { tomlContent?: string; agentDescription?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.tomlContent || typeof body.tomlContent !== 'string') {
      return NextResponse.json(
        { error: 'tomlContent is required and must be a string' },
        { status: 400 },
      )
    }

    const result = await generatePluginFromToml(body.tomlContent, body.agentDescription)
    return NextResponse.json({
      success: true,
      pluginName: result.pluginName,
      pluginDir: result.pluginDir,
      mainAgentName: result.mainAgentName,
    })
  } catch (error) {
    console.error('[role-plugins] Generate failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to generate plugin'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')
  if (!name) {
    return NextResponse.json({ error: 'name query parameter is required' }, { status: 400 })
  }

  // Guard: prevent deletion of default marketplace role plugins
  if (Object.keys(PREDEFINED_ROLE_PLUGINS).includes(name)) {
    return NextResponse.json({ error: 'Cannot delete default marketplace role plugins' }, { status: 403 })
  }

  try {
    await deleteRolePlugin(name)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[role-plugins] Delete failed:', error)
    return NextResponse.json({ error: 'Failed to delete role plugin' }, { status: 500 })
  }
}
