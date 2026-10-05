'use client'

/**
 * The terminal status bar's facts, for the chat (F025): model, context size
 * with the /compact recommendation, cost, permission mode, effort, prompt-cache
 * state. Every value the snapshot does not have is left out; a snapshot older
 * than a day is not shown at all (lib/status-format.ts). On a narrow screen
 * only the context size and the recommendation show; the chevron opens the rest.
 *
 * Shared by the desktop header (AgentHeaderBar) and the mobile chat.
 */

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { StatusSnapshot } from '@/lib/transcript-snapshot'
import { formatModel, formatTokens, formatCost, formatMode, cacheState, snapshotAge } from '@/lib/status-format'

/** Re-render now and then so "cache warm 12 min" counts down and "last turn" ages */
function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

export default function AgentStatusRow({ snapshot }: { snapshot: StatusSnapshot }) {
  const now = useNow()
  const [open, setOpen] = useState(false)
  const age = snapshotAge(snapshot, now)
  if (!age.visible) return null

  const model = formatModel(snapshot.model)
  const ctxTokens = formatTokens(snapshot.contextTokens)
  const cost = formatCost(snapshot.cost)
  const mode = formatMode(snapshot.mode)
  const cache = cacheState(snapshot, now)
  const pct = `${snapshot.contextApprox ? '~' : ''}${snapshot.contextPercent}%`

  const ctxClass =
    snapshot.compact === 'now' ? 'text-red-300'
    : snapshot.compact === 'soon' ? 'text-amber-300'
    : snapshot.contextPercent >= 80 ? 'text-red-300'
    : snapshot.contextPercent >= 50 ? 'text-amber-300'
    : 'text-gray-300'

  const sep = <span className="text-gray-600" aria-hidden>·</span>
  // The rest of the row: always on md+, behind the chevron below that
  const rest = (
    <>
      {model && <><span title={snapshot.model}>{model}</span></>}
      {cost && <>{sep}<span title="Session cost, estimated at list price">{cost}</span></>}
      {snapshot.effort && <>{sep}<span title="Reasoning effort of the last turn">effort {snapshot.effort}</span></>}
      {mode && <>{sep}<span title="Permission mode">{mode}</span></>}
      {cache && <>{sep}<span className={cache.state === 'cold' ? 'text-gray-500' : 'text-emerald-300/80'} title="Prompt cache: a cold cache is re-written in full on the next turn">{cache.label}</span></>}
      {age.label && <>{sep}<span className="text-gray-500">{age.label}</span></>}
    </>
  )

  return (
    <div className="flex items-center gap-1.5 min-w-0 text-[11px] leading-tight text-gray-400" data-testid="agent-status-row">
      {ctxTokens && (
        <span className={`flex items-center gap-1.5 flex-shrink-0 ${ctxClass}`} title={`Context: ${snapshot.contextTokens.toLocaleString()} tokens of ${snapshot.contextWindow.toLocaleString()}${snapshot.contextApprox ? ' (window size assumed)' : ''}`}>
          <span>ctx {ctxTokens} ({pct})</span>
          {snapshot.compact === 'now' && <span className="font-medium">/compact now: 2× cost</span>}
          {snapshot.compact === 'soon' && <span className="font-medium">/compact soon</span>}
        </span>
      )}
      <span className="hidden md:flex items-center gap-1.5 min-w-0 truncate">{ctxTokens && sep}{rest}</span>
      <button
        type="button"
        className="md:hidden flex-shrink-0 text-gray-500 hover:text-gray-300"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={open ? 'Hide status details' : 'Show status details'}
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && <span className="md:hidden flex items-center gap-1.5 min-w-0 flex-wrap">{rest}</span>}
    </div>
  )
}

