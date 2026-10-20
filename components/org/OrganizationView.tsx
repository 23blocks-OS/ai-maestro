'use client'

import { useMemo, useState } from 'react'
import { Hourglass, Link2, Lock } from 'lucide-react'
import { PRESENCE_STYLE, type AgentPresence } from '@/lib/agent-presence'
import { NO_ORG, type Organization, type OrgAgent, type OrgCardInput, type OrgRelation, type RelationKind } from '@/lib/organization'

type Tab = 'agents' | 'work' | 'projects' | 'relations'

const RELATION_TEXT: Record<RelationKind, string> = {
  'hands-work-to': 'hands work to',
  'waits-on': 'waits on',
  'blocked-by': 'is blocked by',
}

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog', pending: 'To do', in_progress: 'In progress', review: 'Review', waiting: 'Waiting', completed: 'Done',
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 min-w-[96px]">
      <div className={`text-lg font-semibold ${tone || 'text-gray-100'}`}>{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  )
}

interface Props {
  org: Organization
  nameOf: (agentId: string) => string
  presenceOf: (agentId: string) => AgentPresence
}

/** One organization: its agents, the work they hold, the projects it takes part in, and how the agents relate. */
export default function OrganizationView({ org, nameOf, presenceOf }: Props) {
  const [tab, setTab] = useState<Tab>('agents')
  const s = org.stats

  const byKind = useMemo(() => {
    const groups = new Map<string, OrgAgent[]>()
    for (const a of org.agents) groups.set(a.kind || 'other', [...(groups.get(a.kind || 'other') || []), a])
    return [...groups.entries()]
  }, [org.agents])

  const cardsByAgent = useMemo(() => {
    const m = new Map<string, OrgCardInput[]>()
    for (const c of org.cards) m.set(c.agentId, [...(m.get(c.agentId) || []), c])
    return [...m.entries()].sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])))
  }, [org.cards, nameOf])

  const tabs: Array<[Tab, string]> = [
    ['agents', `Agents (${s.agents})`], ['work', `Work (${s.open})`], ['projects', `Projects (${s.projects})`], ['relations', `Relations (${org.relations.length})`],
  ]

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        <Stat label="Agents" value={s.agents} />
        <Stat label="Open cards" value={s.open} />
        <Stat label="Waiting" value={s.waiting} tone={s.waiting ? 'text-amber-300' : undefined} />
        <Stat label="Waiting on you" value={s.waitingOnOperator} tone={s.waitingOnOperator ? 'text-orange-300' : undefined} />
        <Stat label="Blocked" value={s.blocked} tone={s.blocked ? 'text-red-300' : undefined} />
        <Stat label="Projects" value={s.projects} />
      </div>

      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 text-xs rounded-t ${tab === k ? 'bg-gray-800 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}>{label}</button>
        ))}
      </div>

      {tab === 'agents' && (
        <div className="space-y-4">
          {byKind.map(([kind, list]) => (
            <section key={kind}>
              <h3 className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">{kind}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map(a => {
                  const p = PRESENCE_STYLE[presenceOf(a.id)]
                  return (
                    <div key={a.id} className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.dot}`} title={p.title} />
                        <span className="text-sm text-gray-100 truncate">{a.display}</span>
                        <span className={`ml-auto text-[10px] ${p.text}`}>{p.label}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                        {a.role || 'no role'}{a.orgs.length > 1 ? ` · also ${a.orgs.filter(o => o !== org.id).join(', ')}` : ''} · {a.hostName}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        {a.open} open{a.waiting ? ` · ${a.waiting} waiting` : ''}{a.blocked ? ` · ${a.blocked} blocked` : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          {org.agents.length === 0 && <p className="text-sm text-gray-500">No agents carry this organization.</p>}
        </div>
      )}

      {tab === 'work' && (
        <div className="space-y-4">
          {cardsByAgent.map(([agentId, cards]) => (
            <section key={agentId}>
              <h3 className="text-xs text-gray-300 mb-1">{nameOf(agentId)} <span className="text-gray-600">· {cards.length}</span></h3>
              <ul className="space-y-1">
                {cards.map(c => (
                  <li key={c.id} className="flex items-center gap-2 text-xs rounded border border-gray-800 bg-gray-900/40 px-2.5 py-1.5">
                    <span className="text-gray-200 truncate">{c.subject}</span>
                    {c.projectName && <span className="text-[10px] text-indigo-300 bg-indigo-500/10 rounded px-1.5">{c.projectName}</span>}
                    {c.status === 'waiting' && <Hourglass className="w-3 h-3 text-amber-400" />}
                    <span className="ml-auto text-[10px] text-gray-500">{STATUS_LABEL[c.status] || c.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {cardsByAgent.length === 0 && <p className="text-sm text-gray-500">No open cards.</p>}
        </div>
      )}

      {tab === 'projects' && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {org.projects.map(p => (
            <div key={`${p.hostId}:${p.id}`} className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
              <div className="text-sm text-gray-100 truncate">{p.name}</div>
              <div className="text-[11px] text-gray-400">
                {p.ownerAgentId ? `owner ${nameOf(p.ownerAgentId)}` : 'no owner'} · {p.status}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">{p.counts.open} open · {p.counts.waiting} waiting · {p.counts.total} in all</div>
            </div>
          ))}
          {org.projects.length === 0 && <p className="text-sm text-gray-500">No projects.</p>}
        </div>
      )}

      {tab === 'relations' && (
        <ul className="space-y-1">
          {org.relations.map((r: OrgRelation) => (
            <li key={`${r.kind}|${r.from}|${r.to}`} className="flex items-center gap-2 text-xs rounded border border-gray-800 bg-gray-900/40 px-2.5 py-1.5">
              <Link2 className="w-3 h-3 text-gray-500" />
              <span className="text-gray-200">{nameOf(r.from)}</span>
              <span className="text-gray-500">{RELATION_TEXT[r.kind]}</span>
              <span className="text-gray-200">{nameOf(r.to)}</span>
              <span className="text-[10px] text-gray-500">× {r.count}</span>
              {r.crossOrg && <span className="ml-auto text-[10px] text-sky-300 bg-sky-500/10 rounded px-1.5">crosses organizations</span>}
            </li>
          ))}
          {org.relations.length === 0 && <p className="text-sm text-gray-500">No hand-offs, waits or blocks between agents.</p>}
        </ul>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-gray-600 pt-2">
        <Lock className="w-3 h-3" />
        {org.id === NO_ORG ? 'Agents without an org: tag.' : 'Built from each agent’s org:, kind: and role: tags.'} An organization is shown, not enforced: it does not limit who can read what.
      </p>
    </div>
  )
}
