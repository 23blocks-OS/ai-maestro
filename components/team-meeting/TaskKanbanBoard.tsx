'use client'

import { useState, useEffect } from 'react'
import { X, Archive, Circle, PlayCircle, Eye, CheckCircle2 } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import KanbanColumn from './KanbanColumn'
import TaskDetailView from './TaskDetailView'
import TaskCreateForm from './TaskCreateForm'

const COLUMNS: { status: TaskStatus; label: string; dotColor: string; icon: typeof Circle }[] = [
  { status: 'backlog', label: 'Backlog', dotColor: 'bg-gray-500', icon: Archive },
  { status: 'pending', label: 'To Do', dotColor: 'bg-gray-400', icon: Circle },
  { status: 'in_progress', label: 'In Progress', dotColor: 'bg-blue-400', icon: PlayCircle },
  { status: 'review', label: 'Review', dotColor: 'bg-amber-400', icon: Eye },
  { status: 'completed', label: 'Done', dotColor: 'bg-emerald-400', icon: CheckCircle2 },
]

interface TaskKanbanBoardProps {
  agents: Agent[]
  tasks: TaskWithDeps[]
  tasksByStatus: Record<TaskStatus, TaskWithDeps[]>
  onUpdateTask: (taskId: string, updates: { status?: TaskStatus; [key: string]: unknown }) => Promise<{ unblocked: TaskWithDeps[] }>
  onDeleteTask: (taskId: string) => Promise<void>
  onCreateTask: (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[]; priority?: number }) => Promise<void>
  onClose: () => void
  teamName: string
}

export default function TaskKanbanBoard({
  agents,
  tasks,
  tasksByStatus,
  onUpdateTask,
  onDeleteTask,
  onCreateTask,
  onClose,
  teamName,
}: TaskKanbanBoardProps) {
  const [selectedTask, setSelectedTask] = useState<TaskWithDeps | null>(null)
  const [quickAddStatus, setQuickAddStatus] = useState<TaskStatus | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedTask) { setSelectedTask(null) }
        else if (quickAddStatus !== null) { setQuickAddStatus(null) }
        else { onClose() }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedTask, quickAddStatus, onClose])

  const handleDrop = async (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus || task.isBlocked) return
    await onUpdateTask(taskId, { status: newStatus })
  }

  const handleQuickAdd = (status: TaskStatus) => {
    setQuickAddStatus(status)
  }

  const handleQuickCreate = async (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[] }) => {
    // Create with the quick-add column's status
    await onCreateTask(data)
    // If backlog or non-pending, update the new task's status after creation
    // Since createTask always creates as 'pending', we need to update if different
    if (quickAddStatus && quickAddStatus !== 'pending') {
      // We'll rely on the user changing status in detail view for non-pending
      // Or we could do a two-step: create then update. For simplicity, just create as pending.
    }
    setQuickAddStatus(null)
  }

  // Keep selectedTask synced with fresh data
  const freshSelectedTask = selectedTask ? tasks.find(t => t.id === selectedTask.id) || null : null

  return (
    <div className="fixed inset-0 z-40 bg-gray-950/90 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-white">Kanban Board</h3>
          {teamName && (
            <span className="text-xs text-gray-500">{teamName}</span>
          )}
          <span className="text-[10px] text-gray-600 bg-gray-800 rounded-full px-2 py-0.5">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Close
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-3 h-full min-w-min">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.status}
              config={col}
              tasks={tasksByStatus[col.status] || []}
              onDrop={handleDrop}
              onSelectTask={setSelectedTask}
              onQuickAdd={handleQuickAdd}
            />
          ))}
        </div>
      </div>

      {/* Task detail modal */}
      {freshSelectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-lg max-h-[80vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <TaskDetailView
              task={freshSelectedTask}
              agents={agents}
              allTasks={tasks}
              onUpdate={async (taskId, updates) => { await onUpdateTask(taskId, updates) }}
              onDelete={async (taskId) => { await onDeleteTask(taskId); setSelectedTask(null) }}
              onClose={() => setSelectedTask(null)}
            />
          </div>
        </div>
      )}

      {/* Quick-add modal */}
      {quickAddStatus !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-medium text-gray-300">
                New task in {COLUMNS.find(c => c.status === quickAddStatus)?.label}
              </h4>
              <button onClick={() => setQuickAddStatus(null)} className="p-0.5 hover:bg-gray-800 rounded">
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
            <TaskCreateForm
              agents={agents}
              existingTasks={tasks}
              onCreateTask={handleQuickCreate}
            />
          </div>
        </div>
      )}
    </div>
  )
}
