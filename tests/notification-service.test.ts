/**
 * Tests for lib/notification-service.ts — pane readback verification.
 *
 * send-keys returning without throwing only proves bytes reached tmux, not
 * that the agent's TUI accepted them. notifyAgent() therefore reads the pane
 * back and looks for a per-message ref. This is the runtime-agnostic twin of
 * the channel's amp_channel_ack: it needs no cooperation from whatever agent
 * occupies the pane, so it covers Claude Code, Codex, Gemini CLI, Aider, or a
 * bare shell equally.
 *
 * The contract these lock down:
 *   verified: true   — read back off the pane (proof)
 *   verified: false + notified: true  — sent, runtime can't be captured
 *   notified: false  — pane readable and the message never appeared
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRuntime = {
  sendKeys: vi.fn().mockResolvedValue(undefined),
  capturePane: vi.fn().mockResolvedValue(''),
  sessionExists: vi.fn().mockResolvedValue(true),
}

vi.mock('@/lib/agent-runtime', () => ({
  getRuntime: vi.fn(() => mockRuntime),
}))

const AGENT = {
  id: 'agent-uuid-1',
  name: 'receiver',
  sessions: [{ index: 0, status: 'online' }],
}

vi.mock('@/lib/agent-registry', () => ({
  getAgent: vi.fn(() => AGENT),
  getAgentByName: vi.fn(() => AGENT),
}))

vi.mock('@/lib/hosts-config-server.mjs', () => ({
  getSelfHostId: vi.fn(() => 'local'),
  isSelf: vi.fn(() => true),
}))

vi.mock('@/types/agent', () => ({
  computeSessionName: vi.fn((name: string) => name),
}))

const mockIdle = vi.hoisted(() => ({ hasHookReport: vi.fn(() => false) }))
vi.mock('@/lib/session-idle', () => mockIdle)

import { notifyAgent, messageRef, toSingleLine } from '@/lib/notification-service'

const BASE = {
  agentId: 'agent-uuid-1',
  agentName: 'receiver',
  fromName: 'sender',
  fromHost: 'local',
  subject: 'deploy failed',
  messageId: 'abc12345-dead-beef-0000-111122223333',
}

/** What the pane would show once the notification rendered. */
function paneWith(messageId: string) {
  return `$ echo '...'\n[#${messageRef(messageId)}] [MESSAGE] From: sender - deploy failed\n$ `
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRuntime.sendKeys.mockResolvedValue(undefined)
  mockRuntime.sessionExists.mockResolvedValue(true)
  mockIdle.hasHookReport.mockReturnValue(false)
})

describe('messageRef', () => {
  it('derives the token from the TAIL of the id, where the entropy is', () => {
    // Ids are `msg-<timestamp>-<random>`; slicing the head gave every message
    // in a ~27h window the same ref, which both broke readback confirmation
    // and made every notification look like the same message repeating.
    expect(messageRef('msg-1787802846153-bk2096t')).toBe('3bk2096t')
  })

  it('is DISTINCT for messages sent moments apart', () => {
    const a = messageRef('msg_1787805728539_j782cvq')
    const b = messageRef('msg_1787805890480_pi3wqxz')
    expect(a).not.toBe(b)
  })

  it('is stable for the same id', () => {
    expect(messageRef(BASE.messageId)).toBe(messageRef(BASE.messageId))
  })

  it('never returns empty, even for a missing id', () => {
    expect(messageRef('')).toBe('nomsgid')
    expect(messageRef('---')).toBe('nomsgid')
  })
})

