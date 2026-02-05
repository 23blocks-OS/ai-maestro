/**
 * Host Configuration Manager
 *
 * In a mesh network, every host is identified by its hostname.
 * There is no "local" vs "remote" - just hosts with URLs.
 *
 * Key functions:
 * - isSelf(hostId): Check if hostId refers to this machine
 * - getSelfHostId(): Get this machine's hostname
 * - getSelfHost(): Get this machine's host config
 * - getPeerHosts(): Get all other hosts
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

// ============================================================================
// CORE IDENTITY FUNCTIONS
// ============================================================================

/**
 * Get this machine's hostname - the canonical host ID
 * Always returns lowercase for case-insensitive consistency
 * Strips .local suffix (macOS Bonjour/mDNS) for cross-platform consistency
 */
export function getSelfHostId(): string {
  return os.hostname().toLowerCase().replace(/\.local$/, '')
}

/**
 * Get all local IP addresses for this machine
 * Returns IPs from all network interfaces (excluding loopback)
 * Prioritizes: Tailscale IPs (100.x.x.x) > LAN IPs (10.x, 192.168.x, 172.16-31.x) > others
 */
export function getLocalIPs(): { ip: string; family: string; internal: boolean; interface: string }[] {
  const interfaces = os.networkInterfaces()
  const ips: { ip: string; family: string; internal: boolean; interface: string }[] = []

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue
    for (const addr of addrs) {
      // Skip loopback and internal addresses
      if (addr.internal) continue
      // Only IPv4 for now (more compatible)
      if (addr.family === 'IPv4') {
        ips.push({
          ip: addr.address,
          family: addr.family,
          internal: addr.internal,
          interface: name,
        })
      }
    }
  }

  return ips
}

/**
 * Get the preferred IP address for external communication
 * Priority: Tailscale (100.x) > LAN (10.x, 192.168.x) > other
 * NEVER returns localhost or 127.0.0.1
 */
export function getPreferredIP(): string | null {
  const ips = getLocalIPs()

  // Priority 1: Tailscale IPs (100.x.x.x range used by Tailscale)
  const tailscaleIP = ips.find(i => i.ip.startsWith('100.'))
  if (tailscaleIP) return tailscaleIP.ip

  // Priority 2: Private LAN IPs
  const lanIP = ips.find(i =>
    i.ip.startsWith('10.') ||
    i.ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(i.ip)
  )
  if (lanIP) return lanIP.ip

  // Priority 3: Any other non-internal IP
  if (ips.length > 0) return ips[0].ip

  // Fallback: null (caller should handle this)
  return null
}

/**
 * Get all aliases for this host (all IPs, hostname, etc.)
 * Used for duplicate detection in mesh network
 * All aliases are lowercase for case-insensitive consistency
 */
export function getSelfAliases(): string[] {
  const hostname = getSelfHostId() // Already lowercase
  const ips = getLocalIPs().map(i => i.ip)

  // Include hostname variations and all IPs (all lowercase)
  const aliases = new Set<string>([
    hostname,
    ...ips,
    // Also include URL forms for matching
    ...ips.map(ip => `http://${ip}:23000`),
  ])

  return Array.from(aliases)
}

/**
 * Check if a hostId refers to this machine
 * This is the ONLY place where self-detection should happen
 * Checks against hostname and all known IPs/aliases
 */
export function isSelf(hostId: string): boolean {
  if (!hostId) return false

  const selfId = getSelfHostId()
  const hostIdLower = hostId.toLowerCase()

  // Direct hostname match
  if (hostIdLower === selfId.toLowerCase()) return true

  // Legacy 'local' value (DEPRECATED)
  if (hostId === 'local') return true

  // Check against all our IPs
  const selfIPs = getLocalIPs().map(i => i.ip.toLowerCase())
  if (selfIPs.includes(hostIdLower)) return true

  // Check if it's a URL pointing to one of our IPs
  try {
    const url = new URL(hostId)
    const urlHost = url.hostname.toLowerCase()
    if (urlHost === selfId.toLowerCase() || selfIPs.includes(urlHost)) return true
  } catch {
    // Not a URL, that's fine
  }

  return false
}

/**
 * Get the default host configuration for this machine
 * Uses actual IP address, NEVER localhost
 */
