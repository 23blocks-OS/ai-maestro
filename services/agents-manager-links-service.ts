/**
 * Agents Manager Links Service
 *
 * Links this host's agents to the People directory: a free-text `humanManager`, or the `owner` of an agent
 * with no manager, becomes a person id when it names exactly one person, or an agent manager when it names
 * exactly one agent (lib/manager-links.ts). Each host links its own agents.
 *
 *   GET  /api/agents/manager-links          -> what would change (dry run)
 *   POST /api/agents/manager-links { apply } -> apply it
 */

import { loadAgents } from '@/lib/agent-registry'
import { loadPeople } from '@/lib/people-registry'
import { getHosts, isSelfHost } from '@/lib/hosts-config'
import { planManagerLinks, type AgentLite, type ManagerLink, type PersonLite, type UnmatchedManager } from '@/lib/manager-links'
import { updateAgentById } from '@/services/agents-core-service'
import type { ServiceResult } from '@/services/service-errors'
import type { UpdateAgentRequest } from '@/types/agent'

const PEER_TIMEOUT_MS = 5000

export interface ManagerLinksReport {
  applied: boolean
  links: Array<ManagerLink & { error?: string }>
  unmatched: UnmatchedManager[]
  /** Peers that did not answer: their people and agents could not be matched */
  unreachable: string[]
}

async function fromPeers(): Promise<{ people: PersonLite[]; agents: AgentLite[]; unreachable: string[] }> {
  const people: PersonLite[] = []
  const agents: AgentLite[] = []
  const unreachable: string[] = []
  // Both endpoints answer with this host's data only, so asking them cannot loop between hosts
  await Promise.all(getHosts().filter(h => h.enabled !== false && !isSelfHost(h)).map(async h => {
    const base = h.url.replace(/\/$/, '')
    try {
      const [p, a] = await Promise.all([
        fetch(`${base}/api/people`, { signal: AbortSignal.timeout(PEER_TIMEOUT_MS) }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
        fetch(`${base}/api/agents`, { signal: AbortSignal.timeout(PEER_TIMEOUT_MS) }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
      ])
      for (const x of p.people || []) if (x?.id && x?.displayName && x.active !== false) people.push({ id: x.id, displayName: x.displayName, email: x.email })
      for (const x of a.agents || []) if (x?.id) agents.push({ id: x.id, name: x.name, alias: x.alias, label: x.label, managerAgentId: x.managerAgentId })
    } catch {
      unreachable.push(h.name || h.id)
    }
  }))
  return { people, agents, unreachable }
}

export async function linkAgentManagers(opts: { apply?: boolean } = {}): Promise<ServiceResult<ManagerLinksReport>> {
  const local = loadAgents().filter(a => !a.deletedAt)
  const peers = await fromPeers()
  const people: PersonLite[] = [
    ...loadPeople().filter(p => p.active !== false).map(p => ({ id: p.id, displayName: p.displayName, email: p.email })),
    ...peers.people,
  ]
  const localLite: AgentLite[] = local.map(a => ({ id: a.id, name: a.name, alias: a.alias, label: a.label, owner: a.owner, humanManager: a.humanManager, managerAgentId: a.managerAgentId }))
  const plan = planManagerLinks(localLite, people, [...localLite, ...peers.agents])

  const links: ManagerLinksReport['links'] = plan.links.map(l => ({ ...l }))
  if (opts.apply) {
    for (const l of links) {
      const r = updateAgentById(l.agentId, l.patch as UpdateAgentRequest)
      if (r.status >= 400) l.error = (r.data as { message?: string; error?: string })?.message || (r.data as { error?: string })?.error || `HTTP ${r.status}`
    }
  }
  return { data: { applied: !!opts.apply, links, unmatched: plan.unmatched, unreachable: peers.unreachable }, status: 200 }
}
