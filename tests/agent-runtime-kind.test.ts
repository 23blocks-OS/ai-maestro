import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { hookStateFilePath } from '@/lib/chat-transcript.mjs'
import { runtimeOf, OUTSIDE_LIVE_MS } from '@/lib/agent-runtime-kind.mjs'

// An agent running outside tmux or as a stream must not look asleep, or restore starts a second copy
let home: string
const dir = '/work/app'
const agent = { id: 'a1', name: 'dahlia', workingDirectory: dir, claudeSessionId: 'sess-1' }

function hookState(state: Record<string, unknown>) {
  const f = hookStateFilePath(dir)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, JSON.stringify(state))
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-kind-'))
  vi.spyOn(os, 'homedir').mockReturnValue(home)
})
afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as { _streamSessions?: unknown })._streamSessions
  fs.rmSync(home, { recursive: true, force: true })
})

describe('runtimeOf', () => {
  it('is terminal when the caller has its tmux session', () => {
    expect(runtimeOf(agent, { tmuxLive: true })).toBe('terminal')
  })

  it('is outside when the hook last saw the agent\'s own session recently', () => {
    hookState({ sessionId: 'sess-1', status: 'active', lastEvent: 'Stop', updatedAt: new Date().toISOString() })
    expect(runtimeOf(agent)).toBe('outside')
  })

  it('is not outside for another session in the same folder, an ended one, or an old one', () => {
    hookState({ sessionId: 'other', status: 'active', updatedAt: new Date().toISOString() })
    expect(runtimeOf(agent)).toBeNull()
    hookState({ sessionId: 'sess-1', lastEvent: 'SessionEnd', updatedAt: new Date().toISOString() })
    expect(runtimeOf(agent)).toBeNull()
    hookState({ sessionId: 'sess-1', status: 'active', updatedAt: new Date(Date.now() - OUTSIDE_LIVE_MS - 1000).toISOString() })
    expect(runtimeOf(agent)).toBeNull()
  })

  it('is null with no hook state or no known session id', () => {
    expect(runtimeOf(agent)).toBeNull()
    hookState({ sessionId: 'sess-1', status: 'active', updatedAt: new Date().toISOString() })
    expect(runtimeOf({ ...agent, claudeSessionId: undefined })).toBeNull()
  })

  it('is streaming when a live stream session exists under its id or name', () => {
    ;(globalThis as { _streamSessions?: Map<string, unknown> })._streamSessions = new Map([['dahlia', { closed: false }]])
    expect(runtimeOf(agent)).toBe('streaming')
  })
})
