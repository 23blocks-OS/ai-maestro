import { NextResponse } from 'next/server'
import {
  getHosts,
  getSelfHost,
  isSelf,
  addHostAsync,
  getHostById,
  clearHostsCache,
  findHostByAnyIdentifier,
  getSelfAliases,
} from '@/lib/hosts-config'
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
    const selfHost = getSelfHost()
    if (body.host.id === selfHost.id || isSelf(body.host.id)) {
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

    // Build list of all identifiers to check for duplicates
    const incomingIdentifiers: string[] = [
      body.host.id,
      body.host.url,
      ...(body.host.aliases || []),
    ].filter(Boolean)

    // Check if we already know this host by any identifier (ID, URL, IP, or alias)
    const existingHostById = getHostById(body.host.id)
    if (existingHostById) {
      console.log(`[Host Sync] Peer ${body.host.name} (${body.host.id}) already known by ID`)
      return NextResponse.json({
        success: true,
        registered: false,
        alreadyKnown: true,
        host: getLocalHostIdentity(),
        knownHosts: getKnownHostIdentities(body.host.id),
      })
    }

    // Check against all incoming identifiers (URL, aliases, IPs)
    for (const identifier of incomingIdentifiers) {
      const existingHost = findHostByAnyIdentifier(identifier)
      if (existingHost && !isSelf(existingHost.id)) {
        console.log(`[Host Sync] Host with identifier "${identifier}" already exists as ${existingHost.id}`)
        return NextResponse.json({
          success: true,
          registered: false,
          alreadyKnown: true,
          host: getLocalHostIdentity(),
          knownHosts: getKnownHostIdentities(body.host.id),
        })
      }
    }

    // Sanitize description to remove control characters
    const sanitizedDescription = (body.host.description || `Peer registered from ${body.source?.initiator || 'unknown'}`)
      .replace(/[\x00-\x1F\x7F]/g, '')
      .substring(0, 500)

    // Add the new peer (include aliases for future duplicate detection)
    const newHost: Host = {
      id: body.host.id,
      name: body.host.name,
      url: body.host.url,
      type: 'remote',  // CRITICAL: Mark as remote for routing decisions
      aliases: body.host.aliases || [],
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
 * Get self host identity for response
 * Uses centralized getPublicUrl for consistent URL detection
 * Includes all aliases for duplicate detection on remote hosts
 */
function getLocalHostIdentity(): HostIdentity {
  const selfHost = getSelfHost()
  const aliases = getSelfAliases()
  return {
    id: selfHost.id,
    name: selfHost.name,
    url: getPublicUrl(selfHost),
    description: selfHost.description,
    aliases,
  }
}

/**
 * Get all known peer hosts as identities for peer exchange
 * Excludes the requesting host to avoid circular references
 */
function getKnownHostIdentities(excludeId?: string): HostIdentity[] {
  const hosts = getHosts()
  return hosts
    .filter(h => !isSelf(h.id) && h.enabled && h.id !== excludeId)
    .map(h => ({
      id: h.id,
      name: h.name,
      url: h.url,
      description: h.description,
    }))
}
