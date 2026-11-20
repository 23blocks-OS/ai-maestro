/**
 * Who may reach whom (F042, docs/SPEC-POLICY-RULES.md): one rules engine with three effects.
 *
 * With no rules file every person may talk to every agent and every agent may message every agent, exactly as
 * before. A rule file is per host (~/.aimaestro/policy.json) and applies to the traffic that host handles: the
 * sender's host checks its rules before it sends, the recipient's host checks its rules before it delivers. So a
 * rule about who may reach an agent goes on the agent's host, which sees every message to it.
 *
 * Version 2 files (spec section 3.2): no order. A deny that applies wins, then an ask, then an allow, then the
 * file's default (`allow` unless the file says `deny`). Exceptions go inside the rule (`except`).
 * Version 1 files (no `version`, phase 1): rules in order, first match wins. They are compiled at load into
 * version 2 rules with the same decisions (section 3.3), so there is one evaluator.
 *
 * Policy for a trusted network, not a defence against a hostile device: parties are what the host already knows
 * (a signed sender, a registered agent, a person an operator marked), and the dashboard has no login.
 *
 * Idea from lolad (CamiloCaceres/lolad, internal/policy). Differences on purpose: many people instead of one user;
 * the open default is a setting you can override, not fixed defaults; names keep their host (`agent:dev@host`),
 * so two agents called dev on two hosts do not collapse into one.
 */
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeFileAtomicSync } from '@/lib/atomic-write.mjs'

/**
 * The actions the engine knows (spec 4.3). Names with a dot are governance actions (F118 step 3, spec 11), checked
 * where the action is done, on the agent's host. A rule (or exception) without `actions` covers the communication
 * actions only, so a file written before governance actions keeps its meaning: a governance action is governed only by
 * a rule that names it.
 */
export const POLICY_ACTIONS = ['message', 'call', 'agent.create', 'agent.delete', 'agent.move', 'agent.mode', 'secret.grant'] as const
export type PolicyAction = typeof POLICY_ACTIONS[number]
const COMMS: readonly PolicyAction[] = ['message', 'call']
/** How a reason says the action: "agent:bob may not delete agent:payroll" */
export const ACTION_WORDS: Record<PolicyAction, string> = {
  message: 'message', call: 'call', 'agent.create': 'create', 'agent.delete': 'delete', 'agent.move': 'move',
  'agent.mode': 'raise the permission mode of', 'secret.grant': 'give a new credential to',
}
export type PolicyEffect = 'allow' | 'deny' | 'ask'
const EFFECTS: PolicyEffect[] = ['deny', 'ask', 'allow']

/** One side of a message or call. A person with no id is someone the host cannot name (the dashboard, an unmarked device). */
export interface PolicyParty {
  kind: 'person' | 'agent' | 'system'
  id?: string
  name?: string
  host?: string
}

/** A version 1 (phase 1) rule: in order, first match wins. */
export interface PolicyRule {
  from: string
  to: string
  allow: boolean
  /** Also match the reverse direction */
  both?: boolean
  /** Only this action; any action when left out */
  action?: PolicyAction
  /** Shown to the sender as the reason */
  note?: string
}

/** A case the rule does not cover. A field left out matches everything. */
export interface PolicyExcept {
  from?: string[]
  to?: string[]
  actions?: PolicyAction[]
  both?: boolean
  /** Why the exception is there ("Alice's own agents", "until the audit ends") */
  note?: string
}

/** A version 2 rule (spec section 4). `from` and `to` are lists: any of them. */
export interface PolicyRuleV2 {
  id: string
  effect: PolicyEffect
  from: string[]
  to: string[]
  actions?: PolicyAction[]
  both?: boolean
  except?: PolicyExcept[]
  /** Who may approve an ask (F118 step 2, lib/policy-approvals) */
  approvers?: string[]
  proof?: 'any' | 'signed'
  /** How long an ask waits for an answer ("30m", "2h", "1d"); 30 minutes when left out */
  expires?: string
  /** audit: evaluated and logged, not applied */
  mode?: 'enforce' | 'audit'
  note?: string
}

/** A test case in the file: what the rules must answer for this request. */
export interface PolicyTest {
  from: string
  to: string
  action?: PolicyAction
  expect: PolicyEffect
}