function getDefaultSelfHost(): Host {
  const hostname = getSelfHostId()
  const preferredIP = getPreferredIP()
  const aliases = getSelfAliases()

  // Use actual IP for URL, fallback to hostname if no IP found
  // NEVER use localhost - it's useless in a mesh network
  const url = preferredIP
    ? `http://${preferredIP}:23000`
    : `http://${hostname}:23000`

  return {
    id: hostname,
    name: hostname,
    url,
    aliases,
    enabled: true,
    description: 'This machine',
  }
}

// ============================================================================
// CONFIGURATION LOADING
// ============================================================================

const HOSTS_ENV_VAR = 'AIMAESTRO_HOSTS'
// Use user's home directory for hosts.json - shared across all projects
const HOSTS_CONFIG_PATH = path.join(os.homedir(), '.aimaestro', 'hosts.json')

let cachedHosts: Host[] | null = null

/**
 * Migrate and normalize host config
 * - Convert id:'local' to hostname
 * - Normalize host ID to lowercase
 */
function migrateHost(host: Host): Host {
  const selfId = getSelfHostId() // Already lowercase

  // Migrate id:'local' to actual hostname
  if (host.id === 'local') {
    return {
      ...host,
      id: selfId,
      name: host.name || selfId,
    }
  }

  // Normalize host ID to lowercase for case-insensitive consistency
  return {
    ...host,
    id: host.id.toLowerCase(),
  }
}

/**
 * Load hosts configuration from environment variable or file
 * Priority: AIMAESTRO_HOSTS env var > .aimaestro/hosts.json > default self host
 */
export function loadHostsConfig(): Host[] {
  if (cachedHosts !== null) {
    return cachedHosts
  }

  let hosts: Host[] = []

  // Try environment variable first
  const envHosts = process.env[HOSTS_ENV_VAR]
  if (envHosts) {
    try {
      const parsed = JSON.parse(envHosts) as Host[]
      hosts = validateHosts(parsed)
      console.log(`[Hosts] Loaded ${hosts.length} host(s) from ${HOSTS_ENV_VAR}`)
    } catch (error) {
      console.error(`[Hosts] Failed to parse ${HOSTS_ENV_VAR}:`, error)
    }
  }

  // Try file
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

  // Default to self host only
  if (hosts.length === 0) {
    hosts = [getDefaultSelfHost()]
    console.log('[Hosts] No configuration found, using self host only')
  }

  cachedHosts = hosts
  return hosts
}

/**
 * Validate and filter hosts configuration
 * - Migrates legacy 'local' IDs to hostname
 * - Filters out disabled hosts
 * - Validates required fields
 * - Ensures self host exists
 */
function validateHosts(hosts: Host[]): Host[] {
  // Migrate and filter
  const migratedHosts = hosts.map(migrateHost)
  const enabledHosts = migratedHosts.filter(host => host.enabled !== false)

  // Validate required fields (type is no longer required)
  const validHosts = enabledHosts.filter(host => {
    if (!host.id || !host.name || !host.url) {
      console.warn(`[Hosts] Skipping invalid host config:`, host)
      return false
    }
    return true
  })

  // Ensure self host exists
  const hasSelfHost = validHosts.some(host => isSelf(host.id))
  if (!hasSelfHost) {
    validHosts.unshift(getDefaultSelfHost())
    console.log('[Hosts] Added default self host')
  }

  return validHosts
}

// ============================================================================
// HOST ACCESSORS
// ============================================================================

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
  // Also check for legacy 'local' ID
  if (hostId === 'local') {
    return hosts.find(host => isSelf(host.id))
  }
  return hosts.find(host => host.id === hostId || host.id.toLowerCase() === hostId.toLowerCase())
}

/**
 * Find a host by any of its known identifiers (ID, URL, IP, or aliases)
 * Used for duplicate detection in mesh network
 *
 * @param identifier - Can be hostname, IP address, URL, or any alias
 * @returns The matching host, or undefined if not found
 */
