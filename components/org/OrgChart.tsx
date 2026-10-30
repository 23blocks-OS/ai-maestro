'use client'

import { useMemo } from 'react'
import { Bot, UserRound } from 'lucide-react'
import { PRESENCE_STYLE, type AgentPresence } from '@/lib/agent-presence'
import type { Organization, OrgAgent, OrgPerson } from '@/lib/organization'

type Node = { key: string; kind: 'person'; person: OrgPerson } | { key: string; kind: 'agent'; agent: OrgAgent }

const ROOT = 'root'

/**
 * Who reports to whom inside one organization: people over people, then each person's agents, and agents
 * under the agents they report to. A manager outside this organization does not place anyone here, so
 * those (and anything a loop would hide) are listed under "No manager in this organization".
 */
export function buildChart(org: Organization): { children: Map<string, Node[]>; unplaced: Node[]; looped: Node[] } {
  const people = new Set(org.people.map(p => p.id))
  const agents = new Set(org.agents.map(a => a.id.toLowerCase()))
  const children = new Map<string, Node[]>()
  const add = (parent: string, n: Node) => children.set(parent, [...(children.get(parent) || []), n])
  const unplaced: Node[] = []
  const all: Node[] = []

  for (const p of org.people) {
    const n: Node = { key: `p:${p.id}`, kind: 'person', person: p }
    all.push(n)
    add(p.managerPersonId && people.has(p.managerPersonId) ? `p:${p.managerPersonId}` : ROOT, n)
  }
  for (const a of org.agents) {
    const n: Node = { key: `a:${a.id.toLowerCase()}`, kind: 'agent', agent: a }
    all.push(n)
    if (a.managerAgentId && agents.has(a.managerAgentId)) add(`a:${a.managerAgentId}`, n)
    else if (a.humanManager && people.has(a.humanManager)) add(`p:${a.humanManager}`, n)
    else unplaced.push(n)
  }
  const label = (n: Node) => (n.kind === 'person' ? n.person.display : n.agent.display)
  for (const list of children.values()) list.sort((x, y) => (x.kind === y.kind ? label(x).localeCompare(label(y)) : x.kind === 'person' ? -1 : 1))
  unplaced.sort((x, y) => label(x).localeCompare(label(y)))

  // Anything not reachable from the top (a loop of managers across hosts) is shown, not lost
  const reached = new Set<string>()
  const walk = (key: string) => {
    for (const c of children.get(key) || []) {
      if (reached.has(c.key)) continue
      reached.add(c.key)
      walk(c.key)
    }
  }
  walk(ROOT)
  for (const u of unplaced) { reached.add(u.key); walk(u.key) }
  // Shown without their branch: the others in the loop are listed here too
  const looped = all.filter(n => !reached.has(n.key))
  return { children, unplaced, looped }
}

function NodeCard({ node, presenceOf }: { node: Node; presenceOf: (id: string) => AgentPresence }) {
  if (node.kind === 'person') {
    const p = node.person
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5">
        <UserRound className="h-3.5 w-3.5 flex-shrink-0 text-violet-300" />
        <span className="text-sm text-gray-100">{p.display}</span>
        {(p.title || p.role) && <span className="text-[11px] text-gray-400">{[p.title, p.role].filter(Boolean).join(' · ')}</span>}
      </div>
    )
  }
  const a = node.agent
  const s = PRESENCE_STYLE[presenceOf(a.id)]
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/60 px-2.5 py-1.5">
      <Bot className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${s.dot}`} title={s.title} />
      <span className="text-sm text-gray-100">{a.display}</span>
      <span className="text-[11px] text-gray-500">{a.role || 'no role'} · {a.hostName}</span>
    </div>
  )
}

function Branch({ nodeKey, tree, presenceOf, seen }: {
  nodeKey: string
  tree: Map<string, Node[]>
  presenceOf: (id: string) => AgentPresence
  seen: Set<string>
}) {
  const kids = (tree.get(nodeKey) || []).filter(k => !seen.has(k.key))
  if (kids.length === 0) return null
  return (
    <ul className="ml-3 border-l border-gray-800 pl-4">
      {kids.map(k => {
        const next = new Set(seen).add(k.key)
        return (
          <li key={k.key} className="relative py-1 before:absolute before:-left-4 before:top-4 before:h-px before:w-3 before:bg-gray-800">
            <NodeCard node={k} presenceOf={presenceOf} />
            <Branch nodeKey={k.key} tree={children} presenceOf={presenceOf} seen={next} />
          </li>
        )
      })}
    </ul>
  )
}

export default function OrgChart({ org, presenceOf }: { org: Organization; presenceOf: (id: string) => AgentPresence }) {
  const { children, unplaced, looped } = useMemo(() => buildChart(org), [org])
  const tops = children.get(ROOT) || []
  return (
    <div className="space-y-4" data-testid="org-chart">
      {tops.length > 0 ? (
        <ul className="space-y-1">
          {tops.map(t => (
            <li key={t.key}>
              <NodeCard node={t} presenceOf={presenceOf} />
              <Branch nodeKey={t.key} tree={children} presenceOf={presenceOf} seen={new Set([t.key])} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No people in this organization yet. Add people on the People page, or set who the agents report to.</p>
      )}
      {looped.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[11px] uppercase tracking-wide text-amber-400">In a loop of managers</h3>
          <ul className="space-y-1">{looped.map(l => <li key={l.key}><NodeCard node={l} presenceOf={presenceOf} /></li>)}</ul>
        </section>
      )}
      {unplaced.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[11px] uppercase tracking-wide text-gray-500">No manager in this organization</h3>
          <ul className="space-y-1">
            {unplaced.map(u => (
              <li key={u.key}>
                <NodeCard node={u} presenceOf={presenceOf} />
                <Branch nodeKey={u.key} tree={children} presenceOf={presenceOf} seen={new Set([u.key])} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
