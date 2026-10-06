/**
 * The AgentRuntime contract (F026 Phase 0).
 *
 * One suite of behaviours every runtime must have, run against two runtimes:
 *
 *   1. FakeRuntime, an in-memory runtime written against the interface only.
 *      It proves the contract can be met without tmux, which is the point of
 *      the abstraction (a second runtime can be added without touching callers).
 *   2. The real TmuxRuntime, with `tmux` replaced by a small simulator that
 *      interprets the argv it receives. That checks the argv TmuxRuntime sends
 *      actually means what the contract says (the paste lands in the pane,
 *      backspaces clear it, copy-mode toggles), not only that it has a shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import { assertSessionName, assertPaneTarget } from '@/lib/tmux-safe.mjs'

// ---------------------------------------------------------------------------
// A tiny tmux, driven by argv. Only what the runtime uses.
// ---------------------------------------------------------------------------

interface SimPane { cwd: string; created: number; lines: string[]; input: string; inMode: boolean; env: Record<string, string>; options: Record<string, string> }

const sim = vi.hoisted(() => {
  const sessions = new Map<string, any>()
  const buffers = new Map<string, string>()
  // Set after imports (vi.hoisted runs before them): how load-buffer reads its file.
  const io = { readFile: (_p: string): string => { throw new Error('io.readFile not set') } }
  const fail = (msg: string) => { const e: any = new Error(msg); e.code = 1; throw e }
  const target = (args: string[]) => {
    const i = args.indexOf('-t')
    return i === -1 ? '' : args[i + 1].split(':')[0]
  }
  const pane = (args: string[]) => sessions.get(target(args)) || fail(`can't find session: ${target(args)}`)
  const format = (name: string, p: any, fmt: string) => fmt
    .replace('#{session_name}', name)
    .replace('#{session_windows}', '1')
    .replace('#{session_created}', String(p.created))
    .replace('#{pane_current_path}', p.cwd)
    .replace('#{pane_in_mode}', p.inMode ? '1' : '0')
    .replace(/#\{[a-z_]+\}/g, '0')

  function run(args: string[]): string {
    if (args[0] === '-S') args = args.slice(2)
    const [cmd] = args
    switch (cmd) {
      case 'has-session': pane(args); return ''
      case 'new-session': {
        const name = args[args.indexOf('-s') + 1]
        if (sessions.has(name)) fail(`duplicate session: ${name}`)
        const c = args.indexOf('-c')
        sessions.set(name, { cwd: c === -1 ? '/' : args[c + 1], created: 1790000000, lines: [], input: '', inMode: false, env: {}, options: {} })
        return ''
      }
      case 'kill-session': pane(args); sessions.delete(target(args)); return ''
      case 'rename-session': {
        const p = pane(args); sessions.delete(target(args)); sessions.set(args[args.length - 1], p); return ''
      }
      case 'list-sessions': {
        if (sessions.size === 0) fail('no server running')
        const f = args.indexOf('-F')
        return [...sessions].map(([n, p]) => f === -1 ? `${n}: 1 windows (created Mon Sep 28 10:00:00 2026)` : format(n, p, args[f + 1])).join('\n') + '\n'
      }
      case 'display-message': { const p = pane(args); return format(target(args), p, args[args.length - 1]) + '\n' }
      case 'capture-pane': { const p = pane(args); return [...p.lines, `> ${p.input}`].join('\n') + '\n' }
      case 'set-environment': {
        const p = pane(args)
        if (args.includes('-r')) delete p.env[args[args.length - 1]]
        else p.env[args[args.length - 2]] = args[args.length - 1]
        return ''
      }
      case 'set-option': { const p = pane(args); p.options[args[args.length - 2]] = args[args.length - 1]; return '' }
      case 'copy-mode': pane(args).inMode = true; return ''
      case 'load-buffer': buffers.set(args[args.indexOf('-b') + 1], io.readFile(args[args.length - 1])); return ''
      case 'delete-buffer': buffers.delete(args[args.indexOf('-b') + 1]); return ''
      case 'paste-buffer': {
        const p = pane(args); const b = args[args.indexOf('-b') + 1]
        if (!buffers.has(b)) fail('no buffer')
        p.input += buffers.get(b); if (args.includes('-d')) buffers.delete(b); return ''
      }
      case 'send-keys': {
        const p = pane(args)
        let rest = args.slice(args.indexOf('-t') + 2)
        let times = 1
        if (rest[0] === '-X') {
          const n = rest[1] === '-N' ? 3 : 1
          const op = rest[n]
          if (!p.inMode) fail('not in a mode')
          if (op === 'cancel') p.inMode = false
          return ''
        }
        if (rest[0] === '-l') { p.input += rest[1]; return '' }
        if (rest[0] === '-N') { times = parseInt(rest[1], 10); rest = rest.slice(2) }
        for (let t = 0; t < times; t++) {
          for (const key of rest) {
            if (p.inMode) { if (key === 'Escape' || key === 'q') p.inMode = false; continue }
            if (key === 'Enter' || key === 'C-m') { p.lines.push(p.input); p.input = '' }
            else if (key === 'BSpace') p.input = p.input.slice(0, -1)
            else if (/^[A-Z]-/.test(key) || key === 'Escape') { /* control key */ }
            else p.input += key
          }
        }
        return ''
      }
      default: return fail(`unknown command ${cmd}`)
    }
  }
  return { sessions, buffers, io, run, reset: () => { sessions.clear(); buffers.clear() } }
})

