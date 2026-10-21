import { afterAll, beforeAll, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The cleanup script against a real CozoDB: dry run changes nothing, --apply removes exactly the rows
// whose role is not conversation (with their terms, symbols and vectors) after making a backup.
const SCRIPT = path.join(__dirname, '..', 'scripts', 'purge-non-conversation-memory.mjs')
let home: string
let prevHome: string | undefined
let agentsDir: string
const AGENT = 'purge-agent'

const rows = async (db: any, rel: string) => (await db.run(`?[msg_id] := *${rel}{msg_id}`)).rows.map((r: any[]) => r[0]) as string[]

beforeAll(async () => {
  prevHome = process.env.HOME
  home = mkdtempSync(path.join(os.tmpdir(), 'maestro-purge-'))
  process.env.HOME = home
  agentsDir = path.join(home, '.aimaestro', 'agents')
  const { createAgentDatabase } = await import('../lib/cozo-db')
  const { upsertMessage } = await import('../lib/cozo-schema-rag')
  const db = await createAgentDatabase({ agentId: AGENT })
  try {
    const vec = Buffer.from(new Float32Array(384).buffer)
    const put = (id: string, role: string, text: string) =>
      upsertMessage(db, { msg_id: id, conversation_file: '/x/s.jsonl', role: role as any, ts: 1, text }, vec, [`term-${id}`], [`sym_${id}`])
    await put('m-user', 'user', 'a question')
    await put('m-assistant', 'assistant', 'an answer')
    await put('m-system', 'system', 'kept: a system role is conversation here')
    await put('m-blob-1', 'api-request-blob', 'You are Claude Code ...')
    await put('m-blob-2', 'api-request-blob', 'tool list ...')
    await put('m-future', 'brand-new-record-type', 'x')
  } finally { await db.close() }
})
afterAll(() => { process.env.HOME = prevHome; rmSync(home, { recursive: true, force: true }) })

const run = (...args: string[]) =>
  execFileSync('node', [SCRIPT, '--agents-dir', agentsDir, '--agent', AGENT, ...args], { encoding: 'utf8' })
const state = async () => {
  const { AgentDatabase } = await import('../lib/cozo-db')
  const db = new AgentDatabase({ agentId: AGENT, readOnly: true })
  await db.initialize()
  try {
    return {
      messages: (await rows(db, 'messages')).sort(),
      vec: (await rows(db, 'msg_vec')).sort(),
      terms: (await rows(db, 'msg_terms')).sort(),
      symbols: (await rows(db, 'code_symbols')).sort(),
    }
  } finally { await db.close() }
}
const ALL = ['m-assistant', 'm-blob-1', 'm-blob-2', 'm-future', 'm-system', 'm-user']
const KEPT = ['m-assistant', 'm-system', 'm-user']

it('a dry run reports the rows by role and changes nothing', async () => {
  const out = run()
  expect(out).toMatch(/DRY RUN/)
  expect(out).toMatch(/3 not conversation/)
  expect(out).toMatch(/api-request-blob=2/)
  expect(out).toMatch(/brand-new-record-type=1/)
  const s = await state()
  expect(s.messages).toEqual(ALL)
  expect(s.vec).toEqual(ALL)
  expect(readdirSync(path.join(agentsDir, AGENT)).some(f => f.includes('before-purge'))).toBe(false)
})

it('--apply backs up first, then removes only the non-conversation rows and what hangs off them', async () => {
  const out = run('--apply')
  expect(out).toMatch(/APPLYING/)
  const files = readdirSync(path.join(agentsDir, AGENT))
  const backup = files.find(f => f.startsWith('agent.db.before-purge-'))
  expect(backup).toBeTruthy()
  expect(existsSync(path.join(agentsDir, AGENT, backup as string))).toBe(true)
  const s = await state()
  expect(s.messages).toEqual(KEPT)
  expect(s.vec).toEqual(KEPT)
  expect([...new Set(s.terms)]).toEqual(KEPT)
  expect([...new Set(s.symbols)]).toEqual(KEPT)
})

it('a second run finds nothing to do and makes no second backup', async () => {
  const before = readdirSync(path.join(agentsDir, AGENT)).filter(f => f.includes('before-purge')).length
  expect(run('--apply')).toMatch(/0 not conversation/)
  expect(readdirSync(path.join(agentsDir, AGENT)).filter(f => f.includes('before-purge')).length).toBe(before)
})
