/**
 * The diagnostics loop of 2026-10-29: each host's /api/diagnostics fetched every peer's
 * /api/diagnostics, which fetched its peers' (including the caller), without end. Next 14 cached
 * the GET so it stayed dormant; Next 15 ran it live and three hosts piled up tmux and df processes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { tmux, execFile } = vi.hoisted(() => ({
  tmux: vi.fn(),
  execFile: vi.fn(),
}))

vi.mock('@/lib/tmux-safe.mjs', () => ({ tmux }))
vi.mock('child_process', () => ({ execFile, exec: execFile, default: { execFile, exec: execFile } }))
vi.mock('@/lib/hosts-config', () => ({
  getHosts: () => [
    { id: 'self', name: 'self', url: 'http://self:23000', enabled: true },
    { id: 'mac-mini', name: 'mac-mini', url: 'http://mac-mini:23000', enabled: true },
    { id: 'mini-lola', name: 'mini-lola', url: 'http://mini-lola:23000', enabled: true },
    { id: 'off', name: 'off', url: 'http://off:23000', enabled: false },
  ],
  isSelf: (id: string) => id === 'self',
}))
vi.mock('@/lib/agent-registry', () => ({ loadAgents: () => [] }))
vi.mock('@/lib/channel-bridge.mjs', () => ({ hasChannel: () => false, isChannelVerified: () => false }))
vi.mock('@/lib/amp-keys', () => ({ loadKeyPair: () => null }))
vi.mock('@/lib/amp-did', () => ({ deriveDidKey: () => '' }))

const { runDiagnostics, REPORT_CACHE_MS } = await import('@/services/diagnostics-service')
type Report = import('@/services/diagnostics-service').DiagnosticReport

const DF = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s5 971350180 700000000 171966464 81% /System/Volumes/Data\n'

beforeEach(() => {
  ;(globalThis as any)._diagRun = undefined
  ;(globalThis as any)._diagAt = undefined
  tmux.mockReset().mockResolvedValue({ stdout: 'tmux 3.5a\n' })
  // promisify(execFile) resolves with { stdout, stderr } when the callback gets (err, stdout, stderr)
  execFile.mockReset().mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (e: unknown, out: { stdout: string; stderr: string }) => void) => cb(null, { stdout: DF, stderr: '' }))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'healthy' }) }))
})
afterEach(() => vi.unstubAllGlobals())

const report = async () => (await runDiagnostics()).data as Report

describe('diagnostics never calls a peer\'s diagnostics', () => {
  it('asks each enabled peer for its health only', async () => {
    await report()
    const urls = (fetch as any).mock.calls.map((c: unknown[]) => c[0])
    expect(urls.sort()).toEqual(['http://mac-mini:23000/api/v1/health', 'http://mini-lola:23000/api/v1/health'])
    expect(urls.some((u: string) => u.includes('/api/diagnostics'))).toBe(false)
  })

  it('a peer that is down is a failed check, not a retry through another endpoint', async () => {
    ;(fetch as any).mockRejectedValue(new Error('connect ETIMEDOUT'))
    const r = await report()
    expect(r.checks.filter(c => c.name.startsWith('host:')).every(c => c.status === 'fail')).toBe(true)
    expect((fetch as any).mock.calls).toHaveLength(2)
  })
})

describe('a burst of requests costs one run', () => {
  it('concurrent callers share the run in progress', async () => {
    await Promise.all(Array.from({ length: 50 }, () => runDiagnostics()))
    expect(tmux).toHaveBeenCalledTimes(1)
    expect(execFile).toHaveBeenCalledTimes(1)
  })

  it('a finished report is reused for a minute, then run again', async () => {
    await runDiagnostics()
    await runDiagnostics(Date.now() + REPORT_CACHE_MS - 1000)
    expect(tmux).toHaveBeenCalledTimes(1)
    await runDiagnostics(Date.now() + REPORT_CACHE_MS + 1000)
    expect(tmux).toHaveBeenCalledTimes(2)
  })
})

describe('disk space', () => {
  it('runs df with argv, no shell, and reads the free column', async () => {
    const r = await report()
    expect(execFile.mock.calls[0][0]).toBe('df')
    expect(execFile.mock.calls[0][1]).toEqual(['-k', expect.stringMatching(/\.aimaestro$/)])
    expect(r.checks.find(c => c.name === 'disk-space')).toMatchObject({ status: 'pass', details: { availableKB: 171966464 } })
  })
})
