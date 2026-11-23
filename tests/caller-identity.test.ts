import { describe, it, expect, vi } from 'vitest'
import {
  CALLER_HEADER,
  agentNameOfSession,
  callerAuthMode,
  callerFromHeaders,
  checkMailbox,
  checkNotAgent,
  checkPersonMailbox,
  checkSender,
  createCallerResolver,
  decodeCaller,
  describeCaller,
  encodeCaller,
  findSocketInode,
  isProtectedPath,
  parseLsofOwner,
  ppidFromStat,
  senderViaOf,
  setCallerHeader,
  stripCallerHeader,
  type Caller,
  type CallerProbes,
  parsePanes,
} from '@/lib/caller-identity'

const KEY_ALICE = 'amp_live_sk_' + 'a'.repeat(64)
const KEY_BOB = 'amp_live_sk_' + 'b'.repeat(64)
const AGENTS: Record<string, { id: string; name: string }> = {
  alice: { id: 'id-alice', name: 'alice' },
  bob: { id: 'id-bob', name: 'bob' },
  mallory: { id: 'id-mallory', name: 'mallory' },
}

/*
 * A process tree:   1 -> 100 (tmux server) -> 200 (alice's pane) -> 210 (claude) -> 220 (curl)
 *                                          -> 300 (bob's pane)   -> 310 (curl)
 *                   1 -> 400 (a shell outside tmux) -> 410 (curl)
 *                   1 -> 500 (the AI Maestro server) -> 510 (a child of the server)
 */
const TABLE = new Map<number, number>([[100, 1], [200, 100], [210, 200], [220, 210], [300, 100], [310, 300], [400, 1], [410, 400], [500, 1], [510, 500]])
const PANES = [{ pid: 200, session: 'alice' }, { pid: 300, session: 'bob' }]

function probes(over: Partial<CallerProbes> & { owner?: number | null; panes?: typeof PANES } = {}): Partial<CallerProbes> {
  return {
    listPanes: async () => over.panes ?? PANES,
    processTable: async () => TABLE,
    socketOwner: async (_c, _s, candidates) => (over.owner != null && candidates.includes(over.owner) ? over.owner : null),
    agentForSession: (s) => AGENTS[agentNameOfSession(s)] || null,
    agentForKey: (k) => (k === KEY_ALICE ? AGENTS.alice : k === KEY_BOB ? AGENTS.bob : null),
    localAddresses: () => new Set(['192.168.1.10']),
    ...over,
  }
}

function req(opts: { auth?: string; remote?: string; socket?: object } = {}) {
  const socket = opts.socket || { remoteAddress: opts.remote ?? '127.0.0.1', remotePort: 54321, localPort: 23000 }
  return { headers: opts.auth ? { authorization: opts.auth } : {}, socket } as any
}

const resolver = (mode: 'session' | 'off', p: Partial<CallerProbes>) =>
  createCallerResolver({ probes: p, mode: () => mode, serverPid: 500, log: () => {} })

