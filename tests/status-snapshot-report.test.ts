import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snaprep-'))

interface Line { ts: number; tokens: number; tier?: '1h' | '5m'; effort?: string; model?: string }

/** A one-turn Claude transcript. `tier` says which cache tier the turn wrote to. */
function transcript(file: string, l: Line): string {
  const p = path.join(dir, file)
  const cacheCreation = l.tier === '1h'
    ? { ephemeral_1h_input_tokens: 500, ephemeral_5m_input_tokens: 0 }
    : l.tier === '5m'
      ? { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 500 }
      : undefined
  fs.writeFileSync(p, JSON.stringify({
    type: 'assistant', timestamp: new Date(l.ts).toISOString(),
    ...(l.effort ? { effort: l.effort } : {}),
    message: {
      model: l.model ?? 'claude-opus-5-5',
      usage: { input_tokens: 2, cache_read_input_tokens: l.tokens, cache_creation_input_tokens: cacheCreation ? 500 : 0, ...(cacheCreation ? { cache_creation: cacheCreation } : {}) },
    },
  }) + '\n')
  return p
}

const files: Record<string, string> = {}
let agents: any[] = []

vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => agents,
  getAgent: (id: string) => (agents || []).find((a: any) => a.id === id) || null,
}))
vi.mock('@/lib/chat-transcript.mjs', () => ({
  resolveJsonlPath: (agent: any) => (files[agent.id] ? { path: files[agent.id] } : null),
}))
vi.mock('@/lib/hosts-config', () => ({ getHosts: () => [], isSelfHost: () => false }))

const svc = await import('@/services/status-snapshots-service')
const { clearSnapshotCache } = await import('@/lib/transcript-snapshot')
const { POST } = await import('@/app/api/agents/[id]/status-snapshot/route')

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0)

beforeEach(() => {
  svc.resetSnapshotCaches()
  clearSnapshotCache()
  agents = [{ id: 'a1', name: 'lola', workingDirectory: '/x', metrics: { estimatedCost: 2466.18 } }]
  for (const k of Object.keys(files)) delete files[k]
  files.a1 = transcript('a1.jsonl', { ts: NOW - 10 * 60_000, tokens: 160_000, tier: '1h', effort: 'low' })
})

const report = (over: Record<string, unknown> = {}) => ({
  sessionId: 's1', model: 'Opus 5.5', modelId: 'claude-opus-5-5',
  contextTokens: 160_000, contextWindow: 1_000_000, contextPercent: 16,
  cost: 65.78, effort: 'high', cacheWarm: true, cacheExpiresAt: Math.round((NOW + 12.4 * 60_000) / 1000),
  exceeds200k: false, ts: NOW, ...over,
})

