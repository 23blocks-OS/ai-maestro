/**
 * Headless routes must pass the right ARGUMENTS to the services (#539).
 *
 * `POST /api/sessions/:id/command` handed the whole parsed body to a parameter that
 * is a string, so the endpoint rejected every request with `missing_field`; the
 * same mistake sat on `POST /api/agents/:id/subconscious`. These tests assert on the
 * call arguments, not the response: a response check passes just as happily if the
 * object is passed again and a mock echoes it back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassThrough } from 'stream'
import fs from 'fs'
import path from 'path'

const { sendCommandMock, triggerMock } = vi.hoisted(() => ({
  sendCommandMock: vi.fn(),
  triggerMock: vi.fn(),
}))

vi.mock('@/services/sessions-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/sessions-service')>()
  return { ...actual, sendCommand: sendCommandMock }
})
vi.mock('@/services/agents-subconscious-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/agents-subconscious-service')>()
  return { ...actual, triggerSubconsciousAction: triggerMock }
})

import { createHeadlessRouter } from '@/services/headless-router'

async function post(url: string, body?: unknown, raw?: string) {
  const req: any = new PassThrough()
  req.method = 'POST'
  req.url = url
  req.headers = { 'content-type': 'application/json' }
  const res: any = {
    headersSent: false,
    status: 0,
    out: '',
    writeHead(code: number) { this.status = code; this.headersSent = true },
    end(chunk?: string) { this.out += chunk ?? '' },
  }
  const done = createHeadlessRouter().handle(req, res)
  req.end(raw ?? (body === undefined ? '' : JSON.stringify(body)))
  await done
  return res
}

beforeEach(() => {
  sendCommandMock.mockReset().mockResolvedValue({ data: { success: true }, status: 200 })
  triggerMock.mockReset().mockResolvedValue({ data: { success: true }, status: 200 })
})

describe('POST /api/sessions/:id/command', () => {
  it('passes the command as a string and the options as an object', async () => {
    await post('/api/sessions/repro/command', { command: 'echo hi', requireIdle: false, addNewline: false, verify: true })
    const [session, command, options] = sendCommandMock.mock.calls[0]
    expect(session).toBe('repro')
    expect(typeof command).toBe('string')
    expect(command).toBe('echo hi')
    expect(options).toEqual({ requireIdle: false, addNewline: false, verify: true })
  })

  it('leaves the options undefined when the caller omits them (service defaults apply)', async () => {
    await post('/api/sessions/repro/command', { command: 'ls' })
    const [, command, options] = sendCommandMock.mock.calls[0]
    expect(command).toBe('ls')
    expect(options).toEqual({ requireIdle: undefined, addNewline: undefined, verify: undefined })
  })

  it('still lets the service reject a missing command', async () => {
    await post('/api/sessions/repro/command')
    expect(sendCommandMock.mock.calls[0][1]).toBeUndefined()
  })

  it('answers 200 with the service result', async () => {
    const res = await post('/api/sessions/repro/command', { command: 'ls' })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.out)).toEqual({ success: true })
  })
})

describe('POST /api/agents/:id/subconscious', () => {
  it('passes the action as a string', async () => {
    await post('/api/agents/a1/subconscious', { action: 'consolidate' })
    const [agentId, action] = triggerMock.mock.calls[0]
    expect(agentId).toBe('a1')
    expect(typeof action).toBe('string')
    expect(action).toBe('consolidate')
  })
})

// The class of bug, not just the two instances: a route that hands the whole body to a
// service whose second parameter is a bare `string`. Object-typed parameters are fine.
describe('every headless route that passes a bare body', () => {
  const root = path.join(__dirname, '..')
  const router = fs.readFileSync(path.join(root, 'services/headless-router.ts'), 'utf8')
  const services = fs.readdirSync(path.join(root, 'services')).filter(f => f.endsWith('.ts'))
    .map(f => fs.readFileSync(path.join(root, 'services', f), 'utf8'))

  const called = new Set<string>()
  for (const m of router.matchAll(/await (\w+)\(\s*[\w.]+\s*,\s*body\s*\)/g)) called.add(m[1])

  it('finds the calls it is meant to check', () => {
    expect(called.size).toBeGreaterThan(15)
  })

  it('never passes it to a parameter typed as a bare string', () => {
    const offenders: string[] = []
    for (const fn of called) {
      for (const src of services) {
        const m = src.match(new RegExp(`export (?:async )?function ${fn}\\s*\\(([^)]*)\\)`, 's'))
        if (!m) continue
        const second = m[1].split(',')[1]?.trim() ?? ''
        if (/^\w+\??:\s*string\s*$/.test(second)) offenders.push(`${fn}(${second})`)
      }
    }
    expect(offenders).toEqual([])
  })
})
