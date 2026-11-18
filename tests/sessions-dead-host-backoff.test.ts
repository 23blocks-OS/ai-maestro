import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchRemoteSessions } from '@/services/sessions-service'

afterEach(() => vi.useRealTimers())

describe('fetchRemoteSessions backoff', () => {
  it('skips a host that did not answer, then tries again after the wait', async () => {
    vi.useFakeTimers()
    const dead = vi.fn().mockRejectedValue(new Error('Request timeout'))
    expect(await fetchRemoteSessions('http://dead:23000', 'dead-host', dead)).toEqual([])
    expect(await fetchRemoteSessions('http://dead:23000', 'dead-host', dead)).toEqual([])
    expect(dead).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(30_001)
    const back = vi.fn().mockResolvedValue({ sessions: [{ id: 'a', name: 'a' }] })
    expect(await fetchRemoteSessions('http://dead:23000', 'dead-host', back)).toEqual([{ id: 'a', name: 'a', hostId: 'dead-host' }])
    // Answered, so the next call goes straight through
    expect(await fetchRemoteSessions('http://dead:23000', 'dead-host', back)).toHaveLength(1)
    expect(back).toHaveBeenCalledTimes(2)
  })

  it('doubles the wait while the host stays down', async () => {
    vi.useFakeTimers()
    const dead = vi.fn().mockRejectedValue(new Error('Request timeout'))
    await fetchRemoteSessions('http://d2:23000', 'd2', dead)
    vi.advanceTimersByTime(30_001)
    await fetchRemoteSessions('http://d2:23000', 'd2', dead)   // second failure: wait 60 s
    vi.advanceTimersByTime(30_001)
    await fetchRemoteSessions('http://d2:23000', 'd2', dead)   // still inside 60 s
    expect(dead).toHaveBeenCalledTimes(2)
  })
})
