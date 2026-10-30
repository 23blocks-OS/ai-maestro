/**
 * Discovery must not multiply processes under load (incident 2026-10-29): tmux calls end, a burst
 * of discovery costs one tmux call, a slow tmux does not trigger one call per session, and
 * `docker ps` runs as argv with a timeout, shared by everyone who asks within a second.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }))
vi.mock('child_process', () => ({ execFile, execFileSync: vi.fn(), default: { execFile, execFileSync: vi.fn() } }))

const { tmux, TMUX_TIMEOUT_MS } = await import('@/lib/tmux-safe.mjs')
const { TmuxRuntime, LIST_CACHE_MS } = await import('@/lib/agent-runtime')

type Cb = (e: unknown, out?: { stdout: string; stderr: string }) => void
const ROWS = 'alpha\t1\t1700000000\t/repo/a\nbeta\t2\t1700000001\t/repo/b\n'
let tmuxCalls: string[][] = []
let reply: (args: string[], cb: Cb) => void

beforeEach(() => {
  tmuxCalls = []
  reply = (_args, cb) => setTimeout(() => cb(null, { stdout: ROWS, stderr: '' }), 5)
  execFile.mockReset().mockImplementation((cmd: string, args: string[], _opts: unknown, cb: Cb) => {
    if (cmd === 'tmux') tmuxCalls.push(args)
    reply(args, cb)
  })
})

describe('tmux()', () => {
  it('has a default timeout the caller can override', async () => {
    await tmux(['-V'])
    expect(execFile.mock.calls[0][2]).toMatchObject({ timeout: TMUX_TIMEOUT_MS })
    await tmux(['-V'], { timeout: 500 })
    expect(execFile.mock.calls[1][2]).toMatchObject({ timeout: 500 })
  })
})

describe('session discovery', () => {
  it('a burst of callers shares one tmux call', async () => {
    const rt = new TmuxRuntime()
    const lists = await Promise.all(Array.from({ length: 30 }, () => rt.listSessions()))
    expect(tmuxCalls).toHaveLength(1)
    expect(lists[29].map(s => s.name)).toEqual(['alpha', 'beta'])
  })

  it('reuses the list for a moment, then asks tmux again; callers cannot change the cached copy', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const rt = new TmuxRuntime()
    const first = await rt.listSessions()
    first[0].name = 'changed'
    expect((await rt.listSessions())[0].name).toBe('alpha')
    expect(tmuxCalls).toHaveLength(1)
    vi.setSystemTime(Date.now() + LIST_CACHE_MS + 1)
    await rt.listSessions()
    expect(tmuxCalls).toHaveLength(2)
    vi.useRealTimers()
  })

  it('creating, killing or renaming a session clears the cached list', async () => {
    const rt = new TmuxRuntime()
    await rt.listSessions()
    await rt.createSession('gamma', '/tmp')
    await rt.listSessions()
    await rt.killSession('gamma')
    await rt.listSessions()
    await rt.renameSession('alpha', 'delta')
    await rt.listSessions()
    expect(tmuxCalls.filter(a => a[0] === 'list-sessions')).toHaveLength(4)
  })

  it('a timed-out tmux answers with the last list, not one call per session', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const rt = new TmuxRuntime()
    await rt.listSessions()
    vi.setSystemTime(Date.now() + LIST_CACHE_MS + 1)
    reply = (_args, cb) => cb(Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' }))
    const list = await rt.listSessions()
    expect(list.map(s => s.name)).toEqual(['alpha', 'beta'])
    expect(tmuxCalls.filter(a => a[0] === 'display-message')).toHaveLength(0)
    expect(tmuxCalls).toHaveLength(2)
    vi.useRealTimers()
  })

  it('an old tmux without -F formats still gets the per-session fallback', async () => {
    reply = (args, cb) => {
      if (args[0] === 'list-sessions' && args[1] === '-F') return cb(new Error('unknown option -- F'))
      if (args[0] === 'list-sessions') return cb(null, { stdout: 'alpha: 1 windows (created Mon Oct 27 10:00:00 2026)\n', stderr: '' })
      cb(null, { stdout: '/repo/a\n', stderr: '' })
    }
    const list = await new TmuxRuntime().listSessions()
    expect(list).toMatchObject([{ name: 'alpha', workingDirectory: '/repo/a' }])
  })
})

describe('docker ps for agent containers', () => {
  it('runs as argv with a timeout, is shared for a second, and is empty when Docker fails', async () => {
    vi.doMock('@/lib/agent-registry', () => ({ loadAgents: () => [], getAgent: () => null, getAgentByName: () => null }))
    const { listAimContainers } = await import('@/services/sessions-service')
    ;(globalThis as any)._aimDockerPs = undefined
    reply = (_args, cb) => cb(null, { stdout: 'aim-x\tUp 2 minutes\t0.0.0.0:23001->23000/tcp\n', stderr: '' })
    const now = Date.now()
    const [a, b] = await Promise.all([listAimContainers(now), listAimContainers(now + 500)])
    expect(a).toContain('aim-x')
    expect(b).toBe(a)
    const dockerCalls = execFile.mock.calls.filter(c => c[0] === 'docker')
    expect(dockerCalls).toHaveLength(1)
    expect(dockerCalls[0][1]).toEqual(['ps', '--filter', 'name=aim-', '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}'])
    expect(dockerCalls[0][2]).toMatchObject({ timeout: 5000 })
    reply = (_args, cb) => cb(Object.assign(new Error('Cannot connect to the Docker daemon'), { killed: false }))
    expect(await listAimContainers(now + 2000)).toBe('')
  })
})