export interface Policy {
  version: 1 | 2
  default: 'allow' | 'deny'
  /** audit: the whole file is evaluated and logged, not applied */
  mode: 'enforce' | 'audit'
  rules: PolicyRuleV2[]
  tests: PolicyTest[]
  /** Also log allowed decisions: true, or until this time (ISO) */
  logAllows?: boolean | string
}

export interface PolicyDecision {
  allowed: boolean
  /** The effect applied: allow, deny, or ask (a person must approve first: lib/policy-approvals) */
  effect?: PolicyEffect
  reason: string
  /** Version 1 files: 1-based index of the rule that decided */
  rule?: number
  /** Every rule that decided (all the denies, or all the asks, or all the allows) */
  ruleIds?: string[]
  /** Every rule that matched, with its effect and mode: the "why" answer */
  matched?: { id: string; effect: PolicyEffect; mode?: 'audit' }[]
  /** Set when audit-mode rules would change the answer: what it would be if they were enforced */
  wouldBe?: PolicyEffect
  /** The audit-mode rules behind wouldBe */
  auditRuleIds?: string[]
  approvers?: string[]
  /** An ask: "signed" when any deciding rule asks for a signed answer */
  proof?: 'any' | 'signed'
  /** An ask: how long it waits, the shortest `expires` of the deciding rules (ms) */
  expiresMs?: number
  /** An ask that became an AMP quarantine entry (lib/policy-approvals); held: the message waits for the decision */
  quarantine?: { id: string; expiresAt: string; held: boolean; reviewers?: string[] }
  host?: string
}

/** What a pattern needs from outside the rules: the teams an agent belongs to (ids and names, lowercase). */
export interface PolicyContext {
  host?: string
  teamsOf?: (p: PolicyParty) => string[]
}

const PATTERN = /^(\*|(person|agent):\*|(person|agent|team|host):[A-Za-z0-9][A-Za-z0-9 _.@-]{0,127})$/
const APPROVER = /^rel:(manager|owner)$/
/** Accepted in a file so the rule loads, but not resolved yet: lint reports them and an ask they decide is refused */
const LATER_APPROVER = /^(role|org):[A-Za-z0-9][A-Za-z0-9 _.@-]{0,127}$/
export const DEFAULT_ASK_EXPIRY_MS = 30 * 60 * 1000
const DURATION = /^(\d{1,5})(s|m|h|d)$/
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const

/** "30m" -> 1800000; null for anything else. Used by rule `expires` and by answers "for <duration>". */
export function parseDuration(v: unknown): number | null {
  const m = typeof v === 'string' ? DURATION.exec(v.trim()) : null
  return m && Number(m[1]) > 0 ? Number(m[1]) * UNIT_MS[m[2] as keyof typeof UNIT_MS] : null
}

/** An approver this step can resolve to someone (spec 11.3 item 2); role: and org: come with governance */
export const supportedApprover = (a: string) => APPROVER.test(a) || /^person:(\*|[A-Za-z0-9][A-Za-z0-9 _.@-]{0,127})$/.test(a) || /^agent:[A-Za-z0-9][A-Za-z0-9 _.@-]{0,127}$/.test(a)
const RULE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

export function policyFile(home = os.homedir()): string {
  return path.join(home, '.aimaestro', 'policy.json')
}

/** Version 1: throws with a plain message on the first problem, so a bad file is reported, not half applied. */
export function validateRules(raw: unknown): PolicyRule[] {
  const rules = (raw as { rules?: unknown })?.rules
  if (raw === null || typeof raw !== 'object' || !Array.isArray(rules)) throw new Error('the file must be an object with a "rules" list')
  return rules.map((r, i) => {
    const n = `rule ${i + 1}`
    if (!r || typeof r !== 'object') throw new Error(`${n} is not an object`)
    for (const k of ['from', 'to'] as const) {
      if (typeof r[k] !== 'string' || !PATTERN.test(r[k].trim())) throw new Error(`${n}: "${k}" must be *, person:*, agent:*, or person:|agent:|team:|host: and a name`)
    }
    if (typeof r.allow !== 'boolean') throw new Error(`${n}: "allow" must be true or false`)
    if (r.action !== undefined && !COMMS.includes(r.action)) throw new Error(`${n}: "action" must be ${COMMS.join(' or ')} (governance actions need a version 2 file)`)
    if (r.note !== undefined && typeof r.note !== 'string') throw new Error(`${n}: "note" must be text`)
    return { from: r.from.trim(), to: r.to.trim(), allow: r.allow, ...(r.both ? { both: true } : {}), ...(r.action ? { action: r.action } : {}), ...(r.note ? { note: r.note.slice(0, 300) } : {}) }
  })
}

