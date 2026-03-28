/**
 * Local Plugin Toggle API
 *
 * POST /api/agents/[id]/local-plugins — Toggle a local plugin's enabled state
 *
 * Reads/writes <workDir>/.claude/settings.local.json enabledPlugins
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getAgent } from '@/lib/agent-registry'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { key, enabled } = body as { key?: string; enabled?: boolean }

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key is required (plugin key in name@marketplace format)' }, { status: 400 })
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
    }

    const agent = getAgent(id)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const workDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
    if (!workDir) {
      return NextResponse.json({ error: 'Agent has no working directory' }, { status: 422 })
    }

    const claudeDir = join(workDir, '.claude')
    const settingsPath = join(claudeDir, 'settings.local.json')

    // Ensure .claude directory exists
    await mkdir(claudeDir, { recursive: true })

    // Snapshot BEFORE state for transactional undo
    const { beginTransaction, commitTransaction, discardTransaction } = await import('@/lib/config-transaction')
    const txId = await beginTransaction({
      description: `${enabled ? 'Enable' : 'Disable'} local plugin ${key}`,
      operation: enabled ? 'plugin:enable' : 'plugin:disable',
      scope: 'local',
      configFiles: { settings_local: settingsPath },
    })

    try {
      // Read existing settings
      let settings: Record<string, unknown> = {}
      if (existsSync(settingsPath)) {
        try {
          const content = await readFile(settingsPath, 'utf-8')
          settings = JSON.parse(content)
        } catch { /* start fresh */ }
      }

      // Update enabledPlugins
      const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
      ep[key] = enabled
      settings.enabledPlugins = ep

      // Write back
      await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n')

      commitTransaction(txId)
      return NextResponse.json({ success: true, key, enabled })
    } catch (innerError) {
      discardTransaction(txId)
      throw innerError
    }
  } catch (error) {
    console.error('[local-plugins] POST failed:', error)
    return NextResponse.json({ error: 'Failed to toggle plugin' }, { status: 500 })
  }
}
