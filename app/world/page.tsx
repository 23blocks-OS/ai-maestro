'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Globe, Loader2, AlertCircle, RefreshCw, FlaskConical, Search, ChevronRight } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import { useAgents } from '@/hooks/useAgents'
import { useOrgs } from '@/hooks/useOrgs'
import { useSessionActivity } from '@/hooks/useSessionActivity'
import { useExperiment } from '@/hooks/useExperiment'
import { useWorldEvents } from '@/hooks/useWorldEvents'
import { VersionChecker } from '@/components/VersionChecker'
import { PRESENCE_STYLE, type AgentPresence } from '@/lib/agent-presence'
import { agentDisplay } from '@/lib/organization'
import { groupAgents, isSandboxAgent, type WorldGroupMode } from '@/lib/world/grouping'
import type { WorldFigure } from '@/components/world/WorldScene'
import { PULSE_MS, type WorldPulse } from '@/lib/world/pulse'

// The 3D scene is client-only and code-split, like Zoom's heavy views
const WorldScene = dynamic(() => import('@/components/world/WorldScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
    </div>
  ),
})

// Org first: a company's agents live on several machines, so an org is one island and the hosts
// are only where its agents happen to run. "By location" is the other cut. (The org + host mode
// stays in lib/world/grouping.ts; it is no longer offered, because an org spans locations.)
const MODES: Array<{ id: WorldGroupMode; label: string; title: string }> = [
  { id: 'org', label: 'By org', title: 'One island per organization, whatever machines its agents run on' },
  { id: 'host', label: 'By location', title: 'One island per host: where the agents run' },
]

type StatusFilter = 'all' | AgentPresence
const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'needs-you', label: 'Needs you' },
  { id: 'working', label: 'Working' },
  { id: 'ready', label: 'Ready' },
  { id: 'offline', label: 'Offline' },
]

const PRESENCE_RANK: Record<AgentPresence, number> = { 'needs-you': 0, working: 1, ready: 2, offline: 3 }

/**
 * World: every host / org as an island and its agents as figures on it.
 * Same data as Zoom and Org (useAgents across hosts, org records, the shared
 * presenceOf) — this page only groups it (lib/world/grouping.ts) and draws it.
 */
