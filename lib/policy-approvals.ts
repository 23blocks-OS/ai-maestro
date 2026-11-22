/**
 * Ask = AMP quarantine (F118 step 2; AMP spec 07-security.md "Message Quarantine", 08-api.md "Quarantine Management";
 * docs/SPEC-POLICY-RULES.md section 17).
 *
 * An `ask` rule quarantines the message: it is accepted (202 `quarantined`) and not delivered until an approver approves
 * it. Entries follow AMP: ids `qtn_<unix-ts>_<hex>`, states `pending` -> `approved` | `rejected` | `expired` (one way),
 * metadata `quarantine_id, reason, rules_triggered, quarantined_at, expires_at, status`, and for a policy hold (07
 * "Policy Holds") `reason: "policy"`, the policy rule ids in `rules_triggered`, `reason_text` and `reviewers` (AMP
 * addresses; severity is left out, as 07 allows). The other fields (approvers, from/to, action, host) are AI Maestro's own.
 *
 * One store per host: ~/.aimaestro/policy/quarantine.json (mode 600, atomic writes), on the host whose rules asked: the
 * recipient's host for a delivery, the sender's host for a send. A quarantined message's payload is in its own file,
 * ~/.aimaestro/policy/quarantine/<id>.json (mode 600), never in the store or the decision log.
 *
 * Approve releases that one message, once. A call (not AMP) uses the same entries: an approved call entry lets the next
 * identical call through, once, within the rule's expiry window. No login: a dashboard decision is recorded as an
 * unverified person. A caller the server identified (lib/caller-identity) is recorded as who it is instead: the
 * operator, or an agent, which decides only as a named approver and never on what it sent (`known`). A reviewer may instead answer the approval request notice with a signed message (07 "Approval by
 * message"); that decision is verified, keeps the signed answer as proof, and is the only way to approve a rule with
 * proof "signed".
 */
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeFileAtomicSync } from '@/lib/atomic-write.mjs'
import { personAddress } from '@/lib/person-address'
import { getAMPProviderDomain } from '@/lib/types/amp'
import { getOrganization } from '@/lib/hosts-config'
import {
  DEFAULT_ASK_EXPIRY_MS, logPolicyDecision, partyLabel, policyLogFile, supportedApprover,
  type PolicyAction, type PolicyDecision, type PolicyLogLine, type PolicyParty,
} from '@/lib/policy'

/** AMP 07 quarantine states */
export type QuarantineStatus = 'pending' | 'approved' | 'rejected' | 'expired'
export const QUARANTINE_STATES: QuarantineStatus[] = ['pending', 'approved', 'rejected', 'expired']
/** Which send path holds the message, so approval delivers it through that same path */
export type HeldPath = 'amp-route' | 'ui-send' | 'ui-forward' | 'chat'

export interface Approver {
  /** person:<id>, person:* (any person) or agent:<name> */
  ref: string
  label: string
  /** The rule's pattern it came from (rel:manager, person:alice, ...) */
  via: string
}

