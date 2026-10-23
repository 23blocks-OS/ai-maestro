/**
 * World view grouping: the same agents, cut three ways — by host, by org, or by
 * org then host (Juan's example: 23blocks the org, its hosts as the islands).
 *
 * Built only from what the repo already holds: an agent's one `hostId`
 * (types/agent.ts) and its `org:<id>` tags (types/org.ts, read with the Org
 * page's own `tagValues`). No new store.
 *
 * One deliberate difference from lib/organization.ts: that page shows an
 * agent under *every* org it tags; a world map needs a partition — every agent on exactly one island, so
 * counts sum to the fleet — so an agent's org here is its *first* org tag,
 * and untagged agents land in `personal`, the Org page's default org.
 *
 * Status is not re-derived here: callers pass the shared `presenceOf` from
 * hooks/useSessionActivity (Working / Needs you / Ready / Offline,
 * lib/agent-presence.ts) and this module only counts what it returns.
 *
 * A host is offline the way the rest of the UI reads it: `enabled === false`
 * (the circuit breaker disables a host and records offlineReason,
 * types/host.ts). In 'org' mode a group pools several hosts, so it exposes
 * `offlineHostIds` and is `offline` only when every host it pools is offline.
 */

import { agentDisplay, tagValues, DEFAULT_ORG } from '@/lib/organization'
import type { AgentPresence } from '@/lib/agent-presence'
import type { Host } from '@/types/host'

export type WorldGroupMode = 'host' | 'org' | 'org-host'

/** Where an agent with no `org:` tag stands: the Org page's own default, `personal` (every agent belongs to a company or to you) */
export const UNASSIGNED_ORG = DEFAULT_ORG

/** The least of an agent this module needs; the repo's Agent satisfies it */
export interface WorldAgentInput {
  id: string
  name?: string
  label?: string
  alias?: string
  hostId: string
  hostName?: string
  tags?: string[]
}

export interface WorldStatusCounts {
  total: number
  working: number
  needsYou: number
  ready: number
  offline: number
}

/**
 * A building on an island: the island's agents split by the *other* dimension, so an org island
 * (an organization) has a building per host its agents run on, and a host island has a building per
 * organization running there. Every agent is in exactly one building of its island.
 */
export interface WorldBuilding {
  /** Stable within its island: the hostId (org mode) or the org id (host mode) */
  key: string
  label: string
  hostId?: string
  orgId?: string
  agents: WorldAgentInput[]
  counts: WorldStatusCounts
  /** The building's host is offline (always false in host mode: the island is the host) */
  offline: boolean
}

export interface WorldGroup {
  /** Stable key for the mode: hostId, org id, or `org|hostId` */
  key: string
  mode: WorldGroupMode
  /** What the island is called: the host name, the org name, or "Org · Host" */
  label: string
  orgId?: string
  hostId?: string
  /** Every host this group pools (one, except in 'org' mode) */
  hostIds: string[]
  agents: WorldAgentInput[]
  /** The island's buildings: its agents grouped by host (org islands) or by org (host islands) */
  buildings: WorldBuilding[]
  counts: WorldStatusCounts
  /** Every pooled host is offline (in single-host modes: that host is) */
  offline: boolean
  /** The pooled hosts that are offline (all of them, some, or none) */
  offlineHostIds: string[]
}

/** An agent's org: its first `org:<id>` tag, or `personal` (the Org page's default) when it has none */
export function getAgentOrg(agent: Pick<WorldAgentInput, 'tags'>): string {
  return tagValues(agent.tags, 'org')[0] || UNASSIGNED_ORG
}

/** Org whose agents are test and probe sessions: kept out of the world (still on the Org page) */
export const SANDBOX_ORG = 'sandbox'

/** A test or probe agent (tagged `org:sandbox`), which the world does not draw */
export function isSandboxAgent(agent: Pick<WorldAgentInput, 'tags'>): boolean {
  return tagValues(agent.tags, 'org').includes(SANDBOX_ORG)
}

/** A host is offline when it is disabled (circuit breaker / settings) */
export function isHostOffline(host: Pick<Host, 'enabled'> | undefined): boolean {
  return host?.enabled === false
}

export interface GroupAgentsOptions {
  hosts?: Pick<Host, 'id' | 'name' | 'enabled'>[]
  /** Org id → display name, from the org records (hooks/useOrgs) */
  orgNames?: Record<string, string>
  /** The shared status derivation (hooks/useSessionActivity's presenceOf) */
  presenceOf?: (agent: WorldAgentInput) => AgentPresence
}

const emptyCounts = (): WorldStatusCounts => ({ total: 0, working: 0, needsYou: 0, ready: 0, offline: 0 })

function countPresence(counts: WorldStatusCounts, presence: AgentPresence) {
  counts.total++
  if (presence === 'working') counts.working++
  else if (presence === 'needs-you') counts.needsYou++
  else if (presence === 'ready') counts.ready++
  else counts.offline++
}

