import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const START = { cwd: '/w', surface: 'terminal', isInteractive: true } as any

// What sits beneath the plugin: the engine's own answers, from memory.
function world(on: On, count: { n: number }, woke: string[]) {
  mock.env(on, { HOME: '/h' })
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  on('session.start', (() => ({ cwd: '/w' })) as any)
  on('ui.status', (() => ({ value: undefined })) as any)
  on('ui.toast', (() => ({ value: undefined })) as any)
  on('command.register', (() => ({ value: { command: 'amp-inbox' } })) as any)
  on('process.run', (() => ({
    value: {
      exitCode: 0,
      stdout: `${count.n}\n`,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  })) as any)
  on('turn.start', ((_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId })) as any)
  on('turn.complete', (() => ({ text: '' })) as any)
  on('prompt.submit', ((_$: unknown, e: { text: string }) => {
    woke.push(e.text)
    return { text: e.text }
  }) as any)
  return clock
}

test('wakes once on new messages, then holds for the cooldown', { options: { autoWake: true } }, async ($, on) => {
  const count = { n: 0 }
  const woke: string[] = []
  const clock = world(on, count, woke)

  await $.session.start(START)
  expect(woke.length).toBe(0)

  count.n = 2
  await clock.advance(20_000)
  expect(woke.length).toBe(1)

  count.n = 3
  await clock.advance(20_000)
  expect(woke.length).toBe(1)
})

test('never wakes when autoWake is off', async ($, on) => {
  const count = { n: 0 }
  const woke: string[] = []
  const clock = world(on, count, woke)

  await $.session.start(START)
  count.n = 5
  await clock.advance(20_000)
  expect(woke.length).toBe(0)
})

// A prompt submitted while a turn runs is delivered later, when the message may
// already be read (mini-lola, 2026-10-02: a wake arrived after the inbox was
// empty). The mod flags the wake while busy and decides at the turn's end.
test('mid-turn rise: no wake while busy, one wake at turn end if still unread', { options: { autoWake: true } }, async ($, on) => {
  const count = { n: 0 }
  const woke: string[] = []
  const clock = world(on, count, woke)

  await $.session.start(START)
  await $.turn.start({ text: 'working', turnId: 't1' } as any)

  count.n = 2
  await clock.advance(20_000)
  expect(woke.length).toBe(0)

  await $.turn.complete({ turnId: 't1', reason: 'answer', text: 'done' } as any)
  expect(woke.length).toBe(1)
})

test('mid-turn rise that is read before the turn ends: no wake at all', { options: { autoWake: true } }, async ($, on) => {
  const count = { n: 0 }
  const woke: string[] = []
  const clock = world(on, count, woke)

  await $.session.start(START)
  await $.turn.start({ text: 'working', turnId: 't1' } as any)

  count.n = 2
  await clock.advance(20_000)
  count.n = 0 // the agent read it during the turn
  await $.turn.complete({ turnId: 't1', reason: 'answer', text: 'done' } as any)
  expect(woke.length).toBe(0)
})