export interface QuarantineEntry {
  // AMP 07 "Quarantine Metadata" and "Policy Holds"
  quarantine_id: string
  reason: 'policy'
  rules_triggered: string[]
  /** The decision's plain reason (rules and parties, never message text); 07 lets the sender see it */
  reason_text: string
  /** AMP addresses of the people and agents who may approve or reject (`person:*` has none, so it is not listed) */
  reviewers: string[]
  quarantined_at: string
  expires_at: string
  status: QuarantineStatus
  // AI Maestro's additions
  host: string
  action: PolicyAction
  from: string
  to: string
  fromParty: PolicyParty
  toParty: PolicyParty
  /** The reviewers with their names and the rule pattern each came from */
  approvers: Approver[]
  /** Approver patterns that did not resolve to anyone, with why */
  unresolved?: string[]
  proof: 'any' | 'signed'
  /** The sender's AMP address, for the outcome notice; none for an unidentified person */
  sender?: string
  /** The held message: its path, and its AMP id and from/to/subject when there is one (07 approval request `held`) */
  held?: { path: HeldPath; message_id?: string; from?: string; to?: string; subject?: string }
  /** The approval request notice sent to each reviewer: its message id is that reviewer's request (07) */
  requests?: { to: string; id: string; at: string }[]
  /** Who approved or rejected, when, and how (07 Policy Holds, reviewers rule 6); a signed answer is kept as proof */
  decided?: {
    by: string; at: string; via?: 'rest' | 'signed-message'; answer?: SignedAnswer
    /** How the server knew who decided over REST (lib/caller-identity): the operator token, or the agent's session or key */
    caller?: 'operator' | 'agent-session' | 'agent-key'
  }
  /** Approved: the one pass through the send path's policy check, until this time; consumed by it */
  pass_until?: string
  delivery?: { at: string; ok: boolean; status?: number; message?: string; message_id?: string }
}

/** A reviewer's signed answer to an approval request, as received and verified (07 "Approval by message") */
export interface SignedAnswer {
  id: string
  from: string
  to: string
  subject: string
  priority: string
  in_reply_to: string
  payload: unknown
  signature: string
  key_id?: string
  verified_at: string
}

interface Store { version: 1; entries: QuarantineEntry[] }

const KEEP_DECIDED_MS = 30 * 86_400_000
const PASS_MS = 5 * 60_000
export const QUARANTINE_ID = /^qtn_\d{1,12}_[0-9a-f]{6,32}$/

/** ~/.aimaestro/policy, resolved on every call so a test's HOME applies. Tests may never write the real one. */
function policyDir(): string {
  const home = os.homedir()
  if (process.env.VITEST && home === os.userInfo().homedir) throw new Error('quarantine store: tests must set HOME to a temporary folder')
  return path.join(home, '.aimaestro', 'policy')
}
export const quarantineFile = () => path.join(policyDir(), 'quarantine.json')
const heldFile = (id: string) => path.join(policyDir(), 'quarantine', `${id}.json`)

/** The store, or throws when the file exists and cannot be read (the Doctor fails then; nothing overwrites it). */
export function readQuarantine(): Store {
  const file = quarantineFile()
  let text: string
  try { text = fs.readFileSync(file, 'utf8') } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, entries: [] }
    throw new Error(`${file} cannot be read: ${(e as Error).message}`)
  }
  try {
    const s = JSON.parse(text)
    if (!s || !Array.isArray(s.entries)) throw new Error('it is not a quarantine store')
    return s as Store
  } catch (e) {
    throw new Error(`${file} cannot be read: ${(e as Error).message}`)
  }
}

function writeQuarantine(s: Store, now = Date.now()): void {
  s.entries = s.entries.filter(r => r.status === 'pending' || now - Date.parse(r.decided?.at || r.expires_at) < KEEP_DECIDED_MS)
  fs.mkdirSync(path.dirname(quarantineFile()), { recursive: true, mode: 0o700 })
  writeFileAtomicSync(quarantineFile(), JSON.stringify(s, null, 2) + '\n', { mode: 0o600 })
}

function record(line: Omit<PolicyLogLine, 'at'>): void {
  try { logPolicyDecision(line, process.env.VITEST ? path.join(policyDir(), 'decisions.jsonl') : policyLogFile()) } catch { /* never fails a send */ }
}

/** AMP 07: qtn_<timestamp>_<hex> */
const newId = (now: number) => `qtn_${Math.floor(now / 1000)}_${crypto.randomBytes(6).toString('hex')}`

/** An approver's AMP address: p-<id>@<domain> for a person (13.1), <name>@<domain> for an agent; none for person:* */
function reviewerAddress(ref: string): string | null {
  if (ref === 'person:*') return null
  if (ref.startsWith('person:')) return personAddress(ref.slice(7))
  const name = ref.slice(6)
  return name.includes('@') ? name : `${name}@${getAMPProviderDomain(getOrganization() || undefined)}`
}

