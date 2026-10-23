'use client'

import { useEffect, useState } from 'react'
import type { EventLike } from '@/lib/world/relations'

export interface HistoryEvent extends EventLike {
  hostId: string
}

const REFRESH_MS = 120_000

/**
 * The last `hours` of AMP deliveries across hosts (sender name, recipient id, time; never the message),
 * for the relations lens and the replay. Read once and then every two minutes: a day of inbox folders
 * is more to read than the live pulses' few minutes. A failed read keeps what it had.
 */
export function useWorldHistory(enabled: boolean, hours = 24): { events: HistoryEvent[]; loaded: boolean } {
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    const load = async () => {
      try {
        const since = Date.now() - hours * 3_600_000
        const res = await fetch(`/api/world/events?since=${since}&history=1`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!stopped && Array.isArray(data?.events)) { setEvents(data.events); setLoaded(true) }
      } catch { /* try again next round */ }
    }
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => { stopped = true; clearInterval(timer) }
  }, [enabled, hours])

  return { events, loaded }
}