function WorldContent() {
  const { hosts } = useHosts()
  const { agents: allAgents, loading, error, refreshAgents } = useAgents()
  const { orgs: records } = useOrgs(hosts)
  const { presenceOf } = useSessionActivity()
  const [mode, setMode] = useState<WorldGroupMode>('org')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const orgNames = useMemo(() => {
    const newest = new Map<string, { name: string; updatedAt: string }>()
    for (const r of records) {
      const prev = newest.get(r.id)
      if (!prev || r.updatedAt > prev.updatedAt) newest.set(r.id, { name: r.name, updatedAt: r.updatedAt })
    }
    return Object.fromEntries([...newest].map(([id, r]) => [id, r.name]))
  }, [records])

  // Test and probe sessions (org:sandbox) are not part of the world
  const agents = useMemo(() => allAgents.filter(a => !isSandboxAgent(a)), [allAgents])
  const hiddenCount = allAgents.length - agents.length

  const agentById = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents])

  const groups = useMemo(
    () => groupAgents(agents, mode, {
      hosts,
      orgNames,
      presenceOf: a => presenceOf(agentById.get(a.id) ?? a),
    }),
    [agents, mode, hosts, orgNames, agentById, presenceOf],
  )

  const selected = groups.find(g => g.key === selectedKey) || null

  const figures: WorldFigure[] = useMemo(
    () => (selected ? selected.agents.map(a => ({ id: a.id, presence: presenceOf(agentById.get(a.id) ?? a) })) : []),
    [selected, agentById, presenceOf],
  )

  const panelAgents = useMemo(() => {
    if (!selected) return []
    return selected.agents
      .map(a => ({ agent: agentById.get(a.id) ?? a, presence: presenceOf(agentById.get(a.id) ?? a) }))
      .sort((x, y) => PRESENCE_RANK[x.presence] - PRESENCE_RANK[y.presence]
        || agentDisplay(x.agent).localeCompare(agentDisplay(y.agent)))
  }, [selected, agentById, presenceOf])

  // Search and status filter: they narrow what the list shows and dim the islands with no match;
  // the counts stay the true ones.
  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    const out: Array<{ agent: (typeof agents)[number]; presence: AgentPresence; groupKey: string }> = []
    for (const g of groups) {
      for (const a of g.agents) {
        const agent = agentById.get(a.id) ?? a
        const presence = presenceOf(agent)
        if (filter !== 'all' && presence !== filter) continue
        if (q && !`${agentDisplay(agent)} ${agent.name ?? ''} ${g.label} ${agent.hostName ?? ''}`.toLowerCase().includes(q)) continue
        out.push({ agent: agent as (typeof agents)[number], presence, groupKey: g.key })
      }
    }
    return out
  }, [groups, agentById, presenceOf, filter, q])
  const filtering = filter !== 'all' || q !== ''
  const matchedKeys = useMemo(() => new Set(matches.map(m => m.groupKey)), [matches])
  // With an island selected every other island dims, so the one you are looking at stands out;
  // with a search or status filter and nothing selected, the islands with no match dim instead.
  const dimmed = useMemo(() => {
    if (selectedKey) return new Set(groups.filter(g => g.key !== selectedKey).map(g => g.key))
    if (filtering) return new Set(groups.filter(g => !matchedKeys.has(g.key)).map(g => g.key))
    return undefined
  }, [selectedKey, filtering, groups, matchedKeys])

  // Live messages: each delivery plays as a pulse between the two agents' islands, and the last few
  // are listed. Keys come from the agents' own island, so it follows whatever grouping is on.
  const events = useWorldEvents(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (events.length === 0) return
    const timer = setInterval(() => setTick(t => t + 1), 400)
    const stop = setTimeout(() => clearInterval(timer), PULSE_MS + 600)
    return () => { clearInterval(timer); clearTimeout(stop) }
  }, [events])
  const groupOfAgent = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups) for (const a of g.agents) m.set(a.id, g.key)
    return m
  }, [groups])
  const groupOfName = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of agents) {
      const key = groupOfAgent.get(a.id)
      if (!key) continue
      for (const n of [a.name, a.alias]) if (n) m.set(n.toLowerCase(), key)
    }
    return m
  }, [agents, groupOfAgent])
  const pulses: WorldPulse[] = useMemo(() => {
    void tick
    const now = Date.now()
    const out: WorldPulse[] = []
    for (const e of events) {
      if (now - e.seenAt > PULSE_MS) continue
      const from = groupOfName.get(e.from.toLowerCase())
      const to = groupOfAgent.get(e.toAgentId)
      if (from && to) out.push({ id: e.id, from, to, t0: e.seenAt })
    }
    return out
  }, [events, groupOfName, groupOfAgent, tick])
  const nameOfAgent = useMemo(() => new Map(agents.map(a => [a.id, agentDisplay(a)])), [agents])
  const recent = useMemo(() => [...events].reverse().slice(0, 6), [events])

  const needsYouKeys = useMemo(() => groups.filter(g => g.counts.needsYou > 0).map(g => g.key), [groups])
  const jumpToNeedsYou = () => {
    if (needsYouKeys.length === 0) return
    const i = selectedKey ? needsYouKeys.indexOf(selectedKey) : -1
    setSelectedKey(needsYouKeys[(i + 1) % needsYouKeys.length])
  }

  const offlineHosts = hosts.filter(h => h.enabled === false)

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-gray-100">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-gray-800 px-4 py-2.5">
        <Link href="/" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200" aria-label="Back to the dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Globe className="h-4 w-4 text-teal-400" />
        <h1 className="text-sm font-medium">World</h1>
        <span className="hidden text-xs text-gray-500 sm:inline">hosts and orgs as islands, agents as figures</span>
        <div className="flex-1" />
        <span className="hidden whitespace-nowrap text-xs text-gray-400 sm:inline">{agents.length} agents · {groups.length} islands{hiddenCount > 0 ? ` · ${hiddenCount} test hidden` : ''}</span>
        {needsYouKeys.length > 0 && (
          <button onClick={jumpToNeedsYou} className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs text-orange-400 hover:bg-orange-500/25" title="Fly to the next island with an agent waiting for you">
            {groups.reduce((n, g) => n + g.counts.needsYou, 0)} need you <ChevronRight className="h-3 w-3" />
          </button>
        )}
        <div className="flex gap-1" role="group" aria-label="Group islands by">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setSelectedKey(null) }}
              title={m.title}
              className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${mode === m.id ? 'bg-teal-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button onClick={refreshAgents} className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white" title="Refresh agents">
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      {offlineHosts.length > 0 && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          Offline: {offlineHosts.map(h => h.name || h.id).join(', ')} — their islands are dark.
        </div>
      )}

      {loading && agents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        </div>
      ) : error && agents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
            <p className="mb-4 text-gray-400">{error.message}</p>
            <button onClick={refreshAgents} className="rounded-lg bg-teal-600 px-4 py-2 text-white transition-colors hover:bg-teal-700">Try Again</button>
          </div>
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          No agents yet. Start an agent from the dashboard and its island appears here.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="relative min-h-[320px] flex-1" data-pulses={pulses.length}>
            <WorldScene groups={groups} selectedKey={selectedKey} onSelect={setSelectedKey} figures={figures} dimmed={dimmed} pulses={pulses} />
          </div>

          <aside className="w-full flex-shrink-0 overflow-y-auto border-t border-gray-800 lg:w-96 lg:border-l lg:border-t-0">
            <div className="space-y-2 border-b border-gray-800 px-4 py-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-500" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search an agent, org or host"
                  aria-label="Search agents"
                  className="w-full rounded-lg border border-gray-800 bg-gray-900 py-1.5 pl-8 pr-3 text-sm text-gray-100 placeholder-gray-600 focus:border-teal-600 focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
                {FILTERS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`rounded-full px-2.5 py-0.5 text-xs ${filter === f.id ? 'bg-teal-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {filtering && !selected ? (
              <ul className="divide-y divide-gray-800/60">
                {matches.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-500">No agent matches.</li>}
                {matches.slice(0, 200).map(({ agent, presence, groupKey }) => (
                  <li key={agent.id}>
                    <button onClick={() => setSelectedKey(groupKey)} className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-gray-900">
                      <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${PRESENCE_STYLE[presence].dot}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-100">{agentDisplay(agent)}</span>
                        <span className="block truncate text-xs text-gray-500">{groups.find(g => g.key === groupKey)?.label} · {agent.hostName || agent.hostId}</span>
                      </span>
                      <span className={`text-xs ${PRESENCE_STYLE[presence].text}`}>{PRESENCE_STYLE[presence].label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : !selected ? (
              <>
              {recent.length > 0 && (
                <div className="border-b border-gray-800 px-4 py-2.5">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Live messages</p>
                  <ul className="space-y-0.5">
                    {recent.map(e => (
                      <li key={e.id} className="truncate text-xs text-gray-400">
                        <span className="text-amber-400">●</span> {e.from} → {nameOfAgent.get(e.toAgentId) ?? e.toAgentId.slice(0, 8)}
                        <span className="text-gray-600"> · {Math.max(0, Math.round((Date.now() - e.ts) / 1000))}s ago</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="divide-y divide-gray-800/60">
                {groups.map(g => (
                  <li key={g.key}>
                    <button onClick={() => setSelectedKey(g.key)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-900">
                      <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${g.offline ? 'bg-gray-600' : g.counts.needsYou > 0 ? 'bg-orange-500' : 'bg-teal-500'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-100">{g.label}</span>
                        <span className="block text-xs text-gray-500">
                          {g.counts.working} working · {g.counts.ready} ready · {g.counts.offline} offline
                          {g.offline ? ' · host offline' : g.offlineHostIds.length > 0 ? ` · ${g.offlineHostIds.length} host${g.offlineHostIds.length > 1 ? 's' : ''} offline` : ''}
                        </span>
                      </span>
                      {g.counts.needsYou > 0 && (
                        <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs text-orange-400">{g.counts.needsYou} need{g.counts.needsYou > 1 ? '' : 's'} you</span>
                      )}
                      <span className="text-xs text-gray-500">{g.counts.total}</span>
                    </button>
                  </li>
                ))}
              </ul>
              </>
            ) : (
              <div>
                <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
                  <button onClick={() => setSelectedKey(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200" aria-label="Back to all islands">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-medium">{selected.label}</h2>
                    <p className="text-xs text-gray-500">
                      {selected.counts.total} agents · {selected.counts.working} working · {selected.counts.needsYou} needs you · {selected.counts.ready} ready · {selected.counts.offline} offline
                      {selected.offline ? ' · host offline' : ''}
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-gray-800/60">
                  {panelAgents.map(({ agent, presence }) => (
                    <li key={agent.id}>
                      <a
                        href={`/zoom/agent?id=${encodeURIComponent(agent.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 px-4 py-2 hover:bg-gray-900"
                      >
                        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${PRESENCE_STYLE[presence].dot}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-gray-100">{agentDisplay(agent)}</span>
                          <span className="block truncate text-xs text-gray-500">
                            {agent.hostName || agent.hostId}
                          </span>
                        </span>
                        <span className={`text-xs ${PRESENCE_STYLE[presence].text}`}>{PRESENCE_STYLE[presence].label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}
      <VersionChecker />
    </div>
  )
}

/**
 * World is a beta: the page opens only where Settings → Experiments turned it on.
 * The gate sits above WorldContent so a browser without the flag fetches nothing.
 */
export default function WorldPage() {
  const { enabled, ready } = useExperiment('world-view')

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    )
  }
  if (!enabled) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-6 text-center text-gray-300">
        <FlaskConical className="h-10 w-10 text-purple-400" />
        <h1 className="text-lg font-medium text-gray-100">World view is a beta</h1>
        <p className="max-w-md text-sm text-gray-400">
          Turn it on in Settings → Experiments to see your hosts and organizations as islands, with their agents on them.
        </p>
        <div className="flex gap-2">
          <Link href="/settings" className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white transition-colors hover:bg-purple-700">Open Settings</Link>
          <Link href="/" className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-700">Back to the dashboard</Link>
        </div>
      </div>
    )
  }
  return <WorldContent />
}
