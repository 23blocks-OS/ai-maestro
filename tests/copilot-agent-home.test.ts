import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  isCopilotAgent, copilotHomeOf, checkCopilotFields, listCopilotSessions, resolveCopilotTranscriptForDir,
} from '@/lib/transcript-copilot.mjs'

// #627 (JakubRichtr, 2026-10-22): two Copilot setups got nothing indexed. (1) each agent runs with its own
// COPILOT_HOME, which the server cannot know; (2) the agent's program is a launcher script, not `copilot`.
describe('isCopilotAgent', () => {
  it('knows copilot by program name, by programKind, and by an own copilotHome', () => {
    expect(isCopilotAgent({ program: 'copilot' })).toBe(true)
    expect(isCopilotAgent({ program: '/home/x/agents/a/start.sh', programKind: 'copilot' })).toBe(true)
    expect(isCopilotAgent({ program: '/home/x/agents/a/start.sh', copilotHome: '/home/x/h' })).toBe(true)
  })
  it('does not call a plain launcher script or another program Copilot', () => {
    expect(isCopilotAgent({ program: '/home/x/agents/a/start.sh' })).toBe(false)
    expect(isCopilotAgent({ program: 'claude' })).toBe(false)
    expect(isCopilotAgent({ program: 'claude', programKind: 'other' as any })).toBe(false)
    expect(isCopilotAgent(null)).toBe(false)
  })
})

describe('copilotHomeOf', () => {
  it('expands ~ and keeps absolute paths; ignores relative or empty', () => {
    expect(copilotHomeOf({ copilotHome: '~/agents/a/home' })).toBe(path.join(os.homedir(), 'agents/a/home'))
    expect(copilotHomeOf({ copilotHome: '/srv/h' })).toBe('/srv/h')
    expect(copilotHomeOf({ copilotHome: 'relative/h' })).toBeNull()
    expect(copilotHomeOf({ copilotHome: '  ' })).toBeNull()
    expect(copilotHomeOf({})).toBeNull()
  })
})

describe('checkCopilotFields', () => {
  it('accepts absent, null and valid values', () => {
    expect(checkCopilotFields({})).toBeNull()
    expect(checkCopilotFields({ programKind: null, copilotHome: null } as any)).toBeNull()
    expect(checkCopilotFields({ programKind: 'copilot', copilotHome: '~/h' } as any)).toBeNull()
  })
  it('refuses anything else', () => {
    expect(checkCopilotFields({ programKind: 'codex' } as any)).toMatch(/programKind/)
    expect(checkCopilotFields({ copilotHome: 'relative' } as any)).toMatch(/absolute/)
    expect(checkCopilotFields({ copilotHome: '' } as any)).toMatch(/path/)
    expect(checkCopilotFields({ copilotHome: 5 } as any)).toMatch(/path/)
  })
})

describe('sessions are read from the agent\'s own home', () => {
  let a: string, b: string
  const session = (home: string, id: string, cwd: string) => {
    const d = path.join(home, 'session-state', id)
    fs.mkdirSync(d, { recursive: true })
    const start = { type: 'session.start', data: { sessionId: id, context: { cwd } }, id: `s-${id}`, timestamp: '2026-10-22T10:00:00.000Z' }
    fs.writeFileSync(path.join(d, 'events.jsonl'), JSON.stringify(start) + '\n')
  }
  beforeEach(() => {
    a = fs.mkdtempSync(path.join(os.tmpdir(), 'cph-a-'))
    b = fs.mkdtempSync(path.join(os.tmpdir(), 'cph-b-'))
    session(a, 'sa', '/work/alpha')
    session(b, 'sb', '/work/beta')
  })
  afterEach(() => { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }) })

  it('lists only the sessions of the home it is given', () => {
    expect(listCopilotSessions(a).map((s: any) => s.sessionId)).toEqual(['sa'])
    expect(listCopilotSessions(b).map((s: any) => s.sessionId)).toEqual(['sb'])
  })
  it('finds the chat transcript in the agent\'s home, and not in another one', () => {
    expect(resolveCopilotTranscriptForDir('/work/alpha', { home: a })?.path).toContain(path.join('sa', 'events.jsonl'))
    expect(resolveCopilotTranscriptForDir('/work/alpha', { home: b })).toBeNull()
  })
})
