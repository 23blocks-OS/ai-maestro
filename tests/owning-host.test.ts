import { describe, it, expect, beforeEach, vi } from 'vitest'

const hosts = vi.hoisted(() => ({ list: [] as any[] }))
vi.mock('@/lib/hosts-config', () => ({
  getHosts: () => hosts.list,
  isSelf: (id: string) => id === 'me',
}))

import { findPeerHostUrl, forgetPeerHost } from '@/lib/owning-host'

beforeEach(() => {
  forgetPeerHost('a1')
  hosts.list = [
    { id: 'me', url: 'http://100.104.178.57:23000' },
    { id: 'mac-mini', url: 'http://100.80.12.6:23000/' },
    { id: 'mini-lola', url: 'http://100.76.17.128:23000' },
    { id: 'down', url: 'http://100.91.186.114:23000', enabled: false },
  ]
})

describe('findPeerHostUrl', () => {
  it('returns the peer that knows the agent, asking only enabled peers and never this host', async () => {
    const asked: string[] = []
    const f = vi.fn(async (url: string) => { asked.push(url); return { ok: url.startsWith('http://100.80.12.6') } as any })
    expect(await findPeerHostUrl('a1', f as any)).toBe('http://100.80.12.6:23000')
    expect(asked.sort()).toEqual(['http://100.76.17.128:23000/api/agents/a1', 'http://100.80.12.6:23000/api/agents/a1'])
  })

  it('remembers the answer, so the cards polling every 3 seconds do not probe every time', async () => {
    const f = vi.fn(async () => ({ ok: true }) as any)
    await findPeerHostUrl('a1', f as any)
    const calls = f.mock.calls.length
    await findPeerHostUrl('a1', f as any)
    expect(f.mock.calls.length).toBe(calls)
  })

  it('is undefined when no peer knows it or a peer is unreachable', async () => {
    const f = vi.fn(async (url: string) => { if (url.includes('100.80.12.6')) throw new Error('timeout'); return { ok: false } as any })
    expect(await findPeerHostUrl('a1', f as any)).toBeUndefined()
  })
})