/** A party's AMP address, or none (AI Maestro itself, an unidentified person) */
function partyAddress(p: PolicyParty): string | undefined {
  if (p.kind === 'person') return p.id ? personAddress(p.id) : undefined
  if (p.kind !== 'agent' || !(p.name || p.id)) return undefined
  return reviewerAddress(`agent:${p.name || p.id}`) || undefined
}

/** What the approval request says about the held message: the AMP envelope at the route, else the parties */
function heldSummary(path: HeldPath, payload: unknown, from: PolicyParty, to: PolicyParty): NonNullable<QuarantineEntry['held']> {
  const p = payload as { envelope?: { id?: string; from?: string; to?: string; subject?: string }; body?: { _forwarded?: { original_to?: unknown } } } | null
  const env = p?.envelope
  // A forwarding host names the recipient by bare name; the full address is in _forwarded
  const fwdTo = p?.body?._forwarded?.original_to
  if (path === 'amp-route' && env) return { path, message_id: env.id, from: env.from, to: typeof fwdTo === 'string' ? fwdTo : env.to, subject: env.subject }
  const subject = (payload as { subject?: unknown } | null)?.subject
  const f = partyAddress(from), t = partyAddress(to)
  return { path, ...(f ? { from: f } : {}), ...(t ? { to: t } : {}), ...(typeof subject === 'string' ? { subject } : {}) }
}

// ── Approvers (spec 11.3 item 2) ─────────────────────────────────────────────

export interface ApproverLookup {
  /** The registry agent behind a party, with its manager fields */
  agent(p: PolicyParty): { id: string; name?: string; humanManager?: string; managerAgentId?: string; owner?: string } | null
  agentById(id: string): { id: string; name?: string } | null
  agentByName(name: string): { id: string; name?: string } | null
  /** A person by id, display name or email */
  person(text: string): { id: string; displayName: string } | null
}

const lc = (s?: string) => (s || '').toLowerCase()

/**
 * The people and agents who may answer. rel:manager is the target agent's humanManager, else its managerAgentId;
 * rel:owner its owner. An agent approves only when a rule names it, and never the agent that asked.
 */
export function resolveApprovers(patterns: string[], from: PolicyParty, to: PolicyParty, look: ApproverLookup): { approvers: Approver[]; unresolved: string[] } {
  const approvers: Approver[] = []
  const unresolved: string[] = []
  const asker = from.kind === 'agent' ? [lc(from.name), lc(from.id)].filter(Boolean) : []
  const add = (a: Approver) => { if (!approvers.some(x => x.ref === a.ref)) approvers.push(a) }
  const asPerson = (text: string, via: string) => {
    const p = look.person(text)
    add(p ? { ref: `person:${p.id}`, label: p.displayName, via } : { ref: `person:${text}`, label: text, via })
  }
  const asAgent = (a: { id: string; name?: string } | null, via: string, what: string) => {
    if (!a) return unresolved.push(`${via}: ${what} is not an agent this host knows`)
    if (asker.includes(lc(a.name)) || asker.includes(lc(a.id))) return unresolved.push(`${via}: ${a.name || a.id} asked, and an agent never approves its own request`)
    add({ ref: `agent:${a.name || a.id}`, label: a.name || a.id, via })
  }
  for (const via of patterns) {
    if (!supportedApprover(via)) { unresolved.push(`${via}: not supported yet`); continue }
    if (via === 'rel:manager' || via === 'rel:owner') {
      const target = to.kind === 'agent' ? look.agent(to) : null
      if (!target) { unresolved.push(`${via}: ${partyLabel(to)} is not an agent on this host`); continue }
      if (via === 'rel:manager') {
        if (target.humanManager) asPerson(target.humanManager, via)
        else if (target.managerAgentId) asAgent(look.agentById(target.managerAgentId), via, target.managerAgentId)
        else unresolved.push(`${via}: ${partyLabel(to)} has no manager`)
      } else if (target.owner) {
        // owner is free text and can name a person or an agent
        const person = look.person(target.owner)
        if (person) add({ ref: `person:${person.id}`, label: person.displayName, via })
        else if (look.agentByName(target.owner)) asAgent(look.agentByName(target.owner), via, target.owner)
        else add({ ref: `person:${target.owner}`, label: target.owner, via })
      } else unresolved.push(`${via}: ${partyLabel(to)} has no owner`)
      continue
    }
    if (via === 'person:*') { add({ ref: 'person:*', label: 'any person', via }); continue }
    if (via.startsWith('person:')) { asPerson(via.slice(7), via); continue }
    const name = via.slice(6)
    asAgent(look.agentByName(name.split('@')[0]) || { id: name, name }, via, name)
  }
  return { approvers, unresolved }
}

