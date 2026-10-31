import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { hookStateFilePath } from '@/lib/chat-transcript.mjs'
import { runtimeOf, OUTSIDE_LIVE_MS, resumableSessionId, RESUME_QUIET_MS } from '@/lib/agent-runtime-kind.mjs'
import { buildEnv } from '@/lib/streaming-runtime.mjs'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }))

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

describe('resumableSessionId', () => {
  const convDir = () => path.join(home, '.claude', 'projects', dir.replace(/[^a-zA-Z0-9]/g, '-'))
  function conversation(id: string, ageMs: number) {
    fs.mkdirSync(convDir(), { recursive: true })
    const f = path.join(convDir(), `${id}.jsonl`)
    fs.writeFileSync(f, '{}\n')
    const t = (Date.now() - ageMs) / 1000
    fs.utimesSync(f, t, t)
  }

  it('resumes the agent\'s own conversation, not the newest one in the shared folder', () => {
    conversation('sess-1', RESUME_QUIET_MS + 60_000)
    conversation('someone-else', 1000 + RESUME_QUIET_MS)
    expect(resumableSessionId(agent)).toBe('sess-1')
  })

  it('does not resume a conversation written to recently, live outside tmux, missing, or unknown', () => {
    conversation('sess-1', 1000)
    expect(resumableSessionId(agent)).toBeNull()
    conversation('sess-1', RESUME_QUIET_MS + 60_000)
    hookState({ sessionId: 'sess-1', status: 'active', updatedAt: new Date().toISOString() })
    expect(resumableSessionId(agent)).toBeNull()
    expect(resumableSessionId({ ...agent, claudeSessionId: 'gone' })).toBeNull()
    expect(resumableSessionId({ ...agent, claudeSessionId: undefined })).toBeNull()
  })
})

describe('streaming session identity', () => {
  it('sets the variables the hook and AMP read, so it never takes the folder\'s identity', () => {
    const env = buildEnv('a1', 'dahlia')
    expect(env).toMatchObject({ AIM_AGENT_ID: 'a1', AIM_AGENT_NAME: 'dahlia', AIMAESTRO_AGENT_ID: 'a1' })
    expect(env.AMP_DIR).toBe(path.join(home, '.agent-messaging', 'agents', 'a1'))
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })
})
