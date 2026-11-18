'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Host } from '@/types/host'
import { fetchFeedFromHosts } from '@/lib/mesh-fetch'
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
    const answers = await fetchFeedFromHosts<{ organizations?: OrganizationRecord[]; defaultOrg?: string }>(hosts, 'orgs', '/api/orgs', 8000, { missingIsEmpty: true })
    const results = answers.map(({ host, base, ok, data }) => ({
      ok, host, base,
      mine: (data?.organizations || []).map(o => ({ ...o, hostBase: base, hostName: host.name || host.id })) as MeshOrg[],
      def: typeof data?.defaultOrg === 'string' ? data.defaultOrg : undefined,
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
