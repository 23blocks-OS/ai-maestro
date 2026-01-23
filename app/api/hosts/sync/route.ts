import { NextResponse } from 'next/server'
import { getHosts, getSelfHost, isSelf } from '@/lib/hosts-config'
import { syncWithAllPeers, getPublicUrl } from '@/lib/host-sync'

// Force this route to be dynamic
export const dynamic = 'force-dynamic'

/**
 * POST /api/hosts/sync
 *
 * Manually trigger synchronization with all known peers.
 * This re-registers with each peer and exchanges peer lists to ensure
 * the mesh network is fully connected.
 *
 * Use this when:
 * - A new host was added but didn't propagate to all peers
 * - Network issues caused sync to fail
 * - You want to verify mesh connectivity
 */
export async function POST() {
  try {
    const selfHost = getSelfHost()
    const allHosts = getHosts()
    const remotePeers = allHosts.filter(h => !isSelf(h.id) && h.enabled)

    console.log(`[Mesh Sync] Starting manual sync with ${remotePeers.length} peers`)
    console.log(`[Mesh Sync] Self: ${selfHost.name} (${selfHost.id})`)
    console.log(`[Mesh Sync] Public URL: ${getPublicUrl(selfHost)}`)
    console.log(`[Mesh Sync] Peers to sync:`, remotePeers.map(p => `${p.name} (${p.url})`))

    const result = await syncWithAllPeers()

    console.log(`[Mesh Sync] Completed: ${result.synced.length} synced, ${result.failed.length} failed`)

    return NextResponse.json({
      success: true,
      self: {
        id: selfHost.id,
        name: selfHost.name,
        publicUrl: getPublicUrl(selfHost),
      },
      totalPeers: remotePeers.length,
      synced: result.synced,
      failed: result.failed,
      peers: remotePeers.map(p => ({
        id: p.id,
        name: p.name,
        url: p.url,
        status: result.synced.includes(p.id) ? 'synced' : 'failed',
      })),
    })
  } catch (error) {
    console.error('[Mesh Sync] Error during manual sync:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/hosts/sync
 *
 * Get the current mesh status without triggering a sync.
 * Useful for diagnostics.
 */
export async function GET() {
  try {
    const selfHost = getSelfHost()
    const allHosts = getHosts()
    const remotePeers = allHosts.filter(h => !isSelf(h.id) && h.enabled)

    // Check health of all peers concurrently
    const healthChecks = await Promise.all(
      remotePeers.map(async (peer) => {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000)

          const response = await fetch(`${peer.url}/api/config`, {
            signal: controller.signal,
          })
          clearTimeout(timeout)

          return {
            id: peer.id,
            name: peer.name,
            url: peer.url,
            reachable: response.ok,
            type: peer.type,
            syncedAt: peer.syncedAt,
            syncSource: peer.syncSource,
          }
        } catch {
          return {
            id: peer.id,
            name: peer.name,
            url: peer.url,
            reachable: false,
            type: peer.type,
            syncedAt: peer.syncedAt,
            syncSource: peer.syncSource,
          }
        }
      })
    )

    const reachableCount = healthChecks.filter(p => p.reachable).length
    const unreachableCount = healthChecks.filter(p => !p.reachable).length

    return NextResponse.json({
      self: {
        id: selfHost.id,
        name: selfHost.name,
        publicUrl: getPublicUrl(selfHost),
      },
      meshStatus: {
        totalPeers: remotePeers.length,
        reachable: reachableCount,
        unreachable: unreachableCount,
        healthy: unreachableCount === 0,
      },
      peers: healthChecks,
    })
  } catch (error) {
    console.error('[Mesh Status] Error getting mesh status:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
