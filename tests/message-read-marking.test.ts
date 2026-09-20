/**
 * Tests for markMessageAsRead in lib/messageQueue.ts.
 *
 * Written while chasing pas-lola's report that messages kept being announced
 * after she had read them. This was NOT her cause — every one of the 1733
 * messages on her host carries both a `metadata` and a `local` section, so the
 * conditional write always fired. But the asymmetry is real and it sits
 * directly under the reported symptom:
 *
 *   write:  if (raw.metadata) raw.metadata.status = 'read'   ← conditional
 *   read:   metadata?.status || local?.status || 'unread'    ← defaults unread
 *
 * An envelope with neither section could never be marked read, and the function
 * returned true regardless. That is the unearned-success shape again: a caller
 * asks "did it work?", is told yes, and the message is announced forever.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

let home: string
let homeSpy: ReturnType<typeof vi.spyOn>

const AGENT = 'b1359b9e-e79f-460a-918a-877359ee23aa'

function inboxDir() {
  return path.join(home, '.agent-messaging', 'agents', AGENT, 'messages', 'inbox', 'alice_local')
}

function writeMessage(id: string, body: Record<string, unknown>) {
  fs.mkdirSync(inboxDir(), { recursive: true })
  fs.writeFileSync(path.join(inboxDir(), `${id}.json`), JSON.stringify(body, null, 2))
}

function readBack(id: string) {
  return JSON.parse(fs.readFileSync(path.join(inboxDir(), `${id}.json`), 'utf8'))
}

/** The read path's rule, from lib/messageQueue.ts line ~214. */
const statusOf = (raw: Record<string, any>) =>
  raw.metadata?.status || raw.local?.status || 'unread'

const envelope = (extra: Record<string, unknown> = {}) => ({
  envelope: { id: 'x', from: 'alice@local', to: 'bob@local' },
  payload: { subject: 'Deploy question', body: 'hi' },
  ...extra,
})

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'msgread-'))
  homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(home)
  // markMessageAsRead resolves the agent through the file-based registry before
  // it can locate the message, so a registry has to exist in the fake home.
  fs.mkdirSync(path.join(home, '.aimaestro', 'agents'), { recursive: true })
  fs.writeFileSync(
    path.join(home, '.aimaestro', 'agents', 'registry.json'),
    JSON.stringify([{ id: AGENT, alias: 'pas-lola', name: 'pas-lola', owner: 'test' }])
  )
  vi.resetModules()
})
afterEach(() => {
  homeSpy.mockRestore()
  fs.rmSync(home, { recursive: true, force: true })
})

async function markRead(id: string) {
  const { markMessageAsRead } = await import('@/lib/messageQueue')
  return markMessageAsRead(AGENT, id)
}

describe('markMessageAsRead · the ordinary case', () => {
  it('marks an envelope that already has both sections', async () => {
    writeMessage('msg_1_a', envelope({ metadata: { status: 'unread' }, local: { status: 'unread' } }))
    await expect(markRead('msg_1_a')).resolves.toBe(true)
    expect(statusOf(readBack('msg_1_a'))).toBe('read')
  })

  it('marks an old flat-format message', async () => {
    writeMessage('msg_1_b', { from: 'alice', subject: 's', status: 'unread' })
    await expect(markRead('msg_1_b')).resolves.toBe(true)
    expect(readBack('msg_1_b').status).toBe('read')
  })
})

describe('markMessageAsRead · the envelope that could never be read', () => {
  it('marks an envelope carrying NEITHER section — the latent bug', async () => {
    // Before the fix: nothing was written, true was returned, and the read path
    // kept answering 'unread' on every single poll.
    writeMessage('msg_2_a', envelope())
    await expect(markRead('msg_2_a')).resolves.toBe(true)
    expect(statusOf(readBack('msg_2_a'))).toBe('read')
  })

  it('marks an envelope with metadata but no local', async () => {
    writeMessage('msg_2_b', envelope({ metadata: { status: 'unread' } }))
    await markRead('msg_2_b')
    const raw = readBack('msg_2_b')
    expect(raw.metadata.status).toBe('read')
    expect(raw.local.status).toBe('read')
  })

  it('marks an envelope with local but no metadata', async () => {
    writeMessage('msg_2_c', envelope({ local: { status: 'unread' } }))
    await markRead('msg_2_c')
    expect(statusOf(readBack('msg_2_c'))).toBe('read')
  })

  it('does not disturb the envelope or payload it rewrites', async () => {
    writeMessage('msg_2_d', envelope())
    await markRead('msg_2_d')
    const raw = readBack('msg_2_d')
    expect(raw.envelope.from).toBe('alice@local')
    expect(raw.payload.subject).toBe('Deploy question')
  })

  it('is idempotent — marking twice stays read', async () => {
    writeMessage('msg_2_e', envelope())
    await markRead('msg_2_e')
    await markRead('msg_2_e')
    expect(statusOf(readBack('msg_2_e'))).toBe('read')
  })
})

describe('markMessageAsRead · refusing to claim success', () => {
  it('returns false for a message that does not exist', async () => {
    // The one case that must NOT report success, so a caller can tell the
    // difference between "marked" and "there was nothing to mark".
    await expect(markRead('msg_9_nope')).resolves.toBe(false)
  })
})
