import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createSpeakingSides, mainSessionName, sentenceSplitter, speakingPrompt, toolGate } from '@/lib/cerebellum/speaking-side.mjs'
import { appendSpeakingLog, speakingEntries, withSpeaking } from '@/lib/speaking-log.mjs'

const dirs: string[] = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'speaking-test-')); dirs.push(d); return d }
afterEach(() => { dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })); vi.useRealTimers() })

function sessions(entries: object[]) {
  const dir = tmp()
  entries.forEach((e, i) => fs.writeFileSync(path.join(dir, `${i}.json`), JSON.stringify(e)))
  return dir
}

describe('finding the main session', () => {
  const live = { pid: process.pid, kind: 'interactive', messagingSocketPath: '/s.sock' }
  it('is the live interactive session in the agent folder that takes messages, the newest one', () => {
    const dir = sessions([
      { ...live, cwd: '/home/lola', name: 'lola-old', startedAt: 1 },
      { ...live, cwd: '/home/lola', name: 'lola-f9', startedAt: 2 },
      { ...live, cwd: '/home/other', name: 'other', startedAt: 3 },
      { ...live, cwd: '/home/lola', name: 'no-socket', startedAt: 4, messagingSocketPath: undefined },
      { ...live, cwd: '/home/lola', name: 'gone', startedAt: 5, pid: 999999999 },
    ])
    expect(mainSessionName('/home/lola', dir)).toBe('lola-f9')
  })
  it('is none when the agent has no such session', () => {
    expect(mainSessionName('/home/nobody', sessions([]))).toBeNull()
    expect(mainSessionName(undefined, sessions([]))).toBeNull()
  })
})

describe('sentences as the words arrive', () => {
  it('a sentence ends at a stop and a space, never inside a number', () => {
    const s = sentenceSplitter()
    expect(s.push('It costs 3.')).toEqual([])
    expect(s.push('5 dollars. Want')).toEqual(['It costs 3.5 dollars.'])
    expect(s.push(' more? Yes')).toEqual(['Want more?'])
    expect(s.flush()).toEqual(['Yes'])
    expect(s.flush()).toEqual([])
  })
})

describe('the lock', () => {
  const gate = toolGate('lola-f9')
  const decision = async (input: object) => ((await gate(input)) as any).hookSpecificOutput.permissionDecision
  it('allows one tool, to one session', async () => {
    expect(await decision({ tool_name: 'SendMessage', tool_input: { to: 'lola-f9', message: 'x' } })).toBe('allow')
    expect(await decision({ tool_name: 'SendMessage', tool_input: { to: 'aim-gateways-50', message: 'x' } })).toBe('deny')
    expect(await decision({ tool_name: 'ListAgents', tool_input: {} })).toBe('deny')
    expect(await decision({ tool_name: 'mcp__claude_ai_Claude_Docs__read', tool_input: {} })).toBe('deny')
    expect(await decision({ tool_name: 'Bash', tool_input: { command: 'ls' } })).toBe('deny')
  })
})

describe('the prompt', () => {
  it('is the agent: its own card, its notes, and how to talk and hand off', () => {
    const p = speakingPrompt({ card: '# Lola - Chief of Staff', notes: ['Tested the voice with Juan'], mainName: 'lola-f9' })
    expect(p).toContain('# Lola - Chief of Staff')
    expect(p).toContain('Tested the voice with Juan')
    expect(p).toContain('SendMessage to "lola-f9"')
    expect(p).toContain('not verified')
  })
})

/** A fake SDK: records options, and plays a script of messages for each user turn it reads. */
function fakeQuery(turns: object[][]) {
  const seen: any = { options: null, prompts: [] as string[] }
  const query = ({ prompt, options }: any) => {
    seen.options = options
    const it = (async function* () {
      for await (const m of prompt) {
        seen.prompts.push(m.message.content)
        for (const out of turns.shift() || []) yield out
      }
    })()
    return Object.assign(it, { interrupt: vi.fn() })
  }
  return { query, seen }
}
const delta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } })
const start = { type: 'stream_event', event: { type: 'content_block_start' } }
const stop = { type: 'stream_event', event: { type: 'content_block_stop' } }
const result = { type: 'result', subtype: 'success' }

