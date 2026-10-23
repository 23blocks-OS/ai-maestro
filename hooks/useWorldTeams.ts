'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSelfHost } from '@/lib/host-kind'
import type { Host } from '@/types/host'
import type { Team } from '@/types/team'

/** A team with the host that holds it (teams live on one host; their members may be anywhere) */
export type WorldTeam = Team & { hostId: string; hostName: string; hostBase: string }

/**
 * Every team on every enabled host, one call per host, every 60 s. A host that is down contributes nothing.
 */
export function useWorldTeams(hosts: Host[], enabled: boolean): WorldTeam[] {
  const [teams, setTeams] = useState<WorldTeam[]>([])
  const key = hosts.map(h => `${h.id}|${h.url}|${h.enabled}`).join(',')

  const load = useCallback(async () => {
    const targets: Host[] = hosts.length > 0
      ? hosts.filter(h => h.enabled !== false)
      : [{ id: 'local', name: 'This host', url: '', isSelf: true } as Host]
    const results = await Promise.all(targets.map(async host => {
      const base = isSelfHost(host) ? '' : host.url.replace(/\/$/, '')
      try {
        const res = await fetch(`${base}/api/teams`, { signal: AbortSignal.timeout(6000) })
        if (!res.ok) return []
        const data = await res.json()
        return ((data.teams || []) as Team[]).map(t => ({ ...t, hostId: host.id, hostName: host.name || host.id, hostBase: base }))
      } catch { return [] }
    }))
    // The same host can be listed twice (itself, and as a peer): a team is one team
    const seen = new Set<string>()
    setTeams(results.flat().filter(t => (seen.has(t.id) ? false : (seen.add(t.id), true))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!enabled) return
    load()
    const timer = setInterval(load, 60_000)
    return () => clearInterval(timer)
  }, [enabled, load])

  return useMemo(() => teams, [teams])
}
