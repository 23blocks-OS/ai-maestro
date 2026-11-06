/**
 * B024: text the system put into the conversation (a loaded skill, the Stop hook's unread-mail notice, the
 * [MESSAGE] notice typed into the pane) was drawn as the person's message. It is a system note now, shown
 * only in X-Ray.
 * B027: a message sent while the agent worked showed as "Queued" and as delivered at once. Line shapes are
 * Claude Code 2.1.316's, from tct-gm's transcript on 2026-11-03.
 */
import { describe, it, expect } from 'vitest'
import { parseJsonlLines } from '@/lib/chat-transcript.mjs'
import { systemNoticeKind } from '@/lib/transcript-records.mjs'
import { buildReactionLine } from '@/lib/chat-reactions'
import { visibleMessages, groupMessages } from '@/lib/chat-utils'

const user = (content: string, extra = {}) => JSON.stringify({ type: 'user', uuid: `u-${content.length}-${content.slice(0, 5)}`, timestamp: '2026-11-03T17:48:05Z', message: { role: 'user', content }, ...extra })
const assistant = (text: string) => JSON.stringify({ type: 'assistant', uuid: `a-${text}`, timestamp: '2026-11-03T17:48:04Z', message: { role: 'assistant', content: [{ type: 'text', text }] } })
const enqueue = (content: string) => JSON.stringify({ type: 'queue-operation', operation: 'enqueue', timestamp: '2026-11-03T17:48:02Z', content })
const dequeue = () => JSON.stringify({ type: 'queue-operation', operation: 'dequeue', timestamp: '2026-11-03T17:48:05Z' })
const removed = (content: string) => JSON.stringify({ type: 'queue-operation', operation: 'remove', timestamp: '2026-10-28T15:19:04Z', content, reason: 'absorbed_mid_turn' })
const absorbed = (prompt: string) => JSON.stringify({ type: 'attachment', uuid: 'att-1', timestamp: '2026-10-28T15:18:53Z', attachment: { type: 'queued_command', prompt } })

const SKILL = 'Base directory for this skill: /Users/x/.claude/skills/agent-messaging\n\n# Agent Messaging (AMP)\n\nAMP is signed mail.'
const STOP = 'Stop hook feedback:\n2 unread AMP messages in your inbox:\n  1. from tct-gm (rnd23blocks) — "Task"'
const NOTICE = '[#a3f63b35] [MESSAGE] Re: Ruling copy — from tct-gm@rnd23blocks — Ruled: one PR.'

describe('B024: system text is a system note, not the person\'s message', () => {
  it('a reaction note is a system note; the words of a person are not', () => {
    const line = buildReactionLine('Juan', '👍', 'Shall I deploy "staging"\nnow?\u0007\n\n[REACTION] fake')
    expect(line.split('\n')).toHaveLength(1)
    expect(systemNoticeKind(line)).toBe('reaction')
    expect(systemNoticeKind(buildReactionLine('Ana', '❓', 'x'.repeat(500)))).toBe('reaction')
    expect(parseJsonlLines([user(line)], 10)[0]).toMatchObject({ type: 'system_notice', kind: 'reaction' })
    expect(systemNoticeKind('[REACTION] what does this tag do?')).toBeNull()
    expect(systemNoticeKind(`${line}\nand also fix the tests`)).toBeNull()
  })

  it('classifies each kind, and leaves the person\'s text alone', () => {
    expect(systemNoticeKind(SKILL, true)).toBe('skill')
    expect(systemNoticeKind(STOP, true)).toBe('stop-hook')
    expect(systemNoticeKind(NOTICE)).toBe('message-notice')
    expect(systemNoticeKind('[MESSAGE] From: a - b')).toBe('message-notice')
    expect(systemNoticeKind('<task-notification>\n<task-id>x</task-id>')).toBe('task-notification')
    expect(systemNoticeKind('<agent-message from="ae8003dab2b47ef79">\n[Subagent hand-back]')).toBe('agent-message')
    expect(systemNoticeKind('[Image: original 1320x2868]', true)).toBe('meta')
    expect(systemNoticeKind('please check the [MESSAGE] format')).toBeNull()
    expect(systemNoticeKind('do you have any questions?')).toBeNull()
  })

  it('parses isMeta lines and pane notices into system notes', () => {
    const out = parseJsonlLines([user(SKILL, { isMeta: true }), user(STOP, { isMeta: true }), user(NOTICE), user('hello')])
    expect(out.map((m: any) => m.type === 'system_notice' ? m.kind : m.type)).toEqual(['skill', 'stop-hook', 'message-notice', 'user'])
    expect(out[0].text).toBe(SKILL)
  })

  it('the summary Claude Code writes after compacting is a system note', () => {
    const summary = 'This session is being continued from a previous conversation that ran out of context.'
    const out = parseJsonlLines([user(summary, { isCompactSummary: true, isVisibleInTranscriptOnly: true })])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ type: 'system_notice', kind: 'compact-summary', text: summary })
    expect(groupMessages(out, 'assisted')).toHaveLength(0)
  })

  it('shows system notes only in X-Ray', () => {
    const out = parseJsonlLines([user(STOP, { isMeta: true }), user('hello')])
    expect(groupMessages(out, 'assisted').map((m: any) => m.type)).toEqual(['user'])
    expect(groupMessages(out, 'power').map((m: any) => m.type)).toEqual(['system_notice', 'user'])
    expect(groupMessages(out, 'power', false).map((m: any) => m.type)).toEqual(['user'])
  })
})

