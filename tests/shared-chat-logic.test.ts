/**
 * The two modules extracted on 15 September 2026, after nine releases in one day.
 *
 * WHAT WAS DUPLICATED, AND WHAT WAS NOT
 *
 * `ChatView` and `MobileChatView` are deliberately different LAYOUTS — merging
 * them would produce one component full of branching markup, which is worse than
 * two. Likewise the two `sendChatMessage` wrappers have genuinely different jobs:
 * one resolves an agent and guards against a bare shell, the other handles tmux
 * copy-mode and the permission cache.
 *
 * What was duplicated was the LOGIC inside them:
 *
 *   - question answered/live rules → lib/question-state.mjs
 *     (fixed in ChatView in v0.38.13, then again in MobileChatView in v0.38.14;
 *      in between, the bug was live for anyone whose layoutOverride put them on
 *      the mobile renderer — including on a desktop browser)
 *
 *   - the verify/clear/retype loop → lib/chat-verify.mjs
 *     (written twice the same day, so it could only ever be fixed in one path)
 */

import { describe, it, expect, vi } from 'vitest'
import {
  askUserQuestionIn, isQuestionAnswered, isQuestionCurrent, isQuestionSettled,
} from '@/lib/question-state.mjs'
import { deliverAndVerify, NOT_SUBMITTED_MESSAGE, MAX_SENDS } from '@/lib/chat-verify.mjs'

const ask = (id: string) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input: { questions: [] } }] },
})
const marker = (id: string) => ({ type: 'tool_result_marker', tool_use_id: id })
const said = (t = 'ok') => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } })
const WAITING = { status: 'waiting_for_input' }

describe('question state — one rule set for both renderers', () => {
  it('finds the AskUserQuestion block', () => {
    expect(askUserQuestionIn(ask('t1'))?.id).toBe('t1')
    expect(askUserQuestionIn(said())).toBeNull()
  })

  it('reads answered-ness from the transcript marker, which survives a reload', () => {
    expect(isQuestionAnswered([ask('t1'), marker('t1')], 't1')).toBe(true)
    expect(isQuestionAnswered([ask('t1')], 't1')).toBe(false)
  })

  it('still honours the in-session set', () => {
    expect(isQuestionAnswered([ask('t1')], 't1', new Set(['t1']))).toBe(true)
  })

  it('is live while it is the last question and nothing has been said since', () => {
    expect(isQuestionCurrent([ask('t1')], 't1', WAITING)).toBe(true)
  })

  it('is NOT live once the agent has spoken', () => {
    expect(isQuestionCurrent([ask('t1'), said()], 't1', WAITING)).toBe(false)
  })

  it('is NOT live when a newer question superseded it', () => {
    expect(isQuestionCurrent([ask('t1'), ask('t2')], 't1', WAITING)).toBe(false)
  })

  it('is NOT live when the agent is idle rather than waiting', () => {
    expect(isQuestionCurrent([ask('t1')], 't1', { status: 'idle' })).toBe(false)
  })

  it('settles a question that is answered OR no longer live', () => {
    expect(isQuestionSettled([ask('t1'), marker('t1')], 't1', WAITING)).toBe(true)
    expect(isQuestionSettled([ask('t1'), said()], 't1', WAITING)).toBe(true)
    expect(isQuestionSettled([ask('t1')], 't1', WAITING)).toBe(false)
  })
})

describe('deliver and verify — one loop for both send paths', () => {
  const MSG = 'take the demo screenshot for slide 7'
  const above = `● ${MSG}\n────\n❯ \n────`
  const inBox = `● earlier\n────\n❯ ${MSG}\n────`

  it('reports submitted when the text lands above the input box', async () => {
    const io = { capture: vi.fn().mockResolvedValue(above), deliver: vi.fn(), clear: vi.fn() }
    expect((await deliverAndVerify(MSG, io)).submitted).toBe(true)
    expect(io.deliver).toHaveBeenCalledTimes(1)
  })

  it('does NOT report submitted when the text is only staged', async () => {
    const io = { capture: vi.fn().mockResolvedValue(inBox), deliver: vi.fn(), clear: vi.fn() }
    expect((await deliverAndVerify(MSG, io)).submitted).toBe(false)
  })

  it('clears with enough backspaces before retrying', async () => {
    const io = { capture: vi.fn().mockResolvedValue(inBox), deliver: vi.fn(), clear: vi.fn() }
    await deliverAndVerify(MSG, io)
    expect(io.clear).toHaveBeenCalled()
    expect(io.clear.mock.calls[0][0]).toBeGreaterThanOrEqual(MSG.length)
  })

  it('retries exactly once — a dialog will not yield to a third try', async () => {
    const io = { capture: vi.fn().mockResolvedValue(inBox), deliver: vi.fn(), clear: vi.fn() }
    await deliverAndVerify(MSG, io)
    expect(io.deliver).toHaveBeenCalledTimes(MAX_SENDS)
  })

  it('succeeds when the retry lands', async () => {
    const io = {
      capture: vi.fn().mockResolvedValueOnce(inBox).mockResolvedValue(above),
      deliver: vi.fn(), clear: vi.fn(),
    }
    expect((await deliverAndVerify(MSG, io)).submitted).toBe(true)
  })

  it('ignores Claude Code dim placeholder text', async () => {
    // An EMPTY box showing your previous prompt greyed out is not staged text.
    const ghost = `● ${MSG}\n────\n❯ \x1b[2m${MSG}\x1b[0m\n────`
    const io = { capture: vi.fn().mockResolvedValue(ghost), deliver: vi.fn(), clear: vi.fn() }
    expect((await deliverAndVerify(MSG, io)).submitted).toBe(true)
  })

  it('offers an error that names the cause and the fix', () => {
    expect(NOT_SUBMITTED_MESSAGE).toMatch(/never submitted/)
    expect(NOT_SUBMITTED_MESSAGE).toMatch(/terminal/i)
  })
})
