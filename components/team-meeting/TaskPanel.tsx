'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import type { KanbanColumnConfig } from '@/types/team'
import { DEFAULT_KANBAN_COLUMNS } from '@/types/team'
import TaskCard from './TaskCard'
import TaskCreateForm from './TaskCreateForm'
import TaskDetailView from './TaskDetailView'

interface TaskPanelProps {
  agents: Agent[]
  tasks: TaskWithDeps[]
  tasksByStatus: Record<string, TaskWithDeps[]>
  kanbanColumns?: KanbanColumnConfig[]
  onCreateTask: (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[] }) => Promise<void>
  onUpdateTask: (taskId: string, updates: { subject?: string; description?: string; status?: TaskStatus; assigneeAgentId?: string | null; blockedBy?: string[] }) => Promise<{ unblocked: TaskWithDeps[] }>
  onDeleteTask: (taskId: string) => Promise<void>
}

export default function TaskPanel({
  agents, tasks, tasksByStatus, kanbanColumns,
  onCreateTask, onUpdateTask, onDeleteTask,
}: TaskPanelProps) {
  const [selectedTask, setSelectedTask] = useState<TaskWithDeps | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({ completed: true })

  const columns = kanbanColumns || DEFAULT_KANBAN_COLUMNS

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    await onUpdateTask(taskId, { status })
  }

  // Clear selection if the selected task was deleted
  const currentSelected = selectedTask ? tasks.find(t => t.id === selectedTask.id) : null
  useEffect(() => {
    if (selectedTask && !currentSelected) {
      setSelectedTask(null)
    }
  }, [selectedTask, currentSelected])

  // If a task is selected, show detail view
  if (currentSelected) {
    return (
      <TaskDetailView
        task={currentSelected}
        agents={agents}
        allTasks={tasks}
        onUpdate={async (taskId, updates) => { await onUpdateTask(taskId, updates) }}
        onDelete={onDeleteTask}
        onClose={() => setSelectedTask(null)}
        kanbanColumns={kanbanColumns}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <TaskCreateForm
        agents={agents}
        existingTasks={tasks}
        onCreateTask={onCreateTask}
      />

      <div className="flex-1 overflow-y-auto">
        {columns.map(col => {
          const colTasks = tasksByStatus[col.id] || []
          if (colTasks.length === 0 && collapsedSections[col.id]) return null
          return (
            <div key={col.id}>
              <button
                onClick={() => toggleSection(col.id)}
                className="flex items-center gap-1 w-full text-left px-2 py-1 hover:bg-gray-800/50 rounded"
              >
                {collapsedSections[col.id] ? <ChevronRight className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
                <span className="text-[11px] font-medium text-gray-400">{col.label}</span>
                <span className="text-[10px] text-gray-600 ml-1">{colTasks.length}</span>
              </button>
              {!collapsedSections[col.id] && colTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onSelect={setSelectedTask}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaskSection({
  title,
  count,
  collapsed,
  onToggle,
  children,
}: {
  title: string
  count: number
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider hover:bg-gray-800/30 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {title}
        <span className="text-gray-600 ml-auto">{count}</span>
      </button>
      {!collapsed && <div className="px-1">{children}</div>}
    </div>
  )
}
