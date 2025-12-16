import { NextResponse } from 'next/server'
import { getHosts, saveHosts, addHost, updateHost, deleteHost } from '@/lib/hosts-config'
import { addHostWithSync } from '@/lib/host-sync'
import type { Host } from '@/types/host'

// Force this route to be dynamic (not statically generated at build time)
export const dynamic = 'force-dynamic'

/**
 * GET /api/hosts
 *
 * Returns the list of configured hosts (local and remote).
 * Used by the UI to display host information and for session creation.
 */
export async function GET() {
  try {
    const hosts = getHosts()
    return NextResponse.json({ hosts })
  } catch (error) {
    console.error('[Hosts API] Failed to fetch hosts:', error)
    return NextResponse.json({ error: 'Failed to fetch hosts', hosts: [] }, { status: 500 })
  }
}

/**
 * POST /api/hosts
 *
 * Add a new host to the configuration with bidirectional sync.
 *
 * Query params:
 * - sync: boolean (default: true) - Enable bidirectional sync with remote host
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const syncEnabled = url.searchParams.get('sync') !== 'false'

    const host: Host = await request.json()

    // Validate required fields
    if (!host.id || !host.name || !host.url || !host.type) {
      return NextResponse.json(
        { error: 'Missing required fields: id, name, url, type' },
        { status: 400 }
      )
    }

    // Validate ID format (alphanumeric, dash, underscore)
    if (!/^[a-zA-Z0-9_-]+$/.test(host.id)) {
      return NextResponse.json(
        { error: 'Host ID can only contain letters, numbers, dashes, and underscores' },
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(host.url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    // Use sync-enabled add for remote hosts, regular add for local
    if (syncEnabled && host.type === 'remote') {
      const syncResult = await addHostWithSync(host)

      return NextResponse.json({
        success: syncResult.success,
        host: syncResult.host,
        sync: {
          localAdd: syncResult.localAdd,
          backRegistered: syncResult.backRegistered,
          peersExchanged: syncResult.peersExchanged,
          peersShared: syncResult.peersShared,
          errors: syncResult.errors,
        }
      })
    } else {
      // Legacy: local-only add (for local host or when sync disabled)
      const result = addHost(host)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        host,
        sync: { localAdd: true, backRegistered: false, peersExchanged: 0, peersShared: 0, errors: [] }
      })
    }
  } catch (error) {
    console.error('[Hosts API] Failed to add host:', error)
    return NextResponse.json({ error: 'Failed to add host' }, { status: 500 })
  }
}
