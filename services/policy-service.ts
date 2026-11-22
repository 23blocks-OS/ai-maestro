/**
 * Policy Service (F042, docs/SPEC-POLICY-RULES.md): read this host's rules, and answer "why can't A reach B".
 *
 * GET /api/policy                                   — this host's rules file, its rules (as version 2 rules), lint
 *                                                     warnings, the results of the file's tests, and its error if it is broken
 * GET /api/policy/check?from=&to=[&action=call]     — the decision on this host, and on the sender's and recipient's
 *                                                     hosts when they are other hosts (each host enforces its own rules)
 *     &localOnly=1                                  — this host only; what a peer asks, so two hosts never ask each other in a loop
 * GET  /api/v1/quarantine?status=&limit=[&localOnly=1] — quarantine entries of `ask` rules (F118 step 2, AMP 08):
 *                                                     this host's, and every peer's
 * GET  /api/v1/quarantine/{id}[?host=]              — one entry, with the held AMP message when there is one
 * POST /api/v1/quarantine/{id}/approve | /reject     — { by?, host? } (host: the host that keeps it)
 * A message to `_provider` answering an approval request (AMP 07 "Approval by message") — answerProviderMessage
 */
import fs from 'fs'
import path from 'path'
import { getHostById, getPeerHosts, getSelfHostId, isSelf } from '@/lib/hosts-config'
import {
  loadPolicy, lintPolicy, partyLabel, policyLogFile, policySettings, runPolicyTests, POLICY_ACTIONS,
  type Policy, type PolicyAction, type PolicyDecision, type PolicyEffect, type PolicyLint, type PolicyRuleV2, type PolicyTestResult,
} from '@/lib/policy'
import { checkPolicy, resolveParty, teamsOf } from '@/lib/policy-check'
import {
  decideQuarantine, findApprovalRequest, listQuarantine, peekHeld, recordDelivery, sweepQuarantine, QUARANTINE_ID, QUARANTINE_STATES,
  type DecideResult, type HeldPath, type QuarantineEntry, type QuarantineStatus, type SignedAnswer,
} from '@/lib/policy-approvals'
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
  /** The file is AIMAESTRO_POLICY_FILE */
  configured: boolean
  /** AIMAESTRO_POLICY_FAIL_CLOSED is on */
  failClosed: boolean
  /** The file cannot be used and fail-closed is on: agents' messages, calls and governance actions are refused now */
  refusing?: boolean
  /** The rules in force are not the file's: the version this process loaded, or the saved copy */
  lastGood?: 'memory' | 'saved'
  /** A configured file, or its folder, that this server's OS user (so every agent on the host) can write */
  writable?: string[]
}

/** The configured file and its folder, where the server's own user can change them (fs.access W_OK) */
function writableBy(file: string): string[] {
  const out: string[] = []
  for (const p of [file, path.dirname(file)]) {
    try { fs.accessSync(p, fs.constants.W_OK); out.push(p) } catch { /* not writable, or missing */ }
  }
  return out
}

