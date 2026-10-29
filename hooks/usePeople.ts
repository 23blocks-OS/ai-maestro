'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { isSelfHost } from '@/lib/host-kind'
import { collectPeople, type MeshPerson, type PeopleTarget } from '@/lib/people-fanout'
import type { Host } from '@/types/host'

export type { MeshPerson }

/** The people of every host, one call per host. A host that is down is named, never silently empty. */
export function usePeople(hosts: Host[], includeInactive = false) {
  const [people, setPeople] = useState<MeshPerson[]>([])
  const [unreachable, setUnreachable] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const key = hosts.map(h => `${h.id}|${h.url}|${h.enabled}`).join(',') + `|${includeInactive}`

  const load = useCallback(async () => {
    const list: Host[] = hosts.length > 0
      ? hosts.filter(h => h.enabled !== false)
      : [{ id: 'local', name: 'This host', url: '', isSelf: true } as Host]
    const targets: PeopleTarget[] = list.map(h => ({
      base: isSelfHost(h) ? '' : h.url.replace(/\/$/, ''),
      hostId: h.id,
      hostName: h.name || h.id,
    }))
    const r = await collectPeople(targets, url => fetch(url, { signal: AbortSignal.timeout(8000) }), includeInactive)
    setPeople(r.people)
    setUnreachable(r.unreachable)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    load()
    const timer = setInterval(load, 15_000)
    return () => clearInterval(timer)
  }, [load])

  return useMemo(() => ({ people, unreachable, loading, refresh: load }), [people, unreachable, loading, load])
}
