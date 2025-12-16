/**
 * Host Synchronization Logic
 *
 * Orchestrates bidirectional host registration and peer exchange
 * to achieve eventual mesh connectivity.
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
import { getHosts, getLocalHost, addHost, getHostById } from './hosts-config'

/**
 * Add a host with bidirectional sync
 *
 * 1. Add to local hosts.json
 * 2. Register ourselves with the remote host
 * 3. Exchange known peers
 * 4. Propagate new peers to existing hosts
 */
export async function addHostWithSync(
  host: Host,
  options?: {
    skipBackRegistration?: boolean
    skipPeerExchange?: boolean
    skipPropagation?: boolean
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

  // Step 1: Add host locally
  const existingHost = getHostById(host.id)
  if (existingHost) {
    console.log(`[Host Sync] Host ${host.name} already exists locally`)
    result.host = existingHost
    result.localAdd = false
  } else {
    const addResult = addHost(host)
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
      const registrationResult = await registerWithPeer(host.url, localHost)
      result.backRegistered = registrationResult.success

      if (!registrationResult.success) {
        result.errors.push(`Back-registration failed: ${registrationResult.error}`)
      } else {
        console.log(`[Host Sync] Registered with ${host.name}: ${registrationResult.alreadyKnown ? 'already known' : 'newly registered'}`)

        // Step 3: Exchange peers
        if (!options?.skipPeerExchange && registrationResult.knownHosts.length > 0) {
          const exchangeResult = await processPeerExchange(
            host.url,
            localHost,
            registrationResult.knownHosts
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

  // Step 4: Share the new host with our existing peers
  if (!options?.skipPropagation && result.localAdd) {
    const propagationResult = await propagateToExistingPeers(host, localHost)
    result.peersShared = propagationResult.shared
    if (propagationResult.errors.length > 0) {
      result.errors.push(...propagationResult.errors)
    }
  }

  result.success = result.localAdd || result.host !== undefined
  return result
}

/**
 * Register ourselves with a remote peer
 */
async function registerWithPeer(
  peerUrl: string,
  localHost: Host
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
      },
    }

    const response = await fetch(`${peerUrl}/api/hosts/register-peer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

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
 */
async function processPeerExchange(
  peerUrl: string,
  localHost: Host,
  peerKnownHosts: HostIdentity[]
): Promise<{
  newlyAdded: number
  errors: string[]
}> {
  const errors: string[] = []
  let newlyAdded = 0

  // Learn from peer's known hosts
  for (const remoteHost of peerKnownHosts) {
    // Skip if it's us
    if (remoteHost.id === localHost.id) continue

    // Skip if we already know them
    if (getHostById(remoteHost.id)) continue

    // Health check before adding
    const isReachable = await checkHostHealth(remoteHost.url)
    if (!isReachable) {
      console.log(`[Host Sync] Peer ${remoteHost.name} is unreachable, skipping`)
      continue
    }

    // Add the host
    const newHost: Host = {
      id: remoteHost.id,
      name: remoteHost.name,
      url: remoteHost.url,
      type: 'remote',
      enabled: true,
      description: remoteHost.description || 'Discovered via peer exchange',
      syncedAt: new Date().toISOString(),
      syncSource: 'peer-exchange',
    }

    const result = addHost(newHost)
    if (result.success) {
      console.log(`[Host Sync] Added peer from exchange: ${remoteHost.name}`)
      newlyAdded++
    } else {
      errors.push(`Failed to add ${remoteHost.name}: ${result.error}`)
    }
  }

  // Share our known hosts with the peer
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
      }

      await fetch(`${peerUrl}/api/hosts/exchange-peers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
    } catch (error) {
      console.error(`[Host Sync] Failed to share peers with ${peerUrl}:`, error)
    }
  }

  return { newlyAdded, errors }
}

/**
 * Propagate a newly added host to our existing peers
 */
async function propagateToExistingPeers(
  newHost: Host,
  localHost: Host
): Promise<{
  shared: number
  errors: string[]
}> {
  const errors: string[] = []
  let shared = 0

  const existingPeers = getHosts().filter(
    h => h.type === 'remote' && h.enabled && h.id !== newHost.id
  )

  for (const peer of existingPeers) {
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
      }

      const response = await fetch(`${peer.url}/api/hosts/exchange-peers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (response.ok) {
        const data: PeerExchangeResponse = await response.json()
        if (data.newlyAdded.length > 0) {
          console.log(`[Host Sync] Propagated ${newHost.name} to ${peer.name}`)
          shared++
        }
      }
    } catch (error) {
      errors.push(`Failed to propagate to ${peer.name}`)
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
 * Get the public URL for this host (handles Tailscale)
 */
function getPublicUrl(host: Host): string {
  // If we have a configured URL that's not localhost, use it
  if (host.url && !host.url.includes('localhost')) {
    return host.url
  }

  // Try to detect Tailscale IP
  try {
    const os = require('os')
    const networkInterfaces = os.networkInterfaces()
    for (const interfaces of Object.values(networkInterfaces)) {
      if (!interfaces) continue
      for (const iface of interfaces as any[]) {
        if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('100.')) {
          return `http://${iface.address}:23000`
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return host.url
}

/**
 * Check if a host is reachable
 */
async function checkHostHealth(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

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

  for (const peer of peers) {
    try {
      const result = await registerWithPeer(peer.url, localHost)
      if (result.success) {
        synced.push(peer.id)

        // Exchange peers if we learned about new ones
        if (result.knownHosts.length > 0) {
          await processPeerExchange(peer.url, localHost, result.knownHosts)
        }
      } else {
        failed.push(peer.id)
      }
    } catch {
      failed.push(peer.id)
    }
  }

  return { synced, failed }
}
