/**
 * Grok Build through the shared AI Maestro hook (F028). Payload shapes are from
 * real Grok 1.0.46 hook-debug.log lines: both key styles are present, and
 * stopHookActive / notificationType exist ONLY in camelCase.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const hook = require('../scripts/claude-hooks/ai-maestro-hook.cjs')

const GROK_TP = '/Users/x/.grok/sessions/%2Fwork%2Fp/01a1/updates.jsonl'
const grokStop = (over = {}) => ({
  hookEventName: 'stop', sessionId: 's', cwd: '/work/p', transcriptPath: GROK_TP,
  stopHookActive: false, hook_event_name: 'Stop', session_id: 's', transcript_path: GROK_TP, ...over,
})

describe('detectAgent · grok', () => {
  it('detects grok by camelCase hookEventName', () => {
    expect(hook.detectAgent({ hookEventName: 'stop', hook_event_name: 'Stop' })).toBe('grok')
  })
  it('detects grok by a .grok/sessions transcript path alone', () => {
    expect(hook.detectAgent({ hook_event_name: 'Stop', transcript_path: GROK_TP })).toBe('grok')
  })
  it('still treats a Claude payload as claude', () => {
    expect(hook.detectAgent({ hook_event_name: 'Stop', transcript_path: '/Users/x/.claude/projects/a/b.jsonl' })).toBe('claude')
  })
})

describe('Stop delivery · grok', () => {
  const m = [{ id: '1', fromAlias: 'alice', fromHost: 'h', subject: 'hi', priority: 'normal' }]
  it('blocks with the Claude-compatible contract', () => {
    const d = hook.decideStopDelivery({ agent: 'grok', stopHookActive: false, messages: m, alreadyIds: [] })
    expect(d.block).toBe(true)
    expect(d.response.decision).toBe('block')
  })
  it('honors stopHookActive (camelCase only on Grok) so it never loops', () => {
    expect(hook.isStopHookActive(grokStop({ stopHookActive: true }))).toBe(true)
    expect(hook.isStopHookActive(grokStop())).toBe(false)
    expect(hook.isStopHookActive({ stop_hook_active: true })).toBe(true)
    const d = hook.decideStopDelivery({ agent: 'grok', stopHookActive: true, messages: m, alreadyIds: [] })
    expect(d.block).toBe(false)
  })
  it('does not block for codex or gemini', () => {
    for (const agent of ['codex', 'gemini'])
      expect(hook.decideStopDelivery({ agent, stopHookActive: false, messages: m, alreadyIds: [] }).block).toBe(false)
  })
})

describe('buildContextResponse · grok', () => {
  it('returns no additionalContext (Grok discards that stdout)', () => {
    expect(hook.buildContextResponse('grok', 'UserPromptSubmit', 'x')).toEqual({})
    expect(hook.buildContextResponse('claude', 'UserPromptSubmit', 'x').hookSpecificOutput.additionalContext).toBe('x')
  })
})

// #551: a fresh session sits at an empty prompt, so SessionStart must not report
// 'active' (nothing clears it until the first Stop, and wakes defer for 15 minutes).
describe('sessionStartStatus', () => {
  it('reports idle for a fresh claude or grok session', () => {
    for (const agent of ['claude', 'grok'])
      for (const source of ['startup', 'resume', 'clear', 'new', undefined])
        expect(hook.sessionStartStatus(agent, source)).toBe('idle')
  })
  it('leaves the recorded status alone for compact (null), which fires mid-turn or at an idle prompt', () => {
    expect(hook.sessionStartStatus('claude', 'compact')).toBeNull()
    expect(hook.sessionStartStatus('grok', 'compact')).toBeNull()
  })
  it('claims nothing for CLIs whose SessionStart is unverified (B011 #1)', () => {
    for (const agent of ['codex', 'gemini'])
      expect(hook.sessionStartStatus(agent, 'startup')).toBe('started')
  })
})
