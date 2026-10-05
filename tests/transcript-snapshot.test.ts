import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  snapshotFromTranscriptLines,
  readTranscriptSnapshot,
  clearSnapshotCache,
  TAIL_BYTES,
} from '@/lib/transcript-snapshot'

const T0 = '2026-10-05T04:00:00.000Z'

function assistant(opts: {
  model?: string
  input?: number
  read?: number
  write?: number
  effort?: string
  ts?: string
  sidechain?: boolean
  oneHour?: number
  fiveMin?: number
}): string {
  return JSON.stringify({
    type: 'assistant',
    isSidechain: opts.sidechain ?? false,
    timestamp: opts.ts ?? T0,
    ...(opts.effort ? { effort: opts.effort } : {}),
    message: {
      model: opts.model ?? 'claude-opus-5-5',
      usage: {
        input_tokens: opts.input ?? 2,
        cache_read_input_tokens: opts.read ?? 0,
        cache_creation_input_tokens: opts.write ?? 0,
        cache_creation: {
          ephemeral_1h_input_tokens: opts.oneHour ?? 0,
          ephemeral_5m_input_tokens: opts.fiveMin ?? 0,
        },
      },
    },
  })
}
const mode = (m: string) => JSON.stringify({ type: 'permission-mode', permissionMode: m })

describe('snapshotFromTranscriptLines', () => {
  it('reads the model and sums input, cache read and cache write as the context size', () => {
    const snap = snapshotFromTranscriptLines([assistant({ input: 2, read: 100_000, write: 3_000 })])!
    expect(snap.model).toBe('claude-opus-5-5')
    expect(snap.contextTokens).toBe(103_002)
    expect(snap.contextWindow).toBe(200_000)
    expect(snap.contextPercent).toBe(52)
    expect(snap.compact).toBe('none')
    expect(snap.asOf).toBe(Date.parse(T0))
  })

  it('uses the LAST main-conversation assistant turn and ignores sidechains', () => {
    const snap = snapshotFromTranscriptLines([
      assistant({ model: 'claude-sonnet-5', read: 10_000 }),
      assistant({ model: 'claude-opus-5-5', read: 160_000 }),
      assistant({ model: 'claude-haiku-4-5', read: 500, sidechain: true }),
    ])!
    expect(snap.model).toBe('claude-opus-5-5')
    expect(snap.contextTokens).toBe(160_002)
    expect(snap.compact).toBe('soon')
  })

  it('recommends compacting now from 200k', () => {
    expect(snapshotFromTranscriptLines([assistant({ read: 210_000 })])!.compact).toBe('now')
  })

  it('knows a 1M window from the model id, or from having seen more than 200k', () => {
    const byId = snapshotFromTranscriptLines([assistant({ model: 'claude-opus-5-5[1m]', read: 100_000 })])!
    expect(byId.contextWindow).toBe(1_000_000)
    expect(byId.contextApprox).toBe(false)
    expect(byId.contextPercent).toBe(10)

    const bySize = snapshotFromTranscriptLines([assistant({ read: 363_000 })])!
    expect(bySize.contextWindow).toBe(1_000_000)
    expect(bySize.contextApprox).toBe(false)
    expect(bySize.contextPercent).toBe(36)
  })

  it('assumes 200k and says so when it cannot know', () => {
    const snap = snapshotFromTranscriptLines([assistant({ read: 50_000 })])!
    expect(snap.contextWindow).toBe(200_000)
    expect(snap.contextApprox).toBe(true)
  })

  it('takes the permission mode and the effort when they are there, and leaves them out when not', () => {
    const withBoth = snapshotFromTranscriptLines([mode('plan'), assistant({ effort: 'high' }), mode('auto')])!
    expect(withBoth.mode).toBe('auto') // the last one wins
    expect(withBoth.effort).toBe('high')

    const none = snapshotFromTranscriptLines([assistant({})])!
    expect('mode' in none).toBe(false)
    expect('effort' in none).toBe(false)
  })

  it('derives when the prompt cache runs out from the TTL the transcript shows', () => {
    const hour = snapshotFromTranscriptLines([assistant({ write: 5, oneHour: 5 })])!
    expect(hour.cacheExpiresAt).toBe(Date.parse(T0) + 3_600_000)
    const five = snapshotFromTranscriptLines([assistant({ write: 5, fiveMin: 5 })])!
    expect(five.cacheExpiresAt).toBe(Date.parse(T0) + 300_000)
    const unknown = snapshotFromTranscriptLines([assistant({ read: 5 })])!
    expect('cacheExpiresAt' in unknown).toBe(false)
  })

  it('skips malformed lines, partial lines and synthetic turns', () => {
    const snap = snapshotFromTranscriptLines([
      assistant({ read: 1_000 }),
      '{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tok', // cut off
      'not json at all',
      '',
      assistant({ model: '<synthetic>', read: 999_999 }),
    ])!
    expect(snap.contextTokens).toBe(1_002)
  })

  it('returns null with no assistant turn', () => {
    expect(snapshotFromTranscriptLines([])).toBeNull()
    expect(snapshotFromTranscriptLines([mode('auto'), '{"type":"user"}'])).toBeNull()
  })
})

