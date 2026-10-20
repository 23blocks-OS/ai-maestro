import { describe, it, expect } from 'vitest'
import { broadcastToMeeting, type BroadcastDeps, type BroadcastResult } from '@/services/meeting-broadcast-service'

// A meeting with agents on TWO hosts: A and B live on this host, R lives on a peer, G lives nowhere we know.
const LOCAL: Record<string, { id: string; name: string; label?: string; hostId: string }> = {
  'agent-a': { id: 'agent-a', name: 'alpha', label: 'Alma', hostId: 'self' },
  'agent-b': { id: 'agent-b', name: 'beta', hostId: 'self' },
}
const PEER = 'http://peer.test:23000'

function makeDeps(over: Partial<BroadcastDeps> = {}) {
  const sentLocal: any[] = []
  const sentRemote: Array<{ url: string; body: any }> = []
  const deps: BroadcastDeps = {
    getAgent: (id) => LOCAL[id] || null,
    findPeerHostUrl: async (id) => (id === 'agent-r' ? PEER : undefined),
    sendLocal: async (body) => { sentLocal.push(body); return { data: { notified: true, verified: true }, status: 201 } },
    fetchImpl: (async (url: any, init: any) => {
      sentRemote.push({ url: String(url), body: JSON.parse(init.body) })
      return new Response(JSON.stringify({ notified: true, verified: false, deferred: true }), { status: 201 })
    }) as typeof fetch,
    ...over,
  }
  return { deps, sentLocal, sentRemote }
}
const D = (r: { data?: unknown }) => r.data as BroadcastResult
const base = { meetingId: 'm1', teamName: 'Standup', message: 'hello team', participantIds: ['agent-a', 'agent-b', 'agent-r'] }

describe('broadcastToMeeting', () => {
  it('reaches local and remote agents and answers per agent', async () => {
    const { deps, sentLocal, sentRemote } = makeDeps()
    const r = await broadcastToMeeting(base, deps)
    expect(r.status).toBe(200)
    expect(D(r).delivered).toBe(3)
    expect(D(r).failed).toBe(0)
    expect(sentLocal.map(b => b.to).sort()).toEqual(['agent-a', 'agent-b'])
    // The remote agent's message goes to the host that owns it
    expect(sentRemote).toHaveLength(1)
    expect(sentRemote[0].url).toBe(`${PEER}/api/messages`)
    expect(sentRemote[0].body.to).toBe('agent-r')
    const remote = D(r).results.find(x => x.agentId === 'agent-r')!
    expect(remote.deferred).toBe(true)
    expect(remote.verified).toBe(false)
  })

  it('tags the message for the meeting and tells everyone who is in it', async () => {
    const { deps, sentLocal } = makeDeps()
    await broadcastToMeeting(base, deps)
    expect(sentLocal[0].subject).toBe('[MEETING:m1] Standup')
    expect(sentLocal[0].content.context.meeting).toMatchObject({ meetingId: 'm1', participantIds: base.participantIds, isBroadcast: true })
  })

  it('names the agent by its label', async () => {
    const { deps } = makeDeps()
    const r = await broadcastToMeeting(base, deps)
    expect(D(r).results.find(x => x.agentId === 'agent-a')!.name).toBe('Alma')
  })

  it('reports an agent that exists on no host instead of dropping it', async () => {
    const { deps } = makeDeps()
    const r = await broadcastToMeeting({ ...base, participantIds: ['agent-a', 'ghost'] }, deps)
    expect(D(r).delivered).toBe(1)
    const ghost = D(r).results.find(x => x.agentId === 'ghost')!
    expect(ghost.status).toBe('failed')
    expect(ghost.error).toMatch(/no other host has it/)
  })

  it('a failed local send is reported with its reason; the others still go', async () => {
    const { deps } = makeDeps({
      sendLocal: async (body: any) => body.to === 'agent-b'
        ? { data: { message: 'Message delivery failed for beta: inbox full' }, status: 500 }
        : { data: { notified: true }, status: 201 },
    })
    const r = await broadcastToMeeting(base, deps)
    expect(D(r).delivered).toBe(2)
    const b = D(r).results.find(x => x.agentId === 'agent-b')!
    expect(b.status).toBe('failed')
    expect(b.error).toContain('inbox full')
  })

  it('a peer that is down fails only its agents', async () => {
    const { deps } = makeDeps({ fetchImpl: (async () => { throw new TypeError('fetch failed') }) as typeof fetch })
    const r = await broadcastToMeeting(base, deps)
    expect(D(r).delivered).toBe(2)
    expect(D(r).results.find(x => x.agentId === 'agent-r')!.status).toBe('failed')
  })

  it('a peer that times out says so, and does not hold up the local agents', async () => {
    const order: string[] = []
    const { deps } = makeDeps({
      sendLocal: async (b: any) => { order.push(b.to); return { data: { notified: true }, status: 201 } },
      fetchImpl: (async () => { await new Promise(r => setTimeout(r, 30)); throw new DOMException('timed out', 'TimeoutError') }) as typeof fetch,
    })
    const r = await broadcastToMeeting(base, deps)
    expect(order).toEqual(['agent-a', 'agent-b'])
    expect(D(r).results.find(x => x.agentId === 'agent-r')!.error).toMatch(/did not answer/)
  })

  it('a remote host answering an error is a failure with its message', async () => {
    const { deps } = makeDeps({ fetchImpl: (async () => new Response(JSON.stringify({ message: 'agent is offline' }), { status: 500 })) as typeof fetch })
    const r = await broadcastToMeeting(base, deps)
    const x = D(r).results.find(y => y.agentId === 'agent-r')!
    expect(x.status).toBe('failed')
    expect(x.error).toBe('agent is offline')
  })

  it('a retry sends only to the named recipients', async () => {
    const { deps, sentLocal, sentRemote } = makeDeps()
    const r = await broadcastToMeeting({ ...base, recipients: ['agent-r'] }, deps)
    expect(D(r).results.map(x => x.agentId)).toEqual(['agent-r'])
    expect(sentLocal).toHaveLength(0)
    expect(sentRemote).toHaveLength(1)
  })

  it('sends each agent once even if listed twice', async () => {
    const { deps, sentLocal } = makeDeps()
    await broadcastToMeeting({ ...base, participantIds: ['agent-a', 'agent-a'] }, deps)
    expect(sentLocal).toHaveLength(1)
  })

  it('refuses bad input', async () => {
    const { deps } = makeDeps()
    expect((await broadcastToMeeting({ ...base, message: '  ' }, deps)).status).toBe(400)
    expect((await broadcastToMeeting({ ...base, participantIds: [] }, deps)).status).toBe(400)
    expect((await broadcastToMeeting({ ...base, participantIds: ['../etc'] }, deps)).status).toBe(400)
    expect((await broadcastToMeeting({ ...base, recipients: ['stranger'] }, deps)).status).toBe(400)
    expect((await broadcastToMeeting({ ...base, message: 'x'.repeat(20001) }, deps)).status).toBe(400)
  })
})
