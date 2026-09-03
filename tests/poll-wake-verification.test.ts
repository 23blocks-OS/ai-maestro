/**
 * The SECOND wake path — the 5-minute inbox poll — and why it needed the same
 * fix as the first.
 *
 * `Agent.checkMessages()` runs every 5 minutes, and when it finds unread mail
 * it calls `triggerMessageCheck()`, which POSTs to the session command endpoint
 * and reports success on HTTP 200. HTTP 200 proves `sendKeys` returned, which
 * proves bytes reached tmux — exactly the unearned claim that made the message
 * wake report eight deaf agents as delivered, surviving untouched in a second
 * implementation nobody had looked at.
 *
 * It matters more than the first one, not less. When a push wake stages in an
 * input box and never submits, THIS is what rescues it five minutes later —
 * which is how the failure stayed invisible for months. Measured on a customer
 * estate: four agents a push wake had not woken all answered 4m22s–4m31s after
 * the message, clustered within 9 seconds. That is a 5-minute poll, not a push.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRuntime = {
  sendKeys: vi.fn().mockResolvedValue(undefined),
  capturePane: vi.fn().mockResolvedValue(''),
  sessionExists: vi.fn().mockResolvedValue(true),
  cancelCopyMode: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/lib/agent-runtime', () => ({ getRuntime: vi.fn(() => mockRuntime) }))

const state = vi.hoisted(() => ({ sessionActivity: new Map<string, number>(), agentActivity: new Map() }))
vi.mock('@/services/shared-state', () => state)

import { sendCommand } from '@/services/sessions-service'

const SESSION = 'agent-0'
const PROMPT = 'You have a new message from alice about "deploy failed". Please check your inbox.'

/** Submitted: the prompt is echoed ABOVE the input box. */
const SUBMITTED = `> ${PROMPT}\n\n  On it.\n\n╭────╮\n│ >  │\n╰────╯`
/** Staged: it is still sitting IN the input box. */
const STAGED = `  earlier output\n╭────╮\n│ > ${PROMPT}\n╰────╯`

beforeEach(() => {
  vi.clearAllMocks()
  state.sessionActivity.clear()
  mockRuntime.sessionExists.mockResolvedValue(true)
  mockRuntime.sendKeys.mockResolvedValue(undefined)
})

describe('sendCommand — unverified by default', () => {
  it('does not read the pane back unless asked', async () => {
    // Canvas, chat inject and meeting inject all use this route and send text
    // that is not expected to echo like a prompt. Polling for them is waste.
    const res = await sendCommand(SESSION, PROMPT, { requireIdle: false })
    expect(res.data).toMatchObject({ success: true })
    expect(mockRuntime.capturePane).not.toHaveBeenCalled()
  })

  it('reports no verdict when it did not verify', async () => {
    const res = await sendCommand(SESSION, PROMPT, { requireIdle: false })
    expect((res.data as any)?.submitted).toBeUndefined()
    expect((res.data as any)?.staged).toBeUndefined()
  })
})

describe('sendCommand — verify: true', () => {
  it('confirms submission when the prompt lands above the input box', async () => {
    mockRuntime.capturePane.mockResolvedValue(SUBMITTED)
    const res = await sendCommand(SESSION, PROMPT, { requireIdle: false, verify: true })
    expect(res.data).toMatchObject({ submitted: true, staged: false })
  })

  it('reports STAGED when the prompt is still in the input box', async () => {
    // This is the case the poll used to report as success.
    mockRuntime.capturePane.mockResolvedValue(STAGED)
    const res = await sendCommand(SESSION, PROMPT, { requireIdle: false, verify: true })
    expect(res.data).toMatchObject({ submitted: false, staged: true })
  })

  it('reports neither when the pane shows something else entirely', async () => {
    mockRuntime.capturePane.mockResolvedValue('unrelated output\n> ')
    const res = await sendCommand(SESSION, PROMPT, { requireIdle: false, verify: true })
    expect(res.data).toMatchObject({ submitted: false, staged: false })
  })

  it('still reports success — the send happened, only the proof is separate', async () => {
    // `success` means the command was issued. It must never be read as
    // "the agent received it"; that is what `submitted` is for.
    mockRuntime.capturePane.mockResolvedValue(STAGED)
    const res = await sendCommand(SESSION, PROMPT, { requireIdle: false, verify: true })
    expect(res.data).toMatchObject({ success: true })
  })

  it('waits for a slow render instead of calling it absent', async () => {
    // The lesson 3Metas paid for: they judged four agents deaf using a 2m19s
    // window when their own measured response time was 3m48s. A window shorter
    // than the thing it measures can only say ABSENT, never SLOW.
    mockRuntime.capturePane
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('  still rendering\n> ')
      .mockResolvedValue(SUBMITTED)
    const res = await sendCommand(SESSION, PROMPT, { requireIdle: false, verify: true })
    expect(res.data).toMatchObject({ submitted: true })
  })

  it('does not verify when no Enter was sent — there is nothing to submit', async () => {
    await sendCommand(SESSION, PROMPT, { requireIdle: false, verify: true, addNewline: false })
    expect(mockRuntime.capturePane).not.toHaveBeenCalled()
  })
})

