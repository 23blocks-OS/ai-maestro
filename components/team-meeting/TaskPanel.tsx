'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import TaskCard from './TaskCard'
import TaskCreateForm from './TaskCreateForm'
import TaskDetailView from './TaskDetailView'

interface TaskPanelProps {
  agents: Agent[]
  tasks: TaskWithDeps[]
  pendingTasks: TaskWithDeps[]
  inProgressTasks: TaskWithDeps[]
  completedTasks: TaskWithDeps[]
  onCreateTask: (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[] }) => Promise<void>
  onUpdateTask: (taskId: string, updates: { subject?: string; description?: string; status?: TaskStatus; assigneeAgentId?: string | null; blockedBy?: string[] }) => Promise<{ unblocked: TaskWithDeps[] }>
  onDeleteTask: (taskId: string) => Promise<void>
}

export default function TaskPanel({
  agents, tasks, pendingTasks, inProgressTasks, completedTasks,
  onCreateTask, onUpdateTask, onDeleteTask,
}: TaskPanelProps) {
  const [selectedTask, setSelectedTask] = useState<TaskWithDeps | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({ completed: true })

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
        {/* In Progress */}
        {inProgressTasks.length > 0 && (
          <TaskSection
            title="In Progress"
            count={inProgressTasks.length}
            collapsed={!!collapsedSections.in_progress}
            onToggle={() => toggleSection('in_progress')}
          >
            {inProgressTasks.map(t => (
              <TaskCard key={t.id} task={t} onSelect={setSelectedTask} onStatusChange={handleStatusChange} />
            ))}
          </TaskSection>
        )}

        {/* Pending */}
        <TaskSection
          title="Pending"
          count={pendingTasks.length}
          collapsed={!!collapsedSections.pending}
          onToggle={() => toggleSection('pending')}
        >
          {pendingTasks.length === 0 ? (
            <p className="text-[11px] text-gray-600 px-3 py-2">No pending tasks</p>
          ) : (
            pendingTasks.map(t => (
              <TaskCard key={t.id} task={t} onSelect={setSelectedTask} onStatusChange={handleStatusChange} />
            ))
          )}
        </TaskSection>

        {/* Completed */}
        {completedTasks.length > 0 && (
          <TaskSection
            title="Completed"
            count={completedTasks.length}
            collapsed={!!collapsedSections.completed}
            onToggle={() => toggleSection('completed')}
          >
            {completedTasks.map(t => (
              <TaskCard key={t.id} task={t} onSelect={setSelectedTask} onStatusChange={handleStatusChange} />
            ))}
          </TaskSection>
        )}
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
