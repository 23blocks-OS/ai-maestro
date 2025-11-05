/**
 * Host Configuration Manager (Server ESM Version)
 *
 * Server-side ESM version of hosts configuration for use in server.mjs
 */

import fs from 'fs'
import path from 'path'

const HOSTS_ENV_VAR = 'AIMAESTRO_HOSTS'
const HOSTS_CONFIG_PATH = path.join(process.cwd(), '.aimaestro', 'hosts.json')

const LOCAL_HOST = {
  id: 'local',
  name: 'Local',
  url: 'http://localhost:23000',
  type: 'local',
  enabled: true,
}

let cachedHosts = null

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

  // Default to local only
  if (hosts.length === 0) {
    hosts = [LOCAL_HOST]
    console.log('[Hosts] No configuration found, using local host only')
  }

  cachedHosts = hosts
  return hosts
}

/**
 * Validate hosts configuration
 */
function validateHosts(hosts) {
  const enabledHosts = hosts.filter(host => host.enabled !== false)

  const validHosts = enabledHosts.filter(host => {
    if (!host.id || !host.name || !host.url || !host.type) {
      console.warn(`[Hosts] Skipping invalid host config:`, host)
      return false
    }
    return true
  })

  const hasLocalHost = validHosts.some(host => host.type === 'local')
  if (!hasLocalHost) {
    validHosts.unshift(LOCAL_HOST)
    console.log('[Hosts] Added default local host')
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
  return hosts.find(host => host.id === hostId)
}

/**
 * Get local host
 */
export function getLocalHost() {
  const hosts = getHosts()
  return hosts.find(host => host.type === 'local') || LOCAL_HOST
}

/**
 * Clear cache
 */
export function clearHostsCache() {
  cachedHosts = null
}