describe('caller identity: who is calling', () => {
  it('a request from a process under an agent pane is that agent (session)', async () => {
    const r = await resolver('session', probes({ owner: 220 })).resolve(req())
    expect(r).toEqual({ caller: { kind: 'agent', agentId: 'id-alice', name: 'alice', via: 'session', mode: 'session', local: true } })
  })

  it('a second brain and a call fork of an agent are that agent', async () => {
    const p = probes({ owner: 220, panes: [{ pid: 200, session: 'alice_2' }] })
    expect(await resolver('session', p).resolve(req())).toMatchObject({ caller: { agentId: 'id-alice' } })
    const q = probes({ owner: 220, panes: [{ pid: 200, session: 'alice__call' }] })
    expect(await resolver('session', q).resolve(req())).toMatchObject({ caller: { agentId: 'id-alice' } })
  })

  it('a process outside every pane is anonymous, and so is a tmux session with no agent', async () => {
    expect(await resolver('session', probes({ owner: 410 })).resolve(req())).toMatchObject({ caller: { kind: 'anonymous' } })
    const p = probes({ owner: 220, panes: [{ pid: 200, session: 'scratch' }] })
    expect(await resolver('session', p).resolve(req())).toMatchObject({ caller: { kind: 'anonymous' } })
  })

  it('a request from another machine is never a session caller (the probes are not even asked)', async () => {
    const socketOwner = vi.fn(async () => 220)
    const r = await resolver('session', probes({ socketOwner })).resolve(req({ remote: '192.168.1.77' }))
    expect(r).toEqual({ caller: { kind: 'anonymous', mode: 'session', local: false } })
    expect(socketOwner).not.toHaveBeenCalled()
  })

  it("a request to the host's own LAN address is from this machine (no way round the session check)", async () => {
    const r = await resolver('session', probes({ owner: 220 })).resolve(req({ remote: '192.168.1.10' }))
    expect(r).toMatchObject({ caller: { kind: 'agent', agentId: 'id-alice', local: true } })
    const mapped = await resolver('session', probes({ owner: 220 })).resolve(req({ remote: '::ffff:127.0.0.1' }))
    expect(mapped).toMatchObject({ caller: { kind: 'agent' } })
  })

  it('the server calling itself is the host; a child of the server is not', async () => {
    expect(await resolver('session', probes({ owner: 500 })).resolve(req())).toMatchObject({ caller: { kind: 'operator', via: 'host' } })
    expect(await resolver('session', probes({ owner: 510 })).resolve(req())).toMatchObject({ caller: { kind: 'anonymous' } })
  })

  it('a failing probe means "not from a session", never an exception', async () => {
    const p = probes({ processTable: async () => { throw new Error('no /proc') } })
    expect(await resolver('session', p).resolve(req())).toMatchObject({ caller: { kind: 'anonymous' } })
    const q = probes({ listPanes: async () => { throw new Error('no tmux server') }, owner: 220 })
    expect(await resolver('session', q).resolve(req())).toMatchObject({ caller: { kind: 'anonymous' } })
  })

  it('answers once per connection (keep-alive)', async () => {
    const socketOwner = vi.fn(async () => 220)
    const r = resolver('session', probes({ socketOwner }))
    const socket = { remoteAddress: '127.0.0.1', remotePort: 50000, localPort: 23000 }
    await r.resolve(req({ socket }))
    await r.resolve(req({ socket }))
    expect(socketOwner).toHaveBeenCalledTimes(1)
  })

  it('an agent API key identifies its agent when no session says otherwise', async () => {
    const r = await resolver('session', probes({ owner: 410 })).resolve(req({ auth: `Bearer ${KEY_BOB}` }))
    expect(r).toMatchObject({ caller: { kind: 'agent', agentId: 'id-bob', via: 'key' } })
  })

  it("another agent's key from an agent's session is refused, never treated as either", async () => {
    const r = await resolver('session', probes({ owner: 220 })).resolve(req({ auth: `Bearer ${KEY_BOB}` }))
    expect(r).toMatchObject({ refused: { status: 403, data: { error: 'caller_mismatch' } } })
    const own = await resolver('session', probes({ owner: 220 })).resolve(req({ auth: `Bearer ${KEY_ALICE}` }))
    expect(own).toMatchObject({ caller: { kind: 'agent', agentId: 'id-alice', via: 'session' } })
  })

  it('an agent key works from anywhere, and a bearer that is not an agent key is nobody (there is no operator token)', async () => {
    const session = await resolver('session', probes({ owner: 410 })).resolve(req({ auth: `Bearer ${KEY_BOB}` }))
    expect(session).toMatchObject({ caller: { agentId: 'id-bob', via: 'key' } })
    expect(await resolver('session', probes({})).resolve(req({ auth: 'Bearer some-operator-token', remote: '10.0.0.5' }))).toEqual({ caller: { kind: 'anonymous', mode: 'session', local: false } })
  })

  it('off resolves nothing', async () => {
    const socketOwner = vi.fn(async () => 220)
    expect(await resolver('off', probes({ socketOwner })).resolve(req())).toEqual({ caller: { kind: 'anonymous', mode: 'off' } })
    expect(socketOwner).not.toHaveBeenCalled()
  })
})

