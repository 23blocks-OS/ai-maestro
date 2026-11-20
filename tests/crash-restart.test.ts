/**
 * F044 item 6: crash restart. The decision (lib/crash-restart) and one watcher pass with fake terminals.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { crashAction, MAX_RESTARTS, QUIET_MS } from '@/lib/crash-restart'

const NOW = Date.parse('2026-11-20T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const live = { status: 'idle', at: NOW - 600_000 }
const base = { atShell: true, lastActivityMs: NOW - 10 * 60_000, record: live, restarts: [] as string[], failed: false, now: NOW }

describe('crashAction', () => {
  it('restarts a program that left a shell without quitting', () => {
    expect(crashAction(base).action).toBe('restart')
  })
  it('leaves alone: a running program, a quit, a never-started folder, a failed agent', () => {
    expect(crashAction({ ...base, atShell: false }).action).toBe('none')
    expect(crashAction({ ...base, record: { status: 'ended', at: NOW } }).action).toBe('none')
    expect(crashAction({ ...base, record: null }).action).toBe('none')
    expect(crashAction({ ...base, failed: true }).action).toBe('none')
  })
  it('never interrupts someone using the shell', () => {
    expect(crashAction({ ...base, lastActivityMs: NOW - QUIET_MS + 1000 }).action).toBe('none')
  })
  it('backs off after a restart, and restarts again once the wait is over', () => {
    expect(crashAction({ ...base, restarts: [ago(10_000)] })).toMatchObject({ action: 'wait' })
    expect(crashAction({ ...base, restarts: [ago(40_000)] }).action).toBe('restart')
  })
  it(`fails after ${MAX_RESTARTS} restarts in 30 minutes; older ones do not count`, () => {
    const six = Array.from({ length: MAX_RESTARTS }, (_, i) => ago((i + 1) * 4 * 60_000))
    expect(crashAction({ ...base, restarts: six }).action).toBe('fail')
    expect(crashAction({ ...base, restarts: six.map(() => ago(31 * 60_000)) }).action).toBe('restart')
  })
})

// ── One watcher pass ──────────────────────────────────────────────────────────

const agents: any[] = []
vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => agents,
  getAgent: (id: string) => agents.find(a => a.id === id),
  updateAgent: (id: string, u: any) => { Object.assign(agents.find(a => a.id === id), u) },
}))
vi.mock('@/lib/hosts-config', () => ({ isSelf: (h: string) => h === 'self' }))

describe('checkCrashedAgents', () => {
  beforeEach(async () => { agents.length = 0; (await import('@/services/crash-restart-service')).resetCrashState() })
  const deps = (command: string, report = live) => ({
    pane: async () => ({ command, activityMs: NOW - 10 * 60_000 }),
    report: () => report,
    restart: vi.fn(async () => ({ status: 200 })),
    notify: vi.fn(),
    now: () => NOW,
  })

  it('restarts a crashed Claude Code agent and records it; skips other programs and other hosts', async () => {
    const { checkCrashedAgents } = await import('@/services/crash-restart-service')
    agents.push(
      { id: 'a', name: 'acme-ops', program: 'Claude Code', hostId: 'self' },
      { id: 'b', name: 'acme-codex', program: 'Codex', hostId: 'self' },
      { id: 'c', name: 'acme-far', program: 'Claude Code', hostId: 'other' },
    )
    const d = deps('zsh')
    expect(await checkCrashedAgents(d)).toEqual([]) // never seen running in this server run: left alone
    await checkCrashedAgents(deps('claude'))
    expect(await checkCrashedAgents(d)).toEqual([{ agent: 'acme-ops', did: 'restarted' }])
    expect(d.restart).toHaveBeenCalledWith('a')
    expect(agents[0].crashRestarts).toHaveLength(1)
  })

  it('restarts at most 3 agents in one pass', async () => {
    const { checkCrashedAgents } = await import('@/services/crash-restart-service')
    for (const n of [1, 2, 3, 4, 5]) agents.push({ id: `a${n}`, name: `acme-${n}`, program: 'Claude Code', hostId: 'self' })
    await checkCrashedAgents(deps('claude'))
    expect(await checkCrashedAgents(deps('zsh'))).toHaveLength(3)
    expect(await checkCrashedAgents(deps('zsh'))).toHaveLength(2)
  })

  it('marks failed and tells the person after too many crashes; clears it once the program runs', async () => {
    const { checkCrashedAgents } = await import('@/services/crash-restart-service')
    agents.push({ id: 'a', name: 'acme-ops', program: 'Claude Code', hostId: 'self', crashRestarts: Array.from({ length: MAX_RESTARTS }, (_, i) => ago((i + 1) * 60_000)) })
    const d = deps('bash')
    await checkCrashedAgents(deps('claude'))
    expect(await checkCrashedAgents(d)).toEqual([{ agent: 'acme-ops', did: 'failed' }])
    expect(d.notify).toHaveBeenCalledOnce()
    expect(d.restart).not.toHaveBeenCalled()
    expect(await checkCrashedAgents(d)).toEqual([]) // stays down
    await checkCrashedAgents(deps('claude'))
    expect(agents[0].crashFailedAt).toBeUndefined()
  })
})
