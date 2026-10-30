/**
 * An observed permission request (Claude Code's PermissionRequest hook) expires once the terminal
 * shows no decision. Claude Code fires no event when the user answers, presses Esc or chooses "No"
 * (measured on 2.1.306), so without this the agent would stay on "Needs you".
 *
 * Pane text is real, captured from Claude Code 2.1.306 (tests/fixtures/claude-hooks/pane-observed-permission.json).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { observedPermissionVerdict, paneShowsDecision, OBSERVED_GRACE_MS } from '../lib/observed-permission.mjs'

const pane = JSON.parse(fs.readFileSync(new URL('./fixtures/claude-hooks/pane-observed-permission.json', import.meta.url), 'utf8'))
const OLD = OBSERVED_GRACE_MS + 500

describe('observedPermissionVerdict', () => {
  it('keeps the request while the dialog is on screen', () => {
    expect(observedPermissionVerdict({ ageMs: OLD, paneText: pane.dialog })).toBe('keep')
    expect(observedPermissionVerdict({ ageMs: 60_000, paneText: pane.dialog })).toBe('keep')
  })

  it('expires it to idle after Esc ("Interrupted") and after "No", the agent being back at its prompt', () => {
    expect(observedPermissionVerdict({ ageMs: OLD, paneText: pane.afterEsc })).toBe('idle')
    expect(observedPermissionVerdict({ ageMs: OLD, paneText: pane.afterNo })).toBe('idle')
  })

  it('expires it to idle when the agent finished the turn after an approval', () => {
    expect(observedPermissionVerdict({ ageMs: OLD, paneText: pane.afterYes })).toBe('idle')
  })

  it('expires it to active when the agent is working again (answered, the tool runs)', () => {
    expect(observedPermissionVerdict({ ageMs: OLD, paneText: pane.working })).toBe('active')
  })

  it('does not look before the dialog has had time to be drawn', () => {
    expect(observedPermissionVerdict({ ageMs: 100, paneText: pane.afterEsc })).toBe('keep')
    expect(observedPermissionVerdict({ ageMs: OBSERVED_GRACE_MS - 1, paneText: pane.afterEsc })).toBe('keep')
    expect(observedPermissionVerdict({ ageMs: Number.NaN, paneText: pane.afterEsc })).toBe('keep')
  })

  it('never takes an unreadable pane for a finished request', () => {
    expect(observedPermissionVerdict({ ageMs: OLD, paneText: '' })).toBe('keep')
    expect(observedPermissionVerdict({ ageMs: OLD, paneText: '   \n  \n' })).toBe('keep')
    expect(observedPermissionVerdict({ ageMs: OLD, paneText: undefined as any })).toBe('keep')
  })

  it('keeps a dialog the menu parser cannot read but that carries the dialog footer', () => {
    expect(paneShowsDecision(pane.unreadableDialog)).toBe(true)
    expect(observedPermissionVerdict({ ageMs: OLD, paneText: pane.unreadableDialog })).toBe('keep')
  })

  it('a dialog that scrolled up behind later conversation is over', () => {
    expect(paneShowsDecision(pane.afterEsc)).toBe(false)
    const withOldDialog = pane.dialog + '\n' + pane.afterNo
    expect(observedPermissionVerdict({ ageMs: OLD, paneText: withOldDialog })).toBe('idle')
  })
})

// ── The feed: sweepObservedPermissions + getActivity ────────────────────────

const capturePaneSync = vi.fn()
vi.mock('@/lib/tmux-runtime.mjs', () => ({ capturePaneSync: (...a: any[]) => capturePaneSync(...a) }))

const agents = [
  { id: 'a1', name: 'claude-agent', workingDirectory: '/repos/claude' },
  { id: 'a2', name: 'codex-agent', workingDirectory: '/repos/codex' },
]
vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => agents,
  getAgentByName: (n: string) => agents.find(a => a.name === n),
  getAgentBySession: (n: string) => agents.find(a => a.name === n),
}))

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'observed-'))
process.env.HOME = tmpHome
vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)

function writeHookFile(cwd: string, state: Record<string, unknown>, at: number) {
  const dir = path.join(tmpHome, '.aimaestro', 'chat-state')
  fs.mkdirSync(dir, { recursive: true })
  const hash = crypto.createHash('md5').update(cwd).digest('hex').substring(0, 16)
  fs.writeFileSync(path.join(dir, `${hash}.json`), JSON.stringify({ cwd, updatedAt: new Date(at).toISOString(), ...state }))
}

const { sessionActivity, hookStatus, observedExpired, statusSubscribers } = await import('@/services/shared-state')
const { getActivity, sweepObservedPermissions } = await import('@/services/sessions-service')

// The sweep keeps a per-session recheck clock between calls, so every test sweeps at its own, later, time.
let clock = 0
const sweep = () => sweepObservedPermissions(Date.now() + (clock += 60_000))

const observed = (extra: Record<string, unknown> = {}) => ({ status: 'permission_request', observed: true, options: [], toolName: 'Bash', ...extra })

beforeEach(() => {
  sessionActivity.clear()
  hookStatus.clear()
  observedExpired.clear()
  statusSubscribers.clear()
  capturePaneSync.mockReset()
  fs.rmSync(path.join(tmpHome, '.aimaestro', 'chat-state'), { recursive: true, force: true })
})

/** A session whose hook reported an observed permission request `ageMs` ago. */
function request(name: string, cwd: string, ageMs: number, extra: Record<string, unknown> = {}) {
  const at = Date.now() - ageMs
  writeHookFile(cwd, observed(extra), at)
  hookStatus.set(name, { status: 'permission_request', at })
  return at
}

