import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
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

vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => agents,
  getAgent: (id: string) => (agents || []).find((a: any) => a.id === id) || null,
}))
vi.mock('@/lib/chat-transcript.mjs', () => ({
  resolveJsonlPath: (agent: any) => (files[agent.id] ? { path: files[agent.id] } : null),
}))

const { getLocalSnapshots, getSnapshots, resetSnapshotCaches } = await import('@/services/status-snapshots-service')
const { clearSnapshotCache } = await import('@/lib/transcript-snapshot')
const { peerSnapshots } = await import('@/services/shared-state')

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

beforeEach(() => {
  resetSnapshotCaches()
  clearSnapshotCache()
  agents = []
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

describe('other hosts (the /mesh copy)', () => {
  const remoteSnap = { model: 'claude-sonnet-5', contextTokens: 10, contextWindow: 200000, contextApprox: true, contextPercent: 0, compact: 'none', asOf: 1 }
  afterEach(() => peerSnapshots.clear())

  it('adds the snapshots of a connected peer, never a dropped one, and not for localOnly', () => {
    peerSnapshots.set('mac-mini', { items: { 'remote-agent': remoteSnap }, seq: 1, okAt: 1, connected: true })
    peerSnapshots.set('down', { items: { 'gone-agent': remoteSnap }, seq: 1, okAt: 1, connected: false })
    const all = getSnapshots()
    expect(all['remote-agent']).toEqual(remoteSnap)
    expect(all['gone-agent']).toBeUndefined()
    expect(getSnapshots({ localOnly: true })['remote-agent']).toBeUndefined()
  })

  it('prefers its own agents over a peer copy with the same key', () => {
    files.a1 = transcript('a1.jsonl', 'claude-opus-5-5', 5_000)
    agents = [{ id: 'a1', name: 'shared-name' }]
    peerSnapshots.set('mac-mini', { items: { 'shared-name': remoteSnap }, seq: 1, okAt: 1, connected: true })
    expect(getSnapshots()['shared-name'].model).toBe('claude-opus-5-5')
  })
})
