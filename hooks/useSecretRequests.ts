'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface SecretRequestItem {
  id: string
  name: string
  note: string | null
  createdAt: number
}

/**
 * The credentials an agent is waiting for (F033): names and notes only, never a value.
 * Polled every few seconds while the chat is on screen and the tab is visible. The server
 * forwards to the agent's own host, so this works for agents on other machines too.
 */
export function useSecretRequests(agentId: string | undefined, enabled = true, intervalMs = 3000) {
  const [requests, setRequests] = useState<SecretRequestItem[]>([])
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    if (!agentId) return
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/secret-requests`, { cache: 'no-store' })
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
