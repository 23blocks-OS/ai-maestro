'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, Plus } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import { useAgents } from '@/hooks/useAgents'
import { useProjects } from '@/hooks/useProjects'
import { useOrgs, type MeshOrg } from '@/hooks/useOrgs'
import { useOpenTasks } from '@/hooks/useOpenTasks'
import { useSessionActivity } from '@/hooks/useSessionActivity'
import { usePeople } from '@/hooks/usePeople'
import OrganizationView from '@/components/org/OrganizationView'
import { VersionChecker } from '@/components/VersionChecker'
import { agentDisplay, buildOrganizations, type OrgAgentInput, type OrgPersonInput } from '@/lib/organization'

/**
 * Organization: every agent, card and project of one company across every host, grouped by the
 * agents' org: tags. Same data as the Matrix and Projects pages; a host that is down is named.
 */
export default function OrganizationPage() {
  const { hosts } = useHosts()
  const { agents } = useAgents()
  const { cards, unreachable: cardsDown, loading } = useOpenTasks(hosts)
  const { projects, unreachable: projectsDown } = useProjects(hosts)
  const { orgs: records, defaultOrg, unreachable: orgsDown, refresh: refreshOrgs } = useOrgs(hosts)
  const { people: directory, unreachable: peopleDown } = usePeople(hosts)
  const { presenceOf } = useSessionActivity()
  const [selected, setSelected] = useState<string | null>(null)
  // null = closed; { id: null } = new organization; { id } = edit that record
  const [form, setForm] = useState<{ id: string | null; newId?: string; name: string; description: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const hostName = useCallback((id: string) => hosts.find(h => h.id === id)?.name || id, [hosts])

  const agentInputs = useMemo<OrgAgentInput[]>(
    () => agents.map(a => ({ id: a.id, name: a.name, label: a.label, alias: a.alias, hostId: a.hostId, hostName: hostName(a.hostId), tags: a.tags, humanManager: a.humanManager, managerAgentId: a.managerAgentId })),
    [agents, hostName],
  )
  const personInputs = useMemo<OrgPersonInput[]>(
    () => directory.map(p => ({ id: p.id, displayName: p.displayName, title: p.title, role: p.role, hostId: p.hostId, hostName: p.hostName, orgs: p.orgs, managerPersonId: p.managerPersonId })),
    [directory],
  )
  const orgs = useMemo(() => buildOrganizations(
    agentInputs,
    cards.map(c => ({ ...c, scope: c.scope })),
    projects.map(p => ({ id: p.id, name: p.name, status: p.status, ownerAgentId: p.ownerAgentId, hostId: p.hostId, counts: p.counts })),
    records,
    defaultOrg,
    personInputs,
  ), [agentInputs, cards, projects, records, defaultOrg, personInputs])

  const names = useMemo(() => new Map(agentInputs.map(a => [a.id, agentDisplay(a)])), [agentInputs])
  const nameOf = useCallback((id: string) => names.get(id) || cards.find(c => c.agentId === id)?.agentName || id.slice(0, 8), [names, cards])
  const agentById = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents])
  const presence = useCallback((id: string) => {
    const a = agentById.get(id)
    return a ? presenceOf(a) : 'offline'
  }, [agentById, presenceOf])

  const org = orgs.find(o => o.id === selected) || orgs[0] || null
  const makeDefault = async (id: string) => {
    try {
      const res = await fetch('/api/orgs/default', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) throw new Error()
      await refreshOrgs()
    } catch {
      setFormError('Could not save the default organization')
    }
  }
  const down = [...new Set([...cardsDown, ...projectsDown, ...orgsDown, ...peopleDown])]

  // A new record is stored on this host; an existing one is changed on the host that holds it
  const save = async () => {
    if (!form) return
    setFormError(null)
    const record: MeshOrg | undefined = form.id ? records.filter(r => r.id === form.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] : undefined
    const base = record ? record.hostBase : ''
    try {
      const res = await fetch(form.id ? `${base}/api/orgs/${encodeURIComponent(form.id)}` : '/api/orgs', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description, ...(!form.id && form.newId ? { id: form.newId } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || 'Could not save the organization')
      setForm(null)
      setSelected(data.organization?.id || form.id)
      await refreshOrgs()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the organization')
    }
  }

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
        <button onClick={() => { setFormError(null); setForm({ id: null, name: '', description: '' }) }}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700" title="Add an organization record">
          <Plus className="w-3 h-3" /> New
        </button>
        <div className="flex gap-1 overflow-x-auto">
          {orgs.map(o => (
            <button key={o.id} onClick={() => setSelected(o.id)}
              className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${org?.id === o.id ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
              {o.name} <span className="opacity-70">{o.stats.agents}</span>
            </button>
          ))}
        </div>
      </header>

      {down.length > 0 && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20">
          Could not reach {down.join(', ')}: its cards and projects are missing from this view.
        </div>
      )}

      {form && (
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/60 flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-gray-400">Name
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus
              className="block mt-0.5 w-48 text-xs bg-gray-800 text-gray-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-600" />
          </label>
          <label className="text-[11px] text-gray-400 flex-1 min-w-[200px]">Description
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="block mt-0.5 w-full text-xs bg-gray-800 text-gray-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-600" />
          </label>
          <button onClick={save} disabled={!form.name.trim()} className="text-xs px-3 py-1 rounded bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50">Save</button>
          <button onClick={() => setForm(null)} className="text-xs px-3 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">Cancel</button>
          {!form.id && !form.newId && <span className="basis-full text-[10px] text-gray-500">The id (the value of the agents&apos; org: tag) comes from the name: &quot;3Metas&quot; is org:3metas. Stored on this host.</span>}
          {formError && <span className="basis-full text-xs text-red-300">{formError}</span>}
        </div>
      )}

      {!org
        ? <div className="flex-1 flex items-center justify-center text-sm text-gray-500">{loading ? 'Loading the organization…' : 'No agents yet. Tag an agent with org:<company> to group it.'}</div>
        : <OrganizationView key={org.id} org={org} nameOf={nameOf} presenceOf={presence}
            onMakeDefault={() => makeDefault(org.id)}
            onEdit={() => { setFormError(null); setForm({ id: org.hasRecord ? org.id : null, newId: org.hasRecord ? undefined : org.id, name: org.hasRecord ? org.name : org.id, description: org.description || '' }) }} />}
      <VersionChecker />
    </div>
  )
}
