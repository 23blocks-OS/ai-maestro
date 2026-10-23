/**
 * Rooms inside a room. A building with dozens of agents is one crowd; these rules split it by something
 * about the work, never by where files happen to live. Pure, so the grouping is tested without a canvas.
 *
 *   manager   who the agent reports to: an agent's reports share a room named for that manager, and
 *             agents that report to a person (and to no agent) share that person's room
 *   together  who actually works together: agents that message each other a lot (the last day), found by
 *             letting each agent join the group most of its messages go to. Inferred from behaviour, so it
 *             is named for the agent at its centre, not for a purpose
 *   role      the agent's `role:` tag (gm, cmo, support, ...), the one agentRoleLine shows
 *   team      the biggest team the agent is on
 *
 * A group of fewer than MIN_ZONE agents is not a room, so it folds into "Other" (with whoever has no
 * manager, role, team or conversations). A split that leaves one room holding most of the building is
 * dropped: it tells you nothing the building did not.
 */

import { tagValues } from '@/lib/organization'
import type { AgentTie } from '@/lib/world/relations'

export type ZoneMode = 'none' | 'manager' | 'together' | 'role' | 'team'

export const ZONE_MODES: Array<{ id: ZoneMode; label: string; title: string }> = [
  { id: 'none', label: 'None', title: 'One room, everyone in it' },
  { id: 'manager', label: 'Manager', title: 'By who the agent reports to (set it on the agent\'s card, or in the Reports lens)' },
  { id: 'together', label: 'Together', title: 'By who actually messages whom (the last 24 hours): groups that work together' },
  { id: 'role', label: 'Role', title: 'By the role: tag (gm, cmo, support, ...)' },
  { id: 'team', label: 'Team', title: 'By the biggest team an agent is on' },
]

export interface ZoneAgent {
  id: string
  tags?: string[]
  humanManager?: string
  managerAgentId?: string
}

export interface ZoneTeam {
  id: string
  name: string
  agentIds: string[]
}

export interface ZoneContext {
  teams?: ZoneTeam[]
  /** Agent-to-agent message ties (kind `talk`), for the `together` mode */
  talk?: AgentTie[]
  /** How an agent is called in a room's name */
  nameOf?: (id: string) => string
}

export interface Zone {
  key: string
  label: string
  ids: string[]
}

/** A group smaller than this is not worth a room */
export const MIN_ZONE = 2
/** One room holding more than this share of the building is not a split worth showing */
export const MAX_SHARE = 0.8
/** `auto` needs at least this share of the building to land in a real room (not "Other") */
export const MIN_COVERAGE = 0.6
export const OTHER_KEY = '~other'

function assemble(groups: Map<string, { label: string; ids: string[] }>, rest: string[], total: number): Zone[] {
  const rooms: Zone[] = []
  const other = [...rest]
  for (const [key, g] of groups) {
    if (g.ids.length >= MIN_ZONE) rooms.push({ key, label: g.label, ids: g.ids })
    else other.push(...g.ids)
  }
  rooms.sort((a, b) => b.ids.length - a.ids.length || a.label.localeCompare(b.label))
  // One room is no grouping, and an "Other" of one agent is not a room either
  if (rooms.length < 2 && !(rooms.length === 1 && other.length >= MIN_ZONE)) return []
  if (rooms.length > 0 && rooms[0].ids.length / Math.max(1, total) > MAX_SHARE) return []
  if (other.length > 0) rooms.push({ key: OTHER_KEY, label: 'Other', ids: other })
  return rooms
}

/**
 * Groups of agents that message each other: every agent starts alone and, in rounds, joins the group that
 * most of its message weight goes to (ties to the smaller id, so the result is the same every time). Stops
 * when nothing moves or after a few rounds. Returns agent id -> group id.
 */
