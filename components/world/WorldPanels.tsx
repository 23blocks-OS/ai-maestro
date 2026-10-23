'use client'

/**
 * The side panels of the World view: the agent card with its ways in (chat, terminal, full screen,
 * Companion, a team meeting), what is waiting on you, the relations and teams lists, and the replay bar.
 * Presentation only; the page owns the data.
 */

import { useState } from 'react'
import { Pause, Play, X } from 'lucide-react'
import { PRESENCE_STYLE, type AgentPresence } from '@/lib/agent-presence'
import type { MeshCard } from '@/hooks/useOpenTasks'
import type { WorldTeam } from '@/hooks/useWorldTeams'
import type { WorkSummary } from '@/lib/world/relations'

const KIND_DOT: Record<string, string> = { talk: 'text-amber-400', task: 'text-sky-400' }

export interface Partner {
  id: string
  name: string
  talk: number
  task: number
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/** A card's due date as people say it: "overdue", "today", or the date */
export function dueLabel(due: string | null | undefined, today: string): { text: string; late: boolean } | null {
  if (!due) return null
  if (due < today) return { text: `due ${due}`, late: true }
  if (due === today) return { text: 'due today', late: false }
  return { text: `due ${due}`, late: false }
}

function LinkButton({ href, label, title, tone = 'teal' }: { href: string; label: string; title: string; tone?: 'teal' | 'violet' | 'gray' }) {
  const color = tone === 'teal' ? 'bg-teal-600 hover:bg-teal-700' : tone === 'violet' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-gray-700 hover:bg-gray-600'
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title}
      className={`rounded-lg px-3 py-1 text-xs text-white transition-colors ${color}`}>{label}</a>
  )
}

