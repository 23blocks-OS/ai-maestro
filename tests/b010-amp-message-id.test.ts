/**
 * B010 item 1: a federated envelope id became a file name in the recipient's
 * inbox. `../../x` wrote JSON anywhere under the user's home. Ids are now plain
 * tokens, refused by the service (400 invalid_field) and by the writer itself.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

let tmp: string
let outer: string
let writer: typeof import('@/lib/amp-inbox-writer')
let svc: typeof import('@/services/amp-service')

const HOSTILE = ['..', '../../x', '../../../../x', '/etc/evil', 'a\u0000b', 'x'.repeat(200), '%2e%2e', '..\\..\\x', 'a\\b', '․․', '．．/x', '', 'a/b', 'a.json']

const env = (id: any): any => ({
  version: 'amp/0.1', id, from: 'a@x.aimaestro.local', to: 'b@x.aimaestro.local',
  subject: 's', priority: 'normal', timestamp: new Date().toISOString(),
})

function walk(d: string): string[] {
  if (!fs.existsSync(d)) return []
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
}

beforeAll(async () => {
  outer = fs.mkdtempSync(path.join(os.tmpdir(), 'b010-amp-'))
  tmp = path.join(outer, 'home')
  fs.mkdirSync(tmp)
  vi.stubEnv('HOME', tmp)
  expect(os.homedir()).toBe(tmp)
  vi.resetModules()
  writer = await import('@/lib/amp-inbox-writer')
  svc = await import('@/services/amp-service')
})
afterAll(() => {
  vi.unstubAllEnvs()
  fs.rmSync(outer, { recursive: true, force: true })
})

describe('isSafeMessageId', () => {
  it('accepts real AMP ids', () => {
    for (const id of ['msg_1759708800_a1b2c3', 'msg_1_test', 'abc-DEF_123']) expect(writer.isSafeMessageId(id)).toBe(true)
  })
  it('rejects hostile ids', () => {
    for (const id of HOSTILE) expect(writer.isSafeMessageId(id)).toBe(false)
    expect(writer.isSafeMessageId(undefined)).toBe(false)
    expect(writer.isSafeMessageId(42)).toBe(false)
  })
})

describe('writers refuse unsafe ids', () => {
  it('writeToAMPInbox and writeToAMPSent write nothing for hostile ids', async () => {
    for (const id of HOSTILE) {
      expect(await writer.writeToAMPInbox(env(id), { type: 'notification', message: 'm' } as any, 'b', undefined, 'uuid-b')).toBeNull()
      expect(await writer.writeToAMPSent(env(id), { type: 'notification', message: 'm' } as any, 'a', 'uuid-a')).toBeNull()
    }
    expect(walk(outer)).toEqual([])
  })
  it('still writes a normal id inside the inbox', async () => {
    const p = await writer.writeToAMPInbox(env('msg_1_ok'), { type: 'notification', message: 'm' } as any, 'b', undefined, 'uuid-b')
    expect(p).toBeTruthy()
    expect(p!.startsWith(path.join(tmp, '.agent-messaging', 'agents', 'uuid-b', 'messages', 'inbox'))).toBe(true)
  })
})

describe('deliverFederated', () => {
  it('answers 400 invalid_field for a hostile id and writes nothing', async () => {
    const before = walk(outer).length
    for (const id of HOSTILE) {
      const r = await svc.deliverFederated('peer.example', { envelope: env(id), payload: { type: 'notification', message: 'm' } as any })
      expect(r.status).toBe(400)
      expect((r.data as any).error).toBe('invalid_field')
    }
    expect(walk(outer).length).toBe(before)
    expect(fs.existsSync(path.join(outer, 'x.json'))).toBe(false)
    expect(fs.existsSync(path.join(tmp, 'x.json'))).toBe(false)
  })
})
