/**
 * Long-term memory for GitHub Copilot CLI agents (#627).
 *
 * The memory indexer used to read only `~/.claude/projects`, so a Copilot agent's conversations
 * (`~/.copilot/session-state/<session>/events.jsonl`) were never indexed: search and
 * consolidation found nothing for it. These drive `runIndexDelta` end to end with an in-memory
 * stand-in for the agent database, real transcript files and the REAL Copilot 1.0.97 fixtures
 * (tests/fixtures/copilot), and check what reaches the message index.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// ── in-memory stand-ins ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  projects: new Map<string, { project_path: string; project_name: string; claude_dir?: string }>(),
  conversations: new Map<string, any>(),
  upserts: [] as { conversation_file: string; role: string; ts: number; text: string }[],
  agent: { id: 'agent-1', name: 'cp-agent', program: 'copilot', workingDirectory: '/work/app', sessions: [] as any[] } as any,
  others: [] as any[],
}))

vi.mock('@/lib/agent', () => ({
  agentRegistry: {
    withAgent: (_id: string, fn: () => unknown) => fn(),
    getAgent: async () => ({ getDatabase: async () => ({}) }),
  },
}))
vi.mock('@/lib/agent-registry', () => ({
  getAgent: () => h.agent,
  getAgentBySession: () => null,
  updateAgentWorkingDirectory: () => {},
  listAgents: () => [h.agent, ...h.others],
}))
vi.mock('@/lib/agent-runtime', () => ({ getRuntime: () => ({ getWorkingDirectory: async () => null }) }))
vi.mock('@/lib/cozo-schema-simple', () => ({
  getProjects: async () => ({ rows: [...h.projects.values()].map(p => [p.project_path, p.project_name, p.claude_dir ?? null, 0, 0]) }),
  recordProject: async (_db: unknown, p: any) => { h.projects.set(p.project_path, { ...h.projects.get(p.project_path), ...p }) },
  getSessions: async () => ({ rows: [] }),
  getConversations: async (_db: unknown, projectPath: string) => ({
    rows: [...h.conversations.values()].filter(c => c.project_path === projectPath).map(c => [
      c.jsonl_file, c.session_id, c.first_message_at, c.last_message_at, c.message_count, c.first_user_message,
      c.model_names, c.git_branch, c.claude_version, c.last_indexed_at ?? 0, c.last_indexed_message_count ?? 0,
    ]),
  }),
  recordConversation: async (_db: unknown, c: any) => {
    const prev = h.conversations.get(c.jsonl_file) || {}
    const next = { ...prev }
    for (const [k, v] of Object.entries(c)) if (v !== undefined) next[k] = v
    h.conversations.set(c.jsonl_file, next)
  },
}))
vi.mock('@/lib/rag/embeddings', () => ({
  embedTexts: async (texts: string[]) => texts.map(() => new Float32Array(4)),
  vectorToBuffer: () => Buffer.alloc(16),
}))
vi.mock('@/lib/cozo-schema-rag', () => ({
  upsertMessage: async (_db: unknown, m: any) => { h.upserts.push(m) },
}))

import { runIndexDelta, resetCopilotSessionCache } from '@/lib/index-delta'
import { parseConversationLine } from '@/lib/rag/ingest'
import { listCopilotSessions, copilotLineToIndexMessages } from '@/lib/transcript-copilot.mjs'

const fixtureLines = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', 'copilot', name), 'utf-8').split('\n').filter(Boolean)

let tmp = ''
let homeBefore: string | undefined
let copilotBefore: string | undefined

/** A Copilot session folder whose first line is the fixture's session.start with this cwd. */
function writeSession(id: string, cwd: string, fixture = 'events-conversation.jsonl', extra: string[] = []): string {
  const dir = path.join(tmp, 'copilot', 'session-state', id)
  fs.mkdirSync(dir, { recursive: true })
  const lines = fixtureLines(fixture)
  const start = JSON.parse(lines[0])
  start.data.context.cwd = cwd
  start.data.sessionId = id
  const file = path.join(dir, 'events.jsonl')
  fs.writeFileSync(file, [JSON.stringify(start), ...lines.slice(1), ...extra].join('\n') + '\n')
  return file
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-copilot-memory-'))
  homeBefore = process.env.HOME
  copilotBefore = process.env.COPILOT_HOME
  process.env.HOME = path.join(tmp, 'home') // no ~/.claude here
  process.env.COPILOT_HOME = path.join(tmp, 'copilot')
  h.projects.clear(); h.conversations.clear(); h.upserts.length = 0; h.others = []
  h.agent = { id: 'agent-1', name: 'cp-agent', program: 'copilot', workingDirectory: '/work/app', sessions: [] }
  resetCopilotSessionCache()
})
afterEach(() => {
  if (homeBefore === undefined) delete process.env.HOME; else process.env.HOME = homeBefore
  if (copilotBefore === undefined) delete process.env.COPILOT_HOME; else process.env.COPILOT_HOME = copilotBefore
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('what a Copilot line becomes in the index', () => {
  const conversation = fixtureLines('events-conversation.jsonl')

  it('keeps what the person typed and what Copilot answered, and nothing else', () => {
    const messages = conversation.flatMap(parseConversationLine)
    expect(messages.length).toBeGreaterThan(0)
    expect(new Set(messages.map(m => m.type))).toEqual(new Set(['user', 'assistant']))
    const first = messages.find(m => m.type === 'user') as any
    expect(first.message.content[0].text).toBe('first question')
  })

  it('session bookkeeping, system prompts, tool results and permission prompts add no messages', () => {
    for (const l of conversation) {
      const ev = JSON.parse(l)
      if (['session.start', 'system.message', 'tool.execution_complete', 'permission.requested', 'permission.completed'].includes(ev.type)) {
        expect(copilotLineToIndexMessages(ev), ev.type).toEqual([])
      }
    }
  })

  it('reasoning text is kept as an assistant message, as the Claude path keeps it', () => {
    const messages = fixtureLines('events-thinking.jsonl').flatMap(parseConversationLine) as any[]
    expect(messages.some(m => m.type === 'assistant' && m.message.content.some((b: any) => b.type === 'thinking' && b.thinking))).toBe(true)
  })

  it('a Claude line passes through exactly as it was', () => {
    const claude = { type: 'user', timestamp: '2026-10-14T14:00:00Z', message: { content: 'hello' }, sessionId: 's', cwd: '/c' }
    expect(parseConversationLine(JSON.stringify(claude))).toEqual([claude])
  })

  it('text that is not JSON throws, as it did, so the caller counts it as skipped', () => {
    expect(() => parseConversationLine('{"type":"user.mess')).toThrow()
  })
})

describe('finding a Copilot agent\'s sessions', () => {
  it('lists every session with the cwd it started in', () => {
    writeSession('s1', '/work/app')
    writeSession('s2', '/work/app')
    writeSession('s3', '/elsewhere')
    const sessions = listCopilotSessions() as { sessionId: string; cwd: string }[]
    expect(sessions.map(s => s.sessionId).sort()).toEqual(['s1', 's2', 's3'])
    expect(sessions.find(s => s.sessionId === 's3')!.cwd).toBe('/elsewhere')
  })

  it('no Copilot folder means no sessions, not an error', () => {
    expect(listCopilotSessions()).toEqual([])
  })
})

describe('runIndexDelta for a Copilot agent', () => {
  it('indexes the conversation and records the project and conversation', async () => {
    const file = writeSession('sess-a', '/work/app')
    const r = await runIndexDelta('agent-1')
    expect(r.success).toBe(true)
    expect(r.new_conversations_discovered).toBe(1)
    expect(r.total_messages_processed).toBeGreaterThan(0)

    expect(h.upserts.length).toBe(r.total_messages_processed)
    expect(h.upserts.every(m => m.conversation_file === file)).toBe(true)
    expect(h.upserts.map(m => m.role).sort().filter((v, i, a) => a.indexOf(v) === i)).toEqual(['assistant', 'user'])
    expect(h.upserts.find(m => m.role === 'user')!.text).toBe('first question')

    expect([...h.projects.values()]).toEqual([{ project_path: '/work/app', project_name: 'app' }])
    const convo = h.conversations.get(file)
    expect(convo).toMatchObject({ session_id: 'sess-a', project_path: '/work/app', first_user_message: 'first question' })
    expect(convo.last_indexed_message_count).toBe(fixtureLines('events-conversation.jsonl').length)
  })

  it('indexes ALL sessions of the working directory, not only the newest', async () => {
    writeSession('old', '/work/app', 'events-conversation.jsonl')
    writeSession('new', '/work/app', 'events-thinking.jsonl')
    const r = await runIndexDelta('agent-1')
    expect(r.new_conversations_discovered).toBe(2)
    expect(new Set(h.upserts.map(m => path.basename(path.dirname(m.conversation_file))))).toEqual(new Set(['old', 'new']))
  })

  it('ignores a session started somewhere else', async () => {
    writeSession('mine', '/work/app')
    const other = writeSession('theirs', '/work/other')
    await runIndexDelta('agent-1')
    expect(h.upserts.some(m => m.conversation_file === other)).toBe(false)
    expect(h.conversations.has(other)).toBe(false)
  })

  it('a session started in a sub-directory belongs to the agent, unless a closer agent owns it', async () => {
    const sub = writeSession('sub', '/work/app/packages/api')
    h.others = [{ id: 'agent-2', name: 'api-agent', workingDirectory: '/work/app/packages/api', sessions: [] }]
    await runIndexDelta('agent-1')
    expect(h.conversations.has(sub)).toBe(false)

    h.others = []
    h.projects.clear(); h.conversations.clear(); h.upserts.length = 0
    resetCopilotSessionCache()
    await runIndexDelta('agent-1')
    expect(h.conversations.has(sub)).toBe(true)
  })

  it('a second run indexes only what was appended (line-count delta)', async () => {
    const file = writeSession('grow', '/work/app')
    await runIndexDelta('agent-1')
    const first = h.upserts.length
    const second = await runIndexDelta('agent-1')
    expect(second.total_messages_processed).toBe(0)
    expect(h.upserts.length).toBe(first)

    const user = { type: 'user.message', data: { content: 'a later question' }, id: 'late-1', timestamp: '2026-10-15T10:00:00.000Z', parentId: null }
    const answer = { type: 'assistant.message', data: { content: 'a later answer', toolRequests: [] }, id: 'late-2', timestamp: '2026-10-15T10:00:05.000Z', parentId: null }
    fs.appendFileSync(file, [user, answer].map(e => JSON.stringify(e)).join('\n') + '\n')
    // the file-size cache keeps unchanged files out; a changed one is read again
    const third = await runIndexDelta('agent-1')
    expect(third.total_messages_processed).toBe(2)
    expect(h.upserts.slice(first).map(m => m.text)).toEqual(['a later question', 'a later answer'])
    expect(h.conversations.get(file).last_indexed_message_count).toBe(fixtureLines('events-conversation.jsonl').length + 2)
  })

  it('a garbled line does not stop the run and adds no message', async () => {
    const file = writeSession('garbled', '/work/app', 'events-conversation.jsonl', ['{"type":"user.message","data":{"content":"cut o'])
    const r = await runIndexDelta('agent-1')
    expect(r.success).toBe(true)
    expect(r.total_messages_processed).toBeGreaterThan(0)
    expect(h.upserts.some(m => m.text.includes('cut o'))).toBe(false)
    expect(h.conversations.has(file)).toBe(true)
  })

  it('no Copilot sessions for the directory: nothing found, no failure', async () => {
    const r = await runIndexDelta('agent-1')
    expect(r.success).toBe(true)
    expect(r.message).toBe('No projects found for this agent')
  })
})

describe('agents that are not Copilot agents', () => {
  it('a Claude agent does not pick up Copilot sessions, even in its directory', async () => {
    h.agent = { ...h.agent, program: 'claude-code' }
    writeSession('copilot-s', '/work/app')
    const r = await runIndexDelta('agent-1')
    expect(r.total_messages_processed).toBe(0)
    expect(h.upserts).toEqual([])
  })

  it('a Claude agent still indexes its Claude transcript exactly as before', async () => {
    h.agent = { ...h.agent, program: 'claude-code' }
    const dir = path.join(tmp, 'home', '.claude', 'projects', '-work-app')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'abc.jsonl')
    const lines = [
      { type: 'user', timestamp: '2026-10-14T14:00:00Z', sessionId: 'abc', cwd: '/work/app', message: { content: 'claude question' } },
      { type: 'assistant', timestamp: '2026-10-14T14:00:05Z', sessionId: 'abc', cwd: '/work/app', message: { content: [{ type: 'text', text: 'claude answer' }], model: 'claude-sonnet-4-5' } },
    ]
    fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
    // The Claude project list is cached for ten minutes inside the module: use a fresh copy
    vi.resetModules()
    const fresh = await import('@/lib/index-delta')
    const r = await fresh.runIndexDelta('agent-1')
    expect(r.success).toBe(true)
    expect(h.upserts.map(m => [m.role, m.text])).toEqual([['user', 'claude question'], ['assistant', 'claude answer']])
    expect(h.conversations.get(file)).toMatchObject({ session_id: 'abc', first_user_message: 'claude question', model_names: 'Sonnet 4.5' })
    expect(h.projects.get('/work/app')!.claude_dir).toBe(dir)
  })
})
