/**
 * Local Plugin Toggle API
 *
 * POST /api/agents/[id]/local-plugins — Toggle a local plugin's enabled state
 *
 * Uses ChangePlugin() for desired-state reconciliation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ChangePlugin } from '@/services/element-management-service'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: agentId } = await params
    const body = await req.json()
    const { key, enabled } = body as { key?: string; enabled?: boolean }

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key is required (plugin key in name@marketplace format)' }, { status: 400 })
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
    }

    // Parse plugin key into name and marketplace
    const atIdx = key.lastIndexOf('@')
    if (atIdx <= 0) {
      return NextResponse.json({ error: 'Invalid plugin key format — expected name@marketplace' }, { status: 400 })
    }
    const pluginName = key.substring(0, atIdx)
    const marketplace = key.substring(atIdx + 1)

    const result = await ChangePlugin(agentId, {
      name: pluginName,
      marketplace,
      action: enabled ? 'enable' : 'disable',
      scope: 'local',
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, key, enabled })
  } catch (error) {
    console.error('[local-plugins] POST failed:', error)
    return NextResponse.json({ error: 'Failed to toggle plugin' }, { status: 500 })
  }
}
