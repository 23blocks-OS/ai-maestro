'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SqlWriteRequestView } from '@/lib/sql-write-requests'

export type SqlWriteRequestItem = SqlWriteRequestView

/**
 * The SQL write requests an agent is waiting on (F037), read from the agentic-sql wrapper's request
 * files on the agent's host. Polled every few seconds while the chat is on screen and the tab is visible.
 */
export function useSqlWriteRequests(agentId: string | undefined, enabled = true, intervalMs = 3000) {
  const [requests, setRequests] = useState<SqlWriteRequestItem[]>([])
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    if (!agentId) return
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/sql-write-requests`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (alive.current) setRequests(Array.isArray(data?.requests) ? data.requests : [])
    } catch {
      /* the host is unreachable; keep what we show */
    }
  }, [agentId])

  useEffect(() => {
    alive.current = true
    if (!enabled || !agentId) {
      setRequests([])
      return () => { alive.current = false }
    }
    void refresh()
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void refresh()
    }, intervalMs)
    return () => {
      alive.current = false
      clearInterval(timer)
    }
  }, [agentId, enabled, intervalMs, refresh])

  return { requests, refresh }
}
