import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { saveMessage, listMessages, getMessage, setMessageStatus, type PersonMessage } from '@/lib/person-mailbox'
import { personIdFromAddress } from '@/lib/person-address'

const P = '3f2a9c1e-0000-4000-8000-000000000001'
let home: string
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'person-mailbox-'))
  vi.spyOn(os, 'homedir').mockReturnValue(home)
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(home, { recursive: true, force: true }) })

const msg = (id: string, box: 'inbox' | 'sent', peer: string, at: string): PersonMessage => ({
  id, box, from: box === 'inbox' ? peer : `p-${P}@acme.aimaestro.local`, to: box === 'inbox' ? `p-${P}@acme.aimaestro.local` : peer,
  subject: id, priority: 'normal', timestamp: at, payload: { message: id }, verified: true, status: box === 'inbox' ? 'unread' : 'read',
})

describe('a person\'s mailbox', () => {
  it('lists a box newest first, and one conversation across both boxes oldest first', () => {
    saveMessage(P, msg('m1', 'sent', 'lola@acme.aimaestro.local', '2026-11-01T10:00:00Z'))
    saveMessage(P, msg('m2', 'inbox', 'lola@acme.aimaestro.local', '2026-11-01T10:01:00Z'))
    saveMessage(P, msg('m3', 'inbox', 'bob@acme.aimaestro.local', '2026-11-01T10:02:00Z'))
    expect(listMessages(P, { box: 'inbox' }).map(m => m.id)).toEqual(['m3', 'm2'])
    expect(listMessages(P, { withAddress: 'LOLA@acme.aimaestro.local' }).map(m => m.id)).toEqual(['m1', 'm2'])
    expect(listMessages(P, { box: 'inbox', since: '2026-11-01T10:01:30Z' }).map(m => m.id)).toEqual(['m3'])
  })

  it('keeps read state per person, and refuses ids that are not plain', () => {
    saveMessage(P, msg('m2', 'inbox', 'lola@acme.aimaestro.local', '2026-11-01T10:01:00Z'))
    expect(setMessageStatus(P, 'm2', 'read')?.status).toBe('read')
    expect(getMessage(P, 'm2')?.status).toBe('read')
    expect(getMessage(P, '../x')).toBeNull()
    expect(() => saveMessage('../etc', msg('m9', 'inbox', 'x', '2026-11-01T10:00:00Z'))).toThrow()
  })
})

describe('person addresses', () => {
  it('names a person only with the p- prefix and a valid id', () => {
    expect(personIdFromAddress(`p-${P}@acme.aimaestro.local`)).toBe(P)
    expect(personIdFromAddress('lola@acme.aimaestro.local')).toBeNull()
    expect(personIdFromAddress('p-../x@acme.aimaestro.local')).toBeNull()
  })
})