function setup(turns: object[][], extra = {}) {
  const folder = tmp()
  fs.writeFileSync(path.join(folder, 'CLAUDE.md'), '# Lola - Chief of Staff')
  const dir = sessions([{ pid: process.pid, kind: 'interactive', messagingSocketPath: '/s.sock', cwd: folder, name: 'lola-f9', startedAt: 1 }])
  const fake = fakeQuery(turns)
  const said: string[] = []
  const logs: any[] = []
  const sides = createSpeakingSides({
    query: fake.query, buildEnv: () => ({ PATH: '/bin' }), sessionsDir: dir, transcriptPath: () => null,
    say: async (_id: string, _key: string, text: string) => { said.push(text); return { played: true } },
    log: (_id: string, e: object) => logs.push(e), ...extra,
  })
  const agent = { id: 'lola-id', name: 'pas-lola', workingDirectory: folder, experiments: { speakingSide: true } }
  return { sides, agent, fake, said, logs }
}
const wait = () => new Promise((r) => setTimeout(r, 30))

describe('the speaking side', () => {
  it('starts with one tool, no outside tools, the agent card, and the lock', async () => {
    const { sides, agent, fake } = setup([[result]])
    expect(sides.handle(agent, { deviceKey: 'k', deviceName: 'MacBook', text: 'Hi', source: 'voice' })).toBe(true)
    await wait()
    const o = fake.seen.options
    expect(o.tools).toEqual(['SendMessage'])
    expect(o.settingSources).toEqual([])
    expect(o.strictMcpConfig).toBe(true)
    expect(o.mcpServers).toEqual({})
    expect(o.env.ENABLE_CLAUDEAI_MCP_SERVERS).toBe('false')
    expect(o.model).toBe('claude-sonnet-5-5')
    expect(o.systemPrompt).toContain('# Lola - Chief of Staff')
    expect(o.hooks.PreToolUse[0].hooks).toHaveLength(1)
    expect(fake.seen.prompts[0]).toBe('At your device "MacBook", someone not verified said (transcribed, may contain errors): "Hi"')
    sides.stopAll()
  })

  it('speaks sentence by sentence as the words arrive, and logs what it heard and said', async () => {
    const { sides, agent, said, logs } = setup([[start, delta('Doing well, thanks. '), delta('How are you?'), stop, result]])
    sides.handle(agent, { deviceKey: 'k', deviceName: 'MacBook', text: 'How are you?', source: 'voice' })
    await wait()
    expect(said).toEqual(['Doing well, thanks.', 'How are you?'])
    expect(logs.map((l) => l.kind)).toEqual(['heard', 'said'])
    sides.stopAll()
  })

  it('a person talking stops the rest of the reply', async () => {
    const said: string[] = []
    const { sides, agent } = setup([[start, delta('One. Two. Three.'), stop, result]], {
      say: async (_i: string, _k: string, text: string) => { said.push(text); return { played: said.length < 2 } },
    })
    sides.handle(agent, { deviceKey: 'k', deviceName: 'MacBook', text: 'x', source: 'voice' })
    await wait()
    expect(said).toEqual(['One.', 'Two.'])
    sides.stopAll()
  })

  it('a hand-off is logged, and a quiet main session gets "still on it" once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const handoff = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'SendMessage', input: { to: 'lola-f9', message: 'Check the deploy' } }] } }
    const { sides, agent, said, logs } = setup([[start, delta('Let me check. '), stop, handoff, result]], { stillOnItMs: 1000 })
    sides.handle(agent, { deviceKey: 'k', deviceName: 'MacBook', text: 'Did the deploy finish?', source: 'voice' })
    await vi.advanceTimersByTimeAsync(10)
    expect(logs.find((l) => l.kind === 'handoff')).toMatchObject({ text: 'Check the deploy' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(said).toEqual(['Let me check.', "I'm still on it."])
    sides.stopAll()
  })

  it('is not started for an agent with no main session that takes messages', () => {
    const { sides } = setup([])
    expect(sides.handle({ id: 'x', name: 'x', workingDirectory: '/nowhere' }, { deviceKey: 'k', deviceName: 'M', text: 'hi', source: 'voice' })).toBe(false)
  })

  it('stops after a quiet spell, unless set to always', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { sides, agent } = setup([[result]], { idleMs: 1000 })
    sides.ensure(agent)
    expect(sides.get('lola-id')).toBeTruthy()
    await vi.advanceTimersByTimeAsync(1001)
    expect(sides.get('lola-id')).toBeUndefined()
    sides.ensure({ ...agent, experiments: { speakingSide: 'always' } })
    await vi.advanceTimersByTimeAsync(5000)
    expect(sides.get('lola-id')).toBeTruthy()
    sides.stopAll()
  })
})

