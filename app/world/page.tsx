'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Globe, Loader2, AlertCircle, RefreshCw, FlaskConical, Search, ChevronRight, Activity, ListChecks, Share2, History } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import { useAgents } from '@/hooks/useAgents'
import { useOrgs } from '@/hooks/useOrgs'
import { useSessionActivity } from '@/hooks/useSessionActivity'
import { useExperiment } from '@/hooks/useExperiment'
import { useWorldEvents, type WorldEventView } from '@/hooks/useWorldEvents'
import { useWorldHistory } from '@/hooks/useWorldHistory'
import { useWorldTeams } from '@/hooks/useWorldTeams'
import { useOpenTasks } from '@/hooks/useOpenTasks'
import { VersionChecker } from '@/components/VersionChecker'
import { PRESENCE_STYLE, type AgentPresence } from '@/lib/agent-presence'
import { agentDisplay } from '@/lib/organization'
import { groupAgents, isSandboxAgent, type WorldGroupMode } from '@/lib/world/grouping'
import type { WorldFigure, WorldLens } from '@/components/world/WorldScene'
import {
  eventsBetween, eventsWithin, idByName, liftTies, outsideTies, talkTies, taskTies, tiesAmong, waitingOnYou, workByAgent,
  type AgentTie,
} from '@/lib/world/relations'
import { AgentPanel, ReplayBar, TeamsList, TiesList, WaitingList, type PairRow, type Partner, type ReplayState } from '@/components/world/WorldPanels'
import { PULSE_MS, type WorldPulse } from '@/lib/world/pulse'
import Minimap from '@/components/world/Minimap'

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

const LENSES: Array<{ id: WorldLens; label: string; title: string; icon: typeof Activity }> = [
  { id: 'status', label: 'Status', title: 'Who is working, ready, waiting for you or offline', icon: Activity },
  { id: 'work', label: 'Work', title: 'What is on each agent\'s plate, and what is waiting on you', icon: ListChecks },
  { id: 'relations', label: 'Relations', title: 'Who works with whom: messages and shared cards', icon: Share2 },
]

