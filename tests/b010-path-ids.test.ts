/**
 * B010 items 4 and 5: schedule and brain-inbox took any agent id and turned it
 * into a path. An unknown id created a folder; `..%2F..%2Fx` left the agents
 * directory. Every test runs against a temporary HOME.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { NextRequest } from 'next/server'

const { registered } = vi.hoisted(() => {
  // Modules read os.homedir() when they load: point HOME at a temp dir before any import.
  process.env.HOME = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'b010-ids-load-'))
  return { registered: new Map<string, { id: string }>() }
})
vi.mock('@/lib/agent-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent-registry')>()
  return { ...actual, getAgent: (id: string) => registered.get(id) || null }
})

import { readSchedule, writeSchedule, defaultSchedule } from '@/lib/agent-schedule'
import { writeBrainSignal, readAndClearBrainInbox } from '@/lib/cerebellum/brain-inbox'
import { isSafeAgentId } from '@/lib/safe-ids'
import * as scheduleRoute from '@/app/api/agents/[id]/schedule/route'
import * as brainRoute from '@/app/api/agents/[id]/brain-inbox/route'

const HOSTILE = ['..', '../../x', '..\\..\\x', 'a/b', '/etc/x', 'a\u0000b', '%2e%2e', 'x'.repeat(200), '', '.hidden']

let outer: string
let home: string
beforeEach(() => {
  outer = fs.mkdtempSync(path.join(os.tmpdir(), 'b010-ids-'))
  home = path.join(outer, 'home')
  fs.mkdirSync(path.join(home, '.aimaestro', 'agents'), { recursive: true })
  vi.stubEnv('HOME', home)
  expect(os.homedir()).toBe(home)
  registered.clear()
})
afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(outer, { recursive: true, force: true })
})
const agentsDir = () => path.join(home, '.aimaestro', 'agents')
function walk(d: string): string[] {
  if (!fs.existsSync(d)) return []
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? [path.join(d, e.name), ...walk(path.join(d, e.name))] : [path.join(d, e.name)])
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (body?: unknown) => new NextRequest('http://localhost/api/x', body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) })

describe('lib writers refuse unsafe ids', () => {
  it('writeSchedule writes nothing, readSchedule never reads outside', () => {
    fs.mkdirSync(path.join(home, 'x'), { recursive: true })
    fs.writeFileSync(path.join(home, 'x', 'schedule.json'), JSON.stringify({ tasks: [{ id: 'planted', action: 'index', enabled: true }] }))
    for (const id of HOSTILE) {
      expect(writeSchedule({ version: 1, agentId: id, tasks: [] })).toBe(false)
    }
    expect(readSchedule('../../x').tasks.map(t => t.id)).not.toContain('planted')
    expect(walk(agentsDir())).toEqual([])
    expect(fs.readFileSync(path.join(home, 'x', 'schedule.json'), 'utf8')).toContain('planted')
  })

  it('brain inbox neither writes nor truncates outside the agents directory', () => {
    const planted = path.join(home, 'x', 'brain', 'cortex-inbox.jsonl')
    fs.mkdirSync(path.dirname(planted), { recursive: true })
    fs.writeFileSync(planted, '{"keep":1}\n')
    expect(readAndClearBrainInbox('../../x')).toEqual([])
    expect(fs.readFileSync(planted, 'utf8')).toBe('{"keep":1}\n')
    for (const id of HOSTILE) writeBrainSignal(id, { from: 'cerebellum', type: 'notification', priority: 'low', message: 'm', timestamp: 1 })
    expect(fs.readFileSync(planted, 'utf8')).toBe('{"keep":1}\n')
    expect(walk(agentsDir())).toEqual([])
  })

  it('a safe id still works', () => {
    expect(writeSchedule(defaultSchedule('agent-1'))).toBe(true)
    expect(fs.existsSync(path.join(agentsDir(), 'agent-1', 'schedule.json'))).toBe(true)
    writeBrainSignal('agent-1', { from: 'cerebellum', type: 'notification', priority: 'low', message: 'm', timestamp: 1 })
    expect(readAndClearBrainInbox('agent-1')).toHaveLength(1)
    expect(isSafeAgentId('agent-1')).toBe(true)
  })
})

describe('routes answer 404 for an unknown or hostile id and leave nothing behind', () => {
  const ids = ['does-not-exist', '../../x', '..']
  it('schedule GET and POST (tasks and run)', async () => {
    for (const id of ids) {
      expect((await scheduleRoute.GET(req(), ctx(id))).status).toBe(404)
      expect((await scheduleRoute.POST(req({ tasks: [] }), ctx(id))).status).toBe(404)
      expect((await scheduleRoute.POST(req({ run: true }), ctx(id))).status).toBe(404)
    }
    expect(walk(agentsDir())).toEqual([])
    expect(walk(home).filter(p => !p.startsWith(agentsDir()) && !p.endsWith('.aimaestro'))).toEqual([])
  })
  it('brain-inbox GET', async () => {
    for (const id of ids) expect((await brainRoute.GET(req(), ctx(id))).status).toBe(404)
    expect(walk(agentsDir())).toEqual([])
  })
  it('a registered agent still works', async () => {
    registered.set('known-1', { id: 'known-1' })
    expect((await scheduleRoute.GET(req(), ctx('known-1'))).status).toBe(200)
    expect((await scheduleRoute.POST(req({ tasks: [] }), ctx('known-1'))).status).toBe(200)
    expect((await brainRoute.GET(req(), ctx('known-1'))).status).toBe(200)
  })
})

describe('every module that builds ~/.aimaestro/agents/<id> from an id has a guard or a reason', () => {
  // Modules whose ids are never request input, with the reason. A new module
  // that builds such a path must either guard its id or be added here on purpose.
  const INTERNAL: Record<string, string> = {
    'lib/agent-db-sync.mjs': 'ids come from the registry file',
    'lib/agent-db-sync.ts': 'ids come from the registry file',
    'lib/agent-registry.ts': 'ids are generated uuids or already-registered ids',
    'lib/agent-startup.ts': 'ids come from readdir of the agents directory',
    'lib/agent.ts': 'AgentRegistry.getAgent refuses unknown ids (B009); isSafeAgentId lives here',
    'lib/amp-keys.ts': 'callers pass registry ids',
    'lib/cozo-db.ts': 'only constructed by the agent runtime, which checks the id (B009)',
    'lib/memory/backlog.ts': 'called from consolidation for registered agents only',
    'lib/memory/recall-log.ts': 'called from the recall pipeline for registered agents only',
    'lib/memory/sweep.ts': 'ids come from readdir of the agents directory',
    'services/agents-docker-service.ts': 'ids are of agents just created in the registry',
    'services/agents-core-service.ts': 'iterates the agents directory',
    'services/agents-memory-service.ts': 'sits behind unknownAgentResult (see the B009 scan)',
    'services/agents-transfer-service.ts': 'import validates the manifest id with isSafeAgentId; export takes registry agents',
    'services/agents-canvas-service.ts': 'canvas ids and paths are validated there (audited in B010 item 6)',
  }
  const GUARD = /isSafeAgentId|SAFE_ID|isKnownAgentId|unknownAgentResult|safe-ids|\[A-Za-z0-9_-\]\+\$/
  const roots = ['lib', 'services', 'app']
  const found: string[] = []
  const visit = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') visit(p); continue }
      if (!/\.(ts|tsx|mjs)$/.test(e.name)) continue
      const src = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      if (/['"]\.aimaestro['"],\s*['"]agents['"],\s*\$?\{?\w*[iI]d\b/.test(src) || (/AGENTS_DIR,\s*\w*[iI]d\b/.test(src) && /\.aimaestro|AIMAESTRO/.test(src))) found.push(path.relative(path.join(__dirname, '..'), p))
    }
  }
  for (const r of roots) visit(path.join(__dirname, '..', r))

  it('finds the known builders (the scan itself works)', () => {
    expect(found).toContain('lib/agent-schedule.ts')
    expect(found).toContain('lib/cerebellum/brain-inbox.ts')
  })
  for (const f of found) {
    it(`${f}`, () => {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
      expect(GUARD.test(src) || f in INTERNAL, `${f} builds an agent path from an id with no guard`).toBe(true)
    })
  }
})
