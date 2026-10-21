'use client'

import { Hourglass, Eye, BellRing, CalendarClock } from 'lucide-react'
import { KIND_LABEL, type AttentionItem, type AttentionKind } from '@/lib/attention'

const TONE: Record<AttentionKind, { icon: typeof Hourglass; cls: string }> = {
  'needs-you': { icon: BellRing, cls: 'text-red-300' },
  'waiting-on-you': { icon: Hourglass, cls: 'text-orange-300' },
  'in-review': { icon: Eye, cls: 'text-sky-300' },
  'overdue': { icon: CalendarClock, cls: 'text-red-300' },
}

/** "3h", "12m", "2d": how long something has waited */
export function waitedLabel(waitedMs: number | null): string {
  if (waitedMs === null) return 'unknown'
  const m = Math.floor(waitedMs / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/**
 * The attention queue rows. A row is a plain link to the agent (`/?agent=<id>`, the dashboard's own
 * deep link; it works for an agent on any host the dashboard lists), never a button inside a button.
 */
export default function AttentionList({ items, showHost }: { items: AttentionItem[]; showHost?: boolean }) {
  if (items.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-sm text-gray-500" data-testid="attention-empty">Nothing needs you right now.</div>
  }
  return (
    <ul className="flex-1 overflow-y-auto divide-y divide-gray-800/70" data-testid="attention-list">
      {items.map(it => {
        const { icon: Icon, cls } = TONE[it.kind]
        return (
          <li key={it.key}>
            <a href={`/?agent=${encodeURIComponent(it.agentId)}`} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-900/60" data-testid="attention-row">
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cls}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-100 truncate">
                  <span className="font-medium">{it.agentName}</span>
                  {it.roleLine ? <span className="text-gray-500"> · {it.roleLine}</span> : null}
                  {showHost && it.hostName ? <span className="text-gray-600"> @ {it.hostName}</span> : null}
                </p>
                <p className="text-xs text-gray-300 truncate">{it.title}</p>
                {it.detail ? <p className="text-[11px] text-gray-500 truncate">{it.detail}</p> : null}
              </div>
              <div className="flex-shrink-0 text-right">
                <p className={`text-[11px] font-medium ${cls}`}>{KIND_LABEL[it.kind]}</p>
                <p className="text-[11px] text-gray-500" data-testid="attention-waited">{waitedLabel(it.waitedMs)}</p>
              </div>
            </a>
          </li>
        )
      })}
    </ul>
  )
}