export function findHostByAnyIdentifier(identifier: string): Host | undefined {
  if (!identifier) return undefined

  const hosts = getHosts()
  const identifierLower = identifier.toLowerCase()

  // Extract IP/hostname from URL if it's a URL
  let identifierHost = identifierLower
  try {
    const url = new URL(identifier)
    identifierHost = url.hostname.toLowerCase()
  } catch {
    // Not a URL, use as-is
  }

  for (const host of hosts) {
    // Check ID
    if (host.id.toLowerCase() === identifierLower) return host
    if (host.id.toLowerCase() === identifierHost) return host

    // Check URL
    if (host.url) {
      try {
        const hostUrl = new URL(host.url)
        if (hostUrl.hostname.toLowerCase() === identifierHost) return host
      } catch {
        // Invalid URL in host config
      }
    }

    // Check aliases
    if (host.aliases) {
      for (const alias of host.aliases) {
        const aliasLower = alias.toLowerCase()
        if (aliasLower === identifierLower) return host
        if (aliasLower === identifierHost) return host

        // Also check URL hostname in alias
        try {
          const aliasUrl = new URL(alias)
          if (aliasUrl.hostname.toLowerCase() === identifierHost) return host
        } catch {
          // Not a URL alias
        }
      }
    }
  }

  return undefined
}

/**
 * Check if a host with any of the given identifiers already exists
 * Returns the matching host if found, undefined otherwise
 *
 * @param identifiers - Array of IPs, hostnames, URLs to check
 */
export function findExistingHostByIdentifiers(identifiers: string[]): Host | undefined {
  for (const identifier of identifiers) {
    const existing = findHostByAnyIdentifier(identifier)
    if (existing) return existing
  }
  return undefined
}

/**
 * Get this machine's host configuration
 */
export function getSelfHost(): Host {
  const hosts = getHosts()
  const selfHost = hosts.find(host => isSelf(host.id))
  return selfHost || getDefaultSelfHost()
}

/**
 * Get all peer hosts (hosts that are not this machine)
 */
export function getPeerHosts(): Host[] {
  const hosts = getHosts()
  return hosts.filter(host => !isSelf(host.id))
}

// DEPRECATED: Use getSelfHost() instead
export function getLocalHost(): Host {
  return getSelfHost()
}

// DEPRECATED: Use getPeerHosts() instead
export function getRemoteHosts(): Host[] {
  return getPeerHosts()
}

/**
 * Clear the cached hosts configuration
 */
export function clearHostsCache(): void {
  cachedHosts = null
}

/**
 * Create example configuration file
 */
export function createExampleConfig(): HostsConfig {
  const selfId = getSelfHostId()
  // Get actual URL for self host - never localhost
  const selfHost = getSelfHost()
  return {
    hosts: [
      {
        id: selfId,
        name: selfId,
        url: selfHost.url,
        type: 'local',
        enabled: true,
        description: 'This machine',
      },
      {
        id: 'mac-mini',
        name: 'Mac Mini',
        url: 'http://100.80.12.6:23000',
        enabled: true,
        tailscale: true,
        tags: ['homelab', 'development'],
        description: 'Mac Mini via Tailscale VPN',
      },
      {
        id: 'cloud-server-1',
        name: 'Cloud Server 1',
        url: 'http://100.123.45.67:23000',
        enabled: false,
        tailscale: true,
        tags: ['cloud', 'production'],
        description: 'Cloud server for production workloads',
      },
    ],
  }
}

// ============================================================================
// HOST MANAGEMENT
// ============================================================================

/**
 * Save hosts configuration to file
 */
