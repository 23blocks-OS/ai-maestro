import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snaprep-persist-'))
const reportsPath = path.join(dir, 'status-reports.json')
process.env.AIM_STATUS_REPORTS_FILE = reportsPath

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0)

let agents: any[] = []
const files: Record<string, string> = {}

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

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

function writeTranscript(ts: number): string {
  const p = path.join(dir, 'a1.jsonl')
  fs.writeFileSync(p, JSON.stringify({
    type: 'assistant', timestamp: new Date(ts).toISOString(),
    message: { model: 'claude-opus-5-5', usage: { input_tokens: 2, cache_read_input_tokens: 160_000, cache_creation_input_tokens: 0 } },
  }) + '\n')
  return p
}

const report = (over: Record<string, unknown> = {}) => ({
  sessionId: 's1', model: 'Opus 5.5', modelId: 'claude-opus-5-5',
  contextTokens: 160_000, contextWindow: 1_000_000, contextPercent: 16, cost: 65.78, effort: 'high', ts: NOW, ...over,
})

/** What a restart does to the in-memory store */
function restart() {
  ;(globalThis as any).__aimStatusReports = undefined
  clearSnapshotCache()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  svc.resetSnapshotCaches()
  clearSnapshotCache()
  fs.rmSync(reportsPath, { force: true })
  agents = [{ id: 'a1', name: 'lola', workingDirectory: '/x' }]
  files.a1 = writeTranscript(NOW - 10 * 60_000)
})
afterEach(() => { svc.resetSnapshotCaches(); vi.useRealTimers() })

describe('reports survive a restart', () => {
  it('writes the reports to a private file shortly after one arrives, then shows the cost after a restart', async () => {
    svc.ingestStatusSnapshot('a1', report(), NOW)
    expect(fs.existsSync(reportsPath)).toBe(false) // debounced
    await vi.advanceTimersByTimeAsync(21_000)
    expect(fs.existsSync(reportsPath)).toBe(true)
    expect(fs.statSync(reportsPath).mode & 0o777).toBe(0o600)

    restart()
    const snap = svc.getLocalSnapshots(NOW + 60 * 60_000).lola
    expect(snap.source).toBe('reported')
    expect(snap.cost).toBe(65.78)
  })

  it('does not write on every report: one write for a burst', async () => {
    const spy = vi.spyOn(fs, 'writeFileSync')
    for (let i = 0; i < 20; i++) svc.ingestStatusSnapshot('a1', report({ cost: 60 + i }), NOW + i)
    await vi.advanceTimersByTimeAsync(21_000)
    expect(spy.mock.calls.filter(c => String(c[0]).startsWith(reportsPath)).length).toBe(1)
    spy.mockRestore()
  })

  it('drops reports older than a day on load', async () => {
    fs.writeFileSync(reportsPath, JSON.stringify([['a1', { receivedAt: NOW - svc.REPORT_IDLE_MAX_MS - 1, cost: 5, model: 'x', contextTokens: 1 }]]))
    restart()
    expect(svc.getLocalSnapshots(NOW).lola.source).toBe('transcript')
  })

  it('ignores a corrupt or hostile file', () => {
    fs.writeFileSync(reportsPath, '{ not json')
    restart()
    expect(svc.getLocalSnapshots(NOW).lola.source).toBe('transcript')

    fs.writeFileSync(reportsPath, JSON.stringify([
      ['a1', { receivedAt: NOW - 1000, cost: 'a lot', model: 'x'.repeat(500), contextTokens: -4, effort: 12, evil: '<script>' }],
      [42, { receivedAt: NOW }],
      'junk',
    ]))
    restart()
    const snap = svc.getLocalSnapshots(NOW).lola
    expect('cost' in snap).toBe(false)
    expect(JSON.stringify(snap)).not.toContain('script')
  })

  it('never throws when the file cannot be written', async () => {
    process.env.AIM_STATUS_REPORTS_FILE = path.join(reportsPath, 'not-a-dir', 'x.json')
    svc.ingestStatusSnapshot('a1', report(), NOW)
    await expect(vi.advanceTimersByTimeAsync(21_000)).resolves.not.toThrow()
    process.env.AIM_STATUS_REPORTS_FILE = reportsPath
  })
})