export function togetherGroups(ids: string[], talk: AgentTie[]): Map<string, string> {
  const inSet = new Set(ids)
  const nbr = new Map<string, Map<string, number>>()
  const link = (a: string, b: string, w: number) => {
    const m = nbr.get(a) || new Map<string, number>()
    m.set(b, (m.get(b) || 0) + w)
    nbr.set(a, m)
  }
  for (const t of talk) {
    if (t.kind !== 'talk' || !inSet.has(t.a) || !inSet.has(t.b)) continue
    link(t.a, t.b, t.weight)
    link(t.b, t.a, t.weight)
  }
  const group = new Map(ids.map(id => [id, id]))
  const order = [...ids].sort()
  for (let round = 0; round < 12; round++) {
    let moved = false
    for (const id of order) {
      const m = nbr.get(id)
      if (!m) continue
      const score = new Map<string, number>()
      for (const [other, w] of m) score.set(group.get(other)!, (score.get(group.get(other)!) || 0) + w)
      let best = group.get(id)!
      let bestW = score.get(best) ?? 0
      for (const [g, w] of score) if (w > bestW || (w === bestW && g < best)) { best = g; bestW = w }
      if (best !== group.get(id)) { group.set(id, best); moved = true }
    }
    if (!moved) break
  }
  return group
}

/** The rooms of a set of agents under a mode; empty when the mode is `none` or nothing splits them usefully */
export function zoneAgents(agents: ZoneAgent[], mode: ZoneMode, ctx: ZoneContext = {}): Zone[] {
  if (mode === 'none' || agents.length < MIN_ZONE * 2) return []
  const nameOf = ctx.nameOf ?? ((id: string) => id.slice(0, 8))
  const groups = new Map<string, { label: string; ids: string[] }>()
  const rest: string[] = []
  const put = (key: string, label: string, id: string) => {
    const g = groups.get(key) || { label, ids: [] }
    g.ids.push(id)
    groups.set(key, g)
  }

  if (mode === 'manager') {
    for (const a of agents) {
      const m = a.managerAgentId?.toLowerCase()
      if (m) put(`agent:${m}`, `${nameOf(m)}'s team`, a.id)
      else if (a.humanManager) put(`person:${a.humanManager.toLowerCase()}`, `${a.humanManager}'s team`, a.id)
      else rest.push(a.id)
    }
  } else if (mode === 'together') {
    const ids = agents.map(a => a.id)
    const g = togetherGroups(ids, ctx.talk ?? [])
    const weight = new Map<string, number>()
    for (const t of ctx.talk ?? []) {
      weight.set(t.a, (weight.get(t.a) || 0) + t.weight)
      weight.set(t.b, (weight.get(t.b) || 0) + t.weight)
    }
    const members = new Map<string, string[]>()
    for (const id of ids) members.set(g.get(id)!, [...(members.get(g.get(id)!) || []), id])
    for (const [gid, list] of members) {
      if (list.length < MIN_ZONE) { rest.push(...list); continue }
      // Named for the agent most messaged inside the group: its centre
      const hub = [...list].sort((x, y) => (weight.get(y) || 0) - (weight.get(x) || 0) || x.localeCompare(y))[0]
      for (const id of list) put(`together:${gid}`, `${nameOf(hub)}'s circle`, id)
    }
  } else if (mode === 'role') {
    for (const a of agents) {
      const r = tagValues(a.tags, 'role')[0]
      if (r) put(`role:${r.toLowerCase()}`, r, a.id)
      else rest.push(a.id)
    }
  } else {
    // Team: the biggest team the agent is on (teams overlap; one room each is the only way to draw it)
    const bySize = [...(ctx.teams ?? [])].sort((a, b) => b.agentIds.length - a.agentIds.length || a.name.localeCompare(b.name))
    const home = new Map<string, ZoneTeam>()
    for (const t of bySize) for (const id of t.agentIds) if (!home.has(id)) home.set(id, t)
    for (const a of agents) {
      const t = home.get(a.id)
      if (t) put(`team:${t.id}`, t.name, a.id)
      else rest.push(a.id)
    }
  }
  return assemble(groups, rest, agents.length)
}

/**
 * The mode `auto` picks: the first of manager, together, team, role whose rooms hold at least MIN_COVERAGE of
 * the building (so most people are in a named room, not in "Other"); `none` when no mode does.
 */
export function bestZoneMode(agents: ZoneAgent[], ctx: ZoneContext = {}): ZoneMode {
  for (const mode of ['manager', 'together', 'team', 'role'] as const) {
    const zones = zoneAgents(agents, mode, ctx)
    const real = zones.filter(z => z.key !== OTHER_KEY)
    const covered = real.reduce((n, z) => n + z.ids.length, 0)
    if (real.length >= 2 && covered / Math.max(1, agents.length) >= MIN_COVERAGE) return mode
  }
  return 'none'
}
