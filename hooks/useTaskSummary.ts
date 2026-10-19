'use client'

import { useState, useEffect } from 'react'
import { isSelfHost } from '@/lib/host-kind'
import type { Host } from '@/types/host'

export interface TaskCounts { open: number; waiting: number; waitingOnJuan: number }

/**
 * Open cards per agent across every host: ONE call per host (not one per agent), every 30 s.
 * Each host answers for the agents it holds; an unreachable host just contributes nothing.
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
      if (!cancelled) setCounts(Object.assign({}, ...results))
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return counts
}