/**
 * Version 1 to version 2, same decisions (spec 3.3): under first match, a deny decides when it matches and no
 * earlier allow matched, so each deny gets the earlier allows as exceptions. Allows keep their place for the
 * "why" answer. Ids are rule-1, rule-2, ..., so a reason still says "rule 3".
 */
export function compileV1(rules: PolicyRule[], extra: Partial<Policy> = {}): Policy {
  const asExcept = (r: PolicyRule): PolicyExcept => ({ from: [r.from], to: [r.to], ...(r.action ? { actions: [r.action] } : {}), ...(r.both ? { both: true } : {}) })
  return {
    version: 1, default: 'allow', mode: 'enforce', tests: [], ...extra,
    rules: rules.map((r, i) => {
      const except = r.allow ? [] : rules.slice(0, i).filter(e => e.allow).map(asExcept)
      return {
        id: `rule-${i + 1}`, effect: r.allow ? 'allow' : 'deny', from: [r.from], to: [r.to],
        ...(r.action ? { actions: [r.action] } : {}), ...(r.both ? { both: true } : {}),
        ...(except.length ? { except } : {}), ...(r.note ? { note: r.note } : {}),
      }
    }),
  }
}

function patterns(v: unknown, where: string, noRel = true): string[] {
  const list = typeof v === 'string' ? [v] : v
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${where} must be a pattern or a list of patterns`)
  return list.map(p => {
    if (typeof p !== 'string') throw new Error(`${where} must be text`)
    const s = p.trim()
    if (s.startsWith('rel:') && noRel) throw new Error(`${where}: "${s}" is a relation; relations arrive with governance (F118) and never go in "to"`)
    if (!PATTERN.test(s)) throw new Error(`${where}: "${s}" must be *, person:*, agent:*, or person:|agent:|team:|host: and a name`)
    return s
  })
}

function actionList(v: unknown, where: string): PolicyAction[] | undefined {
  if (v === undefined) return undefined
  if (!Array.isArray(v) || v.length === 0 || v.some(a => !POLICY_ACTIONS.includes(a))) throw new Error(`${where} must be a list of ${POLICY_ACTIONS.join(', ')}`)
  return v
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], where: string): T | undefined {
  if (v === undefined) return undefined
  if (!allowed.includes(v as T)) throw new Error(`${where} must be ${allowed.join(' or ')}`)
  return v as T
}

/** Any file version: throws with a plain message on the first problem. */
export function validatePolicy(raw: any): Policy {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('the file must be an object with a "rules" list')
  const version = raw.version ?? 1
  if (version !== 1 && version !== 2) throw new Error('"version" must be 1 or 2')
  const mode = oneOf(raw.mode, ['enforce', 'audit'] as const, '"mode"') || 'enforce'
  if (raw.logAllows !== undefined && raw.logAllows !== true && raw.logAllows !== false && !(typeof raw.logAllows === 'string' && !isNaN(Date.parse(raw.logAllows)))) {
    throw new Error('"logAllows" must be true, false, or a time until which allowed decisions are logged')
  }
  if (raw.tests !== undefined && !Array.isArray(raw.tests)) throw new Error('"tests" must be a list')
  const tests: PolicyTest[] = (raw.tests || []).map((t: any, i: number) => {
    const n = `test ${i + 1}`
    if (!t || typeof t !== 'object' || typeof t.from !== 'string' || !t.from || typeof t.to !== 'string' || !t.to) throw new Error(`${n} needs "from" and "to"`)
    const action = oneOf(t.action, POLICY_ACTIONS, `${n}: "action"`)
    const expect = oneOf(t.expect, EFFECTS, `${n}: "expect"`)
    if (!expect) throw new Error(`${n}: "expect" must be allow, deny or ask`)
    return { from: t.from, to: t.to, ...(action ? { action } : {}), expect }
  })
  const shared = { mode, tests, ...(raw.logAllows !== undefined ? { logAllows: raw.logAllows } : {}) }
  if (version === 1) return compileV1(validateRules(raw), shared)

  if (!Array.isArray(raw.rules)) throw new Error('the file must be an object with a "rules" list')
  const ids = new Set<string>()
  const rules = raw.rules.map((r: any, i: number): PolicyRuleV2 => {
    if (!r || typeof r !== 'object') throw new Error(`rule ${i + 1} is not an object`)
    if (typeof r.id !== 'string' || !RULE_ID.test(r.id)) throw new Error(`rule ${i + 1}: "id" must be lowercase letters, digits and dashes`)
    if (ids.has(r.id)) throw new Error(`rule ${r.id}: the id is used twice`)
    ids.add(r.id)
    const n = `rule ${r.id}`
    const effect = oneOf(r.effect, EFFECTS, `${n}: "effect"`)
    if (!effect) throw new Error(`${n}: "effect" must be allow, deny or ask`)
    if (r.when !== undefined) throw new Error(`${n}: "when" is not supported yet (it arrives with governance actions, F118)`)
    if (r.note !== undefined && typeof r.note !== 'string') throw new Error(`${n}: "note" must be text`)
    if (r.except !== undefined && !Array.isArray(r.except)) throw new Error(`${n}: "except" must be a list`)
    const except = (r.except || []).map((e: any, j: number): PolicyExcept => {
      const w = `${n}, except ${j + 1}`
      if (!e || typeof e !== 'object') throw new Error(`${w} is not an object`)
      const actions = actionList(e.actions, `${w}: "actions"`)
      return { ...(e.from !== undefined ? { from: patterns(e.from, `${w}: "from"`) } : {}), ...(e.to !== undefined ? { to: patterns(e.to, `${w}: "to"`) } : {}), ...(actions ? { actions } : {}), ...(e.both ? { both: true } : {}),
        ...(typeof e.note === 'string' && e.note ? { note: e.note.slice(0, 300) } : {}) }
    })
    let approvers: string[] | undefined
    if (r.approvers !== undefined || effect === 'ask') {
      if (!Array.isArray(r.approvers) || r.approvers.length === 0) throw new Error(`${n}: an ask rule needs "approvers" (a list of people, agents or rel:manager / rel:owner)`)
      approvers = r.approvers.map((a: unknown) => {
        if (typeof a !== 'string' || !(PATTERN.test(a.trim()) || APPROVER.test(a.trim()) || LATER_APPROVER.test(a.trim()))) throw new Error(`${n}: approver "${a}" must be person:<id>, person:*, agent:<name>, rel:manager or rel:owner`)
        return a.trim()
      })
    }
    const actions = actionList(r.actions, `${n}: "actions"`)
    const proof = oneOf(r.proof, ['any', 'signed'] as const, `${n}: "proof"`)
    const ruleMode = oneOf(r.mode, ['enforce', 'audit'] as const, `${n}: "mode"`)
    if (r.expires !== undefined && (effect !== 'ask' || parseDuration(r.expires) === null)) throw new Error(`${n}: "expires" goes on an ask rule and must be a duration such as 30m, 2h or 1d`)
    return {
      id: r.id, effect, from: patterns(r.from, `${n}: "from"`), to: patterns(r.to, `${n}: "to"`),
      ...(actions ? { actions } : {}), ...(r.both ? { both: true } : {}), ...(except.length ? { except } : {}),
      ...(approvers ? { approvers } : {}), ...(proof ? { proof } : {}), ...(r.expires !== undefined ? { expires: r.expires.trim() } : {}),
      ...(ruleMode === 'audit' ? { mode: 'audit' as const } : {}),
      ...(r.note ? { note: r.note.slice(0, 300) } : {}),
    }
  })
  return { version: 2, default: oneOf(raw.default, ['allow', 'deny'] as const, '"default"') || 'allow', rules, ...shared }
}

const lc = (s?: string) => (s || '').toLowerCase()

function matches(pattern: string, p: PolicyParty, ctx: PolicyContext): boolean {
  if (p.kind === 'system') return false
  if (pattern === '*') return true
  const i = pattern.indexOf(':')
  const kind = pattern.slice(0, i)
  const value = lc(pattern.slice(i + 1))
  if (kind === 'host') return lc(p.host) === value
  if (kind === 'team') return p.kind === 'agent' && (ctx.teamsOf?.(p) || []).includes(value)
  if (kind !== p.kind) return false
  if (value === '*') return true
  // agent:dev@host-b pins the host; agent:dev is dev on any host
  const [who, host] = value.split('@')
  if (host && lc(p.host) !== host) return false
  return lc(p.id) === who || (p.kind === 'agent' && lc(p.name) === who)
}

export function partyLabel(p: PolicyParty): string {
  if (p.kind === 'system') return 'AI Maestro'
  const who = p.kind === 'person' ? (p.id ? `person:${p.id}` : 'an unidentified person') : `agent:${p.name || p.id}`
  return p.host && (p.kind === 'agent' || p.id) ? `${who}@${p.host}` : who
}

const anyMatch = (list: string[] | undefined, p: PolicyParty, ctx: PolicyContext) => !list || list.some(x => matches(x, p, ctx))
const hits = (s: { from?: string[]; to?: string[]; both?: boolean }, from: PolicyParty, to: PolicyParty, ctx: PolicyContext) =>
  (anyMatch(s.from, from, ctx) && anyMatch(s.to, to, ctx)) || (!!s.both && anyMatch(s.to, from, ctx) && anyMatch(s.from, to, ctx))

function applies(r: PolicyRuleV2, from: PolicyParty, to: PolicyParty, action: PolicyAction, ctx: PolicyContext): boolean {
  if (!(r.actions || COMMS).includes(action)) return false
  if (!hits(r, from, to, ctx)) return false
  return !(r.except || []).some(e => (!e.actions || e.actions.includes(action)) && hits(e, from, to, ctx))
}

const isAudit = (p: Policy, r: PolicyRuleV2) => p.mode === 'audit' || r.mode === 'audit'
const ruleName = (p: Policy, r: PolicyRuleV2) => (p.version === 1 ? r.id.replace('-', ' ') : r.id)

function strongest(rules: PolicyRuleV2[]): { effect: PolicyEffect; rules: PolicyRuleV2[] } | null {
  for (const effect of EFFECTS) {
    const rs = rules.filter(r => r.effect === effect)
    if (rs.length) return { effect, rules: rs }
  }
  return null
}

const WOULD: Record<PolicyEffect, string> = { allow: 'allowed', deny: 'refused', ask: 'held for approval' }

/** Pure: the decision of one policy. Deny, then ask, then allow, then the file's default; audit rules are reported, not applied. */
export function decide(policy: Policy, from: PolicyParty, to: PolicyParty, action: PolicyAction = 'message', ctx: PolicyContext = {}): PolicyDecision {
  const on = ctx.host ? ` on host ${ctx.host}` : ''
  if (from.kind === 'system') return { allowed: true, effect: 'allow', reason: 'AI Maestro itself may always send', host: ctx.host }
  const matched = policy.rules.filter(r => applies(r, from, to, action, ctx))
  const real = strongest(matched.filter(r => !isAudit(policy, r)))
  const all = strongest(matched)
  // A file in audit mode applies nothing, its default included
  // The file's default is about reaching someone; a governance action with no rule that names it goes ahead
  const dflt = COMMS.includes(action) ? policy.default : 'allow'
  const effect = real?.effect ?? (policy.mode === 'audit' ? 'allow' : dflt)
  const wouldBe = all?.effect ?? dflt
  const why = (r: PolicyRuleV2) => `${ruleName(policy, r)}${on} (${r.from.join(', ')} -> ${r.to.join(', ')})${r.note ? `: ${r.note}` : ''}`
  const whys = (real?.rules || []).map(why).join('; and by ')
  const verb = ACTION_WORDS[action] || action
  const reason = !real
    ? effect === 'allow'
      ? `Allowed: no rule${on} matched, and by default everyone may reach everyone`
      : `${partyLabel(from)} may not ${verb} ${partyLabel(to)}: no rule${on} allows it, and this host's default is deny`
    : effect === 'allow' ? `Allowed by ${whys}`
      : effect === 'deny' ? `${partyLabel(from)} may not ${verb} ${partyLabel(to)}: blocked by ${whys}`
        : `${partyLabel(from)} may not ${verb} ${partyLabel(to)} until someone approves: it needs approval under ${whys}`
  const audit = wouldBe !== effect ? (all?.rules || []).filter(r => isAudit(policy, r)) : []
  const auditNote = wouldBe !== effect
    ? ` (audit only: ${audit.length ? audit.map(r => ruleName(policy, r)).join(', ') : "this host's default"} would have it ${WOULD[wouldBe]})`
    : ''
  const first = real?.rules[0]
  const approvers = effect === 'ask' ? [...new Set(real!.rules.flatMap(r => r.approvers || []))] : []
  const asks = effect === 'ask' ? real!.rules : []
  return {
    allowed: effect === 'allow',
    effect,
    reason: reason + auditNote,
    ...(policy.version === 1 && first ? { rule: Number(first.id.slice(5)) } : {}),
    ...(real ? { ruleIds: real.rules.map(r => r.id) } : {}),
    ...(matched.length ? { matched: matched.map(r => ({ id: r.id, effect: r.effect, ...(isAudit(policy, r) ? { mode: 'audit' as const } : {}) })) } : {}),
    ...(wouldBe !== effect ? { wouldBe, auditRuleIds: audit.map(r => r.id) } : {}),
    ...(approvers.length ? { approvers } : {}),
    ...(asks.length ? {
      proof: asks.some(r => r.proof === 'signed') ? 'signed' as const : 'any' as const,
      expiresMs: Math.min(...asks.map(r => parseDuration(r.expires) ?? DEFAULT_ASK_EXPIRY_MS)),
    } : {}),
    host: ctx.host,
  }
}

