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
 *   GET    /api/agents/resolve?q=                   -> resolveAgentReference
 *   POST   /api/agents/directory/sync               -> syncDirectory
 *   GET    /api/agents/normalize-hosts              -> diagnoseHosts
 *   POST   /api/agents/normalize-hosts              -> normalizeHosts
 */

import { type ServiceResult, operationFailed, missingField } from '@/services/service-errors'
import {
  rebuildLocalDirectory,
  getLocalEntriesForSync,
  getDirectoryStats,
  lookupAgent,
  syncWithPeers,
} from '@/lib/agent-directory'
import { resolveAgentRef } from '@/lib/agent-resolve'
import {
  loadAgents,
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
    return operationFailed('get directory', error instanceof Error ? error.message : 'Internal server error')
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents/directory/lookup/[name]
// ---------------------------------------------------------------------------

function dirAgent(entry: NonNullable<ReturnType<typeof lookupAgent>>) {
  return {
    name: entry.name,
    hostId: entry.hostId,
    hostUrl: entry.hostUrl,
    ampAddress: entry.ampAddress,
    ampRegistered: entry.ampRegistered,
    source: entry.source,
    lastSeen: entry.lastSeen,
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents/resolve?q=
// ---------------------------------------------------------------------------

export function resolveAgentReference(q: string): ServiceResult<any> {
  try {
    if (!q || !q.trim()) return missingField('q')
    return { data: resolveAgentRef(q, loadAgents()), status: 200 }
  } catch (error) {
    console.error('[Agent Directory Service] resolveAgentReference error:', error)
    return operationFailed('resolve agent', error instanceof Error ? error.message : 'Internal server error')
  }
}

export function lookupAgentByDirectoryName(name: string): ServiceResult<any> {
  try {
    const decodedName = decodeURIComponent(name).toLowerCase()
    rebuildLocalDirectory()
    const entry = lookupAgent(decodedName)

    if (!entry) {
      // Not an address. People say the label ("Titania") or alias ("IaC"); resolve those to the real name.
      const r = resolveAgentRef(decodedName, loadAgents())
      if (r.status === 'found') {
        const byName = lookupAgent(r.agent.name.toLowerCase())
        if (byName) return { data: { found: true, matchedBy: r.via, agent: dirAgent(byName) }, status: 200 }
      }
      if (r.status === 'ambiguous') return { data: { found: false, ambiguous: true, matchedBy: r.via, candidates: r.candidates }, status: 200 }
      return { data: { found: false, suggestions: r.status === 'none' ? r.suggestions : [] }, status: 200 }
    }

    return {
      data: {
        found: true,
        agent: dirAgent(entry),
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Agent Directory Service] lookupAgentByDirectoryName error:', error)
    return operationFailed('lookup agent', error instanceof Error ? error.message : 'Internal server error')
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
    return operationFailed('directory operation', error instanceof Error ? error.message : 'Internal server error')
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
    return operationFailed('directory operation', error instanceof Error ? error.message : 'Internal server error')
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
    return operationFailed('directory operation', error instanceof Error ? error.message : 'Internal server error')
  }
}
