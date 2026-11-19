/**
 * F042: who may reach whom. The rules (lib/policy), and the send paths refusing with the reason the sender reads.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { evaluatePolicy, validateRules, loadPolicy, type PolicyParty, type PolicyRule } from '@/lib/policy'

const alice: PolicyParty = { kind: 'person', id: 'alice', host: 'host-a' }
const someone: PolicyParty = { kind: 'person' }
const backend: PolicyParty = { kind: 'agent', id: 'id-backend', name: 'backend', host: 'host-a' }
const payroll: PolicyParty = { kind: 'agent', id: 'id-payroll', name: 'payroll', host: 'host-b' }
const devA: PolicyParty = { kind: 'agent', name: 'dev', host: 'host-a' }
const devB: PolicyParty = { kind: 'agent', name: 'dev', host: 'host-b' }

describe('evaluatePolicy', () => {
  it('allows everything with no rules: today\'s behaviour', () => {
    for (const [f, t] of [[alice, backend], [someone, payroll], [backend, payroll], [payroll, alice]] as const) {
      expect(evaluatePolicy([], f, t).allowed).toBe(true)
    }
  })

  it('takes the first matching rule and names it, with its note, in the reason', () => {
    const rules: PolicyRule[] = [
      { from: 'person:alice', to: 'agent:payroll', allow: true },
      { from: '*', to: 'agent:payroll', allow: false, note: 'Payroll answers the finance team only' },
    ]
    expect(evaluatePolicy(rules, alice, payroll).allowed).toBe(true)
    const d = evaluatePolicy(rules, backend, payroll, 'message', { host: 'host-b' })
    expect(d).toMatchObject({ allowed: false, rule: 2, host: 'host-b' })
    expect(d.reason).toBe('agent:backend@host-a may not message agent:payroll@host-b: blocked by rule 2 on host host-b (* -> agent:payroll): Payroll answers the finance team only')
  })

  it('a last * -> * deny turns the open default into closed', () => {
    const rules: PolicyRule[] = [{ from: 'person:*', to: 'agent:*', allow: true }, { from: '*', to: '*', allow: false }]
    expect(evaluatePolicy(rules, someone, backend).allowed).toBe(true)
    expect(evaluatePolicy(rules, backend, payroll).allowed).toBe(false)
  })

  it('an unidentified person matches person:* but never a named person', () => {
    const rules: PolicyRule[] = [{ from: 'person:alice', to: '*', allow: false }]
    expect(evaluatePolicy(rules, someone, backend).allowed).toBe(true)
    expect(evaluatePolicy([{ from: 'person:*', to: '*', allow: false }], someone, backend).allowed).toBe(false)
  })

  it('agent:dev@host-b pins the host, so two agents called dev on two hosts stay apart', () => {
    const rules: PolicyRule[] = [{ from: 'agent:dev@host-b', to: '*', allow: false }]
    expect(evaluatePolicy(rules, devA, backend).allowed).toBe(true)
    expect(evaluatePolicy(rules, devB, backend).allowed).toBe(false)
    expect(evaluatePolicy([{ from: 'agent:dev', to: '*', allow: false }], devA, backend).allowed).toBe(false)
  })

  it('matches host:, team:, an agent id, both directions and one action', () => {
    expect(evaluatePolicy([{ from: 'host:host-b', to: '*', allow: false }], payroll, alice).allowed).toBe(false)
    const teamsOf = (p: PolicyParty) => (p.name === 'backend' ? ['t1', 'core team'] : [])
    expect(evaluatePolicy([{ from: 'team:Core Team', to: '*', allow: false }], backend, payroll, 'message', { teamsOf }).allowed).toBe(false)
    expect(evaluatePolicy([{ from: 'agent:id-payroll', to: '*', allow: false }], payroll, alice).allowed).toBe(false)
    const both: PolicyRule[] = [{ from: 'agent:backend', to: 'agent:payroll', allow: false, both: true }]
    expect(evaluatePolicy(both, payroll, backend).allowed).toBe(false)
    const calls: PolicyRule[] = [{ from: '*', to: 'person:alice', allow: false, action: 'call' }]
    expect(evaluatePolicy(calls, backend, alice, 'message').allowed).toBe(true)
    expect(evaluatePolicy(calls, backend, alice, 'call').reason).toContain('may not call person:alice')
  })

  it('AI Maestro itself always sends', () => {
    expect(evaluatePolicy([{ from: '*', to: '*', allow: false }], { kind: 'system' }, backend).allowed).toBe(true)
  })
})

describe('validateRules and the file', () => {
  it('names the first bad rule', () => {
    expect(() => validateRules({ rules: [{ from: 'bob', to: '*', allow: false }] })).toThrow('rule 1: "from"')
    expect(() => validateRules({ rules: [{ from: '*', to: '*', allow: 'no' }] })).toThrow('"allow"')
    expect(() => validateRules({ rules: [{ from: '*', to: '*', allow: false, action: 'email' }] })).toThrow('"action"')
    expect(() => validateRules([])).toThrow('"rules" list')
  })

  it('a broken file applies no rules and says why; a missing file is no rules', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-file-'))
    try {
      expect(loadPolicy(path.join(dir, 'none.json'))).toEqual({ file: path.join(dir, 'none.json'), rules: [] })
      const file = path.join(dir, 'policy.json')
      fs.writeFileSync(file, '{ "rules": [ { "from": "*" ')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const broken = loadPolicy(file)
      warn.mockRestore()
      expect(broken.rules).toEqual([])
      expect(broken.error).toContain('No rules apply until it is fixed')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── Send paths, against a real rules file in a temporary HOME ────────────────

describe('send paths refuse with the reason', () => {
  let home: string
  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-home-'))
    vi.stubEnv('HOME', home)
    fs.mkdirSync(path.join(home, '.aimaestro'), { recursive: true })
    fs.writeFileSync(path.join(home, '.aimaestro', 'policy.json'), JSON.stringify({
      rules: [
        { from: '*', to: 'agent:payroll', allow: false, note: 'Payroll answers the finance team only' },
        { from: 'agent:*', to: 'person:alice', allow: false, action: 'call', note: 'Alice takes calls from people only' },
      ],
    }))
  })
  afterAll(() => {
    vi.unstubAllEnvs()
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('a message (POST /api/messages) is refused before any delivery, with the rule\'s note', async () => {
    const { sendMessage } = await import('@/services/messages-service')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await sendMessage({ from: 'bob', to: 'payroll', subject: 'Hi', content: { type: 'request', message: 'pay me' } })
    error.mockRestore()
    expect(r.status).toBe(403)
    expect(r.data).toMatchObject({ error: 'forbidden' })
    expect(r.data.message).toContain('Payroll answers the finance team only')
  })

  it('a call (POST /api/calls) checks the call rules', async () => {
    const { startCall } = await import('@/services/calls-service')
    const r = startCall({ caller: 'agent:backend', callee: 'person:alice' })
    expect(r.status).toBe(403)
    expect((r.data as any).message).toContain('may not call person:alice')
  })

  it('"why can\'t A reach B" answers on this host', async () => {
    const { explainPolicy } = await import('@/services/policy-service')
    const no = await explainPolicy({ from: 'person:alice', to: 'agent:payroll' })
    expect(no.data).toMatchObject({ allowed: false, action: 'message' })
    expect(no.data!.reason).toContain('rule 1')
    const yes = await explainPolicy({ from: 'person:alice', to: 'agent:backend' })
    expect(yes.data!.allowed).toBe(true)
    expect((await explainPolicy({ from: 'person:alice', to: 'agent:backend', action: 'email' })).status).toBe(400)
  })
})
