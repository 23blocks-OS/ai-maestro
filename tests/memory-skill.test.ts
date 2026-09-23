/**
 * Long-term memory as a per-agent skill (v0.42):
 *   - the switch (lib/memory/skill.ts): default on, off means nothing runs
 *   - the night backlog (lib/memory/backlog.ts): keep consolidating agents with
 *     history left, round-robin, until the window closes; skip a stalled agent
 *   - the recall log (lib/memory/recall-log.ts): only injections count
 *   - relation state (lib/memory/relations.ts): the latest statement wins
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'

const HOME = fs.mkdtempSync(path.join(tmpdir(), 'memory-skill-'))
vi.mock('os', async (orig) => {
  const real = await orig<typeof import('os')>()
  return { ...real, default: { ...real, homedir: () => HOME }, homedir: () => HOME }
})

import { readMemorySkill, isMemorySkillEnabled } from '@/lib/memory/skill'
import { writeBacklog, agentsWithBacklog, runBacklogPass, inNightWindow } from '@/lib/memory/backlog'
import { readNewRecalls, RECALL_LOG } from '@/lib/memory/recall-log'
import { relationState, describeRelation, STATED_PREDICATES, type NeighbourRelation } from '@/lib/memory/relations'

const agentsDir = path.join(HOME, '.aimaestro', 'agents')
const agentDir = (id: string) => path.join(agentsDir, id)
function makeAgent(id: string, skill?: object) {
  fs.mkdirSync(agentDir(id), { recursive: true })
  if (skill) fs.writeFileSync(path.join(agentDir(id), 'skill-settings.json'), JSON.stringify(skill))
}

beforeEach(() => {
  fs.rmSync(agentsDir, { recursive: true, force: true })
  fs.mkdirSync(agentsDir, { recursive: true })
})
afterAll(() => fs.rmSync(HOME, { recursive: true, force: true }))

describe('memory skill switch', () => {
  it('is on by default: the fleet builds memory until an agent is switched off', () => {
    makeAgent('a1')
    expect(readMemorySkill('a1')).toEqual({ enabled: true, recall: true })
  })

  it('reads old settings files, which only had enabled', () => {
    makeAgent('a1', { memory: { enabled: true, consolidation: { schedule: 'nightly' } } })
    expect(readMemorySkill('a1')).toEqual({ enabled: true, recall: true })
  })

  it('off turns recall off too: an agent without memory has nothing to recall', () => {
    makeAgent('a1', { memory: { enabled: false, recall: true } })
    expect(readMemorySkill('a1')).toEqual({ enabled: false, recall: false })
  })

  it('recall can be off while memory is still built', () => {
    makeAgent('a1', { memory: { enabled: true, recall: false } })
    expect(readMemorySkill('a1')).toEqual({ enabled: true, recall: false })
  })

  it('never reads outside the agents directory', () => {
    expect(isMemorySkillEnabled('../../etc')).toBe(true) // default, not a file read
  })
})

describe('night backlog', () => {
  const state = (moreRemaining: boolean, at: number) => ({ moreRemaining, at, conversationsProcessed: 3, memoriesCreated: 5 })

  it('lists agents with history left, least recently run first, skill on only', () => {
    makeAgent('old'); writeBacklog('old', state(true, 100))
    makeAgent('new'); writeBacklog('new', state(true, 200))
    makeAgent('done'); writeBacklog('done', state(false, 50))
    makeAgent('off', { memory: { enabled: false } }); writeBacklog('off', state(true, 10))
    makeAgent('never')
    expect(agentsWithBacklog()).toEqual(['old', 'new'])
  })

  it('works the backlog round-robin until nothing is left', async () => {
    makeAgent('a'); writeBacklog('a', state(true, 1))
    makeAgent('b'); writeBacklog('b', state(true, 2))
    const left: Record<string, number> = { a: 2, b: 1 }
    const order: string[] = []
    const r = await runBacklogPass(async (id) => {
      order.push(id)
      left[id]--
      writeBacklog(id, state(left[id] > 0, Date.now() + order.length))
      return { conversations_processed: 3 }
    }, { inWindow: () => true })
    expect(order).toEqual(['a', 'b', 'a'])
    expect(r).toMatchObject({ runs: 3, agents: 2, stoppedBecause: 'no_backlog' })
  })

  it('stops when the night window closes', async () => {
    makeAgent('a'); writeBacklog('a', state(true, 1))
    let calls = 0
    const r = await runBacklogPass(async () => { calls++; return { conversations_processed: 1 } }, { inWindow: () => calls < 2 })
    expect(r.stoppedBecause).toBe('window_closed')
    expect(calls).toBe(2)
  })

  it('skips an agent that makes no progress (usage limit, outage) for the rest of the night', async () => {
    makeAgent('stuck'); writeBacklog('stuck', state(true, 1))
    const consolidate = vi.fn(async () => ({ conversations_processed: 0 }))
    const r = await runBacklogPass(consolidate, { inWindow: () => true })
    expect(consolidate).toHaveBeenCalledTimes(1)
    expect(r.stoppedBecause).toBe('no_backlog')
  })

  it('runs only between 2 and 8 AM', () => {
    const at = (h: number) => new Date(2026, 8, 23, h, 30)
    expect(inNightWindow(at(1))).toBe(false)
    expect(inNightWindow(at(2))).toBe(true)
    expect(inNightWindow(at(7))).toBe(true)
    expect(inNightWindow(at(8))).toBe(false)
  })
})

describe('recall log', () => {
  it('reads whole lines only, and resumes from the last fold', () => {
    makeAgent('a')
    const file = path.join(agentDir('a'), RECALL_LOG)
    fs.writeFileSync(file, JSON.stringify({ at: 1, ids: ['m1'] }) + '\n' + JSON.stringify({ at: 2, ids: ['m2', 'm1'] }) + '\n{"at": 3, "ids": ["m3')
    const first = readNewRecalls('a')
    expect(first.entries.map(e => e.ids)).toEqual([['m1'], ['m2', 'm1']])
    // The torn line is not consumed: it is read once the hook finishes it
    fs.writeFileSync(path.join(agentDir('a'), 'memory-recalls.offset'), String(first.end))
    fs.appendFileSync(file, '"]}\n')
    expect(readNewRecalls('a').entries.map(e => e.ids)).toEqual([['m3']])
  })

  it('is empty when the agent was never recalled', () => {
    makeAgent('a')
    expect(readNewRecalls('a').entries).toEqual([])
  })
})

describe('relation state', () => {
  it('holds when nothing says otherwise (relations from before statements)', () => {
    expect(relationState([])).toEqual({ holds: true, last_said_at: null })
  })

  it('the most recent statement wins, whatever order history was processed in', () => {
    // Backfill runs newest first: the "moved off" statement is processed before the older "runs on"
    expect(relationState([{ said_at: 200, holds: false }, { said_at: 100, holds: true }])).toEqual({ holds: false, last_said_at: 200 })
    expect(relationState([{ said_at: 100, holds: false }, { said_at: 300, holds: true }])).toEqual({ holds: true, last_said_at: 300 })
  })

  it('reads as a sentence, with ended and weight', () => {
    const r: NeighbourRelation = { direction: 'in', predicate: 'stores_data_in', entity_id: 'e', name: 'winepro', type: 'product', holds: true, weight: 3, last_said_at: 1 }
    expect(describeRelation('products.public', r)).toBe('winepro stores data in products.public (3 sessions)')
    expect(describeRelation('api', { ...r, direction: 'out', predicate: 'runs_on', name: 'mini-lola', holds: false, weight: 1 })).toBe('api runs on mini-lola (no longer)')
  })

  it('new relations are never stated with the ambiguous legacy "stores"', () => {
    expect(STATED_PREDICATES).not.toContain('stores')
    expect(STATED_PREDICATES).toContain('stores_data_in')
  })
})
