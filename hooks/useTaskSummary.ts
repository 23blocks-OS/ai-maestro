'use client'

import { useState, useEffect } from 'react'
import { isSelfHost } from '@/lib/host-kind'
import type { Host } from '@/types/host'

export interface TaskCounts { open: number; waiting: number; waitingOnJuan: number }

/**
 * Open cards per agent across every host: ONE call per host (not one per agent), every 30 s.
 * Each host answers for the cards it holds (an agent's own and team cards, and the project cards it stores);
 * an unreachable host just contributes nothing.
 */
export function useTaskSummary(hosts: Host[]): Record<string, TaskCounts> {
  const [counts, setCounts] = useState<Record<string, TaskCounts>>({})
  const key = hosts.map(h => `${h.id}|${h.url}|${h.enabled}`).join(',')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const targets = hosts.length > 0 ? hosts.filter(h => h.enabled !== false) : []
      const urls = targets.length > 0
        ? targets.map(h => (isSelfHost(h) ? '' : h.url.replace(/\/$/, '')))
        : ['']
      const results = await Promise.all(urls.map(async base => {
        try {
          const res = await fetch(`${base}/api/tasks/summary`, { signal: AbortSignal.timeout(5000) })
          if (!res.ok) return {}
          const data = await res.json()
          return (data.agents || {}) as Record<string, TaskCounts>
        } catch {
          return {}
        }
      }))
      if (cancelled) return
      // A project card is counted by the host that stores the project, for an agent that may live on another host:
      // the same agent can appear in several answers, so add them up instead of letting one overwrite the other
      const total: Record<string, TaskCounts> = {}
      for (const answer of results) {
        for (const [agentId, c] of Object.entries(answer)) {
          const t = (total[agentId] ||= { open: 0, waiting: 0, waitingOnJuan: 0 })
          t.open += c.open; t.waiting += c.waiting; t.waitingOnJuan += c.waitingOnJuan
        }
      }
      setCounts(total)
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return counts
}
