import { NextResponse } from 'next/server'
import { getHosts, getLocalHost, addHost, getHostById } from '@/lib/hosts-config'
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

    const localHost = getLocalHost()
    const newlyAdded: string[] = []
    const alreadyKnown: string[] = []
    const unreachable: string[] = []

    // Process each host from the peer
    for (const peerHost of body.knownHosts) {
      // Skip if it's us
      if (peerHost.id === localHost.id || peerHost.url === localHost.url) {
        continue
      }

      // Skip if it's the sender (we already know them from register-peer)
      if (peerHost.id === body.fromHost.id) {
        continue
      }

      // Check if we already know this host
      const existing = getHostById(peerHost.id)
      if (existing) {
        alreadyKnown.push(peerHost.id)
        continue
      }

      // Check if URL already exists
      const hosts = getHosts()
      const hostWithSameUrl = hosts.find(h => h.url === peerHost.url && h.type === 'remote')
      if (hostWithSameUrl) {
        alreadyKnown.push(peerHost.id)
        continue
      }

      // Health check before adding
      const isReachable = await checkHostHealth(peerHost.url)
      if (!isReachable) {
        console.log(`[Host Sync] Peer ${peerHost.name} (${peerHost.url}) is unreachable, skipping`)
        unreachable.push(peerHost.id)
        continue
      }

      // Add the new host
      const newHost: Host = {
        id: peerHost.id,
        name: peerHost.name,
        url: peerHost.url,
        type: 'remote',
        enabled: true,
        description: peerHost.description || `Discovered via peer exchange from ${body.fromHost.name}`,
        syncedAt: new Date().toISOString(),
        syncSource: `peer-exchange:${body.fromHost.id}`,
      }

      const result = addHost(newHost)
      if (result.success) {
        console.log(`[Host Sync] Added peer from exchange: ${peerHost.name} (${peerHost.id})`)
        newlyAdded.push(peerHost.id)
      } else {
        console.error(`[Host Sync] Failed to add peer ${peerHost.id}:`, result.error)
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
 * Check if a host is reachable via health check
 */
async function checkHostHealth(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    const response = await fetch(`${url}/api/config`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    return response.ok
  } catch {
    return false
  }
}
