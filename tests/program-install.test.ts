import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/hosts-config', () => ({
  getHosts: () => [{ id: 'old', name: 'Old Host', url: 'http://old.test:23000' }],
  isSelf: (u: string) => u === 'http://self.test:23000',
}))

import { startInstall, getInstallJob, resetInstallJob, programInstallRequest, type InstallDeps } from '@/services/program-install-service'

// F072 phase 2: the Install button runs a closed list of installers, one at a time, never sudo.
const calls: Array<{ file: string; args: string[]; path?: string }> = []

function deps(over: Partial<InstallDeps> = {}): InstallDeps {
  return {
    agentPath: async () => '/home/u/.local/bin:/opt/node/bin',
    isExecutable: (f) => f === '/opt/node/bin/npm',
    run: async (file, args, env) => { calls.push({ file, args, path: env.PATH }); return { ok: true, output: 'added 3 packages' } },
    recheck: async () => true,
    ...over,
  }
}

beforeEach(() => { resetInstallJob(); calls.length = 0 })

describe('startInstall', () => {
  it('runs npm install -g with the tool\'s package, as argv, with the npm an agent\'s shell finds', async () => {
    const r = await startInstall({ tool: 'codex' }, deps())
    expect(r.status).toBe(202)
    expect(r.data!.job).toMatchObject({ tool: 'codex', state: 'running', command: 'npm install -g @openai/codex' })
    await r.data!.wait
    expect(calls).toEqual([{ file: '/opt/node/bin/npm', args: ['install', '-g', '@openai/codex'], path: '/home/u/.local/bin:/opt/node/bin' }])
    expect(getInstallJob().data!.job).toMatchObject({ state: 'done', message: 'codex is installed.' })
  })

  it('refuses a tool with no verified package, an unknown tool and anything that is not an id', async () => {
    for (const tool of ['grok', 'nope', '@openai/codex', 'codex; rm -rf ~', undefined, { id: 'codex' }]) {
      expect((await startInstall({ tool }, deps())).status, String(tool)).toBe(400)
    }
    expect(calls).toEqual([])
  })

  it('one install at a time', async () => {
    let finish!: () => void
    const slow = deps({ run: () => new Promise(r => { finish = () => r({ ok: true, output: '' }) }) })
    const first = await startInstall({ tool: 'codex' }, slow)
    const second = await startInstall({ tool: 'gemini' }, slow)
    expect(second.status).toBe(409)
    finish()
    await first.data!.wait
    expect((await startInstall({ tool: 'gemini' }, deps())).status).toBe(202)
  })

  it('two requests at once while the login shell is still starting: only one runs', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const slowShell = deps({ agentPath: async () => { await gate; return '/opt/node/bin' } })
    const a = startInstall({ tool: 'codex' }, slowShell)
    const b = startInstall({ tool: 'gemini' }, slowShell)
    release()
    const [ra, rb] = await Promise.all([a, b])
    expect([ra.status, rb.status].sort()).toEqual([202, 409])
    await (ra.data as any).wait
    expect(calls).toHaveLength(1)
  })

  it('no npm: the earlier job is kept, not replaced', async () => {
    await (await startInstall({ tool: 'codex' }, deps())).data!.wait
    await startInstall({ tool: 'gemini' }, deps({ isExecutable: () => false }))
    expect(getInstallJob().data!.job).toMatchObject({ tool: 'codex', state: 'done' })
  })

  it('no npm on the PATH: says so and runs nothing', async () => {
    const r = await startInstall({ tool: 'codex' }, deps({ isExecutable: () => false }))
    expect(r.status).toBe(409)
    expect((r.data as any).message).toContain('npm is not installed')
    expect(getInstallJob().data!.job).toBeNull()
  })

  it('a permission error fails with the command to run in a terminal; it never runs sudo', async () => {
    const r = await startInstall({ tool: 'gemini' }, deps({ run: async (file, args) => { calls.push({ file, args }); return { ok: false, output: 'npm ERR! code EACCES\nnpm ERR! path /usr/lib/node_modules' } } }))
    await r.data!.wait
    const job = getInstallJob().data!.job!
    expect(job.state).toBe('failed')
    expect(job.message).toContain('sudo npm install -g @google/gemini-cli')
    expect(job.output).toContain('EACCES')
    expect(calls.every(c => !c.file.includes('sudo') && !c.args.includes('sudo'))).toBe(true)
  })

  it('npm succeeded but the program is still not found: failed, and says why', async () => {
    const r = await startInstall({ tool: 'codex' }, deps({ recheck: async () => false }))
    await r.data!.wait
    expect(getInstallJob().data!.job).toMatchObject({ state: 'failed', message: expect.stringContaining('still does not find codex') })
  })

  it('a timeout is reported as one', async () => {
    const r = await startInstall({ tool: 'codex' }, deps({ run: async () => ({ ok: false, output: '', timedOut: true }) }))
    await r.data!.wait
    expect(getInstallJob().data!.job!.message).toContain('did not finish')
  })
})

describe('programInstallRequest for another host', () => {
  it('refuses an address that is not a configured host', async () => {
    expect((await programInstallRequest('POST', 'http://evil.test', { tool: 'codex' })).status).toBe(400)
  })

  it('a host too old for this answers with a page: says to update it, not "unreachable"', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>404</html>', { status: 404 }))
    try {
      const r = await programInstallRequest('POST', 'http://old.test:23000/', { tool: 'codex' })
      expect(r.status).toBe(501)
      expect(r.data.message).toBe('Old Host cannot install programs yet. Update AI Maestro there.')
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body))).toEqual({ tool: 'codex' })
    } finally { fetchMock.mockRestore() }
  })
})
