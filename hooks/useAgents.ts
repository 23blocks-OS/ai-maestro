'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Agent, AgentsApiResponse, AgentStats, AgentHostInfo } from '@/types/agent'
import type { Host } from '@/types/host'
import { useHosts } from './useHosts'
import { cacheRemoteAgents, getCachedAgents } from '@/lib/agent-cache'

const REFRESH_INTERVAL = 10000 // 10 seconds
const LOCAL_FETCH_TIMEOUT = 8000 // 8 seconds for local host (tmux queries can be slow)
const REMOTE_FETCH_TIMEOUT = 15000 // 15 seconds for remote hosts (network latency + tmux)

/**
 * Aggregated stats across all hosts
 */
interface AggregatedStats {
  total: number
  online: number
  offline: number
  orphans: number
  newlyRegistered: number
  cached: number // Number of agents loaded from cache
}

/**
 * Host fetch result
 */
interface HostFetchResult {
  hostId: string
  success: boolean
  response?: AgentsApiResponse
  error?: Error
  fromCache?: boolean
}

/**
 * Fetch agents from a specific host
 */
async function fetchHostAgents(host: Host): Promise<HostFetchResult> {
  const baseUrl = host.type === 'local' ? '' : host.url
  const timeout = host.type === 'local' ? LOCAL_FETCH_TIMEOUT : REMOTE_FETCH_TIMEOUT

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(`${baseUrl}/api/agents`, {
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data: AgentsApiResponse = await response.json()

    // Inject host info directly onto agents (for remote hosts, ensure correct hostId/hostName/hostUrl)
    const agents = data.agents.map(agent => ({
      ...agent,
      hostId: host.id,
      hostName: host.name,
      hostUrl: host.url
    }))

    // Cache remote host agents for offline access
    if (host.type === 'remote') {
      cacheRemoteAgents(host.id, agents)
    }

    return {
      hostId: host.id,
      success: true,
      response: {
        ...data,
        agents,
        hostInfo: {
          ...data.hostInfo,
          id: host.id,
          name: host.name,
          type: host.type
        }
      }
    }
  } catch (error) {
    console.error(`[useAgents] Failed to fetch from ${host.name} (${host.url}):`, error)

    // Try to use cached data for remote hosts
    if (host.type === 'remote') {
      const cachedAgents = getCachedAgents(host.id)
      if (cachedAgents && cachedAgents.length > 0) {
        console.log(`[useAgents] Using cached data for ${host.name}`)
        return {
          hostId: host.id,
          success: true,
          fromCache: true,
          response: {
            agents: cachedAgents,
            stats: {
              total: cachedAgents.length,
              online: cachedAgents.filter(a => a.session?.status === 'online').length,
              offline: cachedAgents.filter(a => a.session?.status === 'offline').length,
              orphans: cachedAgents.filter(a => a.isOrphan).length,
              newlyRegistered: 0
            },
            hostInfo: {
              id: host.id,
              name: host.name,
              url: host.url,
              type: 'remote'
            }
          }
        }
      }
    }

    return {
      hostId: host.id,
      success: false,
      error: error instanceof Error ? error : new Error('Unknown error')
    }
  }
}

/**
 * Aggregate results from multiple hosts
 */
function aggregateResults(results: HostFetchResult[]): {
  agents: Agent[]
  stats: AggregatedStats
  hostErrors: Record<string, Error>
} {
  const allAgents: Agent[] = []
  const hostErrors: Record<string, Error> = {}
  let cachedCount = 0

  for (const result of results) {
    if (result.success && result.response) {
      allAgents.push(...result.response.agents)
      if (result.fromCache) {
        cachedCount += result.response.agents.length
      }
    } else if (result.error) {
      hostErrors[result.hostId] = result.error
    }
  }

  // Sort: online first, then alphabetically by alias
  allAgents.sort((a, b) => {
    // Online first
    if (a.session?.status === 'online' && b.session?.status !== 'online') return -1
    if (a.session?.status !== 'online' && b.session?.status === 'online') return 1

    // Then alphabetically by alias (case-insensitive)
    return a.alias.toLowerCase().localeCompare(b.alias.toLowerCase())
  })

  const stats: AggregatedStats = {
    total: allAgents.length,
    online: allAgents.filter(a => a.session?.status === 'online').length,
    offline: allAgents.filter(a => a.session?.status === 'offline').length,
    orphans: allAgents.filter(a => a.isOrphan).length,
    newlyRegistered: results.reduce((sum, r) =>
      sum + (r.response?.stats.newlyRegistered || 0), 0),
    cached: cachedCount
  }

  return { agents: allAgents, stats, hostErrors }
}

/**
 * Hook to manage agents across multiple hosts
 *
 * Fetches agents from all configured hosts (local + remote) and aggregates them.
 * Supports hybrid caching: always tries live fetch first, falls back to cache for unreachable remotes.
 */
export function useAgents() {
  const { hosts, loading: hostsLoading } = useHosts()
  const [agents, setAgents] = useState<Agent[]>([])
  const [stats, setStats] = useState<AggregatedStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [hostErrors, setHostErrors] = useState<Record<string, Error>>({})

  const loadAgents = useCallback(async () => {
    if (hosts.length === 0) {
      return
    }

    try {
      setError(null)

      // Fetch from all hosts in parallel
      const results = await Promise.all(
        hosts.map(host => fetchHostAgents(host))
      )

      // Aggregate results
      const { agents: allAgents, stats: aggregatedStats, hostErrors: errors } = aggregateResults(results)

      setAgents(allAgents)
      setStats(aggregatedStats)
      setHostErrors(errors)

      // Log summary
      const successCount = results.filter(r => r.success).length
      const fromCacheCount = results.filter(r => r.fromCache).length
      console.log(`[useAgents] Loaded ${allAgents.length} agent(s) from ${successCount}/${hosts.length} host(s) (${fromCacheCount} from cache)`)

    } catch (err) {
      console.error('[useAgents] Failed to load agents:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [hosts])

  const refreshAgents = useCallback(() => {
    loadAgents()
  }, [loadAgents])

  // Initial load when hosts are ready
  useEffect(() => {
    if (!hostsLoading && hosts.length > 0) {
      loadAgents()
    }
  }, [hostsLoading, hosts.length, loadAgents])

  // Auto-refresh
  useEffect(() => {
    if (hostsLoading || hosts.length === 0) {
      return
    }

    const interval = setInterval(() => {
      loadAgents()
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [hostsLoading, hosts.length, loadAgents])

  // Computed: agents that are currently online (have active session)
  const onlineAgents = useMemo(
    () => agents.filter(a => a.session?.status === 'online'),
    [agents]
  )

  // Computed: agents that are offline
  const offlineAgents = useMemo(
    () => agents.filter(a => a.session?.status === 'offline'),
    [agents]
  )

  // Computed: orphan agents (auto-registered from sessions)
  const orphanAgents = useMemo(
    () => agents.filter(a => a.isOrphan),
    [agents]
  )

  // Computed: cached agents (loaded from cache because remote was unreachable)
  const cachedAgents = useMemo(
    () => agents.filter(a => a._cached),
    [agents]
  )

  // Computed: group agents by first tag (level 1 grouping)
  const agentsByGroup = useMemo(() => {
    const groups: Record<string, Agent[]> = {}

    for (const agent of agents) {
      const group = agent.tags?.[0] || 'ungrouped'
      if (!groups[group]) {
        groups[group] = []
      }
      groups[group].push(agent)
    }

    // Sort agents within each group by status (online first), then by alias
    for (const group in groups) {
      groups[group].sort((a, b) => {
        if (a.session?.status === 'online' && b.session?.status !== 'online') return -1
        if (a.session?.status !== 'online' && b.session?.status === 'online') return 1
        return a.alias.localeCompare(b.alias)
      })
    }

    return groups
  }, [agents])

  // Computed: group agents by host
  const agentsByHost = useMemo(() => {
    const byHost: Record<string, Agent[]> = {}

    for (const agent of agents) {
      const hostId = agent.hostId || 'local'
      if (!byHost[hostId]) {
        byHost[hostId] = []
      }
      byHost[hostId].push(agent)
    }

    return byHost
  }, [agents])

  // Find agent by ID
  const getAgent = useCallback(
    (id: string) => agents.find(a => a.id === id) || null,
    [agents]
  )

  // Find agent by session name
  const getAgentBySession = useCallback(
    (sessionName: string) => agents.find(a => a.session?.tmuxSessionName === sessionName) || null,
    [agents]
  )

  // Check if any hosts had errors
  const hasHostErrors = useMemo(
    () => Object.keys(hostErrors).length > 0,
    [hostErrors]
  )

  return {
    // Data
    agents,
    stats,
    loading: loading || hostsLoading,
    error,
    hostErrors,
    hasHostErrors,

    // Computed lists
    onlineAgents,
    offlineAgents,
    orphanAgents,
    cachedAgents,
    agentsByGroup,
    agentsByHost,

    // Methods
    refreshAgents,
    getAgent,
    getAgentBySession,
  }
}
