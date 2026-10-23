'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Globe, Loader2, AlertCircle, RefreshCw, FlaskConical } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import { useAgents } from '@/hooks/useAgents'
import { useOrgs } from '@/hooks/useOrgs'
import { useSessionActivity } from '@/hooks/useSessionActivity'
import { useExperiment } from '@/hooks/useExperiment'
import { VersionChecker } from '@/components/VersionChecker'
import { PRESENCE_STYLE, type AgentPresence } from '@/lib/agent-presence'
import { agentDisplay } from '@/lib/organization'
import { groupAgents, type WorldGroupMode } from '@/lib/world/grouping'
import type { WorldFigure } from '@/components/world/WorldScene'

// The 3D scene is client-only and code-split, like Zoom's heavy views
const WorldScene = dynamic(() => import('@/components/world/WorldScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
    </div>
  ),
})

const MODES: Array<{ id: WorldGroupMode; label: string; title: string }> = [
  { id: 'host', label: 'Host', title: 'One island per host, orgs pooled' },
  { id: 'org', label: 'Org', title: 'One island per organization, hosts pooled' },
  { id: 'org-host', label: 'Org + Host', title: 'One island per (org, host): 23blocks the org, its hosts the islands' },
]

const PRESENCE_RANK: Record<AgentPresence, number> = { 'needs-you': 0, working: 1, ready: 2, offline: 3 }

/**
 * World: every host / org as an island and its agents as figures on it.
 * Same data as Zoom and Org (useAgents across hosts, org records, the shared
 * presenceOf) — this page only groups it (lib/world/grouping.ts) and draws it.
 */
function WorldContent() {
  const { hosts } = useHosts()
  const { agents, loading, error, refreshAgents } = useAgents()
  const { orgs: records } = useOrgs(hosts)
  const { presenceOf } = useSessionActivity()
  const [mode, setMode] = useState<WorldGroupMode>('org-host')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const orgNames = useMemo(() => {
    const newest = new Map<string, { name: string; updatedAt: string }>()
    for (const r of records) {
      const prev = newest.get(r.id)
      if (!prev || r.updatedAt > prev.updatedAt) newest.set(r.id, { name: r.name, updatedAt: r.updatedAt })
    }
    return Object.fromEntries([...newest].map(([id, r]) => [id, r.name]))
  }, [records])

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
        <span className="hidden whitespace-nowrap text-xs text-gray-400 sm:inline">{agents.length} agents · {groups.length} islands</span>
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
          <div className="relative min-h-[320px] flex-1">
            <WorldScene groups={groups} selectedKey={selectedKey} onSelect={setSelectedKey} figures={figures} />
          </div>

          <aside className="w-full flex-shrink-0 overflow-y-auto border-t border-gray-800 lg:w-96 lg:border-l lg:border-t-0">
            {!selected ? (
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
