/**
 * F042 phase 2a + 2b (F118 step 1): version 2 rules (deny, ask, allow; except; no order), version 1 files compiled
 * at load with the same decisions, audit mode, lint, tests in the file, the decision log, the last good file.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  compileV1, decide, evaluatePolicy, lintPolicy, loadPolicy, logPolicyDecision, runPolicyTests, shouldLog, validatePolicy,
  type PolicyAction, type PolicyContext, type PolicyDecision, type PolicyParty, type PolicyRule,
} from '@/lib/policy'
import { checkPolicyRules } from '@/services/doctor-checks'

const alice: PolicyParty = { kind: 'person', id: 'alice', host: 'host-a' }
const bob: PolicyParty = { kind: 'person', id: 'bob', host: 'host-b' }
const someone: PolicyParty = { kind: 'person' }
const payroll: PolicyParty = { kind: 'agent', id: 'id-payroll', name: 'payroll', host: 'host-b' }
const dev: PolicyParty = { kind: 'agent', id: 'id-dev', name: 'dev', host: 'host-a' }
const support: PolicyParty = { kind: 'agent', id: 'id-support', name: 'support', host: 'host-b' }
const teamsOf = (p: PolicyParty) => (p.name === 'payroll' || p.name === 'support' ? ['finance'] : [])
const ctx: PolicyContext = { teamsOf }

// ── Version 1 equivalence: the phase 1 evaluator, as it was, against the compiled rules ──

function firstMatch(rules: PolicyRule[], from: PolicyParty, to: PolicyParty, action: PolicyAction, c: PolicyContext): { allowed: boolean; rule?: number } {
  if (from.kind === 'system') return { allowed: true }
  // Same matching as phase 1, through a one-rule compile so the pattern code is shared and only the combining differs
  const m = (r: PolicyRule) => decide(compileV1([{ ...r, allow: false }]), from, to, action, c).allowed === false
  for (let i = 0; i < rules.length; i++) if (m(rules[i])) return { allowed: rules[i].allow, rule: i + 1 }
  return { allowed: true }
}

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
}

describe('version 1 files compile to version 2 rules with the same decisions', () => {
  const patterns = ['*', 'person:*', 'agent:*', 'person:alice', 'person:bob', 'agent:payroll', 'agent:dev', 'agent:dev@host-a', 'agent:payroll@host-a', 'team:finance', 'host:host-a', 'host:host-b']
  const parties = [alice, bob, someone, payroll, dev, support, { kind: 'system' } as PolicyParty]
  const actions: PolicyAction[] = ['message', 'call']

  it('agrees with first-match on 2,000 random rule lists and every request', () => {
    const r = rng(42)
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
    let compared = 0
    for (let n = 0; n < 2000; n++) {
      const rules: PolicyRule[] = Array.from({ length: 1 + Math.floor(r() * 6) }, () => ({
        from: pick(patterns), to: pick(patterns), allow: r() < 0.5,
        ...(r() < 0.3 ? { both: true } : {}), ...(r() < 0.3 ? { action: pick(actions) } : {}),
      }))
      for (const f of parties) for (const t of parties) for (const a of actions) {
        const want = firstMatch(rules, f, t, a, ctx)
        const got = evaluatePolicy(rules, f, t, a, ctx)
        expect({ allowed: got.allowed, rule: got.rule }, JSON.stringify({ rules, f, t, a })).toEqual(want)
        compared++
      }
    }
    expect(compared).toBe(2000 * parties.length ** 2 * actions.length)
  })

  it('a deny gets the earlier allows as exceptions; ids are rule-N and the reason still says "rule N"', () => {
    const p = compileV1([
      { from: 'person:alice', to: 'agent:payroll', allow: true },
      { from: '*', to: 'agent:payroll', allow: false, note: 'Finance only' },
    ])
    expect(p.rules[1]).toEqual({ id: 'rule-2', effect: 'deny', from: ['*'], to: ['agent:payroll'], except: [{ from: ['person:alice'], to: ['agent:payroll'] }], note: 'Finance only' })
    expect(decide(p, bob, payroll).reason).toContain('blocked by rule 2 (* -> agent:payroll): Finance only')
  })
})

// ── Version 2 ────────────────────────────────────────────────────────────────

const v2 = (rules: unknown[], extra: Record<string, unknown> = {}) => validatePolicy({ version: 2, rules, ...extra })

describe('version 2: deny, then ask, then allow, then the default; order does not matter', () => {
  const rules = [
    { id: 'allow-all-people', effect: 'allow', from: 'person:*', to: '*' },
    { id: 'payroll-finance-only', effect: 'deny', from: '*', to: 'agent:payroll', except: [{ from: 'team:finance' }, { from: 'person:alice' }], note: 'Payroll answers the finance team only' },
    { id: 'calls-need-ok', effect: 'ask', from: 'agent:*', to: 'person:*', actions: ['call'], approvers: ['rel:manager'] },
  ]

  it('decides the same in any order', () => {
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 2, 0]]) {
      const p = v2(order.map(i => rules[i]))
      expect(decide(p, bob, payroll, 'message', ctx).effect).toBe('deny')
      expect(decide(p, alice, payroll, 'message', ctx).effect).toBe('allow')
      expect(decide(p, support, payroll, 'message', ctx).effect).toBe('allow')
      expect(decide(p, dev, alice, 'call', ctx).effect).toBe('ask')
      expect(decide(p, dev, alice, 'message', ctx).effect).toBe('allow')
    }
  })

  it('deny beats ask beats allow, and the reason names every deciding rule; matched lists every rule', () => {
    const p = v2([
      { id: 'a', effect: 'allow', from: '*', to: '*' },
      { id: 'b', effect: 'ask', from: '*', to: '*', approvers: ['person:alice'] },
      { id: 'c', effect: 'deny', from: '*', to: 'agent:payroll' },
      { id: 'd', effect: 'deny', from: 'person:bob', to: '*', note: 'Bob is on leave' },
    ])
    const d = decide(p, bob, payroll, 'message', { host: 'host-b' })
    expect(d).toMatchObject({ allowed: false, effect: 'deny', ruleIds: ['c', 'd'], host: 'host-b' })
    expect(d.reason).toBe('person:bob@host-b may not message agent:payroll@host-b: blocked by c on host host-b (* -> agent:payroll); and by d on host host-b (person:bob -> *): Bob is on leave')
    expect(d.matched!.map(m => m.id)).toEqual(['a', 'b', 'c', 'd'])
    const ask = decide(p, alice, dev)
    expect(ask).toMatchObject({ allowed: false, effect: 'ask', ruleIds: ['b'], approvers: ['person:alice'] })
    expect(ask.reason).toContain('needs approval')
    expect(ask).toMatchObject({ proof: 'any', expiresMs: 30 * 60 * 1000 })
  })

  it('the default is allow unless the file says deny', () => {
    expect(decide(v2([]), bob, payroll).effect).toBe('allow')
    const closed = v2([{ id: 'people-to-agents', effect: 'allow', from: 'person:*', to: 'agent:*' }], { default: 'deny' })
    expect(decide(closed, bob, payroll).effect).toBe('allow')
    const d = decide(closed, dev, payroll)
    expect(d.effect).toBe('deny')
    expect(d.reason).toContain("this host's default is deny")
  })

  it('an exception with both covers the reverse direction, and actions narrow an exception', () => {
    const p = v2([{ id: 'x', effect: 'deny', from: 'agent:*', to: 'agent:*', except: [{ from: 'agent:dev', to: 'agent:support', both: true }, { actions: ['call'] }] }])
    expect(decide(p, dev, support).effect).toBe('allow')
    expect(decide(p, support, dev).effect).toBe('allow')
    expect(decide(p, dev, payroll).effect).toBe('deny')
    expect(decide(p, dev, payroll, 'call').effect).toBe('allow')
  })

  it('AI Maestro itself always passes', () => {
    expect(decide(v2([{ id: 'x', effect: 'deny', from: '*', to: '*' }], { default: 'deny' }), { kind: 'system' }, dev).allowed).toBe(true)
  })

  it('refuses a bad file with a plain message', () => {
    expect(() => v2([{ effect: 'deny', from: '*', to: '*' }])).toThrow('"id"')
    expect(() => v2([{ id: 'a', effect: 'deny', from: '*', to: '*' }, { id: 'a', effect: 'allow', from: '*', to: '*' }])).toThrow('used twice')
    expect(() => v2([{ id: 'a', effect: 'block', from: '*', to: '*' }])).toThrow('"effect"')
    expect(() => v2([{ id: 'a', effect: 'ask', from: '*', to: '*' }])).toThrow('"approvers"')
    expect(() => v2([{ id: 'a', effect: 'deny', from: '*', to: '*', actions: ['email'] }])).toThrow('"actions"')
    expect(() => v2([{ id: 'a', effect: 'deny', from: '*', to: 'rel:manager' }])).toThrow('relation')
    expect(() => v2([{ id: 'a', effect: 'deny', from: '*', to: '*', when: { mode: 'x' } }])).toThrow('"when"')
    expect(() => validatePolicy({ version: 3, rules: [] })).toThrow('"version"')
    expect(() => v2([], { tests: [{ from: 'person:bob', to: 'agent:payroll', expect: 'maybe' }] })).toThrow('"expect"')
  })
})

describe('audit mode: computed and logged, not applied', () => {
  it('a rule in audit mode does not refuse; the decision says what it would do', () => {
    const p = v2([{ id: 'try-payroll', effect: 'deny', from: '*', to: 'agent:payroll', mode: 'audit' }])
    const d = decide(p, bob, payroll)
    expect(d).toMatchObject({ allowed: true, effect: 'allow', wouldBe: 'deny', auditRuleIds: ['try-payroll'] })
    expect(d.reason).toContain('audit only: try-payroll would have it refused')
    expect(d.matched).toEqual([{ id: 'try-payroll', effect: 'deny', mode: 'audit' }])
  })

  it('a file in audit mode applies nothing, its default included', () => {
    const p = v2([{ id: 'people', effect: 'allow', from: 'person:*', to: '*' }], { mode: 'audit', default: 'deny' })
    expect(decide(p, dev, payroll)).toMatchObject({ allowed: true, wouldBe: 'deny', auditRuleIds: [] })
    expect(decide(p, bob, payroll).wouldBe).toBeUndefined()
  })

  it('an enforced deny stays a deny next to an audit rule', () => {
    const p = v2([{ id: 'no', effect: 'deny', from: '*', to: 'agent:payroll' }, { id: 'try', effect: 'ask', from: '*', to: '*', mode: 'audit', approvers: ['rel:manager'] }])
    expect(decide(p, bob, payroll)).toMatchObject({ effect: 'deny', ruleIds: ['no'] })
  })
})

describe('lint', () => {
  it('version 2: a dead allow and a redundant rule', () => {
    const p = v2([
      { id: 'no-payroll', effect: 'deny', from: '*', to: 'agent:payroll' },
      { id: 'alice-payroll', effect: 'allow', from: 'person:alice', to: 'agent:payroll@host-b' },
      { id: 'no-payroll-calls', effect: 'deny', from: 'person:*', to: 'agent:payroll', actions: ['call'] },
      { id: 'try-dev', effect: 'deny', from: '*', to: 'agent:dev', mode: 'audit' },
      { id: 'alice-dev', effect: 'allow', from: 'person:alice', to: 'agent:dev' },
    ])
    expect(lintPolicy(p).map(l => [l.rule, l.kind])).toEqual([['alice-payroll', 'dead-allow'], ['no-payroll-calls', 'redundant']])
  })

  it('a deny with exceptions hides nothing, and two identical rules are reported once', () => {
    const p = v2([
      { id: 'no-payroll', effect: 'deny', from: '*', to: 'agent:payroll', except: [{ from: 'person:alice' }] },
      { id: 'alice-payroll', effect: 'allow', from: 'person:alice', to: 'agent:payroll' },
      { id: 'dup-1', effect: 'deny', from: 'agent:dev', to: '*' },
      { id: 'dup-2', effect: 'deny', from: 'agent:dev', to: '*' },
    ])
    expect(lintPolicy(p).map(l => l.rule)).toEqual(['dup-2'])
  })

  it('version 1: classic shadowing and redundancy', () => {
    const p = validatePolicy({ rules: [
      { from: '*', to: 'agent:payroll', allow: false },
      { from: 'person:alice', to: 'agent:payroll', allow: true },
      { from: 'agent:dev', to: 'agent:payroll', allow: false },
      { from: 'team:finance', to: '*', allow: true },
    ] })
    expect(lintPolicy(p)).toEqual([
      { rule: 'rule-2', kind: 'shadowed', message: 'rule 2 never decides: rule 1 comes first and covers everything it matches' },
      { rule: 'rule-3', kind: 'redundant', message: 'rule 3 is redundant: rule 1 comes first and already blocks everything it matches' },
    ])
  })
})

describe('tests in the file', () => {
  it('runs each case with the directory and reports what failed', () => {
    const p = v2([{ id: 'no-payroll', effect: 'deny', from: '*', to: 'agent:payroll', except: [{ from: 'person:alice' }] }], { tests: [
      { from: 'person:bob', to: 'agent:payroll', action: 'message', expect: 'deny' },
      { from: 'person:alice', to: 'agent:payroll', action: 'call', expect: 'allow' },
      { from: 'person:alice', to: 'agent:payroll', expect: 'deny' },
    ] })
    const byRef: Record<string, PolicyParty> = { 'person:bob': bob, 'person:alice': alice, 'agent:payroll': payroll }
    const results = runPolicyTests(p, ref => byRef[ref])
    expect(results.map(r => r.pass)).toEqual([true, true, false])
    expect(results[2].got).toBe('allow')
  })

  it('a version 1 file can carry tests too', () => {
    const p = validatePolicy({ rules: [{ from: '*', to: 'agent:payroll', allow: false }], tests: [{ from: 'person:bob', to: 'agent:payroll', expect: 'deny' }] })
    expect(runPolicyTests(p, () => bob)).toHaveLength(1)
  })
})

describe('the file on disk', () => {
  let dir: string
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-v2-')) })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('a broken file keeps the last version that loaded, and says so', () => {
    const file = path.join(dir, 'policy.json')
    fs.writeFileSync(file, JSON.stringify({ version: 2, rules: [{ id: 'no-payroll', effect: 'deny', from: '*', to: 'agent:payroll' }] }))
    const good = loadPolicy(file)
    expect(good.policy?.version).toBe(2)
    expect(good.hash).toMatch(/^sha256:[0-9a-f]{16}$/)
    fs.writeFileSync(file, '{ "version": 2, "rules": [ ')
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = loadPolicy(file)
    warn.mockRestore()
    expect(broken.rules).toEqual(good.rules)
    expect(broken.error).toContain('still applies until it is fixed')
  })

  it('after a restart, a broken file still applies the saved last good version', async () => {
    const file = path.join(dir, 'restart.json')
    const text = JSON.stringify({ version: 2, rules: [{ id: 'no-payroll', effect: 'deny', from: '*', to: 'agent:payroll' }] })
    fs.writeFileSync(file, text)
    const good = loadPolicy(file)
    expect(fs.readFileSync(`${file}.last-good`, 'utf8')).toBe(text)
    fs.writeFileSync(file, '{ "version": 2, "rules": [ ')
    vi.resetModules()   // a new server process: nothing in memory
    const fresh = await import('@/lib/policy')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = fresh.loadPolicy(file)
    warn.mockRestore()
    expect(broken.rules).toEqual(good.rules)
    expect(broken.error).toContain('still applies until it is fixed')
    // a broken saved copy is ignored: no rules, and the Doctor fails
    fs.writeFileSync(`${file}.last-good`, 'not json')
    vi.resetModules()
    const again = await import('@/lib/policy')
    const w2 = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(again.loadPolicy(file).rules).toEqual([])
    w2.mockRestore()
  })

  it('logs refusals, asks and audit hits; allows only when the file turns them on', () => {
    const p = v2([])
    const allow: PolicyDecision = { allowed: true, effect: 'allow', reason: '' }
    expect(shouldLog({ allowed: false, effect: 'deny', reason: '' }, p)).toBe(true)
    expect(shouldLog({ allowed: false, effect: 'ask', reason: '' }, p)).toBe(true)
    expect(shouldLog({ ...allow, wouldBe: 'deny' }, p)).toBe(true)
    expect(shouldLog(allow, p)).toBe(false)
    expect(shouldLog(allow, { ...p, logAllows: true })).toBe(true)
    expect(shouldLog(allow, { ...p, logAllows: '2026-01-01T00:00:00Z' }, Date.parse('2026-02-01'))).toBe(false)
    expect(shouldLog(allow, undefined)).toBe(false)
  })

  it('writes one JSON line per decision and moves a full log aside', () => {
    const file = path.join(dir, 'policy', 'decisions.jsonl')
    logPolicyDecision({ host: 'host-b', action: 'message', from: 'person:bob', to: 'agent:payroll@host-b', effect: 'deny', rules: ['no-payroll'] }, file)
    const line = JSON.parse(fs.readFileSync(file, 'utf8').trim())
    expect(line).toMatchObject({ host: 'host-b', effect: 'deny', rules: ['no-payroll'] })
    expect(typeof line.at).toBe('string')
    fs.writeFileSync(file, Buffer.alloc(5 * 1024 * 1024 + 1, 'x'))
    logPolicyDecision({ action: 'call', from: 'a', to: 'b', effect: 'deny' }, file)
    expect(fs.existsSync(file.replace('.jsonl', '.1.jsonl'))).toBe(true)
    expect(fs.existsSync(file)).toBe(false)
  })
})

describe('the Doctor check', () => {
  it('passes with no file, fails when a broken file applies nothing, warns on lint and failing tests', () => {
    expect(checkPolicyRules({ file: 'p.json', rules: [], lint: [], tests: [] }).status).toBe('pass')
    expect(checkPolicyRules({ file: 'p.json', rules: [], error: 'bad', lint: [], tests: [] }).status).toBe('fail')
    expect(checkPolicyRules({ file: 'p.json', version: 2, rules: [], error: 'bad', lint: [], tests: [] }).status).toBe('warn')
    const c = checkPolicyRules({
      file: 'p.json', version: 2, rules: [{}], lint: [{ rule: 'x', message: 'x never takes effect' }],
      tests: [{ test: { from: 'person:bob', to: 'agent:payroll', expect: 'deny' }, got: 'allow', pass: false, reason: 'Allowed' }],
    })
    expect(c.status).toBe('warn')
    expect(c.items!.map(i => i.key)).toEqual(['policy:lint:x', 'policy:test:1'])
  })
})

// ── At the send paths, with a version 2 file in a temporary HOME ─────────────

describe('send paths with a version 2 file', () => {
  let home: string
  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-v2-home-'))
    vi.stubEnv('HOME', home)
    fs.mkdirSync(path.join(home, '.aimaestro'), { recursive: true })
    fs.writeFileSync(path.join(home, '.aimaestro', 'policy.json'), JSON.stringify({
      version: 2,
      rules: [{ id: 'calls-to-alice', effect: 'ask', from: 'agent:*', to: 'person:alice', actions: ['call'], approvers: ['person:alice'] }],
      tests: [{ from: 'agent:backend', to: 'person:alice', action: 'call', expect: 'ask' }],
    }))
  })
  afterAll(() => {
    vi.unstubAllEnvs()
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('an ask on a call is refused at once with a quarantine entry, and the check reports ask', async () => {
    const { startCall } = await import('@/services/calls-service')
    const r = startCall({ caller: 'agent:backend', callee: 'person:alice' })
    expect(r.status).toBe(403)
    expect((r.data as any).message).toContain('needs approval')
    expect((r.data as any).message).toMatch(/quarantine entry qtn_\d+_[0-9a-f]+/i)
    expect((r.data as any).details).toMatchObject({ effect: 'ask', ruleIds: ['calls-to-alice'] })
    expect((r.data as any).details.quarantine_id).toMatch(/^qtn_/)
    const { explainPolicy, getPolicy } = await import('@/services/policy-service')
    const why = await explainPolicy({ from: 'agent:backend', to: 'person:alice', action: 'call' })
    expect(why.data).toMatchObject({ allowed: false, effect: 'ask' })
    const report = getPolicy().data as import('@/services/policy-service').PolicyReport
    expect(report).toMatchObject({ version: 2, default: 'allow', lint: [] })
    expect(report.tests.map(t => t.pass)).toEqual([true])
  })
})