/** Version 1 rules (phase 1 API): the same decisions, through the one evaluator. */
export function evaluatePolicy(rules: PolicyRule[], from: PolicyParty, to: PolicyParty, action: PolicyAction = 'message', ctx: PolicyContext = {}): PolicyDecision {
  return decide(compileV1(rules), from, to, action, ctx)
}

// ── Tests in the file ────────────────────────────────────────────────────────

export interface PolicyTestResult { test: PolicyTest; got: PolicyEffect; pass: boolean; reason: string }

/** Runs the file's tests with this host's directory. A test checks what the rules say, audit rules included. */
export function runPolicyTests(policy: Policy, resolve: (ref: string) => PolicyParty, ctx: PolicyContext = {}): PolicyTestResult[] {
  return policy.tests.map(test => {
    const d = decide(policy, resolve(test.from), resolve(test.to), test.action || 'message', ctx)
    const got = d.wouldBe ?? d.effect ?? (d.allowed ? 'allow' : 'deny')
    return { test, got, pass: got === test.expect, reason: d.reason }
  })
}

// ── Lint (spec section 8) ────────────────────────────────────────────────────

export interface PolicyLint { rule: string; kind: 'dead-allow' | 'redundant' | 'shadowed' | 'approver'; message: string }

/** Every party that matches q also matches p. Exact for this pattern language, and false when unsure. */
function patternCovers(p: string, q: string): boolean {
  p = lc(p); q = lc(q)
  if (p === q || p === '*') return true
  const [pk, pv] = [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)]
  const [qk, qv] = [q.slice(0, q.indexOf(':')), q.slice(q.indexOf(':') + 1)]
  if (pk === 'host') return (qk === 'agent' || qk === 'person') && qv.includes('@') && qv.split('@')[1] === pv
  if (pv === '*') return qk === pk || (pk === 'agent' && qk === 'team')
  return pk === qk && (pk === 'agent' || pk === 'person') && !pv.includes('@') && qv.split('@')[0] === pv
}

