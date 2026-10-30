/**
 * The inbox poll must not overlap itself, must time out its self-fetches, and
 * must find the agent's session from local sessions only (no cross-host fan-out).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('@/lib/agent-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent-registry')>()
  return { ...actual, getAgent: () => ({ id: 'a1', name: 'alpha', sessions: [{ index: 0 }] }) }
})
vi.mock('@/lib/hosts-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hosts-config')>()
  return { ...actual, getSelfHost: () => ({ id: 'self', url: 'http://self:23000' }) }
})

import { AgentSubconscious } from '@/lib/agent'

let home: string
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'poll-guard-'))
  vi.stubEnv('HOME', home)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  fs.rmSync(home, { recursive: true, force: true })
})

describe('AgentSubconscious message poll', () => {
  it('does not start a second check while one is in flight', async () => {
    let release!: (r: Response) => void
    const fetchMock = vi.fn(() => fetchMock.mock.calls.length === 1
      ? new Promise<Response>(r => { release = r })
      : Promise.resolve(new Response(JSON.stringify({ messages: [] }))))
    vi.stubGlobal('fetch', fetchMock)
    const sub = new AgentSubconscious('a1', {} as never) as unknown as { checkMessages(): Promise<void> }
    const first = sub.checkMessages()
    await sub.checkMessages()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(new Response(JSON.stringify({ messages: [] })))
    await first
    await sub.checkMessages()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('times out its fetches and looks up only local sessions', async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init])
      if (url.includes('/api/messages')) return new Response(JSON.stringify({ messages: [{ id: 'm1' }] }))
      if (url.includes('/api/sessions?')) return new Response(JSON.stringify({ sessions: [{ id: 'alpha' }] }))
      return new Response(JSON.stringify({ submitted: true }))
    }))
    const sub = new AgentSubconscious('a1', {} as never) as unknown as { checkMessages(): Promise<void> }
    await sub.checkMessages()
    const urls = calls.map(c => c[0])
    expect(urls.some(u => u.endsWith('/api/sessions?local=true'))).toBe(true)
    expect(urls.some(u => u.endsWith('/api/sessions'))).toBe(false)
    expect(calls.length).toBe(3)
    for (const [, init] of calls) expect(init?.signal).toBeInstanceOf(AbortSignal)
  })
})
