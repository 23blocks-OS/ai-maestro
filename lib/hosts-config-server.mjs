/**
 * Host Configuration Manager (Server ESM Version)
 *
 * Server-side ESM version of hosts configuration for use in server.mjs
 *
 * In a mesh network, every host is identified by its hostname.
 * There is no "local" vs "remote" - just hosts with URLs.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

const HOSTS_ENV_VAR = 'AIMAESTRO_HOSTS'
// Use user's home directory for hosts.json - shared across all projects
const HOSTS_CONFIG_PATH = path.join(os.homedir(), '.aimaestro', 'hosts.json')

/**
 * Get this machine's hostname - the canonical host ID
 * Always returns lowercase for case-insensitive consistency
 * Strips .local suffix (macOS Bonjour/mDNS) for cross-platform consistency
 */
export function getSelfHostId() {
  return os.hostname().toLowerCase().replace(/\.local$/, '')
}

/**
 * Get all local IP addresses for this machine
 * Returns IPs from all network interfaces (excluding loopback)
 */
export function getLocalIPs() {
  const interfaces = os.networkInterfaces()
  const ips = []

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
export function getPreferredIP() {
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
export function getSelfAliases() {
  const hostname = getSelfHostId() // Already lowercase
  const ips = getLocalIPs().map(i => i.ip)

  // Include hostname variations and all IPs (all lowercase)
  const aliases = new Set([
    hostname,
    ...ips,
    // Also include URL forms for matching
    ...ips.map(ip => `http://${ip}:23000`),
  ])

  return Array.from(aliases)
}

/**
 * Check if a hostId refers to this machine
 * Checks against hostname and all known IPs/aliases
 */
export function isSelf(hostId) {
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
function getDefaultSelfHost() {
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

let cachedHosts = null

/**
 * Migrate and normalize host config
 * - Convert id:'local' to hostname
 * - Normalize host ID to lowercase
 */
function migrateHost(host) {
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
 * Load hosts configuration
 */
export function loadHostsConfig() {
  if (cachedHosts !== null) {
    return cachedHosts
  }

  let hosts = []

  // Try environment variable first
  const envHosts = process.env[HOSTS_ENV_VAR]
  if (envHosts) {
    try {
      const parsed = JSON.parse(envHosts)
      hosts = validateHosts(parsed)
      console.log(`[Hosts] Loaded ${hosts.length} host(s) from ${HOSTS_ENV_VAR} environment variable`)
    } catch (error) {
      console.error(`[Hosts] Failed to parse ${HOSTS_ENV_VAR}:`, error)
    }
  }

  // Try config file
  if (hosts.length === 0 && fs.existsSync(HOSTS_CONFIG_PATH)) {
    try {
      const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
      const config = JSON.parse(fileContent)
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
 * Validate and migrate hosts configuration
 */
function validateHosts(hosts) {
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

/**
 * Get all hosts
 */
export function getHosts() {
  return loadHostsConfig()
}

/**
 * Get host by ID
 */
export function getHostById(hostId) {
  const hosts = getHosts()
  // Also check for legacy 'local' ID
  if (hostId === 'local') {
    return hosts.find(host => isSelf(host.id))
  }
  return hosts.find(host =>
    host.id === hostId ||
    host.id.toLowerCase() === hostId.toLowerCase()
  )
}

/**
 * Get this machine's host configuration
 */
export function getSelfHost() {
  const hosts = getHosts()
  const selfHost = hosts.find(host => isSelf(host.id))
  return selfHost || getDefaultSelfHost()
}

/**
 * Get all peer hosts (hosts that are not this machine)
 */
export function getPeerHosts() {
  const hosts = getHosts()
  return hosts.filter(host => !isSelf(host.id))
}

// DEPRECATED: Use getSelfHost() instead
export function getLocalHost() {
  return getSelfHost()
}

// DEPRECATED: Use getPeerHosts() instead
export function getRemoteHosts() {
  return getPeerHosts()
}

/**
 * Clear cache
 */
export function clearHostsCache() {
  cachedHosts = null
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
export function isValidOrganizationName(name) {
  return ORGANIZATION_REGEX.test(name)
}

/**
 * Get the current organization name from hosts config
 * Returns null if not set
 */
export function getOrganization() {
  try {
    if (!fs.existsSync(HOSTS_CONFIG_PATH)) {
      return null
    }
    const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
    const config = JSON.parse(fileContent)
    return config.organization || null
  } catch (error) {
    console.error('[Hosts] Failed to read organization:', error)
    return null
  }
}

/**
 * Get full organization info (name, when set, who set it)
 */
export function getOrganizationInfo() {
  try {
    if (!fs.existsSync(HOSTS_CONFIG_PATH)) {
      return { organization: null, setAt: null, setBy: null }
    }
    const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
    const config = JSON.parse(fileContent)
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
export function hasOrganization() {
  return getOrganization() !== null
}

/**
 * Set the organization name
 * Can only be set once - returns error if already set
 *
 * @param {string} name - Organization name (1-63 chars, lowercase alphanumeric + hyphens)
 * @param {string} [setBy] - Host ID that is setting the organization (optional, defaults to self)
 */
export function setOrganization(name, setBy) {
  try {
    // Validate name format
    if (!isValidOrganizationName(name)) {
      return {
        success: false,
        error: 'Invalid organization name. Must be 1-63 lowercase characters (letters, numbers, hyphens). Must start with a letter and cannot start/end with a hyphen.',
      }
    }

    // Read existing config
    let config = { hosts: [] }
    if (fs.existsSync(HOSTS_CONFIG_PATH)) {
      const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
      config = JSON.parse(fileContent)
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
 * @param {string} organization - Organization name from peer
 * @param {string} setAt - When the peer set it (ISO timestamp)
 * @param {string} setBy - Which host originally set it
 */
export function adoptOrganization(organization, setAt, setBy) {
  try {
    // Read existing config
    let config = { hosts: [] }
    if (fs.existsSync(HOSTS_CONFIG_PATH)) {
      const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
      config = JSON.parse(fileContent)
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
