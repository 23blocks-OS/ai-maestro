'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { isSelfHost } from '@/lib/host-kind'
import type { Host } from '@/types/host'
import type { OrganizationRecord } from '@/types/org'

/** An organization record with how the browser reaches the host that stores it ('' for this one) */
export type MeshOrg = OrganizationRecord & { hostBase: string; hostName: string }

/** The organization records of every host, one call per host. A host that is down is named, never silently empty. */
export function useOrgs(hosts: Host[]) {
  const [orgs, setOrgs] = useState<MeshOrg[]>([])
  const [unreachable, setUnreachable] = useState<string[]>([])
  // The viewing host's choice (this dashboard's host), 'personal' until one is made
  const [defaultOrg, setDefaultOrg] = useState('personal')
  const key = hosts.map(h => `${h.id}|${h.url}|${h.enabled}`).join(',')

  const load = useCallback(async () => {
    const targets: Host[] = hosts.length > 0
      ? hosts.filter(h => h.enabled !== false)
      : [{ id: 'local', name: 'This host', url: '', isSelf: true } as Host]
    const results = await Promise.all(targets.map(async host => {
      const base = isSelfHost(host) ? '' : host.url.replace(/\/$/, '')
      try {
        const res = await fetch(`${base}/api/orgs`, { signal: AbortSignal.timeout(8000) })
        // A host that has not been updated yet has no such route: it holds no records, it is not down
        if (res.status === 404) return { ok: true as const, host, mine: [] as MeshOrg[], base, def: undefined }
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        const mine: MeshOrg[] = (data.organizations || []).map((o: OrganizationRecord) => ({ ...o, hostBase: base, hostName: host.name || host.id }))
        return { ok: true as const, host, mine, base, def: typeof data.defaultOrg === 'string' ? data.defaultOrg : undefined }
      } catch {
        return { ok: false as const, host, mine: [] as MeshOrg[], base, def: undefined }
      }
    }))
    setOrgs(results.flatMap(r => r.mine))
    const here = results.find(r => r.base === '' && r.def)
    if (here?.def) setDefaultOrg(here.def)
    setUnreachable(results.filter(r => !r.ok).map(r => r.host.name || r.host.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    load()
    const timer = setInterval(load, 15_000)
    return () => clearInterval(timer)
  }, [load])

  return useMemo(() => ({ orgs, defaultOrg, unreachable, refresh: load }), [orgs, defaultOrg, unreachable, load])
}
