/**
 * Tests for paneCardBelongsToTranscriptQuestion — the LAST place in the chat
 * that resolved a target by screen position instead of by identity.
 *
 * THE CLASS (same shape as the amp-reply "head -1" misroute)
 *
 * A tmux menu carries no id. detectPermissionFromPane parses whatever menu is on
 * the pane and produces a clickable card with `source: 'pane'` and NO tool_use
 * id. The transcript AskUserQuestion card is governed by identity
 * (isQuestionAnswered / isQuestionCurrent, keyed on tool_use id); the pane card,
 * having no id, is governed only by "is a menu on screen". So an answered
 * question — correctly hidden on the transcript path — could still draw from the
 * pane path. "The question I answered hours ago is back."
 *
 * The fix recovers identity from what the menu SAYS: if the pane card's option
 * labels match the transcript's last AskUserQuestion, it belongs to that
 * question and the caller defers to the (identity-governed) transcript card. If
 * it matches nothing — a genuine "Allow Edit?" tool-permission prompt with no
 * AskUserQuestion behind it — the pane card is the only representation and must
 * still render.
 */

import { describe, it, expect } from 'vitest'
import { paneCardBelongsToTranscriptQuestion } from '@/lib/question-state.mjs'

const ask = (options: string[], id = 'toolu_ask_1') => ({
  type: 'assistant',
  message: {
    content: [{
      type: 'tool_use', id, name: 'AskUserQuestion',
      input: { questions: [{ question: 'Which?', options: options.map((label) => ({ label })) }] },
    }],
  },
})

const paneCard = (labels: string[]) => ({
  status: 'permission_request',
  source: 'pane',
  options: labels.map((label, i) => ({ key: String(i + 1), label, value: 'yes' })),
})

describe('paneCardBelongsToTranscriptQuestion — belongs (defer to transcript)', () => {
  it('matches a pane card to the transcript AskUserQuestion with the same options', () => {
    const messages = [ask(['Ship it now', 'Wait for review', 'Cancel'])]
    const card = paneCard(['Ship it now', 'Wait for review', 'Cancel'])
    expect(paneCardBelongsToTranscriptQuestion(messages, card)).toBe(true)
  })

  it('matches despite terminal truncation of a long label (the 200-char cap)', () => {
    const long = 'Deploy to production and notify the on-call engineer before the window closes'
    const messages = [ask([long, 'Not yet'])]
    const card = paneCard([long.slice(0, 40) + '…', 'Not yet'])
    expect(paneCardBelongsToTranscriptQuestion(messages, card)).toBe(true)
  })

  it('matches despite whitespace reflow from the terminal', () => {
    const messages = [ask(['Roll   forward', 'Roll back'])]
    const card = paneCard(['Roll forward', 'Roll back'])
    expect(paneCardBelongsToTranscriptQuestion(messages, card)).toBe(true)
  })

  it('uses the LAST AskUserQuestion, not an older one', () => {
    const messages = [ask(['Apples', 'Oranges'], 'old'), ask(['Ship it', 'Hold'], 'current')]
    expect(paneCardBelongsToTranscriptQuestion(messages, paneCard(['Ship it', 'Hold']))).toBe(true)
    // The old question's options must NOT match the current pane menu.
    expect(paneCardBelongsToTranscriptQuestion(messages, paneCard(['Apples', 'Oranges']))).toBe(false)
  })
})

describe('paneCardBelongsToTranscriptQuestion — does NOT belong (pane card must render)', () => {
  it('a genuine tool-permission prompt has no AskUserQuestion behind it', () => {
    // "Allow Edit?" style prompt — Yes/No, no matching transcript question.
    const messages = [ask(['Ship it now', 'Wait for review'])]
    const card = paneCard(['Yes', "No, and tell Claude what to do differently"])
    expect(paneCardBelongsToTranscriptQuestion(messages, card)).toBe(false)
  })

  it('no AskUserQuestion in the transcript at all', () => {
    const messages = [{ type: 'assistant', message: { content: [{ type: 'text', text: 'working' }] } }]
    expect(paneCardBelongsToTranscriptQuestion(messages, paneCard(['Yes', 'No']))).toBe(false)
  })

  it('a pane card with no options never belongs', () => {
    const messages = [ask(['A', 'B'])]
    expect(paneCardBelongsToTranscriptQuestion(messages, { status: 'permission_request', options: [] })).toBe(false)
  })

  it('options that only partially overlap do not count as belonging', () => {
    // Every pane option must correspond to an ask option; a stray one fails it.
    const messages = [ask(['Ship it', 'Hold'])]
    const card = paneCard(['Ship it', 'Hold', 'Delete everything'])
    expect(paneCardBelongsToTranscriptQuestion(messages, card)).toBe(false)
  })

  it('is defensive about malformed input', () => {
    expect(paneCardBelongsToTranscriptQuestion(null as never, null as never)).toBe(false)
    expect(paneCardBelongsToTranscriptQuestion([], undefined as never)).toBe(false)
    expect(paneCardBelongsToTranscriptQuestion([ask(['A'])], { options: null } as never)).toBe(false)
  })
})

describe('the reported bug: answered question does not resurrect from the pane', () => {
  it('a pane card matching an answered question belongs to it → caller suppresses it', () => {
    // The transcript card is already hidden by isQuestionAnswered; this ensures
    // the pane card is recognised as the SAME question so it is suppressed too.
    const messages = [ask(['Ship it now', 'Wait for review'], 'toolu_answered')]
    const card = paneCard(['Ship it now', 'Wait for review'])
    // "Belongs" is true regardless of answered-state — identity is by content;
    // the answered-check happens on the transcript path. Together: no card.
    expect(paneCardBelongsToTranscriptQuestion(messages, card)).toBe(true)
  })
})
