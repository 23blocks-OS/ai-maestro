'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Host } from '@/types/host'
import { fetchFeedFromHosts } from '@/lib/mesh-fetch'
import type { TaskWithDeps } from '@/types/task'

/** An open card with the host that holds it and the agent it is for */
export type MeshCard = TaskWithDeps & { agentId: string; agentName: string; hostId: string; hostName: string; hostBase: string }

/**
 * Every open card on every host, one call per host (GET /api/tasks), every 15 s. A host that is
 * down contributes nothing and is named in `unreachable`, so an empty list is never mistaken for "no work".
 */
export function useOpenTasks(hosts: Host[]) {
  const [cards, setCards] = useState<MeshCard[]>([])
  const [unreachable, setUnreachable] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const key = hosts.map(h => `${h.id}|${h.url}|${h.enabled}`).join(',')

  const load = useCallback(async () => {
    // With no host list yet (or none at all) ask this host, as the agent list does: never wait forever
    const answers = await fetchFeedFromHosts<{ cards?: Array<TaskWithDeps & { agentId: string; agentName: string }> }>(hosts, 'tasks', '/api/tasks')
    const results = answers.map(({ host, base, ok, data }) => ({
      ok, host, mine: (data?.cards || []).map(c => ({ ...c, hostId: host.id, hostName: host.name || host.id, hostBase: base })) as MeshCard[],
    }))
    setCards(results.flatMap(r => r.mine))
    setUnreachable(results.filter(r => !r.ok).map(r => r.host.name || r.host.id))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    load()
    const timer = setInterval(load, 15_000)
    return () => clearInterval(timer)
  }, [load])

  return useMemo(() => ({ cards, unreachable, loading, refresh: load }), [cards, unreachable, loading, load])
}
