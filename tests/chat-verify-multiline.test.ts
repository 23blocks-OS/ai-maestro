import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// @ts-expect-error plain .mjs
import { deliverAndVerify, MAX_SENDS } from '@/lib/chat-verify.mjs'
// @ts-expect-error plain .mjs
import { paneInputEmpty, paneSubmittedPrefix } from '@/lib/pane-readback.mjs'

// #663 (reported 2026-10-22): a multi-line message to a Claude Code agent arrived twice. The first copy was
// submitted, but the pane showed `[Pasted text #1 +4 lines]` (or the echo had scrolled out of view), so the
// whole message never matched; it was neither "submitted" nor "staged" and the loop sent again.
const MSG = 'Please review the deploy plan:\n1. build\n2. migrate\n3. restart\nthen report back'
const BOX = '────────────\n❯ \n────────────'
const run = async (panes: string[]) => {
  const io = {
    deliver: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    capture: vi.fn().mockImplementation(async () => panes.length > 1 ? panes.shift()! : panes[0]),
  }
  const p = deliverAndVerify(MSG, io)
  await vi.runAllTimersAsync()
  return { result: await p, io }
}

describe('multi-line delivery is not repeated', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not resend when the paste was collapsed and the box is empty', async () => {
    const { result, io } = await run([`● [Pasted text #1 +4 lines]\n\n${BOX}`])
    expect(io.deliver).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ submitted: true, attempts: 1 })
  })

  it('accepts the first line echoed above the box as proof', async () => {
    const { result, io } = await run([`● Please review the deploy plan:\n  …\n\n${BOX}`])
    expect(io.deliver).toHaveBeenCalledTimes(1)
    expect(result.submitted).toBe(true)
  })

  it('still retries when the text is staged in the box', async () => {
    const stuck = `● earlier\n\n────────────\n❯ ${MSG.replace(/\n/g, ' ')}\n────────────`
    const { result, io } = await run([stuck])
    expect(io.deliver).toHaveBeenCalledTimes(MAX_SENDS)
    expect(io.clear).toHaveBeenCalled()
    expect(result.submitted).toBe(false)
  })

  it('does not call a dialog holding the keyboard an empty box', async () => {
    const dialog = '● working\n\nDo you want to proceed?\n❯ 1. Yes\n  2. No'
    const { result } = await run([dialog])
    expect(result.submitted).toBe(false)
  })

  it('does not guess when there is no prompt line at all', async () => {
    const { result } = await run(['some output with no input box'])
    expect(result.submitted).toBe(false)
  })
})

describe('pane helpers', () => {
  it('paneInputEmpty: empty box yes, text no, dialog option no, no prompt no', () => {
    expect(paneInputEmpty(`out\n${BOX}`)).toBe(true)
    expect(paneInputEmpty('out\n│ > │')).toBe(true)
    expect(paneInputEmpty('out\n❯ hello')).toBe(false)
    expect(paneInputEmpty('out\n❯ 1. Yes')).toBe(false)
    expect(paneInputEmpty('no prompt here')).toBe(false)
  })
  it('paneSubmittedPrefix ignores a first line that is too short to mean anything', () => {
    expect(paneSubmittedPrefix('● ok\n\n❯ ', 'ok\nlonger second line')).toBe(false)
  })
})
