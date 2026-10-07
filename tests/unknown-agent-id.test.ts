/**
 * B009: an unknown or malformed agent id must not get an agent, a database or a
 * folder under ~/.aimaestro/agents. Before, `POST /api/agents/does-not-exist/subconscious`
 * answered success and left `~/.aimaestro/agents/does-not-exist/` behind.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { registered } = vi.hoisted(() => ({ registered: new Map<string, { id: string; deletedAt?: string }>() }))
vi.mock('@/lib/agent-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent-registry')>()
  return { ...actual, getAgent: (id: string, includeDeleted?: boolean) => {
    const a = registered.get(id) || null
    return a && a.deletedAt && !includeDeleted ? null : a
  } }
})

import { AgentRegistry, AgentNotFoundError, isSafeAgentId, isKnownAgentId } from '@/lib/agent'
import { triggerSubconsciousAction } from '@/services/agents-subconscious-service'
import { getTracking } from '@/services/agents-memory-service'

let home: string
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'b009-'))
  fs.mkdirSync(path.join(home, '.aimaestro', 'agents'), { recursive: true })
  // os.homedir() reads $HOME on POSIX; a spy on the module object would not reach `import * as os`.
  vi.stubEnv('HOME', home)
  expect(os.homedir()).toBe(home)
  registered.clear()
})
afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(home, { recursive: true, force: true })
})
const agentsDir = () => path.join(home, '.aimaestro', 'agents')

describe('isSafeAgentId', () => {
  it('accepts uuids and plain names', () => {
    for (const id of ['08f8dc37-e151-47b0-bd72-5fdc7fc31087', 'agent_1', 'a.b-c', 'A1']) expect(isSafeAgentId(id)).toBe(true)
  })
  it('rejects anything that could leave the agents directory or is not a name', () => {
    for (const id of ['', '.', '..', '../x', 'a/b', 'a\\b', '.hidden', 'a b', 'a..b', 'x'.repeat(129), '%2e%2e', 'a\u0000b'])
      expect(isSafeAgentId(id)).toBe(false)
  })
})

describe('isKnownAgentId', () => {
  it('knows a registered agent, including a soft-deleted one (its memory is still on disk)', () => {
    registered.set('reg-1', { id: 'reg-1' })
    registered.set('del-1', { id: 'del-1', deletedAt: '2026-01-01' })
    expect(isKnownAgentId('reg-1')).toBe(true)
    expect(isKnownAgentId('del-1')).toBe(true)
  })
  it('knows an orphaned agent that already has a folder on disk', () => {
    fs.mkdirSync(path.join(agentsDir(), 'orphan-1'))
    expect(isKnownAgentId('orphan-1')).toBe(true)
  })
  it('does not know an id that is neither registered nor on disk', () => {
    expect(isKnownAgentId('does-not-exist')).toBe(false)
  })
  it('never knows an unsafe id, even if the path would exist', () => {
    expect(isKnownAgentId('..')).toBe(false)
    expect(isKnownAgentId('../agents')).toBe(false)
  })
})

describe('AgentRegistry.getAgent', () => {
  it('refuses an unknown id and creates no folder', async () => {
    const reg = new AgentRegistry()
    await expect(reg.getAgent('does-not-exist')).rejects.toBeInstanceOf(AgentNotFoundError)
    expect(fs.existsSync(path.join(agentsDir(), 'does-not-exist'))).toBe(false)
    expect(fs.readdirSync(agentsDir())).toEqual([])
  })
  it('refuses a path-traversal id and creates nothing', async () => {
    const reg = new AgentRegistry()
    await expect(reg.getAgent('..')).rejects.toBeInstanceOf(AgentNotFoundError)
    await expect(reg.getAgent('../../evil')).rejects.toBeInstanceOf(AgentNotFoundError)
    expect(fs.readdirSync(path.join(home, '.aimaestro'))).toEqual(['agents'])
  })
})

describe('services answer 404 for an unknown agent and leave no folder', () => {
  it('subconscious trigger', async () => {
    const r = await triggerSubconsciousAction('does-not-exist', 'consolidate')
    expect(r.status).toBe(404)
    expect((r.data as any).error).toBe('agent_not_found')
    expect(fs.readdirSync(agentsDir())).toEqual([])
  })
  it('tracking', async () => {
    const r = await getTracking('does-not-exist')
    expect(r.status).toBe(404)
    expect(fs.readdirSync(agentsDir())).toEqual([])
  })
})

// The class, not just these two: every service that loads an agent from an id must
// check it first. Counting guards against loads catches a new service that forgets.
describe('every service that loads an agent checks the id first', () => {
  const dir = path.join(__dirname, '..', 'services')
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.ts'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8')
    // comments mention the call; only real code counts
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // runTriggeredConsolidation is an internal helper reached only through the guarded triggerConsolidation
    const internal = f === 'agents-memory-service.ts' ? 1 : 0
    const loads = (src.match(/agentRegistry\.(getAgent|withAgent)\(/g) || []).length - internal
    if (!loads) continue
    it(`${f}: ${loads} load(s) have a guard`, () => {
      const guards = (src.match(/unknownAgentResult\(/g) || []).length
      expect(guards).toBeGreaterThanOrEqual(loads)
    })
  }
})
