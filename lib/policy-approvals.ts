/**
 * Approvals for `ask` (F118 step 2, docs/SPEC-POLICY-RULES.md section 11.3 and section 17).
 *
 * One request store per host: ~/.aimaestro/policy/approvals.json (mode 600, atomic writes). A request is kept on the
 * host whose rules asked: the recipient's host for a delivery, the sender's host for a send. A held message's payload
 * is in its own file, ~/.aimaestro/policy/held/<id>.json (mode 600), never in the store or the decision log.
 *
 * Answers: once, for <duration> (a grant checkPolicy consults), always (an `except` entry in the ask rule), refuse.
 * A grant only turns an ask into an allow; it never opens a deny. No login: a dashboard click is recorded as an
 * unverified person. A rule with "proof": "signed" needs an Ed25519 signature from a device key paired to an approver.
 */
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeFileAtomicSync } from '@/lib/atomic-write.mjs'
import { verifySignature } from '@/lib/amp-keys'
import { rawKeyToHex, type DeviceKey } from '@/lib/person-signing'
import {
  DEFAULT_ASK_EXPIRY_MS, logPolicyDecision, parseDuration, partyLabel, policyFile, policyLogFile, supportedApprover, validatePolicy,
  type PolicyAction, type PolicyDecision, type PolicyLogLine, type PolicyParty,
} from '@/lib/policy'

export type RequestState = 'pending' | 'approved' | 'refused' | 'expired'
export type AnswerKind = 'once' | 'for' | 'always' | 'refuse'
/** Which send path holds the message, so the answer delivers it through that same path */
export type HeldPath = 'amp-route' | 'ui-send' | 'ui-forward' | 'chat'

export interface Approver {
  /** person:<id>, person:* (any person) or agent:<name> */
  ref: string
  label: string
  /** The rule's pattern it came from (rel:manager, person:alice, ...) */
  via: string
}

export interface ApprovalAnswer {
  answer: AnswerKind
  for?: string
  /** A grant's end (for), or the window of a call approved once */
  until?: string
  /** Who answered: "person:alice" from a signature, else what the person typed, marked unverified */
  by: string
  how: 'dashboard' | 'signed'
  keyId?: string
  at: string
  /** always: the rule ids that got an except entry */
  exceptAdded?: string[]
}

export interface ApprovalRequest {
  id: string
  created: string
  host: string
  action: PolicyAction
  from: string
  to: string
  fromParty: PolicyParty
  toParty: PolicyParty
  rules: string[]
  /** The decision's reason (rules and parties, never message text) */
  reason: string
  approvers: Approver[]
  /** Approver patterns that did not resolve to anyone, with why */
  unresolved?: string[]
  proof: 'any' | 'signed'
  expiresAt: string
  /** A call approved once lets the next identical call through for this long */
  windowMs: number
  state: RequestState
  held?: { path: HeldPath }
  answer?: ApprovalAnswer
  /** A held message approved: one replay pass for the path's own policy check, consumed by it */
  pass?: boolean
  delivery?: { at: string; ok: boolean; status?: number; message?: string }
}

export interface ApprovalGrant {
  id: string
  request: string
  from: string
  to: string
  action: PolicyAction
  rules: string[]
  until: string
  /** Left out: any number of uses until `until` */
  uses?: number
  by: string
  created: string
}

interface Store { version: 1; requests: ApprovalRequest[]; grants: ApprovalGrant[] }

const MAX_FOR_MS = 30 * 86_400_000
const KEEP_ANSWERED_MS = 30 * 86_400_000
const PASS_MS = 5 * 60_000
export const SIGN_WINDOW_MS = 5 * 60_000

/** ~/.aimaestro/policy, resolved on every call so a test's HOME applies. Tests may never write the real one. */
function policyDir(): string {
  const home = os.homedir()
  if (process.env.VITEST && home === os.userInfo().homedir) throw new Error('approval store: tests must set HOME to a temporary folder')
  return path.join(home, '.aimaestro', 'policy')
}
export const approvalsFile = () => path.join(policyDir(), 'approvals.json')
const heldFile = (id: string) => path.join(policyDir(), 'held', `${id}.json`)

