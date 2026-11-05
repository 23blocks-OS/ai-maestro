/**
 * Doctor checks (F069, docs/SPEC-DOCTOR.md section 4). Every file lives in a temporary home; tmux,
 * teams, schedules, runtimes and transcripts are stubbed. No real tmux session is created: one would
 * be registered as an orphan agent within seconds.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { makeAgent } from './test-utils/fixtures'

const m = vi.hoisted(() => ({
  tmux: vi.fn(),
  teams: [] as { agentIds: string[] }[],
  schedules: {} as Record<string, unknown[]>,
  running: new Set<string>(),
  outside: new Set<string>(),
  transcripts: new Set<string>(),
}))

vi.mock('@/lib/tmux-safe.mjs', () => ({ tmux: m.tmux }))
vi.mock('@/lib/hosts-config', () => ({ isSelf: (id: string) => id === 'self' }))
vi.mock('@/lib/team-registry', () => ({ loadTeams: () => m.teams }))
vi.mock('@/lib/schedule-registry', () => ({ listSchedulesByAgent: (id: string) => m.schedules[id] || [] }))
vi.mock('@/lib/agent-runtime-kind.mjs', () => ({
  runtimeOf: (a: { id: string }) => (m.running.has(a.id) ? 'streaming' : null),
  runningOutsideTmux: (a: { id: string }) => m.outside.has(a.id),
}))
vi.mock('@/lib/chat-transcript.mjs', () => ({ resolveJsonlPathForDir: (d: string) => (m.transcripts.has(d) ? { path: 'x.jsonl' } : null) }))
vi.mock('@/lib/agent-registry', () => ({
  // The real rule: exact folder, other agents only, not deleted
  folderOwner: (dir: string, exceptId: string, agents: any[]) =>
    agents.find(a => a.id !== exceptId && !a.deletedAt && a.workingDirectory && path.resolve(a.workingDirectory) === path.resolve(dir)) || null,
}))

const d = await import('@/services/doctor-checks')

const NOW = Date.parse('2026-11-03T12:00:00Z')
const OLD = '2026-11-01T00:00:00.000Z'
let home: string

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-'))
  m.tmux.mockReset()
  m.teams = []
  m.schedules = {}
  m.running.clear(); m.outside.clear(); m.transcripts.clear()
})
afterEach(() => fs.rmSync(home, { recursive: true, force: true }))

const write = (file: string, body: string | object) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body))
}

const ghost = (extra: Record<string, unknown> = {}) => makeAgent({
  name: 'zz-canary',
  hostId: 'self',
  workingDirectory: undefined,
  taskDescription: 'Auto-registered from orphan tmux session',
  createdAt: OLD,
  lastActive: OLD,
  metadata: { autoRegistered: true, autoRegisteredAt: OLD },
  ...extra,
} as any)

const ghosts = (agents: any[], tmuxNames: string[] = []) =>
  d.checkGhostAgents(agents, home, tmuxNames, NOW).items?.map(i => i.agentName) ?? []

describe('ghost-agents: every condition must hold (spec 4.5)', () => {
  it('flags an untouched, idle, auto-registered agent and offers the delete fix', () => {
    const r = d.checkGhostAgents([ghost()], home, [], NOW)
    expect(r.status).toBe('warn')
    expect(r.items?.[0]).toMatchObject({ agentName: 'zz-canary', fix: { id: 'delete-ghost-agent', destructive: true } })
  })

  const savedBy: [string, () => { agent: any; tmux?: string[]; setup?: () => void }][] = [
    ['1 created through AI Maestro', () => ({ agent: ghost({ metadata: {} }) })],
    ['2 on another host', () => ({ agent: ghost({ hostId: 'mac-mini' }) })],
    ['2 deleted', () => ({ agent: ghost({ deletedAt: OLD }) })],
    ['2 a docker agent', () => ({ agent: ghost({ runtime: 'docker' }) })],
    ['2 a cloud agent', () => ({ agent: ghost({ deployment: { type: 'cloud' } }) })],
    ['3 had a Claude session', () => ({ agent: ghost({ claudeSessionId: 'abc' }) })],
    ['4 has a label', () => ({ agent: ghost({ label: 'Gaius' }) })],
    ['4 has an avatar', () => ({ agent: ghost({ avatar: '🤖' }) })],
    ['4 was described', () => ({ agent: ghost({ taskDescription: 'Runs the scheduler' }) })],
    ['5 is in a team', () => { const agent = ghost(); return { agent, setup: () => { m.teams = [{ agentIds: [agent.id] }] } } }],
    ['6 has inbox mail', () => { const agent = ghost(); return { agent, setup: () => write(path.join(home, '.agent-messaging/agents', agent.id, 'messages/inbox/m1.json'), {}) } }],
    ['6 has sent mail', () => { const agent = ghost(); return { agent, setup: () => write(path.join(home, '.agent-messaging/agents', agent.id, 'messages/sent/m1.json'), {}) } }],
    ['7 has its own schedule task', () => { const agent = ghost(); return { agent, setup: () => write(path.join(home, '.aimaestro/agents', agent.id, 'schedule.json'), { tasks: [{ id: 'memory-index' }, { id: 'nightly-report' }] }) } }],
    ['7 has a registry schedule', () => { const agent = ghost(); return { agent, setup: () => { m.schedules[agent.id] = [{}] } } }],
    ['7 has a canvas page', () => { const agent = ghost(); return { agent, setup: () => write(path.join(home, '.aimaestro/agents', agent.id, 'canvas/report.html'), '<p>') } }],
    ['8 has transcripts in its own folder', () => { const agent = ghost({ workingDirectory: '/w/own' }); return { agent, setup: () => m.transcripts.add('/w/own') } }],
    ['9 has a tmux session (with an index suffix)', () => ({ agent: ghost(), tmux: ['zz-canary_1'] })],
    ['10 is streaming or outside tmux', () => { const agent = ghost(); return { agent, setup: () => m.running.add(agent.id) } }],
    ['11 was registered recently', () => ({ agent: ghost({ metadata: { autoRegistered: true, autoRegisteredAt: '2026-11-03T11:00:00Z' } }) })],
    ['11 has a recent session', () => ({ agent: ghost({ sessions: [{ index: 0, status: 'offline', lastActive: '2026-11-03T10:00:00Z' }] }) })],
    ['11 has no date at all', () => ({ agent: ghost({ lastActive: 'never', metadata: { autoRegistered: true } }) })],
  ]
  it.each(savedBy)('is not a ghost when it %s', (_why, make) => {
    const { agent, tmux = [], setup } = make()
    setup?.()
    expect(ghosts([agent], tmux)).toEqual([])
  })

  it('built-in schedule tasks alone do not save it', () => {
    const agent = ghost()
    write(path.join(home, '.aimaestro/agents', agent.id, 'schedule.json'), { tasks: [{ id: 'memory-index' }, { id: 'memory-consolidate' }] })
    expect(ghosts([agent])).toEqual(['zz-canary'])
  })

  it('an old tmux session registered a minute ago is not a ghost: createdAt is the session\'s, not the agent\'s', () => {
    const agent = ghost({ createdAt: '2026-10-01T00:00:00Z', lastActive: '2026-10-01T00:00:00Z', metadata: { autoRegistered: true, autoRegisteredAt: '2026-11-03T11:59:00Z' } })
    expect(ghosts([agent])).toEqual([])
  })

  it('transcripts in a shared folder count neither way', () => {
    const agent = ghost({ workingDirectory: '/w/shared' })
    const owner = makeAgent({ name: 'owner', hostId: 'self', workingDirectory: '/w/shared' })
    m.transcripts.add('/w/shared')
    expect(ghosts([agent, owner])).toEqual(['zz-canary'])
  })

  it('skips the whole check when tmux cannot be listed', () => {
    const r = d.checkGhostAgents([ghost()], home, null, NOW)
    expect(r).toMatchObject({ status: 'warn', message: expect.stringMatching(/Could not list tmux/) })
    expect(r.items).toBeUndefined()
  })
})

describe('liveTmuxNames', () => {
  it('reads session names', async () => {
    m.tmux.mockResolvedValue({ stdout: 'a\nb_1\n' })
    expect(await d.liveTmuxNames()).toEqual(['a', 'b_1'])
    expect(m.tmux.mock.calls[0][0]).toEqual(['list-sessions', '-F', '#{session_name}'])
  })
  it('"no server running" means no sessions', async () => {
    m.tmux.mockRejectedValue(Object.assign(new Error('exit 1'), { stderr: 'no server running on /tmp/tmux-501/default' }))
    expect(await d.liveTmuxNames()).toEqual([])
  })
  it('any other failure, or a timeout, is unknown, never empty', async () => {
    m.tmux.mockRejectedValue(Object.assign(new Error('spawn EAGAIN'), { stderr: '' }))
    expect(await d.liveTmuxNames()).toBeNull()
    m.tmux.mockRejectedValue(Object.assign(new Error('no server running'), { killed: true }))
    expect(await d.liveTmuxNames()).toBeNull()
  })
})

describe('agent-folders', () => {
  it('warns about a folder that does not exist, on this host only', () => {
    const missing = makeAgent({ name: 'gone', hostId: 'self', workingDirectory: path.join(home, 'nope') })
    const present = makeAgent({ name: 'here', hostId: 'self', workingDirectory: home })
    const remote = makeAgent({ name: 'far', hostId: 'mac-mini', workingDirectory: '/nope' })
    const r = d.checkAgentFolders([missing, present, remote])
    expect(r.status).toBe('warn')
    expect(r.items?.map(i => i.agentName)).toEqual(['gone'])
  })
})

describe('name-hints', () => {
  const hint = (dir: string, name: string) => write(path.join(dir, '.claude/settings.local.json'), { env: { CLAUDE_AGENT_NAME: name }, other: 1 })

  it('finds a parent folder\'s hint inherited by a nested agent', () => {
    const parent = path.join(home, 'repo')
    hint(parent, 'parent-agent')
    const nested = makeAgent({ name: 'nested', hostId: 'self', workingDirectory: path.join(parent, 'sub') })
    const p = makeAgent({ name: 'parent-agent', hostId: 'self', workingDirectory: parent })
    const r = d.checkNameHints([nested, p])
    expect(r.items).toHaveLength(1)
    expect(r.items?.[0]).toMatchObject({ agentName: 'nested', message: expect.stringMatching(/^Inherits a name hint .*"parent-agent"/) })
  })

  it('a matching hint, or none, is fine; a hint for no agent says so', () => {
    const a = makeAgent({ name: 'Alpha', hostId: 'self', workingDirectory: path.join(home, 'a') })
    const b = makeAgent({ name: 'beta', hostId: 'self', workingDirectory: path.join(home, 'b') })
    const c = makeAgent({ name: 'gamma', hostId: 'self', workingDirectory: path.join(home, 'c') })
    hint(path.join(home, 'a'), 'alpha')
    hint(path.join(home, 'c'), 'deleted-one')
    const r = d.checkNameHints([a, b, c])
    expect(r.items?.map(i => i.agentName)).toEqual(['gamma'])
    expect(r.items?.[0].message).toMatch(/Its name hint .*which is not an agent/)
  })

  it('AIM_AGENT_NAME counts too', () => {
    write(path.join(home, 'x/.claude/settings.local.json'), { env: { AIM_AGENT_NAME: 'other' } })
    expect(d.findNameHint(path.join(home, 'x'))?.name).toBe('other')
  })
})

describe('amp-mailboxes', () => {
  it('warns about a missing mailbox and an address for another name', () => {
    const a = makeAgent({ name: 'alpha', hostId: 'self', ampRegistered: true, metadata: { amp: { address: 'alpha@org.aimaestro.local' } } })
    const b = makeAgent({ name: 'beta', hostId: 'self', ampRegistered: true, metadata: { amp: { address: 'bravo@org.aimaestro.local' } } })
    fs.mkdirSync(path.join(home, '.agent-messaging/agents', b.id), { recursive: true })
    const r = d.checkAmpMailboxes([a, b, makeAgent({ name: 'no-amp', hostId: 'self' })], home)
    expect(r.items?.map(i => i.key)).toEqual([`${a.id}:dir`, `${b.id}:address`])
  })
})

describe('outside-agents', () => {
  it('lists them as information, never a problem', () => {
    const a = makeAgent({ name: 'salesland', hostId: 'self' })
    m.outside.add(a.id)
    const r = d.checkOutsideAgents([a], [])
    expect(r).toMatchObject({ status: 'pass', items: [{ agentName: 'salesland', status: 'pass' }] })
    expect(r.items?.[0].fix).toBeUndefined()
  })
  it('an agent with a live tmux session is not outside, whatever its hook state says', () => {
    const a = makeAgent({ name: 'in-tmux', hostId: 'self' })
    m.outside.add(a.id)
    expect(d.checkOutsideAgents([a], ['in-tmux']).items).toBeUndefined()
    expect(d.checkOutsideAgents([a], null).items).toBeUndefined()
  })
})

describe('deleted-agent-backups', () => {
  it('lists only real backup folders of agents that are gone or deleted', () => {
    const dir = path.join(home, 'backups')
    const live = makeAgent({ id: 'live-1' })
    const deleted = makeAgent({ id: 'del-2', deletedAt: OLD })
    for (const n of ['live-1-2026-11-01T00-00-00-000Z', 'del-2-2026-11-01T00-00-00-000Z', 'gone-3-2026-10-01T00-00-00-000Z', 'not-a-backup']) fs.mkdirSync(path.join(dir, n), { recursive: true })
    fs.writeFileSync(path.join(dir, 'file-4-2026-11-01T00-00-00-000Z'), '')
    fs.symlinkSync(path.join(dir, 'not-a-backup'), path.join(dir, 'link-5-2026-11-01T00-00-00-000Z'))
    expect(d.listDeletedAgentBackups([live, deleted], dir).map(b => b.agentId)).toEqual(['gone-3', 'del-2'])
  })

  it('passes under 1 GB and offers the remove-all fix on the summary item', async () => {
    const dir = path.join(home, 'backups')
    write(path.join(dir, 'gone-3-2026-10-01T00-00-00-000Z/registry-entry.json'), { name: 'old-agent' })
    const r = await d.checkDeletedAgentBackups([], dir)
    expect(r.status).toBe('pass')
    expect(r.items?.[0]).toMatchObject({ key: '*', fix: { id: 'remove-deleted-agent-backups' } })
    expect(r.items?.[1].message).toMatch(/^old-agent, deleted 2026-10-01/)
  })
})

describe('claude-hook', () => {
  const repo = () => path.join(home, 'repo')
  const ourHook = () => path.join(repo(), 'scripts/claude-hooks/ai-maestro-hook.cjs')
  const settings = (events: string[], file = ourHook()) => write(path.join(home, '.claude/settings.json'), {
    hooks: Object.fromEntries(events.map(e => [e, [{ hooks: [{ type: 'command', command: `node ${file}` }] }]])),
  })
  beforeEach(() => write(ourHook(), '// hook'))

  it('fails with no hook at all', () => {
    expect(d.checkClaudeHook(home, repo()).status).toBe('fail')
  })
  it('passes with every event pointing at this install', () => {
    settings(d.HOOK_EVENTS)
    expect(d.checkClaudeHook(home, repo())).toMatchObject({ status: 'pass' })
  })
  it('warns about a missing event; PermissionRequest is optional', () => {
    settings(d.HOOK_EVENTS.filter(e => e !== 'SessionEnd'))
    expect(d.checkClaudeHook(home, repo()).items?.map(i => i.key)).toEqual(['event:SessionEnd'])
  })
  it('fails when the hook file does not exist (a moved checkout)', () => {
    settings(d.HOOK_EVENTS, '/Volumes/RnD/old/scripts/claude-hooks/ai-maestro-hook.cjs')
    expect(d.checkClaudeHook(home, repo())).toMatchObject({ status: 'fail' })
  })
})

describe('amp-scripts', () => {
  it('warns about a missing and a drifted script, ignores extras', () => {
    const src = path.join(home, 'repo/plugin/plugins/ai-maestro/scripts')
    write(path.join(src, 'amp-send.sh'), 'v2')
    write(path.join(src, 'amp-read.sh'), 'same')
    write(path.join(src, 'amp-inbox.sh'), 'x')
    write(path.join(home, '.local/bin/amp-send.sh'), 'v1')
    write(path.join(home, '.local/bin/amp-read.sh'), 'same')
    write(path.join(home, '.local/bin/amp-extra.sh'), 'mine')
    const r = d.checkAmpScripts(home, path.join(home, 'repo'))
    expect(r.items?.map(i => i.key).sort()).toEqual(['amp-inbox.sh', 'amp-send.sh'])
  })
})

describe('app-version: the running version, and a pending restart', () => {
  it('passes when the files match what runs', () => {
    expect(d.checkAppVersion('0.106.70', '0.106.70')).toMatchObject({ status: 'pass', message: 'AI Maestro 0.106.70' })
  })
  it('warns when a deploy changed the files but the server was not restarted', () => {
    const c = d.checkAppVersion('0.106.69', '0.106.70')
    expect(c.status).toBe('warn')
    expect(c.message).toBe('AI Maestro 0.106.69 is running; the files on disk are 0.106.70')
    expect(c.hint).toContain('Restart')
  })
  it('reports the version the process started with, not the one on disk', () => {
    const before = process.env.AIM_RUNNING_VERSION
    process.env.AIM_RUNNING_VERSION = '0.0.1'
    try { expect(d.runningAppVersion('/nowhere')).toBe('0.0.1') } finally {
      if (before === undefined) delete process.env.AIM_RUNNING_VERSION; else process.env.AIM_RUNNING_VERSION = before
    }
    expect(d.checkAppVersion('unknown').status).toBe('warn')
  })
})
