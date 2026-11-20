/**
 * F128: on a usage limit, an agent moves only to a credential in its own fallback list. The transcript lines are the
 * ones Claude Code wrote in field transcripts (2.1.32x).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { usageLimitFromLines, resetTimeFromText, chooseFallback } from '@/lib/credential-fallback'
import { parseCredential, grantedNames } from '@/lib/agent-credential'

const sys = (content: string, timestamp: string) => JSON.stringify({ type: 'system', subtype: 'informational', level: 'notice', content, timestamp })
const local = (h: number, m = 0, day = 19) => new Date(2026, 10, day, h, m).getTime()

describe('reading the limit from the conversation', () => {
  it('finds "Usage limit reached" with its reset time, and forgets it after "Usage limit reset"', () => {
    const at = new Date(local(15)).toISOString()
    const hit = usageLimitFromLines(['{"type":"assistant"}', sys('Usage limit reached · continuing automatically at 5:20pm · esc to cancel', at)])
    expect(hit).toMatchObject({ at: local(15), resetsAt: local(17, 20) })
    const again = usageLimitFromLines([sys('Usage limit reached again · continuing automatically at 5:20pm · esc to cancel', at)])
    expect(again?.at).toBe(local(15))
    expect(usageLimitFromLines([sys('Usage limit reached · continuing automatically at 5:20pm · esc to cancel', at), sys('Usage limit reset · Continuing automatically', at)])).toBeNull()
    // Someone quoting the text in a message is not a limit
    expect(usageLimitFromLines([JSON.stringify({ type: 'user', message: { content: 'Usage limit reached' }, timestamp: at })])).toBeNull()
    expect(usageLimitFromLines([])).toBeNull()
    // The model answered after the line: the conversation went on, so it is not limited now
    const answer = JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5-5', content: [] }, timestamp: at })
    const synthetic = JSON.stringify({ type: 'assistant', message: { model: '<synthetic>', content: [] }, timestamp: at })
    const line = sys('Usage limit reached · continuing automatically at 5:20pm · esc to cancel', at)
    expect(usageLimitFromLines([line, answer])).toBeNull()
    expect(usageLimitFromLines([line, synthetic])?.at).toBe(local(15))
    expect(usageLimitFromLines([answer, line])?.at).toBe(local(15))
  })

  it('a spend or weekly limit written as Claude Code\'s own error turn counts; a transient 429 does not', () => {
    const at = new Date(local(13)).toISOString()
    const turn = (text: string) => JSON.stringify({ type: 'assistant', isApiErrorMessage: true, error: 'rate_limit', timestamp: at, message: { model: '<synthetic>', content: [{ type: 'text', text }] } })
    // The exact line from a field transcript (11-12)
    const spend = usageLimitFromLines([turn("You've hit your monthly spend limit · raise it at https://claude.ai/settings/usage?from=cc_cli_limit_message · your 5-hour limit resets 1:40pm (America/Denver)")])
    expect(spend).toMatchObject({ at: local(13), resetsAt: local(13, 40) })
    expect(usageLimitFromLines([turn('API Error: 429 rate_limit_error')])).toBeNull()
    // The window opened again afterwards
    expect(usageLimitFromLines([turn("You've hit your weekly limit · resets 5pm"), sys('Usage limit reset · Continuing automatically', at)])).toBeNull()
  })

  it('a reset time earlier in the day than the line is tomorrow', () => {
    expect(resetTimeFromText('continuing automatically at 3:40am', local(23))).toBe(local(3, 40, 20))
    expect(resetTimeFromText('continuing automatically at 10pm', local(17))).toBe(local(22))
    expect(resetTimeFromText('Usage limit reached', local(17))).toBeUndefined()
  })
})

describe('choosing the next credential', () => {
  const cred = { kind: 'oauth-token' as const, secret: 'ACME_A', fallback: ['ACME_B', 'ACME_C'] }
  const all = { inVault: () => true, limitedUntil: () => undefined, now: 1000 }

  it('takes the first free entry of the agent\'s own list, and keeps the same set of names', () => {
    expect(chooseFallback(cred, all)).toEqual({ next: 'ACME_B', fallback: ['ACME_C', 'ACME_A'] })
    expect(chooseFallback(cred, { ...all, limitedUntil: n => (n === 'ACME_B' ? 5000 : undefined) })?.next).toBe('ACME_C')
    expect(chooseFallback(cred, { ...all, inVault: n => n !== 'ACME_B' })?.next).toBe('ACME_C')
  })

  it('nothing when every entry is limited or missing, with no list, or for the host login', () => {
    expect(chooseFallback(cred, { ...all, limitedUntil: () => 5000 })).toBeNull()
    expect(chooseFallback({ kind: 'oauth-token', secret: 'ACME_A' }, all)).toBeNull()
    expect(chooseFallback({ kind: 'host-login' } as any, all)).toBeNull()
  })

  it('the list holds vault names only, up to 5, never on a login without a vault entry', () => {
    expect(parseCredential({ kind: 'oauth-token', secret: 'ACME_A', fallback: ['ACME_B', 'ACME_A', 'ACME_B'] })).toEqual({ credential: { kind: 'oauth-token', secret: 'ACME_A', fallback: ['ACME_B'] } })
    expect(parseCredential({ kind: 'oauth-token', secret: 'ACME_A', fallback: ['sk-ant-api03-value'] })).toHaveProperty('error')
    expect(parseCredential({ kind: 'oauth-token', secret: 'ACME_A', fallback: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'] })).toHaveProperty('error')
    expect(parseCredential({ kind: 'host-login', fallback: ['ACME_B'] })).toHaveProperty('error')
  })

  it('granted names are the ones a change adds', () => {
    expect(grantedNames(cred, { ...cred, fallback: ['ACME_B', 'ACME_C', 'ACME_D'] })).toEqual(['ACME_D'])
    expect(grantedNames(cred, { ...cred, fallback: ['ACME_C'] })).toEqual([])
    expect(grantedNames(cred, { kind: 'oauth-token', secret: 'ACME_C', fallback: ['ACME_A', 'ACME_B'] })).toEqual([])
  })
})

// ── The watcher and the grant rule, with real files in a temporary HOME ──────

/** "continuing automatically at <time>" for a time hours from now, so the test does not depend on the clock */
const resetText = (ms: number) => {
  const d = new Date(ms)
  const h = d.getHours() % 12 || 12
  return `Usage limit reached · continuing automatically at ${h}:${String(d.getMinutes()).padStart(2, '0')}${d.getHours() < 12 ? 'am' : 'pm'} · esc to cancel`
}

