'use client'

import { useState } from 'react'
import { Hourglass, MessageSquare, AlertCircle, User } from 'lucide-react'
import { QUADRANTS, quadrantOf, type Quadrant, type TaskWithDeps } from '@/types/task'
import { waitingLabel } from '@/components/team-meeting/KanbanCard'
import { DueBadge, OwnersLine, ownerLabels } from '@/components/team-meeting/DueAndOwners'
import { sortByDue } from '@/lib/task-due'

/** A card on the matrix; the mesh-wide view adds the agent (and host) it belongs to */
export type MatrixCard = TaskWithDeps & { agentName?: string; hostName?: string }

interface MatrixViewProps<T extends MatrixCard> {
  cards: T[]
  /** quadrant null = take it off the matrix (back to "Not placed") */
  onPlace: (card: T, quadrant: Quadrant | null) => Promise<void> | void
  onSelect: (card: T) => void
  /** Show which agent each card belongs to (the mesh-wide view) */
  showAgent?: boolean
}

// Rows are Important / Not important, columns are Urgent / Not urgent (the usual Eisenhower layout)
const LAYOUT: Array<{ q: Quadrant; tone: string; dot: string; hint: string }> = [
  { q: 'q1', tone: 'border-red-500/30 bg-red-950/10', dot: 'bg-red-400', hint: 'Urgent and important' },
  { q: 'q2', tone: 'border-blue-500/30 bg-blue-950/10', dot: 'bg-blue-400', hint: 'Important, not urgent' },
  { q: 'q3', tone: 'border-amber-500/30 bg-amber-950/10', dot: 'bg-amber-400', hint: 'Urgent, not important' },
  { q: 'q4', tone: 'border-gray-600/40 bg-gray-900/40', dot: 'bg-gray-500', hint: 'Neither' },
]

function CardChip<T extends MatrixCard>({ card, showAgent, onSelect }: { card: T; showAgent?: boolean; onSelect: (c: T) => void }) {
  const waiting = card.status === 'waiting'
  const unsent = card.comments?.some(c => c.author.kind === 'operator' && !c.deliveredAt)
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.effectAllowed = 'move' }}
      onClick={() => onSelect(card)}
      className="px-2.5 py-2 rounded-lg cursor-pointer bg-gray-800/80 border border-gray-700/50 hover:border-gray-500/80 hover:bg-gray-800 active:opacity-50"
      data-testid="matrix-card"
    >
      <p className="text-xs text-gray-200 leading-snug line-clamp-2">{card.subject}</p>
      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-500">
        {waiting && <Hourglass className="w-3 h-3 text-orange-400 flex-shrink-0" />}
        {waiting
          ? <span className="text-orange-300/90 truncate" title={card.waitingNote || undefined}>{waitingLabel(card)}</span>
          : <span className="truncate">{card.status.replace('_', ' ')}</span>}
        <DueBadge due={card.due} />
        <div className="flex-1" />
        {showAgent && card.agentName && (
          <span className="flex items-center gap-1 truncate max-w-[45%]" title={card.hostName ? `${card.agentName} @ ${card.hostName}` : card.agentName}>
            <User className="w-2.5 h-2.5 flex-shrink-0" />{card.agentName}
          </span>
        )}
        {unsent && <span title="An instruction has not reached the agent yet"><AlertCircle className="w-3 h-3 text-red-400" /></span>}
        {(card.comments?.length || 0) > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="w-2.5 h-2.5" />{card.comments!.length}</span>}
      </div>
      {ownerLabels(card).length > 0 && <div className="mt-1 min-w-0"><OwnersLine card={card} /></div>}
    </div>
  )
}

function DropZone({ over, setOver, onDropCard, className, children, testId }: {
  over: boolean; setOver: (v: boolean) => void; onDropCard: (id: string) => void; className: string; children: React.ReactNode; testId: string
}) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={e => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('text/plain'); if (id) onDropCard(id) }}
      className={`${className} ${over ? 'ring-2 ring-blue-500/50 border-blue-500' : ''}`}
      data-testid={testId}
    >
      {children}
    </div>
  )
}

export default function MatrixView<T extends MatrixCard>({ cards, onPlace, onSelect, showAgent }: MatrixViewProps<T>) {
  const [over, setOver] = useState<string | null>(null)
  const byId = new Map(cards.map(c => [c.id, c]))
  const place = async (id: string, q: Quadrant | null) => {
    const card = byId.get(id)
    if (!card || quadrantOf(card) === q) return
    await onPlace(card, q)
  }
  // Inside a square: cards with a due date first, earliest first; the rest keep their order
  const inQuadrant = (q: Quadrant) => sortByDue(cards.filter(c => quadrantOf(c) === q))
  const unplaced = cards.filter(c => quadrantOf(c) === null)

  return (
    <div className="flex-1 flex gap-3 p-3 overflow-hidden min-h-0" data-testid="matrix-view">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Column headings */}
        <div className="grid grid-cols-2 gap-2.5 mb-1.5 pl-6">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 text-center">Urgent</div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 text-center">Not urgent</div>
        </div>
        <div className="flex-1 flex gap-1.5 min-h-0">
          {/* Row headings */}
          <div className="flex flex-col gap-2.5 w-4 flex-shrink-0">
            <div className="flex-1 flex items-center justify-center"><span className="text-[10px] uppercase tracking-wider text-gray-500 [writing-mode:vertical-rl] rotate-180">Important</span></div>
            <div className="flex-1 flex items-center justify-center"><span className="text-[10px] uppercase tracking-wider text-gray-500 [writing-mode:vertical-rl] rotate-180">Not important</span></div>
          </div>
          <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2.5 min-h-0">
            {LAYOUT.map(({ q, tone, dot, hint }) => {
              const list = inQuadrant(q)
              return (
                <DropZone key={q} over={over === q} setOver={v => setOver(v ? q : null)} onDropCard={id => place(id, q)}
                  className={`flex flex-col min-h-0 rounded-xl border transition-colors ${tone}`} testId={`quadrant-${q}`}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/50" title={hint}>
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="text-xs font-medium text-gray-200">{QUADRANTS[q].label}</span>
                    <span className="text-[10px] text-gray-500 bg-gray-800/80 rounded-full px-1.5">{list.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                    {list.map(c => <CardChip key={c.id} card={c} showAgent={showAgent} onSelect={onSelect} />)}
                    {list.length === 0 && <p className="text-[11px] text-gray-600 text-center pt-4">Drop a card here</p>}
                  </div>
                </DropZone>
              )
            })}
          </div>
        </div>
      </div>

      {/* Cards nobody has placed yet */}
      <DropZone over={over === 'tray'} setOver={v => setOver(v ? 'tray' : null)} onDropCard={id => place(id, null)}
        className="w-60 flex-shrink-0 flex flex-col min-h-0 rounded-xl border border-dashed border-gray-700 bg-gray-900/30 transition-colors" testId="matrix-tray">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/50" title="Drag a card into a square to place it; drag it back here to take it off the matrix">
          <span className="text-xs font-medium text-gray-300">Not placed</span>
          <span className="text-[10px] text-gray-500 bg-gray-800/80 rounded-full px-1.5">{unplaced.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
          {unplaced.map(c => <CardChip key={c.id} card={c} showAgent={showAgent} onSelect={onSelect} />)}
          {unplaced.length === 0 && <p className="text-[11px] text-gray-600 text-center pt-4">Everything is placed</p>}
        </div>
      </DropZone>
    </div>
  )
}
