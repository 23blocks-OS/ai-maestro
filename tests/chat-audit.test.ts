/**
 * Findings from a full audit of the chat subsystem, 18 September 2026.
 *
 * Prompted by a user who had reported a different chat bug on four consecutive
 * days and asked, reasonably, for an audit instead of another patch. These are
 * the defects found by reading every state transition rather than waiting for the
 * next report — several of them are mine, from the fixes earlier in the week.
 *
 * F1  ChatView cleared pending bubbles only on the FIRST history load, yet every
 *     history push contains the sent message. Any reconnect or tab switch
 *     re-rendered the real message and left the "Sending…" bubble beside it.
 *     Persisting bubbles in v0.38.16 made that permanent instead of transient.
 *
 * F2  The incremental clear required EXACT string equality. Text that has been
 *     through a terminal comes back re-flowed.
 *
 * F3  MobileChatView cleared ALL pending on any incoming batch, so unrelated
 *     agent output marked a message delivered that may never have landed — the
 *     unearned-success pattern wearing a different hat.
 *
 * F4  The question path returned `sent = true` before the deferred send ran, so a
 *     socket dropping during the 400ms settle window failed silently.
 *
 * F5  MobileChatView's dedup was `!m.uuid || !seen.has(m.uuid)` — a uuid-less
 *     message always passed, so an overlapping batch appended it again.
 *
 * F6  `permission_request` was sticky on the CLIENT against every later state,
 *     including a concrete `waiting_for_input`. One false positive pinned the
 *     card, clearable only by an assistant message an idle agent never produces —
 *     the client-side twin of the server deadlock fixed in v0.38.15.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { reconcilePending } from '@/lib/pending-reconcile.mjs'

const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
const chatView = () => read('components/ChatView.tsx')
const mobile = () => read('components/MobileChatView.tsx')

const text = (t: string) => ({ type: 'user', message: { content: [{ type: 'text', text: t }] } })
const extract = (m: any) =>
  (m?.message?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ')

describe('F1/F2 — a bubble clears when its own text lands, however it arrives', () => {
  it('clears on an exact echo', () => {
    const pending = [{ id: '1', text: 'hello there', status: 'sending' }]
    expect(reconcilePending(pending, [text('hello there')], extract)).toHaveLength(0)
  })

  it('clears despite re-flowed whitespace — the terminal wraps', () => {
    const pending = [{ id: '1', text: 'a message that got wrapped', status: 'sending' }]
    expect(reconcilePending(pending, [text('a message   that got\nwrapped')], extract)).toHaveLength(0)
  })

  it('does NOT clear a different message', () => {
    const pending = [{ id: '1', text: 'mine', status: 'sending' }]
    expect(reconcilePending(pending, [text('something else')], extract)).toHaveLength(1)
  })

  it('clears only the matching bubble when several are pending', () => {
    const pending = [
      { id: '1', text: 'first', status: 'sending' },
      { id: '2', text: 'second', status: 'sending' },
    ]
    const left = reconcilePending(pending, [text('second')], extract)
    expect(left.map((p: any) => p.id)).toEqual(['1'])
  })

  it('reconciles on EVERY history push, not just the first load', () => {
    // The duplicate: history always contains the sent message.
    const src = chatView()
    const hist = src.slice(src.indexOf("case 'chat:history'"), src.indexOf("case 'chat:messages'"))
    expect(hist).toContain('clearEchoedPending')
  })
})

describe('F3 — an unrelated message never marks yours delivered', () => {
  it('assistant output does not clear a pending bubble', () => {
    const pending = [{ id: '1', text: 'mine', status: 'sending' }]
    const assistant = { type: 'assistant', message: { content: [{ type: 'text', text: 'mine' }] } }
    expect(reconcilePending(pending, [assistant], extract)).toHaveLength(1)
  })

  it('MobileChatView no longer clears everything on any batch', () => {
    const src = mobile()
    const inc = src.slice(src.indexOf("case 'chat:messages'"), src.indexOf("case 'chat:hookState'"))
    expect(inc).not.toMatch(/setPendingMessages\(\[\]\)/)
    expect(inc).toContain('reconcilePending')
  })
})

describe('F4 — a deferred send is not reported before it happens', () => {
  it('does not hardcode success on the question path', () => {
    const src = chatView()
    expect(src).not.toMatch(/setTimeout\(doSend[^)]*\),\s*true\)/)
  })

  it('marks the bubble failed when the deferred send cannot go out', () => {
    const src = chatView()
    const send = src.slice(src.indexOf('const doSend ='), src.indexOf('inputRef.current?.focus()'))
    expect(send).toMatch(/if \(!doSend\(\)\)/)
    expect(send).toMatch(/status: 'failed'/)
  })
})

describe('F5 — a message without a uuid cannot duplicate', () => {
  it('MobileChatView dedups by content when uuid is absent', () => {
    const src = mobile()
    expect(src).not.toMatch(/!m\.uuid \|\| !existingUuids/)
    expect(src).toMatch(/m\.uuid \|\| `\$\{m\.type\}/)
  })
})

describe('F6 — the client does not out-stick the server', () => {
  it('a concrete non-permission status clears a permission card', () => {
    const src = chatView()
    const block = src.slice(src.indexOf("case 'chat:hookState'"), src.indexOf("case 'chat:sent'"))
    // sticky ONLY against null, not against every other status
    expect(block).toMatch(/newState === null\) return prev/)
  })

  it('a null state does not drop a live permission card', () => {
    const src = chatView()
    const block = src.slice(src.indexOf("case 'chat:hookState'"), src.indexOf("case 'chat:sent'"))
    expect(block).toContain("prev?.status === 'permission_request'")
  })
})

/**
 * F7 — a message sent while the agent is BUSY never cleared its bubble.
 *
 * Found by verifying the F1 fix against a live agent rather than a fixture. The
 * message delivered fine (`verified: true`, text above the input box) but the
 * bubble did not reconcile, because Claude Code had QUEUED it and recorded it as
 * an attachment rather than a user turn:
 *
 *   { type: 'attachment', attachment: { type: 'queued_command', prompt: '…' } }
 *
 * `ChatView` consumes a `queue-operation` shape in nine places. Nothing ever
 * produced it — the parser passed the attachment straight through. So a queued
 * message neither rendered as queued nor cleared its pending bubble; it spun for
 * 30 seconds and then claimed "Not confirmed" about a message that was fine.
 *
 * That live transcript held five `queued_command` entries, every one invisible to
 * the chat. This is the most common case in normal use, because people type while
 * their agent is working.
 */
