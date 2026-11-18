import { describe, it, expect } from 'vitest'
import { activeAt } from '@/services/agents-core-service'

const s = (status: 'online' | 'offline', lastActive?: string) => ({ index: 0, status, lastActive }) as any

describe('activeAt', () => {
  it('uses the newest online session activity, not the time of the listing', () => {
    const at = activeAt([s('online', '2026-11-16T10:00:00.000Z'), s('offline', '2026-11-16T12:00:00.000Z')], undefined)
    expect(at).toBe('2026-11-16T10:00:00.000Z')
    expect(activeAt([s('online', '2026-11-16T10:00:00.000Z')], undefined)).toBe(at) // same answer on the next listing
  })

  it('takes a newer heartbeat over the session time', () => {
    const hb = Date.parse('2026-11-16T11:00:00.000Z')
    expect(activeAt([s('online', '2026-11-16T10:00:00.000Z')], hb)).toBe('2026-11-16T11:00:00.000Z')
    expect(activeAt([], hb)).toBe('2026-11-16T11:00:00.000Z')
  })

  it('falls back to the stored value when there is no time at all', () => {
    expect(activeAt([s('online')], undefined, '2026-11-01T00:00:00.000Z')).toBe('2026-11-01T00:00:00.000Z')
  })
})
