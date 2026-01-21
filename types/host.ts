/**
 * Host Configuration Types
 *
 * In a mesh network, every host is identified by its hostname.
 * There is no "local" vs "remote" distinction - just hosts with URLs.
 */

/**
 * A host in the mesh network
 *
 * id: The hostname (e.g., 'macbook-pro', 'mac-mini')
 * url: How to reach this host's API (e.g., 'http://localhost:23000')
 */
export interface Host {
  /** Unique identifier = hostname (e.g., "macbook-pro", "mac-mini") */
  id: string

  /** Human-readable display name */
  name: string

  /** Base URL for the AI Maestro API (e.g., "http://10.0.0.5:23000") */
  url: string

  /**
   * All known ways to reach this host (IPs, hostnames, URLs)
   * Used for duplicate detection and fallback connections
   * Examples: ['10.0.0.5', '100.104.178.57', 'macbook-pro.local', 'http://10.0.0.5:23000']
   */
  aliases?: string[]

  /** Whether this host is enabled */
  enabled?: boolean

  /** Whether this host is accessed via Tailscale VPN */
  tailscale?: boolean

  /** Custom tags for organization */
  tags?: string[]

  /** Description of the host */
  description?: string

  /** When this host was synced (ISO timestamp) */
  syncedAt?: string

  /** How this host was added (manual, peer-registration, peer-exchange) */
  syncSource?: string

  /** Last successful sync timestamp */
  lastSyncSuccess?: string

  /** Last sync error message */
  lastSyncError?: string

  // DEPRECATED: type field is no longer meaningful
  // In a mesh network, all hosts are equal. Use isSelf(host.id) for self-detection.
  // Kept for backward compatibility during migration - will be removed.
  type?: 'local' | 'remote'
}

export interface HostsConfig {
  /** List of configured hosts */
  hosts: Host[]
}

// Note: isSelf() and getSelfHostId() are in lib/hosts-config.ts (server-side only)
// because they require the `os` module which doesn't work in browsers.
