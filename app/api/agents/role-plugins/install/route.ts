/**
 * Role Plugin Install API
 *
 * POST /api/agents/role-plugins/install   — Install plugin locally into agent dir
 * DELETE /api/agents/role-plugins/install  — Uninstall plugin from agent dir
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  PREDEFINED_ROLE_PLUGINS,
} from '@/services/role-plugin-service'
import { ChangePlugin } from '@/services/element-management-service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    let body: { pluginName?: string; agentDir?: string; marketplaceName?: string; rolePluginSwap?: boolean }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.pluginName || typeof body.pluginName !== 'string') {
      return NextResponse.json(
        { error: 'pluginName is required' },
        { status: 400 },
      )
    }
    if (!body.agentDir || typeof body.agentDir !== 'string') {
      return NextResponse.json(
        { error: 'agentDir is required' },
        { status: 400 },
      )
    }

    // Auto-detect marketplace: use explicit body param, or look up predefined defaults
    const predefined = PREDEFINED_ROLE_PLUGINS[body.pluginName]
    const marketplace = body.marketplaceName || predefined?.marketplace || 'ai-maestro-local-roles-marketplace'

    const result = await ChangePlugin(null, {
      name: body.pluginName,
      marketplace,
      action: 'install',
      scope: 'local',
      agentDir: body.agentDir,
      rolePluginSwap: body.rolePluginSwap || false,
    })
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[role-plugins/install] Install failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to install plugin'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    let body: { pluginName?: string; agentDir?: string; marketplaceName?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.pluginName || typeof body.pluginName !== 'string') {
      return NextResponse.json(
        { error: 'pluginName is required' },
        { status: 400 },
      )
    }
    if (!body.agentDir || typeof body.agentDir !== 'string') {
      return NextResponse.json(
        { error: 'agentDir is required' },
        { status: 400 },
      )
    }

    // marketplaceName is optional — defaults to the local role-plugins marketplace
    const marketplace = body.marketplaceName || 'ai-maestro-local-roles-marketplace'

    const result = await ChangePlugin(null, {
      name: body.pluginName,
      marketplace,
      action: 'uninstall',
      scope: 'local',
      agentDir: body.agentDir,
    })
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[role-plugins/install] Uninstall failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to uninstall plugin'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