// ── Entries ──────────────────────────────────────────────────────────────────

export interface NewQuarantine {
  decision: PolicyDecision
  from: PolicyParty
  to: PolicyParty
  action: PolicyAction
  host: string
  held?: { path: HeldPath; payload: unknown }
  look: ApproverLookup
  now?: number
}

/** A new pending entry, or why there can be none (no approver, an unreadable store). Never throws. */
export function createQuarantine(o: NewQuarantine): { entry: QuarantineEntry } | { refused: string } {
  const now = o.now ?? Date.now()
  const { approvers, unresolved } = resolveApprovers(o.decision.approvers || [], o.from, o.to, o.look)
  if (!approvers.length) return { refused: `no approver could be found (${unresolved.join('; ') || 'the rule names none'})` }
  try {
    const store = readQuarantine()
    expireDue(store, now)
    const entry: QuarantineEntry = {
      quarantine_id: newId(now), reason: 'policy', rules_triggered: o.decision.ruleIds || [], reason_text: o.decision.reason,
      reviewers: approvers.map(a => reviewerAddress(a.ref)).filter((a): a is string => !!a),
      quarantined_at: new Date(now).toISOString(), expires_at: new Date(now + (o.decision.expiresMs ?? DEFAULT_ASK_EXPIRY_MS)).toISOString(), status: 'pending',
      host: o.host, action: o.action, from: partyLabel(o.from), to: partyLabel(o.to), fromParty: o.from, toParty: o.to,
      approvers, ...(unresolved.length ? { unresolved } : {}), proof: o.decision.proof || 'any',
      ...(o.held ? { held: heldSummary(o.held.path, o.held.payload, o.from, o.to) } : {}),
    }
    const sender = entry.held?.from || partyAddress(o.from)
    if (sender) entry.sender = sender
    if (o.held) {
      fs.mkdirSync(path.dirname(heldFile(entry.quarantine_id)), { recursive: true, mode: 0o700 })
      writeFileAtomicSync(heldFile(entry.quarantine_id), JSON.stringify(o.held.payload), { mode: 0o600 })
    }
    store.entries.push(entry)
    writeQuarantine(store, now)
    record({ event: 'quarantined', request: entry.quarantine_id, host: o.host, action: o.action, from: entry.from, to: entry.to, effect: 'ask', rules: entry.rules_triggered, approvers: approvers.map(a => a.ref), proof: entry.proof })
    return { entry }
  } catch (e) {
    return { refused: `the quarantine store cannot be used: ${(e as Error).message}` }
  }
}

/** Marks overdue pending entries expired (in `store`, not saved) and drops their payloads. Returns them. */
function expireDue(store: Store, now: number): QuarantineEntry[] {
  const due = store.entries.filter(r => r.status === 'pending' && Date.parse(r.expires_at) <= now)
  for (const r of due) {
    r.status = 'expired'
    dropHeld(r.quarantine_id)
    // AMP 07 TTL: not delivered, logged for audit
    record({ event: 'expired', request: r.quarantine_id, host: r.host, action: r.action, from: r.from, to: r.to, effect: 'deny', rules: r.rules_triggered, note: 'no decision before it expired' })
  }
  return due
}

