/**
 * Client-side caching for remote agents
 *
 * Provides hybrid caching: always try live fetch first,
 * fall back to cached data when remote is unreachable.
 */

import type { UnifiedAgent } from '@/types/agent'

const CACHE_KEY = 'aimaestro-remote-agents'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

interface CachedHostAgents {
  hostId: string
  agents: UnifiedAgent[]
  timestamp: number
}

interface AgentCache {
  hosts: CachedHostAgents[]
}

/**
 * Get the full cache from localStorage
 */
function getCache(): AgentCache {
  if (typeof window === 'undefined') {
    return { hosts: [] }
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) {
      return { hosts: [] }
    }
    return JSON.parse(cached) as AgentCache
  } catch (error) {
    console.error('[AgentCache] Failed to parse cache:', error)
    return { hosts: [] }
  }
}

/**
 * Save the cache to localStorage
 */
function setCache(cache: AgentCache): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (error) {
    console.error('[AgentCache] Failed to save cache:', error)
  }
}

/**
 * Cache agents from a specific host
 */
export function cacheRemoteAgents(hostId: string, agents: UnifiedAgent[]): void {
  const cache = getCache()

  // Remove existing entry for this host
  const filtered = cache.hosts.filter(h => h.hostId !== hostId)

  // Add new entry
  filtered.push({
    hostId,
    agents,
    timestamp: Date.now()
  })

  setCache({ hosts: filtered })

  console.log(`[AgentCache] Cached ${agents.length} agent(s) for host ${hostId}`)
}

/**
 * Get cached agents for a specific host
 * Returns null if no cache exists or cache is expired
 */
export function getCachedAgents(hostId: string): UnifiedAgent[] | null {
  const cache = getCache()

  const entry = cache.hosts.find(h => h.hostId === hostId)
  if (!entry) {
    return null
  }

  // Check if cache is expired
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    console.log(`[AgentCache] Cache expired for host ${hostId}`)
    return null
  }

  // Mark agents as cached
  const cachedAgents = entry.agents.map(agent => ({
    ...agent,
    _cached: true
  }))

  console.log(`[AgentCache] Returning ${cachedAgents.length} cached agent(s) for host ${hostId}`)

  return cachedAgents
}

/**
 * Get cache age for a specific host in milliseconds
 * Returns null if no cache exists
 */
export function getCacheAge(hostId: string): number | null {
  const cache = getCache()

  const entry = cache.hosts.find(h => h.hostId === hostId)
  if (!entry) {
    return null
  }

  return Date.now() - entry.timestamp
}

/**
 * Clear cache for a specific host or all hosts
 */
export function clearAgentCache(hostId?: string): void {
  if (hostId) {
    const cache = getCache()
    const filtered = cache.hosts.filter(h => h.hostId !== hostId)
    setCache({ hosts: filtered })
    console.log(`[AgentCache] Cleared cache for host ${hostId}`)
  } else {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CACHE_KEY)
    }
    console.log('[AgentCache] Cleared all cache')
  }
}

/**
 * Check if cache exists for a host and is still valid
 */
export function hasCachedAgents(hostId: string): boolean {
  const cache = getCache()
  const entry = cache.hosts.find(h => h.hostId === hostId)

  if (!entry) {
    return false
  }

  return Date.now() - entry.timestamp <= CACHE_TTL
}

/**
 * Format cache age for display
 */
export function formatCacheAge(hostId: string): string | null {
  const age = getCacheAge(hostId)
  if (age === null) {
    return null
  }

  const minutes = Math.floor(age / 60000)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ago`
  }
  if (minutes > 0) {
    return `${minutes}m ago`
  }
  return 'just now'
}
