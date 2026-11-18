import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { spawn, execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import type { AddressInfo } from 'net'

// `aimaestro-agent.sh update --add-tag ... --add-tag ...` against a fake AI Maestro API. Reported from the
// field: repeated --add-tag flags overwrote each other, so only the last tag landed. Needs bash, curl and jq.
const script = path.join(__dirname, '../plugin/plugins/ai-maestro/scripts/aimaestro-agent.sh')
const haveTools = (() => { try { execFileSync('jq', ['--version']); execFileSync('curl', ['--version']); return fs.existsSync(script) } catch { return false } })()

const ID = '11111111-2222-4333-8444-555555555555'
// The script sources common.sh from ~/.local/share/aimaestro/shell-helpers (installed by the installer);
// give it a throwaway HOME that has the repo's copy, so the test does not depend on this machine.
let fakeHome = ''
let server: http.Server
let base = ''
let tags: string[] = []
let patched: any[] = []
let restarts: string[] = []
let created: any[] = []

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      const send = (code: number, obj: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
      const agent = () => ({ id: ID, name: 'pas-lola', alias: 'pas-lola', tags, hostId: 'self', status: 'active' })
      if (req.method === 'POST' && req.url === '/api/agents') { created.push(JSON.parse(raw || '{}')); return send(201, { agent: agent() }) }
      if (req.method === 'PATCH') { const b = JSON.parse(raw || '{}'); patched.push(b); if (b.tags) tags = b.tags; return send(200, { agent: agent() }) }
      if (req.url === `/api/agents/${ID}/credential`) return send(200, { description: 'subscription token ACME_MAX_TOKEN', warnings: ['.claude/settings.local.json sets CLAUDE_CODE_OAUTH_TOKEN in env'] })
      if (req.url === `/api/agents/${ID}`) return send(200, { agent: agent() })
      if ((req.url || '').startsWith('/api/agents')) return send(200, { agents: [agent()] })
      if (req.url === '/api/sessions/activity') return send(200, { activity: { 'pas-lola': { status: 'active', hookStatus: 'working' } } })
      if ((req.url || '').endsWith('/hibernate') || (req.url || '').endsWith('/wake')) { restarts.push(req.url); return send(200, {}) }
      if (req.url === '/api/sessions') return send(200, { sessions: [] })
      if (req.url === '/api/hosts') return send(200, { hosts: [{ id: 'self', url: base, isSelf: true }] })
      send(404, { error: 'not_found' })
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-agent-tags-'))
  const helpers = path.join(fakeHome, '.local/share/aimaestro/shell-helpers')
  fs.mkdirSync(helpers, { recursive: true })
  fs.copyFileSync(path.join(__dirname, '../scripts/shell-helpers/common.sh'), path.join(helpers, 'common.sh'))
})
afterAll(() => { server?.close(); if (fakeHome) fs.rmSync(fakeHome, { recursive: true, force: true }) })

function update(...args: string[]): Promise<{ code: number | null; out: string }> {
  return cli('update', ID, ...args)
}

function cli(...args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise(resolve => {
    const child = spawn('bash', [script, ...args], { env: { ...process.env, HOME: fakeHome, AIMAESTRO_API_BASE: base, AIMAESTRO_API: base } })
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

describe.skipIf(!haveTools)('aimaestro-agent.sh update --credential (#65)', () => {
  it('sends the profile with names only, and prints what the agent will use and the warnings', async () => {
    patched = []
    const r = await update('--credential', 'oauth-token', '--secret', 'ACME_MAX_TOKEN', '--account', 'Acme Max plan')
    expect(r.code).toBe(0)
    expect(patched[0]).toEqual({ credential: { kind: 'oauth-token', secret: 'ACME_MAX_TOKEN', account: 'Acme Max plan' } })
    expect(r.out).toContain('subscription token ACME_MAX_TOKEN')
    expect(r.out).toContain('Warning: .claude/settings.local.json sets CLAUDE_CODE_OAUTH_TOKEN')
  })
})

describe.skipIf(!haveTools)('aimaestro-agent.sh credential switch --crew (#65)', () => {
  it('sets every agent with the tag, and does not restart one that is working', async () => {
    tags = ['team:ops']; patched = []; restarts = []
    const r = await cli('credential', 'switch', '--crew', 'team:ops', '--credential', 'oauth-token', '--secret', 'ACME_MAX_TOKEN', '--restart')
    expect(r.code).toBe(0)
    expect(patched).toEqual([{ credential: { kind: 'oauth-token', secret: 'ACME_MAX_TOKEN' } }])
    expect(restarts).toEqual([])
    expect(r.out).toContain('Not restarted, on the old account until restarted: pas-lola (active)')
  })
  it('refuses a crew nobody is in, and a switch with no kind', async () => {
    tags = []
    expect((await cli('credential', 'switch', '--crew', 'team:none', '--credential', 'host-login')).code).not.toBe(0)
    expect((await cli('credential', 'switch', ID)).code).not.toBe(0)
  })
})

describe.skipIf(!haveTools)('aimaestro-agent.sh create --credential (#65)', () => {
  it('sends the model access with the new agent, so its first start uses it', async () => {
    created = []
    const dir = path.join(fakeHome, 'Code', 'ops-1')
    const r = await cli('create', 'ops-1', '--dir', dir, '--no-session', '--credential', 'config-dir', '--cred-dir', '/Users/acme/.claude-acme', '--account', 'Acme team')
    expect(r.code, r.out).toBe(0)
    expect(created[0].credential).toEqual({ kind: 'config-dir', dir: '/Users/acme/.claude-acme', account: 'Acme team' })
    expect(created[0].workingDirectory).toContain('ops-1')
  })

  it('refuses credential details without a kind', async () => {
    created = []
    const r = await cli('create', 'ops-2', '--dir', path.join(fakeHome, 'Code', 'ops-2'), '--no-session', '--secret', 'ACME_MAX_TOKEN')
    expect(r.code).not.toBe(0)
    expect(created).toEqual([])
  })
})
