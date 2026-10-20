'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, LayoutGrid } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import { useAgents } from '@/hooks/useAgents'
import { useOpenTasks, type MeshCard } from '@/hooks/useOpenTasks'
import MatrixView from '@/components/matrix/MatrixView'
import TaskDetailModal from '@/components/matrix/TaskDetailModal'
import { VersionChecker } from '@/components/VersionChecker'
import { commentOnCard, deleteCard, patchCard, retryCardComment } from '@/lib/task-client'
import { QUADRANTS, type Quadrant } from '@/types/task'

/**
 * The Eisenhower matrix of every agent on every host: what matters now, across the whole mesh.
 * Same cards as each agent's Board tab, read from the host that holds them.
 */
export default function MatrixPage() {
  const { hosts } = useHosts()
  const { agents } = useAgents()
  const { cards, unreachable, loading, refresh } = useOpenTasks(hosts)
  const [agentFilter, setAgentFilter] = useState('')
  const [onlyWaitingOnMe, setOnlyWaitingOnMe] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const agentOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of cards) seen.set(`${c.hostId}:${c.agentId}`, `${c.agentName}${hosts.length > 1 ? ` (${c.hostName})` : ''}`)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [cards, hosts.length])

  const shown = cards.filter(c =>
    (!agentFilter || `${c.hostId}:${c.agentId}` === agentFilter) &&
    (!onlyWaitingOnMe || (c.status === 'waiting' && c.waitingOn === 'juan'))
  )
  const selected = selectedId ? shown.find(c => c.id === selectedId) || null : null

  const place = async (card: MeshCard, q: Quadrant | null) => {
    setError(null)
    try {
      await patchCard(card.hostBase, card, q ? { urgent: QUADRANTS[q].urgent, important: QUADRANTS[q].important } : { urgent: null, important: null })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place the card')
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 flex-shrink-0">
        <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200" aria-label="Back to the dashboard">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <LayoutGrid className="w-4 h-4 text-blue-400" />
        <h1 className="text-sm font-medium">Matrix</h1>
        <span className="text-xs text-gray-500">what matters now, across every agent</span>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={onlyWaitingOnMe} onChange={e => setOnlyWaitingOnMe(e.target.checked)} />
          Waiting on me
        </label>
        <select
          value={agentFilter}
          onChange={e => setAgentFilter(e.target.value)}
          className="text-xs bg-gray-800 text-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-600"
          aria-label="Agent"
        >
          <option value="">All agents</option>
          {agentOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <span className="text-[10px] text-gray-600 bg-gray-800 rounded-full px-2 py-0.5">{shown.length} open</span>
      </header>

      {unreachable.length > 0 && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20">
          Could not reach {unreachable.join(', ')}: its cards are missing from this view.
        </div>
      )}
      {error && <div className="px-4 py-2 text-xs text-red-300 bg-red-500/10 border-b border-red-500/20">{error}</div>}

      {loading && cards.length === 0
        ? <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Loading the matrix…</div>
        : <MatrixView cards={shown} showAgent onPlace={place} onSelect={c => setSelectedId(c.id)} />}

      {selected && (
        <TaskDetailModal
          task={selected}
          agents={agents}
          allTasks={cards}
          onUpdate={async (t, updates) => { await patchCard((t as MeshCard).hostBase, t, updates); await refresh() }}
          onDelete={async t => { await deleteCard((t as MeshCard).hostBase, t); await refresh() }}
          onClose={() => setSelectedId(null)}
          onAddComment={async (t, text, deliver) => { const r = await commentOnCard((t as MeshCard).hostBase, t, text, deliver); await refresh(); return r }}
          onRetryComment={async (t, id) => { const r = await retryCardComment((t as MeshCard).hostBase, t, id); await refresh(); return r }}
        />
      )}
      <VersionChecker />
    </div>
  )
}
