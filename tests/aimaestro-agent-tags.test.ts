import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { spawn, execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import type { AddressInfo } from 'net'

// `aimaestro-agent.sh update --add-tag ... --add-tag ...` against a fake AI Maestro API. Reported from the
// field: repeated --add-tag flags overwrote each other, so only the last tag landed. Needs bash, curl and jq.
const script = path.join(__dirname, '../plugin/plugins/ai-maestro/scripts/aimaestro-agent.sh')
const haveTools = (() => { try { execFileSync('jq', ['--version']); execFileSync('curl', ['--version']); return fs.existsSync(script) } catch { return false } })()

const ID = 'b1359b9e-e79f-460a-918a-877359ee23aa'
let server: http.Server
let base = ''
let tags: string[] = []
let patched: any[] = []

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      const send = (code: number, obj: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
      const agent = () => ({ id: ID, name: 'pas-lola', alias: 'pas-lola', tags, hostId: 'self', status: 'active' })
      if (req.method === 'PATCH') { const b = JSON.parse(raw || '{}'); patched.push(b); if (b.tags) tags = b.tags; return send(200, { agent: agent() }) }
      if (req.url === `/api/agents/${ID}`) return send(200, { agent: agent() })
      if ((req.url || '').startsWith('/api/agents')) return send(200, { agents: [agent()] })
      if (req.url === '/api/sessions') return send(200, { sessions: [] })
      if (req.url === '/api/hosts') return send(200, { hosts: [{ id: 'self', url: base, isSelf: true }] })
      send(404, { error: 'not_found' })
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => { server?.close() })

function update(...args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise(resolve => {
    const child = spawn('bash', [script, 'update', ID, ...args], { env: { ...process.env, AIMAESTRO_API_BASE: base, AIMAESTRO_API: base } })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })
    child.on('close', code => resolve({ code, out }))
  })
}

describe.skipIf(!haveTools)('aimaestro-agent.sh update: repeatable tag flags', () => {
  it('keeps every --add-tag, not only the last', async () => {
    tags = ['pas']; patched = []
    const r = await update('--add-tag', 'kind:holding', '--add-tag', 'role:chief-of-staff')
    expect(r.code).toBe(0)
    expect(tags.sort()).toEqual(['kind:holding', 'pas', 'role:chief-of-staff'])
  })

  it('a single --add-tag still works', async () => {
    tags = ['pas']; patched = []
    await update('--add-tag', 'org:23blocks')
    expect(tags.sort()).toEqual(['org:23blocks', 'pas'])
  })

  it('removes every --remove-tag, not only the last', async () => {
    tags = ['pas', 'a', 'b', 'keep']; patched = []
    await update('--remove-tag', 'a', '--remove-tag', 'b')
    expect(tags.sort()).toEqual(['keep', 'pas'])
  })

  it('adds and removes in one call', async () => {
    tags = ['pas', 'old']; patched = []
    await update('--add-tag', 'new1', '--add-tag', 'new2', '--remove-tag', 'old')
    expect(tags.sort()).toEqual(['new1', 'new2', 'pas'])
  })

  it('a tag with spaces or a colon stays one tag', async () => {
    tags = []; patched = []
    await update('--add-tag', 'client:big co')
    expect(tags).toEqual(['client:big co'])
  })
})