describe('the speaking log, for the chat', () => {
  it('is written and read back as chat entries, merged by time', () => {
    const root = tmp()
    let t = Date.parse('2026-11-07T12:00:00Z')
    appendSpeakingLog('lola-id', { kind: 'heard', device: 'MacBook', text: 'Hi' }, { root, now: () => t })
    t += 2000
    appendSpeakingLog('lola-id', { kind: 'said', device: 'MacBook', text: 'Hello Juan.' }, { root, now: () => t })
    const entries = speakingEntries('lola-id', { root })
    expect(entries.map((e) => [e.type, e.kind, e.text])).toEqual([['speaking_message', 'heard', 'Hi'], ['speaking_message', 'said', 'Hello Juan.']])
    const chat = [{ type: 'user', timestamp: '2026-11-07T11:59:00Z' }, { type: 'assistant', timestamp: '2026-11-07T12:00:01Z' }]
    expect(withSpeaking(chat, entries).map((m: any) => m.kind || m.type)).toEqual(['user', 'heard', 'assistant', 'said'])
    expect(speakingEntries('../../etc', { root })).toEqual([])
  })
})

describe('the device it is at (look, show, health, listen)', () => {
  const fakeTools = {
    z: { string: () => ({ min: () => ({ max: () => 'string' }) }), number: () => ({ int: () => ({ min: () => ({ max: () => 'number' }) }) }) },
    tool: (name: string, _d: string, _s: object, handler: Function) => ({ name, handler }),
    createSdkMcpServer: (o: any) => ({ type: 'sdk', name: o.name, tools: o.tools }),
  }
  it('the lock lets these four through, and still nothing else', async () => {
    const gate = toolGate('lola-f9', ['mcp__device__look', 'mcp__device__show'])
    const decision = async (input: object) => ((await gate(input)) as any).hookSpecificOutput.permissionDecision
    expect(await decision({ tool_name: 'mcp__device__look', tool_input: {} })).toBe('allow')
    expect(await decision({ tool_name: 'mcp__device__delete_everything', tool_input: {} })).toBe('deny')
    expect(await decision({ tool_name: 'SendMessage', tool_input: { to: 'someone-else' } })).toBe('deny')
  })

  it('uses the device in use: a picture comes back as an image it sees, a refusal as an error it can say', async () => {
    const calls: any[] = []
    const device = {
      look: async (id: string, key: string) => { calls.push(['look', id, key]); return { mime: 'image/jpeg', data: 'AAAA' } },
      show: async (id: string, key: string, text: string) => { calls.push(['show', key, text]) },
      health: async () => ({ status: 'ok' }),
      listen: async (_id: string, _key: string, seconds: number) => { calls.push(['listen', seconds]); throw new Error('denied') },
    }
    const { sides, agent, fake } = setup([[result]], { device, sdkTools: fakeTools })
    sides.handle(agent, { deviceKey: 'kitchen-key', deviceName: 'MacBook', text: 'What do you see?', source: 'voice' })
    await wait()
    const o = fake.seen.options
    expect(Object.keys(o.mcpServers)).toEqual(['device'])
    expect(o.systemPrompt).toContain('look (a picture from its camera')
    const byName = Object.fromEntries(o.mcpServers.device.tools.map((t: any) => [t.name, t.handler]))
    expect(await byName.look({})).toEqual({ content: [{ type: 'image', data: 'AAAA', mimeType: 'image/jpeg' }] })
    expect(await byName.show({ text: 'Hi' })).toEqual({ content: [{ type: 'text', text: 'Shown.' }] })
    expect(await byName.listen({ seconds: 3 })).toEqual({ content: [{ type: 'text', text: 'Could not: denied' }], isError: true })
    expect(calls).toEqual([['look', 'lola-id', 'kitchen-key'], ['show', 'kitchen-key', 'Hi'], ['listen', 3]])
    sides.stopAll()
  })

  it('without device tools it has none, and says so in its prompt', async () => {
    const { sides, agent, fake } = setup([[result]])
    sides.handle(agent, { deviceKey: 'k', deviceName: 'MacBook', text: 'Hi', source: 'voice' })
    await wait()
    expect(fake.seen.options.mcpServers).toEqual({})
    expect(fake.seen.options.systemPrompt).not.toContain('look (a picture')
    sides.stopAll()
  })
})
