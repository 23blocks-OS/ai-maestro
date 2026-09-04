/**
 * Tests for lib/agent-uploads.ts — pasting and dropping files onto agents (#270).
 *
 * A file arriving from a browser and being written to a host's filesystem gets
 * the same scrutiny an AMP attachment gets, by reusing lib/amp-attachments
 * rather than growing a second, weaker set of rules. These cover the parts
 * specific to uploads: naming a clipboard blob that has no filename, never
 * overwriting, and never escaping the upload directory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

let home: string
let homeSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'))
  homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(home)
})
afterEach(() => {
  homeSpy.mockRestore()
  fs.rmSync(home, { recursive: true, force: true })
})

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const PDF = Buffer.from('%PDF-1.4 hello')
const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01])
const AGENT = 'agent-abc123'

async function lib() {
  return await import('@/lib/agent-uploads')
}

describe('naming a clipboard blob', () => {
  it('derives a readable, sortable name from the MIME type', async () => {
    const { defaultNameFor } = await lib()
    const name = defaultNameFor('image/png', new Date('2026-09-04T12:34:56Z'))
    expect(name).toBe('pasted_2026-09-04_12-34-56.png')
  })

  it.each([
    ['image/jpeg', 'jpg'], ['image/gif', 'gif'], ['image/webp', 'webp'],
    ['application/pdf', 'pdf'], ['text/plain', 'txt'],
  ])('maps %s to .%s', async (mime, ext) => {
    const { defaultNameFor } = await lib()
    expect(defaultNameFor(mime, new Date())).toMatch(new RegExp(`\\.${ext}$`))
  })

  it('falls back to .bin for an unknown type rather than guessing', async () => {
    const { defaultNameFor } = await lib()
    expect(defaultNameFor('application/x-whatever', new Date())).toMatch(/\.bin$/)
  })

  it('tolerates a charset parameter on the MIME type', async () => {
    const { defaultNameFor } = await lib()
    expect(defaultNameFor('text/plain; charset=utf-8', new Date())).toMatch(/\.txt$/)
  })
})

describe('storing a file', () => {
  it('writes a pasted screenshot and returns its absolute path', async () => {
    const { storeUpload, isRejection } = await lib()
    const r = storeUpload(AGENT, PNG, { filename: null, contentType: 'image/png' })
    expect(isRejection(r)).toBe(false)
    if (isRejection(r)) return
    expect(path.isAbsolute(r.path)).toBe(true)
    expect(fs.readFileSync(r.path)).toEqual(PNG)
  })

  it('stays OUT of the agent working directory', async () => {
    // Screenshots dropped into a git repo show up in `git status`, get
    // committed by an agent tidying up, or collide with real files.
    const { storeUpload, isRejection } = await lib()
    const r = storeUpload(AGENT, PDF, { filename: 'report.pdf', contentType: 'application/pdf' })
    if (isRejection(r)) throw new Error(r.reason)
    expect(r.path).toContain(path.join('.aimaestro', 'uploads', AGENT))
  })

  it('keeps a real filename when one is given', async () => {
    const { storeUpload, isRejection } = await lib()
    const r = storeUpload(AGENT, PDF, { filename: 'services-agreement.pdf', contentType: 'application/pdf' })
    if (isRejection(r)) throw new Error(r.reason)
    expect(r.filename).toBe('services-agreement.pdf')
  })

  it('NEVER overwrites — two pastes in the same second stay two files', async () => {
    const { storeUpload, isRejection } = await lib()
    const second = Buffer.concat([PNG, Buffer.from([0xff, 0xee])])
    const a = storeUpload(AGENT, PNG, { filename: 'shot.png', contentType: 'image/png' })
    const b = storeUpload(AGENT, second, { filename: 'shot.png', contentType: 'image/png' })
    if (isRejection(a) || isRejection(b)) throw new Error('rejected')
    expect(a.path).not.toBe(b.path)
    // Both survive, each with its own bytes — the first is not clobbered.
    expect(fs.readFileSync(a.path)).toEqual(PNG)
    expect(fs.readFileSync(b.path)).toEqual(second)
  })

  it('leaves no .part file behind', async () => {
    // Write-then-rename: a reader must never see a partial file under a name
    // an agent has already been told about.
    const { storeUpload, isRejection, agentUploadDir } = await lib()
    const r = storeUpload(AGENT, PNG, { filename: 'shot.png', contentType: 'image/png' })
    if (isRejection(r)) throw new Error(r.reason)
    expect(fs.readdirSync(agentUploadDir(AGENT)).filter(f => f.endsWith('.part'))).toEqual([])
  })
})

describe('refusing what it should', () => {
  it('rejects an executable however it is labelled', async () => {
    const { storeUpload, isRejection } = await lib()
    const r = storeUpload(AGENT, ELF, { filename: 'report.pdf', contentType: 'application/pdf' })
    expect(isRejection(r)).toBe(true)
  })

  it('rejects a blocked extension', async () => {
    const { storeUpload, isRejection } = await lib()
    const r = storeUpload(AGENT, Buffer.from('#!/bin/sh'), { filename: 'run.sh', contentType: 'text/plain' })
    expect(isRejection(r)).toBe(true)
  })

  it('rejects content that disagrees with its declared type', async () => {
    const { storeUpload, isRejection } = await lib()
    const r = storeUpload(AGENT, PNG, { filename: 'notes.txt', contentType: 'text/plain' })
    expect(isRejection(r)).toBe(true)
  })

  it('rejects an empty file', async () => {
    const { storeUpload, isRejection } = await lib()
    expect(isRejection(storeUpload(AGENT, Buffer.alloc(0), { contentType: 'image/png' }))).toBe(true)
  })

  it('rejects an oversized file', async () => {
    const { storeUpload, isRejection } = await lib()
    const big = Buffer.alloc(26_214_401)
    expect(isRejection(storeUpload(AGENT, big, { contentType: 'application/octet-stream' }))).toBe(true)
  })

  it.each(['../escape', 'a/b', '..', 'x'.repeat(200) + '/y'])(
    'rejects agent id %j rather than letting it traverse',
    async (bad) => {
      // agentId becomes a directory name and arrives from a URL.
      const { storeUpload, isRejection } = await lib()
      expect(isRejection(storeUpload(bad, PNG, { contentType: 'image/png' }))).toBe(true)
    }
  )

  it('sanitises a hostile filename instead of trusting it', async () => {
    const { storeUpload, isRejection, agentUploadDir } = await lib()
    const r = storeUpload(AGENT, PNG, { filename: '../../etc/passwd.png', contentType: 'image/png' })
    if (isRejection(r)) return // rejecting outright is also acceptable
    expect(path.dirname(r.path)).toBe(agentUploadDir(AGENT))
  })
})

describe('what the agent is told', () => {
  it('reads as an instruction, not a bare path', async () => {
    // The text is submitted as a PROMPT. A bare path is ambiguous — "what do
    // you want me to do with it?" — while this works for a screenshot and a
    // PDF alike.
    const { promptFor } = await lib()
    const p = promptFor([{ path: '/tmp/a.png', filename: 'a.png', size: 1, digest: 'sha256:x' }])
    expect(p).toContain('/tmp/a.png')
    expect(p).toMatch(/read it/)
  })

  it('quotes the path so it cannot be split', async () => {
    const { promptFor } = await lib()
    expect(promptFor([{ path: '/tmp/a.png', filename: 'a.png', size: 1, digest: 'x' }]))
      .toContain('"/tmp/a.png"')
  })

  it('lists several files with a count', async () => {
    const { promptFor } = await lib()
    const p = promptFor([
      { path: '/tmp/a.png', filename: 'a.png', size: 1, digest: 'x' },
      { path: '/tmp/b.pdf', filename: 'b.pdf', size: 1, digest: 'x' },
    ])
    expect(p).toContain('2 files')
    expect(p).toContain('/tmp/b.pdf')
  })
})
