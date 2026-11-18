/**
 * withPaneLock (lib/chat-verify.mjs): sends to one pane run one at a time, in order, and a
 * failed send does not block the next. Three uploads to a busy agent at once were typed into
 * the same input box together and one was lost (2026-11-13).
 */
import { describe, it, expect } from 'vitest'
import { withPaneLock } from '@/lib/chat-verify.mjs'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('withPaneLock', () => {
  it('runs sends to the same pane one at a time, in order', async () => {
    const log: string[] = []
    const send = (n: number, ms: number) => withPaneLock('acme-agent', async () => {
      log.push(`start ${n}`); await sleep(ms); log.push(`end ${n}`); return n
    })
    const results = await Promise.all([send(1, 30), send(2, 5), send(3, 1)])
    expect(results).toEqual([1, 2, 3])
    expect(log).toEqual(['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3'])
  })

  it('lets different panes send at the same time', async () => {
    const log: string[] = []
    const send = (pane: string) => withPaneLock(pane, async () => { log.push(`start ${pane}`); await sleep(10); log.push(`end ${pane}`) })
    await Promise.all([send('acme-a'), send('acme-b')])
    expect(log.slice(0, 2)).toEqual(['start acme-a', 'start acme-b'])
  })

  it('a failed send rejects its caller and does not block the next', async () => {
    const failed = withPaneLock('acme-agent', async () => { throw new Error('tmux gone') })
    const next = withPaneLock('acme-agent', async () => 'sent')
    await expect(failed).rejects.toThrow('tmux gone')
    await expect(next).resolves.toBe('sent')
  })
})