describe('ingestStatusSnapshot: what is accepted', () => {
  it('takes a full report and lays it over the transcript', () => {
    expect(svc.ingestStatusSnapshot('a1', report(), NOW).status).toBe(200)
    const s = svc.getLocalSnapshots(NOW + 1000).lola
    expect(s.source).toBe('reported')
    expect(s.modelName).toBe('Opus 5.5')
    expect(s.model).toBe('claude-opus-5-5')
    expect(s.cost).toBe(65.78) // the session cost, not the $2466 lifetime metric
    expect(s.effort).toBe('high') // the report wins over the transcript's 'low'
    expect(s.contextTokens).toBe(160_000)
    expect(s.contextPercent).toBe(16)
    expect(s.contextApprox).toBe(false)
    expect(s.compact).toBe('soon')
    expect(s.cacheWarm).toBe(true)
    expect(s.cacheExpiresAt).toBe(Math.round((NOW + 12.4 * 60_000) / 1000) * 1000)
    expect(s.asOf).toBe(NOW) // when the report arrived
    expect(s.lastTurnAt).toBe(NOW - 10 * 60_000) // when the agent last worked: the transcript
  })

  it('accepts a report with no fields at all, and drops unknown ones', () => {
    expect(svc.ingestStatusSnapshot('a1', {}, NOW).status).toBe(200)
    expect(svc.ingestStatusSnapshot('a1', { surprise: 'x', cost: 1.5 }, NOW).status).toBe(200)
    const s = svc.getLocalSnapshots(NOW).lola
    expect(s.cost).toBe(1.5)
    expect('surprise' in s).toBe(false)
  })

  it('treats effort null as "this model has no effort", not as the transcript value', () => {
    svc.ingestStatusSnapshot('a1', report({ effort: null }), NOW)
    expect('effort' in svc.getLocalSnapshots(NOW).lola).toBe(false)
  })

  it('answers over 200k with /compact now even on a larger window', () => {
    svc.ingestStatusSnapshot('a1', report({ contextTokens: 120_000, exceeds200k: true }), NOW)
    expect(svc.getLocalSnapshots(NOW).lola.compact).toBe('now')
  })

  it('lets a reported cold cache win over a still-future expiry', () => {
    svc.ingestStatusSnapshot('a1', report({ cacheWarm: false }), NOW)
    expect(svc.getLocalSnapshots(NOW).lola.cacheWarm).toBe(false)
  })

  it('keeps the transcript values for what the report leaves out', () => {
    svc.ingestStatusSnapshot('a1', { cost: 3 }, NOW)
    const s = svc.getLocalSnapshots(NOW).lola
    expect(s.contextTokens).toBe(160_502) // from the transcript: 2 input + 160000 read + 500 written
    expect(s.effort).toBe('low')
    expect(s.cost).toBe(3)
  })

  it('works for an agent with no transcript on this host, when the report has a model and a context size', () => {
    delete files.a1
    svc.ingestStatusSnapshot('a1', report(), NOW)
    const s = svc.getLocalSnapshots(NOW).lola
    expect(s.cost).toBe(65.78)
    expect(s.lastTurnAt).toBe(NOW)
  })
})

describe('ingestStatusSnapshot: what is refused', () => {
  const bad: Array<[string, unknown]> = [
    ['an array body', []],
    ['a string body', 'x'],
    ['a percent over 100', report({ contextPercent: 120 })],
    ['a negative cost', report({ cost: -1 })],
    ['an infinite cost', report({ cost: Infinity })],
    ['a fractional token count', report({ contextTokens: 1.5 })],
    ['a string for tokens', report({ contextTokens: '160000' })],
    ['a model name over 100 characters', report({ model: 'x'.repeat(101) })],
    ['an empty model name', report({ model: '' })],
    ['control characters in a string', report({ model: 'Opus\u0007' })],
    ['an effort that is not a string', report({ effort: 5 })],
    ['cacheWarm as text', report({ cacheWarm: 'yes' })],
    ['a cache expiry far in the future', report({ cacheExpiresAt: 9_999_999_999_999 })],
    ['exceeds200k as text', report({ exceeds200k: 'true' })],
    ['a timestamp that is not a number', report({ ts: 'now' })],
  ]
  it.each(bad)('rejects %s', (_label, body) => {
    const r = svc.ingestStatusSnapshot('a1', body, NOW)
    expect(r.status).toBe(400)
    // and stores nothing
    expect('cost' in svc.getLocalSnapshots(NOW).lola).toBe(false)
  })

  it('rejects an unknown agent', () => {
    expect(svc.ingestStatusSnapshot('nope', report(), NOW).status).toBe(404)
  })

  it('rejects a body over 4096 characters', () => {
    const r = svc.ingestStatusSnapshot('a1', report({ sessionId: 'x'.repeat(50), padding: 'y'.repeat(5000) }), NOW)
    expect(r.status).toBe(413)
  })
})

