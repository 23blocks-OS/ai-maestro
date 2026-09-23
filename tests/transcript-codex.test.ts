/**
 * Tests for lib/transcript-codex.mjs and the codex path through parseJsonlLines
 * — the codex half of multi-provider chat (F004).
 *
 * The chat renders one message shape. Codex writes a completely different
 * on-disk schema ({timestamp, ordinal, type, payload}) than Claude Code, so the
 * whole feature rests on one thing: mapping codex events onto that shared shape
 * correctly, and NOT rendering the parts that are metadata, setup, a duplicate
 * view, or encrypted. These lock that mapping down against the real schema
 * observed in the corpus.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  isCodexLine,
  codexLineToMessages,
  resolveCodexTranscriptForDir,
  codexLiveStatus,
  codexLiveStatusFromFile,
} from '@/lib/transcript-codex.mjs'
import { parseJsonlLines } from '@/lib/chat-transcript.mjs'

const env = (type: string, payload: unknown, ts = '2026-09-22T19:00:00Z', ordinal = 0) =>
  ({ timestamp: ts, ordinal, type, payload })

const msg = (role: string, text: string, id = 'm1') =>
  env('response_item', { type: 'message', role, id, content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }] })

describe('isCodexLine — telling the two schemas apart', () => {
  it('recognises a codex envelope', () => {
    expect(isCodexLine(env('response_item', { type: 'message', role: 'user', content: [] }))).toBe(true)
    expect(isCodexLine(env('session_meta', { cwd: '/x' }))).toBe(true)
  })
  it('rejects a Claude message', () => {
    expect(isCodexLine({ type: 'assistant', message: { content: [] }, uuid: 'u' })).toBe(false)
    expect(isCodexLine({ type: 'summary', summary: 'x' })).toBe(false)
  })
  it('rejects junk', () => {
    expect(isCodexLine(null)).toBe(false)
    expect(isCodexLine({ type: 'response_item' })).toBe(false) // no payload
    expect(isCodexLine({ payload: {}, type: 'nope' })).toBe(false)
  })
})

describe('codexLineToMessages — the mapping', () => {
  it('maps a user message', () => {
    const [m] = codexLineToMessages(msg('user', 'do the thing'))
    expect(m.type).toBe('user')
    expect(m.message.content[0]).toEqual({ type: 'text', text: 'do the thing' })
  })

  it('maps an assistant message', () => {
    const [m] = codexLineToMessages(msg('assistant', 'on it'))
    expect(m.type).toBe('assistant')
    expect(m.message.content[0].text).toBe('on it')
  })

  it('SKIPS developer/system setup messages', () => {
    expect(codexLineToMessages(msg('developer', '<skills_instructions>...'))).toEqual([])
    expect(codexLineToMessages(msg('system', 'setup'))).toEqual([])
  })

  it('SKIPS injected AGENTS.md context posing as a user message', () => {
    // Codex injects the AGENTS.md preamble as a `user` turn; it is not typed by
    // the person and would swamp the chat.
    expect(codexLineToMessages(msg('user', '# AGENTS.md instructions for /x\n...'))).toEqual([])
  })

  it('SKIPS encrypted reasoning (nothing to show)', () => {
    expect(codexLineToMessages(env('response_item', { type: 'reasoning', summary: [], encrypted_content: 'xxxx' }))).toEqual([])
  })

  it('maps a custom_tool_call to an assistant tool_use, keyed by call_id', () => {
    const [m] = codexLineToMessages(env('response_item', {
      type: 'custom_tool_call', call_id: 'call_9', name: 'exec', input: 'cat AGENTS.md',
    }))
    expect(m.type).toBe('assistant')
    expect(m.message.content[0]).toMatchObject({ type: 'tool_use', id: 'call_9', name: 'exec' })
    expect(m.message.content[0].input).toEqual({ command: 'cat AGENTS.md' })
  })

  it('maps an OLD function_call too, parsing its JSON arguments', () => {
    const [m] = codexLineToMessages(env('response_item', {
      type: 'function_call', call_id: 'call_x', name: 'wait', arguments: '{"cell_id":"17","yield_time_ms":1000}',
    }))
    expect(m.message.content[0]).toMatchObject({ type: 'tool_use', id: 'call_x', name: 'wait' })
    expect(m.message.content[0].input).toEqual({ cell_id: '17', yield_time_ms: 1000 })
  })

  it('maps a tool output to a completion marker keyed by the same call_id', () => {
    const [m] = codexLineToMessages(env('response_item', { type: 'custom_tool_call_output', call_id: 'call_9', output: '...' }))
    expect(m).toEqual(expect.objectContaining({ type: 'tool_result_marker', tool_use_id: 'call_9' }))
  })

  it('maps an inter-agent agent_message as assistant', () => {
    const [m] = codexLineToMessages(env('response_item', {
      type: 'agent_message', content: [{ type: 'input_text', text: 'Message Type: MESSAGE...' }],
    }))
    expect(m.type).toBe('assistant')
  })

  it('IGNORES the event_msg mirror and metadata', () => {
    expect(codexLineToMessages(env('event_msg', { type: 'item_completed', item: { item_type: 'AgentMessage' } }))).toEqual([])
    expect(codexLineToMessages(env('session_meta', { cwd: '/x' }))).toEqual([])
    expect(codexLineToMessages(env('token_usage_record', {}))).toEqual([])
    expect(codexLineToMessages(env('turn_context', {}))).toEqual([])
  })

  it('skips a message with no text', () => {
    expect(codexLineToMessages(msg('assistant', ''))).toEqual([])
  })
})

describe('parseJsonlLines routes codex lines (the integration seam)', () => {
  it('parses a mixed delta of codex lines into the shared shape', () => {
    const lines = [
      JSON.stringify(env('session_meta', { cwd: '/x', base_instructions: 'x'.repeat(20000) })),
      JSON.stringify(msg('user', 'hello', 'u1')),
      JSON.stringify(env('response_item', { type: 'reasoning', summary: [], encrypted_content: 'z' })),
      JSON.stringify(env('response_item', { type: 'custom_tool_call', call_id: 'c1', name: 'exec', input: 'ls' })),
      JSON.stringify(env('response_item', { type: 'custom_tool_call_output', call_id: 'c1', output: 'a\nb' })),
      JSON.stringify(msg('assistant', 'done', 'a1')),
    ]
    const out = parseJsonlLines(lines, 200)
    const types = out.map((m: any) => m.type)
    // user, assistant(tool_use), tool_result_marker, assistant(text) — meta &
    // reasoning dropped.
    expect(types).toEqual(['user', 'assistant', 'tool_result_marker', 'assistant'])
    expect(out[0].message.content[0].text).toBe('hello')
    expect(out[3].message.content[0].text).toBe('done')
  })

  it('still parses Claude lines unchanged (no regression)', () => {
    const claude = JSON.stringify({
      type: 'assistant', timestamp: 't', uuid: 'u',
      message: { role: 'assistant', content: [{ type: 'text', text: 'claude here' }] },
    })
    const out = parseJsonlLines([claude], 200)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('assistant')
    expect(out[0].message.content[0].text).toBe('claude here')
  })
})

describe('resolveCodexTranscriptForDir — locating by session cwd', () => {
  let home: string
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-'))
    spy = vi.spyOn(os, 'homedir').mockReturnValue(home)
  })
  afterEach(() => { spy.mockRestore(); fs.rmSync(home, { recursive: true, force: true }) })

  function writeRollout(rel: string, cwd: string, bigMeta = false) {
    const dir = path.join(home, '.codex', 'sessions', path.dirname(rel))
    fs.mkdirSync(dir, { recursive: true })
    const full = path.join(home, '.codex', 'sessions', rel)
    const meta = env('session_meta', { cwd, ...(bigMeta ? { base_instructions: 'x'.repeat(50000) } : {}) })
    fs.writeFileSync(full, JSON.stringify(meta) + '\n' + JSON.stringify(msg('user', 'hi')) + '\n')
    return full
  }

  it('finds the rollout whose session_meta cwd matches', () => {
    writeRollout('2026/09/22/rollout-a.jsonl', '/Users/me/other')
    const target = writeRollout('2026/09/22/rollout-b.jsonl', '/Users/me/project')
    const f = resolveCodexTranscriptForDir('/Users/me/project')
    expect(f?.path).toBe(target)
  })

  it('reads a session_meta larger than 8KB (the real-world case)', () => {
    // base_instructions makes line 1 tens of KB; a fixed small read truncated it.
    const target = writeRollout('2026/09/22/rollout-big.jsonl', '/Users/me/big', true)
    expect(resolveCodexTranscriptForDir('/Users/me/big')?.path).toBe(target)
  })

  it('returns null when no session matches the directory', () => {
    writeRollout('2026/09/22/rollout-a.jsonl', '/Users/me/other')
    expect(resolveCodexTranscriptForDir('/Users/me/nope')).toBeNull()
  })

  it('returns null when ~/.codex/sessions does not exist', () => {
    expect(resolveCodexTranscriptForDir('/anything')).toBeNull()
  })

  it('picks the NEWEST matching rollout when a dir has several sessions', () => {
    const older = writeRollout('2026/09/20/rollout-old.jsonl', '/Users/me/p')
    const newer = writeRollout('2026/09/22/rollout-new.jsonl', '/Users/me/p')
    // make newer genuinely newer
    const past = new Date(Date.now() - 100000)
    fs.utimesSync(older, past, past)
    expect(resolveCodexTranscriptForDir('/Users/me/p')?.path).toBe(newer)
  })
})

describe('codexLiveStatus — the live "working" signal (Phase 2)', () => {
  const started = JSON.stringify(env('event_msg', { type: 'task_started', turn_id: '1' }))
  const complete = JSON.stringify(env('event_msg', { type: 'task_complete', turn_id: '1' }))
  const noise = JSON.stringify(msg('assistant', 'thinking out loud'))

  it('is working when the last turn event is task_started', () => {
    expect(codexLiveStatus([started, noise])).toBe('working')
  })

  it('is idle when the last turn event is task_complete', () => {
    expect(codexLiveStatus([started, noise, complete])).toBe('idle')
  })

  it('uses the LAST turn event across many turns', () => {
    expect(codexLiveStatus([started, complete, started, complete, started])).toBe('working')
    expect(codexLiveStatus([started, complete, started, complete])).toBe('idle')
  })

  it('is null when there is no turn event to read', () => {
    expect(codexLiveStatus([noise, JSON.stringify(msg('user', 'hi'))])).toBeNull()
    expect(codexLiveStatus([])).toBeNull()
  })

  it('ignores non-event_msg lines that merely contain the words', () => {
    // A message whose TEXT says "task_started" must not be read as a turn event.
    const decoy = JSON.stringify(msg('assistant', 'I will run task_started now'))
    expect(codexLiveStatus([complete, decoy])).toBe('idle')
  })

  it('tolerates malformed lines', () => {
    expect(codexLiveStatus(['{bad json', started])).toBe('working')
  })
})

describe('codexLiveStatusFromFile — tail read', () => {
  let dir: string
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexstat-')) })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('reads the status from the end of a large file', () => {
    const f = path.join(dir, 'rollout.jsonl')
    const filler = Array.from({ length: 5000 }, (_, i) =>
      JSON.stringify(env('response_item', { type: 'message', role: 'assistant', id: `m${i}`, content: [{ type: 'output_text', text: 'x'.repeat(50) }] }))
    ).join('\n')
    fs.writeFileSync(f, filler + '\n' + JSON.stringify(env('event_msg', { type: 'task_started' })) + '\n')
    expect(codexLiveStatusFromFile(f)).toBe('working')
  })

  it('returns null for a missing file', () => {
    expect(codexLiveStatusFromFile(path.join(dir, 'nope.jsonl'))).toBeNull()
  })
})