/** Expires every overdue entry and saves. Returns the ones that just expired, so the caller can tell the senders. */
export function sweepQuarantine(now = Date.now()): QuarantineEntry[] {
  const store = readQuarantine()
  const due = expireDue(store, now)
  if (due.length) writeQuarantine(store, now)
  return due
}

export function listQuarantine(status?: QuarantineStatus, now = Date.now()): QuarantineEntry[] {
  const store = readQuarantine()
  if (expireDue(store, now).length) writeQuarantine(store, now)
  return store.entries.filter(r => !status || r.status === status).sort((a, b) => b.quarantined_at.localeCompare(a.quarantined_at))
}

function dropHeld(id: string): void {
  try { fs.unlinkSync(heldFile(id)) } catch { /* none */ }
}

/** A pending entry's payload, for GET /v1/quarantine/{id}; null when there is none */
export function peekHeld(id: string): unknown | null {
  try { return JSON.parse(fs.readFileSync(heldFile(id), 'utf8')) } catch { return null }
}

/** Reads and removes a held payload: whoever takes it delivers it, so it is delivered at most once */
function takeHeld(id: string): unknown | null {
  const payload = peekHeld(id)
  if (payload !== null) dropHeld(id)
  return payload
}

/**
 * The one pass of an approved entry, for those parties and that action only: with `id`, the replay of a held message;
 * without, the next identical call. Returns the entry id, once. Never throws.
 */
export function takePass(from: PolicyParty, to: PolicyParty, action: PolicyAction, id?: string, now = Date.now()): string | null {
  try {
    if (!fs.existsSync(quarantineFile())) return null
    const store = readQuarantine()
    const f = partyLabel(from), t = partyLabel(to)
    const r = store.entries.find(x => (id ? x.quarantine_id === id : !x.held) && x.status === 'approved' && !!x.pass_until && Date.parse(x.pass_until) > now && x.action === action && x.from === f && x.to === t)
    if (!r) return null
    delete r.pass_until
    writeQuarantine(store, now)
    return r.quarantine_id
  } catch { return null }
}

export function recordDelivery(id: string, delivery: { ok: boolean; status?: number; message?: string; message_id?: string }, now = Date.now()): void {
  try {
    const store = readQuarantine()
    const r = store.entries.find(x => x.quarantine_id === id)
    if (!r) return
    r.delivery = { at: new Date(now).toISOString(), ...delivery }
    delete r.pass_until
    writeQuarantine(store, now)
    record({ event: 'delivered', request: id, host: r.host, action: r.action, from: r.from, to: r.to, effect: delivery.ok ? 'allow' : 'deny', rules: r.rules_triggered, ...(delivery.ok ? {} : { note: (delivery.message || 'delivery failed').slice(0, 200) }) })
  } catch (e) { console.warn(`[Policy] could not record the delivery of ${id}: ${(e as Error).message}`) }
}

// ── Approve / reject ─────────────────────────────────────────────────────────

export type DecideResult =
  | { ok: true; entry: QuarantineEntry; held?: { path: HeldPath; payload: unknown } }
  | { ok: false; status: 400 | 403 | 404 | 409 | 410; error: string; message: string }

const fail = (status: 400 | 403 | 404 | 409 | 410, error: string, message: string): DecideResult => ({ ok: false, status, error, message })

/** Who the server knows is deciding (lib/caller-identity), instead of the `by` the request names */
export type KnownDecider =
  | { kind: 'operator'; name?: string }
  | { kind: 'agent'; agentId: string; name?: string; via: 'session' | 'key'; host: string }

