/**
 * Organization view: agents, work and relations grouped by company, built only from what the
 * hosts already hold (agent tags `org:`, `kind:`, `role:`; open cards; projects). No new store.
 *
 * Multi-host rules this relies on:
 * - an agent id is unique across hosts, so cards and owners are matched by id, never by host
 *   (a project card lives on the project's host while its assignee can live on another);
 * - the same card can be reported by more than one host, so cards are deduplicated by id;
 * - this module only groups what it is given. A host that was down is the caller's job to name.
 *
 * "Shown, not enforced": an organization is a label. It does not restrict who can read what.
 */

export const NO_ORG = '(no organization)'

export interface OrgAgentInput {
  id: string
  name?: string
  label?: string
  alias?: string
  hostId: string
  hostName?: string
  tags?: string[]
}

export interface OrgCardInput {
  id: string
  subject: string
  status: string
  agentId: string
  scope?: 'agent' | 'team' | 'project'
  projectId?: string
  projectName?: string
  waitingOn?: string
  blockedBy?: string[]
  isBlocked?: boolean
  urgent?: boolean | null
  important?: boolean | null
}

export interface OrgProjectInput {
  id: string
  name: string
  status: string
  ownerAgentId: string | null
  hostId: string
  counts: { open: number; waiting: number; total: number }
}

export interface OrgAgent {
  id: string
  hostId: string
  hostName: string
  /** The name to show: label, then name, then alias */
  display: string
  role: string | null
  kind: string | null
  orgs: string[]
  open: number
  waiting: number
  blocked: number
}

export type RelationKind = 'hands-work-to' | 'waits-on' | 'blocked-by'

export interface OrgRelation {
  kind: RelationKind
  from: string
  to: string
  /** How many cards make this relation */
  count: number
  /** The two agents belong to different organizations (or one has none) */
  crossOrg: boolean
}

export interface Organization {
  id: string
  agents: OrgAgent[]
  cards: OrgCardInput[]
  projects: OrgProjectInput[]
  relations: OrgRelation[]
  stats: { agents: number; open: number; waiting: number; blocked: number; projects: number; waitingOnOperator: number }
}

/** Every value of a `prefix:value` tag, lowercase and trimmed, in order, without repeats */
export function tagValues(tags: string[] | undefined, prefix: string): string[] {
  const out: string[] = []
  for (const raw of tags || []) {
    const t = String(raw).trim().toLowerCase()
    if (!t.startsWith(`${prefix}:`)) continue
    const v = t.slice(prefix.length + 1).trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

export function agentDisplay(a: Pick<OrgAgentInput, 'id' | 'name' | 'label' | 'alias'>): string {
  return a.label || a.name || a.alias || a.id.slice(0, 8)
}

export function buildOrganizations(
  agents: OrgAgentInput[],
  cardsIn: OrgCardInput[],
  projects: OrgProjectInput[],
): Organization[] {
  const byId = new Map<string, OrgAgentInput>()
  for (const a of agents) if (!byId.has(a.id)) byId.set(a.id, a)

  const orgsOfAgent = (id: string): string[] => {
    const a = byId.get(id)
    if (!a) return [NO_ORG]
    const o = tagValues(a.tags, 'org')
    return o.length > 0 ? o : [NO_ORG]
  }

  // The same card can come from two hosts; keep one
  const seen = new Set<string>()
  const cards = cardsIn.filter(c => !seen.has(c.id) && seen.add(c.id))
  const cardById = new Map(cards.map(c => [c.id, c]))

  const sameOrg = (x: string, y: string) => {
    const a = orgsOfAgent(x)
    return orgsOfAgent(y).some(o => o !== NO_ORG && a.includes(o))
  }

  const orgs = new Map<string, Organization>()
  const get = (id: string): Organization => {
    let o = orgs.get(id)
    if (!o) {
      o = { id, agents: [], cards: [], projects: [], relations: [], stats: { agents: 0, open: 0, waiting: 0, blocked: 0, projects: 0, waitingOnOperator: 0 } }
      orgs.set(id, o)
    }
    return o
  }

  const openOf = new Map<string, { open: number; waiting: number; blocked: number }>()
  for (const c of cards) {
    const n = openOf.get(c.agentId) || { open: 0, waiting: 0, blocked: 0 }
    n.open++
    if (c.status === 'waiting') n.waiting++
    if (c.isBlocked) n.blocked++
    openOf.set(c.agentId, n)
  }

  for (const a of agents) {
    if (byId.get(a.id) !== a) continue
    const n = openOf.get(a.id) || { open: 0, waiting: 0, blocked: 0 }
    const view: OrgAgent = {
      id: a.id, hostId: a.hostId, hostName: a.hostName || a.hostId, display: agentDisplay(a),
      role: tagValues(a.tags, 'role')[0] || null, kind: tagValues(a.tags, 'kind')[0] || null,
      orgs: orgsOfAgent(a.id), ...n,
    }
    for (const o of view.orgs) get(o).agents.push(view)
  }

  for (const c of cards) for (const o of orgsOfAgent(c.agentId)) get(o).cards.push(c)

  for (const p of projects) {
    // A project belongs to its owner's organization, and to every organization with a card on it
    const members = new Set<string>(p.ownerAgentId ? orgsOfAgent(p.ownerAgentId) : [NO_ORG])
    for (const c of cards) if (c.projectId === p.id) for (const o of orgsOfAgent(c.agentId)) members.add(o)
    for (const o of members) get(o).projects.push(p)
  }

  // Relations: who hands work to whom (project owner -> assignee), who waits on whom, who blocks whom
  const projectOwner = new Map(projects.map(p => [p.id, p.ownerAgentId]))
  const edges = new Map<string, OrgRelation>()
  const edge = (kind: RelationKind, from: string, to: string) => {
    if (!from || !to || from === to) return
    const k = `${kind}|${from}|${to}`
    const e = edges.get(k)
    if (e) e.count++
    else edges.set(k, { kind, from, to, count: 1, crossOrg: !sameOrg(from, to) })
  }
  for (const c of cards) {
    const owner = c.projectId ? projectOwner.get(c.projectId) : null
    if (owner) edge('hands-work-to', owner, c.agentId)
    if (c.status === 'waiting' && c.waitingOn && byId.has(c.waitingOn)) edge('waits-on', c.agentId, c.waitingOn)
    for (const dep of c.blockedBy || []) {
      const d = cardById.get(dep)
      if (d && d.status !== 'completed') edge('blocked-by', c.agentId, d.agentId)
    }
  }
  for (const e of edges.values()) {
    const placed = new Set<string>([...orgsOfAgent(e.from), ...orgsOfAgent(e.to)])
    for (const o of placed) get(o).relations.push(e)
  }

  for (const o of orgs.values()) {
    o.agents.sort((a, b) => (a.kind || '').localeCompare(b.kind || '') || a.display.localeCompare(b.display))
    o.stats = {
      agents: o.agents.length,
      open: o.cards.length,
      waiting: o.cards.filter(c => c.status === 'waiting').length,
      blocked: o.cards.filter(c => c.isBlocked).length,
      projects: o.projects.length,
      waitingOnOperator: o.cards.filter(c => c.status === 'waiting' && c.waitingOn === 'juan').length,
    }
  }

  // Named organizations first (largest first), the unlabelled group last
  return [...orgs.values()].sort((a, b) =>
    (a.id === NO_ORG ? 1 : 0) - (b.id === NO_ORG ? 1 : 0) || b.stats.agents - a.stats.agents || a.id.localeCompare(b.id))
}
