import { describe, it, expect, beforeEach, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

vi.mock('@/lib/agent-runtime', () => ({ getRuntime: () => ({ listSessions: async () => [] }) }))
vi.mock('@/lib/agent-registry', () => ({ getAgentBySession: () => null, getAgent: () => null, getAgentByName: () => null }))
vi.mock('@/lib/messageQueue', () => ({ listInboxMessages: async () => [], getMessage: async () => null }))
vi.mock('@/lib/notification-service', () => ({ messageRef: (id: string) => id.slice(-8) }))
vi.mock('@/lib/wake-chain', () => ({
  runWakeChain: async () => ({ confirmed: true, notified: true, deferred: false, attempts: [] }),
  describeWakeResult: () => 'pane:confirmed',
}))
const enqueue = vi.fn()
vi.mock('@/lib/wake-queue', () => ({ enqueueWake: (...a: unknown[]) => enqueue(...a) }))

import { ringDoorbell, type DoorbellDeps } from '@/lib/doorbell'
import { ringDoorbellService } from '@/services/doorbell-service'
import { __resetWakeState, recordWake, getWakeRecord } from '@/lib/wake-state'

const NOW = Date.parse('2026-10-06T12:00:00Z')
const msg = (id: string, extra: Record<string, unknown> = {}) => ({
  id, from: 'a@t.p', fromAlias: 'a', to: 'b', timestamp: new Date(NOW - 5000).toISOString(), subject: 's',
  priority: 'normal', status: 'unread', type: 'request', preview: 'hi', ...extra,
}) as any

function deps(over: Partial<DoorbellDeps> = {}) {
  const wakes: string[] = []
  const logs: string[] = []
  const d: DoorbellDeps = {
    now: () => NOW,
    mode: () => 'on',
    candidates: async () => [],
    unread: async () => [msg('m1')],
    body: async () => 'body',
    wake: async (ctx) => { wakes.push(ctx.agentName + ':' + ctx.messageId); return { confirmed: true, confirmedBy: 'pane', notified: true, deferred: false, attempts: [] } },
    log: (l) => logs.push(l),
    resolve: (r) => (r === 'nobody' ? null : { agentId: 'id-A', agentName: 'A', sessionName: 'A' }),
    ...over,
  }
  return { d, wakes, logs }
}

beforeEach(() => {
  process.env.AIM_WAKE_STATE_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bell-')), 'state.json')
  fs.writeFileSync(process.env.AIM_WAKE_STATE_FILE, '{}')
  __resetWakeState()
  enqueue.mockClear()
})

describe('doorbell', () => {
  it('wakes the recipient at once for an unread message and records the hand-off', async () => {
    const { d, wakes } = deps()
    expect(await ringDoorbell({ recipient: 'A', messageId: 'm1' }, d)).toEqual({ status: 'woken', agentName: 'A' })
    expect(wakes).toEqual(['A:m1'])
    expect(getWakeRecord('id-A', 'm1')?.count).toBe(1)
  })

  it('is idempotent: a second ring, or a message the push/poll/sweeper handled, wakes nobody', async () => {
    const { d, wakes } = deps()
    await ringDoorbell({ recipient: 'A', messageId: 'm1' }, d)
    expect((await ringDoorbell({ recipient: 'A', messageId: 'm1' }, d)).status).toBe('already_handled')
    recordWake('id-A', 'm2', NOW - 1000)
    expect((await ringDoorbell({ recipient: 'A', messageId: 'm2' }, deps({ unread: async () => [msg('m2')] }).d)).status).toBe('already_handled')
    expect(wakes).toEqual(['A:m1'])
  })

  it('does nothing for an unknown recipient, a missing message, a read message or a system message', async () => {
    const { d, wakes } = deps()
    expect((await ringDoorbell({ recipient: 'nobody', messageId: 'm1' }, d)).status).toBe('unknown_recipient')
    expect((await ringDoorbell({ recipient: 'A', messageId: 'zzz' }, d)).status).toBe('not_found')
    expect((await ringDoorbell({ recipient: 'A', messageId: 'm1' }, deps({ unread: async () => [msg('m1', { status: 'read' })] }).d)).status).toBe('not_unread')
    expect((await ringDoorbell({ recipient: 'A', messageId: 'm1' }, deps({ unread: async () => [msg('m1', { type: 'system' })] }).d)).status).toBe('not_unread')
    expect(wakes).toEqual([])
  })

  it('honours AIM_INBOX_SWEEP: off rings nothing, shadow only logs and records nothing', async () => {
    const off = deps({ mode: () => 'off' })
    expect((await ringDoorbell({ recipient: 'A', messageId: 'm1' }, off.d)).status).toBe('disabled')
    const sh = deps({ mode: () => 'shadow' })
    expect((await ringDoorbell({ recipient: 'A', messageId: 'm1' }, sh.d)).status).toBe('shadow')
    expect(sh.logs.join('')).toContain('shadow: would wake A')
    expect(off.wakes.concat(sh.wakes)).toEqual([])
    expect(getWakeRecord('id-A', 'm1')).toBeUndefined()
  })

  it('two simultaneous rings for one message wake once', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const { d, wakes } = deps({ unread: async () => { await gate; return [msg('m1')] } })
    const a = ringDoorbell({ recipient: 'A', messageId: 'm1' }, d)
    const b = ringDoorbell({ recipient: 'A', messageId: 'm1' }, d)
    release()
    const results = (await Promise.all([a, b])).map((r) => r.status).sort()
    expect(results).toEqual(['in_progress', 'woken'])
    expect(wakes).toEqual(['A:m1'])
  })

  it('a failing inbox read or wake is reported, never thrown', async () => {
    const r1 = await ringDoorbell({ recipient: 'A', messageId: 'm1' }, deps({ unread: async () => { throw new Error('x') } }).d)
    expect(r1.status).toBe('error')
    const r2 = await ringDoorbell({ recipient: 'A', messageId: 'm1' }, deps({ wake: async () => { throw new Error('y') } }).d)
    expect(r2.status).toBe('error')
    expect(getWakeRecord('id-A', 'm1')).toBeUndefined()
  })

  it('queues an unconfirmed wake for retry, like the sweeper', async () => {
    const { d } = deps({ wake: async () => ({ confirmed: false, notified: false, deferred: false, attempts: [] }) })
    await ringDoorbell({ recipient: 'A', messageId: 'm1' }, d)
    expect(enqueue).toHaveBeenCalledTimes(1)
  })
})

describe('doorbell service validation', () => {
  it('rejects a missing or malformed body without touching anything', async () => {
    expect((await ringDoorbellService(null)).status).toBe(400)
    expect((await ringDoorbellService({ recipient: 'A' })).status).toBe(400)
    expect((await ringDoorbellService({ recipient: 'a b; rm -rf', messageId: 'm1' })).status).toBe(400)
    expect((await ringDoorbellService({ recipient: 'A', messageId: '../etc' })).status).toBe(400)
  })
})
