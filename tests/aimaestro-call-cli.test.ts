import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import { spawn, execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import type { AddressInfo } from 'net'

// The agent's call command, run against a fake AI Maestro. Needs bash, curl and jq.
const script = path.join(__dirname, '../plugin/plugins/ai-maestro/scripts/aimaestro-call.sh')
const haveTools = (() => { try { execFileSync('jq', ['--version']); execFileSync('curl', ['--version']); return fs.existsSync(script) } catch { return false } })()

interface Seen { method: string; url: string; body: any }
const seen: Seen[] = []
let server: http.Server
let base = ''
let pushEnabled = true
let callState = 'ringing'
let deadPeer = false

const people = [
  { id: 'p-juan', displayName: 'Juan Pelaez', email: 'juan@acme.test', hostId: 'h1', active: true },
  { id: 'p-bob1', displayName: 'Bob', hostId: 'h1', active: true },
  { id: 'p-bob2', displayName: 'bob', hostId: 'h1', active: true },
  { id: 'p-gone', displayName: 'Gone', hostId: 'h1', active: false },
]

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      seen.push({ method: req.method || '', url: req.url || '', body: raw ? JSON.parse(raw) : undefined })
      const send = (code: number, obj: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
      const url = req.url || ''
      if (url === '/api/hosts') return send(200, { hosts: [{ id: 'h1', url: base, isSelf: true, enabled: true }, ...(deadPeer ? [{ id: 'down', url: 'http://127.0.0.1:1', enabled: true }] : [])] })
      if (url === '/api/people') return send(200, { people })
      if (url.startsWith('/api/people-devices')) return send(200, { devices: [{ personId: 'p-juan', pushEnabled, pushTypes: pushEnabled ? ['needs_you', 'call'] : [] }] })
      if (url === '/api/calls' && req.method === 'POST') return send(201, { call: { callId: 'call-0001', state: 'inviting' } })
      if (url === '/api/calls/call-0001' && req.method === 'GET') return send(200, { call: { callId: 'call-0001', state: callState, caller: 'agent:agent-1', callee: 'person:p-juan' } })
      if (url === '/api/calls/call-0001/events') return send(200, { call: { state: 'canceled' } })
      if (url === '/api/calls/missing') return send(404, { error: 'not_found', message: 'Call missing not found' })
      send(404, { error: 'not_found' })
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))
beforeEach(() => { seen.length = 0; pushEnabled = true; callState = 'ringing'; deadPeer = false })

function run(args: string[], env: Record<string, string> = {}): Promise<{ code: number; out: string; err: string }> {
  return new Promise(resolve => {
    const p = spawn('bash', [script, ...args], { env: { ...process.env, AIMAESTRO_API: base, AIM_AGENT_ID: 'agent-1', ...env } })
    let out = '', err = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { err += d })
    p.on('close', code => resolve({ code: code ?? -1, out, err }))
  })
}

describe.skipIf(!haveTools)('aimaestro-call.sh', () => {
  it('lists the active people it can call', async () => {
    const r = await run(['people'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Juan Pelaez')
    expect(r.out).not.toContain('Gone')
  })

  it('rings a person by name, email or id, as this agent, and says it is ringing', async () => {
    for (const who of ['Juan Pelaez', 'JUAN@acme.test', 'p-juan']) {
      seen.length = 0
      const r = await run(['person', who, '--ttl', '45'])
      expect(r.code).toBe(0)
      expect(r.out.trim()).toBe('call-0001')
      expect(r.err).toContain('Ringing Juan Pelaez for 45s')
      expect(seen.find(s => s.url === '/api/calls')!.body).toEqual({ caller: 'agent:agent-1', callee: 'person:p-juan', ttlSeconds: 45 })
    }
  })

  it('warns when the phone cannot ring yet', async () => {
    pushEnabled = false
    const r = await run(['person', 'Juan Pelaez'])
    expect(r.code).toBe(0)
    expect(r.err).toContain('has no push for calls yet')
  })

  it('refuses an ambiguous or unknown name, and a call without an agent id', async () => {
    const amb = await run(['person', 'bob'])
    expect(amb.code).toBe(1)
    expect(amb.err).toContain('More than one person')
    expect(amb.err).toContain('p-bob1')
    expect((await run(['person', 'Nobody'])).code).toBe(1)
    expect((await run(['person', 'Juan Pelaez'], { AIM_AGENT_ID: '' })).code).toBe(1)
    expect(seen.some(s => s.url === '/api/calls')).toBe(false)
  })

  it('wait: 0 when answered, 2 when not answered, 3 when still ringing at the timeout', async () => {
    callState = 'accepted'
    expect((await run(['wait', 'call-0001'])).code).toBe(0)
    callState = 'rejected'
    const r = await run(['wait', 'call-0001'])
    expect(r.code).toBe(2)
    expect(r.out.trim()).toBe('rejected')
    callState = 'ringing'
    expect((await run(['wait', 'call-0001', '--timeout', '0'])).code).toBe(3)
  })

  it('cancel and end send the event as this agent, with a fresh event id', async () => {
    await run(['cancel', 'call-0001'])
    await run(['end', 'call-0001'])
    const events = seen.filter(s => s.url === '/api/calls/call-0001/events').map(s => s.body)
    expect(events.map(e => [e.type, e.actor])).toEqual([['rtc:cancel', 'agent:agent-1'], ['rtc:end', 'agent:agent-1']])
    expect(events[0].eventId).not.toBe(events[1].eventId)
  })

  // A peer that is down (Leonidas, 2026-10-30) made "people" exit with curl's code although it worked
  it('a peer that does not answer is skipped, not an error', async () => {
    deadPeer = true
    const list = await run(['people'])
    expect(list.code).toBe(0)
    expect(list.out).toContain('Juan Pelaez')
    const ring = await run(['person', 'Juan Pelaez'])
    expect(ring.code).toBe(0)
    expect(ring.out.trim()).toBe('call-0001')
  })

  it('shows the server\'s message on an error', async () => {
    const r = await run(['status', 'missing'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('Call missing not found')
  })
})
