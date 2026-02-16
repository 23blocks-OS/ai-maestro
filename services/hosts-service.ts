/**
 * Hosts Service
 *
 * Pure business logic extracted from app/api/hosts/** routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/hosts                  -> listHosts
 *   POST   /api/hosts                  -> addNewHost
 *   PUT    /api/hosts/[id]             -> updateExistingHost
 *   DELETE /api/hosts/[id]             -> deleteExistingHost
 *   GET    /api/hosts/identity         -> getHostIdentity
 *   GET    /api/hosts/health           -> checkRemoteHealth
 *   POST   /api/hosts/sync             -> triggerMeshSync
 *   GET    /api/hosts/sync             -> getMeshStatus
 *   POST   /api/hosts/register-peer    -> registerPeer
 *   POST   /api/hosts/exchange-peers   -> exchangePeers
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import {
  getHosts,
  saveHosts,
  addHost,
  updateHost,
  deleteHost,
  isSelf,
  getSelfHost,
  addHostAsync,
  getHostById,
  clearHostsCache,
  findHostByAnyIdentifier,
  getSelfAliases,
  getOrganizationInfo,
  hasOrganization,
  adoptOrganization,
} from '@/lib/hosts-config'
import { addHostWithSync, syncWithAllPeers, getPublicUrl, hasProcessedPropagation, markPropagationProcessed } from '@/lib/host-sync'
import type { Host } from '@/types/host'
import type {
  PeerRegistrationRequest,
  PeerRegistrationResponse,
  PeerExchangeRequest,
  PeerExchangeResponse,
  HostIdentity,
  HostIdentityResponse,
} from '@/types/host-sync'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number  // HTTP-like status code for the route to use
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum propagation depth to prevent infinite loops */
const MAX_PROPAGATION_DEPTH = 3

// ---------------------------------------------------------------------------
// Docker cache (moved from hosts/route.ts)
// ---------------------------------------------------------------------------

let dockerCache: { available: boolean; version?: string; checkedAt: number } | null = null
const DOCKER_CACHE_TTL = 60000 // 60 seconds

async function getDockerStatus(): Promise<{ available: boolean; version?: string; checkedAt: number }> {
  if (dockerCache && Date.now() - dockerCache.checkedAt < DOCKER_CACHE_TTL) {
    return dockerCache
  }
  try {
    const { stdout } = await execAsync("docker version --format '{{.Server.Version}}'", { timeout: 3000 })
    dockerCache = { available: true, version: stdout.trim().replace(/'/g, ''), checkedAt: Date.now() }
  } catch {
    dockerCache = { available: false, checkedAt: Date.now() }
  }
  return dockerCache!
}

// ---------------------------------------------------------------------------
// Package version (read once at module load)
// ---------------------------------------------------------------------------

const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
)
const AI_MAESTRO_VERSION: string = packageJson.version || '0.0.0'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Get self host identity for response.
 * Uses centralized getPublicUrl for consistent URL detection.
 * Includes all aliases for duplicate detection on remote hosts.
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
 * Get organization info formatted for response payloads.
 */
function getOrgInfo(): { organization?: string; organizationSetAt?: string; organizationSetBy?: string } {
  const orgInfo = getOrganizationInfo()
  return {
    organization: orgInfo.organization || undefined,
    organizationSetAt: orgInfo.setAt || undefined,
    organizationSetBy: orgInfo.setBy || undefined,
  }
}

/**
 * Get all known peer hosts as identities for peer exchange.
 * Excludes the requesting host to avoid circular references.
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

/**
 * Make health check request using native fetch.
 * Also extracts session count from /api/sessions response.
 */
async function makeHealthCheckRequest(
  url: URL,
  timeout: number
): Promise<{ success: boolean; error?: string; sessionCount?: number }> {
  try {
    const sessionsUrl = `${url.protocol}//${url.host}/api/sessions`

    const response = await fetch(sessionsUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'AI-Maestro-Health-Check',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store'
    })

    if (response.ok || response.status < 500) {
      let sessionCount: number | undefined
      try {
        const json = await response.json()
        if (json.sessions && Array.isArray(json.sessions)) {
          sessionCount = json.sessions.length
        }
      } catch {
        // Failed to parse, but host is still online
      }
      return { success: true, sessionCount }
    } else {
      return { success: false, error: `HTTP ${response.status}` }
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        return { success: false, error: 'Connection timeout' }
      }
      return { success: false, error: error.message }
    }
    return { success: false, error: 'Unknown error' }
  }
}

