'use client'

import { useState } from 'react'
import { useAgentBoard } from '@/hooks/useAgentBoard'
import { useHosts } from '@/hooks/useHosts'
import MatrixView, { type MatrixCard } from '@/components/matrix/MatrixView'
import TaskDetailModal from '@/components/matrix/TaskDetailModal'
import { QUADRANTS, type Quadrant } from '@/types/task'
import type { Agent } from '@/types/agent'

/**
 * The Matrix tab: this agent's open cards on the Eisenhower matrix. The same cards as the Board tab
 * (own + team cards assigned to it), read from the agent's own host; placing a card changes the same two fields.
 */
export default function AgentMatrixPanel({ agent, agents, hostUrl }: { agent: Agent; agents: Agent[]; hostUrl: string }) {
  const { hosts } = useHosts()
  const { tasks, error, loading, updateTask, deleteTask, addComment, retryComment } = useAgentBoard(agent.id, hostUrl, hosts, [agent.name, agent.alias, agent.label].filter((n): n is string => !!n))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const open = tasks.filter(t => t.status !== 'completed')
  const selected = selectedId ? open.find(t => t.id === selectedId) || null : null

  const place = async (card: MatrixCard, q: Quadrant | null) => {
    await updateTask(card.id, q ? { urgent: QUADRANTS[q].urgent, important: QUADRANTS[q].important } : { urgent: null, important: null })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="agent-matrix">
      {error && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20">{error}. The cards below may be out of date.</div>
      )}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-shrink-0">
        <h3 className="text-sm font-medium text-white">Matrix</h3>
        <span className="text-xs text-gray-500">{agent.label || agent.name || agent.alias}</span>
        <span className="text-[10px] text-gray-600 bg-gray-800 rounded-full px-2 py-0.5">{open.length} open</span>
      </div>
      {loading && tasks.length === 0 && !error
        ? <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Loading the matrix…</div>
        : <MatrixView cards={open} onPlace={place} onSelect={c => setSelectedId(c.id)} />}
      {selected && (
        <TaskDetailModal
          task={selected}
          agents={agents}
          allTasks={tasks}
          onUpdate={async (t, updates) => { await updateTask(t.id, updates) }}
          onDelete={async t => { await deleteTask(t.id) }}
          onClose={() => setSelectedId(null)}
          onAddComment={addComment}
          onRetryComment={retryComment}
        />
      )}
    </div>
  )
}