const listCovers = (p: string[], q: string[]) => q.every(x => p.some(y => patternCovers(y, x)))

/** Rule s applies to every request rule r applies to. Only claimed for an s with no exceptions. */
function covers(s: PolicyRuleV2, r: PolicyRuleV2): boolean {
  if (s.except?.length) return false
  if (!(r.actions || COMMS).every(a => (s.actions || COMMS).includes(a))) return false
  const dir = (f: string[], t: string[]) => (listCovers(s.from, f) && listCovers(s.to, t)) || (!!s.both && listCovers(s.to, f) && listCovers(s.from, t))
  return dir(r.from, r.to) && (!r.both || dir(r.to, r.from))
}

/** Warnings, not errors. Version 1 files also get classic shadowing (an earlier rule hides a later one). */
export function lintPolicy(policy: Policy): PolicyLint[] {
  const out: PolicyLint[] = []
  const rs = policy.rules
  const name = (r: PolicyRuleV2) => ruleName(policy, r)
  if (policy.version === 1) {
    // Compare the rules as written: compiled denies carry exceptions, the originals do not
    const plain = rs.map(r => ({ ...r, except: undefined }))
    plain.forEach((r, i) => {
      const j = plain.slice(0, i).findIndex(s => covers(s, r))
      if (j < 0) return
      const s = plain[j]
      out.push(s.effect === r.effect
        ? { rule: r.id, kind: 'redundant', message: `${name(r)} is redundant: ${name(s)} comes first and already ${s.effect === 'allow' ? 'allows' : 'blocks'} everything it matches` }
        : { rule: r.id, kind: 'shadowed', message: `${name(r)} never decides: ${name(s)} comes first and covers everything it matches` })
    })
    return out
  }
  for (const r of rs) {
    const later = (r.approvers || []).filter(a => !supportedApprover(a))
    if (later.length) out.push({ rule: r.id, kind: 'approver', message: `${r.id}: approver ${later.join(', ')} cannot be resolved yet (role: and org: come with governance, team: and host: are not approvers); an ask that only they could answer is refused` })
  }
  const enforced = (r: PolicyRuleV2) => !isAudit(policy, r)
  rs.forEach((r, i) => {
    // A rule in audit mode is not applied, so it hides nothing that is enforced
    const kills = rs.filter(s => s !== r && (enforced(s) || !enforced(r)))
    const killer = r.effect === 'allow' && kills.find(s => s.effect !== 'allow' && covers(s, r))
    if (killer) return out.push({ rule: r.id, kind: 'dead-allow', message: `${r.id} never takes effect: ${killer.id} (${killer.effect}) applies to everything it allows` })
    // Two identical rules: report the later one only
    const same = kills.find(s => s.effect === r.effect && covers(s, r) && !(covers(r, s) && rs.indexOf(s) > i))
    if (same) out.push({ rule: r.id, kind: 'redundant', message: `${r.id} is redundant: ${same.id} has the same effect and covers it` })
  })
  return out
}

