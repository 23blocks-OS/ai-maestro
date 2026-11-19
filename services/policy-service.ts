/**
 * Policy Service (F042, docs/SPEC-POLICY-RULES.md): read this host's rules, and answer "why can't A reach B".
 *
 * GET /api/policy                                   — this host's rules file, its rules (as version 2 rules), lint
 *                                                     warnings, the results of the file's tests, and its error if it is broken
 * GET /api/policy/check?from=&to=[&action=call]     — the decision on this host, and on the sender's and recipient's
 *                                                     hosts when they are other hosts (each host enforces its own rules)
 *     &localOnly=1                                  — this host only; what a peer asks, so two hosts never ask each other in a loop
 * GET  /api/policy/requests[?state=][&localOnly=1]  — approval requests (F118 step 2): this host's, and every peer's
 * POST /api/policy/requests/:id/answer              — answer one: { answer: once|for|always|refuse, for?, by?, keyId?,
 *                                                     signature?, signedAt?, host? } (host: the host that keeps it)
 */
import { getHostById, getPeerHosts, getSelfHostId, isSelf } from '@/lib/hosts-config'
import {
  loadPolicy, lintPolicy, partyLabel, policyLogFile, runPolicyTests, POLICY_ACTIONS,
  type Policy, type PolicyAction, type PolicyDecision, type PolicyEffect, type PolicyLint, type PolicyRuleV2, type PolicyTestResult,
} from '@/lib/policy'
import { checkPolicy, resolveParty, teamsOf } from '@/lib/policy-check'
import {
  answerApproval, listApprovals, recordDelivery, sweepApprovals,
  type AnswerResult, type ApprovalRequest, type HeldPath, type RequestState,
} from '@/lib/policy-approvals'
import { personKeyFor } from '@/lib/person-keys'
import type { DeviceKey } from '@/lib/person-signing'
import { type ServiceResult, missingField, invalidField, notFound, operationFailed } from '@/services/service-errors'

const PEER_TIMEOUT_MS = 5_000

export interface PolicyReport {
  host: string
  file: string
  /** Absent when there is no file (no rules: everyone may reach everyone) */
  version?: 1 | 2
  default?: Policy['default']
  mode?: Policy['mode']
  rules: PolicyRuleV2[]
  hash?: string
  lint: PolicyLint[]
  tests: PolicyTestResult[]
  decisionLog: string
  error?: string
}

export function getPolicy(): ServiceResult<PolicyReport> {
  const { file, rules, policy, hash, error } = loadPolicy()
  const host = getSelfHostId()
  return {
    data: {
      host, file, rules,
      ...(policy ? { version: policy.version, default: policy.default, mode: policy.mode, hash } : {}),
      lint: policy ? lintPolicy(policy) : [],
      tests: policy ? runPolicyTests(policy, ref => resolveParty(ref), { host, teamsOf }) : [],
      decisionLog: policyLogFile(),
      ...(error ? { error } : {}),
    },
    status: 200,
  }
}

export interface PolicyExplanation {
  allowed: boolean
  /** The strictest answer of every host: deny, then ask, then allow */
  effect: PolicyEffect
  reason: string
  from: string
  to: string
  action: PolicyAction
  decisions: PolicyDecision[]
  /** Hosts whose rules also apply but did not answer */
  unreachable?: { host: string; error: string }[]
}

const effectOf = (d: PolicyDecision): PolicyEffect => d.effect ?? (d.allowed ? 'allow' : 'deny')