describe('the activity feed after an observed permission request', () => {
  it('says "Needs you" while the dialog is on screen', async () => {
    request('claude-agent', '/repos/claude', 10_000)
    capturePaneSync.mockReturnValue(pane.dialog)
    expect(sweep()).toBe(0)
    const a = await getActivity()
    expect(a['claude-agent'].status).toBe('waiting')
    expect(a['claude-agent'].hookStatus).toBe('permission_request')
  })

  it('goes back to idle once the terminal shows no menu (Esc, "No")', async () => {
    const at = request('claude-agent', '/repos/claude', 10_000)
    capturePaneSync.mockReturnValue(pane.afterEsc)
    expect(sweep()).toBe(1)
    expect(observedExpired.get('claude-agent')).toEqual({ at, status: 'idle' })
    const a = await getActivity()
    expect(a['claude-agent'].status).toBe('idle')
    expect(a['claude-agent'].hookStatus).toBe('idle')
  })

  it('goes to active when the agent is working again', async () => {
    request('claude-agent', '/repos/claude', 10_000)
    capturePaneSync.mockReturnValue(pane.working)
    sweep()
    const a = await getActivity()
    expect(a['claude-agent'].status).toBe('active')
    expect(a['claude-agent'].hookStatus).toBe('active')
  })

  it('also expires an agent whose terminal is not open in the dashboard (the second loop of the feed)', async () => {
    request('claude-agent', '/repos/claude', 10_000)
    sessionActivity.set('claude-agent', Date.now() - 60_000)
    capturePaneSync.mockReturnValue(pane.afterNo)
    sweep()
    expect((await getActivity())['claude-agent'].hookStatus).toBe('idle')
  })

  it('updates the hook status map and pushes to /status clients, as a hook report does', () => {
    request('claude-agent', '/repos/claude', 10_000)
    const sent: string[] = []
    statusSubscribers.add({ readyState: 1, send: (m: string) => sent.push(m) } as any)
    capturePaneSync.mockReturnValue(pane.afterEsc)
    sweep()
    expect(hookStatus.get('claude-agent')?.status).toBe('idle')
    expect(sent.map(m => JSON.parse(m)).some(m => m.type === 'status_update' && m.sessionName === 'claude-agent' && m.hookStatus === 'idle')).toBe(true)
  })

  it('does not look at a request that is still inside the grace period', () => {
    request('claude-agent', '/repos/claude', 500)
    capturePaneSync.mockReturnValue(pane.afterEsc)
    expect(sweepObservedPermissions(Date.now())).toBe(0)
    expect(capturePaneSync).not.toHaveBeenCalled()
  })

  it('does not capture a pane more than once per recheck interval', () => {
    request('claude-agent', '/repos/claude', 10_000)
    capturePaneSync.mockReturnValue(pane.dialog)
    const now = Date.now() + (clock += 60_000)
    sweepObservedPermissions(now)
    sweepObservedPermissions(now + 200)
    sweepObservedPermissions(now + 400)
    expect(capturePaneSync).toHaveBeenCalledTimes(1)
  })

  it('captures at most a few panes per sweep, least recently checked first', () => {
    const extra = [3, 4, 5, 6, 7].map(i => ({ id: `a${i}`, name: `agent-${i}`, workingDirectory: `/repos/r${i}` }))
    agents.push(...extra)
    try {
      for (const a of extra) request(a.name, a.workingDirectory, 10_000)
      capturePaneSync.mockReturnValue(pane.dialog)
      const now = Date.now() + (clock += 60_000)
      sweepObservedPermissions(now)
      const first = capturePaneSync.mock.calls.map(c => c[0])
      expect(first.length).toBe(3)
      capturePaneSync.mockClear()
      sweepObservedPermissions(now + 2000) // all five are due again; the two not yet seen go first
      const second = capturePaneSync.mock.calls.map(c => c[0])
      expect(second.length).toBe(3)
      expect(new Set([...first, ...second]).size).toBe(5)
    } finally {
      agents.splice(2)
      for (const a of extra) hookStatus.delete(a.name)
    }
  })

  it('keeps the request when there is no pane to look at', async () => {
    request('claude-agent', '/repos/claude', 10_000)
    capturePaneSync.mockImplementation(() => { throw new Error('no such session') })
    expect(sweep()).toBe(0)
    expect((await getActivity())['claude-agent'].hookStatus).toBe('permission_request')
  })

  it('a newer hook report is not covered by an earlier expiry', async () => {
    request('claude-agent', '/repos/claude', 10_000)
    capturePaneSync.mockReturnValue(pane.afterEsc)
    sweep()
    // the agent asks again: a new report with a new timestamp
    request('claude-agent', '/repos/claude', 1_000)
    const a = await getActivity()
    expect(a['claude-agent'].status).toBe('waiting')
    expect(a['claude-agent'].hookStatus).toBe('permission_request')
  })

  it('a later event (the turn ends) simply replaces the state, with or without an expiry', async () => {
    request('claude-agent', '/repos/claude', 10_000)
    writeHookFile('/repos/claude', { status: 'idle' }, Date.now())
    hookStatus.set('claude-agent', { status: 'idle', at: Date.now() })
    expect((await getActivity())['claude-agent'].hookStatus).toBe('idle')
    expect(sweep()).toBe(0)
  })
})

