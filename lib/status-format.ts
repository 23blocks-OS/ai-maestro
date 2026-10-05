/**
 * Words for the status row. Pure, so the header, the mobile chat and the tests
 * share it. Every function returns null (or '') for a value that is unknown: the
 * row hides what it does not know instead of showing a wrong number.
 *
 * This file is the ONE place that builds the row (statusRowSegments), and its
 * plain-text form (formatStatusRowText) is what the parity test compares with row
 * 2 of the terminal status line (plugin/plugins/ai-maestro/scripts/amp-statusline.sh):
 *
 *   <model> | ctx <size> (<pct>%)[ · /compact soon | ⚠ /compact now: 2× cost] | $<cost> |
 *   effort <level> | cache warm <N>m | cache cold | last turn <N>m ago
 *
 * Wording rules both must follow: durations are `<N>m` under an hour, `<N>h`
 * under two days, then `<N>d`, and `<1m` below a minute; the cache countdown is
 * always in minutes; "last turn" appears from two minutes of idleness. The header
 * adds the permission mode after the effort (`mode <mode>`); the terminal does not.
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

/** 90_000 -> "2m" (rounded), 20 s -> "<1m", 3 h -> "3h", 3 days -> "3d". Used for "last turn N ago". */
export function formatDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 1) return '<1m'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export type CacheState = { state: 'warm'; label: string } | { state: 'cold'; label: string } | null

/**
 * Warm with the time left, cold, or unknown (null). A reported warm/cold wins;
 * otherwise it is the expiry against now. The countdown is always in minutes (the
 * longest cache lives an hour), the same words the terminal bar uses.
 */
export function cacheState(snapshot: Pick<StatusSnapshot, 'cacheExpiresAt'> & { cacheWarm?: boolean }, now: number): CacheState {
  if (snapshot.cacheWarm === false) return { state: 'cold', label: 'cache cold' }
  if (snapshot.cacheExpiresAt === undefined) {
    return snapshot.cacheWarm === true ? { state: 'warm', label: 'cache warm' } : null
  }
  const left = snapshot.cacheExpiresAt - now
  if (left <= 0) return { state: 'cold', label: 'cache cold' }
  const min = Math.round(left / 60000)
  return { state: 'warm', label: min < 1 ? 'cache warm <1m' : `cache warm ${min}m` }
}

/**
 * Show the row only while the snapshot is recent. Returns how old it is when it
 * is worth saying (an agent that is idle but not long), else null.
 */
export function snapshotAge(snapshot: Pick<StatusSnapshot, 'asOf'> & { lastTurnAt?: number }, now: number): { visible: boolean; label: string | null } {
  // "Last turn" is the transcript's last turn; a report only says when the status line last ran
  const age = now - (snapshot.lastTurnAt ?? snapshot.asOf)
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

// ── The row ─────────────────────────────────────────────────────────────────

export type RowTone = 'default' | 'amber' | 'red' | 'muted' | 'warm' | 'cold'

export interface RowSegment {
  key: 'model' | 'ctx' | 'cost' | 'effort' | 'mode' | 'cache' | 'lastTurn'
  /** Plain text, exactly what the terminal bar prints for this part */
  text: string
  tone: RowTone
  /** Longer explanation for a tooltip */
  title?: string
  /** For `ctx`: the /compact recommendation, so a view can emphasise it */
  hint?: 'soon' | 'now'
}

/** The /compact recommendation as the terminal bar prints it */
const COMPACT_TEXT = { soon: '/compact soon', now: '⚠ /compact now: 2× cost' } as const

/**
 * The status row as parts, in the order the terminal bar prints them. Empty when
 * the snapshot is too old to show. Unknown values are left out. `includeMode` adds
 * the permission mode (the header shows it; the terminal bar has no source for it).
 */
export function statusRowSegments(snapshot: StatusSnapshot, now: number, opts: { includeMode?: boolean } = {}): RowSegment[] {
  const age = snapshotAge(snapshot, now)
  if (!age.visible) return []
  const out: RowSegment[] = []

  const model = snapshot.modelName || formatModel(snapshot.model)
  if (model) out.push({ key: 'model', text: model, tone: 'default', title: snapshot.model })

  const size = formatTokens(snapshot.contextTokens)
  if (size) {
    const pct = `${snapshot.contextApprox ? '~' : ''}${snapshot.contextPercent}%`
    const hint = snapshot.compact === 'soon' || snapshot.compact === 'now' ? snapshot.compact : undefined
    out.push({
      key: 'ctx',
      text: `ctx ${size} (${pct})${hint ? ` · ${COMPACT_TEXT[hint]}` : ''}`,
      tone: hint === 'now' ? 'red' : hint === 'soon' ? 'amber'
        : snapshot.contextPercent >= 80 ? 'red' : snapshot.contextPercent >= 50 ? 'amber' : 'default',
      title: `Context: ${snapshot.contextTokens.toLocaleString()} tokens of ${snapshot.contextWindow.toLocaleString()}${snapshot.contextApprox ? ' (window size assumed)' : ''}`,
      hint,
    })
  }

  const cost = formatCost(snapshot.cost)
  if (cost) out.push({ key: 'cost', text: cost, tone: 'default', title: "This session's cost, estimated at list price" })

  if (snapshot.effort) out.push({ key: 'effort', text: `effort ${snapshot.effort}`, tone: 'default', title: 'Reasoning effort' })

  if (opts.includeMode) {
    const mode = formatMode(snapshot.mode)
    if (mode) out.push({ key: 'mode', text: `mode ${mode}`, tone: 'default', title: 'Permission mode' })
  }

  const cache = cacheState(snapshot, now)
  if (cache) {
    out.push({
      key: 'cache', text: cache.label, tone: cache.state === 'warm' ? 'warm' : 'cold',
      title: 'Prompt cache: a cold cache is re-written in full on the next turn',
    })
  }

  if (age.label) out.push({ key: 'lastTurn', text: age.label, tone: 'muted' })
  return out
}

/** The row as plain text, parts joined with " | ". What the parity test compares with the terminal bar. */
export function formatStatusRowText(snapshot: StatusSnapshot, now: number, opts: { includeMode?: boolean } = {}): string {
  return statusRowSegments(snapshot, now, opts).map(seg => seg.text).join(' | ')
}