/** The store, or throws when the file exists and cannot be read (the Doctor fails then; nothing overwrites it). */
export function readApprovals(): Store {
  const file = approvalsFile()
  let text: string
  try { text = fs.readFileSync(file, 'utf8') } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, requests: [], grants: [] }
    throw new Error(`${file} cannot be read: ${(e as Error).message}`)
  }
  try {
    const s = JSON.parse(text)
    if (!s || !Array.isArray(s.requests) || !Array.isArray(s.grants)) throw new Error('it is not an approvals store')
    return s as Store
  } catch (e) {
    throw new Error(`${file} cannot be read: ${(e as Error).message}`)
  }
}

function writeApprovals(s: Store, now = Date.now()): void {
  s.requests = s.requests.filter(r => r.state === 'pending' || now - Date.parse(r.answer?.at || r.expiresAt) < KEEP_ANSWERED_MS)
  s.grants = s.grants.filter(g => Date.parse(g.until) > now && g.uses !== 0)
  fs.mkdirSync(path.dirname(approvalsFile()), { recursive: true, mode: 0o700 })
  writeFileAtomicSync(approvalsFile(), JSON.stringify(s, null, 2) + '\n', { mode: 0o600 })
}

function record(line: Omit<PolicyLogLine, 'at'>): void {
  try { logPolicyDecision(line, process.env.VITEST ? path.join(policyDir(), 'decisions.jsonl') : policyLogFile()) } catch { /* never fails a send */ }
}

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`

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

// ── Requests ─────────────────────────────────────────────────────────────────

export interface NewRequest {
  decision: PolicyDecision
  from: PolicyParty
  to: PolicyParty
  action: PolicyAction
  host: string
  held?: { path: HeldPath; payload: unknown }
  look: ApproverLookup
  now?: number
}

/** A new pending request, or why there can be none (no approver, an unreadable store). Never throws. */
export function createRequest(o: NewRequest): { request: ApprovalRequest } | { refused: string } {
  const now = o.now ?? Date.now()
  const { approvers, unresolved } = resolveApprovers(o.decision.approvers || [], o.from, o.to, o.look)
  if (!approvers.length) return { refused: `no approver could be found (${unresolved.join('; ') || 'the rule names none'})` }
  try {
    const store = readApprovals()
    expireDue(store, now)
    const windowMs = o.decision.expiresMs ?? DEFAULT_ASK_EXPIRY_MS
    const request: ApprovalRequest = {
      id: newId('apr'), created: new Date(now).toISOString(), host: o.host, action: o.action,
      from: partyLabel(o.from), to: partyLabel(o.to), fromParty: o.from, toParty: o.to,
      rules: o.decision.ruleIds || [], reason: o.decision.reason, approvers, ...(unresolved.length ? { unresolved } : {}),
      proof: o.decision.proof || 'any', expiresAt: new Date(now + windowMs).toISOString(), windowMs, state: 'pending',
      ...(o.held ? { held: { path: o.held.path } } : {}),
    }
    if (o.held) {
      fs.mkdirSync(path.dirname(heldFile(request.id)), { recursive: true, mode: 0o700 })
      writeFileAtomicSync(heldFile(request.id), JSON.stringify(o.held.payload), { mode: 0o600 })
    }
    store.requests.push(request)
    writeApprovals(store, now)
    record({ event: 'ask', request: request.id, host: o.host, action: o.action, from: request.from, to: request.to, effect: 'ask', rules: request.rules, approvers: approvers.map(a => a.ref), proof: request.proof })
    return { request }
  } catch (e) {
    return { refused: `the approval store cannot be used: ${(e as Error).message}` }
  }
}

/** Marks overdue pending requests expired (in `store`, not saved) and drops their payloads. Returns them. */
function expireDue(store: Store, now: number): ApprovalRequest[] {
  const due = store.requests.filter(r => r.state === 'pending' && Date.parse(r.expiresAt) <= now)
  for (const r of due) {
    r.state = 'expired'
    dropHeld(r.id)
    record({ event: 'expired', request: r.id, host: r.host, action: r.action, from: r.from, to: r.to, effect: 'deny', rules: r.rules, note: 'no answer before it expired' })
  }
  return due
}

/** Expires every overdue request and saves. Returns the ones that just expired, so the caller can tell the senders. */
export function sweepApprovals(now = Date.now()): ApprovalRequest[] {
  const store = readApprovals()
  const due = expireDue(store, now)
  if (due.length) writeApprovals(store, now)
  return due
}

export function listApprovals(state?: RequestState, now = Date.now()): ApprovalRequest[] {
  const store = readApprovals()
  if (expireDue(store, now).length) writeApprovals(store, now)
  return store.requests.filter(r => !state || r.state === state).sort((a, b) => b.created.localeCompare(a.created))
}

function dropHeld(id: string): void {
  try { fs.unlinkSync(heldFile(id)) } catch { /* none */ }
}

/** Reads and removes a held payload: whoever takes it delivers it, so it is delivered at most once */
function takeHeld(id: string): unknown | null {
  try {
    const text = fs.readFileSync(heldFile(id), 'utf8')
    fs.unlinkSync(heldFile(id))
    return JSON.parse(text)
  } catch { return null }
}

/**
 * A grant from an earlier answer (for <duration>, or a call approved once) that covers this ask. A use-limited grant
 * is used up here. Never throws: an unreadable store has no grants.
 */
export function takeGrant(from: PolicyParty, to: PolicyParty, action: PolicyAction, ruleIds: string[], now = Date.now()): ApprovalGrant | null {
  try {
    if (!fs.existsSync(approvalsFile())) return null
    const store = readApprovals()
    const f = partyLabel(from), t = partyLabel(to)
    const g = store.grants.find(x => x.from === f && x.to === t && x.action === action && Date.parse(x.until) > now && x.uses !== 0 && ruleIds.every(id => x.rules.includes(id)))
    if (!g) return null
    if (g.uses !== undefined) { g.uses--; writeApprovals(store, now) }
    return g
  } catch { return null }
}

/** The one replay pass of an approved held message: true once, for that request and those parties only. */
export function takePass(requestId: string, from: PolicyParty, to: PolicyParty, action: PolicyAction, now = Date.now()): boolean {
  try {
    const store = readApprovals()
    const r = store.requests.find(x => x.id === requestId)
    if (!r || r.state !== 'approved' || !r.pass || r.action !== action || r.from !== partyLabel(from) || r.to !== partyLabel(to)) return false
    if (now - Date.parse(r.answer!.at) > PASS_MS) return false
    r.pass = false
    writeApprovals(store, now)
    return true
  } catch { return false }
}

export function recordDelivery(id: string, delivery: { ok: boolean; status?: number; message?: string }, now = Date.now()): void {
  try {
    const store = readApprovals()
    const r = store.requests.find(x => x.id === id)
    if (!r) return
    r.delivery = { at: new Date(now).toISOString(), ...delivery }
    r.pass = false
    writeApprovals(store, now)
    record({ event: 'delivered', request: id, host: r.host, action: r.action, from: r.from, to: r.to, effect: delivery.ok ? 'allow' : 'deny', rules: r.rules, ...(delivery.ok ? {} : { note: (delivery.message || 'delivery failed').slice(0, 200) }) })
  } catch (e) { console.warn(`[Policy] could not record the delivery of ${id}: ${(e as Error).message}`) }
}

// ── Answers ──────────────────────────────────────────────────────────────────

/** What a paired device signs to answer (spec section 17.4). The app must build exactly this string. */
export function approvalSigningString(a: { host: string; request: string; answer: AnswerKind; for?: string; signedAt: string }): string {
  return ['aimaestro-approval/1', a.host, a.request, a.answer, a.for || '', a.signedAt].join('|')
}

export interface AnswerInput {
  answer?: unknown
  for?: unknown
  /** Who is answering, as they name themselves (no login): "person:alice", "agent:ops", or a name */
  by?: unknown
  keyId?: unknown
  signature?: unknown
  signedAt?: unknown
}

export type AnswerResult =
  | { ok: true; request: ApprovalRequest; held?: { path: HeldPath; payload: unknown } }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string; message: string }

const fail = (status: 400 | 403 | 404 | 409, error: string, message: string): AnswerResult => ({ ok: false, status, error, message })
const ANSWERS: AnswerKind[] = ['once', 'for', 'always', 'refuse']

function patternOf(p: PolicyParty): string | null {
  if (p.kind === 'agent') return `agent:${p.name || p.id}${p.host ? `@${p.host}` : ''}`
  if (p.kind === 'person' && p.id) return `person:${p.id}`
  return null
}

/**
 * always: an except entry for these two parties and this action in each ask rule that decided (spec 11.3 item 5).
 * The edit is a policy.edit and is logged. Throws with a plain message (version 1 file, an unnamed party, rule gone).
 */
export function addAlwaysExcept(req: ApprovalRequest, by: string, file = policyFile(), now = Date.now()): string[] {
  const from = patternOf(req.fromParty)
  const to = patternOf(req.toParty)
  if (!from || !to) throw new Error(`${req.from} is someone this host cannot name, so "always" has no one to write into the rule. Approve once or for a time instead.`)
  let raw: any
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { throw new Error(`${file} cannot be read: ${(e as Error).message}`) }
  if ((raw?.version ?? 1) !== 2) throw new Error(`${file} is a version 1 file (rules in order), which has no exceptions to add to. Convert it to version 2 first, or approve once or for a time.`)
  const day = new Date(now).toISOString().slice(0, 10)
  const edited: string[] = []
  for (const r of raw.rules || []) {
    if (!req.rules.includes(r?.id) || r.effect !== 'ask') continue
    r.except = [...(Array.isArray(r.except) ? r.except : []), { from: [from], to: [to], actions: [req.action], note: `approved always by ${by} on ${day} (request ${req.id})` }]
    edited.push(r.id)
  }
  if (!edited.length) throw new Error(`the rule ${req.rules.join(', ')} is no longer an ask rule in ${file}, so there is nothing to add the exception to`)
  validatePolicy(raw) // the edit must load, or nothing is written
  writeFileAtomicSync(file, JSON.stringify(raw, null, 2) + '\n', { mode: 0o600 })
  record({ event: 'policy.edit', request: req.id, host: req.host, action: req.action, from: req.from, to: req.to, effect: 'allow', rules: edited, by, note: `except added for ${from} -> ${to} (${req.action})` })
  return edited
}

/**
 * Applies an answer. A refusal never needs proof (it can only stop something). A signature, when given, must verify
 * with an active device key of a person who is an approver; a rule with proof "signed" accepts nothing less.
 */
export async function answerApproval(id: string, input: AnswerInput, opts: { keyFor: (keyId: string) => Promise<DeviceKey | null>; policyFile?: string; now?: number }): Promise<AnswerResult> {
  const answer = input.answer as AnswerKind
  if (!ANSWERS.includes(answer)) return fail(400, 'invalid_field', 'answer must be once, for, always or refuse')
  const forMs = answer === 'for' ? parseDuration(input.for) : null
  if (answer === 'for' && (forMs === null || forMs > MAX_FOR_MS)) return fail(400, 'invalid_field', 'for must be a duration such as 30m, 1h or 7d (at most 30d)')
  if (input.by !== undefined && (typeof input.by !== 'string' || input.by.length > 200)) return fail(400, 'invalid_field', 'by must be text')

  let req = listApprovals(undefined, opts.now ?? Date.now()).find(r => r.id === id)
  if (!req) return fail(404, 'not_found', `No approval request ${id} on this host`)
  if (req.state !== 'pending') return fail(409, 'invalid_state', `Request ${id} is already ${req.state}`)

  const claimed = typeof input.by === 'string' ? input.by.trim() : ''
  if (claimed && lc(claimed) === lc(req.from)) return fail(403, 'forbidden', 'Whoever asked cannot answer their own request')
  if (claimed.startsWith('agent:') && !req.approvers.some(a => lc(a.ref) === lc(claimed.split('@')[0]))) {
    return fail(403, 'forbidden', `${claimed} is not an approver of this request (approvers: ${req.approvers.map(a => a.label).join(', ')})`)
  }

  let by = claimed ? `${claimed} (unverified)` : 'an unverified person'
  let how: ApprovalAnswer['how'] = 'dashboard'
  let keyId: string | undefined
  if (input.signature !== undefined || input.keyId !== undefined) {
    if (typeof input.signature !== 'string' || typeof input.keyId !== 'string' || typeof input.signedAt !== 'string') {
      return fail(400, 'invalid_field', 'a signed answer needs keyId, signature (base64) and signedAt (RFC 3339)')
    }
    const key = await opts.keyFor(input.keyId)
    const hex = key ? rawKeyToHex(key.publicKey) : null
    const people = req.approvers.filter(a => a.ref.startsWith('person:')).map(a => a.ref.slice(7))
    const at = Date.parse(input.signedAt)
    const now = opts.now ?? Date.now()
    if (!key || !hex) return fail(403, 'bad_signature', 'No paired device key with that keyId')
    if (key.status !== 'active') return fail(403, 'bad_signature', `That device key is ${key.status}`)
    if (!people.includes('*') && !people.includes(key.personId)) return fail(403, 'bad_signature', `That device belongs to ${key.personId}, who is not an approver of this request`)
    if (!verifySignature(approvalSigningString({ host: req.host, request: id, answer, for: answer === 'for' ? String(input.for) : undefined, signedAt: input.signedAt }), input.signature, hex)) {
      return fail(403, 'bad_signature', 'The signature does not verify with that device key')
    }
    if (Number.isNaN(at) || Math.abs(now - at) > SIGN_WINDOW_MS) return fail(403, 'stale', 'signedAt is more than 5 minutes from the server clock')
    by = `person:${key.personId}`
    how = 'signed'
    keyId = key.keyId
  } else if (req.proof === 'signed' && answer !== 'refuse') {
    return fail(403, 'signature_required', `This approval must be signed on a phone paired to ${req.approvers.map(a => a.label).join(' or ')}: rule ${req.rules.join(', ')} asks for proof "signed", so a dashboard click is not enough. Refusing needs no signature.`)
  }

  let exceptAdded: string[] | undefined
  if (answer === 'always') {
    try { exceptAdded = addAlwaysExcept(req, by, opts.policyFile ?? policyFile(), opts.now) } catch (e) {
      return fail(409, 'cannot_always', (e as Error).message)
    }
  }

  // Re-read after the awaits: another answer may have come in meanwhile
  const now = opts.now ?? Date.now()
  const store = readApprovals()
  expireDue(store, now)
  req = store.requests.find(r => r.id === id)!
  if (req.state !== 'pending') { writeApprovals(store, now); return fail(409, 'invalid_state', `Request ${id} is already ${req.state}`) }

  const until = answer === 'for' ? now + forMs! : answer === 'once' && !req.held ? now + req.windowMs : undefined
  req.state = answer === 'refuse' ? 'refused' : 'approved'
  req.answer = {
    answer, ...(answer === 'for' ? { for: String(input.for) } : {}), ...(until ? { until: new Date(until).toISOString() } : {}),
    by, how, ...(keyId ? { keyId } : {}), at: new Date(now).toISOString(), ...(exceptAdded ? { exceptAdded } : {}),
  }
  if (until) {
    // for: every identical ask until then. A call approved once: the next identical call, within the window
    store.grants.push({ id: newId('grant'), request: id, from: req.from, to: req.to, action: req.action, rules: req.rules, until: new Date(until).toISOString(), ...(answer === 'once' ? { uses: 1 } : {}), by, created: new Date(now).toISOString() })
  }
  let held: { path: HeldPath; payload: unknown } | undefined
  if (req.held) {
    if (req.state === 'approved') {
      const payload = takeHeld(id)
      if (payload !== null) { held = { path: req.held.path, payload }; req.pass = true }
      else req.delivery = { at: new Date(now).toISOString(), ok: false, message: 'the held message was not found (already delivered, or lost)' }
    } else dropHeld(id)
  }
  writeApprovals(store, now)
  record({ event: 'answer', request: id, host: req.host, action: req.action, from: req.from, to: req.to, effect: req.state === 'refused' ? 'deny' : 'allow', rules: req.rules, answer: answer === 'for' ? `for ${input.for}` : answer, by, proof: how })
  return { ok: true, request: req, ...(held ? { held } : {}) }
}

/** For the Doctor: pending requests past their expiry that no sweep marked, and whether the store reads. */
export function approvalsHealth(now = Date.now()): { file: string; pending: number; overdue: string[]; error?: string } {
  let file = ''
  try {
    file = approvalsFile()
    const store = readApprovals()
    const pending = store.requests.filter(r => r.state === 'pending')
    // A minute of grace: the sweeper runs every minute
    return { file, pending: pending.length, overdue: pending.filter(r => Date.parse(r.expiresAt) < now - 60_000).map(r => r.id) }
  } catch (e) {
    return { file, pending: 0, overdue: [], error: (e as Error).message }
  }
}
