/** The hosts health check asks the peer for its own sessions only (audit after the 2026-10-29 incident). */
import { describe, it, expect, vi, afterEach } from 'vitest'

const { checkRemoteHealth } = await import('@/services/hosts-service')
afterEach(() => vi.unstubAllGlobals())

describe('hosts health check', () => {
  it('calls the peer with local=true, so the peer does not fan out to its peers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ sessions: [{}, {}] }) })
    vi.stubGlobal('fetch', fetchMock)
    const r = await checkRemoteHealth('http://100.64.0.2:23000')
    expect(fetchMock.mock.calls[0][0]).toBe('http://100.64.0.2:23000/api/sessions?local=true')
    expect((r.data as any)).toMatchObject({ success: true })
  })
})
