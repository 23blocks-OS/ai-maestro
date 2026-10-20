'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { isSelfHost } from '@/lib/host-kind'
import type { Host } from '@/types/host'
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
    const targets: Host[] = hosts.length > 0
      ? hosts.filter(h => h.enabled !== false)
      : [{ id: 'local', name: 'This host', url: '', isSelf: true } as Host]
    const results = await Promise.all(targets.map(async host => {
      const base = isSelfHost(host) ? '' : host.url.replace(/\/$/, '')
      try {
        const res = await fetch(`${base}/api/projects`, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        const mine: MeshProject[] = (data.projects || []).map((p: ProjectView) => ({ ...p, hostName: host.name || host.id, hostBase: base }))
        return { ok: true as const, host, mine }
      } catch {
        return { ok: false as const, host, mine: [] as MeshProject[] }
      }
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
