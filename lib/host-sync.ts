/**
 * Host Synchronization Logic
 *
 * Orchestrates bidirectional host registration and peer exchange
 * to achieve eventual mesh connectivity.
 *
 * Key features:
 * - Circular propagation prevention via propagationId tracking
 * - Concurrent health checks for performance
 * - Proper error handling and partial success reporting
 */

import { Host } from '@/types/host'
import {
  HostIdentity,
  HostSyncResult,
  PeerRegistrationRequest,
  PeerRegistrationResponse,
  PeerExchangeRequest,
  PeerExchangeResponse,
} from '@/types/host-sync'
import { getHosts, getLocalHost, addHost, addHostAsync, getHostById, clearHostsCache } from './hosts-config'
import os from 'os'

// Track processed propagation IDs to prevent infinite loops
const processedPropagations = new Set<string>()
const PROPAGATION_CACHE_TTL = 60000 // 1 minute TTL for propagation IDs
const MAX_PROPAGATION_DEPTH = 3 // Maximum hops from original initiator

// Timeout constants for peer operations
const PEER_REGISTRATION_TIMEOUT = 10000 // 10 seconds for peer registration
const PEER_EXCHANGE_TIMEOUT = 15000 // 15 seconds for peer exchange (involves multiple hosts)
const HEALTH_CHECK_TIMEOUT = 5000 // 5 seconds for health checks

/**
 * Generate a unique propagation ID
 */
function generatePropagationId(): string {
  return `prop-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Check if we've already processed this propagation
 */
export function hasProcessedPropagation(propagationId: string): boolean {
  return processedPropagations.has(propagationId)
}

/**
 * Mark a propagation as processed
 */
export function markPropagationProcessed(propagationId: string): void {
  processedPropagations.add(propagationId)
  // Clean up after TTL
  setTimeout(() => {
    processedPropagations.delete(propagationId)
  }, PROPAGATION_CACHE_TTL)
}

/**
 * Get the public URL for this host
 * Centralized URL detection logic - detects Tailscale IP if available
 */
export function getPublicUrl(host?: Host): string {
  const port = process.env.PORT || '23000'

  // If host has a non-localhost URL, use it
  if (host?.url && !host.url.includes('localhost') && !host.url.includes('127.0.0.1')) {
    return host.url
  }

  // Try to detect Tailscale IP (100.x.x.x range)
  try {
    const networkInterfaces = os.networkInterfaces()
    for (const interfaces of Object.values(networkInterfaces)) {
      if (!interfaces) continue
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('100.')) {
          return `http://${iface.address}:${port}`
        }
      }
    }
  } catch {
    // Ignore network interface errors
  }

  // Fall back to host URL or localhost
  return host?.url || `http://localhost:${port}`
}

/**
 * Fetch with timeout support for peer operations
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`)
    }
    throw error
  }
}

/**
 * Check if a host is reachable - with timeout
 */
