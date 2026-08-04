import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkReplay } from '@/lib/amp-replay'

const NOW = Date.parse('2026-08-03T12:00:00Z')

describe('AMP replay protection (amp-replay)', () => {
  let base: string
  beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-')) })
  afterEach(() => { fs.rmSync(base, { recursive: true, force: true }) })

  const iso = (ms: number) => new Date(ms).toISOString()

  it('accepts a fresh, unseen message', () => {
    expect(checkReplay('msg_1', iso(NOW), { nowMs: NOW, base })).toEqual({ ok: true })
  })

  it('rejects a duplicate message id', () => {
    checkReplay('msg_1', iso(NOW), { nowMs: NOW, base })
    expect(checkReplay('msg_1', iso(NOW), { nowMs: NOW, base })).toEqual({ ok: false, reason: 'duplicate_message' })
  })

  it('rejects a stale timestamp (> 5 min old)', () => {
    expect(checkReplay('msg_2', iso(NOW - 6 * 60 * 1000), { nowMs: NOW, base }))
      .toEqual({ ok: false, reason: 'timestamp_expired' })
  })

  it('rejects a future timestamp (> 60s ahead)', () => {
    expect(checkReplay('msg_3', iso(NOW + 90 * 1000), { nowMs: NOW, base }))
      .toEqual({ ok: false, reason: 'timestamp_future' })
  })

  it('allows a stale timestamp when retrieved from a relay queue', () => {
    expect(checkReplay('msg_4', iso(NOW - 60 * 60 * 1000), { nowMs: NOW, fromRelay: true, base }))
      .toEqual({ ok: true })
  })

  it('tolerates small clock skew (30s future)', () => {
    expect(checkReplay('msg_5', iso(NOW + 30 * 1000), { nowMs: NOW, base })).toEqual({ ok: true })
  })
})
