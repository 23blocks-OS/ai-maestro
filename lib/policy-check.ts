/**
 * The one check every send path calls (F042): this host's rules (lib/policy) with this host's registry and teams.
 */
import { getAgent, getAgentByName, getAgentByNameAnyHost } from '@/lib/agent-registry'
import { loadTeams } from '@/lib/team-registry'
import { getSelfHostId, isSelf } from '@/lib/hosts-config'
import { personIdFromAddress } from '@/lib/person-address'
import { getPerson, loadPeople } from '@/lib/people-registry'
import { decide, loadPolicy, logPolicyDecision, partyLabel, shouldLog, type PolicyAction, type PolicyDecision, type PolicyParty } from '@/lib/policy'
import { createQuarantine, takePass, type ApproverLookup, type HeldPath } from '@/lib/policy-approvals'

const hostOf = (hostId?: string) => (!hostId || hostId === 'local' || isSelf(hostId) ? getSelfHostId() : hostId)

/** A registry agent as a party; the agent's own host, or this one. */
export function agentParty(agent: { id?: string; name?: string; alias?: string; hostId?: string }): PolicyParty {
  return { kind: 'agent', id: agent.id, name: agent.name || agent.alias, host: hostOf(agent.hostId) }
}

/**
 * A party from what a caller has: `person:<id>`, `person` (unidentified), `agent:<id or name>`, `maestro`/`system`,
 * an AMP address (`p-<id>@...` is a person, `name@host...` an agent), or a bare agent id or name.
 */
export function resolveParty(ref: string, hostArg?: string): PolicyParty {
  const s = (ref || '').trim()
  const host = hostArg ? hostOf(hostArg) : undefined
  if (s === 'maestro' || s === 'system') return { kind: 'system' }
  if (s === 'person' || s === 'person:') return { kind: 'person' }
  if (s.startsWith('person:')) return { kind: 'person', id: s.slice(7), ...(host ? { host } : {}) }
  const personId = personIdFromAddress(s)
  if (personId) return { kind: 'person', id: personId, ...(host ? { host } : {}) }
  const bare = s.startsWith('agent:') ? s.slice(6) : s
  const name = bare.split('@')[0]
  const agent = getAgent(name) || (host ? getAgentByName(name, host) : getAgentByNameAnyHost(name))
  // A same-named agent on another host is someone else: with a known host, only an agent there counts
  if (agent && (!host || hostOf(agent.hostId) === host)) return agentParty(agent)
  // Not in this registry (another host's agent): keep the name. An address's domain is not a host id, so only an explicit host counts
  return { kind: 'agent', name, ...(host ? { host } : {}) }
}

export function teamsOf(p: PolicyParty): string[] {
  const out: string[] = []
  // Teams list this host's agents: a name only matches a party on this host, never a same-named agent elsewhere
  const local = !p.host || p.host === getSelfHostId()
  for (const t of loadTeams()) {
    const hit = t.agentIds.some(id => id === p.id || (local && !!p.name && getAgent(id)?.name?.toLowerCase() === p.name.toLowerCase()))
    if (hit) out.push(t.id.toLowerCase(), t.name.toLowerCase())
  }
  return out
}

/**
 * This host's decision. Never throws: with no rules file (or a broken one that never loaded) everyone may reach
 * everyone. An ask that an approved quarantine entry covers is allowed, once: the replay of that held message
 * (`approved: <quarantine id>`), or the next identical call. An approval never opens a deny. Refusals, asks and audit
 * hits go to the decision log; `log: false` for a "why" question, which decides nothing and uses no pass.
 */
export function checkPolicy(from: PolicyParty, to: PolicyParty, action: PolicyAction = 'message', opts: { log?: boolean; approved?: string } = {}): PolicyDecision {
  const { policy, hash } = loadPolicy()
  const host = getSelfHostId()
  if (!policy) return { allowed: true, effect: 'allow', reason: `Allowed: host ${host} has no rules, so everyone may reach everyone`, host }
  let d = decide(policy, from, to, action, { host, teamsOf })
  if (d.effect === 'ask' && opts.log !== false) {
    const id = takePass(from, to, action, opts.approved)
    if (id) d = { ...d, allowed: true, effect: 'allow', reason: `Allowed: approved quarantine entry ${id} (${d.ruleIds?.join(', ')})` }
  }
  if (opts.log !== false && shouldLog(d, policy)) {
    logPolicyDecision({
      host, action, from: partyLabel(from), to: partyLabel(to), effect: d.effect!,
      ...(d.ruleIds ? { rules: d.ruleIds } : {}), ...(d.wouldBe ? { wouldBe: d.wouldBe, audit: d.auditRuleIds } : {}),
      version: policy.version, hash,
    })
  }
  return d
}

