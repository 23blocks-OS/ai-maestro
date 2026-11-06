import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { spawn, execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import type { AddressInfo } from 'net'

// The agent's device tool against a fake AI Maestro. Needs bash, curl and jq.
const script = path.join(__dirname, '../plugin/plugins/ai-maestro/scripts/adp-device.sh')
const haveTools = (() => { try { execFileSync('jq', ['--version']); execFileSync('curl', ['--version']); return true } catch { return false } })()

const KEY = 'a'.repeat(43)
const OTHER = 'b'.repeat(43)
const devices = [
  { key: KEY, name: 'kitchen', state: 'online', active: true, capabilities: ['device.health', 'camera.snapshot'] },
  { key: OTHER, name: 'office', state: 'offline', active: false, capabilities: [] },
]
const seen: { method: string; url: string; body: any }[] = []
let server: http.Server
let base = ''

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined
      seen.push({ method: req.method || '', url: req.url || '', body })
      const send = (code: number, obj: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
      if (req.url === '/api/agents/none/devices') return send(200, { devices: [] })
      if (req.url === '/api/agents/moved/devices') return send(409, { error: 'other_host', message: 'This agent lives on another host' })
      if (req.url === '/api/agents/old/devices') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html>dashboard</html>') }
      if (/\/api\/agents\/a1\/devices(\?refresh=1)?$/.test(req.url || '')) return send(200, { devices })
      if (req.url?.endsWith('/invoke')) {
        if (body.capability === 'camera.snapshot') return send(200, { ok: true, value: { mime: 'image/jpeg', path: '/tmp/pic.jpg' } })
        if (body.capability === 'display.text' && body.args.text === 'refuse') return send(200, { ok: false, error: 'denied' })
        if (body.capability === 'speaker.say') return send(409, { error: 'device_idle', message: 'Device is idle' })
        return send(200, { ok: true, value: { status: 'ok' } })
      }
      if (req.url?.endsWith('/media')) return send(200, { ok: true, value: { path: '/tmp/clip.wav' } })
      if (req.url?.endsWith('/jump')) return send(200, { activeDeviceKey: null })
      send(404, { error: 'not_found', message: 'nope' })
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => { server.close() })

// Async on purpose: the fake API lives in this process, so a blocking spawn would starve it
function run(args: string[], agent = 'a1'): Promise<{ code: number | null; out: string; err: string }> {
  seen.length = 0
  return new Promise(resolve => {
    const child = spawn('bash', [script, ...args], { env: { ...process.env, AIMAESTRO_API: base, AIM_AGENT_ID: agent } })
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('close', code => resolve({ code, out, err }))
  })
}
const last = () => seen[seen.length - 1]

describe.skipIf(!haveTools)('adp-device.sh', () => {
  it('needs to know which agent it is', async () => {
    const r = await run(['list'], '')
    expect(r.code).toBe(1)
    expect(r.err).toContain('AIM_AGENT_ID')
  })

  it('lists devices with the active one marked; an agent with none is not an error', async () => {
    const r = await run(['list'])
    expect(r.out).toContain('* kitchen  online')
    expect(r.out).toContain('  office  offline')
    expect(await run(['list'], 'none')).toMatchObject({ code: 0, out: 'No devices.\n' })
  })

  it('a failed list is an error, never "No devices"', async () => {
    const moved = await run(['list'], 'moved')
    expect(moved.code).toBe(1)
    expect(moved.err).toContain('another host')
    expect(moved.out).toBe('')
    const old = await run(['list'], 'old')
    expect(old.code).toBe(1)
    expect(old.out).toBe('')
  })

  it('finds a device by name or key, and refuses one it cannot name', async () => {
    await run(['health', 'kitchen'])
    expect(last()).toMatchObject({ url: `/api/agents/a1/devices/${KEY}/invoke`, body: { capability: 'device.health', args: {} } })
    await run(['health', OTHER])
    expect(last().url).toContain(OTHER)
    const r = await run(['health', 'garage'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('No single device')
  })

  it('prints the file an agent should read', async () => {
    expect((await run(['snapshot', 'kitchen'])).out.trim()).toBe('/tmp/pic.jpg')
    expect((await run(['listen', 'kitchen', '3'])).out.trim()).toBe('/tmp/clip.wav')
    expect(last().body).toEqual({ kind: 'microphone', seconds: 3 })
    await run(['watch', 'kitchen'])
    expect(last().body).toEqual({ kind: 'video', seconds: 5 })
  })

  it('jump, and jump none', async () => {
    await run(['jump', 'office'])
    expect(last()).toMatchObject({ method: 'POST', url: `/api/agents/a1/devices/${OTHER}/jump` })
    await run(['jump', 'none'])
    expect(last().method).toBe('DELETE')
  })

  it('text stays text: quotes and shell characters reach the API unchanged', async () => {
    const text = `it's "fine" $(rm -rf /) \`x\``
    await run(['show', 'kitchen', text])
    expect(last().body).toEqual({ capability: 'display.text', args: { text } })
  })

  it('a device refusal and an idle device fail with the reason', async () => {
    const denied = await run(['show', 'kitchen', 'refuse'])
    expect(denied.code).toBe(1)
    expect(denied.err).toContain('denied')
    const idle = await run(['say', 'kitchen', 'hello'])
    expect(idle.code).toBe(1)
    expect(idle.err).toContain('Device is idle')
  })

  it('show-image sends a typed image and refuses other files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-dev-'))
    const png = path.join(dir, 'a.png')
    fs.writeFileSync(png, Buffer.from([1, 2, 3]))
    await run(['show-image', 'kitchen', png])
    expect(last().body).toEqual({ capability: 'display.image', args: { mime: 'image/png', data: 'AQID' } })
    const big = path.join(dir, 'big.png')
    fs.writeFileSync(big, Buffer.alloc(200 * 1024, 7))
    expect((await run(['show-image', 'kitchen', big])).code).toBe(0)
    expect(last().body.args.data).toHaveLength(Math.ceil(200 * 1024 / 3) * 4)
    fs.writeFileSync(big, Buffer.alloc(257 * 1024, 7))
    const tooBig = await run(['show-image', 'kitchen', big])
    expect(tooBig.code).toBe(1)
    expect(tooBig.err).toContain('256 KiB')
    fs.writeFileSync(path.join(dir, 'a.svg'), 'x')
    expect((await run(['show-image', 'kitchen', path.join(dir, 'a.svg')])).code).toBe(1)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('run keeps numbers and booleans typed, and strings as strings', async () => {
    await run(['run', 'kitchen', 'custom.home.gate', '--arg', 'open=true', '--arg', 'shut=false', '--arg', 'level=3', '--arg', 'note=hello there'])
    expect(last().body).toEqual({ capability: 'custom.home.gate', args: { open: true, shut: false, level: 3, note: 'hello there' } })
    await run(['run', 'kitchen', 'custom.home.gate', '--arg', 'pin=007', '--arg', 'a=nan', '--arg', 'b=[1]', '--arg', 'c=1e3', '--string', 'd=12', '--string', 'e=true'])
    expect(last().body.args).toEqual({ pin: '007', a: 'nan', b: '[1]', c: '1e3', d: '12', e: 'true' })
  })
})
