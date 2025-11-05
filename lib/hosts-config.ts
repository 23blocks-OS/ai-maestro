/**
 * Host Configuration Manager
 *
 * Loads and manages remote worker host configurations for the Manager/Worker pattern.
 * Supports configuration via environment variables or JSON file.
 */

import { Host, HostsConfig, LOCAL_HOST } from '@/types/host'
import fs from 'fs'
import path from 'path'

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
    hosts = [LOCAL_HOST]
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
    validHosts.unshift(LOCAL_HOST)
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
  return localHost || LOCAL_HOST
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
