/**
 * Both routers hand the caller server.mjs resolved to the services (lib/caller-identity.ts), and
 * /api/v1/route refuses a mesh claim from an agent session.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassThrough } from 'stream'
import { NextRequest } from 'next/server'
import { CALLER_HEADER, encodeCaller, type Caller } from '@/lib/caller-identity'

const m = vi.hoisted(() => ({
  sendFromUI: vi.fn(async (_o: Record<string, unknown>) => ({ message: { id: 'm1' }, notified: true })),
  listInboxMessages: vi.fn(async () => []),
  recordAmpRefusal: vi.fn(),
}))
vi.mock('@/lib/message-send', () => ({ sendFromUI: m.sendFromUI, forwardFromUI: vi.fn() }))
vi.mock('@/lib/messageQueue', async (o) => ({
  ...(await o<any>()),
  resolveAgentIdentifier: (i: string) => ({ alice: { agentId: 'id-alice', alias: 'alice' }, bob: { agentId: 'id-bob', alias: 'bob' } } as any)[i] || null,
  listInboxMessages: m.listInboxMessages,
}))
vi.mock('@/lib/amp-refusals', async (o) => ({ ...(await o<any>()), recordAmpRefusal: m.recordAmpRefusal }))

import { createHeadlessRouter } from '@/services/headless-router'
import { GET as nextGetMessages, POST as nextPostMessages } from '@/app/api/messages/route'
import { GET as nextGetCaller } from '@/app/api/caller/route'
import { routeMessage } from '@/services/amp-service'

const alice: Caller = { kind: 'agent', agentId: 'id-alice', name: 'alice', via: 'session', mode: 'session', local: true }
const strictAnon: Caller = { kind: 'anonymous', mode: 'strict', local: true }

async function headless(method: string, url: string, caller?: Caller, body?: unknown) {
  const req: any = new PassThrough()
  req.method = method
  req.url = url
  req.headers = { 'content-type': 'application/json', ...(caller ? { [CALLER_HEADER]: encodeCaller(caller) } : {}) }
  const res: any = {
    headersSent: false, status: 0, out: '',
    writeHead(code: number) { this.status = code; this.headersSent = true },
    setHeader() {},
    end(chunk?: string) { this.out += chunk ?? '' },
  }
  const done = createHeadlessRouter().handle(req, res)
  req.end(body === undefined ? '' : JSON.stringify(body))
  await done
  return { status: res.status, json: JSON.parse(res.out || '{}') }
}

function next(method: string, url: string, caller?: Caller, body?: unknown) {
  return new NextRequest(`http://localhost:23000${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(caller ? { [CALLER_HEADER]: encodeCaller(caller) } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const forged = { from: 'bob', to: 'alice', subject: 's', content: { type: 'notification', message: 'hi' } }

beforeEach(() => { vi.clearAllMocks() })

describe('both routers pass the caller to the services', () => {
  it('a forged sender is refused by the Next route and by the headless router', async () => {
    const a = await nextPostMessages(next('POST', '/api/messages', alice, forged))
    expect(a.status).toBe(403)
    expect((await a.json()).error).toBe('sender_mismatch')
    const b = await headless('POST', '/api/messages', alice, forged)
    expect(b).toMatchObject({ status: 403, json: { error: 'sender_mismatch' } })
    expect(m.sendFromUI).not.toHaveBeenCalled()
  })

  it("another agent's inbox is refused by both", async () => {
    expect((await nextGetMessages(next('GET', '/api/messages?agent=bob', alice))).status).toBe(403)
    expect((await headless('GET', '/api/messages?agent=bob', alice)).status).toBe(403)
    expect((await headless('GET', '/api/agents/id-bob/messages', alice)).status).toBe(403)
    expect((await headless('DELETE', '/api/agents/id-bob/messages/x', alice)).status).toBe(403)
    expect((await headless('GET', '/api/meetings/inject-queue?session=bob', alice)).status).toBe(403)
    expect(m.listInboxMessages).not.toHaveBeenCalled()
  })

  it('strict mode refuses an anonymous caller on both', async () => {
    expect((await nextGetMessages(next('GET', '/api/messages?agent=bob', strictAnon))).status).toBe(401)
    expect((await headless('GET', '/api/messages?agent=bob', strictAnon)).status).toBe(401)
  })

  it('default install: the dashboard (no caller header, session mode) works as before', async () => {
    const prev = process.env.AIMAESTRO_CALLER_AUTH
    process.env.AIMAESTRO_CALLER_AUTH = 'session'
    try {
      expect((await nextPostMessages(next('POST', '/api/messages', undefined, forged))).status).toBe(201)
      expect((await headless('GET', '/api/messages?agent=bob')).status).toBe(200)
    } finally {
      if (prev === undefined) delete process.env.AIMAESTRO_CALLER_AUTH; else process.env.AIMAESTRO_CALLER_AUTH = prev
    }
  })

  it('GET /api/caller answers on both', async () => {
    const a = await nextGetCaller(next('GET', '/api/caller', alice))
    expect(await a.json()).toEqual({ kind: 'agent', agentId: 'id-alice', name: 'alice', via: 'session', mode: 'session' })
    expect(await headless('GET', '/api/caller', alice)).toEqual({ status: 200, json: { kind: 'agent', agentId: 'id-alice', name: 'alice', via: 'session', mode: 'session' } })
  })
})

describe('/api/v1/route: an agent session is not a mesh host', () => {
  const body = { from: 'bob@self.aimaestro.local', to: 'carol', subject: 's', payload: { type: 'notification', message: 'hi' } } as never

  it('refuses X-Forwarded-From from an agent', async () => {
    const r = await routeMessage(body, null, 'self', null, null, null, alice)
    expect(r.status).toBe(403)
    expect((r.data as any).error).toBe('sender_mismatch')
    expect(m.recordAmpRefusal).toHaveBeenCalled()
  })

  it('strict: refuses it from an unidentified process on this machine, not from another machine', async () => {
    expect((await routeMessage(body, null, 'self', null, null, null, strictAnon)).status).toBe(401)
    const peer = await routeMessage(body, null, 'no-such-host', null, null, null, { kind: 'anonymous', mode: 'strict', local: false })
    expect(peer.status).toBe(401) // an unknown host, refused as before by the mesh check, not by the caller check
    expect((peer.data as any).error).not.toBe('caller_required')
  })
})