/**
 * Recovery on the poll path — the fix that actually addresses eleven hours.
 *
 * 3Metas captured the verbatim staged text from eight panes before anything was
 * cleared. Seven read "…check your inbox", which is THIS poll's wording — the
 * push path's format is "[MESSAGE] {subject} — from {from}" and contains the
 * phrase nowhere.
 *
 * So the five-minute poll was never a reliable channel quietly rescuing failed
 * pushes. It is the same dropped keystroke, retried every five minutes, failing
 * identically each time — which is how one agent stayed deaf from 20:09 to
 * 07:00 with over a hundred attempts, each typing on top of the last.
 *
 * 0.37.10 gave this path VERIFICATION. It did not give it RECOVERY, so it could
 * see the failure and did nothing about it.
 */
describe('sendCommand — recovery when the text stages', () => {
  it('clears the input box before retyping, rather than typing on top', () => {
    // A hundred nudges typed on top of one another is what the field data
    // actually showed. Clear first, then retype.
    return (async () => {
      mockRuntime.capturePane.mockResolvedValue(STAGED)
      await sendCommand(SESSION, PROMPT, { requireIdle: false, verify: true })
      const keys = mockRuntime.sendKeys.mock.calls.map((c: any[]) => c[1])
      expect(keys).toContain('C-u')
      const clearAt = keys.indexOf('C-u')
      expect(keys.slice(clearAt).some((k: string) => k.includes('check your inbox'))).toBe(true)
    })()
  })

  it('does not clear on the first attempt — nothing is staged yet', async () => {
    mockRuntime.capturePane.mockResolvedValue(SUBMITTED)
    await sendCommand(SESSION, PROMPT, { requireIdle: false, verify: true })
    expect(mockRuntime.sendKeys.mock.calls.map((c: any[]) => c[1])).not.toContain('C-u')
  })

  it('reports submitted when the clear-and-retype gets through', async () => {
    // Their measurement: Enter once fails, Enter twice fails, clear-and-retype
    // then Enter succeeds 7 of 7.
    mockRuntime.capturePane
      .mockResolvedValueOnce(STAGED)
      .mockResolvedValue(SUBMITTED)
    const res = await sendCommand(SESSION, PROMPT, { requireIdle: false, verify: true })
    expect(res.data).toMatchObject({ submitted: true })
  })

  it('gives up after one retry rather than hammering the pane', async () => {
    mockRuntime.capturePane.mockResolvedValue(STAGED)
    const res = await sendCommand(SESSION, PROMPT, { requireIdle: false, verify: true })
    expect(res.data).toMatchObject({ submitted: false, staged: true })
    // initial send + one clear + one retype
    expect(mockRuntime.sendKeys.mock.calls.filter((c: any[]) => c[1] === 'C-u').length).toBe(1)
  })

  it('does not retry when the pane simply shows something else', async () => {
    // Not staged means the text is not sitting in the box, so a clear-and-retype
    // would be a duplicate rather than a recovery.
    mockRuntime.capturePane.mockResolvedValue('unrelated output\n> ')
    await sendCommand(SESSION, PROMPT, { requireIdle: false, verify: true })
    expect(mockRuntime.sendKeys.mock.calls.map((c: any[]) => c[1])).not.toContain('C-u')
  })
})