vi.mock('@/lib/tmux-safe.mjs', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/tmux-safe.mjs')>()
  return {
    ...real,
    tmux: async (args: string[]) => ({ stdout: sim.run(args), stderr: '' }),
    tmuxSync: (args: string[]) => sim.run(args),
  }
})

import { TmuxRuntime, getRuntime, setRuntime, type AgentRuntime, type DiscoveredSession } from '@/lib/agent-runtime'

sim.io.readFile = (p: string) => fs.readFileSync(p, 'utf-8')

// ---------------------------------------------------------------------------
// FakeRuntime: the contract met with no tmux at all
// ---------------------------------------------------------------------------

class FakeRuntime implements AgentRuntime {
  readonly type = 'api' as const
  sessions = new Map<string, SimPane>()

  private get(name: string): SimPane {
    const p = this.sessions.get(assertPaneTarget(name).split(':')[0])
    if (!p) throw new Error(`no session ${name}`)
    return p
  }

  async listSessions(): Promise<DiscoveredSession[]> {
    return [...this.sessions].map(([name, p]) => ({ name, windows: 1, createdAt: new Date(p.created * 1000).toISOString(), workingDirectory: p.cwd }))
  }
  async sessionExists(name: string) { try { return this.sessions.has(assertSessionName(name)) } catch { return false } }
  async getWorkingDirectory(name: string) { return this.sessions.get(name)?.cwd ?? '' }
  async isInCopyMode(name: string) { return this.sessions.get(name)?.inMode ?? false }
  async cancelCopyMode(name: string) { const p = this.sessions.get(name); if (p) p.inMode = false }
  async createSession(name: string, cwd: string) {
    if (this.sessions.has(assertSessionName(name))) throw new Error('duplicate')
    this.sessions.set(name, { cwd, created: 1790000000, lines: [], input: '', inMode: false, env: {}, options: {} })
  }
  async killSession(name: string) { this.get(assertSessionName(name)); this.sessions.delete(name) }
  async renameSession(oldName: string, newName: string) {
    const p = this.get(assertSessionName(oldName)); assertSessionName(newName)
    this.sessions.delete(oldName); this.sessions.set(newName, p)
  }
  async sendKeys(name: string, keys: string, opts: { literal?: boolean; enter?: boolean } = {}) {
    const p = this.get(name)
    if (opts.literal) p.input += keys
    else if (keys === 'Enter' || keys === 'C-m') { p.lines.push(p.input); p.input = '' }
    if (opts.enter) { p.lines.push(p.input); p.input = '' }
  }
  async capturePane(name: string) { try { const p = this.get(name); return [...p.lines, `> ${p.input}`].join('\n') + '\n' } catch { return '' } }
  async capturePaneRaw(name: string) { return this.capturePane(name) }
  async repeatKey(name: string, key: string, times: number) {
    const p = this.get(name)
    for (let i = 0; i < times; i++) if (key === 'BSpace') p.input = p.input.slice(0, -1)
  }
  async pasteText(name: string, text: string) { this.get(name).input += text }
  async captureHistory(name: string) { return this.capturePane(name) }
  async enterCopyMode(name: string) { this.get(name).inMode = true }
  async scroll(name: string) { this.get(name) }
  async setOption(name: string, option: string, value: string) { this.get(assertSessionName(name)).options[option] = value }
  async setEnvironment(name: string, key: string, value: string) { this.get(assertSessionName(name)).env[key] = value }
  async unsetEnvironment(name: string, key: string) { const p = this.sessions.get(name); if (p) delete p.env[key] }
  getAttachCommand(name: string) { return { command: 'fake-attach', args: [assertSessionName(name)] } }
}

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

