/**
 * Agent Directory API
 *
 * GET /api/agents/directory
 *   Returns the agent directory for this host
 *   Used by peer hosts to sync agent locations
 *
 * POST /api/agents/directory/sync
 *   Triggers a directory sync with peer hosts
 *
 * This endpoint is part of Phase 3 of the AMP Protocol Fix:
 * - Enables mesh-wide agent discovery
 * - Provides fast agent name -> host location lookups
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getLocalEntriesForSync,
  getDirectoryStats,
  rebuildLocalDirectory,
} from '@/lib/agent-directory'

/**
 * GET /api/agents/directory
 *
 * Returns the local agent directory entries for peer sync
 * Only returns local entries (not remote ones learned from other hosts)
 */
export async function GET(_request: NextRequest) {
  try {
    // Rebuild from current agents to ensure freshness
    rebuildLocalDirectory()

    const entries = getLocalEntriesForSync()
    const stats = getDirectoryStats()

    return NextResponse.json({
      success: true,
      entries,
      stats,
    })
  } catch (error) {
    console.error('[Agent Directory API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
