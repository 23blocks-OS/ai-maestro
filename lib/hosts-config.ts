/**
 * Host Configuration Manager
 *
 * Loads and manages remote worker host configurations for the Manager/Worker pattern.
 * Supports configuration via environment variables or JSON file.
 *
 * Features:
 * - File-based locking to prevent concurrent write race conditions
 * - Caching with cache invalidation
 * - Validation of host configuration
 */

import { Host, HostsConfig } from '@/types/host'
import fs from 'fs'
import path from 'path'
import os from 'os'

// File lock state
let lockHeld = false
const lockQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = []
const LOCK_TIMEOUT = 5000 // 5 second timeout for acquiring lock

/**
 * Acquire a lock for file operations
 * Uses an in-process queue to serialize writes
 */
async function acquireLock(): Promise<void> {
  if (!lockHeld) {
    lockHeld = true
    return
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const index = lockQueue.findIndex(item => item.resolve === resolve)
      if (index !== -1) {
        lockQueue.splice(index, 1)
      }
      reject(new Error('Lock acquisition timeout'))
    }, LOCK_TIMEOUT)

    lockQueue.push({
      resolve: () => {
        clearTimeout(timeout)
        resolve()
      },
      reject: (err: Error) => {
        clearTimeout(timeout)
        reject(err)
      },
    })
  })
}

/**
 * Release the lock and process next in queue
 */
function releaseLock(): void {
  if (lockQueue.length > 0) {
    const next = lockQueue.shift()
    if (next) {
      next.resolve()
    }
  } else {
    lockHeld = false
  }
}

/**
 * Execute a function with lock protection
 */
async function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  await acquireLock()
  try {
    return await fn()
  } finally {
    releaseLock()
  }
}

/** Get the local host configuration with actual hostname */
function getDefaultLocalHost(): Host {
  const hostname = os.hostname()
  return {
    id: 'local',
    name: hostname || 'Local Host',
    url: 'http://localhost:23000',
    type: 'local',
    enabled: true,
    description: 'This machine (local tmux sessions)',
  }
}

/** Environment variable name for hosts configuration */
const HOSTS_ENV_VAR = 'AIMAESTRO_HOSTS'

/** Path to hosts configuration file */
const HOSTS_CONFIG_PATH = path.join(process.cwd(), '.aimaestro', 'hosts.json')

let cachedHosts: Host[] | null = null

/**
 * Load hosts configuration from environment variable or file
 * Priority: AIMAESTRO_HOSTS env var > .aimaestro/hosts.json > default (local only)
 */
export function loadHostsConfig(): Host[] {
  // Return cached config if available
  if (cachedHosts !== null) {
    return cachedHosts
  }

  let hosts: Host[] = []

  // Try loading from environment variable first
  const envHosts = process.env[HOSTS_ENV_VAR]
  if (envHosts) {
    try {
      const parsed = JSON.parse(envHosts) as Host[]
      hosts = validateHosts(parsed)
      console.log(`[Hosts] Loaded ${hosts.length} host(s) from ${HOSTS_ENV_VAR} environment variable`)
    } catch (error) {
      console.error(`[Hosts] Failed to parse ${HOSTS_ENV_VAR}:`, error)
    }
  }

  // If no env config, try loading from file
  if (hosts.length === 0 && fs.existsSync(HOSTS_CONFIG_PATH)) {
    try {
      const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
      const config = JSON.parse(fileContent) as HostsConfig
      hosts = validateHosts(config.hosts)
      console.log(`[Hosts] Loaded ${hosts.length} host(s) from ${HOSTS_CONFIG_PATH}`)
    } catch (error) {
      console.error(`[Hosts] Failed to load hosts config from file:`, error)
    }
  }

  // Default to local host only if no configuration found
  if (hosts.length === 0) {
    hosts = [getDefaultLocalHost()]
    console.log('[Hosts] No configuration found, using local host only')
  }

  // Cache the result
  cachedHosts = hosts

  return hosts
}

/**
 * Validate and filter hosts configuration
 * - Filters out disabled hosts
 * - Validates required fields
 * - Ensures local host exists
 */
function validateHosts(hosts: Host[]): Host[] {
  // Filter enabled hosts
  const enabledHosts = hosts.filter(host => host.enabled !== false)

  // Validate required fields
  const validHosts = enabledHosts.filter(host => {
    if (!host.id || !host.name || !host.url || !host.type) {
      console.warn(`[Hosts] Skipping invalid host config:`, host)
      return false
    }
    return true
  })

  // Ensure we have at least one local host
  const hasLocalHost = validHosts.some(host => host.type === 'local')
  if (!hasLocalHost) {
    validHosts.unshift(getDefaultLocalHost())
    console.log('[Hosts] Added default local host')
  }

  return validHosts
}

/**
 * Get all configured hosts
 */
export function getHosts(): Host[] {
  return loadHostsConfig()
}

/**
 * Get a specific host by ID
 */
export function getHostById(hostId: string): Host | undefined {
  const hosts = getHosts()
  return hosts.find(host => host.id === hostId)
}

/**
 * Get the local host configuration
 */
export function getLocalHost(): Host {
  const hosts = getHosts()
  const localHost = hosts.find(host => host.type === 'local')
  return localHost || getDefaultLocalHost()
}

/**
 * Get all remote hosts
 */
export function getRemoteHosts(): Host[] {
  const hosts = getHosts()
  return hosts.filter(host => host.type === 'remote')
}

