'use client'

/**
 * The terminal status bar's facts, for the chat (F025): model, context size
 * with the /compact recommendation, this session's cost, effort, prompt-cache
 * state, and the permission mode. The text of every part comes from
 * statusRowSegments (lib/status-format.ts), the same builder the parity test
 * checks against row 2 of the terminal status line, so the two read the same.
 * Every value the snapshot does not have is left out; a snapshot whose last turn
 * is more than a day old is not shown at all. On a narrow screen only the
 * context size and the recommendation show; the chevron opens the rest.
 *
 * Shared by the desktop header (AgentHeaderBar) and the mobile chat.
 */

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { StatusSnapshot } from '@/lib/transcript-snapshot'
import { statusRowSegments, type RowSegment, type RowTone } from '@/lib/status-format'

/** Re-render now and then so "cache warm 12m" counts down and "last turn" ages */
function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

const TONE: Record<RowTone, string> = {
  default: 'text-gray-300',
  amber: 'text-amber-300',
  red: 'text-red-300',
  muted: 'text-gray-500',
  warm: 'text-emerald-300/80',
  cold: 'text-gray-500',
}

function Segments({ segments }: { segments: RowSegment[] }) {
  const sep = <span className="text-gray-600" aria-hidden>|</span>
  return (
    <>
      {segments.map((seg, i) => (
        <span key={seg.key} className="flex items-center gap-1.5 flex-shrink-0">
          {i > 0 && sep}
          <span className={`${TONE[seg.tone]} ${seg.hint ? 'font-medium' : ''}`} title={seg.title} data-segment={seg.key}>{seg.text}</span>
        </span>
      ))}
    </>
  )
}

export default function AgentStatusRow({ snapshot }: { snapshot: StatusSnapshot }) {
  const now = useNow()
  const [open, setOpen] = useState(false)
  // The header shows the permission mode too; the terminal bar has no source for it
  const segments = statusRowSegments(snapshot, now, { includeMode: true })
  if (segments.length === 0) return null

  const ctx = segments.find(seg => seg.key === 'ctx')
  const others = segments.filter(seg => seg.key !== 'ctx')

  return (
    <div className="flex items-center gap-1.5 min-w-0 text-[11px] leading-tight text-gray-400" data-testid="agent-status-row">
      {/* Wide: the whole row, in the terminal bar's order */}
      <span className="hidden md:flex items-center gap-1.5 min-w-0 truncate"><Segments segments={segments} /></span>
      {/* Narrow: the context size and the recommendation; the rest behind the chevron */}
      <span className="md:hidden flex items-center gap-1.5 min-w-0">
        {ctx && <Segments segments={[ctx]} />}
        {others.length > 0 && (
          <button
            type="button"
            className="flex-shrink-0 text-gray-500 hover:text-gray-300"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-label={open ? 'Hide status details' : 'Show status details'}
          >
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </span>
      {open && others.length > 0 && <span className="md:hidden flex items-center gap-1.5 min-w-0 flex-wrap"><Segments segments={others} /></span>}
    </div>
  )
}
