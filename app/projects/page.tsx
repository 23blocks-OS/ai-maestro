'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FolderGit2, Plus } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import { useAgents } from '@/hooks/useAgents'
import { useProjects, type MeshProject } from '@/hooks/useProjects'
import ProjectBoardPanel from '@/components/projects/ProjectBoardPanel'
import { VersionChecker } from '@/components/VersionChecker'
import { isSelfHost } from '@/lib/host-kind'

const STATUS_DOT: Record<string, string> = { active: 'bg-emerald-400', paused: 'bg-amber-400', done: 'bg-gray-500' }

/**
 * Projects: named pieces of work that cross agents and teams. A project lives on its owner agent's host
 * and its cards can go to any agent on any host. This page lists the projects of every host and opens one board.
 */
export default function ProjectsPage() {
  const { hosts } = useHosts()
  const { agents } = useAgents()
  const { projects, unreachable, loading, refresh } = useProjects(hosts)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [hostId, setHostId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const key = (p: MeshProject) => `${p.hostBase}|${p.id}`
  const selected = projects.find(p => key(p) === selectedKey) || null
  const hostChoices = hosts.filter(h => h.enabled !== false)
  const chosenHost = hostChoices.find(h => h.id === hostId) || hostChoices.find(isSelfHost) || hostChoices[0]
  // The owner must be an agent of the host that will store the project
  const ownerChoices = useMemo(() => agents.filter(a => chosenHost && a.hostId === chosenHost.id), [agents, chosenHost])

  const create = async () => {
    setError(null)
    if (!name.trim()) { setError('Give the project a name'); return }
    const base = chosenHost && !isSelfHost(chosenHost) ? chosenHost.url.replace(/\/$/, '') : ''
    const res = await fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || undefined, ownerAgentId: ownerId || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data?.message || 'Could not create the project'); return }
    setCreating(false); setName(''); setDescription(''); setOwnerId('')
    await refresh()
    setSelectedKey(`${base}|${data.project.id}`)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 flex-shrink-0">
        <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200" aria-label="Back to the dashboard">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <FolderGit2 className="w-4 h-4 text-blue-400" />
        <h1 className="text-sm font-medium">Projects</h1>
        <span className="text-xs text-gray-500">work that crosses agents and teams</span>
        <div className="flex-1" />
        <button onClick={() => setCreating(c => !c)} className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded" data-testid="new-project">
          <Plus className="w-3.5 h-3.5" />New project
        </button>
      </header>

      {unreachable.length > 0 && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20">
          Could not reach {unreachable.join(', ')}: its projects are missing from this list.
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
        <aside className="w-72 flex-shrink-0 border-r border-gray-800 overflow-y-auto" data-testid="project-list">
          {creating && (
            <div className="p-3 border-b border-gray-800 space-y-2" data-testid="project-form">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Project name" maxLength={80} autoFocus
                className="w-full text-xs bg-gray-800 text-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-600" data-testid="project-name" />
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is it? (optional)" rows={2}
                className="w-full text-xs bg-gray-800 text-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-gray-600" />
              {hostChoices.length > 1 && (
                <select value={chosenHost?.id || ''} onChange={e => { setHostId(e.target.value); setOwnerId('') }}
                  className="w-full text-xs bg-gray-800 text-gray-300 rounded px-2 py-1" aria-label="Host that stores the project">
                  {hostChoices.map(h => <option key={h.id} value={h.id}>Stored on {h.name || h.id}</option>)}
                </select>
              )}
              <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
                className="w-full text-xs bg-gray-800 text-gray-300 rounded px-2 py-1" aria-label="Owner agent">
                <option value="">No owner yet</option>
                {ownerChoices.map(a => <option key={a.id} value={a.id}>{a.label || a.name || a.alias}</option>)}
              </select>
              <p className="text-[10px] text-gray-600">A project is stored on its owner&apos;s host. Its cards can go to any agent on any host.</p>
              {error && <p className="text-[11px] text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button onClick={create} className="text-xs px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded" data-testid="create-project">Create</button>
                <button onClick={() => setCreating(false)} className="text-xs px-2 py-1 text-gray-400 hover:text-gray-200">Cancel</button>
              </div>
            </div>
          )}
          {loading && projects.length === 0
            ? <p className="p-4 text-xs text-gray-500">Loading projects…</p>
            : projects.length === 0
              ? <p className="p-4 text-xs text-gray-500">No projects yet. A project is a piece of work with an owner, a status and its own board, for work that crosses agents and teams.</p>
              : projects.map(p => (
                <button key={key(p)} onClick={() => setSelectedKey(key(p))} data-testid="project-row"
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-800/60 hover:bg-gray-900 ${selectedKey === key(p) ? 'bg-gray-900' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[p.status] || 'bg-gray-500'}`} />
                    <span className="text-xs font-medium text-gray-200 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                    <span>{p.counts.open} open</span>
                    {p.counts.waiting > 0 && <span className="text-orange-300/80">{p.counts.waiting} waiting</span>}
                    <span className="flex-1" />
                    <span className="truncate">{p.hostName}</span>
                  </div>
                </button>
              ))}
        </aside>

        {selected
          ? <ProjectBoardPanel key={key(selected)} project={selected} agents={agents} onChanged={refresh} onDeleted={() => { setSelectedKey(null); void refresh() }} />
          : <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Pick a project, or make a new one.</div>}
      </div>
      <VersionChecker />
    </div>
  )
}
