/**
 * Agents Directory Service
 *
 * Pure business logic extracted from app/api/agents/directory/** and
 * app/api/agents/normalize-hosts routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/agents/directory                   -> getDirectory
 *   GET    /api/agents/directory/lookup/[name]      -> lookupAgentByDirectoryName
 *   POST   /api/agents/directory/sync               -> syncDirectory
 *   GET    /api/agents/normalize-hosts              -> diagnoseHosts
 *   POST   /api/agents/normalize-hosts              -> normalizeHosts
 */

import type { ServiceResult } from '@/services/agents-core-service'
import {
  rebuildLocalDirectory,
  getLocalEntriesForSync,
  getDirectoryStats,
  lookupAgent,
  syncWithPeers,
} from '@/lib/agent-directory'
import {
  diagnoseHostIds,
  normalizeAllAgentHostIds,
} from '@/lib/agent-registry'

// ---------------------------------------------------------------------------
// GET /api/agents/directory
// ---------------------------------------------------------------------------

export function getDirectory(): ServiceResult<any> {
  try {
    rebuildLocalDirectory()
    const entries = getLocalEntriesForSync()
    const stats = getDirectoryStats()
    return { data: { success: true, entries, stats }, status: 200 }
  } catch (error) {
    console.error('[Agent Directory Service] getDirectory error:', error)
    return {
      error: error instanceof Error ? error.message : 'Internal server error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents/directory/lookup/[name]
// ---------------------------------------------------------------------------

export function lookupAgentByDirectoryName(name: string): ServiceResult<any> {
  try {
    const decodedName = decodeURIComponent(name).toLowerCase()
    rebuildLocalDirectory()
    const entry = lookupAgent(decodedName)

    if (!entry) {
      return { data: { found: false }, status: 200 }
    }

    return {
      data: {
        found: true,
        agent: {
          name: entry.name,
          hostId: entry.hostId,
          hostUrl: entry.hostUrl,
          ampAddress: entry.ampAddress,
          ampRegistered: entry.ampRegistered,
          source: entry.source,
          lastSeen: entry.lastSeen,
        },
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Agent Directory Service] lookupAgentByDirectoryName error:', error)
    return { data: { found: false }, status: 500 }
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/directory/sync
// ---------------------------------------------------------------------------

export async function syncDirectory(): Promise<ServiceResult<any>> {
  try {
    rebuildLocalDirectory()
    const result = await syncWithPeers()
    const stats = getDirectoryStats()

    return {
      data: {
        success: true,
        result,
        stats,
        message: result.newAgents > 0
          ? `Discovered ${result.newAgents} new agents from ${result.synced.length} peer(s)`
          : `Synced with ${result.synced.length} peer(s), no new agents`,
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Agent Directory Service] syncDirectory error:', error)
    return {
      error: error instanceof Error ? error.message : 'Internal server error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents/normalize-hosts
// ---------------------------------------------------------------------------

export function diagnoseHosts(): ServiceResult<any> {
  try {
    const diagnosis = diagnoseHostIds()
    return {
      data: {
        success: true,
        diagnosis,
        message: diagnosis.agentsNeedingNormalization > 0
          ? `${diagnosis.agentsNeedingNormalization} agents need host ID normalization. Use POST to fix.`
          : 'All agent host IDs are in canonical format.',
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Agent Directory Service] diagnoseHosts error:', error)
    return {
      error: error instanceof Error ? error.message : 'Internal server error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/normalize-hosts
// ---------------------------------------------------------------------------

export function normalizeHosts(): ServiceResult<any> {
  try {
    const result = normalizeAllAgentHostIds()
    return {
      data: {
        success: true,
        result,
        message: result.updated > 0
          ? `Normalized ${result.updated} agent host IDs`
          : 'No agents needed normalization',
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Agent Directory Service] normalizeHosts error:', error)
    return {
      error: error instanceof Error ? error.message : 'Internal server error',
      status: 500,
    }
  }
}
