import { describe, it, expect, beforeEach, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

vi.mock('@/lib/agent-runtime', () => ({ getRuntime: () => ({ listSessions: async () => [] }) }))
vi.mock('@/lib/agent-registry', () => ({ getAgentBySession: () => null }))
vi.mock('@/lib/messageQueue', () => ({ listInboxMessages: async () => [], getMessage: async () => null }))
vi.mock('@/lib/notification-service', () => ({ messageRef: (id: string) => id.slice(-8) }))
vi.mock('@/lib/wake-chain', () => ({
  runWakeChain: async () => ({ confirmed: true, notified: true, deferred: false, attempts: [] }),
  describeWakeResult: (r: any) => (r.attempts || []).map((a: any) => `${a.adapter}:${a.status}`).join(' → '),
}))
const enqueue = vi.fn()
vi.mock('@/lib/wake-queue', () => ({ enqueueWake: (...a: unknown[]) => enqueue(...a) }))

import { sweepOnce, GRACE_MS, MAX_AGE_MS, REHAND_BACKOFF_MS, MAX_HANDOFFS, MAX_WAKES_PER_SWEEP, sweepMode, type SweepDeps } from '@/lib/inbox-sweeper'
import { __resetWakeState, recordWake, getWakeRecord } from '@/lib/wake-state'

const NOW = Date.parse('2026-10-06T12:00:00Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const msg = (id: string, msAgo: number, extra: Record<string, unknown> = {}) => ({
  id, from: 'a@t.p', fromAlias: 'a', to: 'b', timestamp: iso(msAgo), subject: 's', priority: 'normal',
  status: 'unread', type: 'request', preview: 'hi', ...extra,
}) as any

function deps(over: Partial<SweepDeps> & { unreadBy?: Record<string, any[]>; agents?: string[] } = {}) {
  const agents = over.agents ?? ['A']
  const wakes: string[] = []
  const logs: string[] = []
  const d: SweepDeps = {
    now: () => NOW,
    mode: () => 'on',
    candidates: async () => agents.map((n) => ({ agentId: `id-${n}`, agentName: n, sessionName: n })),
    unread: async (id) => (over.unreadBy ?? {})[id.replace('id-', '')] ?? [],
    body: async () => 'body',
    wake: async (ctx) => { wakes.push(ctx.agentName + ':' + ctx.messageId); return { confirmed: true, confirmedBy: 'pane', notified: true, deferred: false, attempts: [] } },
    log: (l) => logs.push(l),
    ...over,
  }
  return { d, wakes, logs }
}

beforeEach(() => {
  process.env.AIM_WAKE_STATE_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wake-')), 'state.json')
  fs.writeFileSync(process.env.AIM_WAKE_STATE_FILE, '{}') // not a first run
  __resetWakeState()
  enqueue.mockClear()
})

