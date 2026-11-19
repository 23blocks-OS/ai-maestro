/**
 * F118 step 2: approvals for `ask`. Approver resolution, held messages delivered exactly once, grants for a time,
 * "always" as an except entry, signed proof, the store across a restart, and no change at all with no rules file.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { lintPolicy, validatePolicy, type PolicyParty } from '@/lib/policy'
import { approvalSigningString, resolveApprovers, type ApproverLookup } from '@/lib/policy-approvals'
import { checkPolicyApprovals } from '@/services/doctor-checks'
import type { DeviceKey } from '@/lib/person-signing'

const payroll: PolicyParty = { kind: 'agent', id: 'id-payroll', name: 'payroll', host: 'host-b' }
const dev: PolicyParty = { kind: 'agent', id: 'id-dev', name: 'dev', host: 'host-b' }

describe('approvers', () => {
  const agents: Record<string, { id: string; name: string; humanManager?: string; managerAgentId?: string; owner?: string }> = {
    'id-payroll': { id: 'id-payroll', name: 'payroll', humanManager: 'Alice' },
    'id-support': { id: 'id-support', name: 'support', managerAgentId: 'id-dev' },
    'id-dev': { id: 'id-dev', name: 'dev', owner: 'bob@acme.test' },
    'id-ops': { id: 'id-ops', name: 'ops' },
  }
  const people = [{ id: 'alice', displayName: 'Alice' }, { id: 'bob', displayName: 'Bob', email: 'bob@acme.test' }]
  const look: ApproverLookup = {
    agent: p => agents[p.id || ''] || Object.values(agents).find(a => a.name === p.name) || null,
    agentById: id => agents[id] || null,
    agentByName: n => Object.values(agents).find(a => a.name === n) || null,
    person: t => people.find(p => p.id === t || p.displayName.toLowerCase() === t.toLowerCase() || p.email === t) || null,
  }
  const support: PolicyParty = { kind: 'agent', id: 'id-support', name: 'support' }

  it('rel:manager is the humanManager (a person), else the managerAgentId (an agent)', () => {
    expect(resolveApprovers(['rel:manager'], { kind: 'person' }, payroll, look).approvers).toEqual([{ ref: 'person:alice', label: 'Alice', via: 'rel:manager' }])
    expect(resolveApprovers(['rel:manager'], { kind: 'person' }, support, look).approvers).toEqual([{ ref: 'agent:dev', label: 'dev', via: 'rel:manager' }])
  })

  it('rel:owner, person:<id>, person:* and a named agent', () => {
    const r = resolveApprovers(['rel:owner', 'person:alice', 'person:*', 'agent:ops'], { kind: 'person' }, dev, look)
    expect(r.approvers.map(a => a.ref)).toEqual(['person:bob', 'person:alice', 'person:*', 'agent:ops'])
    expect(r.unresolved).toEqual([])
  })

  it('an agent never approves its own request, and role: / org: do not resolve yet', () => {
    const r = resolveApprovers(['agent:dev', 'role:manager', 'org:acme'], dev, payroll, look)
    expect(r.approvers).toEqual([])
    expect(r.unresolved.join(' ')).toContain('never approves its own request')
    expect(r.unresolved.join(' ')).toContain('role:manager: not supported yet')
    // The manager of the asker is not the manager of the target
    expect(resolveApprovers(['rel:manager'], support, { kind: 'agent', id: 'id-ops', name: 'ops' }, look).unresolved[0]).toContain('has no manager')
  })

  it('lint reports approvers that cannot be resolved, and the file still loads', () => {
    const p = validatePolicy({ version: 2, rules: [{ id: 'by-role', effect: 'ask', from: '*', to: 'agent:payroll', approvers: ['role:manager'] }] })
    expect(lintPolicy(p)).toMatchObject([{ rule: 'by-role', kind: 'approver' }])
    expect(() => validatePolicy({ version: 2, rules: [{ id: 'x', effect: 'ask', from: '*', to: '*', approvers: ['person:alice'], expires: 'soon' }] })).toThrow('expires')
  })
})

// ── Against real files in a temporary HOME ───────────────────────────────────

const ruleFile = (home: string) => path.join(home, '.aimaestro', 'policy.json')
const writeRules = (home: string, rules: unknown[], extra: Record<string, unknown> = {}) =>
  fs.writeFileSync(ruleFile(home), JSON.stringify({ version: 2, rules, ...extra }, null, 2))

const ASK_PAYROLL = { id: 'payroll-asks', effect: 'ask', from: '*', to: 'agent:payroll', approvers: ['person:alice'], note: 'Payroll messages need Alice' }
const ASK_CALL = { id: 'calls-to-bob', effect: 'ask', from: 'agent:*', to: 'person:bob', actions: ['call'], approvers: ['person:bob'], expires: '10m' }

describe('approval requests at the send paths', () => {
  let home: string
  const notify = vi.fn(async () => {})
  const deliver = vi.fn(async () => ({ ok: true }))
  const keyFor = vi.fn(async (): Promise<DeviceKey | null> => null)
  const deps = () => ({ deliver, notify, keyFor, fetch })

  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-approvals-home-'))
    vi.stubEnv('HOME', home)
    fs.mkdirSync(path.join(home, '.aimaestro'), { recursive: true })
  })
  afterAll(() => {
    vi.unstubAllEnvs()
    fs.rmSync(home, { recursive: true, force: true })
  })
  beforeEach(() => {
    notify.mockClear(); deliver.mockClear(); keyFor.mockClear()
    fs.rmSync(path.join(home, '.aimaestro', 'policy'), { recursive: true, force: true })
    writeRules(home, [ASK_PAYROLL, ASK_CALL])
  })

  async function holdOne(text = 'please pay the invoice') {
    const { sendMessage } = await import('@/services/messages-service')
    const r = await sendMessage({ from: 'bob', to: 'payroll', subject: 'Invoice', content: { type: 'request', message: text } })
    expect(r.status).toBe(202)
    expect(r.data).toMatchObject({ error: 'approval_pending', status: 'held' })
    expect((r.data as any).message).toMatch(/^Held for approval by alice \(request apr-/)
    return (r.data as any).request as { id: string; approvers: string[]; expiresAt: string; held: boolean }
  }

  it('a message is held, never in the decision log, and delivered exactly once on approve', async () => {
    const req = await holdOne()
    expect(req).toMatchObject({ approvers: ['person:alice'], held: true })
    const held = path.join(home, '.aimaestro', 'policy', 'held', `${req.id}.json`)
    expect(fs.statSync(held).mode & 0o777).toBe(0o600)
    expect(fs.statSync(path.join(home, '.aimaestro', 'policy', 'approvals.json')).mode & 0o777).toBe(0o600)
    expect(fs.readFileSync(path.join(home, '.aimaestro', 'policy', 'approvals.json'), 'utf8')).not.toContain('pay the invoice')
    expect(fs.readFileSync(path.join(home, '.aimaestro', 'policy', 'decisions.jsonl'), 'utf8')).not.toContain('pay the invoice')

    const { answerPolicyRequest } = await import('@/services/policy-service')
    const ok = await answerPolicyRequest(req.id, { answer: 'once', by: 'Alice' }, deps())
    expect(ok.status).toBe(200)
    expect(ok.data!.request).toMatchObject({ state: 'approved', answer: { answer: 'once', by: 'Alice (unverified)', how: 'dashboard' }, delivery: { ok: true } })
    expect(deliver).toHaveBeenCalledTimes(1)
    expect((deliver.mock.calls[0] as any[])[0]).toMatchObject({ path: 'ui-send', payload: { to: 'payroll', content: { message: 'please pay the invoice' } } })
    expect(fs.existsSync(held)).toBe(false)

    const again = await answerPolicyRequest(req.id, { answer: 'once' }, deps())
    expect(again.status).toBe(409)
    expect(deliver).toHaveBeenCalledTimes(1)
    const log = fs.readFileSync(path.join(home, '.aimaestro', 'policy', 'decisions.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
    expect(log.map(l => l.event).filter(Boolean)).toEqual(['ask', 'answer', 'delivered'])
  })

  it('the replay goes through the normal send path with a pass for that request only', async () => {
    const req = await holdOne()
    const { answerPolicyRequest, deliverHeld, listPolicyRequests } = await import('@/services/policy-service')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await answerPolicyRequest(req.id, { answer: 'once' }, { ...deps(), deliver: deliverHeld })
    error.mockRestore()
    // Payroll is not registered in this HOME, so delivery fails, but it got past the policy: no second request
    expect(r.data!.delivery!.ok).toBe(false)
    expect(r.data!.delivery!.message).not.toMatch(/held/i)
    expect((await listPolicyRequests({ localOnly: true })).data!.requests).toHaveLength(1)
    // The pass was used: the same send again is held again
    await holdOne()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ id: req.id }), expect.stringContaining('could not be delivered'))
  })

  it('a refused or expired message is never delivered, and the sender is told', async () => {
    const { answerPolicyRequest, sweepPolicyRequests } = await import('@/services/policy-service')
    const a = await holdOne()
    const no = await answerPolicyRequest(a.id, { answer: 'refuse' }, deps())
    expect(no.data!.request.state).toBe('refused')
    expect(fs.existsSync(path.join(home, '.aimaestro', 'policy', 'held', `${a.id}.json`))).toBe(false)

    const b = await holdOne()
    const { sweepApprovals } = await import('@/lib/policy-approvals')
    expect(sweepApprovals(Date.now() + 31 * 60_000).map(r => r.id)).toEqual([b.id])
    expect((await answerPolicyRequest(b.id, { answer: 'once' }, deps())).status).toBe(409)
    expect(await sweepPolicyRequests({ notify })).toBe(0) // already expired, told once by the sweep that expired it
    expect(deliver).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ id: a.id, state: 'refused' }), expect.stringContaining('was refused by an unverified person'))
  })

  it('a call is refused at once with a request; "once" lets the next identical call through, one time', async () => {
    const { startCall } = await import('@/services/calls-service')
    const { answerPolicyRequest } = await import('@/services/policy-service')
    const r = startCall({ caller: 'agent:backend', callee: 'person:bob' })
    expect(r.status).toBe(403)
    const id = (r.data as any).details.request.id
    expect((await answerPolicyRequest(id, { answer: 'once' }, deps())).status).toBe(200)
    expect(startCall({ caller: 'agent:backend', callee: 'person:bob' }).status).toBe(201)
    expect(startCall({ caller: 'agent:backend', callee: 'person:bob' }).status).toBe(403)
  })

  it('"for 1h" is a grant checkPolicy consults until it ends, for those parties only', async () => {
    const { startCall } = await import('@/services/calls-service')
    const { answerPolicyRequest } = await import('@/services/policy-service')
    const { checkPolicy, resolveParty } = await import('@/lib/policy-check')
    const id = (startCall({ caller: 'agent:backend', callee: 'person:bob' }).data as any).details.request.id
    expect((await answerPolicyRequest(id, { answer: 'for', for: 'nonsense' }, deps())).status).toBe(400)
    const ok = await answerPolicyRequest(id, { answer: 'for', for: '1h' }, deps())
    expect(ok.data!.request.answer).toMatchObject({ answer: 'for', for: '1h' })
    expect(startCall({ caller: 'agent:backend', callee: 'person:bob' }).status).toBe(201)
    expect(startCall({ caller: 'agent:backend', callee: 'person:bob' }).status).toBe(201)
    expect(checkPolicy(resolveParty('agent:backend'), resolveParty('person:bob'), 'call').reason).toContain(`request ${id}`)
    expect(startCall({ caller: 'agent:frontend', callee: 'person:bob' }).status).toBe(403)
    // A "why" question uses no grant
    expect(checkPolicy(resolveParty('agent:backend'), resolveParty('person:bob'), 'call', { log: false }).effect).toBe('ask')
  })

  it('"always" adds an except entry to the ask rule, and the next check allows', async () => {
    const { startCall } = await import('@/services/calls-service')
    const { answerPolicyRequest } = await import('@/services/policy-service')
    const id = (startCall({ caller: 'agent:backend', callee: 'person:bob' }).data as any).details.request.id
    const r = await answerPolicyRequest(id, { answer: 'always', by: 'Bob' }, deps())
    expect(r.data!.request.answer!.exceptAdded).toEqual(['calls-to-bob'])
    const file = JSON.parse(fs.readFileSync(ruleFile(home), 'utf8'))
    const rule = file.rules.find((x: any) => x.id === 'calls-to-bob')
    expect(rule.except).toHaveLength(1)
    expect(rule.except[0]).toMatchObject({ actions: ['call'], to: ['person:bob'] })
    expect(rule.except[0].from[0]).toMatch(/^agent:backend/)
    expect(rule.except[0].note).toContain('approved always by Bob (unverified)')
    expect(startCall({ caller: 'agent:backend', callee: 'person:bob' }).status).toBe(201)
    expect(startCall({ caller: 'agent:frontend', callee: 'person:bob' }).status).toBe(403)
    expect(fs.readFileSync(path.join(home, '.aimaestro', 'policy', 'decisions.jsonl'), 'utf8')).toContain('"event":"policy.edit"')
  })

  it('"always" is refused on a version 1 file, and the request stays pending', async () => {
    const { startCall } = await import('@/services/calls-service')
    const { answerPolicyRequest } = await import('@/services/policy-service')
    const id = (startCall({ caller: 'agent:backend', callee: 'person:bob' }).data as any).details.request.id
    fs.writeFileSync(ruleFile(home), JSON.stringify({ rules: [{ from: '*', to: '*', allow: true }] }))
    const r = await answerPolicyRequest(id, { answer: 'always' }, deps())
    expect(r.status).toBe(409)
    expect((r.data as any).message).toContain('Convert it to version 2 first')
    expect((await answerPolicyRequest(id, { answer: 'once' }, deps())).status).toBe(200)
  })

  it('"always" needs a sender the host can name', async () => {
    const id = (await holdOne()).id
    const { answerPolicyRequest } = await import('@/services/policy-service')
    // bob is not a registered agent here, so the sender is agent:bob, which can be named; an unidentified person cannot
    const { createRequest } = await import('@/lib/policy-approvals')
    const { approverLookup } = await import('@/lib/policy-check')
    const made = createRequest({ decision: { allowed: false, effect: 'ask', reason: 'r', ruleIds: ['payroll-asks'], approvers: ['person:alice'] }, from: { kind: 'person' }, to: payroll, action: 'message', host: 'host-b', look: approverLookup })
    const r = await answerPolicyRequest((made as any).request.id, { answer: 'always' }, deps())
    expect((r.data as any).message).toContain('cannot name')
    expect((await answerPolicyRequest(id, { answer: 'refuse' }, deps())).status).toBe(200)
  })

  it('signed proof: a dashboard click is not enough; a valid signature from an approver\'s device is', async () => {
    writeRules(home, [{ ...ASK_CALL, proof: 'signed' }])
    const { startCall } = await import('@/services/calls-service')
    const { answerPolicyRequest } = await import('@/services/policy-service')
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64')
    keyFor.mockImplementation(async (keyId: string) => (keyId === 'k-bob' ? { keyId, personId: 'bob', publicKey: raw, status: 'active' } : keyId === 'k-alice' ? { keyId, personId: 'alice', publicKey: raw, status: 'active' } : null))
    const id = (startCall({ caller: 'agent:backend', callee: 'person:bob' }).data as any).details.request.id

    const unsigned = await answerPolicyRequest(id, { answer: 'once' }, deps())
    expect(unsigned.status).toBe(403)
    expect((unsigned.data as any).error).toBe('signature_required')

    const signedAt = new Date().toISOString()
    const { getSelfHostId } = await import('@/lib/hosts-config')
    const text = approvalSigningString({ host: getSelfHostId(), request: id, answer: 'once', signedAt })
    const signature = crypto.sign(null, Buffer.from(text), privateKey).toString('base64')
    expect((await answerPolicyRequest(id, { answer: 'once', keyId: 'k-alice', signature, signedAt }, deps())).status).toBe(403) // not an approver
    expect((await answerPolicyRequest(id, { answer: 'once', keyId: 'k-bob', signature: Buffer.alloc(64).toString('base64'), signedAt }, deps())).status).toBe(403)
    const ok = await answerPolicyRequest(id, { answer: 'once', keyId: 'k-bob', signature, signedAt }, deps())
    expect(ok.status).toBe(200)
    expect(ok.data!.request.answer).toMatchObject({ by: 'person:bob', how: 'signed', keyId: 'k-bob' })

    // Refusing needs no signature
    const other = (startCall({ caller: 'agent:frontend', callee: 'person:bob' }).data as any).details.request.id
    expect((await answerPolicyRequest(other, { answer: 'refuse' }, deps())).status).toBe(200)
  })

  it('the store and the held message survive a restart', async () => {
    const req = await holdOne()
    vi.resetModules()
    const { listApprovals } = await import('@/lib/policy-approvals')
    expect(listApprovals('pending').map(r => r.id)).toEqual([req.id])
    const { answerPolicyRequest } = await import('@/services/policy-service')
    expect((await answerPolicyRequest(req.id, { answer: 'once' }, deps())).status).toBe(200)
    expect(deliver).toHaveBeenCalledTimes(1)
  })

  it('an ask nobody can approve is a plain refusal with the reason', async () => {
    writeRules(home, [{ ...ASK_PAYROLL, approvers: ['role:payroll-lead'] }])
    const { sendMessage } = await import('@/services/messages-service')
    const r = await sendMessage({ from: 'bob', to: 'payroll', subject: 'Hi', content: { type: 'request', message: 'x' } })
    expect(r.status).toBe(403)
    expect((r.data as any).message).toContain('no approver could be found (role:payroll-lead: not supported yet)')
  })

  it('a message through the AMP route is held on the host whose rules asked, and answered 202', async () => {
    const { routeMessage } = await import('@/services/amp-service')
    const { getSelfHostId } = await import('@/lib/hosts-config')
    const self = getSelfHostId()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = await routeMessage({ from: `dev@${self}.aimaestro.local`, to: 'payroll', subject: 'Hi', payload: { type: 'request', message: 'x' } } as any, null, self, null, null, null)
    warn.mockRestore(); log.mockRestore()
    expect(r.status).toBe(202)
    expect(r.data).toMatchObject({ status: 'held', error: 'approval_pending' })
    const { listApprovals } = await import('@/lib/policy-approvals')
    expect(listApprovals('pending')[0]).toMatchObject({ held: { path: 'amp-route' }, from: expect.stringMatching(/^agent:dev/) })
  })

  it('device input cannot wait for an answer: refused, no request', async () => {
    const { askNotPossible, checkPolicy, resolveParty } = await import('@/lib/policy-check')
    const d = askNotPossible(checkPolicy({ kind: 'person' }, resolveParty('agent:payroll'), 'message'), 'a device input has no screen to wait for an approval')
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('not possible here')
    expect(fs.existsSync(path.join(home, '.aimaestro', 'policy', 'approvals.json'))).toBe(false)
  })

  it('with no rules file nothing changes on any path, and no store is written', async () => {
    fs.rmSync(ruleFile(home))
    const { startCall } = await import('@/services/calls-service')
    const { checkPolicy, resolveParty } = await import('@/lib/policy-check')
    expect(startCall({ caller: 'agent:backend', callee: 'person:bob' }).status).toBe(201)
    expect(checkPolicy(resolveParty('person:bob'), resolveParty('agent:payroll')).allowed).toBe(true)
    const { sendChatMessage } = await import('@/services/agents-chat-service')
    expect((await sendChatMessage('no-such-agent', 'hi')).status).toBe(404)
    expect(fs.existsSync(path.join(home, '.aimaestro', 'policy', 'approvals.json'))).toBe(false)
  })
})

describe('Doctor', () => {
  it('fails when the store cannot be read, warns on overdue requests', () => {
    expect(checkPolicyApprovals({ file: 'a.json', pending: 0, overdue: [] }).status).toBe('pass')
    expect(checkPolicyApprovals({ file: 'a.json', pending: 1, overdue: ['apr-1'] }).status).toBe('warn')
    expect(checkPolicyApprovals({ file: 'a.json', pending: 0, overdue: [], error: 'bad json' }).status).toBe('fail')
  })
})