/**
 * Clear the cached hosts configuration
 * Useful for testing or when configuration changes at runtime
 */
export function clearHostsCache(): void {
  cachedHosts = null
}

/**
 * Create example configuration file
 * This is a helper for users to generate a template
 */
export function createExampleConfig(): HostsConfig {
  return {
    hosts: [
      {
        id: 'local',
        name: 'Local Machine',
        url: 'http://localhost:23000',
        type: 'local',
        enabled: true,
        description: 'This machine (local tmux sessions)',
      },
      {
        id: 'mac-mini',
        name: 'Mac Mini',
        url: 'http://100.80.12.6:23000',
        type: 'remote',
        enabled: true,
        tailscale: true,
        tags: ['homelab', 'development'],
        description: 'Mac Mini via Tailscale VPN',
      },
      {
        id: 'cloud-server-1',
        name: 'Cloud Server 1',
        url: 'http://100.123.45.67:23000',
        type: 'remote',
        enabled: false,
        tailscale: true,
        tags: ['cloud', 'production'],
        description: 'Cloud server for production workloads',
      },
    ],
  }
}

/**
 * Save hosts configuration to file (synchronous version)
 * Returns success status and error message if applicable
 * Note: For concurrent operations, prefer saveHostsAsync which uses locking
 */
export function saveHosts(hosts: Host[]): { success: boolean; error?: string } {
  try {
    // Ensure .aimaestro directory exists
    const configDir = path.dirname(HOSTS_CONFIG_PATH)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    // Write configuration to file
    const config: HostsConfig = { hosts }
    fs.writeFileSync(HOSTS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')

    // Clear cache to force reload on next access
    clearHostsCache()

    return { success: true }
  } catch (error) {
    console.error('[Hosts] Failed to save hosts configuration:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save configuration',
    }
  }
}

/**
 * Save hosts configuration to file with lock protection
 * This is the recommended method for concurrent operations (e.g., peer sync)
 */
export async function saveHostsAsync(hosts: Host[]): Promise<{ success: boolean; error?: string }> {
  return withLock(() => saveHosts(hosts))
}

/**
 * Add a new host to the configuration (synchronous version)
 * Returns success status, the added host, or an error message
 * Note: For concurrent operations, prefer addHostAsync which uses locking
 */
export function addHost(host: Host): { success: boolean; host?: Host; error?: string } {
  try {
    const currentHosts = getHosts()

    // Check if host ID already exists
    const existingHost = currentHosts.find(h => h.id === host.id)
    if (existingHost) {
      return {
        success: false,
        error: `Host with ID '${host.id}' already exists`,
      }
    }

    // Add new host
    const updatedHosts = [...currentHosts, host]

    // Save to file
    const result = saveHosts(updatedHosts)
    if (!result.success) {
      return result
    }

    return { success: true, host }
  } catch (error) {
    console.error('[Hosts] Failed to add host:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add host',
    }
  }
}

/**
 * Add a new host to the configuration with lock protection
 * This is the recommended method for concurrent operations (e.g., peer sync)
 * The lock ensures that multiple simultaneous addHost calls don't cause race conditions
 */
export async function addHostAsync(host: Host): Promise<{ success: boolean; host?: Host; error?: string }> {
  return withLock(() => addHost(host))
}

/**
 * Update an existing host in the configuration
 * Returns success status, the updated host, or an error message
 */
export function updateHost(
  hostId: string,
  updates: Partial<Host>
): { success: boolean; host?: Host; error?: string } {
  try {
    const currentHosts = getHosts()

    // Find the host to update
    const hostIndex = currentHosts.findIndex(h => h.id === hostId)
    if (hostIndex === -1) {
      return {
        success: false,
        error: `Host with ID '${hostId}' not found`,
      }
    }

    // Prevent changing host ID
    if (updates.id && updates.id !== hostId) {
      return {
        success: false,
        error: 'Cannot change host ID',
      }
    }

    // Prevent disabling or deleting local host
    const existingHost = currentHosts[hostIndex]
    if (existingHost.type === 'local' && updates.enabled === false) {
      return {
        success: false,
        error: 'Cannot disable local host',
      }
    }

    // Update the host
    const updatedHost = { ...existingHost, ...updates, id: hostId }
    const updatedHosts = [...currentHosts]
    updatedHosts[hostIndex] = updatedHost

    // Save to file
    const result = saveHosts(updatedHosts)
    if (!result.success) {
      return result
    }

    return { success: true, host: updatedHost }
  } catch (error) {
    console.error('[Hosts] Failed to update host:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update host',
    }
  }
}

/**
 * Delete a host from the configuration
 * Returns success status or an error message
 */
export function deleteHost(hostId: string): { success: boolean; error?: string } {
  try {
    const currentHosts = getHosts()

    // Find the host to delete
    const host = currentHosts.find(h => h.id === hostId)
    if (!host) {
      return {
        success: false,
        error: `Host with ID '${hostId}' not found`,
      }
    }

    // Prevent deleting local host
    if (host.type === 'local') {
      return {
        success: false,
        error: 'Cannot delete local host',
      }
    }

    // Remove the host
    const updatedHosts = currentHosts.filter(h => h.id !== hostId)

    // Save to file
    const result = saveHosts(updatedHosts)
    if (!result.success) {
      return result
    }

    return { success: true }
  } catch (error) {
    console.error('[Hosts] Failed to delete host:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete host',
    }
  }
}