describe('caller identity: settings', () => {
  it('mode: session unless the setting says off; there is no strict mode', () => {
    expect(callerAuthMode({})).toBe('session')
    expect(callerAuthMode({ AIMAESTRO_CALLER_AUTH: 'off' })).toBe('off')
    expect(callerAuthMode({ AIMAESTRO_CALLER_AUTH: 'OFF' })).toBe('off')
    expect(callerAuthMode({ AIMAESTRO_CALLER_AUTH: 'strict' })).toBe('session')
    expect(callerAuthMode({ AIMAESTRO_CALLER_AUTH: 'whatever', AIMAESTRO_OPERATOR_TOKEN_SHA256: 'a'.repeat(64) })).toBe('session')
  })
})

describe('caller identity: the header between the server and the routes', () => {
  const alice: Caller = { kind: 'agent', agentId: 'id-alice', name: 'alice', via: 'session', mode: 'session', local: true }

  it('round-trips, and a forged or broken value is not a caller', () => {
    expect(decodeCaller(encodeCaller(alice))).toEqual(alice)
    expect(decodeCaller(Buffer.from('{"kind":"anonymous","mode":"strict"}').toString('base64url'))).toBeNull()
    expect(decodeCaller('{"kind":"operator"}')).toBeNull()
    expect(decodeCaller(Buffer.from('{"kind":"root","mode":"off"}').toString('base64url'))).toBeNull()
    expect(decodeCaller(Buffer.from('{"kind":"agent","mode":"session"}').toString('base64url'))).toBeNull()
  })

  it('a header sent by the client is stripped before the server sets its own', () => {
    const forged = encodeCaller({ kind: 'operator', via: 'host', mode: 'session' })
    const r: any = { headers: { [CALLER_HEADER]: forged, host: 'x' }, rawHeaders: ['Host', 'x', 'X-AIMaestro-Caller', forged] }
    stripCallerHeader(r)
    expect(r.headers[CALLER_HEADER]).toBeUndefined()
    expect(r.rawHeaders).toEqual(['Host', 'x'])
    setCallerHeader(r, alice)
    expect(callerFromHeaders(r.headers)).toEqual(alice)
  })

  it('reads Fetch headers (Next routes) and Node headers (headless router)', () => {
    const h = new Headers({ [CALLER_HEADER]: encodeCaller(alice) })
    expect(callerFromHeaders(h)).toEqual(alice)
    expect(callerFromHeaders({ [CALLER_HEADER]: encodeCaller(alice) })).toEqual(alice)
  })

  it('no header: anonymous in the configured mode; two headers: neither is trusted', () => {
    expect(callerFromHeaders({})).toMatchObject({ kind: 'anonymous' })
    expect(callerFromHeaders({ [CALLER_HEADER]: [encodeCaller(alice), encodeCaller(alice)] })).toMatchObject({ kind: 'anonymous' })
  })

  it('GET /api/caller tells only kind, agent, via and mode', () => {
    expect(describeCaller(alice)).toEqual({ kind: 'agent', agentId: 'id-alice', name: 'alice', via: 'session', mode: 'session' })
    expect(describeCaller({ kind: 'anonymous', mode: 'session', local: false })).toEqual({ kind: 'anonymous', mode: 'session' })
  })

  it('resolves the message routes only, however the path is spelled', () => {
    for (const p of ['/api/caller', '/api/messages', '/api/messages/forward', '/api/messages/meeting', '/api/agents/x/messages', '/api/agents/x/messages/m1',
      '/api/people/p/messages', '/api/meetings/inject-queue', '/api/meetings/m/broadcast', '/api/v1/route', '/api/v1/messages/pending',
      '/api//messages', '/api/messages/', '/API/Messages', '/api/%6Dessages']) {
      expect(isProtectedPath(p), p).toBe(true)
    }
    for (const p of ['/api/agents', '/api/sessions', '/api/meetings', '/api/agents/x/chat', '/', '/api/v1/register']) {
      expect(isProtectedPath(p), p).toBe(false)
    }
  })
})