describe('inbox sweeper', () => {
  it('wakes a new unread message once, then not again inside the backoff', async () => {
    const { d, wakes } = deps({ unreadBy: { A: [msg('m1', 5 * 60_000)] } })
    await sweepOnce(d)
    await sweepOnce(d)
    expect(wakes).toEqual(['A:m1'])
    expect(getWakeRecord('id-A', 'm1')?.count).toBe(1)
  })

  it('wakes an agent that is not loaded anywhere (the incident): candidates come from sessions, not the cache', async () => {
    const { d, wakes } = deps({ agents: ['counsel'], unreadBy: { counsel: [msg('m9', 47 * 60_000)] } })
    await sweepOnce(d)
    expect(wakes).toEqual(['counsel:m9'])
  })

  it('re-hands a still-unread message after the backoff, and stops at the cap', async () => {
    const { d, wakes } = deps({ unreadBy: { A: [msg('m1', 3 * 3600_000)] } })
    await sweepOnce(d)
    let t = NOW
    for (let i = 0; i < 6; i++) {
      t += 61 * 60_000
      await sweepOnce({ ...d, now: () => t })
    }
    expect(wakes.length).toBe(MAX_HANDOFFS)
  })

  it('does not re-hand before the first backoff elapses', async () => {
    const { d, wakes } = deps({ unreadBy: { A: [msg('m1', 3600_000)] } })
    await sweepOnce(d)
    await sweepOnce({ ...d, now: () => NOW + REHAND_BACKOFF_MS[0] - 1000 })
    expect(wakes.length).toBe(1)
  })

  it('skips read messages, system types, too-fresh and too-old messages', async () => {
    const { d, wakes } = deps({ unreadBy: { A: [
      msg('read', 5 * 60_000, { status: 'read' }),
      msg('sys', 5 * 60_000, { type: 'system' }),
      msg('fresh', GRACE_MS - 5000),
      msg('old', MAX_AGE_MS + 60_000),
    ] } })
    await sweepOnce(d)
    expect(wakes).toEqual([])
  })

  it('treats a wake already recorded by the push or the poll as handled', async () => {
    recordWake('id-A', 'm1', NOW - 120_000)
    const { d, wakes } = deps({ unreadBy: { A: [msg('m1', 5 * 60_000)] } })
    await sweepOnce(d)
    expect(wakes).toEqual([])
  })

  it('one wake per agent per sweep; every unread message is marked handed over', async () => {
    const { d, wakes } = deps({ unreadBy: { A: [msg('m1', 600_000), msg('m2', 300_000), msg('m3', 200_000)] } })
    await sweepOnce(d)
    expect(wakes).toEqual(['A:m3'])
    for (const id of ['m1', 'm2', 'm3']) expect(getWakeRecord('id-A', id)?.count).toBe(1)
  })

  it('caps wakes per sweep', async () => {
    const names = Array.from({ length: MAX_WAKES_PER_SWEEP + 3 }, (_, i) => `ag${i}`)
    const unreadBy = Object.fromEntries(names.map((n) => [n, [msg('m-' + n, 600_000)]]))
    const { d, wakes } = deps({ agents: names, unreadBy })
    await sweepOnce(d)
    expect(wakes.length).toBe(MAX_WAKES_PER_SWEEP)
  })

  it('shadow mode logs and wakes nothing, and records nothing', async () => {
    const { d, wakes, logs } = deps({ mode: () => 'shadow', unreadBy: { A: [msg('m1', 600_000)] } })
    const r = await sweepOnce(d)
    expect(wakes).toEqual([])
    expect(r.wouldWake).toEqual(['A:m1'])
    expect(logs.join('\n')).toContain('shadow: would wake A')
    expect(getWakeRecord('id-A', 'm1')).toBeUndefined()
  })

  it('off mode does nothing, not even listing sessions', async () => {
    const candidates = vi.fn(async () => [])
    const { d } = deps({ mode: () => 'off', candidates })
    await sweepOnce(d)
    expect(candidates).not.toHaveBeenCalled()
  })

  it('first run with no state file baselines unread mail and wakes nothing, once', async () => {
    fs.rmSync(process.env.AIM_WAKE_STATE_FILE!)
    __resetWakeState()
    const { d, wakes } = deps({ unreadBy: { A: [msg('old1', 5 * 3600_000)] } })
    const r1 = await sweepOnce(d)
    expect(r1.baselined).toBe(1)
    expect(wakes).toEqual([])
    // a message arriving after the baseline wakes normally
    const { d: d2, wakes: w2 } = deps({ unreadBy: { A: [msg('old1', 5 * 3600_000), msg('new1', 5 * 60_000)] } })
    await sweepOnce(d2)
    expect(w2).toEqual(['A:new1'])
  })

  it('a corrupt state file starts clean without crashing or waking old mail', async () => {
    fs.writeFileSync(process.env.AIM_WAKE_STATE_FILE!, '{not json')
    __resetWakeState()
    const { d, wakes } = deps({ unreadBy: { A: [msg('old1', 5 * 3600_000)] } })
    await sweepOnce(d)
    expect(wakes).toEqual([])
  })

  it('queues an unconfirmed wake for retry; a deferred one is left to the pane route', async () => {
    const { d } = deps({ unreadBy: { A: [msg('m1', 600_000)] }, wake: async () => ({ confirmed: false, notified: false, deferred: false, attempts: [] }) })
    await sweepOnce(d)
    expect(enqueue).toHaveBeenCalledTimes(1)
    enqueue.mockClear()
    const { d: d2 } = deps({ unreadBy: { A: [msg('m2', 600_000)] }, wake: async () => ({ confirmed: false, notified: false, deferred: true, attempts: [] }) })
    await sweepOnce(d2)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('a failing wake or a failing inbox read for one agent does not stop the others', async () => {
    const { d, wakes } = deps({
      agents: ['bad', 'A'],
      unread: async (id) => { if (id === 'id-bad') throw new Error('x'); return [msg('m1', 600_000)] },
    })
    await sweepOnce(d)
    expect(wakes).toEqual(['A:m1'])
  })

  it('mode defaults to shadow and honours the env switch', () => {
    delete process.env.AIM_INBOX_SWEEP
    expect(sweepMode()).toBe('shadow')
    process.env.AIM_INBOX_SWEEP = 'on'
    expect(sweepMode()).toBe('on')
    process.env.AIM_INBOX_SWEEP = 'off'
    expect(sweepMode()).toBe('off')
    process.env.AIM_INBOX_SWEEP = 'garbage'
    expect(sweepMode()).toBe('shadow')
    delete process.env.AIM_INBOX_SWEEP
  })
})