// ── The host's file ──────────────────────────────────────────────────────────

export interface LoadedPolicy {
  file: string
  /** The rules in force, as version 2 rules (a version 1 file compiled) */
  rules: PolicyRuleV2[]
  policy?: Policy
  /** sha256 of the file text in force, so a log line says which rules applied */
  hash?: string
  error?: string
}

let cache: { file: string; mtimeMs: number; loaded: LoadedPolicy } | null = null
const lastGood = new Map<string, LoadedPolicy & { at: string }>()
let missingWarned = ''

/** Where the last version that loaded is kept, so a broken file after a restart does not switch the rules off */
export const lastGoodFile = (file: string) => `${file}.last-good`

/** The saved last good version, if it still validates */
function savedGood(file: string): (LoadedPolicy & { at: string }) | undefined {
  try {
    const saved = lastGoodFile(file)
    const text = fs.readFileSync(saved, 'utf8')
    const policy = validatePolicy(JSON.parse(text))
    return { file, rules: policy.rules, policy, hash: `sha256:${crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)}`, at: fs.statSync(saved).mtime.toISOString() }
  } catch { return undefined }
}

/**
 * The rules this host enforces. A missing file is no rules, unless a version loaded before (in this process or
 * saved as policy.json.last-good): then that version still applies, as for a broken file. A file that does not parse or validate keeps the
 * last version that loaded: from this process, else the copy saved next to the file (policy.json.last-good);
 * with neither, no rules apply. Either way the error is returned (for GET /api/policy and the Doctor) and
 * logged once per change of the file.
 */
