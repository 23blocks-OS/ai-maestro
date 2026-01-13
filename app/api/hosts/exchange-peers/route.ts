import { NextResponse } from 'next/server'
import { getHosts, getSelfHost, isSelf, addHostAsync, getHostById, clearHostsCache } from '@/lib/hosts-config'
import { hasProcessedPropagation, markPropagationProcessed } from '@/lib/host-sync'
import {
  PeerExchangeRequest,
  PeerExchangeResponse,
  HostIdentity,
} from '@/types/host-sync'
import { Host } from '@/types/host'

/**
 * POST /api/hosts/exchange-peers
 *
 * Exchange known hosts with a peer to achieve mesh connectivity.
 * Receives a list of hosts the peer knows and merges with our list.
 *
 * Features:
 * - Deduplication of incoming hosts
 * - Concurrent health checks for performance
 * - Propagation ID tracking to prevent infinite loops
 *
 * Returns:
 * - IDs of newly added hosts
 * - IDs of hosts we already knew
 * - IDs of hosts that were unreachable
 */
export async function POST(request: Request): Promise<NextResponse<PeerExchangeResponse>> {
  try {
    const body: PeerExchangeRequest = await request.json()

    // Validate request
    if (!body.fromHost || !body.knownHosts) {
      return NextResponse.json(
        {
          success: false,
          newlyAdded: [],
          alreadyKnown: [],
          unreachable: [],
          error: 'Missing required fields: fromHost, knownHosts',
        },
        { status: 400 }
      )
    }

    // Check if we've already processed this propagation
    const propagationId = body.propagationId
    if (propagationId && hasProcessedPropagation(propagationId)) {
      console.log(`[Host Sync] Already processed propagation ${propagationId} in exchange-peers, skipping`)
      return NextResponse.json({
        success: true,
        newlyAdded: [],
        alreadyKnown: [],
        unreachable: [],
      })
    }

    // Mark propagation as processed
    if (propagationId) {
      markPropagationProcessed(propagationId)
    }

    const selfHost = getSelfHost()
    const newlyAdded: string[] = []
    const alreadyKnown: string[] = []
    const unreachable: string[] = []

    // Deduplicate incoming hosts by ID
    const seenIds = new Set<string>()
    const uniqueHosts: HostIdentity[] = []
    for (const host of body.knownHosts) {
      if (!seenIds.has(host.id)) {
        seenIds.add(host.id)
        uniqueHosts.push(host)
      }
    }

    // Filter hosts that need processing
    const hostsToProcess: HostIdentity[] = []
    for (const peerHost of uniqueHosts) {
      // Skip if it's us (by ID or isSelf check - URL can vary)
      if (peerHost.id === selfHost.id || isSelf(peerHost.id)) {
        continue
      }

      // Skip if it's the sender (we already know them from register-peer)
      if (peerHost.id === body.fromHost.id) {
        continue
      }

      // Check if we already know this host by ID
      const existing = getHostById(peerHost.id)
      if (existing) {
        alreadyKnown.push(peerHost.id)
        continue
      }

      // Check if URL already exists
      const hosts = getHosts()
      const hostWithSameUrl = hosts.find(h => h.url === peerHost.url && !isSelf(h.id))
      if (hostWithSameUrl) {
        alreadyKnown.push(peerHost.id)
        continue
      }

      hostsToProcess.push(peerHost)
    }

    // Concurrent health checks for all hosts to process
    if (hostsToProcess.length > 0) {
      const healthResults = await checkHostsHealthConcurrent(hostsToProcess)

      for (const peerHost of hostsToProcess) {
        const isReachable = healthResults.get(peerHost.id)
        if (!isReachable) {
          console.log(`[Host Sync] Peer ${peerHost.name} (${peerHost.url}) is unreachable, skipping`)
          unreachable.push(peerHost.id)
          continue
        }

        // Sanitize description
        const sanitizedDescription = (peerHost.description || `Discovered via peer exchange from ${body.fromHost.name}`)
          .replace(/[\x00-\x1F\x7F]/g, '')
          .substring(0, 500)

        // Add the new host
        const newHost: Host = {
          id: peerHost.id,
          name: peerHost.name,
          url: peerHost.url,
          enabled: true,
          description: sanitizedDescription,
          syncedAt: new Date().toISOString(),
          syncSource: `peer-exchange:${body.fromHost.id}`,
        }

        // Use async version with lock for concurrent safety
        const result = await addHostAsync(newHost)
        if (result.success) {
          console.log(`[Host Sync] Added peer from exchange: ${peerHost.name} (${peerHost.id})`)
          newlyAdded.push(peerHost.id)
        } else {
          console.error(`[Host Sync] Failed to add peer ${peerHost.id}:`, result.error)
        }
      }

      // Clear cache if we added any new hosts
      if (newlyAdded.length > 0) {
        clearHostsCache()
      }
    }

    console.log(`[Host Sync] Peer exchange from ${body.fromHost.name}: +${newlyAdded.length} new, ${alreadyKnown.length} known, ${unreachable.length} unreachable`)

    return NextResponse.json({
      success: true,
      newlyAdded,
      alreadyKnown,
      unreachable,
    })
  } catch (error) {
    console.error('[Host Sync] Error in exchange-peers:', error)
    return NextResponse.json(
      {
        success: false,
        newlyAdded: [],
        alreadyKnown: [],
        unreachable: [],
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}

/**
 * Check health of multiple hosts concurrently
 */
async function checkHostsHealthConcurrent(
  hosts: HostIdentity[],
  timeoutMs: number = 5000
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>()

  const checks = hosts.map(async (host) => {
    const isHealthy = await checkHostHealth(host.url, timeoutMs)
    results.set(host.id, isHealthy)
  })

  await Promise.all(checks)
  return results
}

/**
 * Check if a host is reachable via health check
 */
async function checkHostHealth(url: string, timeoutMs: number = 5000): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(`${url}/api/config`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    return response.ok
  } catch {
    return false
  }
}
