/**
 * Sync Default Role Plugins API
 *
 * POST /api/agents/role-plugins/sync-defaults
 *   Ensures the role-plugins marketplace (see lib/ecosystem-constants.ts MARKETPLACE_REPO) is registered
 *   and returns the list of available role-plugins from the marketplace metadata.
 *   Does NOT auto-install any role-plugins — they are installed on-demand
 *   when a user selects one from the dropdown.
 *
 * Query params:
 *   ?force=true  — kept for API compatibility (no effect)
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