async function checkHostHealth(url: string, timeoutMs: number = HEALTH_CHECK_TIMEOUT): Promise<boolean> {
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
 * Deduplicate hosts by ID
 */
function deduplicateHosts(hosts: HostIdentity[]): HostIdentity[] {
  const seen = new Set<string>()
  return hosts.filter(host => {
    if (seen.has(host.id)) return false
    seen.add(host.id)
    return true
  })
}

/**
 * Add a host with bidirectional sync
 *
 * 1. Add to local hosts.json
 * 2. Register ourselves with the remote host
 * 3. Exchange known peers
 * 4. Propagate new peers to existing hosts (with depth limit)
 */
export async function addHostWithSync(
  host: Host,
  options?: {
    skipBackRegistration?: boolean
    skipPeerExchange?: boolean
    skipPropagation?: boolean
    propagationId?: string
    propagationDepth?: number
  }
): Promise<HostSyncResult> {
  const result: HostSyncResult = {
    success: false,
    localAdd: false,
    backRegistered: false,
    peersExchanged: 0,
    peersShared: 0,
    errors: [],
  }

  const localHost = getLocalHost()
  const propagationId = options?.propagationId || generatePropagationId()
  const propagationDepth = options?.propagationDepth || 0

  // Check propagation depth to prevent infinite loops
  if (propagationDepth > MAX_PROPAGATION_DEPTH) {
    console.log(`[Host Sync] Max propagation depth reached, stopping`)
    result.errors.push('Max propagation depth reached')
    return result
  }

  // Check if we've already processed this propagation
  if (hasProcessedPropagation(propagationId)) {
    console.log(`[Host Sync] Already processed propagation ${propagationId}, skipping`)
    result.errors.push('Already processed this propagation')
    return result
  }
  markPropagationProcessed(propagationId)

  // Step 1: Add host locally (using async version with lock for concurrent safety)
  const existingHost = getHostById(host.id)
  if (existingHost) {
    console.log(`[Host Sync] Host ${host.name} already exists locally`)
    result.host = existingHost
    result.localAdd = false
  } else {
    const addResult = await addHostAsync(host)
    if (!addResult.success) {
      result.errors.push(`Failed to add host locally: ${addResult.error}`)
      return result
    }
    result.host = addResult.host
    result.localAdd = true
    console.log(`[Host Sync] Added host ${host.name} locally`)
  }

  // Step 2: Register ourselves with the remote host
  if (!options?.skipBackRegistration) {
    try {
      const registrationResult = await registerWithPeer(host.url, localHost, {
        propagationId,
        propagationDepth: propagationDepth + 1,
      })
      result.backRegistered = registrationResult.success

      if (!registrationResult.success) {
        result.errors.push(`Back-registration failed: ${registrationResult.error}`)
      } else {
        console.log(`[Host Sync] Registered with ${host.name}: ${registrationResult.alreadyKnown ? 'already known' : 'newly registered'}`)

        // Step 3: Exchange peers (concurrent health checks)
        if (!options?.skipPeerExchange && registrationResult.knownHosts.length > 0) {
          const exchangeResult = await processPeerExchange(
            host.url,
            localHost,
            registrationResult.knownHosts,
            propagationId
          )
          result.peersExchanged = exchangeResult.newlyAdded
          if (exchangeResult.errors.length > 0) {
            result.errors.push(...exchangeResult.errors)
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push(`Back-registration error: ${errorMsg}`)
      console.error(`[Host Sync] Back-registration failed for ${host.name}:`, error)
    }
  }

  // Step 4: Share the new host with our existing peers (only if we added locally)
  if (!options?.skipPropagation && result.localAdd && propagationDepth < MAX_PROPAGATION_DEPTH) {
    const propagationResult = await propagateToExistingPeers(
      host,
      localHost,
      propagationId
    )
    result.peersShared = propagationResult.shared
    if (propagationResult.errors.length > 0) {
      result.errors.push(...propagationResult.errors)
    }
  }

  // Success requires both local add AND back-registration for remote hosts
  // If back-registration failed, we still succeed locally but note the partial success
  result.success = result.localAdd || result.host !== undefined

  return result
}

/**
 * Register ourselves with a remote peer
 */
async function registerWithPeer(
  peerUrl: string,
  localHost: Host,
  propagation?: { propagationId: string; propagationDepth: number }
): Promise<{
  success: boolean
  alreadyKnown: boolean
  knownHosts: HostIdentity[]
  error?: string
}> {
  try {
    const request: PeerRegistrationRequest = {
      host: {
        id: localHost.id,
        name: localHost.name,
        url: getPublicUrl(localHost),
        description: localHost.description,
      },
      source: {
        initiator: localHost.id,
        timestamp: new Date().toISOString(),
        propagationId: propagation?.propagationId,
        propagationDepth: propagation?.propagationDepth,
      },
    }

    const response = await fetchWithTimeout(
      `${peerUrl}/api/hosts/register-peer`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
      PEER_REGISTRATION_TIMEOUT
    )

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        alreadyKnown: false,
        knownHosts: [],
        error: `HTTP ${response.status}: ${errorText}`,
      }
    }

    const data: PeerRegistrationResponse = await response.json()
    return {
      success: data.success,
      alreadyKnown: data.alreadyKnown,
      knownHosts: data.knownHosts || [],
      error: data.error,
    }
  } catch (error) {
    return {
      success: false,
      alreadyKnown: false,
      knownHosts: [],
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

/**
 * Process peer exchange - learn about new hosts from a peer
 * Uses concurrent health checks for better performance
 */
async function processPeerExchange(
  peerUrl: string,
  localHost: Host,
  peerKnownHosts: HostIdentity[],
  propagationId?: string
): Promise<{
  newlyAdded: number
  errors: string[]
}> {
  const errors: string[] = []
  let newlyAdded = 0

  // Deduplicate incoming hosts
  const uniqueHosts = deduplicateHosts(peerKnownHosts)

  // Filter out hosts we already know or that are us
  const hostsToCheck = uniqueHosts.filter(remoteHost => {
    if (remoteHost.id === localHost.id) return false
    if (getHostById(remoteHost.id)) return false
    return true
  })

  if (hostsToCheck.length === 0) {
    return { newlyAdded: 0, errors: [] }
  }

  // Concurrent health checks for all potential hosts
  const healthResults = await checkHostsHealthConcurrent(hostsToCheck)

  // Add healthy hosts
  for (const remoteHost of hostsToCheck) {
    const isReachable = healthResults.get(remoteHost.id)
    if (!isReachable) {
      console.log(`[Host Sync] Peer ${remoteHost.name} is unreachable, skipping`)
      continue
    }

    // Sanitize description
    const sanitizedDescription = (remoteHost.description || 'Discovered via peer exchange')
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .substring(0, 500) // Limit length

    const newHost: Host = {
      id: remoteHost.id,
      name: remoteHost.name,
      url: remoteHost.url,
      type: 'remote',
      enabled: true,
      description: sanitizedDescription,
      syncedAt: new Date().toISOString(),
      syncSource: 'peer-exchange',
    }

    // Use async version with lock for concurrent safety
    const result = await addHostAsync(newHost)
    if (result.success) {
      console.log(`[Host Sync] Added peer from exchange: ${remoteHost.name}`)
      newlyAdded++
    } else {
      errors.push(`Failed to add ${remoteHost.name}: ${result.error}`)
    }
  }

  // Share our known hosts with the peer (with response checking)
  const ourKnownHosts = getKnownHostIdentities(localHost.id)
  if (ourKnownHosts.length > 0) {
    try {
      const request: PeerExchangeRequest = {
        fromHost: {
          id: localHost.id,
          name: localHost.name,
          url: getPublicUrl(localHost),
        },
        knownHosts: ourKnownHosts,
        propagationId,
      }

      const response = await fetchWithTimeout(
        `${peerUrl}/api/hosts/exchange-peers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        },
        PEER_EXCHANGE_TIMEOUT
      )

      if (!response.ok) {
        console.error(`[Host Sync] Peer exchange failed: HTTP ${response.status}`)
        errors.push(`Peer exchange returned ${response.status}`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Host Sync] Failed to share peers with ${peerUrl}:`, errorMsg)
      errors.push(`Failed to share peers: ${errorMsg}`)
    }
  }

  return { newlyAdded, errors }
}

/**
 * Propagate a newly added host to our existing peers
 */
async function propagateToExistingPeers(
  newHost: Host,
  localHost: Host,
  propagationId?: string
): Promise<{
  shared: number
  errors: string[]
}> {
  const errors: string[] = []
  let shared = 0

  const existingPeers = getHosts().filter(
    h => h.type === 'remote' && h.enabled && h.id !== newHost.id
  )

  // Propagate concurrently to all peers
  const propagatePromises = existingPeers.map(async (peer) => {
    try {
      const request: PeerExchangeRequest = {
        fromHost: {
          id: localHost.id,
          name: localHost.name,
          url: getPublicUrl(localHost),
        },
        knownHosts: [{
          id: newHost.id,
          name: newHost.name,
          url: newHost.url,
          description: newHost.description,
        }],
        propagationId,
      }

      const response = await fetchWithTimeout(
        `${peer.url}/api/hosts/exchange-peers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        },
        PEER_EXCHANGE_TIMEOUT
      )

      if (response.ok) {
        const data: PeerExchangeResponse = await response.json()
        if (data.newlyAdded && data.newlyAdded.length > 0) {
          console.log(`[Host Sync] Propagated ${newHost.name} to ${peer.name}`)
          return { success: true, peer: peer.name }
        }
        return { success: true, peer: peer.name, alreadyKnown: true }
      } else {
        return { success: false, peer: peer.name, error: `HTTP ${response.status}` }
      }
    } catch (error) {
      return {
        success: false,
        peer: peer.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  const results = await Promise.all(propagatePromises)

  for (const result of results) {
    if (result.success && !result.alreadyKnown) {
      shared++
    } else if (!result.success) {
      errors.push(`Failed to propagate to ${result.peer}: ${result.error}`)
    }
  }

  return { shared, errors }
}

/**
 * Get known remote hosts as identities
 */
function getKnownHostIdentities(excludeId?: string): HostIdentity[] {
  return getHosts()
    .filter(h => h.type === 'remote' && h.enabled && h.id !== excludeId)
    .map(h => ({
      id: h.id,
      name: h.name,
      url: h.url,
      description: h.description,
    }))
}

/**
 * Manually trigger sync with all known peers
 * Useful for recovery or manual mesh rebuild
 */
export async function syncWithAllPeers(): Promise<{
  synced: string[]
  failed: string[]
}> {
  const localHost = getLocalHost()
  const peers = getHosts().filter(h => h.type === 'remote' && h.enabled)
  const synced: string[] = []
  const failed: string[] = []

  // Sync concurrently with all peers
  const syncPromises = peers.map(async (peer) => {
    try {
      const result = await registerWithPeer(peer.url, localHost, {
        propagationId: generatePropagationId(),
        propagationDepth: 0,
      })

      if (result.success) {
        // Exchange peers if we learned about new ones
        if (result.knownHosts.length > 0) {
          await processPeerExchange(peer.url, localHost, result.knownHosts)
        }
        return { id: peer.id, success: true }
      } else {
        return { id: peer.id, success: false }
      }
    } catch {
      return { id: peer.id, success: false }
    }
  })

  const results = await Promise.all(syncPromises)

  for (const result of results) {
    if (result.success) {
      synced.push(result.id)
    } else {
      failed.push(result.id)
    }
  }

  return { synced, failed }
}
