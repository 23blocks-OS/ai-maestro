import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { spawn, execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import type { AddressInfo } from 'net'

// Reported from the field (2026-10-20): `aimaestro-agent.sh update crab-cto --add-tag role:cto` wrote the tag on
// crab-hr. The agent search is a loose text match; crab-hr's task description mentions crab-cto, it sorted first,
// and the resolver took the first hit. An exact id, name, alias or label must win, and a guess must not be acted on.
const script = path.join(__dirname, '../plugin/plugins/ai-maestro/scripts/aimaestro-agent.sh')
const haveTools = (() => { try { execFileSync('jq', ['--version']); execFileSync('curl', ['--version']); return fs.existsSync(script) } catch { return false } })()

const HR = 'aaaaaaaa-0000-4000-8000-000000000001'
const CTO = 'bbbbbbbb-0000-4000-8000-000000000002'
const PRODUCT = 'cccccccc-0000-4000-8000-000000000003'
const agents: Record<string, any> = {
  [HR]: { id: HR, name: 'crab-hr', alias: 'crab-hr', label: 'Hana', tags: [], taskDescription: 'build crab-product then crab-cto' },
  [CTO]: { id: CTO, name: 'crab-cto', alias: 'crab-cto', label: 'Aurelia', tags: [] },
  [PRODUCT]: { id: PRODUCT, name: 'crab-product', alias: 'crab-product', label: 'Paz', tags: [] },
  'dddddddd-0000-4000-8000-000000000004': { id: 'dddddddd-0000-4000-8000-000000000004', name: 'crab-sales-a', alias: 'crab-sales-a', tags: [] },
  'eeeeeeee-0000-4000-8000-000000000005': { id: 'eeeeeeee-0000-4000-8000-000000000005', name: 'crab-sales-b', alias: 'crab-sales-b', tags: [] },
}
// The server's loose search: name, alias, label, id or description contains the text, in registry order
const search = (q: string) => Object.values(agents).filter(a => JSON.stringify([a.id, a.name, a.alias, a.label, a.taskDescription]).toLowerCase().includes(q.toLowerCase()))

let fakeHome = ''
let server: http.Server
let base = ''
let patched: { id: string; body: any }[] = []

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      const send = (code: number, obj: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
      const url = new URL(req.url || '/', base)
      const m = url.pathname.match(/^\/api\/agents\/([^/]+)$/)
      if (m && req.method === 'PATCH') { patched.push({ id: m[1], body: JSON.parse(raw || '{}') }); return send(200, { agent: agents[m[1]] }) }
      if (m) return agents[m[1]] ? send(200, { agent: agents[m[1]] }) : send(404, { error: 'not_found' })
      if (url.pathname === '/api/agents') return send(200, { agents: url.searchParams.has('q') ? search(url.searchParams.get('q') || '') : Object.values(agents) })
      if (url.pathname === '/api/sessions') return send(200, { sessions: [] })
      if (url.pathname === '/api/hosts') return send(200, { hosts: [{ id: 'self', url: base, isSelf: true }] })
      send(404, { error: 'not_found' })
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-agent-resolve-'))
  const helpers = path.join(fakeHome, '.local/share/aimaestro/shell-helpers')
  fs.mkdirSync(helpers, { recursive: true })
  fs.copyFileSync(path.join(__dirname, '../scripts/shell-helpers/common.sh'), path.join(helpers, 'common.sh'))
})
afterAll(() => { server?.close(); if (fakeHome) fs.rmSync(fakeHome, { recursive: true, force: true }) })

function update(who: string, ...args: string[]): Promise<{ code: number | null; out: string }> {
  patched = []
  return new Promise(resolve => {
    const child = spawn('bash', [script, 'update', who, ...args], { env: { ...process.env, HOME: fakeHome, AIMAESTRO_API_BASE: base, AIMAESTRO_API: base } })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })
    child.on('close', code => resolve({ code, out }))
  })
}

describe.skipIf(!haveTools)('aimaestro-agent.sh resolves the agent you named', () => {
  it('the search for crab-cto returns crab-hr first (the bug\'s precondition)', () => {
    expect(search('crab-cto').map(a => a.name)).toEqual(['crab-hr', 'crab-cto'])
  })

  it('update crab-cto writes on crab-cto, not on crab-hr', async () => {
    const r = await update('crab-cto', '--add-tag', 'role:cto')
    expect(r.code).toBe(0)
    expect(patched).toHaveLength(1)
    expect(patched[0].id).toBe(CTO)
    expect(patched[0].body.tags).toContain('role:cto')
  })

  it('update crab-product writes on crab-product', async () => {
    await update('crab-product', '--add-tag', 'role:product')
    expect(patched.map(p => p.id)).toEqual([PRODUCT])
  })

  it('a label, an id and a different case all find the right agent', async () => {
    await update('Aurelia', '--add-tag', 'x:1')
    expect(patched.map(p => p.id)).toEqual([CTO])
    await update(CTO, '--add-tag', 'x:2')
    expect(patched.map(p => p.id)).toEqual([CTO])
    await update('CRAB-CTO', '--add-tag', 'x:3')
    expect(patched.map(p => p.id)).toEqual([CTO])
  })

  it('a hit on a description only is not a match: nothing is written', async () => {
    // "crab-product then" appears only in crab-hr's description
    const r = await update('product-then', '--add-tag', 'x:1')
    expect(patched).toEqual([])
    expect(r.code).not.toBe(0)
  })

  it('a name that two agents share a part of is refused, with the list, and nothing is written', async () => {
    const r = await update('crab-sales', '--add-tag', 'x:1')
    expect(r.code).not.toBe(0)
    expect(patched).toEqual([])
    expect(r.out).toContain('crab-sales-a')
    expect(r.out).toContain('crab-sales-b')
  })

  it('one agent with the text in its name is still accepted', async () => {
    await update('sales-a', '--add-tag', 'x:1')
    expect(patched.map(p => p.id)).toEqual(['dddddddd-0000-4000-8000-000000000004'])
  })
})