/** The agent you clicked: where it stands, what is on its plate, who it works with, and the ways to reach it */
export function AgentPanel({ agent, name, presence, place, work, cards, partners, teams, today, onClose, onGo, onSpotlightTeam }: {
  agent: { id: string; hostName?: string; hostId: string; taskDescription?: string }
  name: string
  presence: AgentPresence
  place: string
  work?: WorkSummary
  cards: MeshCard[]
  partners: Partner[]
  teams: WorldTeam[]
  today: string
  onClose: () => void
  onGo: (id: string) => void
  onSpotlightTeam: (id: string) => void
}) {
  const id = encodeURIComponent(agent.id)
  const style = PRESENCE_STYLE[presence]
  return (
    <div className="space-y-3 border-b border-gray-800 bg-gray-900/60 px-4 py-3" data-testid="agent-panel">
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${style.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-100">{name}</p>
          <p className="truncate text-xs text-gray-500">{place} · {agent.hostName || agent.hostId} · <span className={style.text}>{style.label}</span></p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300" aria-label="Close the agent card"><X className="h-3.5 w-3.5" /></button>
      </div>
      {agent.taskDescription && <p className="line-clamp-3 text-xs text-gray-400">{agent.taskDescription}</p>}

      <div className="flex flex-wrap gap-1.5" aria-label="Ways to reach this agent">
        <LinkButton href={`/?agent=${id}&tab=chat`} label="Chat" title="The agent's chat in the dashboard" />
        <LinkButton href={`/?agent=${id}&tab=terminal`} label="Terminal" title="The agent's terminal in the dashboard" />
        <LinkButton href={`/zoom/agent?id=${id}`} label="Full screen" title="The agent full screen with its terminal" tone="gray" />
        <LinkButton href={`/companion?agent=${id}`} label="Talk" title="Talk to the agent in Companion mode (voice)" tone="violet" />
      </div>

      {(work || cards.length > 0) && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Work · {plural(work?.open ?? cards.length, 'open card')}
            {work && work.waitingOnYou > 0 ? ` · ${work.waitingOnYou} for you` : ''}
            {work && work.overdue > 0 ? ` · ${work.overdue} late` : ''}
          </p>
          <ul className="space-y-0.5">
            {cards.slice(0, 5).map(c => {
              const due = dueLabel(c.due, today)
              return (
                <li key={c.id} className="truncate text-xs text-gray-300" title={c.subject}>
                  <span className={c.status === 'waiting' && c.waitingOn === 'juan' ? 'text-sky-400' : 'text-gray-600'}>●</span> {c.subject}
                  <span className="text-gray-600"> · {c.status === 'waiting' ? `waiting on ${c.waitingOn === 'juan' ? 'you' : c.waitingOn}` : c.status.replace('_', ' ')}</span>
                  {due && <span className={due.late ? 'text-red-400' : 'text-gray-600'}> · {due.text}</span>}
                </li>
              )
            })}
            {cards.length > 5 && <li className="text-xs text-gray-600">and {cards.length - 5} more</li>}
          </ul>
        </div>
      )}

      {partners.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Works with</p>
          <ul className="space-y-0.5">
            {partners.slice(0, 5).map(p => (
              <li key={p.id}>
                <button onClick={() => onGo(p.id)} className="flex w-full items-center gap-1 truncate text-left text-xs text-gray-300 hover:text-teal-300" title="Go to this agent">
                  {p.name}
                  <span className="text-gray-600">
                    {p.talk > 0 && <span className={KIND_DOT.talk}> · {plural(p.talk, 'message')}</span>}
                    {p.task > 0 && <span className={KIND_DOT.task}> · {plural(p.task, 'card')}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {teams.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Teams</p>
          <ul className="space-y-1">
            {teams.slice(0, 4).map(t => (
              <li key={`${t.hostId}-${t.id}`} className="flex items-center gap-2 text-xs">
                <button onClick={() => onSpotlightTeam(t.id)} className="min-w-0 flex-1 truncate text-left text-gray-300 hover:text-teal-300" title="Light up this team in the world">{t.name} <span className="text-gray-600">· {t.agentIds.length}</span></button>
                <a href={`${t.hostBase}/team-meeting?meeting=new&team=${encodeURIComponent(t.id)}`} target="_blank" rel="noopener noreferrer"
                  className="rounded bg-gray-700 px-2 py-0.5 text-white hover:bg-gray-600" title="Open a team meeting with this team">Meet</a>
              </li>
            ))}
            {teams.length > 4 && <li className="text-xs text-gray-600">and {teams.length - 4} more (Relations lens)</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Cards waiting on you, across every host, most urgent first */
export function WaitingList({ cards, nameOf, placeOf, today, onGo, limit }: {
  cards: MeshCard[]
  nameOf: (agentId: string) => string
  placeOf: (agentId: string) => string
  today: string
  onGo: (agentId: string) => void
  limit?: number
}) {
  if (cards.length === 0) return null
  const shown = limit ? cards.slice(0, limit) : cards
  return (
    <div className="border-b border-gray-800 px-4 py-2.5" data-testid="waiting-list">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-sky-400">Waiting on you · {cards.length}</p>
      <ul className="space-y-1">
        {shown.map(c => {
          const holder = c.assigneeAgentId || c.agentId
          const due = dueLabel(c.due, today)
          return (
            <li key={`${c.hostId}-${c.id}`}>
              <button onClick={() => onGo(holder)} className="block w-full rounded px-1 py-0.5 text-left hover:bg-gray-900" title="Go to this agent">
                <span className="block truncate text-xs text-gray-100">{c.subject}</span>
                <span className="block truncate text-[11px] text-gray-500">
                  {nameOf(holder)} · {placeOf(holder)}
                  {due && <span className={due.late ? 'text-red-400' : ''}> · {due.text}</span>}
                  {c.waitingNote ? ` · ${c.waitingNote}` : ''}
                </span>
              </button>
            </li>
          )
        })}
        {limit && cards.length > limit && <li className="px-1 text-[11px] text-gray-600">and {cards.length - limit} more (Work lens)</li>}
      </ul>
    </div>
  )
}

export interface PairRow {
  key: string
  a: string
  b: string
  aName: string
  bName: string
  /** Where each one stands (island › building), since first names repeat */
  aPlace: string
  bPlace: string
  talk: number
  task: number
}

/** The busiest pairs, and the busiest links between orgs / hosts */
export function TiesList({ pairs, arcs, spanH, onSpan, onGo }: {
  pairs: PairRow[]
  arcs: Array<{ key: string; label: string; weight: number }>
  spanH: number
  onSpan: (h: number) => void
  onGo: (agentId: string) => void
}) {
  return (
    <div className="border-b border-gray-800 px-4 py-2.5" data-testid="ties-list">
      <div className="mb-1 flex items-center gap-2">
        <p className="flex-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Who works with whom</p>
        <select value={spanH} onChange={e => onSpan(Number(e.target.value))} aria-label="Message window"
          className="rounded border border-gray-800 bg-gray-900 px-1 py-0.5 text-[11px] text-gray-300">
          <option value={1}>last hour</option>
          <option value={6}>last 6 h</option>
          <option value={24}>last 24 h</option>
        </select>
      </div>
      <p className="mb-1.5 text-[11px] text-gray-600"><span className="text-amber-400">━</span> messages <span className="text-sky-400">━</span> cards <span className="text-purple-400">━</span> both</p>
      {pairs.length === 0 ? (
        <p className="text-xs text-gray-600">No messages or shared cards in this window.</p>
      ) : (
        <ul className="space-y-0.5">
          {pairs.map(p => (
            <li key={p.key} className="truncate text-xs text-gray-300">
              <button onClick={() => onGo(p.a)} className="hover:text-teal-300" title={p.aPlace}>{p.aName}</button>
              <span className="text-gray-600"> ↔ </span>
              <button onClick={() => onGo(p.b)} className="hover:text-teal-300" title={p.bPlace}>{p.bName}</button>
              {p.talk > 0 && <span className={KIND_DOT.talk}> · {plural(p.talk, 'msg')}</span>}
              {p.task > 0 && <span className={KIND_DOT.task}> · {plural(p.task, 'card')}</span>}
            </li>
          ))}
        </ul>
      )}
      {arcs.length > 0 && (
        <>
          <p className="mb-1 mt-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">Busiest links between islands</p>
          <ul className="space-y-0.5">
            {arcs.map(a => <li key={a.key} className="truncate text-xs text-gray-400">{a.label} <span className="text-gray-600">· {a.weight}</span></li>)}
          </ul>
        </>
      )}
    </div>
  )
}

export function TeamsList({ teams, activeId, onPick }: { teams: WorldTeam[]; activeId: string | null; onPick: (id: string | null) => void }) {
  const [all, setAll] = useState(false)
  if (teams.length === 0) return null
  const shown = all ? teams : teams.slice(0, 8)
  return (
    <div className="border-b border-gray-800 px-4 py-2.5" data-testid="teams-list">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Teams · click to light one up</p>
      <ul className="space-y-1">
        {shown.map(t => (
          <li key={`${t.hostId}-${t.id}`} className="flex items-center gap-2 text-xs">
            <button onClick={() => onPick(activeId === t.id ? null : t.id)}
              className={`min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left ${activeId === t.id ? 'bg-teal-600/30 text-teal-200' : 'text-gray-300 hover:bg-gray-900'}`}>
              {t.name} <span className="text-gray-600">· {t.agentIds.length} agents · {t.hostName}</span>
            </button>
            <a href={`${t.hostBase}/team-meeting?meeting=new&team=${encodeURIComponent(t.id)}`} target="_blank" rel="noopener noreferrer"
              className="rounded bg-gray-700 px-2 py-0.5 text-white hover:bg-gray-600" title="Open a team meeting with this team">Meet</a>
          </li>
        ))}
      </ul>
      {teams.length > 8 && (
        <button onClick={() => setAll(!all)} className="mt-1 text-[11px] text-gray-500 hover:text-gray-300">{all ? 'Show fewer' : `Show all ${teams.length} teams`}</button>
      )}
    </div>
  )
}

export interface ReplayState {
  playing: boolean
  /** The replay clock, epoch ms */
  cursor: number
  /** The earliest the replay can go, epoch ms */
  start: number
  /** Virtual seconds per real second */
  speed: number
}

export const REPLAY_SPEEDS = [
  { speed: 60, label: '1 h / min' },
  { speed: 360, label: '6 h / min' },
  { speed: 1440, label: '24 h / min' },
]

const clock = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Play the last hours of messages back as pulses */
export function ReplayBar({ replay, rangeH, count, loaded, onRange, onToggle, onSeek, onSpeed, onClose }: {
  replay: ReplayState
  rangeH: number
  /** Deliveries in the replayed range */
  count: number
  loaded: boolean
  onRange: (h: number) => void
  onToggle: () => void
  onSeek: (t: number) => void
  onSpeed: (s: number) => void
  onClose: () => void
}) {
  const now = Date.now()
  return (
    <div className="absolute bottom-3 left-3 right-24 z-10 rounded-xl border border-gray-800 bg-gray-950/90 px-3 py-2 text-xs text-gray-300 backdrop-blur" data-testid="replay-bar">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onToggle} className="rounded-full bg-teal-600 p-1.5 text-white hover:bg-teal-700" aria-label={replay.playing ? 'Pause the replay' : 'Play the replay'}>
          {replay.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <span className="min-w-[8.5rem] tabular-nums text-gray-100">{clock(replay.cursor)}</span>
        <input type="range" min={replay.start} max={now} step={1000} value={Math.min(replay.cursor, now)} onChange={e => onSeek(Number(e.target.value))}
          aria-label="Replay time" className="min-w-[8rem] flex-1 accent-teal-500" />
        <select value={rangeH} onChange={e => onRange(Number(e.target.value))} aria-label="Replay range" className="rounded border border-gray-800 bg-gray-900 px-1 py-0.5">
          <option value={1}>1 h</option>
          <option value={6}>6 h</option>
          <option value={24}>24 h</option>
        </select>
        <select value={replay.speed} onChange={e => onSpeed(Number(e.target.value))} aria-label="Replay speed" className="rounded border border-gray-800 bg-gray-900 px-1 py-0.5">
          {REPLAY_SPEEDS.map(s => <option key={s.speed} value={s.speed}>{s.label}</option>)}
        </select>
        <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300" aria-label="Close the replay"><X className="h-3.5 w-3.5" /></button>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        {!loaded ? 'Reading the last day of messages…' : count === 0 ? 'No messages in this range.' : `${plural(count, 'message')} in the last ${rangeH} h, played back as pulses.`}
      </p>
    </div>
  )
}