export async function explainPolicy(
  q: { from?: string | null; to?: string | null; action?: string | null; localOnly?: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceResult<PolicyExplanation>> {
  if (!q.from) return missingField('from')
  if (!q.to) return missingField('to')
  const action = (q.action || 'message') as PolicyAction
  if (!POLICY_ACTIONS.includes(action)) return invalidField('action', `action must be ${POLICY_ACTIONS.join(' or ')}`)

  const from = resolveParty(q.from)
  const to = resolveParty(q.to)
  // A question decides nothing, so it is not logged
  const decisions: PolicyDecision[] = [checkPolicy(from, to, action, { log: false })]
  const unreachable: { host: string; error: string }[] = []

  if (!q.localOnly) {
    const others = [...new Set([from.host, to.host].filter((h): h is string => !!h && !isSelf(h)))]
    await Promise.all(others.map(async hostId => {
      const host = getHostById(hostId)
      if (!host) return unreachable.push({ host: hostId, error: 'not in hosts.json' })
      try {
        const qs = new URLSearchParams({ from: q.from!, to: q.to!, action, localOnly: '1' })
        const res = await fetchImpl(`${host.url.replace(/\/$/, '')}/api/policy/check?${qs}`, { signal: AbortSignal.timeout(PEER_TIMEOUT_MS) })
        const body = await res.json().catch(() => null) as PolicyExplanation | null
        // A host older than F042 answers 404: it has no rules, so it allows
        if (res.status === 404) decisions.push({ allowed: true, effect: 'allow', reason: `Allowed: host ${hostId} does not check rules (older version)`, host: hostId })
        else if (!res.ok || !body?.decisions?.[0]) unreachable.push({ host: hostId, error: `answered ${res.status}` })
        else decisions.push({ ...body.decisions[0], host: body.decisions[0].host || hostId })
      } catch (error) {
        unreachable.push({ host: hostId, error: (error as Error).message })
      }
    }))
  }

  const strictest = decisions.find(d => effectOf(d) === 'deny') || decisions.find(d => effectOf(d) === 'ask')
  return {
    data: {
      allowed: !strictest,
      effect: strictest ? effectOf(strictest) : 'allow',
      reason: (strictest || decisions[0]).reason,
      from: partyLabel(from),
      to: partyLabel(to),
      action,
      decisions,
      ...(unreachable.length ? { unreachable } : {}),
    },
    status: 200,
  }
}

// ── Approvals (F118 step 2, spec section 17) ─────────────────────────────────

export type ApprovalView = Omit<ApprovalRequest, 'pass' | 'fromParty' | 'toParty'>

const view = (r: ApprovalRequest): ApprovalView => {
  const { pass: _pass, fromParty: _f, toParty: _t, ...rest } = r
  return rest
}

const STATES: RequestState[] = ['pending', 'approved', 'refused', 'expired']

/** This host's requests and, unless localOnly, every peer's (asked with localOnly=1, so hosts never ask each other in a loop) */
export async function listPolicyRequests(
  q: { state?: string | null; localOnly?: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceResult<{ host: string; requests: ApprovalView[]; unreachable?: { host: string; error: string }[] }>> {
  const state = (q.state || undefined) as RequestState | undefined
  if (state && !STATES.includes(state)) return invalidField('state', `state must be ${STATES.join(', ')}`)
  // Expire first through the sweep that tells the senders
  await sweepPolicyRequests()
  let requests: ApprovalView[]
  try { requests = listApprovals(state).map(view) } catch (e) { return operationFailed('read the approval store', (e as Error).message) }
  const unreachable: { host: string; error: string }[] = []
  if (!q.localOnly) {
    await Promise.all(getPeerHosts().filter(h => h.enabled !== false && h.url).map(async h => {
      try {
        const qs = new URLSearchParams({ localOnly: '1', ...(state ? { state } : {}) })
        const res = await fetchImpl(`${h.url.replace(/\/$/, '')}/api/policy/requests?${qs}`, { signal: AbortSignal.timeout(PEER_TIMEOUT_MS) })
        // A host older than F118 step 2 keeps no requests
        if (res.status === 404) return
        const body = await res.json().catch(() => null) as { requests?: ApprovalView[] } | null
        if (!res.ok || !Array.isArray(body?.requests)) return unreachable.push({ host: h.id, error: `answered ${res.status}` })
        requests.push(...body!.requests.map(r => ({ ...r, host: r.host || h.id })))
      } catch (e) {
        unreachable.push({ host: h.id, error: (e as Error).message })
      }
    }))
  }
  requests.sort((a, b) => b.created.localeCompare(a.created))
  return { data: { host: getSelfHostId(), requests, ...(unreachable.length ? { unreachable } : {}) }, status: 200 }
}

export interface ApprovalDeps {
  /** Delivers an approved held message through the path that held it */
  deliver: (held: { path: HeldPath; payload: unknown }, request: ApprovalRequest) => Promise<{ ok: boolean; status?: number; message?: string }>
  /** Tells the sender (an agent) what became of its message or call */
  notify: (request: ApprovalRequest, text: string) => Promise<void>
  keyFor: (keyId: string) => Promise<DeviceKey | null>
  fetch: typeof fetch
}

/** The normal send path again, with this request's one pass through its policy check */
export async function deliverHeld(held: { path: HeldPath; payload: unknown }, request: ApprovalRequest): Promise<{ ok: boolean; status?: number; message?: string }> {
  const p = held.payload as any
  try {
    if (held.path === 'amp-route') {
      // After the route's policy check: the same delivery code the route runs
      const { deliverRouted } = await import('@/services/amp-service')
      const r = await deliverRouted(p)
      return { ok: r.status < 300, status: r.status, message: (r.data as any)?.message || (r.data as any)?.status }
    }
    if (held.path === 'ui-send' || held.path === 'ui-forward') {
      const ms = await import('@/lib/message-send')
      await (held.path === 'ui-send' ? ms.sendFromUI({ ...p, approved: request.id }) : ms.forwardFromUI({ ...p, approved: request.id }))
      return { ok: true }
    }
    // chat: the dashboard chat's own path when the server runs (server.mjs), else the REST chat path
    const line = (globalThis as { __deliverChatLine?: (s: string, t: string, a?: string) => Promise<{ ok: boolean; error?: string }> }).__deliverChatLine
    if (line && p.sessionName) {
      const r = await line(p.sessionName, p.message, request.id)
      return { ok: r.ok, ...(r.error ? { message: r.error } : {}) }
    }
    const { sendChatMessage } = await import('@/services/agents-chat-service')
    const r = await sendChatMessage(p.agentId, p.message, { approved: request.id })
    return { ok: r.status < 300, status: r.status, message: (r.data as any)?.message || (r.data as any)?.error }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

/** A notification from AI Maestro into the sender's inbox. Only an agent has one; a person sees the request in the dashboard. */
async function notifySender(request: ApprovalRequest, text: string): Promise<void> {
  const f = request.fromParty
  if (f.kind !== 'agent' || !(f.name || f.id)) return
  try {
    const { sendFromUI } = await import('@/lib/message-send')
    const to = f.host && !isSelf(f.host) ? `${f.name || f.id}@${f.host}` : (f.id || f.name)!
    await sendFromUI({ from: 'maestro', fromAlias: 'AI Maestro', to, subject: `Approval ${request.state}: your ${request.action} to ${request.to}`, content: { type: 'notification', message: text } })
  } catch (e) {
    console.warn(`[Policy] could not tell ${partyLabel(f)} about request ${request.id}: ${(e as Error).message}`)
  }
}

const defaultDeps: ApprovalDeps = { deliver: deliverHeld, notify: notifySender, keyFor: id => personKeyFor(id), fetch: (...a) => fetch(...a) }

/** Expires overdue requests and tells their senders. Never throws (the sweeper and startup call it). */
export async function sweepPolicyRequests(deps: Pick<ApprovalDeps, 'notify'> = defaultDeps): Promise<number> {
  let due: ApprovalRequest[] = []
  try { due = sweepApprovals() } catch (e) { console.warn(`[Policy] sweep: ${(e as Error).message}`); return 0 }
  for (const r of due) {
    await deps.notify(r, `Your ${r.action} to ${r.to} was not ${r.held ? 'delivered' : 'approved'}: nobody answered request ${r.id} before it expired at ${r.expiresAt} (rule ${r.rules.join(', ')}).`)
  }
  return due.length
}

export async function answerPolicyRequest(
  id: string,
  body: Record<string, unknown> | null,
  deps: ApprovalDeps = defaultDeps,
): Promise<ServiceResult<{ request: ApprovalView; delivery?: { ok: boolean; status?: number; message?: string } }>> {
  if (!/^apr-[a-z0-9-]{1,64}$/.test(id || '')) return invalidField('id', 'not an approval request id')
  const input = body && typeof body === 'object' ? body : {}
  // The request lives on the host whose rules asked: pass the answer on to it
  const host = typeof input.host === 'string' ? input.host : ''
  if (host && !isSelf(host)) {
    const peer = getHostById(host)
    if (!peer?.url) return notFound('Host', host)
    try {
      const { host: _h, ...rest } = input
      const res = await deps.fetch(`${peer.url.replace(/\/$/, '')}/api/policy/requests/${encodeURIComponent(id)}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rest), signal: AbortSignal.timeout(PEER_TIMEOUT_MS * 3),
      })
      return { data: await res.json(), status: res.status }
    } catch (e) {
      return operationFailed(`pass the answer to ${host}`, (e as Error).message)
    }
  }

  let result: AnswerResult
  await sweepPolicyRequests(deps)
  try { result = await answerApproval(id, input, { keyFor: deps.keyFor }) } catch (e) { return operationFailed('answer the request', (e as Error).message) }
  if (!result.ok) return { data: { error: result.error, message: result.message } as any, status: result.status }
  const r = result.request
  const by = r.answer!.by
  let delivery: { ok: boolean; status?: number; message?: string } | undefined
  if (result.held) {
    delivery = await deps.deliver(result.held, r)
    recordDelivery(r.id, delivery)
    r.delivery = { at: new Date().toISOString(), ...delivery }
  }
  const how = r.answer!.answer === 'for' ? `for ${r.answer!.for}` : r.answer!.answer
  const text = r.state === 'refused'
    ? `Your ${r.action} to ${r.to} was refused by ${by} (request ${r.id}, rule ${r.rules.join(', ')}).`
    : r.held
      ? delivery?.ok
        ? `Your message to ${r.to} was approved by ${by} (${how}) and delivered (request ${r.id}).`
        : `Your message to ${r.to} was approved by ${by} (${how}), but it could not be delivered: ${delivery?.message || r.delivery?.message || 'unknown error'} (request ${r.id}).`
      : `Your ${r.action} to ${r.to} was approved by ${by} (${how})${r.answer!.until ? `: try again before ${r.answer!.until}` : ''} (request ${r.id}).`
  await deps.notify(r, text)
  return { data: { request: view(r), ...(delivery ? { delivery } : {}) }, status: 200 }
}
