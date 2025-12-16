import { NextResponse } from 'next/server'
import { getHosts, getLocalHost, addHost, getHostById } from '@/lib/hosts-config'
import {
  PeerRegistrationRequest,
  PeerRegistrationResponse,
  HostIdentity,
} from '@/types/host-sync'
import { Host } from '@/types/host'

/**
 * POST /api/hosts/register-peer
 *
 * Accept registration from a remote host and add it to local hosts.json.
 * This is called by remote hosts during bidirectional sync.
 *
 * Returns:
 * - This host's identity (for back-registration if needed)
 * - All known remote hosts (for peer exchange)
 * - Whether the peer was newly registered or already known
 */
export async function POST(request: Request): Promise<NextResponse<PeerRegistrationResponse>> {
  try {
    const body: PeerRegistrationRequest = await request.json()

    // Validate request
    if (!body.host || !body.host.id || !body.host.name || !body.host.url) {
      return NextResponse.json(
        {
          success: false,
          registered: false,
          alreadyKnown: false,
          host: getLocalHostIdentity(),
          knownHosts: [],
          error: 'Missing required fields: host.id, host.name, host.url',
        },
        { status: 400 }
      )
    }

    // Prevent self-registration
    const localHost = getLocalHost()
    if (body.host.id === localHost.id || body.host.url === localHost.url) {
      return NextResponse.json(
        {
          success: false,
          registered: false,
          alreadyKnown: false,
          host: getLocalHostIdentity(),
          knownHosts: [],
          error: 'Cannot register self as peer',
        },
        { status: 400 }
      )
    }

    // Check if we already know this host
    const existingHost = getHostById(body.host.id)
    if (existingHost) {
      console.log(`[Host Sync] Peer ${body.host.name} (${body.host.id}) already known`)
      return NextResponse.json({
        success: true,
        registered: false,
        alreadyKnown: true,
        host: getLocalHostIdentity(),
        knownHosts: getKnownHostIdentities(),
      })
    }

    // Check if URL already exists (same host, different ID)
    const hosts = getHosts()
    const hostWithSameUrl = hosts.find(h => h.url === body.host.url && h.type === 'remote')
    if (hostWithSameUrl) {
      console.log(`[Host Sync] Host with URL ${body.host.url} already exists as ${hostWithSameUrl.id}`)
      return NextResponse.json({
        success: true,
        registered: false,
        alreadyKnown: true,
        host: getLocalHostIdentity(),
        knownHosts: getKnownHostIdentities(),
      })
    }

    // Add the new peer
    const newHost: Host = {
      id: body.host.id,
      name: body.host.name,
      url: body.host.url,
      type: 'remote',
      enabled: true,
      description: body.host.description || `Peer registered from ${body.source?.initiator || 'unknown'}`,
      syncedAt: new Date().toISOString(),
      syncSource: body.source?.initiator || 'peer-registration',
    }

    const result = addHost(newHost)
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          registered: false,
          alreadyKnown: false,
          host: getLocalHostIdentity(),
          knownHosts: [],
          error: result.error || 'Failed to add peer',
        },
        { status: 500 }
      )
    }

    console.log(`[Host Sync] Registered new peer: ${body.host.name} (${body.host.id}) from ${body.host.url}`)

    return NextResponse.json({
      success: true,
      registered: true,
      alreadyKnown: false,
      host: getLocalHostIdentity(),
      knownHosts: getKnownHostIdentities(),
    })
  } catch (error) {
    console.error('[Host Sync] Error in register-peer:', error)
    return NextResponse.json(
      {
        success: false,
        registered: false,
        alreadyKnown: false,
        host: getLocalHostIdentity(),
        knownHosts: [],
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}

/**
 * Get local host identity for response
 */
function getLocalHostIdentity(): HostIdentity {
  const localHost = getLocalHost()
  return {
    id: localHost.id,
    name: localHost.name,
    url: localHost.url,
    description: localHost.description,
  }
}

/**
 * Get all known remote hosts as identities for peer exchange
 */
function getKnownHostIdentities(): HostIdentity[] {
  const hosts = getHosts()
  return hosts
    .filter(h => h.type === 'remote' && h.enabled)
    .map(h => ({
      id: h.id,
      name: h.name,
      url: h.url,
      description: h.description,
    }))
}
