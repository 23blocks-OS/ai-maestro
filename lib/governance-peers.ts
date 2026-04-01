/**
 * Governance Peers - Cache of governance state from peer hosts in the AMP mesh
 *
 * Each peer host's governance state is stored at ~/.aimaestro/governance-peers/{hostId}.json
 * All reads/writes are synchronous, matching the pattern in lib/governance.ts.
 * No HTTP calls -- this module is purely file-based cache management.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync, renameSync } from 'fs'
import os from 'os'
import path from 'path'
import type { GovernancePeerState, PeerTeamSummary } from '@/types/governance'
import { isManager, getManagerId } from '@/lib/governance'
import { loadTeams } from '@/lib/team-registry'
// SF-024: File lock for serializing peer governance writes per host
import { withLock } from '@/lib/file-lock'

const PEERS_DIR = path.join(os.homedir(), '.aimaestro', 'governance-peers')

// Peer state older than DEFAULT_TTL seconds is considered stale and filtered out
const DEFAULT_TTL = 300 // 5 minutes

/** Ensure the governance-peers directory exists on disk */
function ensurePeersDir(): void {
  if (!existsSync(PEERS_DIR)) {
    mkdirSync(PEERS_DIR, { recursive: true })
  }
}

/** Reject hostIds that contain path separators or '..' to prevent path traversal attacks */
function validateHostId(hostId: string): void {
  if (!hostId || /[\/\\]|\.\./.test(hostId)) {
    throw new Error(`Invalid hostId: contains path traversal characters: ${hostId}`)
  }
}

/**
 * Load peer governance state for a specific host.
 * Returns null if the file is missing or contains invalid JSON.
 */
export function loadPeerGovernance(hostId: string): GovernancePeerState | null {
  validateHostId(hostId)
  ensurePeersDir()
  const filePath = path.join(PEERS_DIR, `${hostId}.json`)
  if (!existsSync(filePath)) {
    return null
  }
  try {
    const data = readFileSync(filePath, 'utf-8')
    const parsed: GovernancePeerState = JSON.parse(data)
    return parsed
  } catch {
    // Corrupt or unreadable file -- treat as absent
    return null
  }
}

/**
 * Save peer governance state for a specific host.
 * Overwrites any existing state for that hostId.
 */
// SF-024: Serialize writes per host to prevent concurrent file corruption
export async function savePeerGovernance(hostId: string, state: GovernancePeerState): Promise<void> {
  validateHostId(hostId)
  return withLock(`governance-peers-${hostId}`, () => {
    ensurePeersDir()
    const filePath = path.join(PEERS_DIR, `${hostId}.json`)
    // Atomic write: write to temp file then rename to avoid corruption on crash (CC-005 fix)
    // SF-040: Include process.pid for multi-process safety
    const tmpFile = `${filePath}.tmp.${process.pid}`
    writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8')
    renameSync(tmpFile, filePath)
  })
}

/**
 * Delete peer governance state for a specific host.
 * No-op if the file does not exist.
 * SF-032: Protected by file lock to prevent races with concurrent savePeerGovernance.
 */
export async function deletePeerGovernance(hostId: string): Promise<void> {
  validateHostId(hostId)
  return withLock(`governance-peers-${hostId}`, () => {
    const filePath = path.join(PEERS_DIR, `${hostId}.json`)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  })
}

/**
 * Load all peer governance states, filtering out entries whose TTL has expired.
 * Expiry check: (Date.now() - Date.parse(state.lastSyncAt)) > state.ttl * 1000
 */
export function getAllPeerGovernance(): GovernancePeerState[] {
  ensurePeersDir()

  let files: string[]
  try {
    files = readdirSync(PEERS_DIR).filter(f => f.endsWith('.json'))
  } catch {
    return []
  }

  const now = Date.now()
  const results: GovernancePeerState[] = []

  for (const file of files) {
    try {
      const data = readFileSync(path.join(PEERS_DIR, file), 'utf-8')
      const state: GovernancePeerState = JSON.parse(data)

      // Use state.ttl if present, otherwise fall back to DEFAULT_TTL
      const ttlMs = (state.ttl ?? DEFAULT_TTL) * 1000
      const syncedAt = Date.parse(state.lastSyncAt)

      // Skip entries with unparseable timestamps or that have expired
      if (isNaN(syncedAt) || (now - syncedAt) > ttlMs) {
        continue
      }

      results.push(state)
    } catch {
      // Skip corrupt files silently
      continue
    }
  }

  return results
}

/**
 * Check if agentId holds the MANAGER role on ANY host (local or any known peer).
 * Checks local governance first, then iterates over all non-expired peer states.
 */
export function isManagerOnAnyHost(agentId: string): boolean {
  if (!agentId) return false

  // Check local host first (fast path)
  if (isManager(agentId)) return true

  // Check all non-expired peer states
  const peers = getAllPeerGovernance()
  return peers.some(state => state.managerId === agentId)
}

/**
 * Check if agentId is Chief-of-Staff on ANY host (local or any known peer).
 * Checks local teams first, then iterates over all non-expired peer states.
 */
export function isChiefOfStaffOnAnyHost(agentId: string): boolean {
  if (!agentId) return false

  // All teams are closed after governance simplification — no type filter needed
  const localTeams = loadTeams()
  if (localTeams.some(t => t.chiefOfStaffId === agentId)) {
    return true
  }

  // Check peer teams — all teams are closed, no type filter needed
  const peers = getAllPeerGovernance()
  return peers.some(p => p.teams.some(t => t.chiefOfStaffId === agentId))
}

/**
 * Find a team by ID across local and peer hosts.
 * Checks local teams first (returns hostId = 'local'), then peers.
 * Returns the team summary and the hostId it was found on, or null.
 */
export function getTeamFromAnyHost(teamId: string): { team: PeerTeamSummary; hostId: string } | null {
  // Check local teams first
  const localTeams = loadTeams()
  const localMatch = localTeams.find(t => t.id === teamId)
  if (localMatch) {
    // Convert full Team to PeerTeamSummary shape
    const summary: PeerTeamSummary = {
      id: localMatch.id,
      name: localMatch.name,
      type: localMatch.type,
      chiefOfStaffId: localMatch.chiefOfStaffId ?? null,
      agentIds: localMatch.agentIds,
    }
    return { team: summary, hostId: 'local' }
  }

  // Check peer hosts
  const peers = getAllPeerGovernance()
  for (const peer of peers) {
    const peerMatch = peer.teams.find(t => t.id === teamId)
    if (peerMatch) {
      return { team: peerMatch, hostId: peer.hostId }
    }
  }

  return null
}

/**
 * Get all peer teams (non-expired) that include a given agentId as a member.
 * Returns an array of PeerTeamSummary objects augmented with the hostId they belong to.
 * Does NOT include local teams -- use loadTeams() directly for those.
 */
export function getPeerTeamsForAgent(agentId: string): Array<PeerTeamSummary & { hostId: string }> {
  if (!agentId) return []

  const peers = getAllPeerGovernance()
  const results: Array<PeerTeamSummary & { hostId: string }> = []

  for (const peer of peers) {
    for (const team of peer.teams) {
      if (team.agentIds.includes(agentId)) {
        results.push({ ...team, hostId: peer.hostId })
      }
    }
  }

  return results
}