export function loadPolicy(file = policyFile()): LoadedPolicy {
  let mtimeMs = 0
  try { mtimeMs = fs.statSync(file).mtimeMs } catch {
    // Deleting the file does not switch the rules off: an empty rules list does (an agent can delete a file).
    // Only the saved copy counts here, so the result is the same before and after a restart.
    lastGood.delete(file)
    const good = savedGood(file)
    if (!good) return { file, rules: [] }
    const error = `${file} is missing. The version that loaded at ${good.at} still applies. To remove every rule, save the file with an empty rules list.`
    if (missingWarned !== file) { console.warn(`[Policy] ${error}`); missingWarned = file }
    return { file, rules: good.rules, policy: good.policy, hash: good.hash, error }
  }
  if (missingWarned === file) missingWarned = ''
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.loaded
  let loaded: LoadedPolicy
  try {
    const text = fs.readFileSync(file, 'utf8')
    const policy = validatePolicy(JSON.parse(text))
    loaded = { file, rules: policy.rules, policy, hash: `sha256:${crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)}` }
    lastGood.set(file, { ...loaded, at: new Date().toISOString() })
    try {
      let saved = ''
      try { saved = fs.readFileSync(lastGoodFile(file), 'utf8') } catch { /* none yet */ }
      if (saved !== text) writeFileAtomicSync(lastGoodFile(file), text, { mode: 0o600 })
    } catch (e) { console.warn(`[Policy] could not save ${lastGoodFile(file)}: ${(e as Error).message}`) }
  } catch (error) {
    const good = lastGood.get(file) || savedGood(file)
    const msg = `${file}: ${(error as Error).message}.`
    loaded = good
      ? { file, rules: good.rules, policy: good.policy, hash: good.hash, error: `${msg} The version that loaded at ${good.at} still applies until it is fixed.` }
      : { file, rules: [], error: `${msg} No rules apply until it is fixed.` }
    console.warn(`[Policy] ${loaded.error}`)
  }
  cache = { file, mtimeMs, loaded }
  return loaded
}

