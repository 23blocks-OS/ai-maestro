/**
 * Words for the header's status row. Pure, so the header and the tests share it.
 * Every function returns null (or '') for a value that is unknown: the header
 * hides what it does not know instead of showing a wrong number.
 */

import type { StatusSnapshot } from '@/lib/transcript-snapshot'

/**
 * A snapshot older than this is hidden: the agent has not done a turn in a day.
 * Younger ones are shown with their age once it passes LIVE_MS, because an idle
 * agent's context size and cold cache are exactly what you want to see before
 * you wake it.
 */
export const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000
const LIVE_MS = 2 * 60 * 1000

/** "claude-opus-5-5" -> "Opus 5.5", "claude-sonnet-5" -> "Sonnet 5", "claude-haiku-4-5-20251001" -> "Haiku 4.5". Unknown ids pass through. */
export function formatModel(id: string | undefined | null): string | null {
  if (!id) return null
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[1m\])?$/i)
  if (!m) return id
  const family = m[1][0].toUpperCase() + m[1].slice(1)
  return m[3] ? `${family} ${m[2]}.${m[3]}` : `${family} ${m[2]}`
}

/** 149_300 -> "149k", 900 -> "900" */
export function formatTokens(n: number | undefined | null): string | null {
  if (n === undefined || n === null || !Number.isFinite(n) || n < 0) return null
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n))
}

export function formatCost(usd: number | undefined | null): string | null {
  if (usd === undefined || usd === null || !Number.isFinite(usd) || usd <= 0) return null
  return `$${usd.toFixed(2)}`
}

/** 90_000 -> "1 min", 2h -> "2 h". Used for "last turn N ago" and the cache countdown. */
export function formatDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 1) return '<1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h`
}

export type CacheState = { state: 'warm'; label: string } | { state: 'cold'; label: string } | null

/** Warm with the time left, cold, or unknown (null) */
export function cacheState(snapshot: Pick<StatusSnapshot, 'cacheExpiresAt'>, now: number): CacheState {
  if (snapshot.cacheExpiresAt === undefined) return null
  const left = snapshot.cacheExpiresAt - now
  return left > 0
    ? { state: 'warm', label: `cache warm ${formatDuration(left)}` }
    : { state: 'cold', label: 'cache cold' }
}

/**
 * Show the row only while the snapshot is recent. Returns how old it is when it
 * is worth saying (an agent that is idle but not long), else null.
 */
export function snapshotAge(snapshot: Pick<StatusSnapshot, 'asOf'>, now: number): { visible: boolean; label: string | null } {
  const age = now - snapshot.asOf
  if (age > SNAPSHOT_MAX_AGE_MS) return { visible: false, label: null }
  // Under two minutes counts as live: the agent is working or just finished
  return { visible: true, label: age >= LIVE_MS ? `last turn ${formatDuration(age)} ago` : null }
}

/** The primary AMP address of an agent as the registry stores it, or null */
export function primaryAmpAddress(agent: {
  tools?: { amp?: { addresses?: Array<{ address: string; primary?: boolean }> } } | null
  metadata?: { amp?: { address?: string } } | null
} | null | undefined): string | null {
  const list = agent?.tools?.amp?.addresses
  if (list && list.length > 0) return (list.find(a => a.primary) || list[0]).address || null
  return agent?.metadata?.amp?.address || null
}

/** "acceptEdits" -> "accept edits", "bypassPermissions" -> "bypass permissions", "default" -> "default" */
export function formatMode(mode: string | undefined | null): string | null {
  if (!mode) return null
  return mode.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}
