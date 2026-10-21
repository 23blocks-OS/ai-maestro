'use client'

import { CalendarClock, Users } from 'lucide-react'
import { dueLabel, dueState, localToday } from '@/lib/task-due'

const TONE = {
  overdue: 'text-red-300 bg-red-500/15',
  today: 'text-amber-300 bg-amber-500/15',
  soon: 'text-amber-300 bg-amber-500/10',
  later: 'text-gray-400 bg-gray-700/40',
} as const

/**
 * A card's due date as a small badge: "due Oct 25"; amber from 3 days out and on the day ("due today");
 * red once past ("overdue 2d"). `today` is the reader's local date, passed in by tests.
 */
export function DueBadge({ due, today }: { due?: string | null; today?: string }) {
  if (!due) return null
  const t = today ?? localToday()
  const state = dueState(due, t)
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold rounded px-1 flex-shrink-0 ${TONE[state.kind]}`}
      title={`Due ${due}`}
      data-testid="due-badge"
      data-due-kind={state.kind}
    >
      <CalendarClock className="w-2.5 h-2.5" />{dueLabel(due, t)}
    </span>
  )
}

/** The names to show for a card's extra owners (resolved by the host where it could be, as given otherwise) */
export function ownerLabels(card: { owners?: string[] | null; ownerNames?: string[] }): string[] {
  const names = card.ownerNames && card.ownerNames.length > 0 ? card.ownerNames : (card.owners || [])
  return names.filter(Boolean)
}

/** The extra owners of a card, compact: "with Ana" or "with Ana +2"; all of them in the tooltip */
export function OwnersLine({ card }: { card: { owners?: string[] | null; ownerNames?: string[] } }) {
  const names = ownerLabels(card)
  if (names.length === 0) return null
  const shown = names.slice(0, 2).join(', ')
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 truncate" title={`Also owned by: ${names.join(', ')}`} data-testid="owners-line">
      <Users className="w-2.5 h-2.5 flex-shrink-0" />
      <span className="truncate">{shown}{names.length > 2 ? ` +${names.length - 2}` : ''}</span>
    </span>
  )
}
