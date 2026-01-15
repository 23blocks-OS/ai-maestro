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
const HOSTS_CONFIG_PATH = path.join(process.cwd(), '.aimaestro', 'hosts.json')

/**
 * Get this machine's hostname - the canonical host ID
 */
export function getSelfHostId() {
  return os.hostname()
}

/**
 * Check if a hostId refers to this machine
 */
export function isSelf(hostId) {
  if (!hostId) return false
  const selfId = getSelfHostId()
  // Case-insensitive comparison, also handle legacy 'local' value
  return hostId.toLowerCase() === selfId.toLowerCase() ||
         hostId === 'local'  // DEPRECATED: backward compat
}

/**
 * Get the default host configuration for this machine
 */
function getDefaultSelfHost() {
  const hostname = getSelfHostId()
  return {
    id: hostname,  // NOT 'local' - use actual hostname
    name: hostname,
    url: 'http://localhost:23000',
    enabled: true,
    description: 'This machine',
  }
}

let cachedHosts = null

/**
 * Migrate legacy host config (convert id:'local' to hostname)
 */
function migrateHost(host) {
  // Migrate id:'local' to actual hostname
  if (host.id === 'local') {
    const selfId = getSelfHostId()
    return {
      ...host,
      id: selfId,
      name: host.name || selfId,
    }
  }
  return host
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
