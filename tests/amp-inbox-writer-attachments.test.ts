import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// The writer reads os.homedir() when it loads, so point HOME at a temp dir first.
let tmpHome: string
const realHome = process.env.HOME
let writer: typeof import('@/lib/amp-inbox-writer')

const envelope = {
  version: 'amp/0.1',
  id: 'msg_1_test',
  from: 'a@x.aimaestro.local',
  to: 'b@x.aimaestro.local',
  subject: 's',
  priority: 'normal',
  timestamp: '2026-10-05T00:00:00Z',
} as any

const afpAttachment = {
  storage: 'afp',
  filename: 'f.zip',
  content_type: 'application/zip',
  size: 10,
  digest: 'sha256:' + 'a'.repeat(64),
  ref: 'afp://shared/files/f.zip',
}

beforeAll(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-writer-'))
  process.env.HOME = tmpHome
  vi.resetModules()
  writer = await import('@/lib/amp-inbox-writer')
})

afterAll(() => {
  process.env.HOME = realHome
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

function readOnly(dir: string): any {
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
  const files = walk(dir).filter(f => f.endsWith('.json'))
  expect(files).toHaveLength(1)
  return JSON.parse(fs.readFileSync(files[0], 'utf-8'))
}

describe('AMP inbox and sent copies keep payload.attachments', () => {
  it('keeps an AFP attachment in the recipient inbox, as sent', async () => {
    const p = await writer.writeToAMPInbox(envelope, { type: 'request', message: 'hi', attachments: [afpAttachment] } as any, 'b', undefined, 'uuid-b')
    expect(p).toBeTruthy()
    const saved = readOnly(path.join(tmpHome, '.agent-messaging', 'agents', 'uuid-b', 'messages', 'inbox'))
    expect(saved.payload.attachments).toEqual([afpAttachment])
  })

  it('keeps it in the sender sent copy', async () => {
    const p = await writer.writeToAMPSent(envelope, { type: 'request', message: 'hi', attachments: [afpAttachment] } as any, 'a', 'uuid-a')
    expect(p).toBeTruthy()
    const saved = readOnly(path.join(tmpHome, '.agent-messaging', 'agents', 'uuid-a', 'messages', 'sent'))
    expect(saved.payload.attachments).toEqual([afpAttachment])
  })

  it('writes no attachments key when there are none', async () => {
    const env2 = { ...envelope, id: 'msg_2_test' }
    await writer.writeToAMPInbox(env2, { type: 'notification', message: 'plain' } as any, 'c', undefined, 'uuid-c')
    const saved = readOnly(path.join(tmpHome, '.agent-messaging', 'agents', 'uuid-c', 'messages', 'inbox'))
    expect('attachments' in saved.payload).toBe(false)
  })
})
