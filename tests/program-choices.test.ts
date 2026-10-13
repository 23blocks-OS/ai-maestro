import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'fs'
import path from 'path'
import {
  PROGRAM_CHOICES,
  ALL_PERMISSION_MODES,
  permissionModesFor,
  noPermissionChoiceNote,
  choiceForProgram,
  initialWakeSelection,
  programForCreate,
} from '@/lib/program-choices'
import { resolveProgramCommand } from '@/lib/program-command'
import TrustLevelSelector from '@/components/TrustLevelSelector'

describe('the offered tools (F040)', () => {
  it('every tool the dialog offers launches the command it names', () => {
    for (const c of PROGRAM_CHOICES.filter((x) => x.kind)) {
      const r = resolveProgramCommand(c.id)
      expect(r.error, c.id).toBeUndefined()
      expect(r.command, c.id).toBe(c.command)
      expect(r.kind, c.id).toBe(c.kind)
    }
  })

  it('does not offer Cursor (the editor, never supported as an agent) or Aider (deprecated)', () => {
    const ids = PROGRAM_CHOICES.map((c) => c.id)
    expect(ids).not.toContain('cursor')
    expect(ids).not.toContain('aider')
    expect(fs.readFileSync(path.join(__dirname, '..', 'components/WakeAgentDialog.tsx'), 'utf8')).not.toMatch(/id:\s*'cursor'/)
  })

  it('offers the tools AI Maestro recognises, with the unfinished ones marked terminal only', () => {
    const ids = PROGRAM_CHOICES.map((c) => c.id)
    for (const id of ['claude', 'codex', 'grok', 'copilot', 'pi', 'gemini', 'opencode', 'openclaw', 'terminal']) expect(ids).toContain(id)
    for (const id of ['gemini', 'opencode', 'openclaw']) {
      const c = PROGRAM_CHOICES.find((x) => x.id === id)!
      expect(c.group).toBe('more')
      expect(c.description).toMatch(/terminal tab/)
    }
  })
})

describe('which permission modes a tool can honour', () => {
  it('Claude Code and Grok Build take all five', () => {
    expect(permissionModesFor('claude')).toEqual(ALL_PERMISSION_MODES)
    expect(permissionModesFor('grok')).toEqual(ALL_PERMISSION_MODES)
  })

  it('Codex CLI takes its default, read-only, automatic review and no sandbox', () => {
    expect(permissionModesFor('codex')).toEqual(['supervised', 'planOnly', 'smartAuto', 'fullAutonomy'])
  })

  it('Copilot CLI takes only supervised and full autonomy', () => {
    expect(permissionModesFor('copilot')).toEqual(['supervised', 'fullAutonomy'])
  })

  it.each(['pi', 'gemini', 'opencode', 'openclaw', 'aider', 'cursor', null, undefined])('%s has nothing to choose', (k) => {
    expect(permissionModesFor(k as any)).toEqual([])
  })

  it('says why there is no choice for Pi and Codex, and says nothing for tools that have one', () => {
    expect(noPermissionChoiceNote('pi')).toMatch(/never asks/)
    expect(noPermissionChoiceNote('codex')).toBeNull()
    expect(noPermissionChoiceNote('claude')).toBeNull()
    expect(noPermissionChoiceNote('copilot')).toBeNull()
  })

  it('the selector shows only the allowed modes', () => {
    const html = renderToStaticMarkup(createElement(TrustLevelSelector, { value: 'supervised', onChange: () => {}, compact: true, allowed: ['supervised', 'fullAutonomy'] }))
    expect(html).toContain('Supervised')
    expect(html).toContain('Full Autonomy')
    expect(html).not.toContain('Plan Only')
    expect(html).not.toContain('Trust Edits')
    expect(html).not.toContain('Smart Auto')
    const all = renderToStaticMarkup(createElement(TrustLevelSelector, { value: 'supervised', onChange: () => {}, compact: true }))
    expect(all).toContain('Plan Only')
  })

  it('the long explanation under the list can be hidden, so the caller can show one clear warning instead of two', () => {
    const withDetail = renderToStaticMarkup(createElement(TrustLevelSelector, { value: 'fullAutonomy', onChange: () => {}, compact: true }))
    const without = renderToStaticMarkup(createElement(TrustLevelSelector, { value: 'fullAutonomy', onChange: () => {}, compact: true, hideDetail: true }))
    expect(withDetail).toMatch(/YOLO mode/)
    expect(without).not.toMatch(/YOLO mode/)
    expect(without).toContain('Full Autonomy') // the list itself is still there
  })
})

