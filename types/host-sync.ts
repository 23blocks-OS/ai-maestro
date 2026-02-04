/**
 * Host Synchronization Types
 *
 * Defines the protocol for bidirectional host registration
 * and peer exchange in a decentralized mesh topology.
 */

import { Host } from './host'

/**
 * Minimal host identity for registration
 */
export interface HostIdentity {
  id: string
  name: string
  url: string
  description?: string
  /** All known IPs, hostnames, URLs for duplicate detection */
  aliases?: string[]
}

/**
 * Response from GET /api/hosts/identity
 */
export interface HostIdentityResponse {
  host: HostIdentity & {
    version: string
    tailscale: boolean
    isSelf: true  // Always true - this is the host serving the API
  }
  /** Organization name (if set) */
  organization?: string
  /** When organization was set (ISO timestamp) */
  organizationSetAt?: string
  /** Host ID that set the organization */
  organizationSetBy?: string
}

/**
 * Request body for POST /api/hosts/register-peer
 */
export interface PeerRegistrationRequest {
  host: HostIdentity
  source: {
    initiator: string    // Host ID that initiated the original registration
    timestamp: string    // ISO timestamp
    propagationId?: string  // Unique ID to prevent circular propagation
    propagationDepth?: number  // How many hops from original initiator
  }
}

/**
 * Response from POST /api/hosts/register-peer
 */
export interface PeerRegistrationResponse {
  success: boolean
  registered: boolean      // true if newly added, false if already existed
  alreadyKnown: boolean    // true if host was already in hosts.json
  host: HostIdentity       // This host's identity (for back-registration)
  knownHosts: HostIdentity[] // All known remote hosts (for peer exchange)
  /** Organization name (if set) - for mesh sync */
  organization?: string
  /** When organization was set (ISO timestamp) */
  organizationSetAt?: string
  /** Host ID that set the organization */
  organizationSetBy?: string
  error?: string
}

/**
 * Request body for POST /api/hosts/exchange-peers
 */
export interface PeerExchangeRequest {
  fromHost: HostIdentity
  knownHosts: HostIdentity[]
  propagationId?: string  // To prevent circular propagation
  /** Organization name (if set) - for mesh sync */
  organization?: string
  /** When organization was set (ISO timestamp) */
  organizationSetAt?: string
  /** Host ID that set the organization */
  organizationSetBy?: string
}

/**
 * Response from POST /api/hosts/exchange-peers
 */
export interface PeerExchangeResponse {
  success: boolean
  newlyAdded: string[]     // IDs of hosts that were new to us
  alreadyKnown: string[]   // IDs of hosts we already knew
  unreachable: string[]    // IDs of hosts we couldn't reach
  /** Organization name (if set) - for mesh sync */
  organization?: string
  /** When organization was set (ISO timestamp) */
  organizationSetAt?: string
  /** Host ID that set the organization */
  organizationSetBy?: string
  /** True if we adopted organization from this peer */
  organizationAdopted?: boolean
  error?: string
}

/**
 * Result from addHostWithSync()
 */
export interface HostSyncResult {
  success: boolean
  host?: Host
  localAdd: boolean        // Whether host was added locally
  backRegistered: boolean  // Whether we registered with remote host
  peersExchanged: number   // Number of new peers learned
  peersShared: number      // Number of peers we shared with remote
  errors: string[]         // Any non-fatal errors encountered
}

/**
 * Pending sync for retry queue
 */
export interface PendingSync {
  id: string               // Unique ID for this pending sync
  hostId: string
  hostUrl: string
  hostName: string
  action: 'register' | 'exchange'
  payload?: PeerRegistrationRequest | PeerExchangeRequest
  attempts: number
  lastAttempt: string      // ISO timestamp
  nextRetry: string        // ISO timestamp
  lastError?: string
}

/**
 * Sync status for UI display
 */
export type SyncStatus = 'synced' | 'pending' | 'failed' | 'unknown'

/**
 * Extended Host with sync information
 */
export interface HostWithSyncStatus extends Host {
  syncStatus?: SyncStatus
  lastSyncAttempt?: string
  lastSyncSuccess?: string
  syncError?: string
}
