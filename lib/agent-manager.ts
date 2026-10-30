/**
 * Who an agent reports to. Every agent should have a manager, and the manager can be a person, an agent, or
 * both: `humanManager` is the person (a name or email, as they go by; there is no user model by design) and
 * `managerAgentId` is another agent's id, on any host. Pure, so the rules are tested without a server.
 *
 * An update that touches neither field never fails on these rules, so an agent created before they existed
 * (no manager at all) can still be renamed or retagged; only a change that would leave it with none is refused.
 */

export interface ManagerFields {
  humanManager?: string
  managerAgentId?: string
}

/** undefined = leave as is; null or '' = clear */
export interface ManagerPatch {
  humanManager?: string | null
  managerAgentId?: string | null
}

export type ManagerResult =
  | { ok: true; value: ManagerFields; changed: boolean }
  | { ok: false; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONTROL = /[\u0000-\u001f\u007f]/
export const MAX_HUMAN_MANAGER = 100
export const MAX_CHAIN = 20

/** A usable human manager (trimmed), or null when it is not */
function cleanHuman(v: string): string | null {
  const t = v.trim()
  if (t.length === 0 || t.length > MAX_HUMAN_MANAGER || CONTROL.test(t)) return null
  return t
}

/**
 * The manager fields after a patch. `selfId` keeps an agent from managing itself; `created` (a new agent,
 * with no current value) must come out with at least one manager, as must any patch that touches either field.
 */
export function parseManagerPatch(current: ManagerFields, patch: ManagerPatch, selfId?: string): ManagerResult {
  const touched = patch.humanManager !== undefined || patch.managerAgentId !== undefined
  if (!touched) return { ok: true, value: { ...current }, changed: false }

  let human = current.humanManager
  let agent = current.managerAgentId

  if (patch.humanManager !== undefined) {
    if (patch.humanManager === null || (typeof patch.humanManager === 'string' && patch.humanManager.trim() === '')) {
      human = undefined
    } else if (typeof patch.humanManager !== 'string') {
      return { ok: false, message: 'humanManager must be a name or an email' }
    } else {
      const c = cleanHuman(patch.humanManager)
      if (!c) return { ok: false, message: `humanManager must be 1 to ${MAX_HUMAN_MANAGER} characters, with no control characters` }
      human = c
    }
  }
  if (patch.managerAgentId !== undefined) {
    if (patch.managerAgentId === null || (typeof patch.managerAgentId === 'string' && patch.managerAgentId.trim() === '')) {
      agent = undefined
    } else if (typeof patch.managerAgentId !== 'string' || !UUID.test(patch.managerAgentId.trim())) {
      return { ok: false, message: 'managerAgentId must be an agent id (a UUID)' }
    } else {
      agent = patch.managerAgentId.trim().toLowerCase()
      if (selfId && agent === selfId.toLowerCase()) return { ok: false, message: 'An agent cannot be its own manager' }
    }
  }
  if (!human && !agent) {
    return { ok: false, message: 'An agent needs a manager: a person (humanManager), another agent (managerAgentId), or both' }
  }
  const changed = human !== current.humanManager || agent !== current.managerAgentId
  return { ok: true, value: { humanManager: human, managerAgentId: agent }, changed }
}

/** The manager above each step, nearest first: [manager, manager's manager, ...]. Stops at a loop or at MAX_CHAIN. */
export function managerChain(id: string, managerOf: (id: string) => string | undefined): { chain: string[]; loop: boolean } {
  const chain: string[] = []
  const seen = new Set<string>([id])
  let cur = managerOf(id)
  while (cur && chain.length < MAX_CHAIN) {
    if (seen.has(cur)) return { chain, loop: true }
    seen.add(cur)
    chain.push(cur)
    cur = managerOf(cur)
  }
  return { chain, loop: false }
}

/** Would making `managerId` the manager of `id` close a loop (id is already above managerId)? */
export function wouldLoop(id: string, managerId: string, managerOf: (id: string) => string | undefined): boolean {
  if (id === managerId) return true
  const { chain } = managerChain(managerId, managerOf)
  return chain.includes(id)
}

/** The agents that report to `id`, by id */
export function reportsOf<T extends { id: string; managerAgentId?: string }>(id: string, agents: T[]): T[] {
  return agents.filter(a => a.managerAgentId === id)
}

export interface ManagerSuggestion extends ManagerFields {
  /** Why: the agent's `owner` text matched an agent, or looked like a person */
  from: 'owner'
}

/**
 * A suggested manager for an agent that has none, from its `owner` (free text that mixes people and agents).
 * An owner that names an agent (by name, alias or label, ignoring case) suggests that agent; any other owner
 * suggests a person. Never applied on its own: the page offers it and a person confirms.
 */
export function suggestManager(
  agent: { id: string; name?: string; alias?: string; label?: string; owner?: string; humanManager?: string; managerAgentId?: string },
  agents: Array<{ id: string; name?: string; alias?: string; label?: string }>,
  /** The People directory: an owner that names exactly one person (name or email) suggests that person's id */
  people: Array<{ id: string; displayName: string; email?: string }> = [],
): ManagerSuggestion | null {
  if (agent.humanManager || agent.managerAgentId) return null
  const owner = agent.owner?.trim()
  if (!owner || owner.toLowerCase() === 'system') return null
  const key = owner.toLowerCase()
  // An agent whose owner is its own name (the older default) has no one to suggest
  if ([agent.name, agent.alias, agent.label].some(n => n && n.toLowerCase() === key)) return null
  const hit = agents.find(a => a.id !== agent.id && [a.name, a.alias, a.label].some(n => n && n.toLowerCase() === key))
  if (hit) return { managerAgentId: hit.id, from: 'owner' }
  const persons = people.filter(p => p.displayName.trim().toLowerCase() === key || (!!p.email && p.email.trim().toLowerCase() === key))
  if (persons.length === 1) return { humanManager: persons[0].id, from: 'owner' }
  return cleanHuman(owner) ? { humanManager: owner, from: 'owner' } : null
}
