/**
 * Tests for lib/transcript-grok.mjs and the grok path through parseJsonlLines
 * (F028, mirrors transcript-codex.test.ts). The fixture is a trimmed REAL
 * updates.jsonl captured from a live Grok Build 1.0.46 session.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { isGrokLine, grokLineToMessages, resolveGrokTranscriptForDir } from '@/lib/transcript-grok.mjs'
import { parseJsonlLines, resolveJsonlPath } from '@/lib/chat-transcript.mjs'

const FIXTURE = path.join(__dirname, 'fixtures', 'grok', 'updates.jsonl')
const lines = fs.readFileSync(FIXTURE, 'utf-8').split('\n').filter(Boolean)

const upd = (update: Record<string, unknown>, eventId = 'e1') => ({
  timestamp: 1791310165, method: 'session/update',
  params: { sessionId: 's', update, _meta: { eventId } },
})

describe('isGrokLine', () => {
  it('recognises grok session updates, both methods', () => {
    expect(isGrokLine(JSON.parse(lines[2]))).toBe(true)
    expect(isGrokLine(JSON.parse(lines[0]))).toBe(true) // _x.ai/session/update
  })
  it('rejects Claude and codex lines', () => {
    expect(isGrokLine({ type: 'assistant', message: { content: [] } })).toBe(false)
    expect(isGrokLine({ type: 'response_item', payload: {} })).toBe(false)
    expect(isGrokLine(null)).toBe(false)
  })
})

describe('parseJsonlLines on a real grok session', () => {
  const msgs = parseJsonlLines(lines, 100)

  it('yields user, assistant, tool_use, marker, assistant — no metadata', () => {
    expect(msgs.map((m: any) => m.type)).toEqual([
      'user', 'assistant', 'assistant', 'tool_result_marker', 'assistant',
    ])
  })
  it('maps the user prompt', () => {
    expect((msgs[0] as any).message.content[0].text).toBe('Run the shell command: touch askme.txt')
  })
  it('maps the tool call as a Bash tool_use and pairs the result by toolCallId', () => {
    const use = (msgs[2] as any).message.content[0]
    expect(use.type).toBe('tool_use')
    expect(use.name).toBe('Bash')
    expect(use.input.command).toBe('touch askme.txt && ls -la askme.txt')
    expect((msgs[3] as any).tool_use_id).toBe(use.id)
  })
  it('does not leak the internal merge marker', () => {
    for (const m of msgs as any[]) expect(m._grokChunk).toBeUndefined()
  })
  it('gives every message a unique uuid', () => {
    const ids = (msgs as any[]).map(m => m.uuid)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('chunk merging', () => {
  it('merges adjacent chunks of one message, not across a tool call', () => {
    const batch = [
      upd({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hel' } }, 'a'),
      upd({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'lo' } }, 'b'),
      upd({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'x', rawInput: {} }, 'c'),
      upd({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'done' } }, 'd'),
    ].map(o => JSON.stringify(o))
    const msgs = parseJsonlLines(batch, 100) as any[]
    expect(msgs.map(m => m.type)).toEqual(['assistant', 'assistant', 'assistant'])
    expect(msgs[0].message.content[0].text).toBe('Hello')
    expect(msgs[2].message.content[0].text).toBe('done')
  })
  it('a pending tool_call_update (no completion) makes no marker', () => {
    expect(grokLineToMessages(upd({ sessionUpdate: 'tool_call_update', toolCallId: 't', title: 'x' }))).toEqual([])
  })
  it('a failed tool_call_update closes the call', () => {
    const [m] = grokLineToMessages(upd({ sessionUpdate: 'tool_call_update', toolCallId: 't', status: 'failed' })) as any[]
    expect(m.type).toBe('tool_result_marker')
  })
  it('skips hook_execution and turn_completed', () => {
    expect(grokLineToMessages(upd({ sessionUpdate: 'hook_execution', event_name: 'stop' }))).toEqual([])
    expect(grokLineToMessages(upd({ sessionUpdate: 'turn_completed' }))).toEqual([])
  })
})

describe('resolveGrokTranscriptForDir', () => {
  let home: string
  const prev = process.env.GROK_HOME
  beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-home-')); process.env.GROK_HOME = home })
  afterEach(() => {
    if (prev === undefined) delete process.env.GROK_HOME; else process.env.GROK_HOME = prev
    fs.rmSync(home, { recursive: true, force: true })
  })

  const mkSession = (group: string, id: string, mtimeSec: number) => {
    const d = path.join(home, 'sessions', group, id)
    fs.mkdirSync(d, { recursive: true })
    const f = path.join(d, 'updates.jsonl')
    fs.writeFileSync(f, lines.join('\n'))
    fs.utimesSync(f, mtimeSec, mtimeSec)
    return f
  }

  it('finds the newest session in the URL-encoded cwd group', () => {
    const cwd = '/work/my proj_1'
    mkSession(encodeURIComponent(cwd), 'old', 1000)
    const newest = mkSession(encodeURIComponent(cwd), 'new', 2000)
    expect(resolveGrokTranscriptForDir(cwd)?.path).toBe(newest)
  })
  it('ignores other cwds and returns null with no sessions', () => {
    mkSession(encodeURIComponent('/other'), 's', 1000)
    expect(resolveGrokTranscriptForDir('/work/none')).toBeNull()
  })
  it('falls back to a .cwd file for a >255-byte encoded path', () => {
    const cwd = '/' + 'a'.repeat(300)
    const f = mkSession('slug-abc123', 's', 1000)
    fs.writeFileSync(path.join(home, 'sessions', 'slug-abc123', '.cwd'), cwd + '\n')
    expect(resolveGrokTranscriptForDir(cwd)?.path).toBe(f)
  })
  it('resolveJsonlPath dispatches a grok agent here', () => {
    const cwd = '/work/g'
    const f = mkSession(encodeURIComponent(cwd), 's', 1000)
    expect(resolveJsonlPath({ program: 'grok', workingDirectory: cwd })?.path).toBe(f)
  })
})
