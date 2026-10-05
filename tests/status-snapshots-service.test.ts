import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapsvc-'))

function transcript(file: string, model: string, tokens: number, ts = new Date().toISOString()): string {
  const p = path.join(dir, file)
  fs.writeFileSync(p, JSON.stringify({
    type: 'assistant', timestamp: ts,
    message: { model, usage: { input_tokens: 2, cache_read_input_tokens: tokens, cache_creation_input_tokens: 0 } },
  }) + '\n')
  return p
}

const files: Record<string, string> = {}
let agents: any[] = []
let hosts: any[] = []

vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => agents,
  getAgent: (id: string) => (agents || []).find((a: any) => a.id === id) || null,
}))
vi.mock('@/lib/chat-transcript.mjs', () => ({
  resolveJsonlPath: (agent: any) => (files[agent.id] ? { path: files[agent.id] } : null),
}))
vi.mock('@/lib/hosts-config', () => ({
  getHosts: () => hosts,
  isSelfHost: (h: any) => h.id === 'self',
}))

const { getLocalSnapshots, getSnapshots, resetSnapshotCaches } = await import('@/services/status-snapshots-service')
const { clearSnapshotCache } = await import('@/lib/transcript-snapshot')

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

beforeEach(() => {
  resetSnapshotCaches()
  clearSnapshotCache()
  agents = []
  hosts = []
  for (const k of Object.keys(files)) delete files[k]
})

describe('local snapshots', () => {
  it('keys a snapshot by agent id and by name', () => {
    files.a1 = transcript('a1.jsonl', 'claude-opus-5-5', 160_000)
    agents = [{ id: 'a1', name: 'lola', workingDirectory: '/x' }]
    const snaps = getLocalSnapshots()
    expect(Object.keys(snaps).sort()).toEqual(['a1', 'lola'])
    expect(snaps.lola.model).toBe('claude-opus-5-5')
    expect(snaps.lola.compact).toBe('soon')
    expect(snaps.a1).toBe(snaps.lola)
    expect(snaps.a1.source).toBe('transcript')
  })

  it('never shows the lifetime metrics cost: a $2466 total is not a $65 session', () => {
    files.a1 = transcript('a1.jsonl', 'claude-opus-5-5', 1_000)
    agents = [{ id: 'a1', name: 'lola', metrics: { estimatedCost: 2466.18 } }]
    expect('cost' in getLocalSnapshots().lola).toBe(false)
  })

  it('skips agents with no transcript on this host and codex agents', () => {
    files.a2 = transcript('a2.jsonl', 'gpt', 5)
    agents = [
      { id: 'a1', name: 'no-transcript' },
      { id: 'a2', name: 'codexer', program: 'codex' },
    ]
    expect(getLocalSnapshots()).toEqual({})
  })

  it('never throws when the registry fails', () => {
    agents = null as any
    expect(getLocalSnapshots()).toEqual({})
  })
})

describe('other hosts', () => {
  const remoteSnap = { model: 'claude-sonnet-5', contextTokens: 10, contextWindow: 200000, contextApprox: true, contextPercent: 0, compact: 'none', asOf: 1 }

  it('answers at once with what it has, and fills in the other host after its refresh', async () => {
    hosts = [{ id: 'self', url: 'http://self' }, { id: 'mac-mini', url: 'http://mini:23000' }]
    const httpGet = vi.fn().mockResolvedValue({ snapshots: { 'remote-agent': remoteSnap, 'rid': remoteSnap } })

    const first = getSnapshots({ httpGet })
    expect(first['remote-agent']).toBeUndefined() // not waited for
    expect(httpGet).toHaveBeenCalledTimes(1)
    expect(httpGet).toHaveBeenCalledWith('http://mini:23000/api/sessions/activity?local=true')

    await new Promise(r => setTimeout(r, 0))
    const second = getSnapshots({ httpGet })
    expect(second['remote-agent']).toEqual(remoteSnap)
    expect(httpGet).toHaveBeenCalledTimes(1) // inside the refresh window: no second request
  })

  it('does not ask this host itself, a disabled host, or another host when localOnly', () => {
    hosts = [{ id: 'self', url: 'http://self' }, { id: 'off', url: 'http://off', enabled: false }]
    const httpGet = vi.fn().mockResolvedValue({ snapshots: {} })
    getSnapshots({ httpGet })
    expect(httpGet).not.toHaveBeenCalled()

    hosts = [{ id: 'mac-mini', url: 'http://mini' }]
    getSnapshots({ httpGet, localOnly: true })
    expect(httpGet).not.toHaveBeenCalled()
  })

  it('keeps the last copy when the other host stops answering, and prefers its own agents', async () => {
    files.a1 = transcript('a1.jsonl', 'claude-opus-5-5', 5_000)
    agents = [{ id: 'a1', name: 'shared-name' }]
    hosts = [{ id: 'mac-mini', url: 'http://mini' }]
    const httpGet = vi.fn()
      .mockResolvedValueOnce({ snapshots: { gone: remoteSnap, 'shared-name': remoteSnap } })
      .mockRejectedValue(new Error('down'))

    const t = Date.now()
    getSnapshots({ httpGet, now: t })
    await new Promise(r => setTimeout(r, 0))
    const later = getSnapshots({ httpGet, now: t + 60_000 }) // refresh due, fails
    await new Promise(r => setTimeout(r, 0))
    const after = getSnapshots({ httpGet, now: t + 120_000 })
    expect(after.gone).toEqual(remoteSnap) // last copy kept
    expect(after['shared-name'].model).toBe('claude-opus-5-5') // local wins
    expect(later.gone).toEqual(remoteSnap)
  })
})
