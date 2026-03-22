'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { AgentLocalConfig } from '@/types/agent-local-config'

const POLL_INTERVAL_MS = 4000

/**
 * Polls GET /api/agents/{id}/local-config every 4 seconds.
 * Returns the latest scanned local configuration for the agent's .claude/ directory.
 */
export function useAgentLocalConfig(agentId: string | null) {
  const [config, setConfig] = useState<AgentLocalConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const prevJsonRef = useRef<string>('')

  const fetchConfig = useCallback(async () => {
    if (!agentId) return
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/local-config`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `HTTP ${res.status}`)
        return
      }
      const data: AgentLocalConfig = await res.json()
      // Diff-based update: only re-render if data actually changed
      const json = JSON.stringify(data)
      if (json !== prevJsonRef.current) {
        prevJsonRef.current = json
        setConfig(data)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch local config')
    }
  }, [agentId])

  useEffect(() => {
    if (!agentId) {
      setConfig(null)
      setError(null)
      prevJsonRef.current = ''
      return
    }

    setLoading(true)
    fetchConfig().finally(() => setLoading(false))

    const interval = setInterval(fetchConfig, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [agentId, fetchConfig])

  return { config, error, loading, refetch: fetchConfig }
}