describe('choiceForProgram: what the agent already runs', () => {
  it.each([
    ['claude-code', 'claude'], ['Claude Code', 'claude'], ['claude', 'claude'],
    ['codex', 'codex'], ['grok', 'grok'], ['Grok Build', 'grok'],
    ['copilot', 'copilot'], ['GitHub Copilot CLI', 'copilot'], ['pi', 'pi'], ['gemini', 'gemini'],
    ['none', 'terminal'], ['terminal', 'terminal'],
  ])('%s -> %s', (program, id) => {
    expect(choiceForProgram(program)?.id).toBe(id)
  })

  it.each(['cursor', 'aider', '/usr/local/bin/claude-sandboxed.sh', '~/bin/mytool', '', undefined, null])('%s is not an offered tool', (program) => {
    expect(choiceForProgram(program as any)).toBeNull()
  })
})

describe('the wake dialog starts on the agent\'s own tool (it used to always start on Claude Code)', () => {
  it('a Grok agent opens on Grok, a Codex agent on Codex, a Pi agent on Pi', () => {
    expect(initialWakeSelection('grok', undefined).choiceId).toBe('grok')
    expect(initialWakeSelection('codex', undefined).choiceId).toBe('codex')
    expect(initialWakeSelection('pi', undefined).choiceId).toBe('pi')
    expect(initialWakeSelection('github-copilot-cli', undefined).choiceId).toBe('copilot')
  })

  it('an agent with nothing recorded still opens on Claude Code, as before', () => {
    expect(initialWakeSelection(undefined, undefined)).toEqual({ choiceId: 'claude', mode: 'supervised' })
    expect(initialWakeSelection('', 'trustEdits')).toEqual({ choiceId: 'claude', mode: 'trustEdits' })
  })

  it('keeps the stored mode when the tool can honour it', () => {
    expect(initialWakeSelection('claude-code', 'planOnly').mode).toBe('planOnly')
    expect(initialWakeSelection('grok', 'fullAutonomy').mode).toBe('fullAutonomy')
    expect(initialWakeSelection('copilot', 'fullAutonomy').mode).toBe('fullAutonomy')
  })

  it('falls back to supervised when the tool cannot honour the stored mode, instead of showing a mode that does nothing', () => {
    expect(initialWakeSelection('copilot', 'planOnly').mode).toBe('supervised')
    expect(initialWakeSelection('pi', 'fullAutonomy').mode).toBe('supervised')
    expect(initialWakeSelection('codex', 'trustEdits').mode).toBe('supervised')
    expect(initialWakeSelection('codex', 'smartAuto').mode).toBe('smartAuto')
  })

  it('ignores a garbage stored mode', () => {
    expect(initialWakeSelection('claude', 'yolo').mode).toBe('supervised')
  })

  it('keeps a program it does not offer (a wrapper script, a retired tool) instead of silently switching to Claude', () => {
    expect(initialWakeSelection('/usr/local/bin/claude-sandboxed.sh', 'trustEdits').choiceId).toBe('current')
    expect(initialWakeSelection('cursor', undefined).choiceId).toBe('current')
    expect(initialWakeSelection('aider', undefined).choiceId).toBe('current')
  })
})

describe('programForCreate: what a new agent is stored with', () => {
  it('Claude Code keeps its long-standing name, a terminal is "none", every other tool is its command', () => {
    const byId = (id: string) => PROGRAM_CHOICES.find((c) => c.id === id)!
    expect(programForCreate(byId('claude'))).toBe('claude-code')
    expect(programForCreate(byId('terminal'))).toBe('none')
    expect(programForCreate(byId('grok'))).toBe('grok')
    expect(programForCreate(byId('copilot'))).toBe('copilot')
    expect(programForCreate(byId('pi'))).toBe('pi')
    expect(programForCreate(byId('gemini'))).toBe('gemini')
  })

  it('every value it produces is understood by the launcher', () => {
    for (const c of PROGRAM_CHOICES) {
      const v = programForCreate(c)
      if (v === 'none') continue
      expect(resolveProgramCommand(v).kind, v).toBe(c.kind)
    }
  })
})
