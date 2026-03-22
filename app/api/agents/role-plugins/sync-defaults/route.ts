/**
 * Sync Default Role Plugins API
 *
 * POST /api/agents/role-plugins/sync-defaults
 *   Downloads the 6 default AI Maestro role plugins from GitHub
 *   into ~/agents/role-plugins/plugins/
 *
 * Query params:
 *   ?force=true  — re-download even if plugins already exist
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncDefaultRolePlugins } from '@/services/role-plugin-service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === 'true'

  try {
    const result = await syncDefaultRolePlugins(force)
    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('[role-plugins/sync-defaults] Sync failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to sync default role plugins'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
