/**
 * B014: log lines and files that grew without limit. Every test runs against a
 * temporary HOME / temp dir; nothing touches the real ~/.aimaestro.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { createRequire } from 'module'

vi.mock('@huggingface/transformers', () => ({ pipeline: vi.fn(), env: {} }))

const require = createRequire(import.meta.url)
const hook = require('../scripts/claude-hooks/ai-maestro-hook.cjs')

let home: string
let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
const lines = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((c: unknown[]) => c.map(String).join(' '))

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'b014-'))
  vi.stubEnv('HOME', home)
  expect(os.homedir()).toBe(home)
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  fs.rmSync(home, { recursive: true, force: true })
})

describe('CozoDB schema init runs once per database file per process', () => {
  it('skips the 45-table check on a second open and logs no per-table lines', async () => {
    const { AgentDatabase, _resetSchemaInitCache } = await import('@/lib/cozo-db')
    _resetSchemaInitCache()
    const a = new AgentDatabase({ agentId: 'agent-one' })
    await a.initialize()
    const first = lines(logSpy)
    expect(first.some(l => l.includes('Schema initialised'))).toBe(true)
    expect(first.some(l => l.includes('Existing relations: Promise'))).toBe(false)
    expect(first.some(l => l.includes('already exists'))).toBe(false)
    await a.close()
    logSpy.mockClear()

    const b = new AgentDatabase({ agentId: 'agent-one' })
    await b.initialize()
    const second = lines(logSpy)
    expect(second.filter(l => l.includes('SCHEMA'))).toEqual([])
    expect(second.some(l => l.includes('Initializing schema'))).toBe(false)
    await b.close()
  })

  it('initialises again when the database file is recreated', async () => {
    const { AgentDatabase, _resetSchemaInitCache } = await import('@/lib/cozo-db')
    _resetSchemaInitCache()
    const a = new AgentDatabase({ agentId: 'agent-two' })
    await a.initialize()
    const dbPath = a.getPath()
    await a.close()
    fs.rmSync(dbPath, { force: true })
    logSpy.mockClear()
    const b = new AgentDatabase({ agentId: 'agent-two' })
    await b.initialize()
    expect(lines(logSpy).some(l => l.includes('Initializing schema'))).toBe(true)
    await b.close()
  })

  it('keeps "already exists" lines behind AIM_DEBUG_SCHEMA=1', async () => {
    const { schemaDebug } = await import('@/lib/schema-log')
    schemaDebug('[SCHEMA-RAG] ℹ x table already exists')
    expect(lines(logSpy)).toEqual([])
    vi.stubEnv('AIM_DEBUG_SCHEMA', '1')
    schemaDebug('[SCHEMA-RAG] ℹ x table already exists')
    expect(lines(logSpy).length).toBe(1)
  })
})

describe('log only on change', () => {
  it('shouldLogChange is true for the first value and a new value only', async () => {
    const { shouldLogChange, _resetLogOnChange } = await import('@/lib/log-on-change')
    _resetLogOnChange()
    expect([5, 5, 5, 6, 6, 5].map(n => shouldLogChange('k', n))).toEqual([true, false, false, true, false, true])
    expect(shouldLogChange('other', 5)).toBe(true)
  })
})

describe('[Embeddings] progress is throttled', () => {
  it('logs every 10 percent once and 100 once', async () => {
    const { createLoadProgressLogger } = await import('@/lib/rag/embeddings')
    const out: string[] = []
    const cb = createLoadProgressLogger(m => out.push(m))
    for (let i = 1; i <= 100; i++) cb({ file: 'a.onnx', progress: i })
    cb({ file: 'a.onnx', progress: 100 })
    expect(out.length).toBe(11) // 0,10,...,90 and one 100
    expect(out[out.length - 1]).toBe('[Embeddings] Loading... 100%')
    cb({ file: 'b.json', progress: 50 })
    expect(out.length).toBe(12)
  })
})

describe('malformed AMP message is quarantined, not re-logged', () => {
  it('moves it to .quarantine once, logs one line, and the reader skips the folder', async () => {
    const { collectMessagesFromAMPDir } = await import('@/lib/messageQueue')
    const inbox = path.join(home, 'inbox')
    const sender = path.join(inbox, 'alice')
    fs.mkdirSync(sender, { recursive: true })
    const bad = path.join(sender, 'msg_bad.json')
    fs.writeFileSync(bad, JSON.stringify({ envelope: { id: 'msg_bad', from: 'a@h' }, payload: { message: 'x' } }))
    const good = { envelope: { id: 'msg_ok', from: 'a@h', to: 'b@h', subject: 's', timestamp: '2026-01-01T00:00:00Z' }, payload: { message: 'hi' }, local: { status: 'unread' } }
    fs.writeFileSync(path.join(sender, 'msg_ok.json'), JSON.stringify(good))

    for (let poll = 0; poll < 3; poll++) {
      const results: any[] = []
      await collectMessagesFromAMPDir(inbox, undefined, results, new Set())
      expect(results.map(r => r.id)).toEqual(['msg-ok'])
    }
    expect(fs.existsSync(bad)).toBe(false)
    expect(fs.readdirSync(path.join(inbox, '.quarantine'))).toEqual(['msg_bad.json'])
    expect(lines(warnSpy).filter(l => l.includes('msg_bad')).length).toBe(1)
  })
})

describe('hook: debug log gating, recall cap, chat-state prune', () => {
  const stateDir = () => path.join(home, '.aimaestro', 'chat-state')

  it('writes no debug line unless AIM_HOOK_DEBUG=1, but always keeps errors', () => {
    vi.stubEnv('AIM_HOOK_DEBUG', '')
    fs.mkdirSync(stateDir(), { recursive: true })
    const log = path.join(stateDir(), 'hook-debug.log')
    hook.debugLog({ event: 'hook_received', input: {} })
    expect(fs.existsSync(log)).toBe(false)
    hook.debugLog({ event: 'message_check_error', error: 'boom' })
    expect(fs.readFileSync(log, 'utf8')).toContain('message_check_error')
    vi.stubEnv('AIM_HOOK_DEBUG', '1')
    hook.debugLog({ event: 'hook_received' })
    expect(fs.readFileSync(log, 'utf8')).toContain('hook_received')
  })

  it('caps memory-recalls.jsonl at 5 MB', () => {
    const dir = path.join(home, '.aimaestro', 'agents', 'agent-x')
    fs.mkdirSync(dir, { recursive: true })
    const f = path.join(dir, 'memory-recalls.jsonl')
    fs.writeFileSync(f, ('{"at":1,"primer":"x"}\n').repeat(Math.ceil((6 * 1024 * 1024) / 22)))
    hook.logRecall('agent-x', { primer: 'y' })
    expect(fs.existsSync(f + '.1')).toBe(true)
    expect(fs.statSync(f).size).toBeLessThan(1024)
  })

  it('prunes chat-state files older than 30 days and index keys for missing cwds', () => {
    fs.mkdirSync(stateDir(), { recursive: true })
    const old = new Date(Date.now() - 40 * 86400_000)
    const mk = (n: string, aged: boolean) => {
      const p = path.join(stateDir(), n)
      fs.writeFileSync(p, '{}')
      if (aged) fs.utimesSync(p, old, old)
    }
    mk('0123456789abcdef.json', true)
    mk('0123456789abcdef.notified.json', true)
    mk('fedcba9876543210.json', false)
    mk('hook-debug.log', true)
    mk('notes.json', true)
    const alive = fs.mkdtempSync(path.join(home, 'cwd-'))
    fs.writeFileSync(path.join(stateDir(), 'index.json'), JSON.stringify({ [alive]: 'a', '/nonexistent/zzz': 'b' }))
    const r = hook.pruneChatState(stateDir())
    expect(r.deleted).toBe(2)
    expect(fs.readdirSync(stateDir()).sort()).toEqual(['fedcba9876543210.json', 'hook-debug.log', 'index.json', 'notes.json'])
    expect(JSON.parse(fs.readFileSync(path.join(stateDir(), 'index.json'), 'utf8'))).toEqual({ [alive]: 'a' })
  })

  it('never throws on a missing directory', () => {
    expect(() => hook.pruneChatState(path.join(home, 'nope'))).not.toThrow()
  })
})

describe('scripts/cleanup-agent-browser.sh selection', () => {
  const script = path.join(__dirname, '..', 'scripts', 'cleanup-agent-browser.sh')
  function run(args: string[], tmp: string, psFile: string) {
    return spawnSync('bash', [script, ...args], {
      env: { PATH: process.env.PATH, HOME: home, TMPDIR: tmp, AIM_AB_TMPDIR: tmp, AIM_AB_PS_FILE: psFile },
      encoding: 'utf8',
    })
  }
  const age = (p: string, hours: number) => { const t = new Date(Date.now() - hours * 3600_000); fs.utimesSync(p, t, t) }

  it('removes only old dirs with no live Chrome; dry-run changes nothing', () => {
    const tmp = fs.mkdtempSync(path.join(home, 'tmp-'))
    const mkdir = (n: string, hours: number) => {
      const p = path.join(tmp, n)
      fs.mkdirSync(p)
      fs.writeFileSync(path.join(p, 'f'), 'x')
      age(p, hours)
      return p
    }
    const deadOld = mkdir('agent-browser-chrome-dead', 5)
    const profOld = mkdir('agent-browser-profile-dead', 5)
    const nssOld = mkdir('agent-browser-nss-dead', 5)
    const young = mkdir('agent-browser-chrome-young', 0.1)
    const busy = mkdir('agent-browser-chrome-busy', 5)
    const lockLive = mkdir('agent-browser-chrome-lock', 5)
    fs.symlinkSync('host-4242', path.join(lockLive, 'SingletonLock'))
    age(lockLive, 5)
    const unrelated = mkdir('other-thing', 5)
    const ps = path.join(home, 'ps.txt')
    fs.writeFileSync(ps, [
      `100 /x/Chrome --user-data-dir=${busy} --no-first-run`,
      `4242 /x/Chrome --headless`,
      `300 /bin/zsh`,
    ].join('\n'))

    const dry = run(['--dry-run'], tmp, ps)
    expect(dry.status).toBe(0)
    expect(dry.stdout).toContain(`would remove ${deadOld}`)
    for (const p of [deadOld, profOld, nssOld, young, busy, lockLive, unrelated]) expect(fs.existsSync(p)).toBe(true)
    expect(run([], tmp, ps).stdout).toContain('[dry-run]')

    const applied = run(['--apply'], tmp, ps)
    expect(applied.status).toBe(0)
    for (const p of [deadOld, profOld, nssOld]) expect(fs.existsSync(p)).toBe(false)
    for (const p of [young, busy, lockLive, unrelated]) expect(fs.existsSync(p)).toBe(true)
    expect(run(['--apply'], tmp, ps).status).toBe(0)
  })

  it('selects orphan Chrome only when no daemon runs, and never kills with a fake process list', () => {
    const tmp = fs.mkdtempSync(path.join(home, 'tmp-'))
    const ps = path.join(home, 'ps.txt')
    fs.writeFileSync(ps, `999999 /x/Chrome for Testing --user-data-dir=/var/tmp/agent-browser-chrome-abc --type=gpu\n`)
    expect(run(['--apply'], tmp, ps).stdout).toContain('would kill orphan Chrome pid 999999')
    fs.writeFileSync(ps, `999999 /x/Chrome --user-data-dir=/var/tmp/agent-browser-chrome-abc\n77 /usr/lib/agent-browser-linux-x64 daemon\n`)
    const out = run(['--apply'], tmp, ps).stdout
    expect(out).not.toContain('orphan Chrome pid')
    expect(out).toContain('left alone')
  })
})