// ── The decision log (spec section 6) ────────────────────────────────────────

export interface PolicyLogLine {
  at: string
  host?: string
  /** An approval event (F118 step 2); absent for a decision */
  event?: 'quarantined' | 'approved' | 'rejected' | 'expired' | 'delivered'
  /** The quarantine entry (qtn_...) */
  request?: string
  /** Who approved or rejected, as they named themselves (dashboard: an unverified person) */
  by?: string
  proof?: string
  approvers?: string[]
  note?: string
  action: PolicyAction
  from: string
  to: string
  effect: PolicyEffect
  rules?: string[]
  wouldBe?: PolicyEffect
  audit?: string[]
  version?: 1 | 2
  hash?: string
}

/** Past this size the log moves to decisions.1.jsonl (one old file kept), so the log stays under 2 x 5 MB. */
const LOG_MAX_BYTES = 5 * 1024 * 1024

export function policyLogFile(home = os.homedir()): string {
  return path.join(home, '.aimaestro', 'policy', 'decisions.jsonl')
}

/** Refusals, asks and audit hits always; allows only when the file turns them on (logAllows). */
export function shouldLog(d: PolicyDecision, policy?: Policy, now = Date.now()): boolean {
  if (!policy) return false
  if (d.effect !== 'allow' || d.wouldBe) return true
  return policy.logAllows === true || (typeof policy.logAllows === 'string' && Date.parse(policy.logAllows) > now)
}

/**
 * One JSON line per decision: parties as labels, rule ids, the file's hash. Never message text or secrets.
 * Never throws. Under vitest it writes only to a file the test names (as lib/amp-refusals.ts).
 */
export function logPolicyDecision(line: Omit<PolicyLogLine, 'at'>, fileArg?: string): void {
  const file = fileArg ?? (process.env.VITEST ? null : policyLogFile())
  if (!file) return
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...line }) + '\n')
    if (fs.statSync(file).size > LOG_MAX_BYTES) fs.renameSync(file, file.replace(/\.jsonl$/, '.1.jsonl'))
  } catch (error) {
    console.warn('[Policy] Could not log a decision:', (error as Error).message)
  }
}

/** Thrown by a send path when the policy says no; services turn it into a 403 with the reason. */
export class PolicyDeniedError extends Error {
  constructor(public decision: PolicyDecision) {
    super(decision.reason)
    this.name = 'PolicyDeniedError'
  }
}

/**
 * The answer a service gives when the policy says no (AMP 08 error codes). A deny is a block: 403 `forbidden` with the
 * plain reason in `message`. A quarantined message (an ask: an AMP 07 policy hold) is 202 with status `quarantined`
 * and the `quarantine` object of 05 "Status Values"; `message` repeats the plain reason for the dashboard. A call that
 * asks is refused (403) with the entry an approval answers.
 */
// data is any so the result fits every service's ServiceResult<T>
export function policyDeniedResult(decision: PolicyDecision): { data: any; status: 403 | 202 } {
  const q = decision.quarantine
  if (q?.held) {
    return {
      data: {
        status: 'quarantined', message: decision.reason,
        quarantine: { quarantine_id: q.id, reason: 'policy', rules_triggered: decision.ruleIds || [], reason_text: decision.reason, reviewers: q.reviewers || [], expires_at: q.expiresAt },
      },
      status: 202,
    }
  }
  return { data: { error: 'forbidden', message: decision.reason, details: { rule: decision.rule, ruleIds: decision.ruleIds, effect: decision.effect, host: decision.host, ...(q ? { quarantine_id: q.id, expires_at: q.expiresAt } : {}) } }, status: 403 }
}
