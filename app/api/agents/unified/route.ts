import { NextResponse } from 'next/server'
import { getHosts, getSelfHost, isSelf } from '@/lib/hosts-config'
import type { Agent, AgentStats } from '@/types/agent'
import type { Host } from '@/types/host'

/**
 * Unified Agents API
 *
 * Aggregates agents from all known hosts.
 * Fetches from each host's API and merges results.
 *
 * Query params:
 *   - q: Search query (optional)
 *   - includeOffline: Include agents from hosts that failed to respond (default: true)
 *   - timeout: Timeout in ms for host requests (default: 5000)
 */

interface HostAgentResponse {
  agents: Agent[]
  stats: AgentStats
  hostInfo: {
    id: string
    name: string
    url: string
  }
}

interface UnifiedAgentResult {
  agent: Agent
  sourceHost: {
    id: string
    name: string
    url: string
  }
  qualifiedName: string // agent@host format
}

interface HostFetchResult {
  host: Host
  success: boolean
  agents: Agent[]
  stats: AgentStats | null
  error?: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  const includeOffline = searchParams.get('includeOffline') !== 'false'
  const timeout = parseInt(searchParams.get('timeout') || '3000', 10)

  const hosts = getHosts()
  const selfHost = getSelfHost()

  // Fetch agents from all hosts in parallel
  const fetchPromises: Promise<HostFetchResult>[] = hosts.map(async (host) => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      let url = `${host.url}/api/agents`
      if (query) {
        url += `?q=${encodeURIComponent(query)}`
      }

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return {
          host,
          success: false,
          agents: [],
          stats: null,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const data: HostAgentResponse = await response.json()

      return {
        host,
        success: true,
        agents: data.agents || [],
        stats: data.stats || null,
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.name === 'AbortError' ? 'Request timeout' : error.message
        : 'Unknown error'

      return {
        host,
        success: false,
        agents: [],
        stats: null,
        error: errorMessage,
      }
    }
  })

  const results = await Promise.all(fetchPromises)

  // Aggregate agents with host context
  const unifiedAgents: UnifiedAgentResult[] = []
  const aggregatedStats: AgentStats = {
    total: 0,
    online: 0,
    offline: 0,
    orphans: 0,
    newlyRegistered: 0,
  }

  const hostResults: Array<{
    host: { id: string; name: string; url: string; isSelf: boolean }
    success: boolean
    agentCount: number
    error?: string
  }> = []

  for (const result of results) {
    hostResults.push({
      host: {
        id: result.host.id,
        name: result.host.name || result.host.id,
        url: result.host.url,
        isSelf: isSelf(result.host.id),
      },
      success: result.success,
      agentCount: result.agents.length,
      error: result.error,
    })

    if (!result.success && !includeOffline) {
      continue
    }

    // Add agents with host context
    for (const agent of result.agents) {
      // Create qualified name: agent@host
      const agentName = agent.name || agent.alias || agent.id
      const qualifiedName = `${agentName}@${result.host.id}`

      unifiedAgents.push({
        agent: {
          ...agent,
          hostId: result.host.id,
          hostName: result.host.name || result.host.id,
          hostUrl: result.host.url,
        },
        sourceHost: {
          id: result.host.id,
          name: result.host.name || result.host.id,
          url: result.host.url,
        },
        qualifiedName,
      })
    }

    // Aggregate stats
    if (result.stats) {
      aggregatedStats.total += result.stats.total
      aggregatedStats.online += result.stats.online
      aggregatedStats.offline += result.stats.offline
      aggregatedStats.orphans += result.stats.orphans
      aggregatedStats.newlyRegistered += result.stats.newlyRegistered
    }
  }

  // Sort agents: online first, then by name
  unifiedAgents.sort((a, b) => {
    const aOnline = a.agent.status === 'active' ? 1 : 0
    const bOnline = b.agent.status === 'active' ? 1 : 0
    if (aOnline !== bOnline) return bOnline - aOnline
    return a.qualifiedName.localeCompare(b.qualifiedName)
  })

  return NextResponse.json({
    agents: unifiedAgents,
    stats: aggregatedStats,
    hosts: hostResults,
    selfHost: {
      id: selfHost.id,
      name: selfHost.name,
      url: selfHost.url,
    },
    totalHosts: hosts.length,
    successfulHosts: results.filter(r => r.success).length,
  })
}
