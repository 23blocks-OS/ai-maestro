/**
 * F118 step 2: `ask` is AMP quarantine (spec 07 "Message Quarantine", 08 "Quarantine Management"). Approver resolution,
 * 202 quarantined, qtn_ ids and AMP states, a quarantined message delivered exactly once on approve, 409 / 410, expiry,
 * calls, signed proof refused, the store across a restart, cross-host list and decisions, and no change with no rules.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { lintPolicy, validatePolicy, type PolicyParty } from '@/lib/policy'
import { resolveApprovers, type ApproverLookup } from '@/lib/policy-approvals'
import { checkPolicyApprovals } from '@/services/doctor-checks'

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
const QTN = /^qtn_\d+_[0-9a-f]+$/
const ASK_CALL = { id: 'calls-to-bob', effect: 'ask', from: 'agent:*', to: 'person:bob', actions: ['call'], approvers: ['person:bob'], expires: '10m' }

describe('quarantine at the send paths (AMP 07/08)', () => {
  let home: string
  const notify = vi.fn(async () => {})
  const deliver = vi.fn(async () => ({ ok: true }))
  const deps = () => ({ deliver, notify, fetch })
  const policy = () => path.join(home, '.aimaestro', 'policy')

  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-quarantine-home-'))
    vi.stubEnv('HOME', home)
    fs.mkdirSync(path.join(home, '.aimaestro'), { recursive: true })
  })
  afterAll(() => {
    vi.unstubAllEnvs()
    fs.rmSync(home, { recursive: true, force: true })
  })
  beforeEach(() => {
    notify.mockClear(); deliver.mockClear()
    fs.rmSync(policy(), { recursive: true, force: true })
    writeRules(home, [ASK_PAYROLL, ASK_CALL])
  })

  async function holdOne(text = 'please pay the invoice') {
    const { sendMessage } = await import('@/services/messages-service')
    const r = await sendMessage({ from: 'bob', to: 'payroll', subject: 'Invoice', content: { type: 'request', message: text } })
    expect(r.status).toBe(202)
    expect(r.data).toMatchObject({
      status: 'quarantined',
      quarantine: { quarantine_id: expect.stringMatching(QTN), reason: 'policy', rules_triggered: ['payroll-asks'], reviewers: [expect.stringMatching(/^p-alice@/)], expires_at: expect.any(String) },
    })
    expect((r.data as any).message).toMatch(/^Held for approval by alice \(quarantine qtn_/)
    return (r.data as any).quarantine.quarantine_id as string
  }

  it('a message is quarantined with AMP metadata, never in the decision log, and delivered exactly once on approve', async () => {
    const id = await holdOne()
    const held = path.join(policy(), 'quarantine', `${id}.json`)
    expect(fs.statSync(held).mode & 0o777).toBe(0o600)
    expect(fs.statSync(path.join(policy(), 'quarantine.json')).mode & 0o777).toBe(0o600)
    expect(fs.readFileSync(path.join(policy(), 'quarantine.json'), 'utf8')).not.toContain('pay the invoice')
    expect(fs.readFileSync(path.join(policy(), 'decisions.jsonl'), 'utf8')).not.toContain('pay the invoice')

    const { decidePolicyQuarantine, getPolicyQuarantine } = await import('@/services/policy-service')
    expect((await getPolicyQuarantine(id)).data).toMatchObject({
      quarantine_id: id, reason: 'policy', rules_triggered: ['payroll-asks'], reason_text: expect.stringContaining('Payroll messages need Alice'), status: 'pending',
      quarantined_at: expect.any(String), expires_at: expect.any(String), approvers: [{ ref: 'person:alice' }],
    })
    const ok = await decidePolicyQuarantine(id, 'approve', { by: 'Alice' }, deps())
    expect(ok).toMatchObject({ status: 200, data: { quarantine_id: id, status: 'approved', message_id: null, delivered: true } })
    expect(deliver).toHaveBeenCalledTimes(1)
    expect((deliver.mock.calls[0] as any[])[0]).toMatchObject({ path: 'ui-send', payload: { to: 'payroll', content: { message: 'please pay the invoice' } } })
    expect(fs.existsSync(held)).toBe(false)
    expect((await getPolicyQuarantine(id)).data).toMatchObject({ status: 'approved', decided: { by: 'Alice (unverified)' }, delivery: { ok: true } })

    // Already decided: 409 quarantine_decided, and nothing is delivered again
    expect(await decidePolicyQuarantine(id, 'approve', {}, deps())).toMatchObject({ status: 409, data: { error: 'quarantine_decided' } })
    expect((await decidePolicyQuarantine(id, 'reject', {}, deps())).status).toBe(409)
    expect(deliver).toHaveBeenCalledTimes(1)
    const log = fs.readFileSync(path.join(policy(), 'decisions.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
    expect(log.map(l => l.event).filter(Boolean)).toEqual(['quarantined', 'approved', 'delivered'])
  })

  it('the release goes through the normal send path with a pass for that entry only', async () => {
    const id = await holdOne()
    const { decidePolicyQuarantine, deliverHeld, listPolicyQuarantine } = await import('@/services/policy-service')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await decidePolicyQuarantine(id, 'approve', {}, { ...deps(), deliver: deliverHeld })
    error.mockRestore()
    // Payroll is not registered in this HOME, so delivery fails, but it got past the policy: no second entry
    expect(r.data).toMatchObject({ status: 'approved', delivered: false })
    expect((await listPolicyQuarantine({ status: 'approved', localOnly: true })).data!.items.map(i => i.quarantine_id)).toEqual([id])
    expect((await listPolicyQuarantine({ localOnly: true })).data!.items).toEqual([])
    // The pass was used: the same send again is quarantined again
    await holdOne()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ quarantine_id: id }), expect.stringContaining('could not be delivered'))
  })

  it('a rejected or expired message is never delivered; expired answers 410 quarantine_expired', async () => {
    const { decidePolicyQuarantine, sweepPolicyQuarantine } = await import('@/services/policy-service')
    const a = await holdOne()
    const no = await decidePolicyQuarantine(a, 'reject', {}, deps())
    expect(no).toMatchObject({ status: 200, data: { quarantine_id: a, status: 'rejected' } })
    expect(fs.existsSync(path.join(policy(), 'quarantine', `${a}.json`))).toBe(false)

    const b = await holdOne()
    const { sweepQuarantine } = await import('@/lib/policy-approvals')
    expect(sweepQuarantine(Date.now() + 31 * 60_000).map(r => r.quarantine_id)).toEqual([b])
    const late = await decidePolicyQuarantine(b, 'approve', {}, deps())
    expect(late).toMatchObject({ status: 410, data: { error: 'quarantine_expired' } })
    expect(await sweepPolicyQuarantine({ notify })).toBe(0) // already expired, told once by the sweep that expired it
    expect(deliver).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ quarantine_id: a, status: 'rejected' }), expect.stringContaining('was rejected by an unverified person'))
  })

  it('the list follows AMP 08: status (default pending), limit 1-100, { items, count, total }', async () => {
    const { listPolicyQuarantine, getPolicyQuarantine, decidePolicyQuarantine } = await import('@/services/policy-service')
    const a = await holdOne(), b = await holdOne()
    const r = await listPolicyQuarantine({ limit: '1', localOnly: true })
    expect(r.data).toMatchObject({ count: 1, total: 2 })
    expect([a, b]).toContain(r.data!.items[0].quarantine_id)
    expect(r.data!.items[0]).not.toHaveProperty('pass_until')
    expect((await listPolicyQuarantine({ status: 'refused', localOnly: true })).status).toBe(400)
    expect((await listPolicyQuarantine({ limit: '0', localOnly: true })).status).toBe(400)
    expect((await getPolicyQuarantine('apr-1')).status).toBe(400)
    expect((await getPolicyQuarantine('qtn_1_abcdef')).status).toBe(404)
    expect((await decidePolicyQuarantine('qtn_1_abcdef', 'approve', {}, deps())).status).toBe(404)
  })

  it('a call is refused at once (403 forbidden) with an entry; approving lets the next identical call through, once', async () => {
    const { startCall } = await import('@/services/calls-service')
    const { decidePolicyQuarantine } = await import('@/services/policy-service')
    const r = startCall({ caller: 'agent:backend', callee: 'person:bob' })
    expect(r).toMatchObject({ status: 403, data: { error: 'forbidden', details: { quarantine_id: expect.stringMatching(QTN) } } })
    const id = (r.data as any).details.quarantine_id
    expect((await decidePolicyQuarantine(id, 'approve', {}, deps())).data).toMatchObject({ status: 'approved', delivered: false })
    expect(startCall({ caller: 'agent:frontend', callee: 'person:bob' }).status).toBe(403)
    expect(startCall({ caller: 'agent:backend', callee: 'person:bob' }).status).toBe(201)
    expect(startCall({ caller: 'agent:backend', callee: 'person:bob' }).status).toBe(403)
    // A "why" question uses no pass
    const { checkPolicy, resolveParty } = await import('@/lib/policy-check')
    expect(checkPolicy(resolveParty('agent:backend'), resolveParty('person:bob'), 'call', { log: false }).effect).toBe('ask')
  })

  it('proof "signed": a dashboard approval is refused with a plain reason; rejecting needs no proof', async () => {
    writeRules(home, [{ ...ASK_PAYROLL, proof: 'signed' }])
    const { decidePolicyQuarantine } = await import('@/services/policy-service')
    const id = await holdOne()
    const r = await decidePolicyQuarantine(id, 'approve', { by: 'Alice' }, deps())
    expect(r).toMatchObject({ status: 403, data: { error: 'forbidden' } })
    expect((r.data as any).message).toContain('proof "signed"')
    expect(deliver).not.toHaveBeenCalled()
    expect((await decidePolicyQuarantine(id, 'reject', {}, deps())).status).toBe(200)
  })

  it('the store and the quarantined message survive a restart', async () => {
    const id = await holdOne()
    vi.resetModules()
    const { listQuarantine } = await import('@/lib/policy-approvals')
    expect(listQuarantine('pending').map(r => r.quarantine_id)).toEqual([id])
    const { decidePolicyQuarantine } = await import('@/services/policy-service')
    expect((await decidePolicyQuarantine(id, 'approve', {}, deps())).status).toBe(200)
    expect(deliver).toHaveBeenCalledTimes(1)
  })

  it('a quarantined chat message tells the chat what became of it: delivered, rejected or expired', async () => {
    const { checkPolicy, resolveParty, holdForApproval } = await import('@/lib/policy-check')
    const { decidePolicyQuarantine, sweepPolicyQuarantine } = await import('@/services/policy-service')
    const outcome = vi.fn()
    ;(globalThis as any).__chatQuarantineOutcome = outcome
    const hold = () => {
      const from = { kind: 'person' as const }, to = resolveParty('agent:payroll')
      const d = holdForApproval(checkPolicy(from, to, 'message'), from, to, 'message', { path: 'chat', payload: { sessionName: 'payroll', message: 'hi' } })
      expect(d.reason).toMatch(/^Held for approval by alice \(quarantine qtn_/)
      return d.quarantine!.id
    }
    try {
      const a = hold(), b = hold(), c = hold()
      await decidePolicyQuarantine(a, 'approve', {}, deps())
      await decidePolicyQuarantine(b, 'reject', {}, deps())
      expect(outcome).toHaveBeenCalledWith(a, 'delivered', expect.stringContaining('delivered'))
      expect(outcome).toHaveBeenCalledWith(b, 'rejected', expect.stringContaining('was rejected'))
      expect(outcome).toHaveBeenCalledTimes(2)
      vi.useFakeTimers({ now: Date.now() + 31 * 60_000, toFake: ['Date'] })
      try { await sweepPolicyQuarantine({ notify }) } finally { vi.useRealTimers() }
      expect(outcome).toHaveBeenCalledWith(c, 'expired', expect.stringContaining('expired'))
      // A quarantined message on another path never reaches the chat
      outcome.mockClear()
      await decidePolicyQuarantine(await holdOne(), 'approve', {}, deps())
      expect(outcome).not.toHaveBeenCalled()
    } finally {
      delete (globalThis as any).__chatQuarantineOutcome
    }
  })

  it('an ask nobody can approve is a block: 403 forbidden with the reason', async () => {
    writeRules(home, [{ ...ASK_PAYROLL, approvers: ['role:payroll-lead'] }])
    const { sendMessage } = await import('@/services/messages-service')
    const r = await sendMessage({ from: 'bob', to: 'payroll', subject: 'Hi', content: { type: 'request', message: 'x' } })
    expect(r).toMatchObject({ status: 403, data: { error: 'forbidden' } })
    expect((r.data as any).message).toContain('no approver could be found (role:payroll-lead: not supported yet)')
  })

  it('the AMP route answers 202 quarantined on the host whose rules asked, and GET shows the held message', async () => {
    const { routeMessage } = await import('@/services/amp-service')
    const { getSelfHostId } = await import('@/lib/hosts-config')
    const self = getSelfHostId()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = await routeMessage({ from: `dev@${self}.aimaestro.local`, to: 'payroll', subject: 'Hi', payload: { type: 'request', message: 'x' } } as any, null, self, null, null, null)
    warn.mockRestore(); log.mockRestore()
    expect(r.status).toBe(202)
    expect(r.data).toMatchObject({ id: expect.any(String), status: 'quarantined', quarantine: { quarantine_id: expect.stringMatching(QTN), reason: 'policy', expires_at: expect.any(String) } })
    expect(r.data).not.toHaveProperty('error')
    const id = (r.data as any).quarantine.quarantine_id
    const { getPolicyQuarantine } = await import('@/services/policy-service')
    const entry = (await getPolicyQuarantine(id)).data as any
    expect(entry).toMatchObject({ held: { path: 'amp-route' }, from: expect.stringMatching(/^agent:dev/), message: { envelope: { id: (r.data as any).id }, payload: { message: 'x' } } })
  })

  it('across hosts: the list includes peers (localOnly=1), and a decision goes to the host that keeps the entry', async () => {
    const { clearHostsCache } = await import('@/lib/hosts-config')
    vi.stubEnv('AIMAESTRO_HOSTS', JSON.stringify([{ id: 'peer-b', name: 'peer-b', url: 'http://peer-b.test:23000' }]))
    clearHostsCache()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const peerItem = { quarantine_id: 'qtn_1763650000_abcdef', status: 'pending', quarantined_at: '2099-01-01T00:00:00.000Z', host: 'peer-b' }
    const calls: { url: string; body?: string }[] = []
    const peerFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined })
      const body = url.includes('/approve') ? { quarantine_id: peerItem.quarantine_id, status: 'approved', message_id: 'msg_1', delivered: true } : { items: [peerItem], count: 1, total: 1 }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof fetch
    try {
      const { listPolicyQuarantine, decidePolicyQuarantine } = await import('@/services/policy-service')
      const mine = await holdOne()
      const r = await listPolicyQuarantine({}, peerFetch)
      expect(calls[0].url).toBe('http://peer-b.test:23000/api/v1/quarantine?localOnly=1&status=pending&limit=100')
      expect(r.data!.items.map(i => i.quarantine_id)).toEqual([peerItem.quarantine_id, mine])
      const d = await decidePolicyQuarantine(peerItem.quarantine_id, 'approve', { by: 'Alice', host: 'peer-b' }, { ...deps(), fetch: peerFetch })
      expect(d).toMatchObject({ status: 200, data: { status: 'approved', delivered: true } })
      expect(calls[1].url).toBe(`http://peer-b.test:23000/api/v1/quarantine/${peerItem.quarantine_id}/approve`)
      expect(JSON.parse(calls[1].body!)).toEqual({ by: 'Alice' })
      expect(deliver).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
      vi.stubEnv('AIMAESTRO_HOSTS', '')
      clearHostsCache()
    }
  })

  it('device input cannot wait for a decision: refused, no entry', async () => {
    const { askNotPossible, checkPolicy, resolveParty } = await import('@/lib/policy-check')
    const d = askNotPossible(checkPolicy({ kind: 'person' }, resolveParty('agent:payroll'), 'message'), 'a device input has no screen to wait for an approval')
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('not possible here')
    expect(fs.existsSync(path.join(policy(), 'quarantine.json'))).toBe(false)
  })

  it('with no rules file nothing changes on any path, and no store is written', async () => {
    fs.rmSync(ruleFile(home))
    fs.rmSync(`${ruleFile(home)}.last-good`, { force: true }) // a host with no rules at all, not a deleted file
    vi.resetModules() // and a server that never loaded any (a deleted file keeps the version this process loaded)
    const { startCall } = await import('@/services/calls-service')
    const { checkPolicy, resolveParty } = await import('@/lib/policy-check')
    expect(startCall({ caller: 'agent:backend', callee: 'person:bob' }).status).toBe(201)
    expect(checkPolicy(resolveParty('person:bob'), resolveParty('agent:payroll')).allowed).toBe(true)
    const { sendChatMessage } = await import('@/services/agents-chat-service')
    expect((await sendChatMessage('no-such-agent', 'hi')).status).toBe(404)
    expect(fs.existsSync(path.join(policy(), 'quarantine.json'))).toBe(false)
  })
})

describe('Doctor', () => {
  it('fails when the store cannot be read, warns on overdue entries', () => {
    expect(checkPolicyApprovals({ file: 'a.json', pending: 0, overdue: [] }).status).toBe('pass')
    expect(checkPolicyApprovals({ file: 'a.json', pending: 1, overdue: ['qtn_1_abcdef'] }).status).toBe('warn')
    expect(checkPolicyApprovals({ file: 'a.json', pending: 0, overdue: [], error: 'bad json' }).status).toBe('fail')
  })
})
