'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Host } from '@/types/host'
import { fetchFeedFromHosts } from '@/lib/mesh-fetch'
import type { ProjectView } from '@/types/project'

/** A project with the host that stores it (hostBase is how the browser reaches that host: '' for this one) */
export type MeshProject = ProjectView & { hostName: string; hostBase: string }

/** Every project on every host, one call per host. A host that is down is named, never silently empty. */
export function useProjects(hosts: Host[]) {
  const [projects, setProjects] = useState<MeshProject[]>([])
  const [unreachable, setUnreachable] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const key = hosts.map(h => `${h.id}|${h.url}|${h.enabled}`).join(',')

  const load = useCallback(async () => {
    // This host once (its own projects and the peers' copies from /mesh); a host not on the mesh directly
    const answers = await fetchFeedFromHosts<{ projects?: ProjectView[] }>(hosts, 'projects', '/api/projects')
    const results = answers.map(({ host, base, ok, data }) => ({
      ok, host, mine: ((data?.projects || []) as ProjectView[]).map(p => ({ ...p, hostName: host.name || host.id, hostBase: base })) as MeshProject[],
    }))
    setProjects(results.flatMap(r => r.mine))
    setUnreachable(results.filter(r => !r.ok).map(r => r.host.name || r.host.id))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    load()
    const timer = setInterval(load, 15_000)
    return () => clearInterval(timer)
  }, [load])

  return useMemo(() => ({ projects, unreachable, loading, refresh: load }), [projects, unreachable, loading, load])
}