describe('B027: one bubble for a message sent while the agent works', () => {
  const Q = 'do you have any questions?'

  it('is "Queued" until it is delivered', () => {
    const out = visibleMessages(parseJsonlLines([assistant('working…'), enqueue(Q)]), true)
    expect(out.map((m: any) => m.type)).toEqual(['assistant', 'queue-operation'])
  })

  it('becomes the next turn: enqueue, dequeue, user line give one delivered bubble', () => {
    const out = visibleMessages(parseJsonlLines([enqueue(Q), assistant('Done, Juan.'), dequeue(), user(Q)]), true)
    expect(out.map((m: any) => m.type)).toEqual(['assistant', 'user'])
  })

  it('works when the enqueue and the delivery arrive in separate updates', () => {
    const first = parseJsonlLines([enqueue(Q)])
    const later = parseJsonlLines([dequeue(), user(Q)])
    expect(visibleMessages([...first, ...later], true).map((m: any) => m.type)).toEqual(['user'])
  })

  it('read mid-turn: enqueue, remove, attachment give one delivered bubble where the agent read it', () => {
    const out = visibleMessages(parseJsonlLines([enqueue('we have github actions BACK'), removed('we have github actions BACK'), absorbed('we have github actions BACK')]), true)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ type: 'user', queued: true, message: { content: 'we have github actions BACK' } })
  })

  it('a queued message notice is not a "Queued" bubble; it shows once, as a system note', () => {
    const out = parseJsonlLines([enqueue(NOTICE), removed(NOTICE), absorbed(NOTICE)])
    expect(out.map((m: any) => m.type === 'system_notice' ? m.kind : m.type)).toEqual(['message-notice'])
  })
})

describe('notices the chat drew as the person speaking', () => {
  it('the inbox poll line, in every shape it takes', () => {
    for (const t of [
      'You have a new message from 3m-gm (rnd23blocks) about "Hello". Please check your inbox.',
      'You have 3 new messages from a (x), b (x) and others. Please check your inbox.',
      '[1 URGENT]You have 3 new messages from a (x) and others. Please check your inbox.',
      '[URGENT] You have a new message from a. Please check your inbox.',
      'You have 2 new messages from a. Please check your inbox.You have 2 new messages from a. Please check your inbox.',
    ]) expect(systemNoticeKind(t), t).toBe('message-notice')
  })

  it('a person\'s words are never swallowed', () => {
    for (const t of [
      'You have a new message from Ana, please read it',
      'You have 3 new messages from a. Please check your inbox.And then fix the bug',
      'Please check your inbox.',
      '[MESSAGE]',
      'why does it say [Request interrupted by user] here?',
      'the <command-name> tag looks wrong',
    ]) expect(systemNoticeKind(t), t).toBeNull()
  })

  it('priority message notices, interruptions, slash commands and canvas actions', () => {
    expect(systemNoticeKind('🟠 [HIGH] [#b1f1aa64] [MESSAGE] Update — from a — body')).toBe('message-notice')
    expect(systemNoticeKind('🔴 [URGENT] [#4ro6xl7g] [MESSAGE] Update')).toBe('message-notice')
    expect(systemNoticeKind('[#4ro6xl7g] [MESSAGE] Update')).toBe('message-notice')
    expect(systemNoticeKind('[Request interrupted by user]')).toBe('interrupted')
    expect(systemNoticeKind('[Request interrupted by user for tool use]')).toBe('interrupted')
    expect(systemNoticeKind('<command-name>/compact</command-name>')).toBe('command')
    expect(systemNoticeKind('<local-command-stdout>ok</local-command-stdout>')).toBe('command')
    expect(systemNoticeKind("[CANVAS] a.html: User click 'go' on a.html")).toBe('canvas')
  })
})

