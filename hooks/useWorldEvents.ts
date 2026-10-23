'use client'

import { useEffect, useRef, useState } from 'react'

export interface WorldEventView {
  id: string
  ts: number
  /** Sender's AMP name */
  from: string
  toAgentId: string
  hostId: string
  /** When this browser learned of it (pulses are timed from here, so a slow poll never plays a stale one) */
  seenAt: number
}

const POLL_MS = 4000
const KEEP = 30

/**
 * Recent AMP deliveries across hosts, for the World view's pulses and live feed. Polls while
 * `enabled`; the first poll looks 20 s back so the map opens with a little life, after that only
 * what is new. A failed poll keeps what it had.
 */
export function useWorldEvents(enabled: boolean): WorldEventView[] {
  const [events, setEvents] = useState<WorldEventView[]>([])
  const cursor = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    cursor.current = Date.now() - 20_000
    const poll = async () => {
      try {
        const res = await fetch(`/api/world/events?since=${cursor.current}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const fresh: Array<Omit<WorldEventView, 'seenAt'>> = Array.isArray(data?.events) ? data.events : []
        if (stopped || fresh.length === 0) return
        cursor.current = Math.max(cursor.current, ...fresh.map(e => e.ts))
        const seenAt = Date.now()
        setEvents(prev => {
          const known = new Set(prev.map(e => e.id))
          const added = fresh.filter(e => !known.has(e.id)).map(e => ({ ...e, seenAt }))
          return added.length ? [...prev, ...added].slice(-KEEP) : prev
        })
      } catch { /* offline or restarting: try again next tick */ }
    }
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => { stopped = true; clearInterval(timer) }
  }, [enabled])

  return events
}
