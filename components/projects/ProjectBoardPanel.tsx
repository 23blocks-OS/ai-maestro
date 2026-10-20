'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useProjectBoard } from '@/hooks/useProjectBoard'
import TaskKanbanBoard from '@/components/team-meeting/TaskKanbanBoard'
import type { MeshProject } from '@/hooks/useProjects'
import type { Agent } from '@/types/agent'
import type { ProjectStatus } from '@/types/project'

const STATUSES: ProjectStatus[] = ['active', 'paused', 'done']

/** One project: its settings on top and its board below. Every call goes to the host that stores the project. */
export default function ProjectBoardPanel({ project, agents, onChanged, onDeleted }: {
  project: MeshProject
  agents: Agent[]
  onChanged: () => void
  onDeleted: () => void
}) {
  const { tasks, tasksByStatus, error, createTask, updateTask, deleteTask, addComment, retryComment } = useProjectBoard(project.id, project.hostBase)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const owner = agents.find(a => a.id === project.ownerAgentId)

  const patch = async (body: Record<string, unknown>) => {
    setProblem(null)
    const res = await fetch(`${project.hostBase}/api/projects/${project.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setProblem(d?.message || 'Could not change the project'); return }
    onChanged()
  }

  const remove = async () => {
    const res = await fetch(`${project.hostBase}/api/projects/${project.id}`, { method: 'DELETE' })
    if (!res.ok) { setProblem('Could not delete the project'); return }
    onDeleted()
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0" data-testid="project-board">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 flex-shrink-0 flex-wrap">
        <h2 className="text-sm font-medium text-white truncate">{project.name}</h2>
        <span className="text-[10px] text-gray-500 bg-gray-800 rounded-full px-2 py-0.5" title="The host that stores this project">{project.hostName}</span>
        <span className="text-xs text-gray-500">Owner: {owner ? (owner.label || owner.name) : project.ownerAgentId ? project.ownerAgentId.slice(0, 8) : 'nobody'}</span>
        <div className="flex-1" />
        <select
          value={project.status}
          onChange={e => patch({ status: e.target.value })}
          className="text-xs bg-gray-800 text-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-600"
          aria-label="Project status"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {confirmDelete ? (
          <span className="flex items-center gap-2 text-[11px]">
            <span className="text-red-400">Delete the project and its cards?</span>
            <button onClick={remove} className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded">Yes</button>
            <button onClick={() => setConfirmDelete(false)} className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">No</button>
          </span>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 text-[11px] text-red-400/70 hover:text-red-400">
            <Trash2 className="w-3 h-3" />Delete
          </button>
        )}
      </div>
      {project.description && <p className="px-4 py-2 text-xs text-gray-400 border-b border-gray-800/60">{project.description}</p>}
      {(error || problem) && <div className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20">{problem || error}</div>}
      <TaskKanbanBoard
        title="Project board"
        teamName={project.name}
        agents={agents}
        tasks={tasks}
        tasksByStatus={tasksByStatus}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTask}
        onCreateTask={createTask}
        onAddComment={addComment}
        onRetryComment={retryComment}
      />
    </div>
  )
}
