/**
 * Agent Directory Sync API
 *
 * POST /api/agents/directory/sync
 *   Triggers a directory sync with peer hosts
 *
 * This endpoint is part of Phase 3 of the AMP Protocol Fix:
 * - Fetches agent lists from all known peer hosts
 * - Updates local directory with discovered agents
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  syncWithPeers,
  rebuildLocalDirectory,
  getDirectoryStats,
} from '@/lib/agent-directory'

/**
 * POST /api/agents/directory/sync
 *
 * Trigger a directory sync with all peer hosts
 */
export async function POST(_request: NextRequest) {
  try {
    // First rebuild local directory
    rebuildLocalDirectory()

    // Then sync with peers
    const result = await syncWithPeers()
    const stats = getDirectoryStats()

    return NextResponse.json({
      success: true,
      result,
      stats,
      message: result.newAgents > 0
        ? `Discovered ${result.newAgents} new agents from ${result.synced.length} peer(s)`
        : `Synced with ${result.synced.length} peer(s), no new agents`,
    })
  } catch (error) {
    console.error('[Agent Directory Sync API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