describe('toSingleLine', () => {
  it('collapses newlines so send-keys cannot submit early', () => {
    expect(toSingleLine('line one\nline two\n\nline three', 100)).toBe('line one line two line three')
  })

  it('truncates with an ellipsis past the limit', () => {
    const out = toSingleLine('x'.repeat(50), 10)
    expect(out).toHaveLength(10)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('notifyAgent — pane readback', () => {
  it('reports verified when the ref is read back off the pane', async () => {
    mockRuntime.capturePane.mockResolvedValue(paneWith(BASE.messageId))

    const res = await notifyAgent(BASE)

    expect(res).toMatchObject({ success: true, notified: true, verified: true })
    // One send only — no wasteful resend once it is confirmed.
    expect(mockRuntime.sendKeys).toHaveBeenCalledTimes(2) // text + Enter
  })

  it('matches the ref even when the pane hard-wraps it mid-token', async () => {
    const ref = messageRef(BASE.messageId)
    // tmux wrapped the line in the middle of the ref.
    mockRuntime.capturePane.mockResolvedValue(`[#${ref.slice(0, 4)}\n${ref.slice(4)}] [MESSAGE] From: sender`)

    const res = await notifyAgent(BASE)

    expect(res.verified).toBe(true)
  })

  it('reports notified-but-unverified when the runtime cannot be captured', async () => {
    mockRuntime.capturePane.mockResolvedValue('')

    const res = await notifyAgent(BASE)

    expect(res).toMatchObject({ success: true, notified: true, verified: false })
    expect(res.reason).toMatch(/cannot verify/i)
    // No resend: the check can never succeed here, so retrying would only
    // double-deliver.
    expect(mockRuntime.sendKeys).toHaveBeenCalledTimes(2)
  })

  it('resends, then reports NOT notified when the pane never shows the message', async () => {
    // Pane is readable but our message never lands (TUI dropped the input).
    mockRuntime.capturePane.mockResolvedValue('$ some unrelated pane content\n$ ')

    const res = await notifyAgent(BASE)

    expect(res).toMatchObject({ success: true, notified: false, verified: false })
    expect(res.reason).toMatch(/not seen/i)
    // Initial send + one resend, each text + Enter.
    expect(mockRuntime.sendKeys).toHaveBeenCalledTimes(4)
  })

  it('does not mistake a DIFFERENT message on the pane for this one', async () => {
    mockRuntime.capturePane.mockResolvedValue(paneWith('99999999-other-message'))

    const res = await notifyAgent(BASE)

    expect(res.notified).toBe(false)
  })

  it('recovers when the message renders late, without resending', async () => {
    mockRuntime.capturePane
      .mockResolvedValueOnce('$ ')
      .mockResolvedValueOnce('$ ')
      .mockResolvedValue(paneWith(BASE.messageId))

    const res = await notifyAgent(BASE)

    expect(res.verified).toBe(true)
    expect(mockRuntime.sendKeys).toHaveBeenCalledTimes(2)
  })

  it('carries the message body into the pane, single-lined', async () => {
    mockRuntime.capturePane.mockResolvedValue(paneWith(BASE.messageId))

    await notifyAgent({ ...BASE, body: 'the build broke\non step 3' })

    const sent = mockRuntime.sendKeys.mock.calls[0][1] as string
    expect(sent).toContain('the build broke on step 3')
    expect(sent).not.toContain('\n')
  })

  it('includes the ref so the agent can tie the nudge to the inbox entry', async () => {
    mockRuntime.capturePane.mockResolvedValue(paneWith(BASE.messageId))

    await notifyAgent(BASE)

    const sent = mockRuntime.sendKeys.mock.calls[0][1] as string
    expect(sent).toContain(`[#${messageRef(BASE.messageId)}]`)
  })

  it('sends PLAIN text when an agent TUI is live in the pane', async () => {
    mockIdle.hasHookReport.mockReturnValue(true)
    mockRuntime.capturePane.mockResolvedValue(paneWith(BASE.messageId))

    await notifyAgent(BASE)

    const sent = mockRuntime.sendKeys.mock.calls[0][1] as string
    expect(sent.startsWith('echo ')).toBe(false)
    expect(sent).toContain('[MESSAGE]')
  })

  it('wraps in echo for a bare shell so the text is not EXECUTED', async () => {
    mockIdle.hasHookReport.mockReturnValue(false)
    mockRuntime.capturePane.mockResolvedValue(paneWith(BASE.messageId))

    await notifyAgent(BASE)

    const sent = mockRuntime.sendKeys.mock.calls[0][1] as string
    expect(sent.startsWith("echo '")).toBe(true)
  })

  it('leads with the subject so stacked notifications are distinguishable', async () => {
    mockRuntime.capturePane.mockResolvedValue(paneWith(BASE.messageId))

    await notifyAgent(BASE)

    const sent = mockRuntime.sendKeys.mock.calls[0][1] as string
    expect(sent.indexOf('deploy failed')).toBeLessThan(sent.indexOf('sender'))
  })

  it('skips cleanly when the session is gone', async () => {
    mockRuntime.sessionExists.mockResolvedValue(false)

    const res = await notifyAgent(BASE)

    expect(res).toMatchObject({ notified: false, reason: 'Session not active' })
    expect(mockRuntime.sendKeys).not.toHaveBeenCalled()
  })
})