/** The entry's sender is this agent (by registry id, else by name on this host) */
export function sentBy(r: Pick<QuarantineEntry, 'fromParty'>, agent: { agentId: string; name?: string }, isLocalHost: (h: string) => boolean): boolean {
  const p = r.fromParty
  if (!p || p.kind !== 'agent') return false
  if (p.id && p.id === agent.agentId) return true
  return !!agent.name && lc(p.name) === lc(agent.name) && (!p.host || isLocalHost(p.host))
}

/**
 * The agent is one of the entry's approvers: an `agent:` approver naming it by name or id. An approver pinned to a
 * host (agent:alice@host-b) is that host's agent; one without a host is an agent of the host that keeps the entry.
 */
export function approvesAsAgent(r: Pick<QuarantineEntry, 'approvers' | 'host'>, agent: { agentId: string; name?: string }, isLocalHost: (h: string) => boolean): boolean {
  const me = [lc(agent.agentId), lc(agent.name)].filter(Boolean)
  return (r.approvers || []).some(a => {
    if (!a.ref.startsWith('agent:')) return false
    const [who, at] = a.ref.slice(6).split('@')
    return me.includes(lc(who)) && isLocalHost(at || r.host)
  })
}

/**
 * Approves or rejects a pending entry (AMP 08). Rejecting never needs proof (it can only stop something). An entry whose
 * rule asks for proof "signed" cannot be approved from the dashboard.
 */
export function decideQuarantine(
  id: string,
  decision: 'approve' | 'reject',
  input: { by?: unknown; signed?: SignedAnswer; known?: KnownDecider; isLocalHost?: (h: string) => boolean } = {},
  now = Date.now(),
): DecideResult {
  if (input.by !== undefined && (typeof input.by !== 'string' || input.by.length > 200)) return fail(400, 'invalid_field', 'by must be text')
  const signed = input.signed
  const store = readQuarantine()
  const expired = expireDue(store, now).length > 0
  const r = store.entries.find(x => x.quarantine_id === id)
  const done = (f: DecideResult) => { if (expired) writeQuarantine(store, now); return f }
  if (!r) return done(fail(404, 'not_found', `No quarantine entry ${id} on this host`))
  if (r.status === 'expired') return done(fail(410, 'quarantine_expired', `Quarantine entry ${id} expired at ${r.expires_at} and can no longer be approved`))
  if (r.status !== 'pending') return done(fail(409, 'quarantine_decided', `Quarantine entry ${id} is already ${r.status}`))

  const known = signed ? undefined : input.known
  const isLocalHost = input.isLocalHost || ((h: string) => lc(h) === lc(r.host))
  const typed = typeof input.by === 'string' ? input.by.trim() : ''
  const claimed = signed ? signed.from : known?.kind === 'agent' ? `agent:${known.name || known.agentId}@${known.host}` : known ? '' : typed
  if (known?.kind === 'agent') {
    // The caller is this agent, whatever the body says: never its own entry, and only as a named approver
    if (sentBy(r, known, isLocalHost)) return fail(403, 'forbidden', 'Whoever sent it cannot approve or reject it')
    if (!approvesAsAgent(r, known, isLocalHost)) {
      return fail(403, 'forbidden', `${known.name || known.agentId} is not an approver of this entry (approvers: ${r.approvers.map(a => a.label).join(', ')})`)
    }
  }
  // 07 Policy Holds, reviewers rule 3: the sender never decides on its own entry
  if (claimed && (lc(claimed) === lc(r.from) || lc(claimed) === lc(r.sender))) return fail(403, 'forbidden', 'Whoever sent it cannot approve or reject it')
  // Rule 2: a signed decision only from a listed reviewer
  if (signed && !r.reviewers.some(a => lc(a) === lc(claimed))) return fail(403, 'forbidden', `${claimed} is not a reviewer of this entry`)
  if (!known && claimed.startsWith('agent:') && !r.approvers.some(a => lc(a.ref) === lc(claimed.split('@')[0]))) {
    return fail(403, 'forbidden', `${claimed} is not an approver of this entry (approvers: ${r.approvers.map(a => a.label).join(', ')})`)
  }
  if (decision === 'approve' && r.proof === 'signed' && !signed) {
    return fail(403, 'forbidden', `Rule ${r.rules_triggered.join(', ')} asks for proof "signed": the approval must be a verified, signed reply from ${r.approvers.map(a => a.label).join(' or ')} to the approval request AI Maestro sent them, so a dashboard approval is not enough. Rejecting needs no proof.`)
  }

  const by = signed ? signed.from
    : known?.kind === 'operator' ? (known.name ? `the operator (${known.name})` : 'the operator')
      : known ? claimed
        : claimed ? `${claimed} (unverified)` : 'an unverified person'
  const callerVia = known?.kind === 'operator' ? 'operator' as const : known ? (known.via === 'key' ? 'agent-key' as const : 'agent-session' as const) : undefined
  r.status = decision === 'approve' ? 'approved' : 'rejected'
  r.decided = {
    by, at: new Date(now).toISOString(),
    ...(signed ? { via: 'signed-message' as const, answer: signed } : { via: 'rest' as const }),
    ...(callerVia ? { caller: callerVia } : {}),
  }
  let held: { path: HeldPath; payload: unknown } | undefined
  if (r.held) {
    if (r.status === 'approved') {
      const payload = takeHeld(id)
      if (payload !== null) { held = { path: r.held.path, payload }; r.pass_until = new Date(now + PASS_MS).toISOString() }
      else r.delivery = { at: new Date(now).toISOString(), ok: false, message: 'the quarantined message was not found (already delivered, or lost)' }
    } else dropHeld(id)
  } else if (r.status === 'approved') {
    // A call: the next identical call, within the rule's window
    r.pass_until = new Date(now + (Date.parse(r.expires_at) - Date.parse(r.quarantined_at))).toISOString()
  }
  writeQuarantine(store, now)
  record({ event: r.status, request: id, host: r.host, action: r.action, from: r.from, to: r.to, effect: r.status === 'rejected' ? 'deny' : 'allow', rules: r.rules_triggered, by, proof: signed ? 'signed' : callerVia || 'dashboard' })
  return { ok: true, entry: r, ...(held ? { held } : {}) }
}

