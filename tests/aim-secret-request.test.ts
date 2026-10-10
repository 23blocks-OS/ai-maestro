import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'

const CLI = path.resolve(__dirname, '../scripts/aim-secret.mjs')
let dir: string
let server: http.Server
let seen: { method?: string; url?: string; body: string }[]
let reply: { status: number; body: unknown }

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-req-'))
  seen = []
  reply = { status: 201, body: { requestId: '11111111-2222-3333-4444-555555555555', name: 'OPENAI_API_KEY', alreadyStored: false } }
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, body })
      res.writeHead(reply.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(reply.body))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
})
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  fs.rmSync(dir, { recursive: true, force: true })
})

function run(args: string[], extra: Record<string, string> = {}, input = ''): Promise<{ code: number; out: string; err: string }> {
  const port = (server.address() as AddressInfo).port
  const env = {
    PATH: process.env.PATH ?? '', HOME: dir,
    AIM_VAULT_BACKEND: 'file', AIM_VAULT_DIR: path.join(dir, 'vault'),
    AIM_URL: `http://127.0.0.1:${port}`, AIM_AGENT_ID: 'agent-1', ...extra,
  }
  return new Promise((resolve) => {
    const c = spawn('node', [CLI, ...args], { env: env as unknown as NodeJS.ProcessEnv, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''; let err = ''
    c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d))
    c.on('close', (code) => resolve({ code: code ?? -1, out, err }))
    c.stdin.end(input)
  })
}

describe('aim-secret request', () => {
  it('asks AI Maestro for a card and returns at once, telling the agent to stop', async () => {
    const r = await run(['request', 'OPENAI_API_KEY', '--note', 'for the embedding job'])
    expect(r.code).toBe(0)
    expect(seen).toHaveLength(1)
    expect(seen[0].method).toBe('POST')
    expect(seen[0].url).toBe('/api/agents/agent-1/secret-requests')
    expect(JSON.parse(seen[0].body)).toEqual({ name: 'OPENAI_API_KEY', note: 'for the embedding job' })
    expect(r.out).toContain('End your turn')
    expect(r.out).toContain('Do not ask for the value')
  })

  it('does not bother the user when the secret is already stored', async () => {
    await run(['set', 'OPENAI_API_KEY', '--stdin'], {}, 'sk-already-here-12345')
    const r = await run(['request', 'OPENAI_API_KEY'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('already stored')
    expect(seen).toHaveLength(0)
    expect(r.out + r.err).not.toContain('sk-already-here-12345')
  })

  it('refuses a bad name before any request is made', async () => {
    for (const bad of ['bad-name', 'a b', '../x', 'lower']) {
      const r = await run(['request', bad])
      expect(r.code).toBe(2)
    }
    expect(seen).toHaveLength(0)
  })

  it('explains itself when AI Maestro is not running', async () => {
    const r = await run(['request', 'OPENAI_API_KEY'], { AIM_URL: 'http://127.0.0.1:1' })
    expect(r.code).toBe(4)
    expect(r.err).toContain('Could not reach AI Maestro')
  })

  it('explains itself when it cannot tell which agent it is', async () => {
    const r = await run(['request', 'OPENAI_API_KEY'], { AIM_AGENT_ID: '' })
    expect(r.code).toBe(4)
    expect(r.err).toContain('AIM_AGENT_ID')
    expect(seen).toHaveLength(0)
  })

  it('reports a refusal from AI Maestro', async () => {
    reply = { status: 404, body: { error: 'not_found', message: 'Agent not found' } }
    const r = await run(['request', 'OPENAI_API_KEY'])
    expect(r.code).toBe(5)
    expect(r.err).toContain('404')
  })

  it('treats an answer saying it is already stored as success', async () => {
    reply = { status: 200, body: { alreadyStored: true, name: 'OPENAI_API_KEY' } }
    const r = await run(['request', 'OPENAI_API_KEY'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('already stored')
  })
})
