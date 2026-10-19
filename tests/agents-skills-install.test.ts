import { describe, it, expect, vi, beforeEach } from 'vitest'

const { addMarketplaceSkills, execFile } = vi.hoisted(() => ({ addMarketplaceSkills: vi.fn(() => ({})), execFile: vi.fn() }))

vi.mock('@/lib/agent-registry', () => ({
  getAgentSkills: vi.fn(), addMarketplaceSkills, removeMarketplaceSkills: vi.fn(), addCustomSkill: vi.fn(),
  removeCustomSkill: vi.fn(), updateAiMaestroSkills: vi.fn(),
  getAgent: (id: string) => (id === 'a1' ? { id: 'a1', sessions: [{ workingDirectory: '/tmp/agent-a1' }] } : null),
}))
vi.mock('@/lib/marketplace-skills', () => ({
  getSkillById: vi.fn(),
  getAllMarketplaceSkills: async () => ({
    skills: [
      { id: 'pony:pony:one', name: 'one', plugin: 'pony', marketplace: 'pony', version: '1' },
      { id: 'pony:pony:two', name: 'two', plugin: 'pony', marketplace: 'pony', version: '1' },
    ],
  }),
}))
vi.mock('@/lib/memory/summarizer', () => ({ resolveClaudeBinary: () => '/usr/local/bin/claude' }))
vi.mock('@/lib/memory/backlog', () => ({ readBacklog: vi.fn() }))
vi.mock('@/lib/agent', () => ({ agentRegistry: {} }))
vi.mock('@/services/agent-guard', () => ({ unknownAgentResult: vi.fn() }))
vi.mock('child_process', () => ({ execFile: (...a: unknown[]) => execFile(...a), default: { execFile: (...a: unknown[]) => execFile(...a) } }))

import { installAgentPlugins } from '@/services/agents-skills-service'

describe('installAgentPlugins', () => {
  beforeEach(() => {
    addMarketplaceSkills.mockClear()
    execFile.mockReset()
    execFile.mockImplementation((_c: string, _a: string[], _o: unknown, cb: (e: Error | null, so: string, se: string) => void) => cb(null, 'ok', ''))
  })

  it('unknown agent is not found', async () => {
    expect((await installAgentPlugins('nope', { plugins: ['pony@pony'] })).status).toBe(404)
  })
  it('needs plugins', async () => {
    expect((await installAgentPlugins('a1', {})).status).toBe(400)
  })
  it.each(['pony', 'pony@pony;rm -rf /', '--scope@x', '$(id)@x'])('rejects %s without running anything', async ref => {
    const r = await installAgentPlugins('a1', { plugins: [ref] })
    expect(r.status).toBe(400)
    expect(execFile).not.toHaveBeenCalled()
  })
  it('installs at project scope in the agent folder, with argv, and records the skills', async () => {
    const r = await installAgentPlugins('a1', { plugins: ['pony@pony'] })
    expect(r.data?.results).toEqual([{ plugin: 'pony@pony', installed: true, recorded: 2 }])
    const [bin, args, opts] = execFile.mock.calls[0]
    expect(bin).toBe('/usr/local/bin/claude')
    expect(args).toEqual(['plugin', 'install', 'pony@pony', '--scope', 'project'])
    expect((opts as { cwd: string }).cwd).toBe('/tmp/agent-a1')
    expect(addMarketplaceSkills).toHaveBeenCalledOnce()
  })
  it('a plugin that is in no registered marketplace is reported, not run', async () => {
    const r = await installAgentPlugins('a1', { plugins: ['ghost@nowhere'] })
    expect(r.data?.results[0]).toMatchObject({ installed: false, recorded: 0 })
    expect(execFile).not.toHaveBeenCalled()
  })
  it('reports a failed install and still records nothing extra', async () => {
    execFile.mockImplementation((_c: string, _a: string[], _o: unknown, cb: (e: Error | null, so: string, se: string) => void) => cb(new Error('x'), '', 'boom'))
    const r = await installAgentPlugins('a1', { plugins: ['pony@pony'] })
    expect(r.data?.results[0]).toMatchObject({ installed: false, error: 'boom' })
  })
})
