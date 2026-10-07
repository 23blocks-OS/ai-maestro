/**
 * B008: GET /api/agents/:id/tracking returned 500 "Expression contains
 * unevaluated constant" for every agent. getAgentFullContext put rule names in
 * a constant list, getAgentWorkHistory aggregated in the rule body, and real
 * databases do not have the tracking relations at all.
 *
 * These tests run the real queries against a real in-memory Cozo database
 * (cozo-node, mem engine). No live agent database is touched.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CozoDb } from 'cozo-node'
import * as fs from 'fs'
import * as path from 'path'

const { mockGetAgent } = vi.hoisted(() => ({ mockGetAgent: vi.fn() }))
// These tests use in-memory databases for made-up ids; the id check (B009) is covered in unknown-agent-id.test.ts.
vi.mock('@/lib/agent', () => ({ agentRegistry: { getAgent: mockGetAgent }, isKnownAgentId: () => true }))

import { getTracking, initializeTracking } from '@/services/agents-memory-service'
import {
  getAgentFullContext,
  getAgentWorkHistory,
  hasTrackingSchema,
} from '@/lib/cozo-schema'
import { initializeSimpleSchema, recordProject } from '@/lib/cozo-schema-simple'

/** The slice of AgentDatabase the tracking code uses, over a real Cozo DB. */
function memDb() {
  const db = new CozoDb('mem')
  return { run: (q: string) => db.run(q) } as any
}

const AGENT = 'agent-b008'
let agentDb: any

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  agentDb = memDb()
  mockGetAgent.mockResolvedValue({ getDatabase: async () => agentDb })
})

describe('GET tracking on a database without the tracking schema', () => {
  it('returns 200 with initialized:false on an empty database', async () => {
    const result = await getTracking(AGENT)
    expect(result.status).toBe(200)
    expect(result.data).toEqual({
      success: true,
      agent_id: AGENT,
      initialized: false,
      context: null,
      history: [],
      projects: [],
    })
  })

  it('treats the simple schema sessions/projects as uninitialized and still lists projects', async () => {
    // The shape real agent databases have: simple-schema sessions/projects, no agents.
    await initializeSimpleSchema(agentDb)
    await recordProject(agentDb, { project_path: '/work/old', project_name: 'old' })
    await recordProject(agentDb, { project_path: '/work/new', project_name: 'new' })
    // Make the order deterministic: bump 'new' to the latest last_seen.
    await agentDb.run(`?[project_path, last_seen] <- [['/work/new', 9999999999999]] :update projects`)

    expect(await hasTrackingSchema(agentDb)).toBe(false)
    const result = await getTracking(AGENT)
    expect(result.status).toBe(200)
    expect(result.data.initialized).toBe(false)
    expect(result.data.context).toBeNull()
    expect(result.data.history).toEqual([])
    expect(result.data.projects.map((p: any) => p.project_path)).toEqual(['/work/new', '/work/old'])
  })

  it('stays uninitialized after POST when the simple schema already holds the names', async () => {
    await initializeSimpleSchema(agentDb)
    const post = await initializeTracking(AGENT, {})
    expect(post.status).toBe(200)
    const result = await getTracking(AGENT)
    expect(result.status).toBe(200)
    expect(result.data.initialized).toBe(false)
  })
})

describe('GET tracking after initializeTracking with sample data', () => {
  beforeEach(async () => {
    const post = await initializeTracking(AGENT, { addSampleData: true })
    expect(post.status).toBe(200)
    expect(post.data.success).toBe(true)
  })

  it('runs both queries and returns rows', async () => {
    expect(await hasTrackingSchema(agentDb)).toBe(true)

    const context = await getAgentFullContext(agentDb, AGENT)
    expect(context.agent).toMatchObject({ agent_id: AGENT, name: AGENT })
    expect(context.current_session).toMatchObject({ session_id: `${AGENT}-session-1` })
    expect(context.all_sessions).toHaveLength(1)
    expect(context.all_projects).toEqual([
      expect.objectContaining({ project_id: 'example-project-id', project_name: 'example-project' }),
    ])

    const history = await getAgentWorkHistory(agentDb, AGENT)
    expect(history).toEqual([
      expect.objectContaining({
        session_id: `${AGENT}-session-1`,
        session_name: AGENT,
        claude_session_count: 2,
        project_name: null, // createSession stores no project_path
        status: 'active',
      }),
    ])
  })

  it('returns the full 200 shape with a projects array', async () => {
    const result = await getTracking(AGENT)
    expect(result.status).toBe(200)
    expect(result.data.success).toBe(true)
    expect(result.data.initialized).toBe(true)
    expect(result.data.context.agent.agent_id).toBe(AGENT)
    expect(result.data.history).toHaveLength(1)
    expect(result.data.projects).toEqual([
      expect.objectContaining({
        project_id: 'example-project-id',
        project_path: '/Users/juanpelaez/projects/example-project',
      }),
    ])
  })

  it('counts sessions with no Claude sessions as 0 instead of dropping them', async () => {
    await agentDb.run(`
      ?[session_id, agent_id, session_name, status, log_file, notes_file,
        project_path, project_name, started_at, ended_at, last_active_at,
        duration_seconds, total_claude_sessions, total_messages, total_tokens] <- [
        ['s2', '${AGENT}', 'second', 'ended', null, null,
         '/Users/juanpelaez/projects/example-project', null, 9999999999999, null, 0, 0, 0, 0, 0]
      ]
      :put sessions
    `)
    const history = await getAgentWorkHistory(agentDb, AGENT)
    expect(history[0]).toMatchObject({ session_id: 's2', claude_session_count: 0, project_name: 'example-project' })
    expect(history[1]).toMatchObject({ session_id: `${AGENT}-session-1`, claude_session_count: 2 })
  })
})

describe('query shapes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cozo-schema.ts'), 'utf8')

  it('no longer puts rule names in a constant list', () => {
    expect(source).not.toMatch(/\?\[type, data\]\s*<-/)
    expect(source).not.toMatch(/\['agent', agent\]/)
  })

  it('aggregates only in a rule head', () => {
    expect(source).not.toMatch(/=\s*count\(/)
  })
})
