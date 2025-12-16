import { NextResponse } from 'next/server'
import { getHosts, getLocalHost, addHostAsync, getHostById, clearHostsCache } from '@/lib/hosts-config'
import { getPublicUrl, hasProcessedPropagation, markPropagationProcessed } from '@/lib/host-sync'
import {
  PeerRegistrationRequest,
  PeerRegistrationResponse,
  HostIdentity,
} from '@/types/host-sync'
import { Host } from '@/types/host'

// Maximum propagation depth to prevent infinite loops
const MAX_PROPAGATION_DEPTH = 3

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

    // Check propagation depth to prevent infinite loops
    const propagationDepth = body.source?.propagationDepth || 0
    if (propagationDepth > MAX_PROPAGATION_DEPTH) {
      console.log(`[Host Sync] Max propagation depth (${MAX_PROPAGATION_DEPTH}) reached, rejecting`)
      return NextResponse.json({
        success: true,
        registered: false,
        alreadyKnown: true,
        host: getLocalHostIdentity(),
        knownHosts: [], // Don't send hosts to prevent further propagation
        error: 'Max propagation depth reached',
      })
    }

    // Check if we've already processed this propagation ID
    const propagationId = body.source?.propagationId
    if (propagationId && hasProcessedPropagation(propagationId)) {
      console.log(`[Host Sync] Already processed propagation ${propagationId}, skipping`)
      return NextResponse.json({
        success: true,
        registered: false,
        alreadyKnown: true,
        host: getLocalHostIdentity(),
        knownHosts: [], // Don't send hosts to prevent further propagation
      })
    }

    // Mark propagation as processed
    if (propagationId) {
      markPropagationProcessed(propagationId)
    }

    // Prevent self-registration - use ID only (not URL, as URL can vary)
    const localHost = getLocalHost()
    if (body.host.id === localHost.id) {
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

    // Check if we already know this host by ID
    const existingHost = getHostById(body.host.id)
    if (existingHost) {
      console.log(`[Host Sync] Peer ${body.host.name} (${body.host.id}) already known`)
      return NextResponse.json({
        success: true,
        registered: false,
        alreadyKnown: true,
        host: getLocalHostIdentity(),
        knownHosts: getKnownHostIdentities(body.host.id),
      })
    }

    // Check if URL already exists (same host, different ID) - but allow if ID is same
    const hosts = getHosts()
    const hostWithSameUrl = hosts.find(h => h.url === body.host.url && h.type === 'remote')
    if (hostWithSameUrl) {
      console.log(`[Host Sync] Host with URL ${body.host.url} already exists as ${hostWithSameUrl.id}`)
      return NextResponse.json({
        success: true,
        registered: false,
        alreadyKnown: true,
        host: getLocalHostIdentity(),
        knownHosts: getKnownHostIdentities(body.host.id),
      })
    }

    // Sanitize description to remove control characters
    const sanitizedDescription = (body.host.description || `Peer registered from ${body.source?.initiator || 'unknown'}`)
      .replace(/[\x00-\x1F\x7F]/g, '')
      .substring(0, 500)

    // Add the new peer
    const newHost: Host = {
      id: body.host.id,
      name: body.host.name,
      url: body.host.url,
      type: 'remote',
      enabled: true,
      description: sanitizedDescription,
      syncedAt: new Date().toISOString(),
      syncSource: body.source?.initiator || 'peer-registration',
    }

    // Use async version with lock for concurrent safety
    const result = await addHostAsync(newHost)
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

    // Clear cache to ensure subsequent reads see the new host
    clearHostsCache()

    console.log(`[Host Sync] Registered new peer: ${body.host.name} (${body.host.id}) from ${body.host.url}`)

    return NextResponse.json({
      success: true,
      registered: true,
      alreadyKnown: false,
      host: getLocalHostIdentity(),
      knownHosts: getKnownHostIdentities(body.host.id),
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
 * Uses centralized getPublicUrl for consistent URL detection
 */
function getLocalHostIdentity(): HostIdentity {
  const localHost = getLocalHost()
  return {
    id: localHost.id,
    name: localHost.name,
    url: getPublicUrl(localHost),
    description: localHost.description,
  }
}

/**
 * Get all known remote hosts as identities for peer exchange
 * Excludes the requesting host to avoid circular references
 */
function getKnownHostIdentities(excludeId?: string): HostIdentity[] {
  const hosts = getHosts()
  return hosts
    .filter(h => h.type === 'remote' && h.enabled && h.id !== excludeId)
    .map(h => ({
      id: h.id,
      name: h.name,
      url: h.url,
      description: h.description,
    }))
}