describe('freshness', () => {
  it('uses a report for five minutes by the SERVER clock, whatever the transcript says', () => {
    svc.ingestStatusSnapshot('a1', report({ ts: NOW + 3_600_000 }), NOW)
    expect(svc.getLocalSnapshots(NOW + svc.REPORT_FRESH_MS).lola.cost).toBe(65.78)
  })

  it('keeps an idle agent\'s report: no turn since it was sent, so the cost cannot have moved', () => {
    // the transcript's last turn is 10 minutes BEFORE the report
    svc.ingestStatusSnapshot('a1', report(), NOW)
    const later = svc.getLocalSnapshots(NOW + 3 * 60 * 60_000).lola
    expect(later.source).toBe('reported')
    expect(later.cost).toBe(65.78)
  })

  it('drops the report when the agent has worked since: the cost may have moved', () => {
    svc.ingestStatusSnapshot('a1', report(), NOW)
    // a turn 20 minutes after the report, with no new report
    files.a1 = transcript('a1.jsonl', { ts: NOW + 20 * 60_000, tokens: 170_000, tier: '1h', effort: 'low' })
    clearSnapshotCache()
    const stale = svc.getLocalSnapshots(NOW + 30 * 60_000).lola
    expect(stale.source).toBe('transcript')
    expect('cost' in stale).toBe(false)
    expect('modelName' in stale).toBe(false)
  })

  it('drops even an idle report after a day', () => {
    svc.ingestStatusSnapshot('a1', report(), NOW)
    const old = svc.getLocalSnapshots(NOW + svc.REPORT_IDLE_MAX_MS + 1).lola
    expect(old.source).toBe('transcript')
    expect('cost' in old).toBe(false)
  })

  it('a newer report replaces the older one', () => {
    svc.ingestStatusSnapshot('a1', report({ cost: 10 }), NOW)
    svc.ingestStatusSnapshot('a1', report({ cost: 11 }), NOW + 1000)
    expect(svc.getLocalSnapshots(NOW + 2000).lola.cost).toBe(11)
  })
})

describe('cache warm or cold from the transcript alone', () => {
  const snapOf = (l: Line) => {
    files.a1 = transcript('a1.jsonl', l)
    clearSnapshotCache()
    return svc.getLocalSnapshots(NOW).lola
  }

  it('is warm for an hour after a turn that wrote to the 1 hour cache', () => {
    const s = snapOf({ ts: NOW - 10 * 60_000, tokens: 50_000, tier: '1h' })
    expect(s.cacheExpiresAt).toBe(NOW - 10 * 60_000 + 3_600_000)
    expect(s.cacheWarm).toBe(true)
  })

  it('is cold an hour and a second after it', () => {
    expect(snapOf({ ts: NOW - 3_601_000, tokens: 50_000, tier: '1h' }).cacheWarm).toBe(false)
  })

  it('lives only five minutes when the turn wrote to the 5 minute cache', () => {
    expect(snapOf({ ts: NOW - 4 * 60_000, tokens: 50_000, tier: '5m' }).cacheWarm).toBe(true)
    expect(snapOf({ ts: NOW - 6 * 60_000, tokens: 50_000, tier: '5m' }).cacheWarm).toBe(false)
  })

  it('has no warm or cold when the transcript never says which cache it used', () => {
    const s = snapOf({ ts: NOW - 60_000, tokens: 50_000 })
    expect('cacheWarm' in s).toBe(false)
    expect('cacheExpiresAt' in s).toBe(false)
  })
})

describe('POST /api/agents/[id]/status-snapshot', () => {
  const call = (id: string, body: string) =>
    POST(new Request(`http://x/api/agents/${id}/status-snapshot`, { method: 'POST', body }) as any, { params: Promise.resolve({ id }) })

  it('stores a valid report', async () => {
    const res = await call('a1', JSON.stringify(report({ ts: Date.now() })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('answers 404 for an unknown agent, 400 for bad JSON or a bad field, 413 for a big body', async () => {
    expect((await call('nope', '{}')).status).toBe(404)
    expect((await call('a1', 'not json')).status).toBe(400)
    expect((await call('a1', JSON.stringify({ contextPercent: 500 }))).status).toBe(400)
    expect((await call('a1', JSON.stringify({ padding: 'x'.repeat(5000) }))).status).toBe(413)
  })
})
