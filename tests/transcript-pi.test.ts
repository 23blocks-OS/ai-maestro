/**
 * Tests for lib/transcript-pi.mjs and the Pi path through parseJsonlLines
 * (F036 item 4, mirrors transcript-grok.test.ts). The fixtures are REAL session
 * files written by Pi 1.2.0 (`@earendil-works/pi-coding-agent`) running against
 * a local fake OpenAI-compatible model server, so the model text is canned but
 * the file format is Pi's own. They are sanitised: cwd made generic, system
 * prompt prose elided. session.jsonl comes from print mode (-p, five turns
 * continued with -c), session-tui.jsonl from the interactive TUI in tmux.
 *
 * Not seen in a real file (docs only): compaction / branch_summary entries.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  isPiLine, piLineToMessages, piGroupDirName, resolvePiTranscriptForDir,
  piLiveStatus, piLiveStatusFromFile,
} from '@/lib/transcript-pi.mjs'
import { parseJsonlLines, resolveJsonlPath } from '@/lib/chat-transcript.mjs'

const read = (f: string) => fs.readFileSync(path.join(__dirname, 'fixtures', 'pi', f), 'utf-8').split('\n').filter(Boolean)
const lines = read('session.jsonl')
const tuiLines = read('session-tui.jsonl')

describe('isPiLine', () => {
  it('recognises every entry type found in a real session', () => {
    const types = new Set<string>()
    for (const l of lines) {
      const o = JSON.parse(l)
      expect(isPiLine(o)).toBe(true)
      types.add(o.type)
    }
    expect([...types].sort()).toEqual(['context_edit', 'message', 'model_change', 'session', 'thinking_level_change'])
  })
  it('rejects Claude, codex and grok lines', () => {
    expect(isPiLine({ type: 'assistant', uuid: 'x', message: { role: 'assistant', content: [] } })).toBe(false)
    expect(isPiLine({ type: 'user', message: { role: 'user', content: 'hi' } })).toBe(false)
    expect(isPiLine({ type: 'response_item', payload: {} })).toBe(false)
    expect(isPiLine({ method: 'session/update', params: { update: { sessionUpdate: 'x' } } })).toBe(false)
    expect(isPiLine({ type: 'message', id: 'a', message: { role: 'martian' } })).toBe(false)
    expect(isPiLine(null)).toBe(false)
  })
})

describe('parseJsonlLines on a real Pi session', () => {
  const msgs = parseJsonlLines(lines, 1000) as any[]
  const kinds = msgs.map(m => m.type)

  it('yields only chat: user, thinking, assistant, tool_result_marker', () => {
    expect(new Set(kinds)).toEqual(new Set(['user', 'assistant', 'thinking', 'tool_result_marker']))
  })
  it('maps the user prompts in order', () => {
    const users = msgs.filter(m => m.type === 'user').map(m => m.message.content[0].text)
    expect(users).toEqual(['hello there', 'THINK about life', 'RUNLS please', 'RUNFAIL please', 'BOOM now', 'and a final plain turn'])
  })
  it('maps an assistant text reply', () => {
    const a = msgs.find(m => m.type === 'assistant' && m.message.content[0].text?.startsWith('Hello from the fake model'))
    expect(a.message.role).toBe('assistant')
    expect(a.timestamp).toBe('2026-10-14T14:15:37.886Z')
  })
  it('maps a thinking block before its answer, with a derived uuid', () => {
    const i = kinds.indexOf('thinking')
    expect(msgs[i].thinking).toBe('Let me consider the question carefully.')
    expect(msgs[i].uuid).toMatch(/#thinking-0$/)
    expect(msgs[i + 1].message.content[0].text).toBe('After thinking, the answer is 42.')
  })
  it('maps a bash tool call as a Bash tool_use and pairs the result by toolCallId', () => {
    const useMsg = msgs.find(m => m.type === 'assistant' && m.message.content.some((b: any) => b.type === 'tool_use'))
    expect(useMsg.message.content[0]).toEqual({ type: 'text', text: 'Let me run that.' })
    const use = useMsg.message.content[1]
    expect(use).toMatchObject({ type: 'tool_use', id: 'call_fake_1', name: 'Bash', input: { command: 'ls' } })
    const marker = msgs[msgs.indexOf(useMsg) + 1]
    expect(marker.type).toBe('tool_result_marker')
    expect(marker.tool_use_id).toBe('call_fake_1')
  })
  it('a failed tool still closes the call (isError result)', () => {
    const uses = msgs.filter(m => m.type === 'assistant' && m.message.content.some((b: any) => b.type === 'tool_use'))
    expect(uses).toHaveLength(2)
    expect(uses[1].message.content[1].input.command).toBe('cat /definitely/not/here.txt')
    expect(msgs[msgs.indexOf(uses[1]) + 1].type).toBe('tool_result_marker')
  })
  it('shows a model error as visible assistant text, once per attempt', () => {
    const errs = msgs.filter(m => m.type === 'assistant' && m.message.content[0].text?.startsWith('Pi error:'))
    expect(errs).toHaveLength(4) // Pi retried the failing request three times
    expect(errs[0].message.content[0].text).toContain('fake upstream failure')
  })
  it('drops the system prompt, header, model/thinking changes and context_edit', () => {
    expect(JSON.stringify(msgs)).not.toContain('elided')
    expect(msgs.some(m => m.type === 'session' || m.type === 'context_edit' || m.type === 'model_change')).toBe(false)
  })
  it('gives every message a unique uuid', () => {
    const ids = msgs.map(m => m.uuid)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('reads a session written by the interactive TUI the same way', () => {
    const t = parseJsonlLines(tuiLines, 100) as any[]
    expect(t.map(m => m.type)).toEqual(['user', 'assistant', 'tool_result_marker', 'assistant', 'user', 'thinking', 'assistant'])
    expect(t[0].message.content[0].text).toBe('RUNLS interactive hello')
  })
})

describe('partial, garbage and delta input', () => {
  it('skips garbage and half-written lines without dropping the good ones', () => {
    const good = lines[4] // first user message
    const out = parseJsonlLines(['{"type":"message","id":"zz","mess', 'not json at all', '', good, '{'], 100) as any[]
    expect(out).toHaveLength(1)
    expect(out[0].message.content[0].text).toBe('hello there')
  })
  it('parses a live-watcher delta that has no session header', () => {
    const delta = lines.slice(5, 7) // assistant reply to turn 1 + next user message
    const out = parseJsonlLines(delta, 50) as any[]
    expect(out.map(m => m.type)).toEqual(['assistant', 'user'])
  })
  it('keeps only the last `limit` messages of a big session', () => {
    const big = Array.from({ length: 500 }, () => lines.slice(4)).flat()
    const out = parseJsonlLines(big, 200) as any[]
    expect(out).toHaveLength(200)
    expect(out[199].message.content[0].text).toContain('and a final plai')
  })
  it('handles a very large system message line and a user message given as a plain string', () => {
    const huge = JSON.stringify({ type: 'message', id: 'h1', parentId: null, timestamp: 't', message: { role: 'system', content: '', sections: { preamble: 'x'.repeat(2_000_000) } } })
    const str = JSON.stringify({ type: 'message', id: 'u1', parentId: 'h1', timestamp: 't', message: { role: 'user', content: 'plain string' } })
    const out = parseJsonlLines([huge, str], 10) as any[]
    expect(out).toHaveLength(1)
    expect(out[0].message.content[0].text).toBe('plain string')
  })
  it('maps file tools: path becomes file_path, unknown names pass through (shape from Pi tool schemas)', () => {
    const e = { type: 'message', id: 'a1', parentId: null, timestamp: 't', message: { role: 'assistant', content: [
      { type: 'toolCall', id: 'c1', name: 'read', arguments: { path: '/x/y.ts' } },
      { type: 'toolCall', id: 'c2', name: 'custom_thing', arguments: {} },
    ] } }
    const [m] = piLineToMessages(e) as any[]
    expect(m.message.content[0]).toMatchObject({ name: 'Read', input: { path: '/x/y.ts', file_path: '/x/y.ts' } })
    expect(m.message.content[1].name).toBe('custom_thing')
  })
  it('maps a compaction entry to a summary (documented shape, not seen in a real file)', () => {
    const [m] = piLineToMessages({ type: 'compaction', id: 'c1', parentId: 'p', timestamp: 't', summary: 'earlier work', firstKeptEntryId: 'x', tokensBefore: 1 }) as any[]
    expect(m).toMatchObject({ type: 'summary', summary: 'earlier work' })
  })
})

describe('piLiveStatus', () => {
  const upTo = (n: number) => lines.slice(0, n)
  it('is working after the user sends, idle after the reply', () => {
    expect(piLiveStatus(upTo(5))).toBe('working') // header .. user "hello there"
    expect(piLiveStatus(upTo(6))).toBe('idle')
  })
  it('is working after a tool call and after its result, idle after the final text', () => {
    const iCall = lines.findIndex(l => l.includes('"stopReason":"toolUse"'))
    expect(piLiveStatus(lines.slice(0, iCall + 1))).toBe('working')
    expect(piLiveStatus(lines.slice(0, iCall + 2))).toBe('working')
    expect(piLiveStatus(lines.slice(0, iCall + 3))).toBe('idle')
  })
  it('is working while Pi retries after an error, idle once it gave up', () => {
    const iErr = lines.findIndex(l => l.includes('"stopReason":"error"'))
    expect(piLiveStatus(lines.slice(0, iErr + 1))).toBe('idle')
    expect(piLiveStatus(lines.slice(0, iErr + 2))).toBe('working') // context_edit
  })
  it('is null with nothing conversational, and reads the tail of a file', () => {
    expect(piLiveStatus(upTo(3))).toBeNull()
    const f = path.join(os.tmpdir(), `pi-status-${process.pid}.jsonl`)
    fs.writeFileSync(f, lines.join('\n') + '\n')
    try { expect(piLiveStatusFromFile(f, 2048)).toBe('idle') } finally { fs.rmSync(f) }
    expect(piLiveStatusFromFile('/nonexistent/file.jsonl')).toBeNull()
  })
})

describe('resolvePiTranscriptForDir', () => {
  let home: string
  const prev = { dir: process.env.PI_CODING_AGENT_DIR, sd: process.env.PI_CODING_AGENT_SESSION_DIR }
  beforeEach(() => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pi-home-')))
    process.env.PI_CODING_AGENT_DIR = home
    delete process.env.PI_CODING_AGENT_SESSION_DIR
  })
  afterEach(() => {
    if (prev.dir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = prev.dir
    if (prev.sd === undefined) delete process.env.PI_CODING_AGENT_SESSION_DIR; else process.env.PI_CODING_AGENT_SESSION_DIR = prev.sd
    fs.rmSync(home, { recursive: true, force: true })
  })

  const header = (cwd: string) => JSON.stringify({ type: 'session', version: 3, id: 'abc', timestamp: 't', cwd })
  const mk = (dir: string, name: string, cwd: string, mtimeSec: number) => {
    fs.mkdirSync(dir, { recursive: true })
    const f = path.join(dir, name)
    fs.writeFileSync(f, header(cwd) + '\n' + lines.slice(1).join('\n') + '\n')
    fs.utimesSync(f, mtimeSec, mtimeSec)
    return f
  }

  it('encodes the group dir name the way Pi does (verified: / becomes -, wrapped in --)', () => {
    expect(piGroupDirName('/Users/me/my-proj')).toBe('--Users-me-my-proj--')
    expect(piGroupDirName('C:\\work\\x')).toBe('--C--work-x--')
  })
  it('finds the newest session in the cwd group', () => {
    const cwd = '/work/my proj_1'
    const group = path.join(home, 'sessions', piGroupDirName(cwd))
    mk(group, '2026-01-01T00-00-00-000Z_old.jsonl', cwd, 1000)
    const newest = mk(group, '2026-01-02T00-00-00-000Z_new.jsonl', cwd, 2000)
    expect(resolvePiTranscriptForDir(cwd)?.path).toBe(newest)
  })
  it('ignores other cwds, and a group name collision (/a/b-c vs /a-b/c)', () => {
    mk(path.join(home, 'sessions', piGroupDirName('/other')), 's.jsonl', '/other', 1000)
    expect(resolvePiTranscriptForDir('/work/none')).toBeNull()
    mk(path.join(home, 'sessions', piGroupDirName('/a/b-c')), 's.jsonl', '/a/b-c', 1000)
    expect(resolvePiTranscriptForDir('/a-b/c')).toBeNull()
  })
  it('returns null when Pi has no sessions at all', () => {
    expect(resolvePiTranscriptForDir('/work/x')).toBeNull()
    expect(resolvePiTranscriptForDir(null as any)).toBeNull()
  })
  it('matches the real path when the registry holds a symlinked working directory', () => {
    const real = fs.mkdtempSync(path.join(home, 'real-'))
    const link = path.join(home, 'link')
    fs.symlinkSync(real, link)
    const f = mk(path.join(home, 'sessions', piGroupDirName(real)), 's.jsonl', real, 1000)
    expect(resolvePiTranscriptForDir(link)?.path).toBe(f)
  })
  it('honours PI_CODING_AGENT_SESSION_DIR, where Pi writes flat and the header decides', () => {
    const flat = path.join(home, 'flat')
    process.env.PI_CODING_AGENT_SESSION_DIR = flat
    mk(flat, 'a.jsonl', '/proj/a', 3000)
    const b = mk(flat, 'b.jsonl', '/proj/b', 1000)
    expect(resolvePiTranscriptForDir('/proj/b')?.path).toBe(b)
  })
  it('resolveJsonlPath dispatches pi, pi-agent and pi-coding-agent here, and not "api"', () => {
    const cwd = '/work/p'
    const f = mk(path.join(home, 'sessions', piGroupDirName(cwd)), 's.jsonl', cwd, 1000)
    for (const program of ['pi', 'pi-agent', 'Pi', 'pi-coding-agent']) {
      expect(resolveJsonlPath({ program, workingDirectory: cwd })?.path).toBe(f)
    }
    expect(resolveJsonlPath({ program: 'api-tool', workingDirectory: cwd })).toBeNull()
  })
})