/**
 * Fetch version info from remote host's /api/config endpoint.
 */
async function fetchVersionInfo(
  url: URL,
  timeout: number
): Promise<{ version?: string }> {
  try {
    const configUrl = `${url.protocol}//${url.host}/api/config`

    const response = await fetch(configUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'AI-Maestro-Health-Check',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store'
    })

    if (response.ok) {
      const config = await response.json()
      return { version: config.version }
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Fetch Docker availability from remote host's /api/docker/info endpoint.
 */
async function fetchDockerInfo(
  url: URL,
  timeout: number
): Promise<{ available: boolean; version?: string }> {
  try {
    const dockerUrl = `${url.protocol}//${url.host}/api/docker/info`

    const response = await fetch(dockerUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'AI-Maestro-Health-Check',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store'
    })

    if (response.ok) {
      const data = await response.json()
      return { available: !!data.available, version: data.version }
    }
    return { available: false }
  } catch {
    return { available: false }
  }
}

/**
 * Check if a single host is reachable via health check.
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

/**
 * Check health of multiple hosts concurrently.
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

// ===========================================================================
// PUBLIC API — called by API routes
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /api/hosts — list hosts with docker status + isSelf flag
// ---------------------------------------------------------------------------

export async function listHosts(): Promise<ServiceResult<{ hosts: any[] }>> {
  try {
    const hosts = getHosts()

    // Start Docker check in parallel
    const dockerStatusPromise = getDockerStatus()

    // Add isSelf flag to each host right away
    const hostsWithSelf = hosts.map(host => ({
      ...host,
      isSelf: isSelf(host.id),
    }))

    // Await Docker status (returns from cache instantly after first check)
    const docker = await dockerStatusPromise
    for (const host of hostsWithSelf) {
      if (host.isSelf) {
        (host as any).capabilities = {
          docker: docker.available,
          dockerVersion: docker.version,
        }
      }
    }

    return { data: { hosts: hostsWithSelf }, status: 200 }
  } catch (error) {
    console.error('[Hosts API] Failed to fetch hosts:', error)
    return { error: 'Failed to fetch hosts', status: 500 }
  }
}

// ---------------------------------------------------------------------------
// POST /api/hosts — add host with optional sync
// ---------------------------------------------------------------------------

export interface AddHostParams {
  host: Host
  syncEnabled: boolean
}

export async function addNewHost(params: AddHostParams): Promise<ServiceResult<any>> {
  try {
    const { host, syncEnabled } = params

    // Validate required fields
    if (!host.id || !host.name || !host.url || !host.type) {
      return { error: 'Missing required fields: id, name, url, type', status: 400 }
    }

    // Validate ID format (alphanumeric, dash, underscore)
    if (!/^[a-zA-Z0-9_-]+$/.test(host.id)) {
      return { error: 'Host ID can only contain letters, numbers, dashes, and underscores', status: 400 }
    }

    // Validate URL format
    try {
      new URL(host.url)
    } catch {
      return { error: 'Invalid URL format', status: 400 }
    }

    // Use sync-enabled add for remote hosts, regular add for local
    if (syncEnabled && host.type === 'remote') {
      const syncResult = await addHostWithSync(host)

      return {
        data: {
          success: syncResult.success,
          host: syncResult.host,
          sync: {
            localAdd: syncResult.localAdd,
            backRegistered: syncResult.backRegistered,
            peersExchanged: syncResult.peersExchanged,
            peersShared: syncResult.peersShared,
            errors: syncResult.errors,
          }
        },
        status: 200,
      }
    } else {
      // Legacy: local-only add (for local host or when sync disabled)
      const result = addHost(host)
      if (!result.success) {
        return { error: result.error, status: 400 }
      }

      return {
        data: {
          success: true,
          host,
          sync: { localAdd: true, backRegistered: false, peersExchanged: 0, peersShared: 0, errors: [] }
        },
        status: 200,
      }
    }
  } catch (error) {
    console.error('[Hosts API] Failed to add host:', error)
    return { error: 'Failed to add host', status: 500 }
  }
}

// ---------------------------------------------------------------------------
// PUT /api/hosts/[id] — update host
// ---------------------------------------------------------------------------

export async function updateExistingHost(
  id: string,
  hostData: Partial<Host>
): Promise<ServiceResult<{ success: boolean; host?: Host }>> {
  try {
    // Validate URL if provided
    if (hostData.url) {
      try {
        new URL(hostData.url)
      } catch {
        return { error: 'Invalid URL format', status: 400 }
      }
    }

    const result = updateHost(id, hostData)
    if (!result.success) {
      return { error: result.error, status: result.error?.includes('not found') ? 404 : 400 }
    }

    return { data: { success: true, host: result.host }, status: 200 }
  } catch (error) {
    console.error(`[Hosts API] Failed to update host:`, error)
    return { error: 'Failed to update host', status: 500 }
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/hosts/[id] — delete host
// ---------------------------------------------------------------------------

export async function deleteExistingHost(id: string): Promise<ServiceResult<{ success: boolean }>> {
  try {
    const result = deleteHost(id)
    if (!result.success) {
      return { error: result.error, status: result.error?.includes('not found') ? 404 : 400 }
    }

    return { data: { success: true }, status: 200 }
  } catch (error) {
    console.error(`[Hosts API] Failed to delete host:`, error)
    return { error: 'Failed to delete host', status: 500 }
  }
}

// ---------------------------------------------------------------------------
// GET /api/hosts/identity — self host identity with org info
// ---------------------------------------------------------------------------

export function getHostIdentity(): ServiceResult<HostIdentityResponse> {
  const selfHost = getSelfHost()
  const orgInfo = getOrganizationInfo()

  // ALWAYS use the configured URL from hosts.json
  // NEVER use localhost - it's useless in a mesh network
  const url = selfHost.url

  // Detect if running on Tailscale (IPs start with 100.)
  const tailscale = selfHost.tailscale || url.includes('100.')

  return {
    data: {
      host: {
        id: selfHost.id,
        name: selfHost.name,
        url,
        description: selfHost.description,
        version: AI_MAESTRO_VERSION,
        tailscale,
        isSelf: true as const,
      },
      organization: orgInfo.organization || undefined,
      organizationSetAt: orgInfo.setAt || undefined,
      organizationSetBy: orgInfo.setBy || undefined,
    },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// GET /api/hosts/health — proxy health check to remote host
// ---------------------------------------------------------------------------

export async function checkRemoteHealth(hostUrl: string): Promise<ServiceResult<any>> {
  try {
    if (!hostUrl) {
      return { error: 'url query parameter is required', status: 400 }
    }

    // Validate URL format
    let parsedUrl: URL
    try {
      parsedUrl = new URL(hostUrl)
    } catch {
      return { error: 'Invalid URL format', status: 400 }
    }

    // Make health check request using fetch
    // Note: /api/sessions can take 5+ seconds on remote hosts due to tmux queries
    const result = await makeHealthCheckRequest(parsedUrl, 10000)

    if (result.success) {
      // Also fetch version info and Docker capabilities
      const [versionResult, dockerResult] = await Promise.all([
        fetchVersionInfo(parsedUrl, 3000),
        fetchDockerInfo(parsedUrl, 3000),
      ])

      return {
        data: {
          success: true,
          status: 'online',
          url: hostUrl,
          version: versionResult.version || null,
          sessionCount: result.sessionCount ?? null,
          capabilities: {
            docker: dockerResult.available,
            dockerVersion: dockerResult.version,
          },
        },
        status: 200,
      }
    } else {
      return {
        data: {
          success: false,
          status: 'offline',
          url: hostUrl,
          error: result.error,
        },
        status: 503,
      }
    }
  } catch (error) {
    console.error('[Health API] Error:', error)
    return {
      data: {
        success: false,
        status: 'offline',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/hosts/sync — trigger mesh sync
// ---------------------------------------------------------------------------

export async function triggerMeshSync(): Promise<ServiceResult<any>> {
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

    return {
      data: {
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
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Mesh Sync] Error during manual sync:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/hosts/sync — get mesh status without triggering sync
// ---------------------------------------------------------------------------

export async function getMeshStatus(): Promise<ServiceResult<any>> {
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

    return {
      data: {
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
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Mesh Status] Error getting mesh status:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/hosts/register-peer — accept peer registration
// ---------------------------------------------------------------------------

export async function registerPeer(body: PeerRegistrationRequest): Promise<ServiceResult<PeerRegistrationResponse>> {
  try {
    // Validate request
    if (!body.host || !body.host.id || !body.host.name || !body.host.url) {
      return {
        data: {
          success: false,
          registered: false,
          alreadyKnown: false,
          host: getLocalHostIdentity(),
          knownHosts: [],
          ...getOrgInfo(),
          error: 'Missing required fields: host.id, host.name, host.url',
        },
        status: 400,
      }
    }

    // Check propagation depth to prevent infinite loops
    const propagationDepth = body.source?.propagationDepth || 0
    if (propagationDepth > MAX_PROPAGATION_DEPTH) {
      console.log(`[Host Sync] Max propagation depth (${MAX_PROPAGATION_DEPTH}) reached, rejecting`)
      return {
        data: {
          success: true,
          registered: false,
          alreadyKnown: true,
          host: getLocalHostIdentity(),
          knownHosts: [],
          ...getOrgInfo(),
          error: 'Max propagation depth reached',
        },
        status: 200,
      }
    }

    // Check if we've already processed this propagation ID
    const propagationId = body.source?.propagationId
    if (propagationId && hasProcessedPropagation(propagationId)) {
      console.log(`[Host Sync] Already processed propagation ${propagationId}, skipping`)
      return {
        data: {
          success: true,
          registered: false,
          alreadyKnown: true,
          host: getLocalHostIdentity(),
          knownHosts: [],
          ...getOrgInfo(),
        },
        status: 200,
      }
    }

    // Mark propagation as processed
    if (propagationId) {
      markPropagationProcessed(propagationId)
    }

    // Prevent self-registration - use ID only (not URL, as URL can vary)
    const selfHost = getSelfHost()
    if (body.host.id === selfHost.id || isSelf(body.host.id)) {
      return {
        data: {
          success: false,
          registered: false,
          alreadyKnown: false,
          host: getLocalHostIdentity(),
          knownHosts: [],
          ...getOrgInfo(),
          error: 'Cannot register self as peer',
        },
        status: 400,
      }
    }

    // Adopt organization from peer if we don't have one
    let organizationAdopted = false
    if (body.organization && body.organizationSetAt && body.organizationSetBy) {
      if (!hasOrganization()) {
        const adoptResult = adoptOrganization(
          body.organization,
          body.organizationSetAt,
          body.organizationSetBy
        )
        if (adoptResult.success && adoptResult.adopted) {
          organizationAdopted = true
          console.log(`[Host Sync] Adopted organization "${body.organization}" from peer ${body.host.id}`)
        } else if (!adoptResult.success) {
          console.warn(`[Host Sync] Failed to adopt organization: ${adoptResult.error}`)
        }
      } else {
        // Check for organization mismatch
        const currentOrg = getOrganizationInfo()
        if (currentOrg.organization && currentOrg.organization !== body.organization) {
          console.warn(`[Host Sync] Organization mismatch: local="${currentOrg.organization}" vs peer="${body.organization}"`)
          return {
            data: {
              success: false,
              registered: false,
              alreadyKnown: false,
              host: getLocalHostIdentity(),
              knownHosts: [],
              ...getOrgInfo(),
              error: `Organization mismatch: this network is "${currentOrg.organization}" but peer is from "${body.organization}"`,
            },
            status: 409,
          }
        }
      }
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
      return {
        data: {
          success: true,
          registered: false,
          alreadyKnown: true,
          host: getLocalHostIdentity(),
          knownHosts: getKnownHostIdentities(body.host.id),
          ...getOrgInfo(),
        },
        status: 200,
      }
    }

    // Check against all incoming identifiers (URL, aliases, IPs)
    for (const identifier of incomingIdentifiers) {
      const existingHost = findHostByAnyIdentifier(identifier)
      if (existingHost && !isSelf(existingHost.id)) {
        console.log(`[Host Sync] Host with identifier "${identifier}" already exists as ${existingHost.id}`)
        return {
          data: {
            success: true,
            registered: false,
            alreadyKnown: true,
            host: getLocalHostIdentity(),
            knownHosts: getKnownHostIdentities(body.host.id),
            ...getOrgInfo(),
          },
          status: 200,
        }
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
      type: 'remote',
      aliases: body.host.aliases || [],
      enabled: true,
      description: sanitizedDescription,
      syncedAt: new Date().toISOString(),
      syncSource: body.source?.initiator || 'peer-registration',
    }

    // Use async version with lock for concurrent safety
    const result = await addHostAsync(newHost)
    if (!result.success) {
      return {
        data: {
          success: false,
          registered: false,
          alreadyKnown: false,
          host: getLocalHostIdentity(),
          knownHosts: [],
          ...getOrgInfo(),
          error: result.error || 'Failed to add peer',
        },
        status: 500,
      }
    }

    // Clear cache to ensure subsequent reads see the new host
    clearHostsCache()

    console.log(`[Host Sync] Registered new peer: ${body.host.name} (${body.host.id}) from ${body.host.url}`)

    return {
      data: {
        success: true,
        registered: true,
        alreadyKnown: false,
        host: getLocalHostIdentity(),
        knownHosts: getKnownHostIdentities(body.host.id),
        ...getOrgInfo(),
        organizationAdopted,
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Host Sync] Error in register-peer:', error)
    return {
      data: {
        success: false,
        registered: false,
        alreadyKnown: false,
        host: getLocalHostIdentity(),
        knownHosts: [],
        ...getOrgInfo(),
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/hosts/exchange-peers — exchange peer lists
// ---------------------------------------------------------------------------

export async function exchangePeers(body: PeerExchangeRequest): Promise<ServiceResult<PeerExchangeResponse>> {
  try {
    // Validate request
    if (!body.fromHost || !body.knownHosts) {
      return {
        data: {
          success: false,
          newlyAdded: [],
          alreadyKnown: [],
          unreachable: [],
          error: 'Missing required fields: fromHost, knownHosts',
        },
        status: 400,
      }
    }

    // Check if we've already processed this propagation
    const propagationId = body.propagationId
    if (propagationId && hasProcessedPropagation(propagationId)) {
      console.log(`[Host Sync] Already processed propagation ${propagationId} in exchange-peers, skipping`)
      return {
        data: {
          success: true,
          newlyAdded: [],
          alreadyKnown: [],
          unreachable: [],
        },
        status: 200,
      }
    }

    // Mark propagation as processed
    if (propagationId) {
      markPropagationProcessed(propagationId)
    }

    const selfHost = getSelfHost()
    const newlyAdded: string[] = []
    const alreadyKnown: string[] = []
    const unreachable: string[] = []
    let organizationAdopted = false

    // Handle organization sync - adopt from peer if we don't have one
    if (body.organization && body.organizationSetAt && body.organizationSetBy) {
      const adoptResult = adoptOrganization(
        body.organization,
        body.organizationSetAt,
        body.organizationSetBy
      )
      if (adoptResult.success && adoptResult.adopted) {
        organizationAdopted = true
        console.log(`[Host Sync] Adopted organization "${body.organization}" from peer exchange`)
      } else if (!adoptResult.success && adoptResult.error?.includes('mismatch')) {
        // Organization mismatch - this is a serious error
        console.error(`[Host Sync] Organization mismatch with peer: ${adoptResult.error}`)
        const orgInfo = getOrganizationInfo()
        return {
          data: {
            success: false,
            newlyAdded: [],
            alreadyKnown: [],
            unreachable: [],
            organization: orgInfo.organization || undefined,
            organizationSetAt: orgInfo.setAt || undefined,
            organizationSetBy: orgInfo.setBy || undefined,
            error: adoptResult.error,
          },
          status: 409,
        }
      }
    }

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
    console.log(`[Host Sync] Processing ${uniqueHosts.length} unique hosts from ${body.fromHost.name}`)

    for (const peerHost of uniqueHosts) {
      // Skip if it's us (by ID or isSelf check - URL can vary)
      if (peerHost.id === selfHost.id || isSelf(peerHost.id)) {
        console.log(`[Host Sync] Skipping ${peerHost.name} (${peerHost.id}): is self`)
        continue
      }

      // Skip if it's the sender (we already know them from register-peer)
      if (peerHost.id === body.fromHost.id) {
        console.log(`[Host Sync] Skipping ${peerHost.name} (${peerHost.id}): is sender`)
        continue
      }

      // Check if we already know this host by ID
      const existing = getHostById(peerHost.id)
      if (existing) {
        console.log(`[Host Sync] Skipping ${peerHost.name} (${peerHost.id}): already known by ID`)
        alreadyKnown.push(peerHost.id)
        continue
      }

      // Check if URL already exists
      const hosts = getHosts()
      const hostWithSameUrl = hosts.find(h => h.url === peerHost.url && !isSelf(h.id))
      if (hostWithSameUrl) {
        console.log(`[Host Sync] Skipping ${peerHost.name} (${peerHost.id}): URL ${peerHost.url} already exists as ${hostWithSameUrl.id}`)
        alreadyKnown.push(peerHost.id)
        continue
      }

      console.log(`[Host Sync] Will process ${peerHost.name} (${peerHost.id}) at ${peerHost.url}`)
      hostsToProcess.push(peerHost)
    }

    // Concurrent health checks for all hosts to process
    if (hostsToProcess.length > 0) {
      console.log(`[Host Sync] Running health checks for ${hostsToProcess.length} hosts...`)
      const healthResults = await checkHostsHealthConcurrent(hostsToProcess)

      // Log all health check results
      for (const [hostId, isHealthy] of healthResults.entries()) {
        const host = hostsToProcess.find(h => h.id === hostId)
        console.log(`[Host Sync] Health check ${host?.name} (${host?.url}): ${isHealthy ? 'REACHABLE' : 'UNREACHABLE'}`)
      }

      for (const peerHost of hostsToProcess) {
        const isReachable = healthResults.get(peerHost.id)
        if (!isReachable) {
          console.log(`[Host Sync] Peer ${peerHost.name} (${peerHost.url}) is UNREACHABLE from this host, skipping`)
          unreachable.push(peerHost.id)
          continue
        }

        // Sanitize description
        const sanitizedDescription = (peerHost.description || `Discovered via peer exchange from ${body.fromHost.name}`)
          .replace(/[\x00-\x1F\x7F]/g, '')
          .substring(0, 500)

        // Add the new host (include aliases for hostname/IP resolution)
        const newHost: Host = {
          id: peerHost.id,
          name: peerHost.name,
          url: peerHost.url,
          type: 'remote',
          enabled: true,
          description: sanitizedDescription,
          aliases: peerHost.aliases || [],
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

    // Include our organization info in response
    const orgInfo = getOrganizationInfo()

    return {
      data: {
        success: true,
        newlyAdded,
        alreadyKnown,
        unreachable,
        organization: orgInfo.organization || undefined,
        organizationSetAt: orgInfo.setAt || undefined,
        organizationSetBy: orgInfo.setBy || undefined,
        organizationAdopted,
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Host Sync] Error in exchange-peers:', error)
    const orgInfo = getOrganizationInfo()
    return {
      data: {
        success: false,
        newlyAdded: [],
        alreadyKnown: [],
        unreachable: [],
        organization: orgInfo.organization || undefined,
        organizationSetAt: orgInfo.setAt || undefined,
        organizationSetBy: orgInfo.setBy || undefined,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      status: 500,
    }
  }
}