/** Records the approval request notice sent to a reviewer (its id is what a signed answer must reply to) */
export function recordApprovalRequest(id: string, to: string, noticeId: string, now = Date.now()): void {
  try {
    const store = readQuarantine()
    const r = store.entries.find(x => x.quarantine_id === id)
    if (!r) return
    r.requests = [...(r.requests || []), { to, id: noticeId, at: new Date(now).toISOString() }]
    writeQuarantine(store, now)
  } catch (e) { console.warn(`[Policy] could not record the approval request for ${id}: ${(e as Error).message}`) }
}

/** The entry and the reviewer an approval request notice id was sent to, or null */
export function findApprovalRequest(noticeId: string): { entry: QuarantineEntry; to: string } | null {
  for (const entry of readQuarantine().entries) {
    const req = entry.requests?.find(q => q.id === noticeId)
    if (req) return { entry, to: req.to }
  }
  return null
}

/** For the Doctor: pending entries past their expiry that no sweep marked, and whether the store reads. */
export function quarantineHealth(now = Date.now()): { file: string; pending: number; overdue: string[]; error?: string } {
  let file = ''
  try {
    file = quarantineFile()
    const pending = readQuarantine().entries.filter(r => r.status === 'pending')
    // A minute of grace: the sweeper runs every minute
    return { file, pending: pending.length, overdue: pending.filter(r => Date.parse(r.expires_at) < now - 60_000).map(r => r.quarantine_id) }
  } catch (e) {
    return { file, pending: 0, overdue: [], error: (e as Error).message }
  }
}
