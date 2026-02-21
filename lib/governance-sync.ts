/**
 * Governance Sync - Broadcasting and receiving governance state across mesh peers
 *
 * Handles two directions:
 * 1. Outbound: broadcastGovernanceSync() sends governance changes to all peer hosts
 * 2. Inbound: handleGovernanceSyncMessage() processes sync messages from peers
 *
 * Design: Full-snapshot sync (not incremental). Every sync message includes the
 * complete governance state (managerId, managerName, teams) so the handler can
 * simply overwrite the entire peer state. This is simpler and more reliable than
 * trying to apply incremental deltas.
 */

import { getHosts, getSelfHostId, isSelf } from '@/lib/hosts-config'
import { signHostAttestation, getHostPublicKeyHex } from '@/lib/host-keys'
import { getManagerId } from '@/lib/governance'
import { getAgent } from '@/lib/agent-registry'
import { loadTeams } from '@/lib/team-registry'
import { savePeerGovernance } from '@/lib/governance-peers'
import type { GovernanceSyncType, GovernanceSyncMessage, GovernancePeerState, PeerTeamSummary } from '@/types/governance'
import type { Team } from '@/types/team'

/** Default TTL in seconds before peer governance data is considered stale */
const DEFAULT_TTL = 300

/** Timeout for outbound HTTP requests to peer hosts (milliseconds) */
const FETCH_TIMEOUT_MS = 5000

/**
 * Convert local Team[] to PeerTeamSummary[] (subset of fields for cross-host sync)
 */
function summarizeTeams(teams: Team[]): PeerTeamSummary[] {
  return teams.map(team => ({
    id: team.id,
    name: team.name,
    type: team.type,
    chiefOfStaffId: team.chiefOfStaffId ?? null,
    agentIds: [...team.agentIds],
  }))
}

/**
 * Resolve the manager's display name from the agent registry.
 * Returns null if no manager is set or the agent is not found.
 */
function resolveManagerName(managerId: string | null): string | null {
  if (!managerId) return null
  const agent = getAgent(managerId)
  return agent?.name ?? null
}

/**
 * Build the full local governance state snapshot to send to peers.
 * This is the canonical representation of this host's governance state.
 */
export function buildLocalGovernanceSnapshot(): Omit<GovernancePeerState, 'lastSyncAt' | 'ttl'> {
  const hostId = getSelfHostId()
  const managerId = getManagerId()
  const managerName = resolveManagerName(managerId)
  const teams = loadTeams()

  return {
    hostId,
    managerId,
    managerName,
    teams: summarizeTeams(teams),
  }
}

/**
 * Broadcast a governance change to all mesh peer hosts.
 *
 * Fire-and-forget: logs errors but never throws. Uses Promise.allSettled
 * so one failing peer does not block delivery to others.
 *
 * The payload always includes the full governance snapshot (managerId,
 * managerName, teams) regardless of the sync type. The type field is
 * informational only — the receiver overwrites the entire peer state.
 */
export async function broadcastGovernanceSync(
  type: GovernanceSyncType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const hosts = getHosts()
    const selfHostId = getSelfHostId()

    // Filter out self — no point sending governance state to ourselves
    const peerHosts = hosts.filter(host => !isSelf(host.id))

    if (peerHosts.length === 0) {
      // Single-host deployment, nothing to broadcast
      return
    }

    // Build the sync message with full snapshot embedded in the payload
    const snapshot = buildLocalGovernanceSnapshot()
    const message: GovernanceSyncMessage = {
      type,
      fromHostId: selfHostId,
      timestamp: new Date().toISOString(),
      payload: {
        ...payload,
        // Always include the full snapshot so receivers can overwrite their peer state
        managerId: snapshot.managerId,
        managerName: snapshot.managerName,
        teams: snapshot.teams,
      },
    }

    const body = JSON.stringify(message)

    // Send to all peers in parallel, tolerating individual failures
    const results = await Promise.allSettled(
      peerHosts.map(async (host) => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        try {
          const url = `${host.url}/api/v1/governance/sync`
          // Sign the outbound request with this host's Ed25519 key (SR-001)
          const timestamp = new Date().toISOString()
          const signedData = `gov-sync|${selfHostId}|${timestamp}`
          const signature = signHostAttestation(signedData)
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Host-Id': selfHostId,
              'X-Host-Timestamp': timestamp,
              'X-Host-Signature': signature,
            },
            body,
            signal: controller.signal,
          })

          if (!response.ok) {
            console.error(
              `[governance-sync] Failed to sync with ${host.id} (${host.url}): HTTP ${response.status}`
            )
          }
        } finally {
          clearTimeout(timeout)
        }
      })
    )

    // Log any failures (Promise.allSettled never rejects, but individual promises may)
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'rejected') {
        const host = peerHosts[i]
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
        console.error(`[governance-sync] Failed to sync with ${host.id} (${host.url}): ${reason}`)
      }
    }
  } catch (error) {
    // Catch-all: broadcastGovernanceSync must never throw
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[governance-sync] Broadcast failed unexpectedly: ${msg}`)
  }
}

/**
 * Handle an incoming governance sync message from a peer host.
 *
 * Synchronous: validates the message and writes the peer's governance state
 * to disk via savePeerGovernance(). The payload is expected to contain the
 * full governance snapshot (managerId, managerName, teams).
 */
export function handleGovernanceSyncMessage(
  fromHostId: string,
  message: GovernanceSyncMessage
): boolean {
  // Validate that the declared sender matches the message envelope
  if (fromHostId !== message.fromHostId) {
    console.error(
      `[governance-sync] Sender mismatch: request says "${fromHostId}" but message says "${message.fromHostId}" — ignoring`
    )
    return false
  }

  // Extract the full snapshot from the payload
  // All sync types include the complete state, so we just overwrite
  const { managerId, managerName, teams } = message.payload as {
    managerId: string | null
    managerName: string | null
    teams: PeerTeamSummary[]
  }

  // Build the peer state from the snapshot
  const peerState: GovernancePeerState = {
    hostId: fromHostId,
    managerId: managerId ?? null,
    managerName: managerName ?? null,
    teams: Array.isArray(teams) ? teams : [],
    lastSyncAt: message.timestamp,
    ttl: DEFAULT_TTL,
  }

  // Persist the peer's governance state to disk
  savePeerGovernance(fromHostId, peerState)

  console.log(
    `[governance-sync] Updated peer state for ${fromHostId}: type=${message.type}, manager=${managerId ?? 'none'}, teams=${peerState.teams.length}`
  )

  return true
}

/**
 * Request a full governance state sync from a specific peer host.
 *
 * Sends a GET request to the peer's governance sync endpoint and returns
 * the parsed GovernancePeerState, or null on failure.
 */
export async function requestPeerSync(hostUrl: string): Promise<GovernancePeerState | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const url = `${hostUrl}/api/v1/governance/sync`

    // SR-P2-002: Include Ed25519 signature headers for the now-protected GET endpoint
    const selfHostId = getSelfHostId()
    const timestamp = new Date().toISOString()
    const signedData = `gov-sync-read|${selfHostId}|${timestamp}`
    const signature = signHostAttestation(signedData)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Host-Id': selfHostId,
        'X-Host-Timestamp': timestamp,
        'X-Host-Signature': signature,
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      console.error(
        `[governance-sync] Failed to request sync from ${hostUrl}: HTTP ${response.status}`
      )
      return null
    }

    const data = await response.json() as GovernancePeerState
    return data
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[governance-sync] Failed to request sync from ${hostUrl}: ${msg}`)
    return null
  } finally {
    clearTimeout(timeout)
  }
}
