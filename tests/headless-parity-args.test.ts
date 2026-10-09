/**
 * B012: the headless handler must hand each service the SAME arguments the Next.js
 * route does (argument mapping, query-string conversion, defaults, status codes).
 *
 * Every test here asserts on the CALL ARGUMENTS of a mocked service, written from
 * the Next route in app/api/**, and was seen failing against the router before the
 * fix. Pattern: tests/headless-router-args.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PassThrough } from 'stream'

const m = vi.hoisted(() => ({
  addNewHost: vi.fn(),
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
  deletePersistedSession: vi.fn(),
  heartbeat: vi.fn(),
  checkIdleStatus: vi.fn(),
  queryGraph: vi.fn(),
  queryCodeGraph: vi.fn(),
  queryDbGraph: vi.fn(),
  deleteCodeGraph: vi.fn(),
  saveSkillSettings: vi.fn(),
  removeSkill: vi.fn(),
  parseConversationFile: vi.fn(),
  triggerConsolidation: vi.fn(),
  runDeltaIndex: vi.fn(),
  searchConversations: vi.fn(),
  queryDocs: vi.fn(),
  listMarketplaceSkills: vi.fn(),
  removeRepo: vi.fn(),
  wakeAgent: vi.fn(),
  hibernateAgent: vi.fn(),
  getAgent: vi.fn(),
  isSelf: vi.fn(),
  rotateKeypair: vi.fn(),
}))

vi.mock('@/services/hosts-service', async (o) => ({ ...(await o<any>()), addNewHost: m.addNewHost }))
vi.mock('@/services/sessions-service', async (o) => ({
  ...(await o<any>()),
  renameSession: m.renameSession,
  deleteSession: m.deleteSession,
  deletePersistedSession: m.deletePersistedSession,
  heartbeat: m.heartbeat,
  checkIdleStatus: m.checkIdleStatus,
}))
vi.mock('@/services/agents-graph-service', async (o) => ({
  ...(await o<any>()),
  queryGraph: m.queryGraph,
  queryCodeGraph: m.queryCodeGraph,
  queryDbGraph: m.queryDbGraph,
  deleteCodeGraph: m.deleteCodeGraph,
}))
vi.mock('@/services/agents-skills-service', async (o) => ({
  ...(await o<any>()),
  saveSkillSettings: m.saveSkillSettings,
  removeSkill: m.removeSkill,
}))
vi.mock('@/services/config-service', async (o) => ({ ...(await o<any>()), parseConversationFile: m.parseConversationFile }))
vi.mock('@/services/agents-memory-service', async (o) => ({
  ...(await o<any>()),
  triggerConsolidation: m.triggerConsolidation,
  runDeltaIndex: m.runDeltaIndex,
  searchConversations: m.searchConversations,
}))
vi.mock('@/services/agents-docs-service', async (o) => ({ ...(await o<any>()), queryDocs: m.queryDocs }))
vi.mock('@/services/marketplace-service', async (o) => ({ ...(await o<any>()), listMarketplaceSkills: m.listMarketplaceSkills }))
vi.mock('@/services/agents-repos-service', async (o) => ({ ...(await o<any>()), removeRepo: m.removeRepo }))
vi.mock('@/services/agents-core-service', async (o) => ({ ...(await o<any>()), wakeAgent: m.wakeAgent, hibernateAgent: m.hibernateAgent }))
vi.mock('@/services/amp-service', async (o) => ({ ...(await o<any>()), rotateKeypair: m.rotateKeypair }))
vi.mock('@/lib/agent-registry', async (o) => ({ ...(await o<any>()), getAgent: m.getAgent }))
vi.mock('@/lib/hosts-config', async (o) => ({ ...(await o<any>()), isSelf: m.isSelf }))

import { createHeadlessRouter } from '@/services/headless-router'

async function call(method: string, url: string, body?: unknown, raw?: string) {
  const req: any = new PassThrough()
  req.method = method
  req.url = url
  req.headers = { 'content-type': 'application/json' }
  const res: any = {
    headersSent: false,
    status: 0,
    headers: {} as Record<string, string>,
    out: '',
    writeHead(code: number, headers?: Record<string, string>) { this.status = code; this.headers = headers || {}; this.headersSent = true },
    end(chunk?: string) { this.out += chunk ?? '' },
  }
  const done = createHeadlessRouter().handle(req, res)
  req.end(raw ?? (body === undefined ? '' : JSON.stringify(body)))
  const handled = await done
  return { res, handled, json: () => JSON.parse(res.out) }
}

const ok = { data: { success: true }, status: 200 }

beforeEach(() => {
  for (const fn of Object.values(m)) (fn as any).mockReset()
  for (const k of ['addNewHost', 'renameSession', 'deleteSession', 'deletePersistedSession', 'heartbeat', 'queryGraph', 'queryCodeGraph',
    'queryDbGraph', 'deleteCodeGraph', 'saveSkillSettings', 'removeSkill', 'parseConversationFile', 'triggerConsolidation',
    'runDeltaIndex', 'searchConversations', 'queryDocs', 'listMarketplaceSkills', 'removeRepo', 'wakeAgent', 'hibernateAgent', 'rotateKeypair'] as const) {
    ;(m[k] as any).mockResolvedValue(ok)
  }
  m.checkIdleStatus.mockResolvedValue({ idle: true, lastActivity: 'now' })
  m.heartbeat.mockReturnValue(ok)
  m.getAgent.mockReturnValue(undefined)
  m.isSelf.mockReturnValue(false)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('B012 item 1: POST /api/hosts', () => {
  it('wraps the body as { host, syncEnabled }', async () => {
    const host = { id: 'h1', name: 'H', url: 'http://h:23000', type: 'remote' }
    await call('POST', '/api/hosts', host)
    expect(m.addNewHost).toHaveBeenCalledWith({ host, syncEnabled: true })
  })
  it('?sync=false turns syncEnabled off', async () => {
    await call('POST', '/api/hosts?sync=false', { id: 'h1' })
    expect(m.addNewHost).toHaveBeenCalledWith({ host: { id: 'h1' }, syncEnabled: false })
  })
})

describe('B012 item 2: PATCH /api/sessions/:id/rename', () => {
  it('reads body.newName', async () => {
    await call('PATCH', '/api/sessions/old/rename', { newName: 'fresh' })
    expect(m.renameSession).toHaveBeenCalledWith('old', 'fresh')
  })
})

describe('B012 item 3: GET /api/agents/:id/graph/query', () => {
  it('maps ?q= to queryType and passes null for absent params like Next', async () => {
    await call('GET', '/api/agents/a1/graph/query?q=callers&name=foo&type=fn')
    expect(m.queryGraph).toHaveBeenCalledWith('a1', { queryType: 'callers', name: 'foo', type: 'fn', from: null, to: null })
  })
})

describe('B012 item 4: DELETE /api/sessions/restore', () => {
  it('is not shadowed by DELETE /api/sessions/:id', async () => {
    await call('DELETE', '/api/sessions/restore?sessionId=abc')
    expect(m.deleteSession).not.toHaveBeenCalled()
    expect(m.deletePersistedSession).toHaveBeenCalledWith('abc')
  })
})

describe('B012 item 5: PUT /api/agents/:id/skills/settings', () => {
  it('passes body.settings, not the whole body', async () => {
    await call('PUT', '/api/agents/a1/skills/settings', { settings: { memory: { on: true } } })
    expect(m.saveSkillSettings).toHaveBeenCalledWith('a1', { memory: { on: true } })
  })
})

describe('B012 item 6: DELETE /api/agents/:id/graph/code', () => {
  it('reads ?project=', async () => {
    await call('DELETE', '/api/agents/a1/graph/code?project=%2Frepo%2Fx')
    expect(m.deleteCodeGraph).toHaveBeenCalledWith('a1', '/repo/x')
  })
})

describe('B012 item 7: POST /api/conversations/parse', () => {
  it('reads body.conversationFile', async () => {
    await call('POST', '/api/conversations/parse', { conversationFile: '/tmp/x.jsonl' })
    expect(m.parseConversationFile).toHaveBeenCalledWith('/tmp/x.jsonl')
  })
})

describe('B012 item 8: POST /api/agents/:id/memory/consolidate', () => {
  it('reads dryRun, provider and maxConversations from the query string', async () => {
    await call('POST', '/api/agents/a1/memory/consolidate?dryRun=true&provider=claude&maxConversations=7')
    expect(m.triggerConsolidation).toHaveBeenCalledWith('a1', { dryRun: true, provider: 'claude', maxConversations: 7 })
  })
  it('defaults to a real run with everything else undefined', async () => {
    await call('POST', '/api/agents/a1/memory/consolidate')
    expect(m.triggerConsolidation).toHaveBeenCalledWith('a1', { dryRun: false, provider: undefined, maxConversations: undefined })
  })
  it('ignores a body dryRun (a body must not turn a dry run into a real one either way)', async () => {
    await call('POST', '/api/agents/a1/memory/consolidate', { dryRun: true })
    expect(m.triggerConsolidation.mock.calls[0][1].dryRun).toBe(false)
  })
})

describe('B012 item 9: POST /api/agents/:id/index-delta', () => {
  it('reads dryRun and batchSize from the query string', async () => {
    await call('POST', '/api/agents/a1/index-delta?dryRun=true&batchSize=25')
    expect(m.runDeltaIndex).toHaveBeenCalledWith('a1', { dryRun: true, batchSize: 25 })
  })
  it('defaults', async () => {
    await call('POST', '/api/agents/a1/index-delta')
    expect(m.runDeltaIndex).toHaveBeenCalledWith('a1', { dryRun: false, batchSize: undefined })
  })
})

describe('B012 item 10: GET /api/agents/:id/search', () => {
  it('reads ?role= and ?conversation_file=', async () => {
    await call('GET', '/api/agents/a1/search?q=hello&role=user&conversation_file=%2Fx.jsonl')
    const p = m.searchConversations.mock.calls[0][1]
    expect(p.roleFilter).toBe('user')
    expect(p.conversationFile).toBe('/x.jsonl')
    expect(p.query).toBe('hello')
  })
  it('does not use the old headless names', async () => {
    await call('GET', '/api/agents/a1/search?q=hello&roleFilter=user&conversationFile=%2Fx.jsonl')
    const p = m.searchConversations.mock.calls[0][1]
    expect(p.roleFilter ?? null).toBeNull()
    expect(p.conversationFile).toBeUndefined()
  })
  it('useRrf is true unless ?useRrf=false', async () => {
    await call('GET', '/api/agents/a1/search?q=x')
    expect(m.searchConversations.mock.calls[0][1].useRrf).toBe(true)
    await call('GET', '/api/agents/a1/search?q=x&useRrf=false')
    expect(m.searchConversations.mock.calls[1][1].useRrf).toBe(false)
  })
})

describe('B012 item 11: POST /api/agents/:id/heartbeat', () => {
  it('passes claudeSessionId', async () => {
    m.heartbeat.mockReturnValue(ok)
    await call('POST', '/api/agents/a1/heartbeat', { status: 'active', claudeSessionId: 'sess-1' })
    expect(m.heartbeat).toHaveBeenCalledWith('a1', 'active', 'sess-1')
  })
})

describe('B012 item 12: POST /api/agents/:id/wake and /hibernate', () => {
  it('wake lowercases the program and type-checks every field', async () => {
    await call('POST', '/api/agents/a1/wake', { program: 'Claude', startProgram: false, sessionIndex: '3', projectDirectory: 7, permissionMode: 'plan', allowHostFallback: 'yes', junk: 1 })
    expect(m.wakeAgent).toHaveBeenCalledWith('a1', {
      startProgram: false, sessionIndex: 0, program: 'claude', projectDirectory: undefined, permissionMode: 'plan', allowHostFallback: false,
    })
  })
  it('wake with an empty or invalid body uses the defaults', async () => {
    await call('POST', '/api/agents/a1/wake', undefined, '{not json')
    expect(m.wakeAgent).toHaveBeenCalledWith('a1', {
      startProgram: true, sessionIndex: 0, program: undefined, projectDirectory: undefined, permissionMode: undefined, allowHostFallback: false,
    })
  })
  it('hibernate passes only sessionIndex', async () => {
    await call('POST', '/api/agents/a1/hibernate', { sessionIndex: 2, evil: true })
    expect(m.hibernateAgent).toHaveBeenCalledWith('a1', { sessionIndex: 2 })
  })
  it('wake proxies to the remote host recorded in the registry', async () => {
    m.getAgent.mockReturnValue({ hostId: 'remote-1', hostUrl: 'http://remote:23000' })
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ success: true, woken: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const { res } = await call('POST', '/api/agents/a1/wake', { program: 'Codex' })
    expect(m.wakeAgent).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('http://remote:23000/api/agents/a1/wake')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).program).toBe('codex')
    expect(res.status).toBe(200)
  })
  it('wake answers 502 when the remote host is unreachable', async () => {
    m.getAgent.mockReturnValue({ hostId: 'remote-1', hostUrl: 'http://remote:23000' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const { res } = await call('POST', '/api/agents/a1/wake', {})
    expect(res.status).toBe(502)
  })
  it('hibernate proxies to the remote host', async () => {
    m.getAgent.mockReturnValue({ hostId: 'remote-1', hostUrl: 'http://remote:23000' })
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await call('POST', '/api/agents/a1/hibernate', { sessionIndex: 1 })
    expect(m.hibernateAgent).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls[0][0]).toBe('http://remote:23000/api/agents/a1/hibernate')
  })
})

describe('B012 item 13: graph/code, graph/db, docs defaults and numeric parsing', () => {
  it('graph/code defaults action to stats, depth to 1 and parses depth to a number', async () => {
    await call('GET', '/api/agents/a1/graph/code')
    expect(m.queryCodeGraph).toHaveBeenCalledWith('a1', { action: 'stats', name: null, from: null, to: null, project: null, nodeId: null, depth: 1 })
    await call('GET', '/api/agents/a1/graph/code?action=callers&name=f&depth=3&project=%2Fp')
    expect(m.queryCodeGraph.mock.calls[1][1]).toMatchObject({ action: 'callers', name: 'f', depth: 3, project: '/p' })
  })
  it('graph/db defaults action to stats', async () => {
    await call('GET', '/api/agents/a1/graph/db?database=pg')
    expect(m.queryDbGraph).toHaveBeenCalledWith('a1', { action: 'stats', name: null, column: null, database: 'pg' })
  })
  it('docs defaults action to stats and limit to 10 (a number)', async () => {
    await call('GET', '/api/agents/a1/docs')
    expect(m.queryDocs).toHaveBeenCalledWith('a1', { action: 'stats', q: null, keyword: null, type: null, docId: null, limit: 10, project: null })
    await call('GET', '/api/agents/a1/docs?limit=4&q=x')
    expect(m.queryDocs.mock.calls[1][1]).toMatchObject({ limit: 4, q: 'x' })
  })
})

describe('B012 item 14: GET /api/marketplace/skills', () => {
  it('includeContent is a boolean and false is false', async () => {
    await call('GET', '/api/marketplace/skills?includeContent=false&search=x')
    expect(m.listMarketplaceSkills).toHaveBeenCalledWith({ marketplace: undefined, plugin: undefined, category: undefined, search: 'x', includeContent: false })
    await call('GET', '/api/marketplace/skills?includeContent=true')
    expect(m.listMarketplaceSkills.mock.calls[1][0].includeContent).toBe(true)
  })
})

describe('B012 item 15: DELETE /api/agents/:id/skills', () => {
  it('passes ?type= and defaults it to auto', async () => {
    await call('DELETE', '/api/agents/a1/skills?skill=foo&type=custom')
    expect(m.removeSkill).toHaveBeenCalledWith('a1', 'foo', 'custom')
    await call('DELETE', '/api/agents/a1/skills?skill=bar')
    expect(m.removeSkill).toHaveBeenLastCalledWith('a1', 'bar', 'auto')
  })
  it('answers 400 without ?skill=', async () => {
    const { res } = await call('DELETE', '/api/agents/a1/skills')
    expect(res.status).toBe(400)
    expect(m.removeSkill).not.toHaveBeenCalled()
  })
})

describe('B012 item 16: GET /api/sessions/:id/command', () => {
  it('adds success:true', async () => {
    const { json } = await call('GET', '/api/sessions/s1/command')
    expect(json()).toEqual({ success: true, idle: true, lastActivity: 'now' })
  })
})

describe('B012 cosmetic items', () => {
  it('invalid JSON answers 400 (not a generic 500)', async () => {
    const { res, json } = await call('POST', '/api/v1/messages/pending/ack', undefined, '{oops')
    expect(res.status).toBe(400)
    expect(json().error).toBe('invalid_request')
  })
  it('a JSON body that is not an object (null) answers 400', async () => {
    const { res } = await call('POST', '/api/sessions/create', undefined, 'null')
    expect(res.status).toBe(400)
  })
  it('rotate-keys passes null to the service on an invalid body, as Next does', async () => {
    await call('POST', '/api/v1/auth/rotate-keys', undefined, '{oops')
    expect(m.rotateKeypair.mock.calls[0][0]).toBeNull()
  })
  it('inject-queue 400 carries a JSON Content-Type', async () => {
    const { res } = await call('GET', '/api/meetings/inject-queue')
    expect(res.status).toBe(400)
    expect(res.headers['Content-Type']).toBe('application/json')
  })
  it('repos DELETE without ?url= is a 400 and does not reach the service', async () => {
    const { res } = await call('DELETE', '/api/agents/a1/repos')
    expect(res.status).toBe(400)
    expect(m.removeRepo).not.toHaveBeenCalled()
  })
  it('URL-decodes path params once, for every route', async () => {
    await call('DELETE', '/api/agents/a%20b/graph/code?project=x')
    expect(m.deleteCodeGraph.mock.calls[0][0]).toBe('a b')
    await call('POST', '/api/agents/a%2541/heartbeat', {})
    expect(m.heartbeat.mock.calls[0][0]).toBe('a%41')
  })
  it('a malformed percent-escape in a path param is a 400', async () => {
    const { res } = await call('DELETE', '/api/agents/%E0%A4%A/graph/code?project=x')
    expect(res.status).toBe(400)
  })
})
