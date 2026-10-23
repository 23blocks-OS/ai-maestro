/**
 * Rooms inside a room. A building with dozens of agents is one crowd; these rules split it by something
 * people already use to think about who does what. Pure, so the grouping is tested without a canvas.
 *
 *   folder  where the agent works. Agents in the same project folder, or in sibling folders under a shared
 *           parent (19 agents in .../23blocks/blocks/<service>/api), share a room named for that folder
 *   role    the agent's `role:` tag (gm, cmo, support, ...), the one agentRoleLine shows
 *   team    the biggest team the agent is on
 *
 * A group of fewer than MIN_ZONE agents is not a room, so it folds into "Other" (with whoever has no
 * folder, role or team). With fewer than two rooms the grouping is dropped: one room is no grouping.
 */

import { tagValues } from '@/lib/organization'

export type ZoneMode = 'none' | 'folder' | 'role' | 'team'

export const ZONE_MODES: Array<{ id: ZoneMode; label: string; title: string }> = [
  { id: 'none', label: 'None', title: 'One room, everyone in it' },
  { id: 'folder', label: 'Folder', title: 'By the folder an agent works in (siblings under a shared parent share a room)' },
  { id: 'role', label: 'Role', title: 'By the role: tag (gm, cmo, support, ...)' },
  { id: 'team', label: 'Team', title: 'By the biggest team an agent is on' },
]

export interface ZoneAgent {
  id: string
  workingDirectory?: string
  tags?: string[]
}

export interface ZoneTeam {
  id: string
  name: string
  agentIds: string[]
}

export interface Zone {
  key: string
  label: string
  ids: string[]
}

/** A group smaller than this is not worth a room */
export const MIN_ZONE = 2
/** A shared parent folder needs at least this many agents under it to be a room of its own */
export const MIN_FOLDER_CLUSTER = 3
export const OTHER_KEY = '~other'

const segments = (path: string): string[] => path.split('/').filter(Boolean)

/**
 * Ancestors worth naming: not the filesystem root, not a home or volume root (/Users/x, /home/x, /Volumes/x),
 * not a temp folder. Everything with fewer than three segments is too shallow to mean a project.
 */
function nameableAncestors(path: string): string[] {
  const seg = segments(path)
  if (seg[0] === 'private' || seg[0] === 'tmp' || seg[0] === 'var') return []
  const out: string[] = []
  for (let n = 3; n <= seg.length; n++) out.push('/' + seg.slice(0, n).join('/'))
  return out
}

/**
 * Each agent's room by folder: the deepest ancestor of its folder that at least MIN_FOLDER_CLUSTER agents
 * share. The 19 agents under .../blocks/<service>/api land in "blocks"; nine in one repo land in that repo.
 * Returns agent id -> ancestor path (agents with none are left out).
 */
export function folderClusters(agents: ZoneAgent[]): Map<string, string> {
  const count = new Map<string, number>()
  const anc = new Map<string, string[]>()
  for (const a of agents) {
    if (!a.workingDirectory) continue
    const list = nameableAncestors(a.workingDirectory)
    anc.set(a.id, list)
    for (const p of list) count.set(p, (count.get(p) || 0) + 1)
  }
  const out = new Map<string, string>()
  for (const [id, list] of anc) {
    for (let i = list.length - 1; i >= 0; i--) {
      if ((count.get(list[i]) || 0) >= MIN_FOLDER_CLUSTER) { out.set(id, list[i]); break }
    }
  }
  return out
}

/** Names for folder paths: the last segment, with its parent when two rooms would otherwise share a name */
function folderLabels(paths: string[]): Map<string, string> {
  const base = (p: string) => segments(p).slice(-1)[0] ?? p
  const dup = new Map<string, number>()
  for (const p of paths) dup.set(base(p), (dup.get(base(p)) || 0) + 1)
  return new Map(paths.map(p => {
    const s = segments(p)
    return [p, (dup.get(base(p)) || 0) > 1 && s.length >= 2 ? `${s[s.length - 2]}/${s[s.length - 1]}` : base(p)]
  }))
}

function assemble(groups: Map<string, { label: string; ids: string[] }>, rest: string[]): Zone[] {
  const rooms: Zone[] = []
  const other = [...rest]
  for (const [key, g] of groups) {
    if (g.ids.length >= MIN_ZONE) rooms.push({ key, label: g.label, ids: g.ids })
    else other.push(...g.ids)
  }
  rooms.sort((a, b) => b.ids.length - a.ids.length || a.label.localeCompare(b.label))
  // One room is no grouping, and an "Other" of one agent is not a room either
  if (rooms.length < 2 && !(rooms.length === 1 && other.length >= MIN_ZONE)) return []
  if (other.length > 0) rooms.push({ key: OTHER_KEY, label: 'Other', ids: other })
  return rooms
}

/** The rooms of a set of agents under a mode; empty when the mode is `none` or nothing splits them usefully */
export function zoneAgents(agents: ZoneAgent[], mode: ZoneMode, teams: ZoneTeam[] = []): Zone[] {
  if (mode === 'none' || agents.length < MIN_ZONE * 2) return []
  const groups = new Map<string, { label: string; ids: string[] }>()
  const rest: string[] = []
  const put = (key: string, label: string, id: string) => {
    const g = groups.get(key) || { label, ids: [] }
    g.ids.push(id)
    groups.set(key, g)
  }

  if (mode === 'folder') {
    const cluster = folderClusters(agents)
    const labels = folderLabels([...new Set(cluster.values())])
    for (const a of agents) {
      const p = cluster.get(a.id)
      if (p) put(p, labels.get(p) ?? p, a.id)
      else rest.push(a.id)
    }
  } else if (mode === 'role') {
    for (const a of agents) {
      const r = tagValues(a.tags, 'role')[0]
      if (r) put(`role:${r.toLowerCase()}`, r, a.id)
      else rest.push(a.id)
    }
  } else {
    // Team: the biggest team the agent is on (teams overlap; one room each is the only way to draw it)
    const bySize = [...teams].sort((a, b) => b.agentIds.length - a.agentIds.length || a.name.localeCompare(b.name))
    const home = new Map<string, ZoneTeam>()
    for (const t of bySize) for (const id of t.agentIds) if (!home.has(id)) home.set(id, t)
    for (const a of agents) {
      const t = home.get(a.id)
      if (t) put(`team:${t.id}`, t.name, a.id)
      else rest.push(a.id)
    }
  }
  return assemble(groups, rest)
}
