/**
 * Host Configuration Types
 *
 * Defines the structure for remote worker hosts in the Manager/Worker pattern.
 */

export type HostType = 'local' | 'remote'

export interface Host {
  /** Unique identifier for the host (e.g., "mac-mini", "macbook-local") */
  id: string

  /** Human-readable display name (e.g., "Mac Mini", "MacBook Pro") */
  name: string

  /** Base URL for the AI Maestro instance (e.g., "http://100.80.12.6:23000") */
  url: string

  /** Type of host - local or remote */
  type: HostType

  /** Whether this host is enabled for session discovery */
  enabled: boolean

  /** Optional: Whether this host is accessed via Tailscale VPN */
  tailscale?: boolean

  /** Optional: Custom tags for organization */
  tags?: string[]

  /** Optional: Description of the host */
  description?: string

  /** When this host was synced (ISO timestamp) */
  syncedAt?: string

  /** How this host was added (manual, peer-registration, peer-exchange) */
  syncSource?: string

  /** Last successful sync timestamp */
  lastSyncSuccess?: string

  /** Last sync error message */
  lastSyncError?: string
}

export interface HostsConfig {
  /** List of configured hosts */
  hosts: Host[]
}

/** Default local host configuration */
export const LOCAL_HOST: Host = {
  id: 'local',
  name: 'Local',
  url: 'http://localhost:23000',
  type: 'local',
  enabled: true,
}
