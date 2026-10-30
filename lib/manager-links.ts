/**
 * Who an agent's manager is, read against the People directory. Pure, used by the browser (names in the
 * profile and the World view) and by the server (linking old free-text managers to people).
 *
 * `humanManager` used to be free text (a name or an email). It now holds a person id from the directory,
 * which is what the mobile app compares with "me". Text that names no one in the directory still works and
 * is shown as is.
 */

import { wouldLoop, type ManagerPatch } from '@/lib/agent-manager'

export interface PersonLite { id: string; displayName: string; email?: string }
export interface AgentLite {
  id: string
  name?: string
  alias?: string
  label?: string
  owner?: string
  humanManager?: string
  managerAgentId?: string
}

const key = (s: string | undefined) => (s || '').trim().toLowerCase()

/** The one person whose name or email is exactly this text (ignoring case), or null when none or several */
export function personByText(text: string | undefined, people: PersonLite[]): PersonLite | null {
  const k = key(text)
  if (!k) return null
  const hits = people.filter(p => key(p.displayName) === k || (!!p.email && key(p.email) === k))
  return hits.length === 1 ? hits[0] : null
}

/** The one agent whose name, alias or label is exactly this text (ignoring case), or null when none or several */
export function agentByText(text: string | undefined, agents: AgentLite[]): AgentLite | null {
  const k = key(text)
  if (!k) return null
  const hits = agents.filter(a => [a.name, a.alias, a.label].some(n => key(n) === k))
  return hits.length === 1 ? hits[0] : null
}

/** The person a `humanManager` value points at: by id. */
export function personById(value: string | undefined, people: PersonLite[]): PersonLite | null {
  return value ? people.find(p => p.id === value) ?? null : null
}

/** What to show for a `humanManager`: the person's name when it is an id we know, otherwise the text itself */
export function managerName(value: string | undefined, people: PersonLite[]): string | undefined {
  if (!value) return undefined
  return personById(value, people)?.displayName ?? value
}

export interface ManagerLink {
  agentId: string
  agentName: string
  /** Which field the old text came from */
  from: 'humanManager' | 'owner'
  text: string
  patch: ManagerPatch
  /** "Ana (person)" or "lola (agent)" */
  to: string
}

export interface UnmatchedManager {
  agentId: string
  agentName: string
  from: 'humanManager' | 'owner'
  text: string
  reason: string
}

const nameOf = (a: AgentLite) => a.label || a.name || a.alias || a.id.slice(0, 8)

/**
 * The links to make for `agents` (this host's): a free-text `humanManager`, or the `owner` of an agent that
 * has no manager at all, becomes a person id when it names exactly one person, or an agent manager when it
 * names exactly one agent. Nothing is guessed: no match, or more than one, is listed as unmatched.
 * `allAgents` is every agent known (any host), for agent names and the loop check.
 */
export function planManagerLinks(
  agents: AgentLite[],
  people: PersonLite[],
  allAgents: AgentLite[],
): { links: ManagerLink[]; unmatched: UnmatchedManager[] } {
  const links: ManagerLink[] = []
  const unmatched: UnmatchedManager[] = []
  const byId = new Map(allAgents.map(a => [a.id.toLowerCase(), a]))
  const managerOf = (id: string) => byId.get(id)?.managerAgentId?.toLowerCase()

  for (const a of agents) {
    const human = a.humanManager?.trim()
    const from: 'humanManager' | 'owner' | null =
      human && !personById(human, people) ? 'humanManager'
        : !human && !a.managerAgentId && a.owner?.trim() && key(a.owner) !== 'system' ? 'owner'
          : null
    if (!from) continue
    const text = (from === 'humanManager' ? human : a.owner!.trim()) as string
    // An agent whose owner is its own name (the older default) has no one to link
    if (from === 'owner' && [a.name, a.alias, a.label].some(n => key(n) === key(text))) continue

    const person = personByText(text, people)
    if (person) {
      links.push({ agentId: a.id, agentName: nameOf(a), from, text, patch: { humanManager: person.id }, to: `${person.displayName} (person)` })
      continue
    }
    const agent = agentByText(text, allAgents.filter(x => x.id !== a.id))
    if (agent) {
      if (a.managerAgentId && a.managerAgentId.toLowerCase() !== agent.id.toLowerCase()) {
        unmatched.push({ agentId: a.id, agentName: nameOf(a), from, text, reason: 'names an agent, but this agent already reports to a different agent' })
      } else if (wouldLoop(a.id.toLowerCase(), agent.id.toLowerCase(), managerOf)) {
        unmatched.push({ agentId: a.id, agentName: nameOf(a), from, text, reason: 'names an agent, but that would make a loop of managers' })
      } else {
        // The text named an agent, not a person: move it to the agent field
        const patch: ManagerPatch = from === 'humanManager' ? { humanManager: null, managerAgentId: agent.id } : { managerAgentId: agent.id }
        links.push({ agentId: a.id, agentName: nameOf(a), from, text, patch, to: `${nameOf(agent)} (agent)` })
      }
      continue
    }
    unmatched.push({ agentId: a.id, agentName: nameOf(a), from, text, reason: 'names no one in the directory and no agent (or more than one)' })
  }
  return { links, unmatched }
}