const localDate = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  // Three levels: the overview, an island (its buildings), a building (its agents)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedBuildingKey, setSelectedBuildingKey] = useState<string | null>(null)
  const [lens, setLens] = useState<WorldLens>('status')
  // A team lit up: everyone else dims
  const [teamId, setTeamId] = useState<string | null>(null)
  // How far back the relations lens looks, in hours
  const [spanH, setSpanH] = useState(24)
  const [replay, setReplay] = useState<ReplayState | null>(null)
  const [replayRange, setReplayRange] = useState(6)
  const [replayEvents, setReplayEvents] = useState<WorldEventView[]>([])
  const cursorRef = useRef(0)
  const today = localDate()

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
  const selectedBuilding = selected?.buildings.find(b => b.key === selectedBuildingKey) || null
  const selectIsland = (key: string | null) => { setSelectedKey(key); setSelectedBuildingKey(null); setSelectedAgentId(null) }
  const selectBuilding = (key: string) => { setSelectedBuildingKey(key); setSelectedAgentId(null) }
  // One step up: a building to its island, an island to the overview
  const goBack = () => { if (selectedBuildingKey) { setSelectedBuildingKey(null); setSelectedAgentId(null) } else selectIsland(null) }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target instanceof HTMLInputElement)) return
      if (selectedBuildingKey) { setSelectedBuildingKey(null); setSelectedAgentId(null) } else if (selectedKey) selectIsland(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, selectedBuildingKey])
  // The open card belongs to the building you are in: leave it (or regroup) and it closes
  const openAgentId = selectedBuilding?.agents.some(a => a.id === selectedAgentId) ? selectedAgentId : null
  const openAgent = openAgentId ? agentById.get(openAgentId) ?? null : null

  const panelAgents = useMemo(() => {
    if (!selectedBuilding) return []
    return selectedBuilding.agents
      .map(a => ({ agent: agentById.get(a.id) ?? a, presence: presenceOf(agentById.get(a.id) ?? a) }))
      .sort((x, y) => PRESENCE_RANK[x.presence] - PRESENCE_RANK[y.presence]
        || agentDisplay(x.agent).localeCompare(agentDisplay(y.agent)))
  }, [selectedBuilding, agentById, presenceOf])

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

  // Teams, and the work on every host
  const allTeams = useWorldTeams(hosts, true)
  // Only teams with at least two agents you can see (a team of hidden test agents is not part of the world), the biggest first
  const teams = useMemo(
    () => allTeams
      .map(t => ({ ...t, agentIds: t.agentIds.filter(id => agentById.has(id)) }))
      .filter(t => t.agentIds.length >= 2)
      // Two teams with the same name and the same people are one (leftovers of a test run are common)
      .filter((t, i, all) => all.findIndex(o => o.name === t.name && [...o.agentIds].sort().join() === [...t.agentIds].sort().join()) === i)
      .sort((a, b) => b.agentIds.length - a.agentIds.length || a.name.localeCompare(b.name)),
    [allTeams, agentById],
  )
  const team = teams.find(t => t.id === teamId) ?? null
  const { cards: openCards } = useOpenTasks(hosts)
  const visibleCards = useMemo(() => openCards.filter(c => agentById.has(c.assigneeAgentId || c.agentId)), [openCards, agentById])
  const work = useMemo(() => workByAgent(visibleCards, today), [visibleCards, today])
  const waiting = useMemo(() => waitingOnYou(visibleCards), [visibleCards])

  // The spotlight: who is lit up. A search or status filter, a team, or both (their overlap); null = everyone.
  // Islands, buildings and people outside it dim, so the part of the world you asked about stands out.
  const spotlight = useMemo(() => {
    let ids: Set<string> | null = filtering ? new Set(matches.map(m => m.agent.id)) : null
    if (team) {
      const members = new Set(team.agentIds)
      ids = ids ? new Set([...ids].filter(id => members.has(id))) : members
    }
    return ids
  }, [filtering, matches, team])
  const spotlightKeys = useMemo(() => {
    if (!spotlight) return null
    const keys = new Set<string>()
    for (const g of groups) if (g.agents.some(a => spotlight.has(a.id))) keys.add(g.key)
    return keys
  }, [spotlight, groups])
  // With an island selected every other island dims, so the one you are looking at stands out;
  // with a spotlight and nothing selected, the islands with nobody in it dim instead.
  const dimmed = useMemo(() => {
    if (selectedKey) return new Set(groups.filter(g => g.key !== selectedKey).map(g => g.key))
    if (spotlightKeys) return new Set(groups.filter(g => !spotlightKeys.has(g.key)).map(g => g.key))
    return undefined
  }, [selectedKey, spotlightKeys, groups])
  const dimmedBuildings = useMemo(() => {
    if (!spotlight || !selected) return undefined
    return new Set(selected.buildings.filter(b => !b.agents.some(a => spotlight.has(a.id))).map(b => b.key))
  }, [spotlight, selected])

  const figures: WorldFigure[] = useMemo(
    () => (selectedBuilding
      ? selectedBuilding.agents.map(a => ({ id: a.id, presence: presenceOf(agentById.get(a.id) ?? a), dim: spotlight ? !spotlight.has(a.id) : false }))
      : []),
    [selectedBuilding, agentById, presenceOf, spotlight],
  )

  // Live messages: each delivery plays as a pulse between the two agents' islands, and the last few
  // are listed. Keys come from the agents' own island, so it follows whatever grouping is on.
  const liveEvents = useWorldEvents(true)
  // In a replay the pulses come from the past, played back; otherwise they are live
  const events = replay ? replayEvents : liveEvents
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
  const buildingOfAgent = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups) for (const b of g.buildings) for (const a of b.agents) m.set(a.id, b.key)
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
    // A fast replay can deliver hundreds at once: the latest few are enough to read
    return out.slice(-14)
  }, [events, groupOfName, groupOfAgent, tick])
  const nameOfAgent = useMemo(() => new Map(agents.map(a => [a.id, agentDisplay(a)])), [agents])
  // What floats over a selected agent (in a headset there is no side panel to read)
  const labelOfAgent = useMemo(
    () => new Map(agents.map(a => [a.id, `${agentDisplay(a)} · ${PRESENCE_STYLE[presenceOf(a)].label}`])),
    [agents, presenceOf],
  )
  const recent = useMemo(() => [...events].reverse().slice(0, 6), [events])

  // ---- Relations: who messages whom (the last day of deliveries) and who shares cards ----
  const history = useWorldHistory(true)
  const byName = useMemo(() => idByName(agents), [agents])
  // Minute resolution: during a replay the clock moves every tick, the ties only need to follow it by the minute
  const untilMinute = replay ? Math.floor(replay.cursor / 60_000) : null
  const allTies: AgentTie[] = useMemo(() => {
    const until = untilMinute !== null ? (untilMinute + 1) * 60_000 : Date.now()
    const talk = talkTies(eventsWithin(history.events, until, spanH * 3_600_000), byName)
    const resolve = (ref: string) => (agentById.has(ref) ? ref : byName.get(ref.toLowerCase()))
    const all = [...talk, ...taskTies(visibleCards, resolve)]
    // With a team (or a search) lit up, the relations are the ones that touch it
    return spotlight ? all.filter(t => spotlight.has(t.a) || spotlight.has(t.b)) : all
  }, [history.events, spanH, untilMinute, byName, visibleCards, agentById, spotlight])
  const islandLift = useMemo(() => liftTies(allTies, groupOfAgent), [allTies, groupOfAgent])
  const buildingLift = useMemo(() => {
    if (!selected) return { arcs: [], within: new Map<string, number>() }
    const here = new Map<string, string>()
    for (const [id, building] of buildingOfAgent) if (groupOfAgent.get(id) === selected.key) here.set(id, building)
    return liftTies(allTies, here)
  }, [allTies, selected, buildingOfAgent, groupOfAgent])
  const agentTies = useMemo(
    () => (selectedBuilding ? tiesAmong(allTies, new Set(selectedBuilding.agents.map(a => a.id))) : []),
    [allTies, selectedBuilding],
  )
  const sceneTies = useMemo(
    () => ({ islandArcs: islandLift.arcs, buildingArcs: buildingLift.arcs, agentTies }),
    [islandLift, buildingLift, agentTies],
  )
  const placeOfAgent = useCallback((id: string) => {
    const g = groups.find(x => x.key === groupOfAgent.get(id))
    const b = g?.buildings.find(x => x.key === buildingOfAgent.get(id))
    return g ? `${g.label}${b ? ` › ${b.label}` : ''}` : ''
  }, [groups, groupOfAgent, buildingOfAgent])
  const pairRows: PairRow[] = useMemo(() => {
    const m = new Map<string, PairRow>()
    for (const t of allTies) {
      const key = `${t.a}|${t.b}`
      const row = m.get(key) || { key, a: t.a, b: t.b, aName: nameOfAgent.get(t.a) ?? t.a.slice(0, 8), bName: nameOfAgent.get(t.b) ?? t.b.slice(0, 8), aPlace: placeOfAgent(t.a), bPlace: placeOfAgent(t.b), talk: 0, task: 0 }
      if (t.kind === 'talk') row.talk += t.weight
      else row.task += t.weight
      m.set(key, row)
    }
    return [...m.values()].sort((x, y) => (y.talk + y.task) - (x.talk + x.task)).slice(0, 8)
  }, [allTies, nameOfAgent, placeOfAgent])
  const groupLabel = useMemo(() => new Map(groups.map(g => [g.key, g.label])), [groups])
  const arcRows = useMemo(
    () => islandLift.arcs.slice(0, 5).map(a => ({ key: `${a.from}|${a.to}`, label: `${groupLabel.get(a.from) ?? a.from} ↔ ${groupLabel.get(a.to) ?? a.to}`, weight: a.weight })),
    [islandLift, groupLabel],
  )
  const partnersOf = (id: string): Partner[] => {
    const m = new Map<string, Partner>()
    for (const t of allTies) {
      if (t.a !== id && t.b !== id) continue
      const other = t.a === id ? t.b : t.a
      const row = m.get(other) || { id: other, name: nameOfAgent.get(other) ?? other.slice(0, 8), talk: 0, task: 0 }
      if (t.kind === 'talk') row.talk += t.weight
      else row.task += t.weight
      m.set(other, row)
    }
    return [...m.values()].sort((x, y) => (y.talk + y.task) - (x.talk + x.task))
  }
  const outside = useMemo(
    () => outsideTies(allTies, new Set(selectedBuilding?.agents.map(a => a.id) ?? [])),
    [allTies, selectedBuilding],
  )

  // Fly to an agent from anywhere: its island, its building, its card
  const goToAgent = (id: string) => {
    const gk = groupOfAgent.get(id)
    if (!gk) return
    setSelectedKey(gk)
    setSelectedBuildingKey(buildingOfAgent.get(id) ?? null)
    setSelectedAgentId(id)
  }

  // ---- Replay: the last hours of messages played back as pulses ----
  const startReplay = (hours = replayRange, speed = replay?.speed ?? 360) => {
    const start = Date.now() - hours * 3_600_000
    cursorRef.current = start
    setReplayEvents([])
    setReplay({ playing: true, cursor: start, start, speed })
  }
  useEffect(() => {
    if (!replay?.playing) return
    let last = Date.now()
    const speed = replay.speed
    const timer = setInterval(() => {
      const now = Date.now()
      const from = cursorRef.current
      const to = Math.min(now, from + (now - last) * speed)
      last = now
      cursorRef.current = to
      const fresh = eventsBetween(history.events, from, to)
      if (fresh.length) setReplayEvents(prev => [...prev, ...fresh.map(e => ({ ...e, seenAt: now }))].slice(-30))
      setReplay(r => (r ? { ...r, cursor: to, playing: to < now } : r))
    }, 200)
    return () => clearInterval(timer)
  }, [replay?.playing, replay?.speed, history.events])
  const replayCount = useMemo(
    () => (replay ? history.events.filter(e => e.ts >= replay.start).length : 0),
    [history.events, replay],
  )

  const needsYouKeys = useMemo(() => groups.filter(g => g.counts.needsYou > 0).map(g => g.key), [groups])
  const jumpToNeedsYou = () => {
    if (needsYouKeys.length === 0) return
    const i = selectedKey ? needsYouKeys.indexOf(selectedKey) : -1
    selectIsland(needsYouKeys[(i + 1) % needsYouKeys.length])
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
        <div className="flex gap-1" role="group" aria-label="What the world shows">
          {LENSES.map(l => (
            <button
              key={l.id}
              onClick={() => setLens(l.id)}
              title={l.title}
              aria-pressed={lens === l.id}
              className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${lens === l.id ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              <l.icon className="h-3 w-3" />{l.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => (replay ? setReplay(null) : startReplay())}
          title="Play the last hours of messages back as pulses"
          aria-pressed={!!replay}
          className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${replay ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
        >
          <History className="h-3 w-3" />Replay
        </button>
        <div className="flex gap-1" role="group" aria-label="Group islands by">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); selectIsland(null) }}
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
            <WorldScene groups={groups} selectedKey={selectedKey} selectedBuildingKey={selectedBuilding?.key ?? null} onSelect={selectIsland} onSelectBuilding={selectBuilding} figures={figures} dimmed={dimmed} dimmedBuildings={dimmedBuildings} pulses={pulses}
              lens={lens} work={work} ties={sceneTies}
              selectedAgentId={openAgentId} onSelectAgent={setSelectedAgentId} names={labelOfAgent}
              onBack={goBack} />
            <Minimap groups={groups} selectedKey={selectedKey} onSelect={selectIsland} />
            {replay && (
              <ReplayBar
                replay={replay}
                rangeH={replayRange}
                count={replayCount}
                loaded={history.loaded}
                onRange={h => { setReplayRange(h); startReplay(h) }}
                onToggle={() => {
                  if (replay.playing) setReplay({ ...replay, playing: false })
                  else if (replay.cursor >= Date.now() - 1500) startReplay()
                  else setReplay({ ...replay, playing: true })
                }}
                onSeek={t => { cursorRef.current = t; setReplayEvents([]); setReplay({ ...replay, cursor: t }) }}
                onSpeed={speed => setReplay({ ...replay, speed })}
                onClose={() => setReplay(null)}
              />
            )}
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
            {team && (
              <div className="flex items-center gap-2 border-b border-gray-800 bg-teal-900/20 px-4 py-2 text-xs text-teal-200">
                <span className="min-w-0 flex-1 truncate">Team <strong>{team.name}</strong> lit up · {team.agentIds.length} agents</span>
                <a href={`${team.hostBase}/team-meeting?meeting=new&team=${encodeURIComponent(team.id)}`} target="_blank" rel="noopener noreferrer"
                  className="rounded bg-teal-600 px-2 py-0.5 text-white hover:bg-teal-700">Meet</a>
                <button onClick={() => setTeamId(null)} className="rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-800">Clear</button>
              </div>
            )}
            {filtering && !selected ? (
              <ul className="divide-y divide-gray-800/60">
                {matches.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-500">No agent matches.</li>}
                {matches.slice(0, 200).map(({ agent, presence, groupKey }) => (
                  <li key={agent.id}>
                    <button onClick={() => { setSelectedKey(groupKey); setSelectedBuildingKey(buildingOfAgent.get(agent.id) ?? null); setSelectedAgentId(agent.id) }} className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-gray-900">
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
              <WaitingList cards={waiting} nameOf={id => nameOfAgent.get(id) ?? id.slice(0, 8)} placeOf={placeOfAgent} today={today} onGo={goToAgent} limit={lens === 'work' ? undefined : 4} />
              {lens === 'relations' && (
                <>
                  <TeamsList teams={teams} activeId={teamId} onPick={setTeamId} />
                  <TiesList pairs={pairRows} arcs={arcRows} spanH={spanH} onSpan={setSpanH} onGo={goToAgent} />
                </>
              )}
              {recent.length > 0 && (
                <div className="border-b border-gray-800 px-4 py-2.5">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">{replay ? 'Replay' : 'Live messages'}</p>
                  <ul className="space-y-0.5">
                    {recent.map(e => (
                      <li key={e.id} className="truncate text-xs text-gray-400">
                        <span className="text-amber-400">●</span> {e.from} → {nameOfAgent.get(e.toAgentId) ?? e.toAgentId.slice(0, 8)}
                        <span className="text-gray-600"> · {replay ? new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `${Math.max(0, Math.round((Date.now() - e.ts) / 1000))}s ago`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="divide-y divide-gray-800/60">
                {groups.map(g => (
                  <li key={g.key}>
                    <button onClick={() => selectIsland(g.key)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-900">
                      <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${g.offline ? 'bg-gray-600' : g.counts.needsYou > 0 ? 'bg-orange-500' : 'bg-teal-500'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-100">{g.label}</span>
                        <span className="block text-xs text-gray-500">
                          {g.counts.working} working · {g.counts.ready} ready · {g.counts.offline} offline
                          {lens === 'work' ? ` · ${g.agents.reduce((n, a) => n + (work.get(a.id)?.open ?? 0), 0)} open cards` : ''}
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
            ) : !selectedBuilding ? (
              <div>
                <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
                  <button onClick={goBack} className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200" aria-label="Back to all islands">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-medium">{selected.label}</h2>
                    <p className="text-xs text-gray-500">
                      {selected.buildings.length} building{selected.buildings.length === 1 ? '' : 's'} · {selected.counts.total} agents · {selected.counts.working} working · {selected.counts.needsYou} needs you
                      {selected.offline ? ' · host offline' : ''}
                    </p>
                  </div>
                </div>
                <p className="px-4 pt-3 text-xs text-gray-500">
                  {selected.mode === 'org' ? 'One building per host this organization runs on.' : 'One building per organization running on this host.'} Click a building to go inside.
                </p>
                <ul className="divide-y divide-gray-800/60">
                  {selected.buildings.map(b => (
                    <li key={b.key}>
                      <button onClick={() => selectBuilding(b.key)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-900">
                        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${b.offline ? 'bg-gray-600' : b.counts.needsYou > 0 ? 'bg-orange-500' : 'bg-teal-500'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-gray-100">{b.label}</span>
                          <span className="block text-xs text-gray-500">
                            {b.counts.working} working · {b.counts.ready} ready · {b.counts.offline} offline{b.offline ? ' · host offline' : ''}
                          </span>
                        </span>
                        {b.counts.needsYou > 0 && (
                          <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs text-orange-400">{b.counts.needsYou} need{b.counts.needsYou > 1 ? '' : 's'} you</span>
                        )}
                        <span className="text-xs text-gray-500">{b.counts.total}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
                  <button onClick={goBack} className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200" aria-label="Back to the island">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] text-gray-500">{selected.label} ›</p>
                    <h2 className="truncate text-sm font-medium">{selectedBuilding.label}</h2>
                    <p className="text-xs text-gray-500">
                      {selectedBuilding.counts.total} agents · {selectedBuilding.counts.working} working · {selectedBuilding.counts.needsYou} needs you · {selectedBuilding.counts.ready} ready · {selectedBuilding.counts.offline} offline
                      {selectedBuilding.offline ? ' · host offline' : ''}
                    </p>
                  </div>
                </div>
                {openAgent && (
                  <AgentPanel
                    agent={openAgent}
                    name={agentDisplay(openAgent)}
                    presence={presenceOf(openAgent)}
                    place={`${selected?.label} › ${selectedBuilding?.label}`}
                    work={work.get(openAgent.id)}
                    cards={visibleCards.filter(c => (c.assigneeAgentId || c.agentId) === openAgent.id)}
                    partners={partnersOf(openAgent.id)}
                    teams={teams.filter(t => t.agentIds.includes(openAgent.id))}
                    today={today}
                    onClose={() => setSelectedAgentId(null)}
                    onGo={goToAgent}
                    onSpotlightTeam={setTeamId}
                  />
                )}
                <ul className="divide-y divide-gray-800/60">
                  {panelAgents.map(({ agent, presence }) => (
                    <li key={agent.id}>
                      <button
                        onClick={() => setSelectedAgentId(agent.id)}
                        className={`flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-gray-900 ${agent.id === openAgentId ? 'bg-gray-900' : ''}`}
                      >
                        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${PRESENCE_STYLE[presence].dot}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-gray-100">{agentDisplay(agent)}</span>
                          <span className="block truncate text-xs text-gray-500">
                            {agent.hostName || agent.hostId}
                            {lens === 'work' && (work.get(agent.id)?.open ?? 0) > 0 ? ` · ${work.get(agent.id)!.open} open${work.get(agent.id)!.waitingOnYou ? ` · ${work.get(agent.id)!.waitingOnYou} for you` : ''}` : ''}
                            {lens === 'relations' && (outside.get(agent.id) ?? 0) > 0 ? ` · ${outside.get(agent.id)} link${outside.get(agent.id) === 1 ? '' : 's'} outside` : ''}
                          </span>
                        </span>
                        <span className={`text-xs ${PRESENCE_STYLE[presence].text}`}>{PRESENCE_STYLE[presence].label}</span>
                      </button>
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
