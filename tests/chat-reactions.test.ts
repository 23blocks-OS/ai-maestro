/**
 * #799: reactions on chat messages. Real store in a temporary home, real transcript parsing; the agent
 * registry, the devices, the pane and the chat sockets are fakes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFile } from 'child_process'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'

const h = vi.hoisted(() => ({
  agents: {} as Record<string, any>,
  devices: {} as Record<string, any>,
  people: {} as Record<string, any>,
  transcript: null as string | null,
  bareShell: false,
  chatEvents: [] as any[],
}))

vi.mock('@/lib/agent-registry', () => ({ getAgent: (id: string) => h.agents[id] ?? null }))
vi.mock('@/lib/person-devices-registry', () => ({ getDevice: (id: string) => h.devices[id] ?? null }))
vi.mock('@/lib/people-registry', () => ({ getPerson: (id: string) => h.people[id] ?? null }))
vi.mock('@/lib/pane-occupant', () => ({ isPaneAtBareShell: async () => h.bareShell, BARE_SHELL_MESSAGE: 'at a shell' }))
vi.mock('@/services/shared-state', () => ({
  broadcastChatEvent: (name: string, type: string, payload: any) => h.chatEvents.push({ name, type, ...payload }),
}))
vi.mock('@/lib/chat-transcript.mjs', async (original) => ({
  ...(await original<typeof import('@/lib/chat-transcript.mjs')>()),
  resolveJsonlPath: () => (h.transcript ? { path: h.transcript } : null),
}))

import { addChatReaction, listChatReactions, removeChatReaction } from '@/services/chat-reactions-service'
import { buildReactionLine, fetchReactions, sendReaction } from '@/lib/chat-reactions'
import { NextRequest } from 'next/server'
import { DELETE, GET, POST } from '@/app/api/agents/[id]/chat/reactions/route'

const add = (id: string, body: Record<string, unknown>) => addChatReaction(id, body) as Promise<{ status: number; data: any }>
const list = (id: string, ids: string | null) => listChatReactions(id, ids) as { status: number; data: any }
const remove = (id: string, body: Record<string, unknown>) => removeChatReaction(id, body) as { status: number; data: any }

const AGENT_MSG = 'a1111111-0000-4000-8000-000000000001'
const PERSON_MSG = 'u1111111-0000-4000-8000-000000000002'

let home: string
let realHome: string | undefined
const deliverLine = vi.fn(async (_session: string, _text: string) => ({ ok: true } as { ok: boolean; error?: string }))
const g = globalThis as any

beforeEach(() => {
  realHome = process.env.HOME
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'reactions-'))
  process.env.HOME = home
  h.transcript = path.join(home, 'conversation.jsonl')
  fs.writeFileSync(h.transcript, [
    JSON.stringify({ type: 'user', uuid: PERSON_MSG, timestamp: '2026-11-06T10:00:00Z', message: { role: 'user', content: 'deploy it' } }),
    JSON.stringify({ type: 'assistant', uuid: AGENT_MSG, timestamp: '2026-11-06T10:00:01Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Shall I deploy staging now?' }] } }),
  ].join('\n'))
  h.agents = { a1: { id: 'a1', name: 'backend', sessions: [{ index: 0 }] }, a2: { id: 'a2', name: 'other', label: 'Other' } }
  h.devices = {
    phone: { deviceId: 'phone', personId: 'p1', personName: 'Juan', key: { keyId: 'k', status: 'active' } },
    unapproved: { deviceId: 'unapproved', personId: 'p1', key: { keyId: 'k2', status: 'pending' } },
    nokey: { deviceId: 'nokey', personId: 'p1' },
  }
  h.people = {}
  h.bareShell = false
  h.chatEvents = []
  g._reactionDeliveries = undefined
  g._streamSessions = undefined
  deliverLine.mockClear()
  deliverLine.mockResolvedValue({ ok: true })
  g.__deliverChatLine = deliverLine
})

afterEach(() => {
  process.env.HOME = realHome
  fs.rmSync(home, { recursive: true, force: true })
  delete g.__deliverChatLine
})

describe('storing a reaction', () => {
  it('keeps one per person per emoji per message, and takes it back', async () => {
    const first = await add('a1', { messageId: AGENT_MSG, emoji: '✅', deviceId: 'phone' })
    expect(first.status).toBe(200)
    expect(first.data?.added).toBe(true)
    expect(first.data?.reactions[0]).toMatchObject({ emoji: '✅', by: 'p1', byKind: 'person', byName: 'Juan' })

    const again = await add('a1', { messageId: AGENT_MSG, emoji: '✅', deviceId: 'phone' })
    expect(again.data).toMatchObject({ added: false })
    expect(again.data?.reactions).toHaveLength(1)

    await add('a1', { messageId: AGENT_MSG, emoji: '✅' })
    await add('a1', { messageId: AGENT_MSG, emoji: '👀', deviceId: 'phone' })
    const listed = list('a1', `${AGENT_MSG},nothing-here`).data?.reactions
    expect(Object.keys(listed!)).toEqual([AGENT_MSG])
    expect(listed![AGENT_MSG].map((r: any) => `${r.emoji}${r.by}`)).toEqual(['✅p1', '✅operator', '👀p1'])

    expect(remove('a1', { messageId: AGENT_MSG, emoji: '✅', deviceId: 'phone' }).data?.removed).toBe(true)
    expect(remove('a1', { messageId: AGENT_MSG, emoji: '✅', deviceId: 'phone' }).data?.removed).toBe(false)
    expect(list('a1', AGENT_MSG).data?.reactions[AGENT_MSG].map((r: any) => r.by)).toEqual(['operator', 'p1'])
  })

  it('is stored per agent', async () => {
    await add('a1', { messageId: PERSON_MSG, emoji: '✅' })
    expect(list('a2', PERSON_MSG).data?.reactions).toEqual({})
    expect(fs.existsSync(path.join(home, '.aimaestro', 'agents', 'a1', 'chat-reactions.json'))).toBe(true)
  })

  it('refuses what is outside the set, and bad ids', async () => {
    expect((await add('a1', { messageId: AGENT_MSG, emoji: '🎉' })).status).toBe(400)
    expect((await add('a1', { messageId: AGENT_MSG, emoji: 'toString' })).status).toBe(400)
    expect((await add('a1', { messageId: '../../etc', emoji: '👍' })).status).toBe(400)
    expect((await add('a1', { emoji: '👍' })).status).toBe(400)
    expect((await add('gone', { messageId: AGENT_MSG, emoji: '👍' })).status).toBe(404)
    expect(list('a1', null).status).toBe(400)
  })

  it('takes __proto__-shaped ids as plain keys', async () => {
    await add('a1', { messageId: '__proto__', emoji: '✅' })
    expect(Object.keys(list('a1', '__proto__,constructor').data!.reactions)).toEqual(['__proto__'])
  })
})

describe('who reacted', () => {
  it('a device needs an approved key on this host', async () => {
    expect((await add('a1', { messageId: AGENT_MSG, emoji: '👍', deviceId: 'unknown' })).status).toBe(404)
    expect((await add('a1', { messageId: AGENT_MSG, emoji: '👍', deviceId: 'unapproved' })).status).toBe(403)
    expect((await add('a1', { messageId: AGENT_MSG, emoji: '👍', deviceId: 'nokey' })).status).toBe(403)
    expect(deliverLine).not.toHaveBeenCalled()
  })

  it('a deactivated person cannot react, and the record on this host names them', async () => {
    h.people.p1 = { id: 'p1', displayName: 'Juan Peláez', active: true }
    const r = await add('a1', { messageId: AGENT_MSG, emoji: '✅', deviceId: 'phone' })
    expect(r.data?.reactions[0].byName).toBe('Juan Peláez')
    h.people.p1.active = false
    expect((await add('a1', { messageId: AGENT_MSG, emoji: '👀', deviceId: 'phone' })).status).toBe(403)
  })

  it('an agent reacts as itself and nothing is sent to any agent', async () => {
    const r = await add('a1', { messageId: AGENT_MSG, emoji: '👍', agentId: 'a2' })
    expect(r.data?.reactions[0]).toMatchObject({ by: 'a2', byKind: 'agent', byName: 'Other' })
    expect(deliverLine).not.toHaveBeenCalled()
    expect((await add('a1', { messageId: AGENT_MSG, emoji: '👍', agentId: 'nobody' })).status).toBe(404)
  })

  it('the dashboard is the operator', async () => {
    const r = await add('a1', { messageId: AGENT_MSG, emoji: '👍' })
    expect(r.data?.reactions[0]).toMatchObject({ by: 'operator', byKind: 'operator' })
    expect(deliverLine.mock.calls[0][1]).toMatch(/^\[REACTION\] The operator reacted 👍/)
  })
})

describe('telling the agent', () => {
  it('sends 👍 👎 ❓ as one line through the chat path, and nothing else', async () => {
    const r = await add('a1', { messageId: AGENT_MSG, emoji: '👍', deviceId: 'phone' })
    expect(r.data?.delivered).toBe(true)
    expect(deliverLine).toHaveBeenCalledTimes(1)
    expect(deliverLine).toHaveBeenCalledWith('backend', '[REACTION] Juan reacted 👍 (yes, go ahead) to your message: "Shall I deploy staging now?"')

    for (const emoji of ['✅', '👀', '❤️']) await add('a1', { messageId: AGENT_MSG, emoji, deviceId: 'phone' })
    expect(deliverLine).toHaveBeenCalledTimes(1)
  })

  it('sends nothing on removal or on a repeat', async () => {
    await add('a1', { messageId: AGENT_MSG, emoji: '👍', deviceId: 'phone' })
    g._reactionDeliveries = undefined
    await add('a1', { messageId: AGENT_MSG, emoji: '👍', deviceId: 'phone' })
    remove('a1', { messageId: AGENT_MSG, emoji: '👍', deviceId: 'phone' })
    expect(deliverLine).toHaveBeenCalledTimes(1)
  })

  it('limits a burst: the reaction is saved, the agent hears once, and the answer says so', async () => {
    await add('a1', { messageId: AGENT_MSG, emoji: '👍', deviceId: 'phone' })
    const second = await add('a1', { messageId: AGENT_MSG, emoji: '❓', deviceId: 'phone' })
    expect(second.data).toMatchObject({ added: true, delivered: false })
    expect(second.data?.reason).toMatch(/not told/)
    expect(deliverLine).toHaveBeenCalledTimes(1)

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5001)
    await add('a1', { messageId: AGENT_MSG, emoji: '👎', deviceId: 'phone' })
    vi.restoreAllMocks()
    expect(deliverLine).toHaveBeenCalledTimes(2)
  })

  it('does not tell the agent about a reaction on the person\'s own message or an unknown one', async () => {
    const own = await add('a1', { messageId: PERSON_MSG, emoji: '👍', deviceId: 'phone' })
    const unknown = await add('a1', { messageId: 'not-in-transcript', emoji: '👍', deviceId: 'phone' })
    expect(own.data).toMatchObject({ added: true, delivered: false })
    expect(unknown.data).toMatchObject({ added: true, delivered: false })
    expect(deliverLine).not.toHaveBeenCalled()
  })

  it('reports a refused send, such as a permission prompt on the pane, and keeps the reaction', async () => {
    deliverLine.mockResolvedValue({ ok: false, error: 'Agent is waiting for permission approval.' })
    const r = await add('a1', { messageId: AGENT_MSG, emoji: '👍', deviceId: 'phone' })
    expect(r.data).toMatchObject({ added: true, delivered: false, reason: 'Agent is waiting for permission approval.' })
    expect(r.data?.reactions).toHaveLength(1)
  })

  it('never types into a bare shell', async () => {
    h.bareShell = true
    const r = await add('a1', { messageId: AGENT_MSG, emoji: '👍', deviceId: 'phone' })
    expect(r.data).toMatchObject({ delivered: false, reason: 'at a shell' })
    expect(deliverLine).not.toHaveBeenCalled()
  })

  it('a streaming agent gets the line in its session, not in a pane', async () => {
    const push = vi.fn()
    g._streamSessions = new Map([['a1', { push, clients: new Set() }]])
    const r = await add('a1', { messageId: AGENT_MSG, emoji: '❓', deviceId: 'phone' })
    expect(r.data?.delivered).toBe(true)
    expect(push.mock.calls[0][0]).toMatch(/^\[REACTION\] Juan reacted ❓ \(explain this\)/)
    expect(deliverLine).not.toHaveBeenCalled()
  })
})

describe('the line', () => {
  it('stays one short line whatever the agent wrote', () => {
    const line = buildReactionLine('Ju"an\nX', '👍', `first\r\n"second"\u2028third\u001b[31m\u202e ${'long '.repeat(100)}`)
    expect(line).not.toMatch(/[\r\n\u2028\u2029\u001b\u202e]/)
    expect(line.match(/"/g)).toHaveLength(2)
    expect(line).toMatch(/^\[REACTION\] Ju'an X reacted 👍 \(yes, go ahead\) to your message: "first 'second' third \[31m long .*\.\.\."$/)
    expect(line.length).toBeLessThan(160)
  })

  it('never cuts an emoji in half', () => {
    expect(buildReactionLine('a', '👍', '😀'.repeat(200))).toMatch(/😀\.\.\."$/)
  })
})

describe('live updates', () => {
  it('reaches /term chat clients and /stream-chat clients, on add and on remove', async () => {
    const ws = { readyState: 1, send: vi.fn() }
    g._streamSessions = new Map([['a1', { push: vi.fn(), clients: new Set([ws]) }]])
    await add('a1', { messageId: PERSON_MSG, emoji: '✅' })
    expect(h.chatEvents[0]).toMatchObject({ name: 'backend', type: 'chat:reaction', agentId: 'a1', messageId: PERSON_MSG })
    expect(h.chatEvents[0].reactions).toHaveLength(1)
    expect(JSON.parse(ws.send.mock.calls[0][0])).toMatchObject({ type: 'chat:reaction', messageId: PERSON_MSG })

    remove('a1', { messageId: PERSON_MSG, emoji: '✅' })
    expect(h.chatEvents[1].reactions).toEqual([])
    expect(ws.send).toHaveBeenCalledTimes(2)
  })

  it('is silent when nothing changed', async () => {
    remove('a1', { messageId: PERSON_MSG, emoji: '✅' })
    expect(h.chatEvents).toEqual([])
  })
})

describe('the Next route', () => {
  it('reads the JSON body on POST and on DELETE', async () => {
    const url = 'http://host/api/agents/a1/chat/reactions'
    const ctx = { params: Promise.resolve({ id: 'a1' }) }
    const body = JSON.stringify({ messageId: PERSON_MSG, emoji: '✅' })
    const posted = await POST(new NextRequest(url, { method: 'POST', body }), ctx)
    expect((await posted.json()).added).toBe(true)
    const got = await GET(new NextRequest(`${url}?ids=${PERSON_MSG}`), ctx)
    expect((await got.json()).reactions[PERSON_MSG]).toHaveLength(1)
    const deleted = await DELETE(new NextRequest(url, { method: 'DELETE', body }), ctx)
    expect((await deleted.json()).removed).toBe(true)
    expect((await POST(new NextRequest(url, { method: 'POST', body: 'nope' }), ctx)).status).toBe(400)
  })
})

describe('an agent on another host', () => {
  it('the browser sends REST to that host, not to this one', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ reactions: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await fetchReactions('http://100.80.12.6:23000', 'a1', ['x', 'y#z'])
    await sendReaction('http://100.80.12.6:23000', 'a1', 'DELETE', 'x', '👍')
    vi.unstubAllGlobals()
    expect(fetchMock.mock.calls[0][0]).toBe('http://100.80.12.6:23000/api/agents/a1/chat/reactions?ids=x,y%23z')
    expect(fetchMock.mock.calls[1][0]).toBe('http://100.80.12.6:23000/api/agents/a1/chat/reactions')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE', body: JSON.stringify({ messageId: 'x', emoji: '👍' }) })
  })
})

describe('aimaestro-react.sh', () => {
  const script = path.join(__dirname, '..', 'scripts', 'aimaestro-react.sh')

  async function run(args: string[], agentId = 'a1'): Promise<{ code: number; out: string; requests: any[] }> {
    const requests: any[] = []
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', d => { body += d })
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null })
        res.setHeader('Content-Type', 'application/json')
        if (req.url?.includes('/reactions')) {
          res.statusCode = body.includes('🎉') ? 400 : 200
          res.end(JSON.stringify(res.statusCode === 400 ? { message: 'emoji must be one of' } : { reactions: [] }))
        } else {
          res.end(JSON.stringify({ messages: [{ type: 'user', uuid: 'older' }, { type: 'user', uuid: 'latest' }, { type: 'assistant', uuid: 'agent-said' }] }))
        }
      })
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const result = await new Promise<{ code: number; out: string }>(resolve => {
      execFile('bash', [script, ...args], { env: { ...process.env, AIMAESTRO_API: api, AIM_AGENT_ID: agentId } }, (err, stdout, stderr) => {
        resolve({ code: err ? (err.code as number) : 0, out: stdout + stderr })
      })
    })
    await new Promise(r => server.close(r))
    return { ...result, requests }
  }

  it('reacts as the agent', async () => {
    const r = await run(['msg-1', '✅'])
    expect(r.code).toBe(0)
    expect(r.requests).toEqual([{ method: 'POST', url: '/api/agents/a1/chat/reactions', body: { messageId: 'msg-1', emoji: '✅', agentId: 'a1' } }])
  })

  it('`last` finds the person\'s latest message, and --remove takes it back', async () => {
    const r = await run(['--remove', 'last', '✅'])
    expect(r.code).toBe(0)
    expect(r.requests[1]).toMatchObject({ method: 'DELETE', body: { messageId: 'latest', emoji: '✅' } })
  })

  it('prints the server\'s refusal and fails', async () => {
    const r = await run(['msg-1', '🎉'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('emoji must be one of')
  })
})