describe('the watcher', () => {
  let home: string
  const dir = () => path.join(home, 'work', 'acme-dev')
  const transcript = (lines: string[]) => {
    const d = path.join(home, '.claude', 'projects', dir().replace(/[/_.]/g, '-'))
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'conv-1.jsonl'), lines.join('\n') + '\n')
  }

  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-fallback-home-'))
    vi.stubEnv('HOME', home)
    fs.mkdirSync(path.join(home, '.aimaestro', 'agents'), { recursive: true })
    fs.mkdirSync(dir(), { recursive: true })
  })
  afterAll(() => {
    vi.unstubAllEnvs()
    fs.rmSync(home, { recursive: true, force: true })
  })
  beforeEach(async () => (await import('@/services/credential-fallback-service')).resetFallbackState())

  it('moves a limited agent to its next free credential once, restarts it and tells it to go on', async () => {
    const { createAgent, getAgent } = await import('@/lib/agent-registry')
    const agent = createAgent({ name: 'acme-dev', workingDirectory: dir(), credential: { kind: 'oauth-token', secret: 'ACME_A', fallback: ['ACME_B', 'ACME_C'] } } as any)
    const now = Date.now()
    transcript(['{"type":"assistant"}', sys(resetText(now + 3 * 3_600_000), new Date(now - 60_000).toISOString())])
    const restart = vi.fn(async () => ({ status: 200 }))
    const tell = vi.fn()
    const { checkCredentialFallbacks } = await import('@/services/credential-fallback-service')
    // ACME_B is not in the vault: skipped
    const deps = { inVault: (n: string) => n !== 'ACME_B', sessionRunning: async () => true, restart, tell, now: () => now }
    expect(await checkCredentialFallbacks(deps)).toEqual([{ agent: 'acme-dev', from: 'ACME_A', to: 'ACME_C' }])
    expect(getAgent(agent.id)?.credential).toEqual({ kind: 'oauth-token', secret: 'ACME_C', fallback: ['ACME_B', 'ACME_A'] })
    expect(getAgent(agent.id)?.credentialSwitch).toMatchObject({ from: 'ACME_A', to: 'ACME_C', reason: expect.stringContaining('Usage limit reached') })
    expect(restart).toHaveBeenCalledWith(agent.id)
    expect(tell.mock.calls[0][1]).toContain('moved you to ACME_C')
    // The resumed conversation still ends with the same line: no second move
    expect(await checkCredentialFallbacks({ ...deps, now: () => now + 120_000 })).toEqual([])
    // A new limit on ACME_C: ACME_A is still in its window and ACME_B is missing, so it waits
    transcript([sys(resetText(now + 3 * 3_600_000), new Date(now + 180_000).toISOString())])
    expect(await checkCredentialFallbacks({ ...deps, now: () => now + 240_000 })).toEqual([])
    expect(getAgent(agent.id)?.credential?.secret).toBe('ACME_C')
  })

  it('giving an agent a new credential or fallback is secret.grant; removing one is not', async () => {
    const { createAgent } = await import('@/lib/agent-registry')
    const agent = createAgent({ name: 'acme-ops', workingDirectory: path.join(home, 'work', 'acme-ops'), credential: { kind: 'oauth-token', secret: 'ACME_A', fallback: ['ACME_B'] } } as any)
    fs.writeFileSync(path.join(home, '.aimaestro', 'policy.json'), JSON.stringify({ version: 2, rules: [
      { id: 'tokens-need-ok', effect: 'deny', from: '*', to: 'agent:*', actions: ['secret.grant'], note: 'Tokens are granted by the manager' },
    ] }))
    const { updateAgentById } = await import('@/services/agents-core-service')
    const add = updateAgentById(agent.id, { credential: { kind: 'oauth-token', secret: 'ACME_A', fallback: ['ACME_B', 'ACME_PERSONAL'] } } as any)
    expect(add).toMatchObject({ status: 403, data: { message: expect.stringContaining('may not give a new credential to agent:acme-ops') } })
    expect(updateAgentById(agent.id, { credential: { kind: 'oauth-token', secret: 'ACME_A' } } as any).status).toBe(200)
    fs.rmSync(path.join(home, '.aimaestro', 'policy.json'))
  })
})
