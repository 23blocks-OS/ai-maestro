import { describe, it, expect, vi, beforeEach } from 'vitest'

const hosts = vi.hoisted(() => ({
  getHosts: vi.fn((): any[] => []),
  isSelf: vi.fn((h: string) => h === 'self' || h === 'http://localhost:23000'),
}))
vi.mock('@/lib/hosts-config', () => ({ getHosts: hosts.getHosts, isSelf: hosts.isSelf }))

import { buildReadinessReport, findOnPath, toolReadinessRequest, type ReadinessDeps } from '@/services/tool-readiness-service'

/** A fake machine: which files are executable, and what each prints for --version. */
function machine(files: Record<string, { ok: boolean; output: string }>, searchPath = '/a/bin:/b/bin'): ReadinessDeps & { runs: string[] } {
  const runs: string[] = []
  return {
    runs,
    agentPath: async () => searchPath,
    isExecutable: (f) => f in files,
    run: async (file, args) => {
      runs.push(`${file} ${args.join(' ')}`)
      return files[file] ?? { ok: false, output: 'not found' }
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hosts.getHosts.mockReturnValue([])
})

describe('findOnPath', () => {
  it('returns the first match in PATH order, and nothing when absent', () => {
    const has = (f: string) => ['/a/bin/x', '/b/bin/x', '/b/bin/y'].includes(f)
    expect(findOnPath('x', '/a/bin:/b/bin', has)).toBe('/a/bin/x')
    expect(findOnPath('y', '/a/bin:/b/bin', has)).toBe('/b/bin/y')
    expect(findOnPath('z', '/a/bin:/b/bin', has)).toBeUndefined()
    expect(findOnPath('x', '::/b/bin', has)).toBe('/b/bin/x')
  })
})

describe('buildReadinessReport', () => {
  it('reports ready, missing and broken tools, using the agent shell\'s PATH', async () => {
    const m = machine({
      '/a/bin/node': { ok: true, output: 'v22.23.3' },
      '/a/bin/claude': { ok: true, output: '2.1.3 (Claude Code)' },
      '/b/bin/copilot': { ok: false, output: 'Error: cannot find module\n at x' },
      '/b/bin/pi': { ok: true, output: '0.4.1' },
    })
    const r = await buildReadinessReport(m)
    const by = (id: string) => r.tools.find((t) => t.id === id)!
    expect(r.node).toBe('v22.23.3')
    expect(by('claude')).toMatchObject({ state: 'ready', version: '2.1.3', path: '/a/bin/claude' })
    expect(by('copilot')).toMatchObject({ state: 'broken', problem: 'Error: cannot find module' })
    expect(by('pi')).toMatchObject({ state: 'ready', version: '0.4.1' })
    expect(by('grok')).toMatchObject({ state: 'missing' })
    expect(by('codex')).toMatchObject({ state: 'missing', install: 'npm install -g @openai/codex' })
  })

  it('Pi is broken when the shell\'s Node is too old, and when there is no Node at all', async () => {
    const old = await buildReadinessReport(machine({ '/a/bin/node': { ok: true, output: 'v20.19.4' }, '/a/bin/pi': { ok: true, output: '0.4.1' } }))
    expect(old.tools.find((t) => t.id === 'pi')).toMatchObject({ state: 'broken', problem: expect.stringContaining('v20.19.4') })
    const none = await buildReadinessReport(machine({ '/a/bin/pi': { ok: true, output: '0.4.1' } }))
    expect(none.node).toBeUndefined()
    expect(none.tools.find((t) => t.id === 'pi')).toMatchObject({ state: 'broken', problem: expect.stringContaining('no Node') })
  })

  it('only ever runs a tool with --version (a fixed argv)', async () => {
    const m = machine({ '/a/bin/node': { ok: true, output: 'v24.0.0' }, '/a/bin/claude': { ok: true, output: '1.0.0' }, '/a/bin/pi': { ok: true, output: '1.0.0' } })
    await buildReadinessReport(m)
    expect(m.runs.length).toBeGreaterThan(0)
    for (const r of m.runs) expect(r).toMatch(/^\/a\/bin\/\w+ --version$/)
  })

  it('checks every tool the wake dialog can offer', async () => {
    const r = await buildReadinessReport(machine({}))
    expect(r.tools.map((t) => t.id).sort()).toEqual(['claude', 'codex', 'copilot', 'gemini', 'grok', 'openclaw', 'opencode', 'pi'])
  })
})

describe('toolReadinessRequest: which host', () => {
  it('refuses a URL that is not a configured host (the server must not fetch arbitrary addresses)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    for (const url of ['http://169.254.169.254', 'http://evil.example:23000', 'file:///etc/passwd']) {
      const r = await toolReadinessRequest(url)
      expect(r.status, url).toBe(400)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('asks a configured host, and reports it unreachable when it is', async () => {
    hosts.getHosts.mockReturnValue([{ id: 'mini', name: 'mini', url: 'http://100.1.2.3:23000/' }])
    const ok = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ tools: [] }), { status: 200 }))
    const r = await toolReadinessRequest('http://100.1.2.3:23000')
    expect(r.status).toBe(200)
    expect(ok).toHaveBeenCalledWith('http://100.1.2.3:23000/api/tools/readiness', expect.anything())
    ok.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    expect((await toolReadinessRequest('http://100.1.2.3:23000')).status).toBe(502)
    ok.mockRestore()
  })
})
