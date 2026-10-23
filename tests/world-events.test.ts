import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { listLocalWorldEvents } from '@/services/world-events-service'

const A = '8d92cd08-c3c9-4374-b9cd-713fe1cdbe3f'
const B = '4b00f39a-5a1f-48f6-a10a-e4cad95fbfa8'

let root: string
const put = (agent: string, sender: string, id: string, ts: number, extra: Record<string, unknown> = {}) => {
  const dir = path.join(root, agent, 'messages', 'inbox', sender)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
    envelope: { id, from: `${sender.split('_')[0]}@rnd23blocks.aimaestro.local`, to: 'x', subject: 'SECRET SUBJECT', timestamp: new Date(ts).toISOString() },
    payload: 'SECRET BODY', ...extra,
  }))
}

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'world-events-')) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('listLocalWorldEvents', () => {
  it('lists recent deliveries oldest first, with the sender name and the recipient id', async () => {
    const now = Date.now()
    put(A, 'crab-gm_rnd23blocks', 'msg_1', now - 5000)
    put(B, 'tito_rnd23blocks', 'msg_2', now - 2000)
    const events = await listLocalWorldEvents(now - 20_000, 'h1', root)
    expect(events.map(e => [e.id, e.from, e.toAgentId, e.hostId])).toEqual([
      ['msg_1', 'crab-gm', A, 'h1'],
      ['msg_2', 'tito', B, 'h1'],
    ])
  })

  it('never returns the subject or the body', async () => {
    put(A, 'crab-gm_x', 'msg_1', Date.now() - 1000)
    const json = JSON.stringify(await listLocalWorldEvents(Date.now() - 20_000, 'h1', root))
    expect(json).not.toContain('SECRET')
  })

  it('skips deliveries at or before `since`, old files, non-agent folders, junk and oversized files', async () => {
    const now = Date.now()
    put(A, 'old_x', 'msg_old', now - 9 * 60_000)
    put(A, 'new_x', 'msg_new', now - 1000)
    put('sebastian', 'crab-gm_x', 'msg_name_dir', now - 1000)
    const junk = path.join(root, A, 'messages', 'inbox', 'new_x', 'junk.json')
    fs.writeFileSync(junk, '{not json')
    const events = await listLocalWorldEvents(now - 2000, 'h1', root)
    expect(events.map(e => e.id)).toEqual(['msg_new'])
    expect(await listLocalWorldEvents(now, 'h1', root)).toEqual([])
  })

  it('returns nothing when there is no AMP folder', async () => {
    expect(await listLocalWorldEvents(0, 'h1', path.join(root, 'nope'))).toEqual([])
  })
})

describe('listLocalWorldEvents history', () => {
  it('reaches back a day only when asked, and keeps the short window otherwise', async () => {
    const now = Date.now()
    put(A, 'old_x', 'msg_hours', now - 5 * 3_600_000)
    put(A, 'new_x', 'msg_new', now - 1000)
    expect((await listLocalWorldEvents(0, 'h1', root)).map(e => e.id)).toEqual(['msg_new'])
    expect((await listLocalWorldEvents(0, 'h1', root, { history: true })).map(e => e.id)).toEqual(['msg_hours', 'msg_new'])
  })

  it('still stops at a day', async () => {
    put(A, 'old_x', 'msg_ancient', Date.now() - 30 * 3_600_000)
    expect(await listLocalWorldEvents(0, 'h1', root, { history: true })).toEqual([])
  })
})
