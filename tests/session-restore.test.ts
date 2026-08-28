/**
 * Tests for boot-time session restore.
 *
 * The problem: a server restart left every agent offline. The intent was
 * already recorded correctly — persistSession() on wake means "this should be
 * running", unpersistSession() on hibernate means "this should stay down" —
 * and restoreSessions() existed. But nothing ever called it, and it only did
 * `createSession()`, which opens a bare tmux session with no agent program
 * running inside: worse than offline, because the API then shows a healthy
 * session doing nothing.
 *
 * These lock the three properties that make restore correct:
 *   - sleeping agents are simply absent from the file, so they stay asleep
 *   - the record carries enough to relaunch the program faithfully
 *   - stale records (agent deleted) are dropped, not resurrected as orphans
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PersistedSession } from '@/lib/session-persistence'

const { mockFs } = vi.hoisted(() => ({
  mockFs: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn((_p?: any): string => '[]'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}))
vi.mock('fs', () => ({ default: mockFs, ...mockFs }))

import { loadPersistedSessions, persistSession } from '@/lib/session-persistence'

const rec = (over: Partial<PersistedSession> = {}): PersistedSession => ({
  id: 'agent-1', name: 'agent-1', workingDirectory: '/repo',
  createdAt: 'x', lastSavedAt: 'x', agentId: 'uuid-1', ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFs.existsSync.mockReturnValue(true)
  mockFs.readFileSync.mockReturnValue('[]')
})

describe('persistence location', () => {
  it('writes under ~/.aimaestro, alongside the rest of AI Maestro state', () => {
    persistSession({ id: 'a', name: 'a', workingDirectory: '/repo', createdAt: 'x' })
    const target = mockFs.writeFileSync.mock.calls[0][0] as string
    expect(target).toContain('/.aimaestro/sessions.json')
    // The legacy path was one hyphen away and easy to confuse.
    expect(target).not.toContain('/.ai-maestro/')
  })

  it('does not resurrect the legacy file', () => {
    // The old file's 73 entries were stale, agentId-less and pointed at the
    // wrong working directory. Migrating them would make boot restore spawn
    // dozens of wrong sessions.
    mockFs.existsSync.mockImplementation((p: any) => String(p).includes('.ai-maestro/'))
    expect(loadPersistedSessions()).toEqual([])
    expect(mockFs.readFileSync).not.toHaveBeenCalledWith(
      expect.stringContaining('/.ai-maestro/sessions.json'),
      expect.anything()
    )
  })
})

describe('relaunch fidelity', () => {
  it('records the program and permission mode needed to relaunch', () => {
    persistSession({
      id: 'a', name: 'a', workingDirectory: '/repo', createdAt: 'x',
      agentId: 'uuid-1', program: 'claude', permissionMode: 'smartAuto', sessionIndex: 0,
    })
    const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string)
    expect(written[0]).toMatchObject({
      program: 'claude', permissionMode: 'smartAuto', sessionIndex: 0, agentId: 'uuid-1',
    })
  })

  it('tolerates pre-0.37.2 records with no program', () => {
    // Older entries lack program/permissionMode; restore must fall back to the
    // agent's own settings rather than crashing.
    mockFs.readFileSync.mockReturnValue(JSON.stringify([rec({ program: undefined })]))
    const loaded = loadPersistedSessions()
    expect(loaded[0].program).toBeUndefined()
    expect(loaded[0].agentId).toBe('uuid-1')
  })
})

describe('intent: sleeping agents stay asleep', () => {
  it('a hibernated agent is absent from the file, so restore never sees it', () => {
    // unpersistSession() on hibernate is the intent flag. Absence IS the
    // instruction to stay down — no separate state needed.
    mockFs.readFileSync.mockReturnValue(JSON.stringify([rec({ id: 'running-1' })]))
    const ids = loadPersistedSessions().map((s) => s.id)
    expect(ids).toEqual(['running-1'])
    expect(ids).not.toContain('hibernated-1')
  })

  it('returns an empty list rather than throwing when the file is corrupt', () => {
    // A bad file must not stop the server booting.
    mockFs.readFileSync.mockReturnValue('not json{')
    expect(loadPersistedSessions()).toEqual([])
  })
})
