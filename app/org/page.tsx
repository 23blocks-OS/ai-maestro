'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2 } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import { useAgents } from '@/hooks/useAgents'
import { useProjects } from '@/hooks/useProjects'
import { useOpenTasks } from '@/hooks/useOpenTasks'
import { useSessionActivity } from '@/hooks/useSessionActivity'
import OrganizationView from '@/components/org/OrganizationView'
import { VersionChecker } from '@/components/VersionChecker'
import { agentDisplay, buildOrganizations, type OrgAgentInput } from '@/lib/organization'

/**
 * Organization: every agent, card and project of one company across every host, grouped by the
 * agents' org: tags. Same data as the Matrix and Projects pages; a host that is down is named.
 */
export default function OrganizationPage() {
  const { hosts } = useHosts()
  const { agents } = useAgents()
  const { cards, unreachable: cardsDown, loading } = useOpenTasks(hosts)
  const { projects, unreachable: projectsDown } = useProjects(hosts)
  const { presenceOf } = useSessionActivity()
  const [selected, setSelected] = useState<string | null>(null)

  const hostName = useCallback((id: string) => hosts.find(h => h.id === id)?.name || id, [hosts])

  const agentInputs = useMemo<OrgAgentInput[]>(
    () => agents.map(a => ({ id: a.id, name: a.name, label: a.label, alias: a.alias, hostId: a.hostId, hostName: hostName(a.hostId), tags: a.tags })),
    [agents, hostName],
  )
  const orgs = useMemo(() => buildOrganizations(
    agentInputs,
    cards.map(c => ({ ...c, scope: c.scope })),
    projects.map(p => ({ id: p.id, name: p.name, status: p.status, ownerAgentId: p.ownerAgentId, hostId: p.hostId, counts: p.counts })),
  ), [agentInputs, cards, projects])

  const names = useMemo(() => new Map(agentInputs.map(a => [a.id, agentDisplay(a)])), [agentInputs])
  const nameOf = useCallback((id: string) => names.get(id) || cards.find(c => c.agentId === id)?.agentName || id.slice(0, 8), [names, cards])
  const agentById = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents])
  const presence = useCallback((id: string) => {
    const a = agentById.get(id)
    return a ? presenceOf(a) : 'offline'
  }, [agentById, presenceOf])

  const org = orgs.find(o => o.id === selected) || orgs[0] || null
  const down = [...new Set([...cardsDown, ...projectsDown])]

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 flex-shrink-0">
        <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200" aria-label="Back to the dashboard">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Building2 className="w-4 h-4 text-sky-400" />
        <h1 className="text-sm font-medium">Organization</h1>
        <span className="text-xs text-gray-500">agents, work and relations of a whole company</span>
        <div className="flex-1" />
        <div className="flex gap-1 overflow-x-auto">
          {orgs.map(o => (
            <button key={o.id} onClick={() => setSelected(o.id)}
              className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${org?.id === o.id ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
              {o.id} <span className="opacity-70">{o.stats.agents}</span>
            </button>
          ))}
        </div>
      </header>

      {down.length > 0 && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20">
          Could not reach {down.join(', ')}: its cards and projects are missing from this view.
        </div>
      )}

      {!org
        ? <div className="flex-1 flex items-center justify-center text-sm text-gray-500">{loading ? 'Loading the organization…' : 'No agents yet. Tag an agent with org:<company> to group it.'}</div>
        : <OrganizationView key={org.id} org={org} nameOf={nameOf} presenceOf={presence} />}
      <VersionChecker />
    </div>
  )
}
