/** F071: the Doctor checks the programs this host's agents run, as their tmux shell finds them. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('@/lib/hosts-config', () => ({ isSelf: (id: string) => id === 'self', getHosts: () => [], getSelfHostId: () => 'self' }))
vi.mock('@/lib/agent-registry', () => ({ loadAgents: () => [], folderOwner: () => null }))
vi.mock('@/lib/team-registry', () => ({ loadTeams: () => [] }))
vi.mock('@/lib/schedule-registry', () => ({ listSchedulesByAgent: () => [] }))
vi.mock('@/lib/agent-runtime-kind.mjs', () => ({ runtimeOf: () => null, runningOutsideTmux: () => false }))
vi.mock('@/lib/chat-transcript.mjs', () => ({ resolveJsonlPathForDir: () => null }))

const { checkAgentPrograms } = await import('@/services/doctor-checks')

const agent = (name: string, program: string) => ({ id: name, name, program, hostId: 'self' } as any)
// A fake machine: which copies the shell finds, and what each answers to --version
const probe = (copies: Record<string, string[] | null>, versions: Record<string, string | 'hang'>) => ({
  copies: async (cmd: string) => (cmd in copies ? copies[cmd] : []),
  version: async (bin: string) => versions[bin] === 'hang' ? { text: null, hung: true } : { text: versions[bin] ?? null, hung: false },
})

let home: string
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'programs-')) })
afterEach(() => fs.rmSync(home, { recursive: true, force: true }))
const withHook = () => {
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ hooks: { PermissionRequest: [{ hooks: [{ command: 'node /x/ai-maestro-hook.cjs' }] }] } }))
}

describe('agent-programs', () => {
  it('passes and lists each program with its version', async () => {
    withHook()
    const r = await checkAgentPrograms([agent('a', 'claude-code'), agent('b', 'codex')], home,
      probe({ claude: ['/h/.local/bin/claude'], codex: ['/n/codex'] }, { '/h/.local/bin/claude': '2.1.316 (Claude Code)', '/n/codex': 'codex-cli 0.153.4' }))
    expect(r.status).toBe('pass')
    expect(r.message).toBe('claude 2.1.316, codex 0.153.4')
    expect((r.details as any).programs).toEqual([
      { name: 'claude', path: '/h/.local/bin/claude', version: '2.1.316' },
      { name: 'codex', path: '/n/codex', version: '0.153.4' },
    ])
  })

  it('fails for a program an agent runs that is not installed, naming the agents', async () => {
    withHook()
    const r = await checkAgentPrograms([agent('pi-agent', 'pi')], home, probe({ claude: ['/c'] }, { '/c': '2.1.316' }))
    expect(r.items).toEqual([expect.objectContaining({ key: 'program:pi', status: 'fail', message: 'pi is not installed (used by pi-agent)' })])
  })

  it('fails for a copy that hangs on --version (mac-mini, 2026-11-03)', async () => {
    const r = await checkAgentPrograms([], home, probe({ claude: ['/usr/local/bin/claude'] }, { '/usr/local/bin/claude': 'hang' }))
    expect(r.status).toBe('fail')
    expect(r.items![0].message).toMatch(/did not answer in 8 s/)
  })

  it('warns when an older copy runs before a newer one', async () => {
    withHook()
    const r = await checkAgentPrograms([], home, probe({ claude: ['/usr/local/bin/claude', '/h/.local/bin/claude'] }, { '/usr/local/bin/claude': '2.0.33', '/h/.local/bin/claude': '2.1.316' }))
    expect(r.items).toEqual([expect.objectContaining({ key: 'program:claude:order', status: 'warn', message: '/usr/local/bin/claude (2.0.33) runs before /h/.local/bin/claude (2.1.316)' })])
  })

  it('warns when Claude Code supports the PermissionRequest hook and it is not registered', async () => {
    const r = await checkAgentPrograms([], home, probe({ claude: ['/c'] }, { '/c': '2.1.316' }))
    expect(r.items?.map(i => i.key)).toEqual(['program:claude:permission-hook'])
    const old = await checkAgentPrograms([], home, probe({ claude: ['/c'] }, { '/c': '2.0.44' }))
    expect(old.items).toBeUndefined()
  })

  it('says nothing about a program nobody uses, and warns when the shell cannot be asked', async () => {
    expect((await checkAgentPrograms([], home, probe({}, {}))).status).toBe('pass')
    const r = await checkAgentPrograms([], home, probe({ claude: null }, {}))
    expect(r.items![0]).toMatchObject({ status: 'warn', message: expect.stringMatching(/Could not ask/) })
  })

  it('ignores agents on other hosts', async () => {
    const r = await checkAgentPrograms([{ ...agent('remote', 'pi'), hostId: 'mac-mini' }], home, probe({ claude: ['/c'] }, { '/c': '2.0.1' }))
    expect(r.items).toBeUndefined()
  })
})
