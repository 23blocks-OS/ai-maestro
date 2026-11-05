import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { spawn, execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import type { AddressInfo } from 'net'

// `aimaestro-agent.sh doctor` (F069 step 3) against fake hosts: prints each host's report, exit 1 when a check fails.
const script = path.join(__dirname, '../plugin/plugins/ai-maestro/scripts/aimaestro-agent.sh')
const haveTools = (() => { try { execFileSync('jq', ['--version']); execFileSync('curl', ['--version']); return fs.existsSync(script) } catch { return false } })()

const report = (hostname: string, checks: any[]) => ({
  schema: 2, hostname, version: '0.106.70',
  summary: { passed: checks.filter(c => c.status === 'pass').length, warnings: checks.filter(c => c.status === 'warn').length, failed: checks.filter(c => c.status === 'fail').length },
  checks,
})
const healthy = report('alpha', [
  { name: 'tmux', status: 'pass', message: 'tmux 3.6a available' },
  { name: 'agent-folders', status: 'warn', message: '1 agent(s) point to a folder that does not exist', hint: 'Set the folder in the agent\'s profile.',
    items: [{ key: 'a1', status: 'warn', message: 'Folder /gone does not exist', agentName: 'crab-hr' }] },
])
const broken = report('beta', [
  { name: 'tmux', status: 'pass', message: 'ok' },
  { name: 'agent-programs', status: 'fail', message: 'claude is missing', hint: 'Install it.' },
])

let fakeHome = ''
const servers: http.Server[] = []
let alpha = ''
let beta = ''

function serve(handler: (url: string) => [number, unknown]): Promise<string> {
  const server = http.createServer((req, res) => {
    const [code, body] = handler(req.url || '/')
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  servers.push(server)
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))
}

beforeAll(async () => {
  beta = await serve(u => u === '/api/diagnostics' ? [200, broken] : [200, { sessions: [] }])
  alpha = await serve(u => {
    if (u === '/api/diagnostics') return [200, healthy]
    if (u === '/api/hosts') return [200, { hosts: [
      { id: 'alpha', name: 'Alpha', url: alpha, isSelf: true },
      { id: 'beta', name: 'Beta', url: `${beta}/` },
      { id: 'off', name: 'Off', url: 'http://127.0.0.1:1', enabled: false },
    ] }]
    return [200, { sessions: [] }]
  })
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-agent-doctor-'))
  const helpers = path.join(fakeHome, '.local/share/aimaestro/shell-helpers')
  fs.mkdirSync(helpers, { recursive: true })
  fs.copyFileSync(path.join(__dirname, '../scripts/shell-helpers/common.sh'), path.join(helpers, 'common.sh'))
})
afterAll(() => { servers.forEach(s => s.close()); if (fakeHome) fs.rmSync(fakeHome, { recursive: true, force: true }) })

function doctor(...args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise(resolve => {
    const child = spawn('bash', [script, 'doctor', ...args], { env: { ...process.env, HOME: fakeHome, AIMAESTRO_API_BASE: alpha, NO_COLOR: '1' } })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })
    child.on('close', code => resolve({ code, out }))
  })
}

describe.skipIf(!haveTools)('aimaestro-agent.sh doctor', () => {
  it('prints this host: warnings before passes, items named by agent, the hint; exit 0 with no failure', async () => {
    const r = await doctor()
    expect(r.code).toBe(0)
    expect(r.out).toContain('alpha · v0.106.70 · 1 passed, 1 warnings, 0 failed')
    expect(r.out.indexOf('agent-folders')).toBeLessThan(r.out.indexOf('tmux'))
    expect(r.out).toContain('crab-hr: Folder /gone does not exist')
    expect(r.out).toContain('→ Set the folder')
    expect(r.out).not.toContain('beta')
  })

  it('--all asks every enabled host, skips a disabled one, and exits 1 when one fails', async () => {
    const r = await doctor('--all')
    expect(r.code).toBe(1)
    expect(r.out).toContain('alpha · v0.106.70')
    expect(r.out).toContain('beta · v0.106.70')
    expect(r.out).toContain('agent-programs: claude is missing')
    expect(r.out).not.toContain('Off')
  })

  it('--json prints the raw report; with --all, one entry per host', async () => {
    expect(JSON.parse((await doctor('--json')).out).hostname).toBe('alpha')
    const all = JSON.parse((await doctor('--all', '--json')).out)
    expect(all.map((h: any) => [h.host, h.report.hostname])).toEqual([['Alpha', 'alpha'], ['Beta', 'beta']])
  })

  it('refuses an unknown option', async () => {
    expect((await doctor('--bogus')).code).toBe(1)
  })
})
