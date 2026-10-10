import { describe, it, expect, beforeEach, vi } from 'vitest'

const VALUE = 'sk-live-Z9x8y7w6V5u4-do-not-leak'

const mocks = vi.hoisted(() => ({
  getAgent: vi.fn(),
  isSelf: vi.fn(),
  setSecret: vi.fn(async (_n: string, _v: string) => {}),
  hasSecret: vi.fn(async (_n: string) => false),
  runWakeChain: vi.fn(async (_ctx: any) => ({ confirmed: true, notified: true, deferred: false })),
}))

vi.mock('@/lib/agent-registry', () => ({ getAgent: mocks.getAgent }))
vi.mock('@/lib/hosts-config', () => ({ isSelf: mocks.isSelf }))
vi.mock('@/lib/wake-chain', () => ({ runWakeChain: mocks.runWakeChain }))
vi.mock('@/lib/secret-vault.mjs', async () => {
  const real = await vi.importActual<any>('@/lib/secret-vault.mjs')
  return { ...real, setSecret: mocks.setSecret, hasSecret: mocks.hasSecret }
})

import { createSecretRequest, listSecretRequests, answerSecretRequest } from '@/services/agent-secret-requests-service'
import { resetSecretRequests } from '@/lib/secret-requests'

const LOCAL = { id: 'agent-1', name: 'lbf-hr', hostId: 'this-host' }

let logged: string[]
beforeEach(() => {
  resetSecretRequests()
  vi.clearAllMocks()
  mocks.getAgent.mockImplementation((id: string) => (id === 'agent-1' ? LOCAL : undefined))
  mocks.isSelf.mockReturnValue(true)
  mocks.hasSecret.mockResolvedValue(false)
  logged = []
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(' ')) })
  }
})

async function ask(name = 'OPENAI_API_KEY') {
  const r = await createSecretRequest('agent-1', { name, note: 'for the job' })
  return r.data as any
}

describe('asking', () => {
  it('creates a request and says it is waiting', async () => {
    const r = await createSecretRequest('agent-1', { name: 'OPENAI_API_KEY' })
    expect(r.status).toBe(201)
    expect((r.data as any).alreadyStored).toBe(false)
    expect((r.data as any).requestId).toBeTruthy()
  })

  it('does not ask again for a secret that is already stored', async () => {
    mocks.hasSecret.mockResolvedValue(true)
    const r = await createSecretRequest('agent-1', { name: 'OPENAI_API_KEY' })
    expect(r.status).toBe(200)
    expect((r.data as any).alreadyStored).toBe(true)
    expect(((await listSecretRequests('agent-1')).data as any).requests).toEqual([])
  })

  it('refuses unknown agents, unsafe ids and bad names', async () => {
    expect((await createSecretRequest('nope', { name: 'A_KEY' })).status).toBe(404)
    expect((await createSecretRequest('../x', { name: 'A_KEY' })).status).toBe(404)
    for (const name of ['', 'lower', 'A B', 'A;rm', '../x', undefined, 5]) {
      expect((await createSecretRequest('agent-1', { name })).status).toBe(400)
    }
  })

  it('lists names and notes only', async () => {
    await ask()
    const list = (await listSecretRequests('agent-1')).data as any
    expect(list.requests.length).toBe(1)
    expect(Object.keys(list.requests[0]).sort()).toEqual(['createdAt', 'id', 'name', 'note'])
  })
})

