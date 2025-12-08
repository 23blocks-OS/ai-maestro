'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { UnifiedAgent } from '@/types/agent'

const REFRESH_INTERVAL = 10000 // 10 seconds

interface UnifiedAgentsResponse {
  agents: UnifiedAgent[]
  stats: {
    total: number
    online: number
    offline: number
    orphans: number
    newlyRegistered: number
  }
}

/**
 * Fetch unified agents from the API
 */
async function fetchUnifiedAgents(): Promise<UnifiedAgentsResponse> {
  const response = await fetch('/api/agents/unified')
  if (!response.ok) {
    throw new Error(`Failed to fetch agents: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Hook to manage unified agents state
 * Provides agents with their session status merged
 */
export function useAgents() {
  const [agents, setAgents] = useState<UnifiedAgent[]>([])
  const [stats, setStats] = useState<UnifiedAgentsResponse['stats'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadAgents = useCallback(async () => {
    try {
      // Don't set loading to true on refresh to avoid UI flicker
      setError(null)
      const data = await fetchUnifiedAgents()
      setAgents(data.agents)
      setStats(data.stats)
    } catch (err) {
      console.error('Failed to load agents:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshAgents = useCallback(() => {
    loadAgents()
  }, [loadAgents])

  // Initial load
  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      loadAgents()
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [loadAgents])

  // Computed: agents that are currently online (have active session)
  const onlineAgents = useMemo(
    () => agents.filter(a => a.session.status === 'online'),
    [agents]
  )

  // Computed: agents that are offline
  const offlineAgents = useMemo(
    () => agents.filter(a => a.session.status === 'offline'),
    [agents]
  )

  // Computed: orphan agents (auto-registered from sessions)
  const orphanAgents = useMemo(
    () => agents.filter(a => a.isOrphan),
    [agents]
  )

  // Computed: group agents by first tag (level 1 grouping)
  const agentsByGroup = useMemo(() => {
    const groups: Record<string, UnifiedAgent[]> = {}

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
        if (a.session.status === 'online' && b.session.status !== 'online') return -1
        if (a.session.status !== 'online' && b.session.status === 'online') return 1
        return a.alias.localeCompare(b.alias)
      })
    }

    return groups
  }, [agents])

  // Find agent by ID
  const getAgent = useCallback(
    (id: string) => agents.find(a => a.id === id) || null,
    [agents]
  )

  // Find agent by session name
  const getAgentBySession = useCallback(
    (sessionName: string) => agents.find(a => a.session.tmuxSessionName === sessionName) || null,
    [agents]
  )

  return {
    // Data
    agents,
    stats,
    loading,
    error,

    // Computed lists
    onlineAgents,
    offlineAgents,
    orphanAgents,
    agentsByGroup,

    // Methods
    refreshAgents,
    getAgent,
    getAgentBySession,
  }
}