/** Split an island's agents into its buildings (see WorldBuilding), ordered by size then label */
function buildBuildings(
  group: WorldGroup,
  hostLabel: (a: WorldAgentInput) => string,
  orgLabel: (orgId: string) => string,
  hostById: Map<string, Pick<Host, 'id' | 'name' | 'enabled'>>,
  presenceOf: GroupAgentsOptions['presenceOf'],
): WorldBuilding[] {
  const byKey = new Map<string, WorldBuilding>()
  for (const agent of group.agents) {
    // Org islands split by host; host islands split by org; an org-and-host island is one building
    const key = group.mode === 'org' ? agent.hostId : group.mode === 'host' ? getAgentOrg(agent) : group.key
    let b = byKey.get(key)
    if (!b) {
      b = group.mode === 'org'
        ? { key, label: hostLabel(agent), hostId: agent.hostId, agents: [], counts: emptyCounts(), offline: isHostOffline(hostById.get(agent.hostId)) }
        : group.mode === 'host'
          ? { key, label: orgLabel(key), orgId: key, agents: [], counts: emptyCounts(), offline: false }
          : { key, label: group.label, hostId: group.hostId, orgId: group.orgId, agents: [], counts: emptyCounts(), offline: group.offline }
      byKey.set(key, b)
    }
    b.agents.push(agent)
    if (presenceOf) countPresence(b.counts, presenceOf(agent))
    else b.counts.total++
  }
  return [...byKey.values()].sort((a, b) =>
    b.agents.length - a.agents.length || a.label.toLowerCase().localeCompare(b.label.toLowerCase()) || a.key.localeCompare(b.key))
}

/**
 * Partition agents into world groups. Every agent lands in exactly one group
 * (duplicate ids keep their first sighting, as buildOrganizations does), so
 * the groups' counts always sum to the number of distinct agents. Groups are
 * ordered by label, then key; agents inside a group by display name, then id.
 */
export function groupAgents(
  agents: WorldAgentInput[],
  mode: WorldGroupMode,
  opts: GroupAgentsOptions = {},
): WorldGroup[] {
  const hostById = new Map((opts.hosts || []).map(h => [h.id, h]))
  const hostLabel = (a: WorldAgentInput) =>
    hostById.get(a.hostId)?.name || a.hostName || a.hostId
  const orgLabel = (orgId: string) => opts.orgNames?.[orgId] || (orgId === DEFAULT_ORG ? 'Personal' : orgId)

  const groups = new Map<string, WorldGroup>()
  const seen = new Set<string>()

  const get = (key: string, init: () => WorldGroup): WorldGroup => {
    let g = groups.get(key)
    if (!g) { g = init(); groups.set(key, g) }
    return g
  }

  for (const agent of agents) {
    if (seen.has(agent.id)) continue
    seen.add(agent.id)
    const orgId = getAgentOrg(agent)

    let group: WorldGroup
    if (mode === 'host') {
      group = get(agent.hostId, () => ({
        key: agent.hostId, mode, label: hostLabel(agent), hostId: agent.hostId,
        hostIds: [agent.hostId], agents: [], buildings: [], counts: emptyCounts(), offline: false, offlineHostIds: [],
      }))
    } else if (mode === 'org') {
      group = get(orgId, () => ({
        key: orgId, mode, label: orgLabel(orgId), orgId,
        hostIds: [], agents: [], buildings: [], counts: emptyCounts(), offline: false, offlineHostIds: [],
      }))
      if (!group.hostIds.includes(agent.hostId)) group.hostIds.push(agent.hostId)
    } else {
      const key = `${orgId}|${agent.hostId}`
      group = get(key, () => ({
        key, mode, label: `${orgLabel(orgId)} · ${hostLabel(agent)}`, orgId, hostId: agent.hostId,
        hostIds: [agent.hostId], agents: [], buildings: [], counts: emptyCounts(), offline: false, offlineHostIds: [],
      }))
    }

    group.agents.push(agent)
    if (opts.presenceOf) countPresence(group.counts, opts.presenceOf(agent))
    else group.counts.total++
  }

  for (const group of groups.values()) {
    group.hostIds.sort()
    group.offlineHostIds = group.hostIds.filter(id => isHostOffline(hostById.get(id)))
    group.offline = group.hostIds.length > 0 && group.offlineHostIds.length === group.hostIds.length
    group.agents.sort((a, b) =>
      agentDisplay(a).toLowerCase().localeCompare(agentDisplay(b).toLowerCase()) || a.id.localeCompare(b.id))
    group.buildings = buildBuildings(group, hostLabel, orgLabel, hostById, opts.presenceOf)
  }

  return [...groups.values()].sort((a, b) =>
    a.label.toLowerCase().localeCompare(b.label.toLowerCase()) || a.key.localeCompare(b.key))
}
