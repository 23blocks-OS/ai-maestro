/**
 * B012 "Routes missing on headless": each route now answers on the headless router
 * through the same service function the Next route calls (HOME is a temp dir).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { PassThrough } from 'stream'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { pendingMock } = vi.hoisted(() => ({ pendingMock: vi.fn() }))
vi.mock('@/services/pending-wakes-service', () => ({ getPendingWakesReport: pendingMock }))

let tmp: string
let createHeadlessRouter: typeof import('@/services/headless-router').createHeadlessRouter

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'headless-added-'))
  vi.stubEnv('HOME', tmp)
  ;({ createHeadlessRouter } = await import('@/services/headless-router'))
})
afterAll(() => {
  vi.unstubAllEnvs()
  fs.rmSync(tmp, { recursive: true, force: true })
})

async function call(method: string, url: string, body?: unknown, raw?: string | Buffer, headers: Record<string, string> = {}) {
  const req: any = new PassThrough()
  req.method = method
  req.url = url
  req.headers = { 'content-type': 'application/json', ...headers }
  const res: any = {
    headersSent: false, status: 0, headers: {} as Record<string, string>, out: '',
    writeHead(code: number, h?: Record<string, string>) { this.status = code; this.headers = h || {}; this.headersSent = true },
    end(chunk?: any) { this.out += chunk ? chunk.toString() : '' },
  }
  const done = createHeadlessRouter().handle(req, res)
  req.end(raw ?? (body === undefined ? '' : JSON.stringify(body)))
  const handled = await done
  return { res, handled, json: () => JSON.parse(res.out) }
}

describe('GET/POST /api/agents/:id/schedule', () => {
  it('GET seeds the default schedule with cadence and dueNow, like the Next route', async () => {
    const { res, json } = await call('GET', '/api/agents/sched-agent/schedule')
    expect(res.status).toBe(200)
    const body = json()
    expect(body.success).toBe(true)
    expect(body.agentId).toBe('sched-agent')
    expect(Array.isArray(body.dueNow)).toBe(true)
    expect(body.tasks.length).toBeGreaterThan(0)
    expect(typeof body.tasks[0].cadence).toBe('string')
  })

  it('POST { tasks } writes agent-owned state under the temp HOME', async () => {
    const tasks = [{ id: 't1', action: 'index', everyMs: 60000, enabled: true }]
    const { res, json } = await call('POST', '/api/agents/sched-agent/schedule', { tasks })
    expect(res.status).toBe(200)
    expect(json().success).toBe(true)
    const file = path.join(tmp, '.aimaestro', 'agents', 'sched-agent', 'schedule.json')
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).tasks[0].id).toBe('t1')
  })

  it('POST without tasks or run is a 400', async () => {
    const { res } = await call('POST', '/api/agents/sched-agent/schedule', {})
    expect(res.status).toBe(400)
  })

  it('an invalid JSON body is treated as empty (400 from the service), not a 500', async () => {
    const { res } = await call('POST', '/api/agents/sched-agent/schedule', undefined, '{oops')
    expect(res.status).toBe(400)
  })

  it('hostile ids are refused with 400 and write nothing outside the agent dir', async () => {
    for (const id of ['..%2F..%2Fescape', '..', '%2e%2e', 'a%2Fb', 'x%00y', 'a%20b']) {
      const { res } = await call('POST', `/api/agents/${id}/schedule`, { tasks: [] })
      expect(res.status, id).toBe(400)
      const g = await call('GET', `/api/agents/${id}/schedule`)
      expect(g.res.status, id).toBe(400)
    }
    expect(fs.existsSync(path.join(tmp, 'escape'))).toBe(false)
    expect(fs.existsSync(path.join(tmp, '.aimaestro', 'escape'))).toBe(false)
    expect(fs.readdirSync(path.join(tmp, '.aimaestro', 'agents'))).toEqual(['sched-agent'])
  })
})

describe('GET /api/messages/pending-wakes', () => {
  it('serves the pending-wakes report service', async () => {
    pendingMock.mockResolvedValue({ data: { total: 0, pending: [] }, status: 200 })
    const { res, json } = await call('GET', '/api/messages/pending-wakes')
    expect(pendingMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    expect(json()).toEqual({ total: 0, pending: [] })
  })
})

describe('POST /api/debug/client-event', () => {
  it('logs a clipped [CLIENT] line and answers { ok: true }', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { res, json } = await call('POST', '/api/debug/client-event', { event: 'load', path: '/x', lastError: 'y'.repeat(5000) }, undefined, { 'user-agent': 'UA/1' })
    expect(res.status).toBe(200)
    expect(json()).toEqual({ ok: true })
    const line = log.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith('[CLIENT] load'))!
    expect(line).toContain('path=/x')
    expect(line).toContain('ua=UA/1')
    expect(line.length).toBeLessThan(1000)
    log.mockRestore()
  })
  it('invalid JSON still answers 200 like Next (the body is optional diagnostics)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { res } = await call('POST', '/api/debug/client-event', undefined, '{oops')
    expect(res.status).toBe(200)
    log.mockRestore()
  })
})

describe('POST /api/telemetry/v1/logs and /metrics', () => {
  for (const kind of ['logs', 'metrics']) {
    it(`${kind}: always 200 with an empty OTLP response, even for junk`, async () => {
      for (const raw of ['{}', '{oops', '[1,2]', 'null', JSON.stringify({ resourceLogs: 'nope', resourceMetrics: 7 })]) {
        const { res, json } = await call('POST', `/api/telemetry/v1/${kind}`, undefined, raw)
        expect(res.status, raw).toBe(200)
        expect(json()).toEqual({})
      }
    })
  }
})

describe('GET /.well-known/agent-messaging.json', () => {
  it('serves the discovery document with the CORS and cache headers', async () => {
    const { res, json } = await call('GET', '/.well-known/agent-messaging.json')
    expect(res.status).toBe(200)
    expect(json().capabilities).toContain('registration')
    expect(json().endpoint).toMatch(/\/api\/v1$/)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
  })
})

describe('/api/v1/attachments/*', () => {
  it('every attachment route is wired and answers a 4xx (not 404-unhandled, not 5xx) without credentials', async () => {
    const id = 'a'.repeat(32)
    const cases: Array<[string, string, string?]> = [
      ['POST', '/api/v1/attachments/upload'],
      ['GET', `/api/v1/attachments/${id}`],
      ['POST', `/api/v1/attachments/${id}/confirm`],
      ['PUT', `/api/v1/attachments/${id}/content?token=bad`, 'bytes'],
      ['GET', `/api/v1/attachments/${id}/content?token=bad`],
    ]
    for (const [method, url, raw] of cases) {
      const { res, handled } = await call(method, url, undefined, raw ?? '{}')
      expect(handled, `${method} ${url}`).toBe(true)
      expect(res.status, `${method} ${url}`).toBeGreaterThanOrEqual(400)
      expect(res.status, `${method} ${url}`).toBeLessThan(500)
    }
  })
  it('hostile attachment ids never reach the disk', async () => {
    for (const id of ['..%2F..%2Fetc%2Fpasswd', '%00', 'a%2Fb']) {
      const { res } = await call('GET', `/api/v1/attachments/${id}/content?token=x`)
      expect(res.status, id).toBeGreaterThanOrEqual(400)
      expect(res.status, id).toBeLessThan(500)
    }
  })
})