describe('caller identity: decisions', () => {
  const idOf = (i: string) => (AGENTS[i] ? AGENTS[i].id : Object.values(AGENTS).find(a => a.id === i)?.id ?? null)
  const alice: Caller = { kind: 'agent', agentId: 'id-alice', name: 'alice', via: 'session', mode: 'session' }
  const host: Caller = { kind: 'operator', via: 'host', mode: 'session' }
  const anonSession: Caller = { kind: 'anonymous', mode: 'session' }

  it('an agent sends as itself only, and a missing from is its own', () => {
    expect(checkSender(alice, 'alice', idOf)).toEqual({ from: 'alice' })
    expect(checkSender(alice, 'id-alice', idOf)).toEqual({ from: 'id-alice' })
    expect(checkSender(alice, undefined, idOf)).toEqual({ from: 'id-alice' })
    expect(checkSender(alice, 'bob', idOf)).toMatchObject({ refused: { status: 403, data: { error: 'sender_mismatch' } } })
  })

  it('the server itself and an anonymous caller send as before', () => {
    expect(checkSender(host, 'bob', idOf)).toEqual({ from: 'bob' })
    expect(checkSender(anonSession, 'bob', idOf)).toEqual({ from: 'bob' })
    expect(checkSender(undefined, 'bob', idOf)).toEqual({ from: 'bob' })
  })

  it('an agent reads its own mailbox only', () => {
    expect(checkMailbox(alice, 'alice', idOf)).toBeNull()
    expect(checkMailbox(alice, 'id-bob', idOf)).toMatchObject({ status: 403, data: { error: 'not_your_mailbox' } })
    expect(checkMailbox(alice, null, idOf)).toMatchObject({ status: 403 })
    expect(checkMailbox(host, 'bob', idOf)).toBeNull()
    expect(checkMailbox(anonSession, 'bob', idOf)).toBeNull()
    expect(checkMailbox({ ...alice, mode: 'off' }, 'bob', idOf)).toBeNull()
  })

  it('surfaces of every mailbox are not for agents; a person mailbox is never an agent one', () => {
    expect(checkNotAgent(alice)).toMatchObject({ status: 403 })
    expect(checkNotAgent(host)).toBeNull()
    expect(checkNotAgent(anonSession)).toBeNull()
    expect(checkPersonMailbox(alice)).toMatchObject({ status: 403 })
    expect(checkPersonMailbox(anonSession)).toBeNull()
  })

  it('records how the sender was established', () => {
    expect(senderViaOf(alice)).toBe('session')
    expect(senderViaOf(anonSession)).toBe('claimed')
    expect(senderViaOf(host)).toBe('host')
    expect(senderViaOf(undefined)).toBeUndefined()
  })
})

describe('caller identity: kernel facts parsing', () => {
  it('finds the client socket inode in /proc/net/tcp', () => {
    const tcp = [
      '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
      '   0: 00000000:59D8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 11111 1 0',
      '   1: 0100007F:59D8 0100007F:D431 01 00000000:00000000 00:00000000 00000000  1000        0 22222 1 0',
      '   2: 0100007F:D431 0100007F:59D8 01 00000000:00000000 00:00000000 00000000  1000        0 33333 1 0',
    ].join('\n')
    // client port 0xD431 = 54321 talking to server port 0x59D8 = 23000: the client end, not the server's
    expect(findSocketInode(tcp, 54321, 23000)).toBe('33333')
    expect(findSocketInode(tcp, 1, 23000)).toBeNull()
  })

  it('reads lsof -F pn output and picks the client end', () => {
    const out = 'p500\nf20\nn127.0.0.1:23000->127.0.0.1:54321\np220\nf5\nn127.0.0.1:54321->127.0.0.1:23000\n'
    expect(parseLsofOwner(out, 54321, 23000)).toBe(220)
    expect(parseLsofOwner('p500\nn127.0.0.1:23000->127.0.0.1:54321\n', 54321, 23000)).toBeNull()
    expect(parseLsofOwner('', 54321, 23000)).toBeNull()
  })

  it('reads the parent pid from /proc/<pid>/stat, even with spaces in the name', () => {
    expect(ppidFromStat('220 (node (worker) x) S 210 220 200 0')).toBe(210)
    expect(ppidFromStat('garbage')).toBeNull()
  })

  it('reads the pane list tmux prints without a UTF-8 locale (pm2 gives the server none)', () => {
    expect(parsePanes('34340:23b-cmo\n20591:ai-maestro\n')).toEqual([
      { pid: 34340, session: '23b-cmo' },
      { pid: 20591, session: 'ai-maestro' },
    ])
    // The old tab format came back as "34340_23b-cmo" there: never a pane by accident
    expect(parsePanes('34340_23b-cmo\n')).toEqual([])
  })
})
