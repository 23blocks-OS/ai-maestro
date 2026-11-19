/**
 * F118 step 3: governance actions (spec 4.3 and 11). A rule governs a governance action only when it names it, so a
 * file written for messages keeps its meaning; deny refuses, ask opens a quarantine entry and an approval lets the same
 * action through once; the checks sit in the services that do the action.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { decide, lintPolicy, validatePolicy, validateRules, type PolicyParty } from '@/lib/policy'
import { raisesMode } from '@/lib/freedom'

const person: PolicyParty = { kind: 'person' }
const payroll: PolicyParty = { kind: 'agent', id: 'id-payroll', name: 'payroll', host: 'host-b' }

describe('governance actions in the engine', () => {
  it('a rule without actions keeps covering messages and calls only', () => {
    const p = validatePolicy({ version: 2, rules: [{ id: 'no-payroll', effect: 'deny', from: '*', to: 'agent:payroll' }] })
    expect(decide(p, person, payroll, 'message').effect).toBe('deny')
    expect(decide(p, person, payroll, 'agent.delete').effect).toBe('allow')
  })

  it('a rule that names a governance action governs it, with a plain reason', () => {
    const p = validatePolicy({ version: 2, rules: [{ id: 'keep-payroll', effect: 'deny', from: '*', to: 'agent:payroll', actions: ['agent.delete', 'agent.move'] }] })
    const d = decide(p, person, payroll, 'agent.delete')
    expect(d.effect).toBe('deny')
    expect(d.reason).toContain('may not delete agent:payroll')
    expect(decide(p, person, payroll, 'agent.move').effect).toBe('deny')
    expect(decide(p, person, payroll, 'agent.mode').effect).toBe('allow')
    expect(decide(p, person, payroll, 'message').effect).toBe('allow')
  })

  it('a file whose default is deny still lets governance actions through when no rule names them', () => {
    const p = validatePolicy({ version: 2, default: 'deny', rules: [{ id: 'team-talks', effect: 'allow', from: 'agent:*', to: 'agent:*' }] })
    expect(decide(p, person, payroll, 'message').effect).toBe('deny')
    expect(decide(p, person, payroll, 'agent.create').effect).toBe('allow')
  })

  it('an exception, lint and version 1 files see the same scope', () => {
    const p = validatePolicy({ version: 2, rules: [
      { id: 'ask-delete', effect: 'ask', from: '*', to: 'agent:*', actions: ['agent.delete'], approvers: ['person:alice'], except: [{ to: ['agent:scratch'] }] },
      // Covers messages only, so it does not cover (or shadow) the delete rule
      { id: 'talk', effect: 'allow', from: '*', to: 'agent:*' },
    ] })
    expect(decide(p, person, payroll, 'agent.delete').effect).toBe('ask')
    expect(decide(p, person, { kind: 'agent', name: 'scratch' }, 'agent.delete').effect).toBe('allow')
    expect(lintPolicy(p)).toEqual([])
    expect(() => validateRules({ rules: [{ from: '*', to: '*', allow: false, action: 'agent.delete' }] })).toThrow('version 2')
    expect(() => validatePolicy({ version: 2, rules: [{ id: 'x', effect: 'deny', from: '*', to: '*', actions: ['agent.explode'] }] })).toThrow('actions')
  })

  it('raising the permission mode is agent.mode; lowering it is not', () => {
    expect(raisesMode(undefined, 'fullAutonomy')).toBe(true)
    expect(raisesMode('trustEdits', 'smartAuto')).toBe(true)
    expect(raisesMode('fullAutonomy', 'supervised')).toBe(false)
    expect(raisesMode(undefined, 'supervised')).toBe(false)
    expect(raisesMode('supervised', 'planOnly')).toBe(false)
    expect(raisesMode('supervised', undefined)).toBe(false)
  })
})

// ── At the services, with real files in a temporary HOME ─────────────────────

describe('governance checks where the action is done', () => {
  let home: string
  const rules = (rs: unknown[]) => fs.writeFileSync(path.join(home, '.aimaestro', 'policy.json'), JSON.stringify({ version: 2, rules: rs }))

  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-governance-home-'))
    vi.stubEnv('HOME', home)
    fs.mkdirSync(path.join(home, '.aimaestro', 'agents'), { recursive: true })
  })
  afterAll(() => {
    vi.unstubAllEnvs()
    fs.rmSync(home, { recursive: true, force: true })
  })
  beforeEach(() => {
    fs.rmSync(path.join(home, '.aimaestro', 'policy'), { recursive: true, force: true })
    fs.rmSync(path.join(home, '.aimaestro', 'policy.json'), { force: true })
  })

  it('an ask opens a quarantine entry; once approved, the same action goes through once', async () => {
    rules([{ id: 'ask-delete', effect: 'ask', from: '*', to: 'agent:payroll', actions: ['agent.delete'], approvers: ['person:alice'] }])
    const { governanceCheck } = await import('@/lib/policy-check')
    const first = governanceCheck('agent.delete', payroll)
    expect(first).toMatchObject({ effect: 'ask', quarantine: { id: expect.stringMatching(/^qtn_/), held: false } })
    // The reviewer's approval request says what would be done, in words
    const { listQuarantine } = await import('@/lib/policy-approvals')
    const { sendApprovalRequests } = await import('@/services/provider-notices')
    const sent: any[] = []
    await sendApprovalRequests(listQuarantine().find(e => e.quarantine_id === first!.quarantine!.id)!, async b => { sent.push(b); return { data: { id: 'm1' }, status: 200 } })
    expect(sent[0]?.subject).toBe('Approval needed: delete agent:payroll@host-b (asked by an unidentified person)')
    const { decidePolicyQuarantine } = await import('@/services/policy-service')
    const ok = await decidePolicyQuarantine(first!.quarantine!.id, 'approve', { by: 'Alice' }, { deliver: async () => ({ ok: true }), notify: async () => {}, fetch })
    expect(ok.status).toBe(200)
    expect(governanceCheck('agent.delete', payroll)).toBeNull()
    expect(governanceCheck('agent.delete', payroll)?.effect).toBe('ask') // once only
    // AI Maestro's own repairs always pass
    expect(governanceCheck('agent.delete', payroll, { kind: 'system' })).toBeNull()
  })

  it('deleteAgentById and createNewAgent refuse with 403 and the reason, and change nothing', async () => {
    const { createAgent, getAgent } = await import('@/lib/agent-registry')
    const agent = createAgent({ name: 'gov-keep', workingDirectory: path.join(home, 'gov-keep') } as any)
    rules([{ id: 'keep-agents', effect: 'deny', from: '*', to: 'agent:*', actions: ['agent.delete', 'agent.create'], note: 'Agents are kept' }])
    const { deleteAgentById, createNewAgent } = await import('@/services/agents-core-service')
    const del = await deleteAgentById(agent.id, true)
    expect(del).toMatchObject({ status: 403, data: { error: 'forbidden', message: expect.stringContaining('may not delete agent:gov-keep') } })
    expect(getAgent(agent.id)).toBeTruthy()
    const made = createNewAgent({ name: 'gov-new', workingDirectory: path.join(home, 'gov-new') } as any)
    expect(made).toMatchObject({ status: 403, data: { error: 'forbidden' } })
    // The Doctor's repair is AI Maestro itself
    expect((await deleteAgentById(agent.id, true, { kind: 'system' })).status).toBe(200)
  })
})
