/**
 * Tests for lib/transcript-copilot.mjs and the Copilot path through parseJsonlLines
 * (F038 item 4, mirrors transcript-codex.test.ts and transcript-grok.test.ts).
 *
 * The fixtures in tests/fixtures/copilot are REAL events.jsonl files written by GitHub
 * Copilot CLI 1.0.97 (2026-10-14). They were produced without a GitHub login by running
 * Copilot in bring-your-own-provider mode against a local fake OpenAI-compatible model, so
 * the model's words are canned but every event, field and ordering is Copilot's own. The
 * system prompt is replaced by a placeholder and usage_record events are dropped from all
 * but events-conversation.jsonl; paths are sanitised to /home/dev/work/projX.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  isCopilotLine,
  isCopilotProgram,
  copilotLineToMessages,
  resolveCopilotTranscriptForDir,
  copilotLiveStatus,
  copilotLiveStatusFromFile,
} from '@/lib/transcript-copilot.mjs'
import { parseJsonlLines, resolveJsonlPath } from '@/lib/chat-transcript.mjs'

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', 'copilot', name), 'utf-8').split('\n').filter(Boolean)

const conversation = fixture('events-conversation.jsonl')
const thinking = fixture('events-thinking.jsonl')
const errored = fixture('events-error.jsonl')
const toolFailed = fixture('events-tool-failed.jsonl')
const permissions = fixture('events-permissions.jsonl')

const ev = (type: string, data: Record<string, unknown> = {}, id = Math.random().toString(36).slice(2)) =>
  ({ type, data, id, timestamp: '2026-10-14T14:00:00.000Z', parentId: null })

describe('isCopilotProgram', () => {
  it('matches the whole names the launcher knows, not the gh copilot extension', () => {
    for (const p of ['copilot', 'Copilot', 'copilot-cli', 'GitHub Copilot CLI', 'github-copilot']) expect(isCopilotProgram(p), p).toBe(true)
    for (const p of ['gh copilot', 'copilots', 'claude', 'codex', '', undefined]) expect(isCopilotProgram(p as any), String(p)).toBe(false)
  })
})

describe('isCopilotLine', () => {
  it('recognises real Copilot events of every type in the fixtures', () => {
    for (const l of [...conversation, ...thinking, ...errored, ...toolFailed, ...permissions]) {
      expect(isCopilotLine(JSON.parse(l)), l.slice(0, 60)).toBe(true)
    }
  })
  it('rejects Claude, codex and grok lines', () => {
    expect(isCopilotLine({ type: 'assistant', message: { content: [] } })).toBe(false)
    expect(isCopilotLine({ type: 'user', message: { content: 'hi' }, uuid: 'u' })).toBe(false)
    expect(isCopilotLine({ type: 'response_item', payload: {} })).toBe(false)
    expect(isCopilotLine({ method: 'session/update', params: { update: { sessionUpdate: 'x' } } })).toBe(false)
    expect(isCopilotLine(null)).toBe(false)
    expect(isCopilotLine('str')).toBe(false)
  })
})

describe('parseJsonlLines on a real two-turn Copilot session (with a resume)', () => {
  const msgs = parseJsonlLines(conversation, 100) as any[]

  it('yields user, assistant, user, assistant+tool call, result marker, assistant', () => {
    expect(msgs.map(m => m.type)).toEqual(['user', 'assistant', 'user', 'assistant', 'tool_result_marker', 'assistant'])
  })
  it('uses the text as typed, not the date-stamped transformedContent', () => {
    expect(msgs[0].message.content[0].text).toBe('first question')
    expect(msgs[2].message.content[0].text).toBe('RUNCMD ls')
  })
  it('keeps the assistant text and maps the shell call to a Bash tool_use paired to its marker', () => {
    const blocks = msgs[3].message.content
    expect(blocks[0]).toEqual({ type: 'text', text: 'Let me run that. ' })
    expect(blocks[1].type).toBe('tool_use')
    expect(blocks[1].name).toBe('Bash')
    expect(blocks[1].input.command).toBe('ls')
    expect(msgs[4].tool_use_id).toBe(blocks[1].id)
  })
  it('skips session, turn, usage, system and shutdown events', () => {
    const kinds = new Set(msgs.map(m => m.type))
    expect([...kinds].sort()).toEqual(['assistant', 'tool_result_marker', 'user'])
  })
  it('gives every message a unique uuid and an ISO timestamp', () => {
    const ids = msgs.map(m => m.uuid)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of msgs) expect(Number.isNaN(Date.parse(m.timestamp))).toBe(false)
  })
  it('respects the limit, keeping the newest', () => {
    const last = parseJsonlLines(conversation, 2) as any[]
    expect(last.map(m => m.type)).toEqual(['tool_result_marker', 'assistant'])
  })
})

describe('message kinds', () => {
  it('a reply with reasoningText becomes a thinking message before the assistant message', () => {
    const msgs = parseJsonlLines(thinking, 100) as any[]
    expect(msgs.map(m => m.type)).toEqual(['user', 'thinking', 'assistant'])
    expect(msgs[1].thinking).toBe('Let me think about this. The answer is simple.')
    expect(msgs[2].message.content[0].text).toBe('Answer after thinking.')
    expect(msgs[1].uuid).not.toBe(msgs[2].uuid)
  })

  it('a session.error becomes a summary divider carrying the error text', () => {
    const msgs = parseJsonlLines(errored, 100) as any[]
    expect(msgs.map(m => m.type)).toEqual(['user', 'summary'])
    expect(msgs[1].summary).toMatch(/^Copilot error: Failed to get response from the AI model/)
    expect(msgs[1].summary).toMatch(/500 fake upstream failure/)
  })

  it('a tool call whose command failed still closes with a marker', () => {
    const msgs = parseJsonlLines(toolFailed, 100) as any[]
    const use = msgs.find(m => m.type === 'assistant' && m.message.content.some((b: any) => b.type === 'tool_use'))
    const marker = msgs.find(m => m.type === 'tool_result_marker')
    expect(use.message.content.find((b: any) => b.type === 'tool_use').input.command).toBe('ls /nonexistent_dir')
    expect(marker.tool_use_id).toBe(use.message.content.find((b: any) => b.type === 'tool_use').id)
  })

  it('permission, abort and denied-tool events are not chat, but a denied call is closed', () => {
    const msgs = parseJsonlLines(permissions, 200) as any[]
    expect(msgs.some(m => (m.type as string).startsWith('permission'))).toBe(false)
    const uses = msgs.flatMap(m => m.type === 'assistant' ? m.message.content.filter((b: any) => b.type === 'tool_use') : [])
    const closed = new Set(msgs.filter(m => m.type === 'tool_result_marker').map(m => m.tool_use_id))
    // every call that reached tool.execution_complete (run, denied or edited) has its marker
    const completed = permissions.map(l => JSON.parse(l)).filter(e => e.type === 'tool.execution_complete').map(e => e.data.toolCallId)
    expect(completed.length).toBeGreaterThan(3)
    for (const id of completed) expect(closed.has(id), id).toBe(true)
    expect(uses.length).toBeGreaterThanOrEqual(completed.length)
  })

  it('maps create and edit to the Write and Edit tools ChatView previews', () => {
    const msgs = parseJsonlLines(permissions, 200) as any[]
    const tools = msgs.flatMap(m => m.type === 'assistant' ? m.message.content.filter((b: any) => b.type === 'tool_use') : [])
    const write = tools.find((t: any) => t.name === 'Write')
    const edit = tools.find((t: any) => t.name === 'Edit')
    expect(write.input).toEqual({ file_path: '/home/dev/work/projB/new.txt', content: 'line one\nline two\n' })
    expect(edit.input).toEqual({ file_path: '/home/dev/work/projB/notes.txt', old_string: 'hello b', new_string: 'hello c' })
  })

  it('maps view to Read; an unknown tool keeps its name and arguments', () => {
    const view = copilotLineToMessages(ev('assistant.message', { content: '', toolRequests: [{ toolCallId: 'c1', name: 'view', arguments: { path: '/x/y.ts' } }] })) as any[]
    expect(view[0].message.content).toEqual([{ type: 'tool_use', id: 'c1', name: 'Read', input: { file_path: '/x/y.ts' } }])
    const other = copilotLineToMessages(ev('assistant.message', { content: 'x', toolRequests: [{ toolCallId: 'c2', name: 'sql', arguments: { query: 'select 1' } }] })) as any[]
    expect(other[0].message.content[1]).toEqual({ type: 'tool_use', id: 'c2', name: 'sql', input: { query: 'select 1' } })
  })

  it('empty or whitespace text produces nothing; a message with only a tool call has no empty text block', () => {
    expect(copilotLineToMessages(ev('user.message', { content: '   ' }))).toEqual([])
    expect(copilotLineToMessages(ev('assistant.message', { content: '', toolRequests: [] }))).toEqual([])
    const m = copilotLineToMessages(ev('assistant.message', { content: '', toolRequests: [{ toolCallId: 'c', name: 'bash', arguments: { command: 'ls' } }] })) as any[]
    expect(m[0].message.content).toHaveLength(1)
  })
})

describe('garbage, partial and mixed lines', () => {
  it('skips garbage, a truncated last line and unknown event types', () => {
    const line = conversation[1] // a real user.message
    const batch = ['{not json', '', '   ', line.slice(0, line.length - 20), JSON.stringify(ev('something.new', { a: 1 })), line]
    const msgs = parseJsonlLines(batch, 100) as any[]
    expect(msgs).toHaveLength(1)
    expect(msgs[0].type).toBe('user')
  })

  it('the live watcher case: a delta with no session.start header still parses', () => {
    const delta = conversation.filter(l => {
      const t = JSON.parse(l).type
      return t === 'assistant.message' || t === 'tool.execution_complete'
    })
    const msgs = parseJsonlLines(delta, 100) as any[]
    expect(msgs.length).toBeGreaterThan(0)
    expect(msgs.every(m => ['assistant', 'tool_result_marker'].includes(m.type))).toBe(true)
  })

  it('does not disturb Claude lines in the same batch', () => {
    const claude = JSON.stringify({ type: 'user', uuid: 'cu', timestamp: 't', message: { role: 'user', content: 'hello' } })
    const msgs = parseJsonlLines([claude, conversation[1]], 100) as any[]
    expect(msgs.map(m => m.uuid)).toContain('cu')
    expect(msgs).toHaveLength(2)
  })
})

describe('resolveCopilotTranscriptForDir', () => {
  let home: string
  const prev = process.env.COPILOT_HOME
  beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-home-')); process.env.COPILOT_HOME = home })
  afterEach(() => {
    if (prev === undefined) delete process.env.COPILOT_HOME; else process.env.COPILOT_HOME = prev
    fs.rmSync(home, { recursive: true, force: true })
  })

  const startLine = (cwd: string, pad = 0) => JSON.stringify(ev('session.start', { sessionId: 's', context: { cwd }, pad: 'x'.repeat(pad) }))
  const mkSession = (id: string, cwd: string, mtimeSec: number, opts: { pad?: number; header?: boolean } = {}) => {
    const d = path.join(home, 'session-state', id)
    fs.mkdirSync(d, { recursive: true })
    const f = path.join(d, 'events.jsonl')
    const head = opts.header === false ? 'garbage first line' : startLine(cwd, opts.pad)
    fs.writeFileSync(f, [head, ...conversation.slice(1, 3)].join('\n') + '\n')
    fs.writeFileSync(path.join(d, 'workspace.yaml'), `id: ${id}\ncwd: ${cwd}\n`)
    fs.utimesSync(f, mtimeSec, mtimeSec)
    return f
  }

  it('finds the newest session started in the working directory', () => {
    mkSession('old', '/work/p', 1000)
    const newest = mkSession('new', '/work/p', 2000)
    mkSession('other', '/work/other', 3000)
    expect(resolveCopilotTranscriptForDir('/work/p')?.path).toBe(newest)
    expect(resolveCopilotTranscriptForDir('/work/p')?.name).toBe('events.jsonl')
  })

  it('returns null for no sessions, no match, no working directory or a missing COPILOT_HOME', () => {
    expect(resolveCopilotTranscriptForDir('/work/p')).toBeNull()
    mkSession('a', '/work/a', 1000)
    expect(resolveCopilotTranscriptForDir('/work/none')).toBeNull()
    expect(resolveCopilotTranscriptForDir(null as any)).toBeNull()
    process.env.COPILOT_HOME = path.join(home, 'does-not-exist')
    expect(resolveCopilotTranscriptForDir('/work/a')).toBeNull()
  })

  it('reads a session.start line larger than 64 KB (the line is read to its newline)', () => {
    const f = mkSession('big', '/work/big', 1000, { pad: 200_000 })
    expect(resolveCopilotTranscriptForDir('/work/big')?.path).toBe(f)
  })

  it('falls back to workspace.yaml when the first line is not session.start', () => {
    const f = mkSession('nohead', '/work/y', 1000, { header: false })
    expect(resolveCopilotTranscriptForDir('/work/y')?.path).toBe(f)
  })

  it('matches a symlinked working directory (macOS /tmp is /private/tmp)', () => {
    const real = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-real-'))
    const link = real + '-link'
    fs.symlinkSync(real, link)
    try {
      const f = mkSession('sym', fs.realpathSync(real), 1000)
      expect(resolveCopilotTranscriptForDir(link)?.path).toBe(f)
    } finally {
      fs.rmSync(link, { force: true }); fs.rmSync(real, { recursive: true, force: true })
    }
  })

  it('ignores dot-directories (Copilot keeps lock files in session-state/.session-operation-locks)', () => {
    fs.mkdirSync(path.join(home, 'session-state', '.session-operation-locks'), { recursive: true })
    fs.writeFileSync(path.join(home, 'session-state', '.session-operation-locks', 'x.lock'), '')
    const f = mkSession('s', '/work/p', 1000)
    expect(resolveCopilotTranscriptForDir('/work/p')?.path).toBe(f)
  })

  it('stops after the scan cap on a huge history', () => {
    for (let i = 0; i < 6; i++) mkSession(`s${i}`, i === 0 ? '/work/deep' : '/work/x', 1000 + i)
    // the match is the OLDEST of six; a cap of 3 never reaches it
    expect(resolveCopilotTranscriptForDir('/work/deep', { scanCap: 3 })).toBeNull()
    expect(resolveCopilotTranscriptForDir('/work/deep', { scanCap: 10 })).not.toBeNull()
  })

  it('resolveJsonlPath dispatches a Copilot agent here, and other programs do not', () => {
    const f = mkSession('s', '/work/c', 1000)
    for (const program of ['copilot', 'GitHub Copilot CLI', 'copilot-cli']) {
      expect(resolveJsonlPath({ program, workingDirectory: '/work/c' })?.path, program).toBe(f)
    }
    expect(resolveJsonlPath({ program: 'codex', workingDirectory: '/work/c' })).toBeNull()
    expect(resolveJsonlPath({ program: 'grok', workingDirectory: '/work/c' })).toBeNull()
  })
})

describe('copilotLiveStatus — from the event stream', () => {
  const L = (...events: any[]) => events.map(e => JSON.stringify(e))
  const turn = (n: number) => ev('assistant.turn_start', { turnId: String(n) })
  const end = (n: number) => ev('assistant.turn_end', { turnId: String(n) })
  const say = (toolCalls = 0) => ev('assistant.message', { content: 'x', toolRequests: Array.from({ length: toolCalls }, (_, i) => ({ toolCallId: `c${i}`, name: 'bash', arguments: {} })) })

  it('a finished conversation is idle, and so is a fresh start or a resume', () => {
    expect(copilotLiveStatus(conversation)).toBe('idle') // ends with turn_end + shutdown
    expect(copilotLiveStatus(L(ev('session.start')))).toBe('idle')
    expect(copilotLiveStatus(L(ev('session.start'), ev('session.resume')))).toBe('idle')
  })
  it('an open turn is working', () => {
    expect(copilotLiveStatus(L(ev('session.start'), ev('user.message', { content: 'hi' })))).toBe('working')
    expect(copilotLiveStatus(L(ev('user.message'), turn(0)))).toBe('working')
    expect(copilotLiveStatus(L(turn(0), say(1), ev('tool.execution_start')))).toBe('working')
  })
  it('a turn that ended WITH tool calls is still working (the next turn follows at once)', () => {
    expect(copilotLiveStatus(L(turn(0), say(1), ev('tool.execution_complete'), end(0)))).toBe('working')
    expect(copilotLiveStatus(L(turn(0), say(1), ev('tool.execution_complete'), end(0), turn(1), say(0), end(1)))).toBe('idle')
  })
  it('an unanswered permission request is waiting; answered, it is working again', () => {
    const asked = ev('permission.requested', { requestId: 'r1' })
    expect(copilotLiveStatus(L(turn(0), say(1), ev('tool.execution_start'), asked))).toBe('waiting')
    expect(copilotLiveStatus(L(turn(0), asked, ev('permission.completed', { requestId: 'r1', result: { kind: 'approved' } })))).toBe('working')
    expect(copilotLiveStatus(L(turn(0), asked, ev('permission.completed', { requestId: 'r1', result: { kind: 'denied-interactively-by-user' } })))).toBe('working')
  })
  it('the real permissions session ends idle after the last abort', () => {
    expect(copilotLiveStatus(permissions)).toBe('idle')
    // cut right after the first permission.requested of the real session, it is waiting
    const firstAsk = permissions.findIndex(l => JSON.parse(l).type === 'permission.requested')
    expect(copilotLiveStatus(permissions.slice(0, firstAsk + 1))).toBe('waiting')
  })
  it('abort, an error and a cancelled permission are idle', () => {
    expect(copilotLiveStatus(L(turn(0), ev('abort', { reason: 'user_initiated' })))).toBe('idle')
    expect(copilotLiveStatus(errored)).toBe('idle')
    expect(copilotLiveStatus(L(turn(0), ev('permission.completed', { result: { kind: 'cancelled' } })))).toBe('idle')
  })
  it('does not trust "working" from a log that stopped long ago (Copilot may have died mid-turn)', () => {
    const lines = L(ev('user.message', { content: 'hi' }))
    expect(copilotLiveStatus(lines, { ageMs: 60_000 })).toBe('working')
    expect(copilotLiveStatus(lines, { ageMs: 11 * 60_000 })).toBeNull()
    // a pending question stays a question however long ago it was asked
    expect(copilotLiveStatus(L(ev('permission.requested')), { ageMs: 3_600_000 })).toBe('waiting')
  })
  it('skips usage_record and model_change noise, tolerates garbage, and returns null for nothing', () => {
    expect(copilotLiveStatus(L(ev('user.message'), ev('session.usage_record'), ev('session.model_change')))).toBe('working')
    expect(copilotLiveStatus(['{bad json', ...L(ev('user.message'))])).toBe('working')
    expect(copilotLiveStatus([])).toBeNull()
    expect(copilotLiveStatus(['{bad'])).toBeNull()
  })
})

describe('copilotLiveStatusFromFile — tail read', () => {
  let dir: string
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilotstat-')) })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('reads the status from the end of a large file', () => {
    const f = path.join(dir, 'events.jsonl')
    const filler = Array.from({ length: 6000 }, (_, i) =>
      JSON.stringify(ev('assistant.message', { content: 'x'.repeat(80), toolRequests: [] }, `m${i}`))).join('\n')
    fs.writeFileSync(f, filler + '\n' + JSON.stringify(ev('permission.requested', { requestId: 'r' })) + '\n')
    expect(fs.statSync(f).size).toBeGreaterThan(262144)
    expect(copilotLiveStatusFromFile(f)).toBe('waiting')
  })
  it('a tail that starts mid-line (and a huge last line) does not break it', () => {
    const f = path.join(dir, 'events.jsonl')
    const huge = JSON.stringify(ev('session.usage_record', { pad: 'y'.repeat(400_000) }))
    fs.writeFileSync(f, JSON.stringify(ev('user.message', { content: 'hi' })) + '\n' + huge + '\n')
    // the only recognisable event is before the tail window, so nothing is claimed
    expect(copilotLiveStatusFromFile(f)).toBeNull()
  })
  it('returns null for a missing file', () => {
    expect(copilotLiveStatusFromFile(path.join(dir, 'nope.jsonl'))).toBeNull()
  })
})

// #664: an ask_user elicitation is an ordinary tool call; the chat showed "Working" and no card.
describe('open ask_user (#664)', () => {
  const L = (...events: any[]) => events.map(e => JSON.stringify(e))
  const askReq = (id: string) => ev('assistant.message', {
    content: '', toolRequests: [{ toolCallId: id, name: 'ask_user', arguments: {
      message: 'Which environment should I deploy to?',
      requestedSchema: { type: 'object', properties: { env: { title: 'Environment', type: 'string' }, note: { type: 'string' } } },
    } }],
  })
  const start = (id: string) => ev('tool.execution_start', { toolCallId: id, toolName: 'ask_user', arguments: {} })
  const done = (id: string) => ev('tool.execution_complete', { toolCallId: id, success: true })
  const turn0 = ev('assistant.turn_start', { turnId: '0' })

  it('an unanswered ask_user is waiting, not working, and carries the question and the field names', async () => {
    const { copilotPendingAskUser, askUserCard } = await import('@/lib/transcript-copilot.mjs')
    const lines = L(turn0, askReq('c1'), start('c1'))
    expect(copilotLiveStatus(lines)).toBe('waiting')
    const ask = copilotPendingAskUser(lines)
    expect(ask).toMatchObject({ toolCallId: 'c1', message: 'Which environment should I deploy to?', fields: ['Environment', 'note'] })
    expect(askUserCard(ask)).toMatchObject({ status: 'permission_request', source: 'copilot-ask', toolName: 'ask_user' })
  })
  it('answered, it is working again', async () => {
    const { copilotPendingAskUser } = await import('@/lib/transcript-copilot.mjs')
    const lines = L(turn0, askReq('c1'), start('c1'), done('c1'))
    expect(copilotPendingAskUser(lines)).toBeNull()
    expect(copilotLiveStatus(lines)).toBe('working')
  })
  it('a different tool finishing does not answer it', async () => {
    const { copilotPendingAskUser } = await import('@/lib/transcript-copilot.mjs')
    expect(copilotPendingAskUser(L(turn0, askReq('c1'), start('c1'), done('c9')))).not.toBeNull()
  })
  it('a later user message or abort ends the wait', async () => {
    const { copilotPendingAskUser } = await import('@/lib/transcript-copilot.mjs')
    expect(copilotPendingAskUser(L(turn0, askReq('c1'), start('c1'), ev('user.message', { content: 'never mind' })))).toBeNull()
    expect(copilotPendingAskUser(L(turn0, askReq('c1'), start('c1'), ev('abort', {})))).toBeNull()
  })
  it('a session with no ask_user is untouched', async () => {
    const { copilotPendingAskUser } = await import('@/lib/transcript-copilot.mjs')
    expect(copilotPendingAskUser(permissions)).toBeNull()
  })
})
