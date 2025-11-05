import { NextResponse } from 'next/server'
import type { Session } from '@/types/session'
import { getHosts } from '@/lib/hosts-config'
import { discoverAllSessions } from '@/lib/session-discovery'

// Force this route to be dynamic (not statically generated at build time)
export const dynamic = 'force-dynamic'

/**
 * GET /api/sessions
 *
 * Discovers and returns tmux sessions from all configured hosts.
 * Supports both local and remote session discovery via the Manager/Worker pattern.
 */
export async function GET() {
  try {
    // Load configured hosts
    const hosts = getHosts()

    // Discover sessions from all hosts (local and remote)
    const sessions = await discoverAllSessions(hosts)

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('[Sessions API] Failed to fetch sessions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sessions', sessions: [] },
      { status: 500 }
    )
  }
}
