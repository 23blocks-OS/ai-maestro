/**
 * Role Plugin Install API
 *
 * POST /api/agents/role-plugins/install   — Install plugin locally into agent dir
 * DELETE /api/agents/role-plugins/install  — Uninstall plugin from agent dir
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  installPluginLocally,
  uninstallPluginLocally,
} from '@/services/role-plugin-service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    let body: { pluginName?: string; agentDir?: string }
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

    await installPluginLocally(body.pluginName, body.agentDir)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[role-plugins/install] Install failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to install plugin'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    let body: { pluginName?: string; agentDir?: string }
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

    await uninstallPluginLocally(body.pluginName, body.agentDir)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[role-plugins/install] Uninstall failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to uninstall plugin'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