/** Who an approver pattern names, from this host's registry and people */
const lc = (s?: string) => (s || '').toLowerCase()
export const approverLookup: ApproverLookup = {
  agent: p => (p.id && getAgent(p.id)) || (p.name ? getAgentByName(p.name, p.host) : null),
  agentById: id => getAgent(id),
  agentByName: name => getAgentByName(name) || getAgentByNameAnyHost(name),
  person: text => getPerson(text) || loadPeople().find(p => lc(p.displayName) === lc(text) || (!!p.email && lc(p.email) === lc(text))) || null,
}

const g = globalThis as { _policySweeper?: ReturnType<typeof setInterval> }

/** Expires overdue quarantine entries once a minute and tells their senders (services/policy-service). Started by the first hold and at startup. */
export function ensureApprovalSweeper(): void {
  if (g._policySweeper || process.env.VITEST) return
  g._policySweeper = setInterval(() => {
    import('@/services/policy-service').then(m => m.sweepPolicyQuarantine()).catch(e => console.warn(`[Policy] sweep failed: ${e.message}`))
  }, 60_000)
  g._policySweeper.unref?.()
}

/**
 * An ask at a send path becomes an AMP quarantine entry. With `held`, the message waits in it until approved, and the
 * decision says so (policyDeniedResult turns it into 202 `quarantined`). Without (a call), the entry is created and the
 * call is refused now; an approval lets the next identical call through. With no approver, or a store that cannot be
 * used, it is a plain refusal with the reason. A decision that is not an ask is returned as is.
 */
export function holdForApproval(d: PolicyDecision, from: PolicyParty, to: PolicyParty, action: PolicyAction, held?: { path: HeldPath; payload: unknown }): PolicyDecision {
  if (d.effect !== 'ask') return d
  const made = createQuarantine({ decision: d, from, to, action, host: d.host || getSelfHostId(), held, look: approverLookup })
  if ('refused' in made) return { ...d, reason: `${d.reason}, but ${made.refused}, so it is refused` }
  ensureApprovalSweeper()
  const r = made.entry
  const who = r.approvers.map(a => a.label).join(' or ')
  const when = r.expires_at.slice(0, 16).replace('T', ' ') + ' UTC'
  // A named person gets one push, sent where their mailbox is when the approval request lands (services/amp-service);
  // `person:*` has no address, so no notice, and is pushed from here
  if (r.approvers.some(a => a.ref === 'person:*') && !process.env.VITEST) {
    import('@/lib/push-expo').then(m => m.pushApproval({ personIds: ['*'], quarantineId: r.quarantine_id, what: `${r.from} wants to ${action} ${r.to}` })).catch(() => {})
  }
  // AMP 07 "Approval request": a signed provider notice to each reviewer, which a signed reply answers
  if (!process.env.VITEST) import('@/services/provider-notices').then(m => m.sendApprovalRequests(r)).catch(e => console.warn(`[Policy] approval requests for ${r.quarantine_id}: ${e.message}`))
  const quarantine = { id: r.quarantine_id, expiresAt: r.expires_at, held: !!held, reviewers: r.reviewers }
  return held
    ? { ...d, quarantine, reason: `Held for approval by ${who} (quarantine ${r.quarantine_id}, expires ${when}): ${d.reason}` }
    : { ...d, quarantine, reason: `${d.reason}. Quarantine entry ${r.quarantine_id} went to ${who} (expires ${when}); once approved, the same ${action} goes through once` }
}

/** An ask where nobody can wait for the answer (a device input has no screen; federation in this phase): spec 11.3 item 7 */
export function askNotPossible(d: PolicyDecision, where: string): PolicyDecision {
  return d.effect === 'ask' ? { ...d, reason: `${d.reason}, which is not possible here (${where}), so it is refused` } : d
}
