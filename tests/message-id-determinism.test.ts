/**
 * Tests for lib/rag/id.ts message id determinism.
 *
 * `:put messages` upserts on msg_id. When the id contained `Math.random()`,
 * it could never match an existing row, so every re-index INSERTED a duplicate
 * of the message plus its ~26 msg_terms rows and its ~1.5 KB embedding.
 *
 * Measured on real agents before the fix:
 *   7dc00e00   12 MB    1,473 rows /    872 unique = 1.7x
 *   793dcc31  1.8 GB  270,177 rows / 39,540 unique = 6.8x
 *   8845dd17  3.1 GB  451,206 rows / 57,686 unique = 7.8x
 *
 * The whole point of this id is that indexing the same message twice is a
 * no-op, so that is what these lock down.
 */

import { describe, it, expect } from 'vitest'
import { msgId, codeId } from '@/lib/rag/id'

const FILE = '/Users/x/.claude/projects/-proj/abc.jsonl'
const TEXT = 'Let me read the existing spec files first.'
const TS = 1767219470012

describe('msgId.message', () => {
  it('is stable for the same message', () => {
    const a = msgId.message(TS, `${FILE}\n${TEXT}`)
    const b = msgId.message(TS, `${FILE}\n${TEXT}`)
    expect(a).toBe(b)
  })

  it('re-indexing the same message yields ONE id, not N', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => msgId.message(TS, `${FILE}\n${TEXT}`))
    )
    expect(ids.size).toBe(1)
  })

  it('distinguishes different text at the same timestamp', () => {
    // Real duplicates in the wild shared a timestamp exactly — three rows,
    // same ts, same text, three different random ids.
    expect(msgId.message(TS, `${FILE}\nfirst`)).not.toBe(msgId.message(TS, `${FILE}\nsecond`))
  })

  it('distinguishes the same text in different conversations', () => {
    const a = msgId.message(TS, `/a.jsonl\n${TEXT}`)
    const b = msgId.message(TS, `/b.jsonl\n${TEXT}`)
    expect(a).not.toBe(b)
  })

  it('distinguishes the same text at different timestamps', () => {
    expect(msgId.message(TS, `${FILE}\n${TEXT}`)).not.toBe(
      msgId.message(TS + 1, `${FILE}\n${TEXT}`)
    )
  })

  it('keeps the msg-{ts}-{suffix} shape', () => {
    // notification-service's messageRef slices the tail of the id, and the
    // transcript export sorts on ts rather than parsing the id — but the
    // human-readable timestamp prefix is worth keeping.
    expect(msgId.message(TS, 'seed')).toMatch(/^msg-1767219470012-[0-9a-f]{12}$/)
  })

  it('contains no randomness — the defect that caused the duplication', () => {
    const src = msgId.message.toString()
    expect(src).not.toContain('random')
    expect(src).not.toContain('Date.now')
  })
})

describe('other id generators were already deterministic', () => {
  // id.ts is titled "Ensures incremental updates don't create duplicate
  // entries"; messages were the sole violation of that contract.
  it('codeId.file is stable', () => {
    expect(codeId.file('/a/b.ts')).toBe(codeId.file('/a/b.ts'))
  })

  it('codeId.fn is stable and distinguishes name and file', () => {
    expect(codeId.fn('/a.ts', 'run')).toBe(codeId.fn('/a.ts', 'run'))
    expect(codeId.fn('/a.ts', 'run')).not.toBe(codeId.fn('/a.ts', 'walk'))
    expect(codeId.fn('/a.ts', 'run')).not.toBe(codeId.fn('/b.ts', 'run'))
  })
})
