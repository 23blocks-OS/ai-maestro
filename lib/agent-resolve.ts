/**
 * Resolve a loose reference to an agent: id, name, alias or label.
 *
 * People and agents say "Titania" (the label shown in the dashboard) or "IaC"
 * (the alias); the address is the name (`23blocks-iac`). Resolution order is
 * id, name, alias, label, each case-insensitive. A reference that matches
 * more than one agent at the same level is ambiguous: we list them and never
 * pick one, because a guessed recipient gets a message meant for someone else.
 */
import type { Agent } from '@/types/agent'

export type ResolveVia = 'id' | 'name' | 'alias' | 'label'

export interface ResolveCandidate {
  id: string
  name: string
  label?: string
  alias?: string
  hostId?: string
  via: ResolveVia
}

export type ResolveResult =
  | { status: 'found'; via: ResolveVia; agent: ResolveCandidate }
  | { status: 'ambiguous'; via: ResolveVia; candidates: ResolveCandidate[] }
  | { status: 'none'; suggestions: ResolveCandidate[] }

const norm = (s?: string) => (s || '').trim().toLowerCase()

function candidate(a: Agent, via: ResolveVia): ResolveCandidate {
  return { id: a.id, name: a.name || a.alias || '', label: a.label, alias: a.alias, hostId: a.hostId, via }
}

export function resolveAgentRef(query: string, all: Agent[]): ResolveResult {
  const q = norm(query)
  const agents = all.filter(a => !a.deletedAt)
  if (q) {
    const levels: Array<[ResolveVia, (a: Agent) => string]> = [
      ['id', a => norm(a.id)],
      ['name', a => norm(a.name)],
      ['alias', a => norm(a.alias)],
      ['label', a => norm(a.label)],
    ]
    for (const [via, key] of levels) {
      const hits = agents.filter(a => key(a) === q)
      if (hits.length === 1) return { status: 'found', via, agent: candidate(hits[0], via) }
      if (hits.length > 1) return { status: 'ambiguous', via, candidates: hits.map(a => candidate(a, via)) }
    }
  }
  return { status: 'none', suggestions: suggestAgents(query, agents) }
}

/** Close matches for a reference that did not resolve: substring in name, alias or label, either way round. */
export function suggestAgents(query: string, all: Agent[], limit = 5): ResolveCandidate[] {
  const q = norm(query)
  if (!q) return []
  const out: ResolveCandidate[] = []
  for (const a of all) {
    if (a.deletedAt) continue
    const fields: Array<[ResolveVia, string]> = [['name', norm(a.name)], ['alias', norm(a.alias)], ['label', norm(a.label)]]
    const hit = fields.find(([, v]) => v && (v.includes(q) || (v.length >= 3 && q.includes(v))))
    if (hit) out.push(candidate(a, hit[0]))
    if (out.length >= limit) break
  }
  return out
}
