/**
 * Tests for sendChatMessage — "I type in the chat and nothing reaches the agent".
 *
 * WHAT HAPPENED (15 September 2026)
 *
 * Claude Code's own session-feedback survey ("How is Claude doing this session?
 * 1: Bad 2: Fine 3: Good 0: Dismiss") was up in an agent's pane, holding the
 * keyboard. Every message sent from the chat UI was typed into the input box and
 * never submitted. The UI reported each one as sent. The person only discovered
 * it by opening a terminal and seeing their words sitting in the box.
 *
 * sendChatMessage ended at `sendKeys` and returned `success: true` without
 * checking anything — the last place in the codebase still reporting a delivery
 * it had not verified, and the one a user actually looks at.
 *
 * The machinery had existed since v0.37.x (paneSubmitted / paneStaged, built for
 * precisely this failure) and had been wired into the AMP notification path only.
 *
 * TWO READBACK TRAPS THIS ALSO COVERS, both of which fooled a live debugging
 * session before the code was written:
 *
 *   1. Claude Code renders your PREVIOUS prompt dim inside an empty input box.
 *      In a plain capture it is indistinguishable from text you typed. Only
 *      `capture-pane -e` separates them, via SGR dim (ESC[2m).
 *   2. `C-u` does not clear that input. A staged line survived two C-u and an
 *      Escape; only backspace removed characters. A clear that does not clear
 *      makes the retry worse than no retry, because the retype APPENDS.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockRuntime = {
  sendKeys: vi.fn().mockResolvedValue(undefined),
  capturePane: vi.fn().mockResolvedValue(''),
  capturePaneRaw: vi.fn().mockResolvedValue(''),
  repeatKey: vi.fn().mockResolvedValue(undefined),
  cancelCopyMode: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/lib/agent-runtime', () => ({ getRuntime: () => mockRuntime }))
vi.mock('@/lib/agent-registry', () => ({
  getAgent: () => ({
    id: 'a1', name: 'pas-lola', workingDirectory: '/home/j/lola',
    sessions: [{ index: 0, status: 'online' }],
    session: { status: 'online' },
  }),
}))
vi.mock('@/lib/pane-occupant', async (orig) => ({
  ...(await orig() as object),
  isPaneAtBareShell: vi.fn().mockResolvedValue(false),
}))

const { sendChatMessage, CHAT_NOT_SUBMITTED_MESSAGE } = await import('@/services/agents-chat-service')

const MSG = 'take the demo screenshot for slide 7'

/** Pane where the text was echoed ABOVE the box: submitted. */
const submitted = (t: string) => `● ${t}\n\n────────────\n❯ \n────────────`
/** Pane where the text is sitting IN the box: not submitted. */
const staged = (t: string) => `● earlier output\n\n────────────\n❯ ${t}\n────────────`
/** Empty box showing the previous prompt as a DIM placeholder. */
const dimGhost = (t: string) => `● earlier output\n\n────────────\n❯ \x1b[2m${t}\x1b[0m\n────────────`

beforeEach(() => {
  vi.clearAllMocks()
  mockRuntime.sendKeys.mockResolvedValue(undefined)
  mockRuntime.repeatKey.mockResolvedValue(undefined)
  mockRuntime.cancelCopyMode.mockResolvedValue(undefined)
})

describe('a message that actually lands', () => {
  it('reports success when the pane echoed it above the input box', async () => {
    mockRuntime.capturePaneRaw.mockResolvedValue(submitted(MSG))
    const r = await sendChatMessage('a1', MSG)
    expect(r.status).toBe(200)
    expect(r.data?.verified).toBe(true)
  })

  it('does not retype when the first send was accepted', async () => {
    mockRuntime.capturePaneRaw.mockResolvedValue(submitted(MSG))
    await sendChatMessage('a1', MSG)
    expect(mockRuntime.sendKeys).toHaveBeenCalledTimes(1)
  })
})

describe('a message that is typed but never submitted', () => {
  it('FAILS instead of reporting success — the reported bug', async () => {
    mockRuntime.capturePaneRaw.mockResolvedValue(staged(MSG))
    const r = await sendChatMessage('a1', MSG)
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(r.data?.success).not.toBe(true)
  })

  it('tells the person what to do about it', async () => {
    // "Nothing happened" is what they experienced. The error has to name the
    // cause (something is holding the keyboard) and the fix (open the terminal).
    mockRuntime.capturePaneRaw.mockResolvedValue(staged(MSG))
    const r = await sendChatMessage('a1', MSG)
    expect(r.data?.message).toBe(CHAT_NOT_SUBMITTED_MESSAGE)
    expect(CHAT_NOT_SUBMITTED_MESSAGE).toMatch(/terminal/i)
  })

  it('clears with BACKSPACES before retrying, never with C-u', async () => {
    mockRuntime.capturePaneRaw.mockResolvedValue(staged(MSG))
    await sendChatMessage('a1', MSG)
    expect(mockRuntime.repeatKey).toHaveBeenCalled()
    const [, key, times] = mockRuntime.repeatKey.mock.calls[0]
    expect(key).toBe('BSpace')
    expect(times).toBeGreaterThanOrEqual(MSG.length)
    expect(mockRuntime.sendKeys.mock.calls.map(c => c[1])).not.toContain('C-u')
  })

  it('retries once, then stops — a modal will not yield to a third try', async () => {
    mockRuntime.capturePaneRaw.mockResolvedValue(staged(MSG))
    await sendChatMessage('a1', MSG)
    expect(mockRuntime.sendKeys).toHaveBeenCalledTimes(2)
  })

  it('succeeds when the retry after clearing does land', async () => {
    mockRuntime.capturePaneRaw
      .mockResolvedValueOnce(staged(MSG))
      .mockResolvedValue(submitted(MSG))
    const r = await sendChatMessage('a1', MSG)
    expect(r.status).toBe(200)
  })
})

describe('the dim-placeholder trap', () => {
  it('does not mistake the greyed-out previous prompt for staged text', async () => {
    // The box is EMPTY; Claude Code is showing the last prompt as a hint. Read
    // naively this looks exactly like a message stuck in the box — it cost ten
    // minutes of live debugging before anyone captured with -e.
    mockRuntime.capturePaneRaw.mockResolvedValue(
      `● ${MSG}\n\n────────────\n❯ \x1b[2m${MSG}\x1b[0m\n────────────`
    )
    const r = await sendChatMessage('a1', MSG)
    expect(r.status).toBe(200)
  })

  it('still fails when the SAME text is genuinely in the box, undimmed', async () => {
    mockRuntime.capturePaneRaw.mockResolvedValue(staged(MSG))
    expect((await sendChatMessage('a1', MSG)).status).toBeGreaterThanOrEqual(400)
  })

  it('captures WITH escape sequences — a plain capture cannot tell them apart', async () => {
    mockRuntime.capturePaneRaw.mockResolvedValue(submitted(MSG))
    await sendChatMessage('a1', MSG)
    expect(mockRuntime.capturePaneRaw).toHaveBeenCalled()
  })
})

describe('guards that already existed stay in force', () => {
  it('still refuses to send to a bare shell', async () => {
    const { isPaneAtBareShell } = await import('@/lib/pane-occupant')
    ;(isPaneAtBareShell as any).mockResolvedValueOnce(true)
    const r = await sendChatMessage('a1', MSG)
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(mockRuntime.sendKeys).not.toHaveBeenCalled()
  })

  it('rejects an empty message', async () => {
    expect((await sendChatMessage('a1', '')).status).toBeGreaterThanOrEqual(400)
  })
})