export function getPolicy(): ServiceResult<PolicyReport> {
  const settings = policySettings()
  const { file, rules, policy, hash, error, failClosed: refusing, lastGood } = loadPolicy()
  const host = getSelfHostId()
  const writable = settings.configured && !settings.error ? writableBy(file) : []
  return {
    data: {
      host, file, rules, configured: settings.configured, failClosed: settings.failClosed,
      ...(refusing ? { refusing: true } : {}), ...(lastGood ? { lastGood } : {}), ...(writable.length ? { writable } : {}),
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

// ── Quarantine (F118 step 2, AMP 07 "Message Quarantine", 08 "Quarantine Management"; spec section 17) ─────

/** An entry as the API shows it: AMP 07 metadata plus AI Maestro's fields, without the internal parties and pass */
export type QuarantineView = Omit<QuarantineEntry, 'pass_until' | 'fromParty' | 'toParty' | 'requests'>

const view = (r: QuarantineEntry): QuarantineView => {
  const { pass_until: _pass, fromParty: _f, toParty: _t, requests: _q, ...rest } = r
  return rest
}

const peerUrl = (h: { url: string }) => h.url.replace(/\/$/, '')

/**
 * GET /api/v1/quarantine?status=&limit= — this host's entries and, unless localOnly, every peer's (asked with
 * localOnly=1, so hosts never ask each other in a loop). status defaults to pending, limit to 20 (1-100), as in AMP 08.
 */
export async function listPolicyQuarantine(
  q: { status?: string | null; limit?: string | null; localOnly?: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceResult<{ items: QuarantineView[]; count: number; total: number; unreachable?: { host: string; error: string }[] }>> {
  const status = (q.status || 'pending') as QuarantineStatus
  if (!QUARANTINE_STATES.includes(status)) return invalidField('status', `status must be ${QUARANTINE_STATES.join(', ')}`)
  const limit = q.limit ? Number(q.limit) : 20
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return invalidField('limit', 'limit must be 1 to 100')
  // Expire first through the sweep that tells the senders
  await sweepPolicyQuarantine()
  let items: QuarantineView[]
  try { items = listQuarantine(status).map(view) } catch (e) { return operationFailed('read the quarantine store', (e as Error).message) }
  const unreachable: { host: string; error: string }[] = []
  if (!q.localOnly) {
    await Promise.all(getPeerHosts().filter(h => h.enabled !== false && h.url).map(async h => {
      try {
        const qs = new URLSearchParams({ localOnly: '1', status, limit: '100' })
        const res = await fetchImpl(`${peerUrl(h)}/api/v1/quarantine?${qs}`, { signal: AbortSignal.timeout(PEER_TIMEOUT_MS) })
        // A host without quarantine keeps no entries
        if (res.status === 404) return
        const body = await res.json().catch(() => null) as { items?: QuarantineView[] } | null
        if (!res.ok || !Array.isArray(body?.items)) return unreachable.push({ host: h.id, error: `answered ${res.status}` })
        items.push(...body!.items.map(r => ({ ...r, host: r.host || h.id })))
      } catch (e) {
        unreachable.push({ host: h.id, error: (e as Error).message })
      }
    }))
  }
  items.sort((a, b) => b.quarantined_at.localeCompare(a.quarantined_at))
  const total = items.length
  items = items.slice(0, limit)
  return { data: { items, count: items.length, total, ...(unreachable.length ? { unreachable } : {}) }, status: 200 }
}

/** The AMP message of an entry held at the route (08: `message` is its envelope and payload); other paths have none */
function heldMessage(r: QuarantineEntry): { envelope: unknown; payload: unknown } | undefined {
  if (r.status !== 'pending' || r.held?.path !== 'amp-route') return undefined
  const p = peekHeld(r.quarantine_id) as { envelope?: unknown; body?: { payload?: unknown } } | null
  return p?.envelope ? { envelope: p.envelope, payload: p.body?.payload } : undefined
}

/** GET /api/v1/quarantine/{id}[?host=] — one entry; with host, from the host that keeps it */
export async function getPolicyQuarantine(id: string, host?: string | null, fetchImpl: typeof fetch = fetch): Promise<ServiceResult<QuarantineView & { message?: unknown }>> {
  if (!QUARANTINE_ID.test(id || '')) return invalidField('id', 'not a quarantine id (qtn_<timestamp>_<hex>)')
  if (host && !isSelf(host)) {
    const peer = getHostById(host)
    if (!peer?.url) return notFound('Host', host)
    try {
      const res = await fetchImpl(`${peerUrl(peer)}/api/v1/quarantine/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(PEER_TIMEOUT_MS) })
      return { data: await res.json(), status: res.status }
    } catch (e) { return operationFailed(`read the entry on ${host}`, (e as Error).message) }
  }
  await sweepPolicyQuarantine()
  let r: QuarantineEntry | undefined
  try { r = listQuarantine().find(x => x.quarantine_id === id) } catch (e) { return operationFailed('read the quarantine store', (e as Error).message) }
  if (!r) return notFound('Quarantine entry', id)
  const message = heldMessage(r)
  return { data: { ...view(r), ...(message ? { message } : {}) }, status: 200 }
}

export interface ApprovalDeps {
  /** Delivers an approved held message through the path that held it */
  deliver: (held: { path: HeldPath; payload: unknown }, entry: QuarantineEntry) => Promise<{ ok: boolean; status?: number; message?: string; message_id?: string }>
  /** Tells the sender (an agent) what became of its message or call */
  notify: (entry: QuarantineEntry, text: string) => Promise<void>
  fetch: typeof fetch
}

/** The normal send path again, with this entry's one pass through its policy check (08: "as if it had just arrived") */
export async function deliverHeld(held: { path: HeldPath; payload: unknown }, entry: QuarantineEntry): Promise<{ ok: boolean; status?: number; message?: string; message_id?: string }> {
  const p = held.payload as any
  const id = entry.quarantine_id
  try {
    if (held.path === 'amp-route') {
      // After the route's policy check: the same delivery code the route runs
      const { deliverRouted } = await import('@/services/amp-service')
      const r = await deliverRouted(p)
      const d = r.data as any
      return { ok: r.status < 300, status: r.status, message: d?.message || d?.status, ...(d?.id ? { message_id: d.id } : {}) }
    }
    if (held.path === 'ui-send' || held.path === 'ui-forward') {
      const ms = await import('@/lib/message-send')
      const out = await (held.path === 'ui-send' ? ms.sendFromUI({ ...p, approved: id }) : ms.forwardFromUI({ ...p, approved: id }))
      return { ok: true, ...(out?.message?.id ? { message_id: out.message.id } : {}) }
    }
    // chat: the dashboard chat's own path when the server runs (server.mjs), else the REST chat path
    const line = (globalThis as { __deliverChatLine?: (s: string, t: string, a?: string) => Promise<{ ok: boolean; error?: string }> }).__deliverChatLine
    if (line && p.sessionName) {
      const r = await line(p.sessionName, p.message, id)
      return { ok: r.ok, ...(r.error ? { message: r.error } : {}) }
    }
    const { sendChatMessage } = await import('@/services/agents-chat-service')
    const r = await sendChatMessage(p.agentId, p.message, { approved: id })
    return { ok: r.status < 300, status: r.status, message: (r.data as any)?.message || (r.data as any)?.error }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

/** The outcome as a signed provider notice to the sender (AMP 07 "Outcome notice"), agent or person */
async function notifySender(entry: QuarantineEntry, text: string): Promise<void> {
  const { sendOutcomeNotice } = await import('@/services/provider-notices')
  await sendOutcomeNotice(entry, text)
}

/** The dashboard chat shows a held bubble until this says what became of it (server.mjs `__chatQuarantineOutcome`) */
function tellChat(r: QuarantineEntry, outcome: 'delivered' | 'rejected' | 'expired' | 'failed', text: string): void {
  if (r.held?.path !== 'chat') return
  try { (globalThis as { __chatQuarantineOutcome?: (id: string, o: string, t: string) => void }).__chatQuarantineOutcome?.(r.quarantine_id, outcome, text) } catch { /* the chat is a view */ }
}

const defaultDeps: ApprovalDeps = { deliver: deliverHeld, notify: notifySender, fetch: (...a) => fetch(...a) }

/** Expires overdue entries and tells their senders. Never throws (the sweeper and startup call it). */
export async function sweepPolicyQuarantine(deps: Pick<ApprovalDeps, 'notify'> = defaultDeps): Promise<number> {
  let due: QuarantineEntry[] = []
  try { due = sweepQuarantine() } catch (e) { console.warn(`[Policy] sweep: ${(e as Error).message}`); return 0 }
  for (const r of due) {
    const text = `Your ${r.action} to ${r.to} was not ${r.held ? 'delivered' : 'approved'}: quarantine entry ${r.quarantine_id} expired at ${r.expires_at} before anyone approved it (rule ${r.rules_triggered.join(', ')}).`
    tellChat(r, 'expired', text)
    await deps.notify(r, text)
  }
  return due.length
}

type ApproveResponse = { quarantine_id: string; status: 'approved'; message_id: string | null; delivered: boolean }
type RejectResponse = { quarantine_id: string; status: 'rejected' }

/**
 * POST /api/v1/quarantine/{id}/approve and /reject (AMP 08). Body: { by?, host? } (host: the host that keeps it).
 * Approve releases the one message, once: 200 { quarantine_id, status: "approved", message_id, delivered }. 410
 * quarantine_expired, 409 when already decided.
 */
export async function decidePolicyQuarantine(
  id: string,
  decision: 'approve' | 'reject',
  body: Record<string, unknown> | null,
  deps: ApprovalDeps = defaultDeps,
): Promise<ServiceResult<ApproveResponse | RejectResponse>> {
  if (!QUARANTINE_ID.test(id || '')) return invalidField('id', 'not a quarantine id (qtn_<timestamp>_<hex>)')
  const input = body && typeof body === 'object' ? body : {}
  // The entry lives on the host whose rules asked: pass the decision on to it
  const host = typeof input.host === 'string' ? input.host : ''
  if (host && !isSelf(host)) {
    const peer = getHostById(host)
    if (!peer?.url) return notFound('Host', host)
    try {
      const { host: _h, ...rest } = input
      const res = await deps.fetch(`${peerUrl(peer)}/api/v1/quarantine/${encodeURIComponent(id)}/${decision}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rest), signal: AbortSignal.timeout(PEER_TIMEOUT_MS * 3),
      })
      return { data: await res.json(), status: res.status }
    } catch (e) {
      return operationFailed(`pass the ${decision} to ${host}`, (e as Error).message)
    }
  }

  await sweepPolicyQuarantine(deps)
  let result: DecideResult
  try { result = decideQuarantine(id, decision, { by: input.by }) } catch (e) { return operationFailed(`${decision} the entry`, (e as Error).message) }
  return finishDecision(result, deps)
}

/** After approve or reject: deliver what was held (once), tell the chat and the sender */
async function finishDecision(result: DecideResult, deps: ApprovalDeps): Promise<ServiceResult<ApproveResponse | RejectResponse>> {
  if (!result.ok) return { data: { error: result.error, message: result.message } as any, status: result.status }
  const r = result.entry
  const by = r.decided!.by
  if (r.status === 'rejected') {
    const text = `Your ${r.action} to ${r.to} was rejected by ${by} (quarantine ${r.quarantine_id}, rule ${r.rules_triggered.join(', ')}).`
    tellChat(r, 'rejected', text)
    await deps.notify(r, text)
    return { data: { quarantine_id: r.quarantine_id, status: 'rejected' }, status: 200 }
  }
  let delivery: { ok: boolean; status?: number; message?: string; message_id?: string } | undefined
  if (result.held) {
    delivery = await deps.deliver(result.held, r)
    recordDelivery(r.quarantine_id, delivery)
  }
  const text = r.held
    ? delivery?.ok
      ? `Your message to ${r.to} was approved by ${by} and delivered (quarantine ${r.quarantine_id}).`
      : `Your message to ${r.to} was approved by ${by}, but it could not be delivered: ${delivery?.message || r.delivery?.message || 'unknown error'} (quarantine ${r.quarantine_id}).`
    : `Your ${r.action} to ${r.to} was approved by ${by}: try again before ${r.pass_until} (quarantine ${r.quarantine_id}).`
  if (r.held) tellChat(r, delivery?.ok ? 'delivered' : 'failed', text)
  await deps.notify(r, text)
  return { data: { quarantine_id: r.quarantine_id, status: 'approved', message_id: delivery?.message_id ?? null, delivered: !!delivery?.ok }, status: 200 }
}

// ── Approval by message (AMP 07 "Policy Holds", 13.6 rule 5) ─────────────────

export interface ProviderMessage {
  /** The id and time this host gave the message */
  id: string
  timestamp: string
  /** The fields as signed (from, the full to, subject, priority, in_reply_to, payload) */
  signed: { from: string; to: string; subject: string; priority: string; in_reply_to: string; payload: unknown }
  signature?: string
  key_id?: string
  /** The route verified it for its sender: the agent's key, or for a person steps 1 to 5 of 13.3 */
  verified: boolean
  /** Forwarded by a peer: never passed on again */
  fromPeer: boolean
  /** The route body to pass it to the host that keeps the entry */
  forward: Record<string, unknown>
}

const refuse = (status: number, error: string, message: string) => ({ data: { error, message } as any, status })

/**
 * A message to `_provider` is for the provider only (07 "Provider Notices" rule 1). The one kind it acts on is a
 * reviewer's signed answer to an approval request; it applies the same result as POST approve / reject after the
 * checks of 07 "Approval by message", and keeps the signed answer as proof. A decision is never read from text.
 */
export async function answerProviderMessage(m: ProviderMessage, deps: ApprovalDeps = defaultDeps): Promise<ServiceResult<{ id: string; status: 'delivered'; method: 'local'; delivered_at: string }>> {
  const ctx = (m.signed.payload as { context?: { decision?: unknown; quarantine_id?: unknown } } | null)?.context
  const decision = ctx?.decision
  if (decision !== 'approve' && decision !== 'reject') {
    return refuse(400, 'invalid_field', 'A message to _provider answers an approval request: payload.context.decision must be "approve" or "reject" (the provider never reads a decision from text)')
  }
  const qid = typeof ctx?.quarantine_id === 'string' ? ctx.quarantine_id : ''
  if (!QUARANTINE_ID.test(qid)) return refuse(400, 'invalid_field', 'payload.context.quarantine_id must be the quarantine id the approval request names')
  if (!m.signed.in_reply_to) return refuse(400, 'missing_field', 'in_reply_to must be the id of the approval request notice')
  if (!m.verified) return refuse(403, 'forbidden', 'The answer must be a verified, signed message from the reviewer')

  let found: ReturnType<typeof findApprovalRequest>
  try { found = findApprovalRequest(m.signed.in_reply_to) } catch (e) { return operationFailed('read the quarantine store', (e as Error).message) }
  if (!found) return m.fromPeer ? refuse(404, 'not_found', `No approval request ${m.signed.in_reply_to} on this host`) : passToPeers(m, deps.fetch)
  if (found.entry.quarantine_id !== qid) return refuse(403, 'forbidden', `in_reply_to is the approval request for ${found.entry.quarantine_id}, not ${qid}`)
  if (found.to.toLowerCase() !== m.signed.from.toLowerCase()) return refuse(403, 'forbidden', 'That approval request was sent to another reviewer; only they can answer it')

  const answer: SignedAnswer = { id: m.id, ...m.signed, signature: m.signature || '', ...(m.key_id ? { key_id: m.key_id } : {}), verified_at: m.timestamp }
  await sweepPolicyQuarantine(deps)
  let result: DecideResult
  try { result = decideQuarantine(qid, decision, { signed: answer }) } catch (e) { return operationFailed(`${decision} the entry`, (e as Error).message) }
  const done = await finishDecision(result, deps)
  if (done.status !== 200) return done as any
  return { data: { id: m.id, status: 'delivered', method: 'local', delivered_at: m.timestamp }, status: 200 }
}

/** The entry is on the host whose rules asked: try each peer until one knows the approval request */
async function passToPeers(m: ProviderMessage, fetchImpl: typeof fetch) {
  for (const h of getPeerHosts().filter(x => x.enabled !== false && x.url)) {
    try {
      const res = await fetchImpl(`${peerUrl(h)}/api/v1/route`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-From': getSelfHostId() },
        body: JSON.stringify(m.forward), signal: AbortSignal.timeout(PEER_TIMEOUT_MS * 3),
      })
      if (res.status === 404) continue
      return { data: await res.json().catch(() => ({ error: 'internal_error', message: `${h.id} answered ${res.status}` })), status: res.status }
    } catch { /* next peer */ }
  }
  return refuse(404, 'not_found', `No host knows the approval request ${m.signed.in_reply_to}`)
}
