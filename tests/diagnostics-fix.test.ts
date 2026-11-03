/**
 * POST /api/diagnostics/fix (docs/SPEC-DOCTOR.md section 6): a closed list of fixes, each checking its
 * finding again right before acting, so a stale report never deletes anything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { makeAgent } from './test-utils/fixtures'

const m = vi.hoisted(() => ({
  tmux: vi.fn(),
  agents: [] as any[],
  deleteAgentById: vi.fn(),
  backups: '',
}))

vi.mock('@/lib/tmux-safe.mjs', () => ({ tmux: m.tmux }))
vi.mock('@/lib/hosts-config', () => ({ isSelf: (id: string) => id === 'self', getHosts: () => [], getSelfHostId: () => 'self' }))
vi.mock('@/lib/agent-registry', () => ({ loadAgents: () => m.agents, folderOwner: () => null }))
vi.mock('@/lib/team-registry', () => ({ loadTeams: () => [] }))
vi.mock('@/lib/schedule-registry', () => ({ listSchedulesByAgent: () => [] }))
vi.mock('@/lib/agent-runtime-kind.mjs', () => ({ runtimeOf: () => null, runningOutsideTmux: () => false }))
vi.mock('@/lib/chat-transcript.mjs', () => ({ resolveJsonlPathForDir: () => null }))
vi.mock('@/lib/channel-bridge.mjs', () => ({ hasChannel: () => false, isChannelVerified: () => false }))
vi.mock('@/lib/amp-keys', () => ({ loadKeyPair: () => null }))
vi.mock('@/lib/amp-did', () => ({ deriveDidKey: () => '' }))
vi.mock('@/lib/agent-backup-retention', async (orig) => ({ ...(await orig<object>()), agentBackupsDir: () => m.backups }))
vi.mock('@/services/agents-core-service', () => ({ deleteAgentById: m.deleteAgentById }))

const { runDiagnosticFix } = await import('@/services/diagnostics-service')

const OLD = '2026-10-01T00:00:00.000Z'
const ghost = (extra = {}) => makeAgent({
  id: 'ghost-1', name: 'zz-canary', hostId: 'self', workingDirectory: undefined,
  taskDescription: 'Auto-registered from orphan tmux session', lastActive: OLD,
  metadata: { autoRegistered: true, autoRegisteredAt: OLD }, ...extra,
} as any)

let home: string
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-fix-'))
  m.backups = path.join(home, 'backups')
  m.agents = []
  m.tmux.mockReset().mockResolvedValue({ stdout: 'other-agent\n' })
  m.deleteAgentById.mockReset().mockResolvedValue({ data: { success: true, hard: true }, status: 200 })
})
afterEach(() => fs.rmSync(home, { recursive: true, force: true }))

describe('fix input', () => {
  it.each([
    [{ fix: 'rm -rf', check: 'ghost-agents', key: 'x' }, /Unknown fix/],
    [{ fix: 'delete-ghost-agent', check: 'deleted-agent-backups', key: 'x' }, /belongs to the check ghost-agents/],
    [{ fix: 'delete-ghost-agent', check: 'ghost-agents' }, /key is required/],
    [{ fix: 'remove-deleted-agent-backups', check: 'deleted-agent-backups', key: '../..' }, /key must be/],
  ])('rejects %j', async (body, msg) => {
    const r = await runDiagnosticFix(body)
    expect(r.status).toBe(400)
    expect((r.data as any).message).toMatch(msg)
    expect(m.deleteAgentById).not.toHaveBeenCalled()
  })
})

describe('delete-ghost-agent', () => {
  const fix = { fix: 'delete-ghost-agent', check: 'ghost-agents', key: 'ghost-1' }

  it('hard-deletes an agent that is still a ghost', async () => {
    m.agents = [ghost()]
    const r = await runDiagnosticFix(fix)
    expect(r.status).toBe(200)
    expect(m.deleteAgentById).toHaveBeenCalledWith('ghost-1', true)
  })

  it('refuses when a tmux session appeared since the report', async () => {
    m.agents = [ghost()]
    m.tmux.mockResolvedValue({ stdout: 'zz-canary\n' })
    const r = await runDiagnosticFix(fix)
    expect(r.status).toBe(409)
    expect((r.data as any).message).toMatch(/has a tmux session. Nothing was deleted/)
    expect(m.deleteAgentById).not.toHaveBeenCalled()
  })

  it('refuses when it got a Claude session since the report', async () => {
    m.agents = [ghost({ claudeSessionId: 'abc' })]
    expect((await runDiagnosticFix(fix)).status).toBe(409)
    expect(m.deleteAgentById).not.toHaveBeenCalled()
  })

  it('refuses when tmux cannot be listed', async () => {
    m.agents = [ghost()]
    m.tmux.mockRejectedValue(Object.assign(new Error('spawn EAGAIN'), { stderr: '' }))
    expect((await runDiagnosticFix(fix)).status).toBe(409)
    expect(m.deleteAgentById).not.toHaveBeenCalled()
  })

  it('refuses a real agent outright', async () => {
    m.agents = [makeAgent({ id: 'ghost-1', name: 'real', hostId: 'self' })]
    expect((await runDiagnosticFix(fix)).status).toBe(409)
    expect(m.deleteAgentById).not.toHaveBeenCalled()
  })
})

describe('remove-deleted-agent-backups', () => {
  const fix = { fix: 'remove-deleted-agent-backups', check: 'deleted-agent-backups', key: '*' }

  it('removes backups of gone agents, keeps live agents\' backups and anything not ours', async () => {
    m.agents = [makeAgent({ id: 'live-1' })]
    for (const n of ['live-1-2026-11-01T00-00-00-000Z', 'gone-2-2026-11-01T00-00-00-000Z', 'notes']) fs.mkdirSync(path.join(m.backups, n), { recursive: true })
    const outside = path.join(home, 'precious'); fs.mkdirSync(outside)
    fs.symlinkSync(outside, path.join(m.backups, 'link-3-2026-11-01T00-00-00-000Z'))

    const r = await runDiagnosticFix(fix)
    expect(r.status).toBe(200)
    expect(fs.readdirSync(m.backups).sort()).toEqual(['link-3-2026-11-01T00-00-00-000Z', 'live-1-2026-11-01T00-00-00-000Z', 'notes'])
    expect(fs.existsSync(outside)).toBe(true)
  })

  it('answers 409 when there is nothing left to remove', async () => {
    expect((await runDiagnosticFix(fix)).status).toBe(409)
  })
})