describe('everything else is unaffected', () => {
  it('a permission_request that is not observed (another agent, or an older hook) is left alone', async () => {
    const at = Date.now() - 10_000
    writeHookFile('/repos/codex', { status: 'permission_request', options: [{ key: '1', label: 'Yes', value: 'yes' }] }, at)
    hookStatus.set('codex-agent', { status: 'permission_request', at })
    capturePaneSync.mockReturnValue(pane.afterEsc)
    expect(sweep()).toBe(0)
    expect(capturePaneSync).not.toHaveBeenCalled()
    expect((await getActivity())['codex-agent'].hookStatus).toBe('permission_request')
  })

  it('a waiting_for_input notification state is left alone', async () => {
    const at = Date.now() - 10_000
    writeHookFile('/repos/claude', { status: 'waiting_for_input', notificationType: 'permission_prompt' }, at)
    hookStatus.set('claude-agent', { status: 'waiting_for_input', notificationType: 'permission_prompt', at })
    capturePaneSync.mockReturnValue(pane.afterEsc)
    expect(sweep()).toBe(0)
    expect((await getActivity())['claude-agent'].hookStatus).toBe('waiting_for_input')
  })

  it('only the session whose dialog is over is expired', async () => {
    request('claude-agent', '/repos/claude', 10_000)
    const at = Date.now() - 10_000
    writeHookFile('/repos/codex', observed(), at)
    hookStatus.set('codex-agent', { status: 'permission_request', at })
    capturePaneSync.mockImplementation((name: string) => (name === 'claude-agent' ? pane.afterEsc : pane.dialog))
    expect(sweep()).toBe(1)
    const a = await getActivity()
    expect(a['claude-agent'].hookStatus).toBe('idle')
    expect(a['codex-agent'].hookStatus).toBe('permission_request')
  })
})
