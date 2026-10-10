/**
 * F029 item 5: hostile ids on the headless routes touched by B012.
 *
 * An id from the URL becomes a directory (~/.aimaestro/agents/<id>), a tmux session
 * name or a file name. The router now percent-decodes path params exactly like
 * Next.js does, so `..%2F..%2Fx` reaches the services as `../../x`. For each route
 * this sends hostile ids through the REAL services (HOME is a temp dir) and asserts
 * the answer is never a 5xx and that nothing appears outside the temp HOME or in
 * the agents directory.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PassThrough } from 'stream'
import fs from 'fs'
import os from 'os'
import path from 'path'

let tmp: string
let outside: string
let createHeadlessRouter: typeof import('@/services/headless-router').createHeadlessRouter

const HOSTILE = [
  '..%2F..%2Fescape',
  '..',
  '%2e%2e%2fescape',
  'a%2Fb',
  'x%00y',
  'a%3Brm%20-rf%20%2F',
  '%24(touch%20pwned)',
  encodeURIComponent('x'.repeat(5000)),
]

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hostile-home-'))
  outside = path.dirname(tmp)
  vi.stubEnv('HOME', tmp)
  ;({ createHeadlessRouter } = await import('@/services/headless-router'))
})
afterAll(() => {
  vi.unstubAllEnvs()
  fs.rmSync(tmp, { recursive: true, force: true })
})

async function call(method: string, url: string, body: unknown = {}) {
  const req: any = new PassThrough()
  req.method = method
  req.url = url
  req.headers = { 'content-type': 'application/json' }
  const res: any = {
    headersSent: false, status: 0, out: '',
    writeHead(code: number) { this.status = code; this.headersSent = true },
    end(chunk?: any) { this.out += chunk ? chunk.toString() : '' },
  }
  const done = createHeadlessRouter().handle(req, res)
  req.end(JSON.stringify(body))
  await done
  return res
}

function listTree(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
      const p = path.join(d, e.name)
      out.push(path.relative(tmp, p))
      if (e.isDirectory()) walk(p)
    }
  }
  walk(dir)
  return out
}

// [method, path template with {id}, body]
const AGENT_ROUTES: Array<[string, string, unknown?]> = [
  ['POST', '/api/agents/{id}/heartbeat', { status: 'active', claudeSessionId: 'abc' }],
  ['POST', '/api/agents/{id}/wake', {}],
  ['POST', '/api/agents/{id}/hibernate', {}],
  ['GET', '/api/agents/{id}/search?q=hello&role=user&conversation_file=%2Fx'],
  ['POST', '/api/agents/{id}/index-delta?dryRun=true'],
  ['POST', '/api/agents/{id}/memory/consolidate?dryRun=true'],
  ['GET', '/api/agents/{id}/graph/query?q=callers&name=f'],
  ['GET', '/api/agents/{id}/graph/code?action=stats'],
  ['DELETE', '/api/agents/{id}/graph/code?project=%2Fp'],
  ['GET', '/api/agents/{id}/graph/db'],
  ['GET', '/api/agents/{id}/docs?limit=2'],
  ['PUT', '/api/agents/{id}/skills/settings', { settings: { a: 1 } }],
  ['DELETE', '/api/agents/{id}/skills?skill=x&type=auto'],
  ['DELETE', '/api/agents/{id}/repos?url=git%40github.com%3Ax%2Fy.git'],
  ['GET', '/api/agents/{id}/messages'],
  ['GET', '/api/agents/{id}/schedule'],
  ['POST', '/api/agents/{id}/schedule', { tasks: [] }],
  ['GET', '/api/agents/{id}/secret-requests'],
  ['POST', '/api/agents/{id}/secret-requests', { name: 'OPENAI_API_KEY' }],
  ['POST', '/api/agents/{id}/secret-requests/00000000-0000-0000-0000-000000000000', { decline: true }],
]

describe('hostile agent ids on the routes touched by B012', () => {
  for (const [method, tpl, body] of AGENT_ROUTES) {
    it(`${method} ${tpl} never answers 5xx and creates nothing`, async () => {
      for (const id of HOSTILE) {
        const res = await call(method, tpl.replace('{id}', id), body)
        expect(res.status, `${method} ${tpl.replace('{id}', id).slice(0, 80)}`).toBeGreaterThan(0)
        expect(res.status, `${method} ${tpl.replace('{id}', id).slice(0, 80)} -> ${res.out.slice(0, 120)}`).toBeLessThan(500)
      }
      // Nothing written for a hostile id: no agent directories, nothing in the parent of HOME
      const agentsDir = path.join(tmp, '.aimaestro', 'agents')
      expect(fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((n) => n !== 'registry.json') : []).toEqual([])
      expect(fs.existsSync(path.join(outside, 'escape'))).toBe(false)
      expect(fs.existsSync(path.join(tmp, 'escape'))).toBe(false)
      expect(fs.existsSync(path.join(tmp, 'pwned'))).toBe(false)
    })
  }

  it('a malformed percent-escape is a 400 on every one of those routes', async () => {
    for (const [method, tpl, body] of AGENT_ROUTES) {
      const res = await call(method, tpl.replace('{id}', '%E0%A4%A'), body)
      expect(res.status, `${method} ${tpl}`).toBe(400)
    }
  })

  it('left no stray files anywhere in the temp HOME beyond .aimaestro bookkeeping', () => {
    const stray = listTree(tmp).filter((p) => !p.startsWith('.aimaestro') && !p.startsWith('.agent-messaging'))
    expect(stray).toEqual([])
  })
})

describe('hostile session names on the session routes touched by B012', () => {
  const SESSION_ROUTES: Array<[string, string, unknown?]> = [
    ['PATCH', '/api/sessions/{id}/rename', { newName: 'ok' }],
    ['PATCH', '/api/sessions/ok/rename', { newName: '{id}' }],
    ['GET', '/api/sessions/{id}/command'],
  ]
  for (const [method, tpl, body] of SESSION_ROUTES) {
    it(`${method} ${tpl} never answers 5xx`, async () => {
      for (const id of HOSTILE) {
        const b = body && typeof body === 'object'
          ? JSON.parse(JSON.stringify(body).replace('{id}', decodeURIComponent(id).replace(/"/g, '\\"').replace(/\\/g, '\\\\').replace(/\0/g, '')))
          : body
        const res = await call(method, tpl.replace('{id}', id), b)
        expect(res.status, `${method} ${tpl} ${id.slice(0, 40)} -> ${res.out.slice(0, 120)}`).toBeLessThan(500)
      }
      expect(fs.existsSync(path.join(tmp, 'pwned'))).toBe(false)
    })
  }
})
