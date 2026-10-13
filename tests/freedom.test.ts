import { describe, it, expect } from 'vitest'
import { stopsFor, canReadOnly, stopForMode, modeForStop, STOP_HELP, STOP_LABEL, MODE_SUMMARY } from '@/lib/freedom'
import { ALL_PERMISSION_MODES, permissionModesFor } from '@/lib/program-choices'
import type { AgentPermissionMode } from '@/types/agent'

describe('which stops each tool offers', () => {
  it('Claude Code and Grok Build offer all three, Copilot CLI only the two it has', () => {
    expect(stopsFor('claude')).toEqual(['careful', 'balanced', 'handsOff'])
    expect(stopsFor('grok')).toEqual(['careful', 'balanced', 'handsOff'])
    expect(stopsFor('copilot')).toEqual(['careful', 'handsOff'])
  })

  it('tools with no permission setting offer none', () => {
    for (const k of ['pi', 'codex', 'gemini', 'opencode', 'openclaw', null, undefined] as const) expect(stopsFor(k as never)).toEqual([])
  })

  it('only Claude Code and Grok Build can be read-only', () => {
    expect(canReadOnly('claude')).toBe(true)
    expect(canReadOnly('grok')).toBe(true)
    expect(canReadOnly('copilot')).toBe(false)
    expect(canReadOnly('pi')).toBe(false)
  })
})

describe('stopForMode', () => {
  it('puts every mode on the plain scale', () => {
    expect(stopForMode('supervised')).toEqual({ stop: 'careful', readOnly: false })
    expect(stopForMode('trustEdits')).toEqual({ stop: 'balanced', readOnly: false })
    expect(stopForMode('smartAuto')).toEqual({ stop: 'balanced', readOnly: false })
    expect(stopForMode('fullAutonomy')).toEqual({ stop: 'handsOff', readOnly: false })
    expect(stopForMode('planOnly')).toEqual({ stop: 'careful', readOnly: true })
  })
})

describe('modeForStop', () => {
  it('maps each stop to the tool\'s own mode', () => {
    expect(modeForStop('claude', 'careful', false)).toBe('supervised')
    expect(modeForStop('claude', 'balanced', false)).toBe('trustEdits')
    expect(modeForStop('claude', 'handsOff', false)).toBe('fullAutonomy')
    expect(modeForStop('copilot', 'handsOff', false)).toBe('fullAutonomy')
    expect(modeForStop('copilot', 'careful', false)).toBe('supervised')
  })

  it('read-only wins over the stop, where the tool has it', () => {
    expect(modeForStop('claude', 'handsOff', true)).toBe('planOnly')
    expect(modeForStop('grok', 'careful', true)).toBe('planOnly')
    expect(modeForStop('copilot', 'handsOff', true)).toBe('fullAutonomy') // Copilot has no read-only
  })

  it('keeps the current mode when it already sits on the chosen stop (smart auto stays smart auto)', () => {
    expect(modeForStop('claude', 'balanced', false, 'smartAuto')).toBe('smartAuto')
    expect(modeForStop('claude', 'balanced', false, 'trustEdits')).toBe('trustEdits')
    expect(modeForStop('claude', 'balanced', false, 'fullAutonomy')).toBe('trustEdits')
  })

  it('never returns a mode the tool cannot honour', () => {
    for (const kind of ['claude', 'grok', 'copilot'] as const) {
      const allowed = permissionModesFor(kind)
      for (const stop of ['careful', 'balanced', 'handsOff'] as const) {
        for (const ro of [false, true]) {
          for (const cur of [undefined, ...ALL_PERMISSION_MODES] as (AgentPermissionMode | undefined)[]) {
            expect(allowed, `${kind} ${stop} ro=${ro} cur=${cur}`).toContain(modeForStop(kind, stop, ro, cur))
          }
        }
      }
    }
  })

  it('every mode a stop can produce round-trips to that stop', () => {
    for (const mode of ALL_PERMISSION_MODES) {
      const { stop, readOnly } = stopForMode(mode)
      expect(modeForStop('claude', stop, readOnly, mode)).toBe(mode)
    }
  })
})

describe('the words', () => {
  it('every stop and mode has a label, a help line and a summary', () => {
    for (const s of ['careful', 'balanced', 'handsOff'] as const) {
      expect(STOP_LABEL[s].length).toBeGreaterThan(0)
      expect(STOP_HELP[s].length).toBeGreaterThan(0)
    }
    for (const m of ALL_PERMISSION_MODES) expect(MODE_SUMMARY[m].length).toBeGreaterThan(0)
  })
})
