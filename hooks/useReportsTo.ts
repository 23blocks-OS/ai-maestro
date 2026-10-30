'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSelfHost } from '@/lib/host-kind'
import { collectPeople, type PeopleTarget } from '@/lib/people-fanout'
import { suggestManager, wouldLoop } from '@/lib/agent-manager'
import { managerName, type PersonLite } from '@/lib/manager-links'
import type { ManagerView } from '@/components/ReportsTo'
import type { Agent } from '@/types/agent'
import type { Host } from '@/types/host'

type AgentRow = Pick<Agent, 'id' | 'name' | 'alias' | 'label' | 'owner' | 'humanManager' | 'managerAgentId' | 'hostId'> & { hostName?: string }

/**
 * What the "Reports to" editor needs for one agent: the People directory and the agent list, loaded once
 * when the profile opens (no polling: a profile must not add a fleet-wide poller), and a save that PATCHes
 * the agent on its own host.
 */
export function useReportsTo(agent: Agent | null, baseUrl: string, onSaved: (patch: Partial<Agent>) => void) {
  const [people, setPeople] = useState<PersonLite[]>([])
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const agentId = agent?.id

  useEffect(() => {
    if (!agentId) return
    let gone = false
    const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(8000) })
    ;(async () => {
      const hosts: Host[] = await get('/api/hosts').then(r => r.json()).then(d => d.hosts || []).catch(() => [])
      const targets: PeopleTarget[] = (hosts.length ? hosts.filter(h => h.enabled !== false) : [{ id: 'local', name: 'This host', url: '', isSelf: true } as Host])
        .map(h => ({ base: isSelfHost(h) ? '' : h.url.replace(/\/$/, ''), hostId: h.id, hostName: h.name || h.id }))
      const [p, a] = await Promise.all([
        collectPeople(targets, get).then(r => r.people).catch(() => []),
        get('/api/agents/unified').then(r => r.json()).then(d => (d.agents || []).map((x: { agent?: AgentRow; sourceHost?: { name?: string } }) => ({ ...(x.agent ?? x), hostName: x.sourceHost?.name ?? (x.agent ?? (x as AgentRow)).hostId }))).catch(() => []),
      ])
      if (gone) return
      setPeople(p.map(x => ({ id: x.id, displayName: x.displayName, email: x.email })))
      setAgents(a)
      setLoaded(true)
    })()
    return () => { gone = true }
  }, [agentId])

  const nameOf = useCallback((id: string) => {
    const a = agents.find(x => x.id.toLowerCase() === id.toLowerCase())
    return a ? (a.label || a.name || a.alias || id.slice(0, 8)) : 'an agent on another host'
  }, [agents])

  const view: ManagerView | null = useMemo(() => {
    if (!agent) return null
    const sg = suggestManager(agent, agents, people)
    return {
      humanManager: agent.humanManager,
      humanManagerName: managerName(agent.humanManager, people),
      people: people.map(p => ({ id: p.id, name: p.email ? `${p.displayName} · ${p.email}` : p.displayName })).sort((x, y) => x.name.localeCompare(y.name)),
      manager: agent.managerAgentId ? { id: agent.managerAgentId, name: nameOf(agent.managerAgentId) } : null,
      reports: agents.filter(a => a.managerAgentId?.toLowerCase() === agent.id.toLowerCase()).map(a => ({ id: a.id, name: nameOf(a.id) })),
      suggestion: sg ? { ...sg, label: sg.managerAgentId ? `${nameOf(sg.managerAgentId)} (agent)` : `${managerName(sg.humanManager, people)} (person)` } : null,
      choices: agents.filter(a => a.id !== agent.id).map(a => ({ id: a.id, name: `${nameOf(a.id)} · ${a.hostName || a.hostId}` })).sort((x, y) => x.name.localeCompare(y.name)),
    }
  }, [agent, agents, people, nameOf])

  const save = useCallback(async (patch: { humanManager?: string | null; managerAgentId?: string | null }): Promise<string | null> => {
    if (!agent) return 'No agent'
    const managerOf = (id: string) => agents.find(a => a.id.toLowerCase() === id)?.managerAgentId?.toLowerCase()
    if (patch.managerAgentId && wouldLoop(agent.id.toLowerCase(), patch.managerAgentId.toLowerCase(), managerOf)) return 'That would make a loop of managers'
    try {
      const res = await fetch(`${baseUrl}/api/agents/${agent.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return data?.message || data?.error || `Could not save (${res.status})`
      }
      onSaved({
        ...(patch.humanManager !== undefined ? { humanManager: patch.humanManager || undefined } : {}),
        ...(patch.managerAgentId !== undefined ? { managerAgentId: patch.managerAgentId || undefined } : {}),
      })
      return null
    } catch {
      return 'Could not reach this agent\'s host'
    }
  }, [agent, agents, baseUrl, onSaved])

  return { view, loaded, save }
}