describe('answering', () => {
  it('stores the value, tells the agent only the name, and forgets the request', async () => {
    const { requestId } = await ask()
    const r = await answerSecretRequest('agent-1', requestId, { value: VALUE })
    expect(r.status).toBe(200)
    expect(mocks.setSecret).toHaveBeenCalledWith('OPENAI_API_KEY', VALUE)
    expect((r.data as any)).toMatchObject({ stored: true, name: 'OPENAI_API_KEY' })
    expect(mocks.runWakeChain).toHaveBeenCalledTimes(1)
    expect(((await listSecretRequests('agent-1')).data as any).requests).toEqual([])
  })

  it('NEVER lets the value reach the agent, the response or any log', async () => {
    const { requestId } = await ask()
    const r = await answerSecretRequest('agent-1', requestId, { value: VALUE })
    expect(JSON.stringify(mocks.runWakeChain.mock.calls)).not.toContain(VALUE)
    expect(JSON.stringify(r)).not.toContain(VALUE)
    expect(logged.join('\n')).not.toContain(VALUE)
    expect(JSON.stringify((await listSecretRequests('agent-1')).data)).not.toContain(VALUE)
  })

  it('a vault failure answers an error that does not contain the value, and keeps the request', async () => {
    mocks.setSecret.mockRejectedValueOnce(new Error('the keyring did not answer'))
    const { requestId } = await ask()
    const r = await answerSecretRequest('agent-1', requestId, { value: VALUE })
    expect(r.status).toBe(400)
    expect(JSON.stringify(r)).not.toContain(VALUE)
    expect(logged.join('\n')).not.toContain(VALUE)
    expect(((await listSecretRequests('agent-1')).data as any).requests.length).toBe(1)
    expect(mocks.runWakeChain).not.toHaveBeenCalled()
  })

  it('lets the person correct the name and tells the agent which one was used', async () => {
    const { requestId } = await ask('OPENAI_KEY')
    await answerSecretRequest('agent-1', requestId, { value: VALUE, name: 'OPENAI_API_KEY' })
    expect(mocks.setSecret).toHaveBeenCalledWith('OPENAI_API_KEY', VALUE)
    expect(mocks.runWakeChain.mock.calls[0][0].injectBody).toContain('use OPENAI_API_KEY')
  })

  it('declining tells the agent and stores nothing', async () => {
    const { requestId } = await ask()
    const r = await answerSecretRequest('agent-1', requestId, { decline: true })
    expect((r.data as any).declined).toBe(true)
    expect(mocks.setSecret).not.toHaveBeenCalled()
    expect(mocks.runWakeChain.mock.calls[0][0].injectBody).toContain('declined')
  })

  it('rejects a missing or oversized value, a bad name, and a request of another agent', async () => {
    const { requestId } = await ask()
    expect((await answerSecretRequest('agent-1', requestId, {})).status).toBe(400)
    expect((await answerSecretRequest('agent-1', requestId, { value: 'x'.repeat(70000) })).status).toBe(400)
    expect((await answerSecretRequest('agent-1', requestId, { value: VALUE, name: 'bad name' })).status).toBe(400)
    mocks.getAgent.mockImplementation((id: string) => ({ id, name: id, hostId: 'this-host' }))
    expect((await answerSecretRequest('agent-2', requestId, { value: VALUE })).status).toBe(404)
    expect(mocks.setSecret).not.toHaveBeenCalled()
  })

  it('an unknown or malformed request id is a clean error', async () => {
    expect((await answerSecretRequest('agent-1', '00000000-0000-0000-0000-000000000000', { value: VALUE })).status).toBe(404)
    expect((await answerSecretRequest('agent-1', '../../x', { value: VALUE })).status).toBe(400)
  })

  it('a request can be answered once', async () => {
    const { requestId } = await ask()
    expect((await answerSecretRequest('agent-1', requestId, { value: VALUE })).status).toBe(200)
    expect((await answerSecretRequest('agent-1', requestId, { value: VALUE })).status).toBe(404)
  })
})

describe('an agent on another host', () => {
  it('forwards the request to that host and never stores or logs the value here', async () => {
    mocks.getAgent.mockImplementation(() => ({ id: 'agent-1', name: 'pas-lola', hostId: 'mini-lola', hostUrl: 'http://100.76.17.128:23000' }))
    mocks.isSelf.mockReturnValue(false)
    const seen: { url: string; body: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      seen.push({ url, body: String(init?.body ?? '') })
      return { status: 200, json: async () => ({ stored: true, name: 'OPENAI_API_KEY' }) }
    }))
    const r = await answerSecretRequest('agent-1', '11111111-2222-3333-4444-555555555555', { value: VALUE })
    expect(r.status).toBe(200)
    expect(seen[0].url).toBe('http://100.76.17.128:23000/api/agents/agent-1/secret-requests/11111111-2222-3333-4444-555555555555')
    expect(mocks.setSecret).not.toHaveBeenCalled()
    expect(logged.join('\n')).not.toContain(VALUE)
    vi.unstubAllGlobals()
  })

  it('answers 502 without the value when the host is unreachable', async () => {
    mocks.getAgent.mockImplementation(() => ({ id: 'agent-1', name: 'pas-lola', hostId: 'mini-lola', hostUrl: 'http://100.76.17.128:23000' }))
    mocks.isSelf.mockReturnValue(false)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED') }))
    const r = await answerSecretRequest('agent-1', '11111111-2222-3333-4444-555555555555', { value: VALUE })
    expect(r.status).toBe(502)
    expect(JSON.stringify(r)).not.toContain(VALUE)
    expect(logged.join('\n')).not.toContain(VALUE)
    vi.unstubAllGlobals()
  })
})
