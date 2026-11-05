/**
 * B030: a schedule run said "success" as soon as the keys were sent. It must be success only when the prompt
 * is proven submitted, and the prompt must arrive as written (it used to be shell-escaped before a verbatim send).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  pane: '',
  sent: [] as string[],
  complete: vi.fn(),
  bareShell: false,
  copyModeCancelled: 0,
  submitOnEnter: true,
  history: '',
}))

vi.mock('@/lib/schedule-registry', () => ({
  getDueSchedules: () => [],
  recordExecution: () => ({ id: 'exec-1' }),
  completeExecution: m.complete,
  advanceNextRun: () => {},
}))
vi.mock('@/lib/agent-registry', () => ({ getAgent: () => ({ id: 'a1', name: 'agent-one' }) }))
vi.mock('@/lib/streaming-bridge.mjs', () => ({ pushToStreamSession: () => false }))
vi.mock('@/lib/pane-occupant', () => ({ isPaneAtBareShell: async () => m.bareShell }))
// A fake Claude Code pane: a submitted prompt sits above the input box, an unsubmitted one inside it
vi.mock('@/lib/agent-runtime', () => ({
  getRuntime: () => ({
    sessionExists: async () => true,
    cancelCopyMode: async () => { m.copyModeCancelled++ },
    capturePaneRaw: async () => m.pane,
    repeatKey: async () => { m.pane = m.history + box('') },
    sendKeys: async (_s: string, text: string) => {
      m.sent.push(text)
      m.pane = m.submitOnEnter ? `${m.history}❯ ${text}\n\n⏺ On it.\n${box('')}` : `${m.history}${box(text)}`
    },
  }),
}))

const box = (input: string) => `${'─'.repeat(40)}\n❯ ${input}\n${'─'.repeat(40)}\n  ? for shortcuts`

const { executeSchedule } = await import('@/lib/schedule-executor')
const schedule = (prompt: string) => ({ id: 's1', name: 'Send day', agentId: 'a1', agentName: 'agent-one', prompt } as any)
const settle = () => new Promise(r => setTimeout(r, 0))
const waitDone = async () => { for (let i = 0; i < 400 && m.complete.mock.calls.length === 0; i++) await new Promise(r => setTimeout(r, 25)) }

beforeEach(() => {
  m.pane = box(''); m.sent = []; m.complete.mockReset(); m.bareShell = false; m.copyModeCancelled = 0; m.submitOnEnter = true; m.history = ''
})

describe('schedule run delivery', () => {
  it('is success only once the prompt is seen submitted, and arrives as written', async () => {
    await executeSchedule(schedule("Send day: read Juan's inbox now"), 'manual')
    await waitDone()
    expect(m.sent[0]).toBe("Send day: read Juan's inbox now")
    expect(m.copyModeCancelled).toBe(1)
    expect(m.complete).toHaveBeenCalledWith('exec-1', 'success')
  }, 20000)

  it('fails with the reason when the prompt stays in the input box', async () => {
    m.submitOnEnter = false
    await executeSchedule(schedule('Send day'), 'manual')
    await waitDone()
    expect(m.complete).toHaveBeenCalledWith('exec-1', 'failure', expect.stringMatching(/never submitted/))
  }, 20000)

  it('yesterday\'s echo of the same prompt is not proof of today\'s run', async () => {
    m.history = '❯ Send day: read your inbox now\n\n⏺ Done yesterday.\n'
    m.pane = m.history + box('')
    m.submitOnEnter = false
    await executeSchedule(schedule('Send day: read your inbox now'), 'cron')
    await waitDone()
    expect(m.complete).toHaveBeenCalledWith('exec-1', 'failure', expect.stringMatching(/never submitted/))
  }, 20000)

  it('a repeated prompt that does go through is success', async () => {
    m.history = '❯ Send day: read your inbox now\n\n⏺ Done yesterday.\n'
    m.pane = m.history + box('')
    await executeSchedule(schedule('Send day: read your inbox now'), 'cron')
    await waitDone()
    expect(m.complete).toHaveBeenCalledWith('exec-1', 'success')
  }, 20000)

  it('fails without typing into a bare shell', async () => {
    m.bareShell = true
    await executeSchedule(schedule('Send day'), 'manual')
    await settle(); await waitDone()
    expect(m.sent).toEqual([])
    expect(m.complete).toHaveBeenCalledWith('exec-1', 'failure', expect.stringMatching(/bare shell/))
  }, 20000)
})