describe('readTranscriptSnapshot (file, tail only, cached)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'))
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))
  beforeEach(() => clearSnapshotCache())

  it('returns null for a missing or empty file', () => {
    expect(readTranscriptSnapshot(path.join(dir, 'nope.jsonl'))).toBeNull()
    const empty = path.join(dir, 'empty.jsonl')
    fs.writeFileSync(empty, '')
    expect(readTranscriptSnapshot(empty)).toBeNull()
  })

  it('reads only the tail of a big file: a turn older than the tail is not seen', () => {
    const f = path.join(dir, 'big.jsonl')
    const filler = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(2000) } })
    const fillerLines = Array.from({ length: Math.ceil((TAIL_BYTES * 3) / filler.length) }, () => filler)
    // The only assistant turn is at the very start, further back than the tail reaches
    fs.writeFileSync(f, [assistant({ model: 'claude-old-1', read: 10 }), ...fillerLines, assistant({ model: 'claude-new-2', read: 77_000 })].join('\n') + '\n')
    expect(fs.statSync(f).size).toBeGreaterThan(TAIL_BYTES * 2)
    const snap = readTranscriptSnapshot(f)!
    expect(snap.model).toBe('claude-new-2')
    expect(snap.contextTokens).toBe(77_002)
  })

  it('returns null, not the old turn, when the tail holds no assistant turn', () => {
    const f = path.join(dir, 'tailless.jsonl')
    const filler = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(2000) } })
    const fillerLines = Array.from({ length: Math.ceil((TAIL_BYTES * 2) / filler.length) }, () => filler)
    fs.writeFileSync(f, [assistant({ read: 10 }), ...fillerLines].join('\n') + '\n')
    expect(readTranscriptSnapshot(f)).toBeNull()
  })

  it('drops the half line a mid-file read starts in', () => {
    const f = path.join(dir, 'mid.jsonl')
    const filler = JSON.stringify({ type: 'user', message: { content: 'y'.repeat(1500) } })
    const body = Array.from({ length: Math.ceil((TAIL_BYTES * 2) / filler.length) }, () => filler)
    fs.writeFileSync(f, [...body, assistant({ model: 'claude-last-3', read: 5 })].join('\n') + '\n')
    expect(readTranscriptSnapshot(f)!.model).toBe('claude-last-3')
  })

  it('serves the cached snapshot until the file changes, then reads again', () => {
    const f = path.join(dir, 'live.jsonl')
    fs.writeFileSync(f, assistant({ model: 'claude-one-1', read: 1_000 }) + '\n')
    const first = readTranscriptSnapshot(f)!
    expect(first.model).toBe('claude-one-1')
    // Same mtime and size: the very same object comes back
    expect(readTranscriptSnapshot(f)).toBe(first)

    fs.appendFileSync(f, assistant({ model: 'claude-two-2', read: 2_000, ts: '2026-10-05T04:05:00.000Z' }) + '\n')
    const second = readTranscriptSnapshot(f)!
    expect(second).not.toBe(first)
    expect(second.model).toBe('claude-two-2')
  })
})