function runtimeContract(label: string, make: () => AgentRuntime) {
  describe(`AgentRuntime contract · ${label}`, () => {
    let r: AgentRuntime
    beforeEach(() => { sim.reset(); r = make() })

    it('creates a session that exists, is listed, and reports its working directory', async () => {
      expect(await r.sessionExists('alpha')).toBe(false)
      await r.createSession('alpha', '/work/alpha')
      expect(await r.sessionExists('alpha')).toBe(true)
      const list = await r.listSessions()
      expect(list.map(s => s.name)).toEqual(['alpha'])
      expect(list[0].workingDirectory).toBe('/work/alpha')
      expect(Number.isNaN(Date.parse(list[0].createdAt))).toBe(false)
      expect(await r.getWorkingDirectory('alpha')).toBe('/work/alpha')
    })

    it('lists nothing when there are no sessions', async () => {
      expect(await r.listSessions()).toEqual([])
    })

    it('renames and kills sessions', async () => {
      await r.createSession('alpha', '/w')
      await r.renameSession('alpha', 'beta')
      expect(await r.sessionExists('alpha')).toBe(false)
      expect(await r.sessionExists('beta')).toBe(true)
      await r.killSession('beta')
      expect(await r.sessionExists('beta')).toBe(false)
    })

    it('typed literal text plus Enter shows up in the pane as submitted', async () => {
      await r.createSession('alpha', '/w')
      await r.sendKeys('alpha', 'hello $(id)', { literal: true })
      expect(await r.capturePane('alpha')).toContain('> hello $(id)')
      await r.sendKeys('alpha', 'Enter')
      const pane = await r.capturePane('alpha')
      expect(pane.split('\n')).toContain('hello $(id)')
      expect(pane).toContain('> \n')
    })

    it('pasteText stages the text in the input without submitting it', async () => {
      await r.createSession('alpha', '/w')
      await r.pasteText('alpha', 'line one\nline two')
      const pane = await r.capturePaneRaw('alpha')
      expect(pane).toContain('> line one\nline two')
      expect(sim.buffers.size).toBe(0) // the paste buffer is cleaned up
    })

    it('repeatKey with BSpace clears staged text', async () => {
      await r.createSession('alpha', '/w')
      await r.pasteText('alpha', 'abcdef')
      await r.repeatKey('alpha', 'BSpace', 6)
      expect((await r.capturePane('alpha')).trimEnd().endsWith('>')).toBe(true)
    })

    it('enters and cancels copy-mode; scroll is accepted in copy-mode', async () => {
      await r.createSession('alpha', '/w')
      expect(await r.isInCopyMode('alpha')).toBe(false)
      await r.enterCopyMode('alpha')
      expect(await r.isInCopyMode('alpha')).toBe(true)
      await r.scroll('alpha', 'up', 5)
      await r.cancelCopyMode('alpha')
      expect(await r.isInCopyMode('alpha')).toBe(false)
    })

    it('replays history for a new terminal client', async () => {
      await r.createSession('alpha', '/w')
      await r.sendKeys('alpha', 'earlier output', { literal: true, enter: true })
      expect(await r.captureHistory('alpha', 5000)).toContain('earlier output')
    })

    it('sets options and environment without error', async () => {
      await r.createSession('alpha', '/w')
      await r.setOption('alpha', 'mouse', 'off')
      await r.setOption('alpha', 'alternate-screen', 'off', { window: true })
      await r.setEnvironment('alpha', 'AIM_AGENT_NAME', 'alpha')
      await r.unsetEnvironment('alpha', 'AIM_AGENT_NAME')
      await r.unsetEnvironment('alpha', 'NEVER_SET') // unsetting twice is fine
    })

    it('says how to attach a terminal, as a command and an argv', () => {
      const { command, args } = r.getAttachCommand('alpha')
      expect(typeof command).toBe('string')
      expect(Array.isArray(args)).toBe(true)
      expect(args).toContain('alpha')
    })

    it('refuses session names outside ^[a-zA-Z0-9_-]+$', async () => {
      const evil = 'x"; touch /tmp/pwned; echo "'
      await expect(r.createSession(evil, '/w')).rejects.toThrow()
      expect(await r.sessionExists(evil)).toBe(false)
      await expect(r.pasteText(evil, 'x')).rejects.toThrow()
      await expect(r.setOption(evil, 'mouse', 'off')).rejects.toThrow()
      expect(() => r.getAttachCommand(evil)).toThrow()
      expect(await r.listSessions()).toEqual([])
    })
  })
}

runtimeContract('FakeRuntime (no tmux)', () => new FakeRuntime())
runtimeContract('TmuxRuntime (simulated tmux)', () => new TmuxRuntime())

describe('getRuntime / setRuntime', () => {
  let original: AgentRuntime
  beforeEach(() => { original = getRuntime() })
  afterEach(() => { setRuntime(original) })

  it('callers get whatever runtime is installed', async () => {
    const fake = new FakeRuntime()
    setRuntime(fake)
    expect(getRuntime()).toBe(fake)
    await getRuntime().createSession('alpha', '/w')
    expect(fake.sessions.has('alpha')).toBe(true)
  })
})

