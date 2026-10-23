import { describe, it, expect } from 'vitest'
import {
  idByName, talkTies, taskTies, liftTies, tiesAmong, outsideTies, workByAgent, waitingOnYou, eventsBetween, eventsWithin,
  type CardLike,
} from '@/lib/world/relations'

const ev = (id: string, from: string, to: string, ts = 1000) => ({ id, ts, from, toAgentId: to })
const byName = idByName([
  { id: 'a1', name: 'crab-gm', alias: 'Crab' },
  { id: 'b2', name: 'pas-lola' },
  { id: 'c3', name: 'tito' },
])

describe('talkTies', () => {
  it('joins the pair whichever way the message went, and counts them', () => {
    const t = talkTies([ev('1', 'crab-gm', 'b2'), ev('2', 'pas-lola', 'a1'), ev('3', 'Crab', 'b2')], byName)
    expect(t).toEqual([{ a: 'a1', b: 'b2', kind: 'talk', weight: 3 }])
  })
  it('skips an outsider, a message to oneself, and matches names without case', () => {
    expect(talkTies([ev('1', 'stranger', 'a1'), ev('2', 'crab-gm', 'a1'), ev('3', 'TITO', 'a1')], byName))
      .toEqual([{ a: 'a1', b: 'c3', kind: 'talk', weight: 1 }])
  })
})

const card = (over: Partial<CardLike>): CardLike => ({ id: 'k', subject: 's', status: 'pending', agentId: 'a1', ...over })

describe('taskTies', () => {
  const resolve = (ref: string) => ({ 'pas-lola': 'b2', c3: 'c3' } as Record<string, string>)[ref]
  it('ties the creator to the holder, the one it waits on, and the co-owners', () => {
    const t = taskTies([
      card({ origin: { agentId: 'b2' } }),
      card({ id: 'k2', status: 'waiting', waitingOn: 'pas-lola' }),
      card({ id: 'k3', owners: ['c3'] }),
    ], resolve)
    expect(t.map(x => [x.a, x.b, x.weight]).sort()).toEqual([['a1', 'b2', 2], ['a1', 'c3', 1]])
  })
  it('ignores waiting on you / outside / hold, finished cards, and unknown owners', () => {
    expect(taskTies([
      card({ status: 'waiting', waitingOn: 'juan' }),
      card({ id: 'k2', status: 'waiting', waitingOn: 'outside' }),
      card({ id: 'k3', status: 'completed', origin: { agentId: 'b2' } }),
      card({ id: 'k4', owners: ['nobody'] }),
    ], resolve)).toEqual([])
  })
})

describe('liftTies', () => {
  const ties = [
    { a: 'a1', b: 'b2', kind: 'talk' as const, weight: 3 },
    { a: 'a1', b: 'c3', kind: 'task' as const, weight: 1 },
    { a: 'b2', b: 'c3', kind: 'task' as const, weight: 2 },
    { a: 'a1', b: 'ghost', kind: 'talk' as const, weight: 9 },
  ]
  const groupOf = new Map([['a1', 'org-x'], ['b2', 'org-y'], ['c3', 'org-y']])
  it('turns ties into arcs between groups and counts the ties inside a group', () => {
    const { arcs, within } = liftTies(ties, groupOf)
    expect(arcs).toEqual([{ from: 'org-x', to: 'org-y', weight: 4, kinds: ['talk', 'task'] }])
    expect(within.get('org-y')).toBe(2)
  })
})

describe('tiesAmong / outsideTies', () => {
  const ties = [
    { a: 'a1', b: 'b2', kind: 'talk' as const, weight: 1 },
    { a: 'a1', b: 'c3', kind: 'talk' as const, weight: 1 },
  ]
  it('keeps the ties inside a set and counts those that leave it', () => {
    expect(tiesAmong(ties, new Set(['a1', 'b2']))).toHaveLength(1)
    expect(Object.fromEntries(outsideTies(ties, new Set(['a1', 'b2'])))).toEqual({ a1: 1 })
  })
})

describe('workByAgent', () => {
  it('counts open cards, overdue ones and those waiting on you, and names the most urgent ask', () => {
    const w = workByAgent([
      card({ id: 'k1', due: '2026-10-01' }),
      card({ id: 'k2', status: 'waiting', waitingOn: 'juan', subject: 'late one', due: '2026-10-20', updatedAt: '2026-10-01' }),
      card({ id: 'k3', status: 'waiting', waitingOn: 'juan', subject: 'sooner', due: '2026-10-10', waitingNote: 'ok to ship?' }),
      card({ id: 'k4', status: 'completed' }),
      card({ id: 'k5', assigneeAgentId: 'b2', agentId: 'a1' }),
    ], '2026-10-23')
    expect(w.get('a1')).toMatchObject({ open: 3, overdue: 3, waitingOnYou: 2, ask: { id: 'k3', subject: 'sooner', note: 'ok to ship?' } })
    expect(w.get('b2')).toMatchObject({ open: 1, waitingOnYou: 0 })
  })
})

describe('waitingOnYou', () => {
  it('lists only cards waiting on you, soonest due first', () => {
    const l = waitingOnYou([
      card({ id: 'x', status: 'waiting', waitingOn: 'juan', due: '2026-11-01' }),
      card({ id: 'y', status: 'waiting', waitingOn: 'juan' }),
      card({ id: 'z', status: 'waiting', waitingOn: 'hold' }),
      card({ id: 'w', status: 'waiting', waitingOn: 'juan', due: '2026-10-25' }),
    ])
    expect(l.map(c => c.id)).toEqual(['w', 'x', 'y'])
  })
})

describe('event windows', () => {
  const list = [{ ts: 10 }, { ts: 20 }, { ts: 30 }]
  it('eventsBetween is open at the start and closed at the end', () => {
    expect(eventsBetween(list, 10, 30).map(e => e.ts)).toEqual([20, 30])
  })
  it('eventsWithin is the span ending at `until`', () => {
    expect(eventsWithin(list, 30, 15).map(e => e.ts)).toEqual([20, 30])
  })
})
