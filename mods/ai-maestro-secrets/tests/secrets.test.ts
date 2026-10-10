import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const START = { cwd: '/w', surface: 'terminal', isInteractive: true } as any
const TOOL = 'mcp__ai-maestro-secrets__request_secret'

// What sits beneath the plugin: the engine's own answers, from memory.
function world(on: On, vault: { has: boolean }, ran: string[][], opened: string[]) {
  mock.env(on, { HOME: '/h' })
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.start', (() => ({ cwd: '/w' })) as any)
  on('tool.register', (() => ({ value: { tool: TOOL } })) as any)
  on('command.register', (() => ({ value: { command: 'secret' } })) as any)
  on('process.run', ((_$: unknown, e: { argv: string[] }) => {
    ran.push(e.argv)
    return {
      value: { exitCode: vault.has ? 0 : 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  }) as any)
  on('ui.close', (() => ({ value: undefined })) as any)
  on('ui.open', ((_$: unknown, e: { id: string }) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  }) as any)
}

test('a bad name is refused and nothing runs', async ($, on) => {
  const ran: string[][] = []
  world(on, { has: false }, ran, [])
  await $.session.start(START)
  const r = await $.tool.call({ tool: TOOL, name: 'bad-name' } as any)
  expect((r as any).isError).toBe(true)
  expect(String((r as any).text)).toContain('Invalid name')
  expect(ran.length).toBe(0)
})

test('a name that looks like a shell command never reaches the vault', async ($, on) => {
  const ran: string[][] = []
  world(on, { has: false }, ran, [])
  await $.session.start(START)
  for (const name of ['A; rm -rf /', 'A$(id)', '../x', 'a', '', 'X'.repeat(70)]) {
    const r = await $.tool.call({ tool: TOOL, name } as any)
    expect((r as any).isError).toBe(true)
  }
  expect(ran.length).toBe(0)
})

test('an already stored secret is reported and no form opens', async ($, on) => {
  const ran: string[][] = []
  const opened: string[] = []
  world(on, { has: true }, ran, opened)
  await $.session.start(START)
  const r = await $.tool.call({ tool: TOOL, name: 'OPENAI_API_KEY' } as any)
  expect((r as any).isError).not.toBe(true)
  expect(String((r as any).text)).toContain('already stored')
  expect(ran).toEqual([['aim-secret', 'has', 'OPENAI_API_KEY']])
  expect(opened.length).toBe(0)
})

test('a new request answers at once, opens the form and asks the model to stop', async ($, on) => {
  const ran: string[][] = []
  const opened: string[] = []
  world(on, { has: false }, ran, opened)
  await $.session.start(START)
  const r = await $.tool.call({ tool: TOOL, name: 'OPENAI_API_KEY' } as any)
  const text = String((r as any).text)
  expect(text).toContain('End your turn')
  expect(text).toContain('Do not ask for the value')
  expect(opened).toEqual(['secret-entry'])
  // the only vault call is the presence check; the value is never read
  expect(ran).toEqual([['aim-secret', 'has', 'OPENAI_API_KEY']])
})

test('a second request while one is open is refused', async ($, on) => {
  const ran: string[][] = []
  world(on, { has: false }, ran, [])
  await $.session.start(START)
  await $.tool.call({ tool: TOOL, name: 'FIRST_KEY' } as any)
  const r = await $.tool.call({ tool: TOOL, name: 'SECOND_KEY' } as any)
  expect((r as any).isError).toBe(true)
  expect(String((r as any).text)).toContain('already open')
})

test('the tool result never contains the secret value or asks for it', async ($, on) => {
  world(on, { has: false }, [], [])
  await $.session.start(START)
  const r = await $.tool.call({ tool: TOOL, name: 'OPENAI_API_KEY' } as any)
  expect(String((r as any).text)).not.toMatch(/paste|send me|type the (value|key)/i)
})