describe('F7 — a queued command is a real message', () => {
  const queued = (prompt: string, uuid = 'u1') => JSON.stringify({
    type: 'attachment', uuid, timestamp: '2026-09-19T18:21:15Z',
    attachment: { type: 'queued_command', prompt },
  })

  it('parses into the queue-operation shape the UI already renders', async () => {
    const { parseJsonlLines } = await import('@/lib/chat-transcript.mjs')
    const [m] = parseJsonlLines([queued('do the thing')], 100)
    expect(m.type).toBe('queue-operation')
    expect(m.operation).toBe('enqueue')
    expect(m.content).toBe('do the thing')
  })

  it('clears the pending bubble for the message that was queued', async () => {
    const { parseJsonlLines } = await import('@/lib/chat-transcript.mjs')
    const msgs = parseJsonlLines([queued('do the thing')], 100)
    const pending = [{ id: '1', text: 'do the thing', status: 'sending' }]
    expect(reconcilePending(pending, msgs, (m: any) => m.content || '')).toHaveLength(0)
  })

  it('does not clear a DIFFERENT pending message', async () => {
    const { parseJsonlLines } = await import('@/lib/chat-transcript.mjs')
    const msgs = parseJsonlLines([queued('something else')], 100)
    const pending = [{ id: '1', text: 'do the thing', status: 'sending' }]
    expect(reconcilePending(pending, msgs, (m: any) => m.content || '')).toHaveLength(1)
  })

  it('leaves other attachment kinds alone — only queued_command is a message', async () => {
    const { parseJsonlLines } = await import('@/lib/chat-transcript.mjs')
    const other = JSON.stringify({
      type: 'attachment', uuid: 'u2',
      attachment: { type: 'total_tokens_reminder', value: 1 },
    })
    const out = parseJsonlLines([other], 100)
    expect(out.filter((m: any) => m.type === 'queue-operation')).toHaveLength(0)
  })

  it('survives a queued_command with no prompt', async () => {
    const { parseJsonlLines } = await import('@/lib/chat-transcript.mjs')
    const bad = JSON.stringify({ type: 'attachment', attachment: { type: 'queued_command' } })
    expect(() => parseJsonlLines([bad], 100)).not.toThrow()
  })
})
