/** F118: a chat send quarantined for approval shows as held (no Retry), then delivered, rejected or expired. */
import { describe, it, expect } from 'vitest'
import { markQuarantined, quarantineOutcome, expireQuarantined } from '@/lib/pending-reconcile.mjs'

const quarantine = { id: 'qtn_1763650000_abc123', expiresAt: '2026-11-20T14:30:00.000Z' }
const reason = 'Held for approval by Alice (quarantine qtn_1763650000_abc123, expires 2026-11-20 14:30 UTC): ...'

describe('quarantined chat bubbles', () => {
  it('chat:quarantined turns the matching sending bubble into quarantined, with the reason', () => {
    const p = [{ id: 'x', text: 'other', status: 'sending' }, { id: 'y', text: 'pay  the\ninvoice', status: 'sending' }]
    const next = markQuarantined(p, { message: 'pay the invoice', reason, quarantine })
    expect(next[1]).toMatchObject({ status: 'quarantined', note: reason, quarantineId: quarantine.id, expiresAt: quarantine.expiresAt })
    expect(next[0]).toBe(p[0])
    expect(markQuarantined(p, { message: 'nope', reason, quarantine })).toBe(p)
  })

  it('chat:quarantineOutcome finds the bubble by quarantine id', () => {
    const held = [{ id: 'y', text: 'hi', status: 'quarantined', quarantineId: quarantine.id }]
    expect(quarantineOutcome(held, { quarantineId: quarantine.id, outcome: 'delivered', text: 'approved' })[0]).toMatchObject({ status: 'delivered' })
    for (const outcome of ['rejected', 'expired', 'failed']) {
      expect(quarantineOutcome(held, { quarantineId: quarantine.id, outcome, text: 'why' })[0]).toMatchObject({ status: 'rejected', note: 'why' })
    }
    expect(quarantineOutcome(held, { quarantineId: 'qtn_1_ffffff', outcome: 'rejected' })).toBe(held)
  })

  it('a quarantined bubble whose outcome never came shows as expired a minute after the entry', () => {
    const held = [{ id: 'y', text: 'hi', status: 'quarantined', quarantineId: quarantine.id, expiresAt: quarantine.expiresAt }]
    const at = Date.parse(quarantine.expiresAt)
    expect(expireQuarantined(held, at + 30_000)).toBe(held)
    expect(expireQuarantined(held, at + 61_000)[0]).toMatchObject({ status: 'rejected', note: expect.stringContaining('expired') })
  })
})
