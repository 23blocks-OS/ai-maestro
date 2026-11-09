'use client'

import { useEffect, useRef, useState } from 'react'

/** Minutes of "working" after which the indicator also says how long (a long tool run must not look stuck). */
const LONG_RUN_MS = 2 * 60 * 1000

/** The words under the dots: the live detail when there is one, else plain "Working". */
export function workingLabel(activity: { label: string; detail?: string } | null, elapsedMs: number): string {
  const base = activity ? `${activity.label}${activity.detail ? ` · ${activity.detail}` : ''}` : 'Working'
  return elapsedMs >= LONG_RUN_MS ? `${base} · still working, ${Math.floor(elapsedMs / 60000)} min` : base
}

/**
 * The dots at the bottom of the chat while the agent works (B038).
 * Shown from the shared status (presence), never from PTY output: a chat-only client has no PTY,
 * so the old PTY-driven dots never appeared on the phone or the Chat tab alone. The PTY activity,
 * when a terminal happens to be open, only adds the detail.
 */
export default function ChatWorkingIndicator({ working, activity, compact = false }: {
  working: boolean
  activity: { label: string; detail?: string } | null
  compact?: boolean
}) {
  const since = useRef<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  if (working && since.current === null) since.current = Date.now()
  if (!working) since.current = null

  useEffect(() => {
    if (!working) return
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [working])

  if (!working) return null
  const label = workingLabel(activity, since.current ? now - since.current : 0)

  return (
    <div className={compact ? 'mx-3 my-1' : 'flex justify-start'} role="status" aria-live="polite">
      {/* max-w-full + min-w-0: a long tool detail wraps inside the chat instead of running off the edge */}
      <div className={`inline-flex max-w-full items-center gap-2 border border-gray-700/50 bg-gray-800/60 ${compact ? 'px-3 py-1.5 rounded-2xl' : 'px-4 py-2 rounded-2xl'}`}>
        <div className="flex flex-shrink-0 gap-0.5" aria-hidden="true">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <span className="min-w-0 text-xs text-gray-300 break-words [overflow-wrap:anywhere]">{label}</span>
      </div>
    </div>
  )
}
