import { describe, it, expect, vi, beforeEach } from 'vitest'

const getActivity = vi.fn()
const getSnapshots = vi.fn()
const httpGet = vi.fn()

vi.mock('@/services/sessions-service', () => ({ getActivity, httpGet }))
vi.mock('@/services/status-snapshots-service', () => ({ getSnapshots }))

const { GET } = await import('@/app/api/sessions/activity/route')

beforeEach(() => {
  getActivity.mockReset().mockResolvedValue({ lola: { status: 'idle', lastActivity: 'x' } })
  getSnapshots.mockReset().mockReturnValue({ lola: { model: 'claude-opus-5-5' } })
})

describe('GET /api/sessions/activity', () => {
  it('returns the snapshots next to the activity', async () => {
    const res = await GET(new Request('http://x/api/sessions/activity'))
    const body = await res.json()
    expect(body.activity.lola.status).toBe('idle')
    expect(body.snapshots.lola.model).toBe('claude-opus-5-5')
    expect(getSnapshots).toHaveBeenCalledWith({ localOnly: false, httpGet })
  })

  it('answers a host-to-host request with local snapshots only', async () => {
    await GET(new Request('http://x/api/sessions/activity?local=true'))
    expect(getSnapshots).toHaveBeenCalledWith({ localOnly: true, httpGet })
  })

  it('still returns the activity when the snapshots fail', async () => {
    getSnapshots.mockImplementation(() => { throw new Error('boom') })
    const res = await GET(new Request('http://x/api/sessions/activity'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activity.lola.status).toBe('idle')
    expect(body.snapshots).toEqual({})
  })
})