export function saveHosts(hosts: Host[]): { success: boolean; error?: string } {
  try {
    const configDir = path.dirname(HOSTS_CONFIG_PATH)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    const config: HostsConfig = { hosts }
    fs.writeFileSync(HOSTS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
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
 * Save hosts configuration with lock protection
 */
export async function saveHostsAsync(hosts: Host[]): Promise<{ success: boolean; error?: string }> {
  return withLock(() => saveHosts(hosts))
}

/**
 * Extract hostname/IP from a URL for duplicate detection
 */
function extractHostFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Check if two hosts are the same machine based on URL/IP
 * This prevents duplicate hosts when hostname changes but IP stays the same
 */
function isSameHost(host1: Host, host2: Host): boolean {
  // Same ID is obviously the same
  if (host1.id.toLowerCase() === host2.id.toLowerCase()) return true

  // Same URL is the same host
  if (host1.url && host2.url) {
    const url1 = host1.url.toLowerCase()
    const url2 = host2.url.toLowerCase()
    if (url1 === url2) return true

    // Same IP in URL is the same host
    const ip1 = extractHostFromUrl(host1.url)
    const ip2 = extractHostFromUrl(host2.url)
    if (ip1 && ip2 && ip1 === ip2) return true
  }

  // Check aliases overlap
  const aliases1 = new Set((host1.aliases || []).map(a => a.toLowerCase()))
  const aliases2 = host2.aliases || []
  for (const alias of aliases2) {
    if (aliases1.has(alias.toLowerCase())) return true
  }

  return false
}

/**
 * Add a new host
 * Includes duplicate detection by URL/IP to prevent same machine with different hostnames
 */
export function addHost(host: Host): { success: boolean; host?: Host; error?: string; existingHost?: Host } {
  try {
    const currentHosts = getHosts()

    // Check for duplicate by ID
    const existingById = currentHosts.find(h => h.id.toLowerCase() === host.id.toLowerCase())
    if (existingById) {
      return {
        success: false,
        error: `Host with ID '${host.id}' already exists`,
        existingHost: existingById,
      }
    }

    // Check for duplicate by URL/IP (prevents same machine with different hostname)
    const existingByUrl = currentHosts.find(h => isSameHost(h, host))
    if (existingByUrl) {
      console.warn(`[Hosts] Duplicate detected: '${host.id}' has same URL/IP as '${existingByUrl.id}'`)
      return {
        success: false,
        error: `Host '${host.id}' appears to be the same machine as '${existingByUrl.id}' (same URL: ${host.url}). Use the existing host or remove it first.`,
        existingHost: existingByUrl,
      }
    }

    const updatedHosts = [...currentHosts, host]
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
 * Add a new host with lock protection
 */
export async function addHostAsync(host: Host): Promise<{ success: boolean; host?: Host; error?: string }> {
  return withLock(() => addHost(host))
}

/**
 * Update an existing host
 */
export function updateHost(
  hostId: string,
  updates: Partial<Host>
): { success: boolean; host?: Host; error?: string } {
  try {
    const currentHosts = getHosts()

    const hostIndex = currentHosts.findIndex(h => h.id === hostId)
    if (hostIndex === -1) {
      return {
        success: false,
        error: `Host with ID '${hostId}' not found`,
      }
    }

    if (updates.id && updates.id !== hostId) {
      return {
        success: false,
        error: 'Cannot change host ID',
      }
    }

    // Prevent disabling self host
    const existingHost = currentHosts[hostIndex]
    if (isSelf(existingHost.id) && updates.enabled === false) {
      return {
        success: false,
        error: 'Cannot disable self host',
      }
    }

    const updatedHost = { ...existingHost, ...updates, id: hostId }
    const updatedHosts = [...currentHosts]
    updatedHosts[hostIndex] = updatedHost

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
 * Delete a host
 */
export function deleteHost(hostId: string): { success: boolean; error?: string } {
  try {
    const currentHosts = getHosts()

    const host = currentHosts.find(h => h.id === hostId)
    if (!host) {
      return {
        success: false,
        error: `Host with ID '${hostId}' not found`,
      }
    }

    // Prevent deleting self host
    if (isSelf(host.id)) {
      return {
        success: false,
        error: 'Cannot delete self host',
      }
    }

    const updatedHosts = currentHosts.filter(h => h.id !== hostId)
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

// ============================================================================
// ORGANIZATION MANAGEMENT
// ============================================================================

/**
 * Validation regex for organization name
 * Must be 1-63 characters, lowercase alphanumeric + hyphens
 * Must start with letter, cannot start/end with hyphen
 */
const ORGANIZATION_REGEX = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$|^[a-z]$/

/**
 * Validate organization name format
 */
export function isValidOrganizationName(name: string): boolean {
  return ORGANIZATION_REGEX.test(name)
}

/**
 * Get the current organization name from hosts config
 * Returns null if not set
 */
export function getOrganization(): string | null {
  try {
    if (!fs.existsSync(HOSTS_CONFIG_PATH)) {
      return null
    }
    const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
    const config = JSON.parse(fileContent) as HostsConfig
    return config.organization || null
  } catch (error) {
    console.error('[Hosts] Failed to read organization:', error)
    return null
  }
}

/**
 * Get full organization info (name, when set, who set it)
 */
export function getOrganizationInfo(): {
  organization: string | null
  setAt: string | null
  setBy: string | null
} {
  try {
    if (!fs.existsSync(HOSTS_CONFIG_PATH)) {
      return { organization: null, setAt: null, setBy: null }
    }
    const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
    const config = JSON.parse(fileContent) as HostsConfig
    return {
      organization: config.organization || null,
      setAt: config.organizationSetAt || null,
      setBy: config.organizationSetBy || null,
    }
  } catch (error) {
    console.error('[Hosts] Failed to read organization info:', error)
    return { organization: null, setAt: null, setBy: null }
  }
}

/**
 * Check if organization is set
 */
export function hasOrganization(): boolean {
  return getOrganization() !== null
}

/**
 * Set the organization name
 * Can only be set once - returns error if already set
 *
 * @param name - Organization name (1-63 chars, lowercase alphanumeric + hyphens)
 * @param setBy - Host ID that is setting the organization (optional, defaults to self)
 */
export function setOrganization(
  name: string,
  setBy?: string
): { success: boolean; error?: string } {
  try {
    // Validate name format
    if (!isValidOrganizationName(name)) {
      return {
        success: false,
        error: 'Invalid organization name. Must be 1-63 lowercase characters (letters, numbers, hyphens). Must start with a letter and cannot start/end with a hyphen.',
      }
    }

    // Read existing config
    let config: HostsConfig = { hosts: [] }
    if (fs.existsSync(HOSTS_CONFIG_PATH)) {
      const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
      config = JSON.parse(fileContent) as HostsConfig
    }

    // Check if already set
    if (config.organization) {
      return {
        success: false,
        error: `Organization already set to "${config.organization}". Cannot change organization name.`,
      }
    }

    // Set organization
    config.organization = name.toLowerCase()
    config.organizationSetAt = new Date().toISOString()
    config.organizationSetBy = setBy || getSelfHostId()

    // Ensure directory exists
    const configDir = path.dirname(HOSTS_CONFIG_PATH)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    // Save config
    fs.writeFileSync(HOSTS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
    clearHostsCache()

    console.log(`[Hosts] Organization set to "${name}" by ${config.organizationSetBy}`)
    return { success: true }
  } catch (error) {
    console.error('[Hosts] Failed to set organization:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set organization',
    }
  }
}

/**
 * Adopt organization from a peer during mesh sync
 * Only succeeds if local organization is NOT set
 *
 * @param organization - Organization name from peer
 * @param setAt - When the peer set it (ISO timestamp)
 * @param setBy - Which host originally set it
 */
export function adoptOrganization(
  organization: string,
  setAt: string,
  setBy: string
): { success: boolean; adopted: boolean; error?: string } {
  try {
    // Read existing config
    let config: HostsConfig = { hosts: [] }
    if (fs.existsSync(HOSTS_CONFIG_PATH)) {
      const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
      config = JSON.parse(fileContent) as HostsConfig
    }

    // If we already have an organization, check for conflict
    if (config.organization) {
      if (config.organization === organization) {
        // Same organization, nothing to do
        return { success: true, adopted: false }
      }
      // Different organization - this is a conflict
      return {
        success: false,
        adopted: false,
        error: `Organization mismatch: local is "${config.organization}", peer is "${organization}". Cannot join incompatible networks.`,
      }
    }

    // Adopt the peer's organization
    config.organization = organization.toLowerCase()
    config.organizationSetAt = setAt
    config.organizationSetBy = setBy

    // Ensure directory exists
    const configDir = path.dirname(HOSTS_CONFIG_PATH)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    // Save config
    fs.writeFileSync(HOSTS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
    clearHostsCache()

    console.log(`[Hosts] Adopted organization "${organization}" from ${setBy}`)
    return { success: true, adopted: true }
  } catch (error) {
    console.error('[Hosts] Failed to adopt organization:', error)
    return {
      success: false,
      adopted: false,
      error: error instanceof Error ? error.message : 'Failed to adopt organization',
    }
  }
}
