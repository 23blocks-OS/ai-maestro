'use client'

import { useState, useEffect } from 'react'
import TaskKanbanBoard from '@/components/team-meeting/TaskKanbanBoard'
import type { Agent } from '@/types/agent'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import type { KanbanColumnConfig } from '@/types/team'

interface TeamKanbanSectionProps {
  teamId: string
  teamName: string
  agents: Agent[]
  teamAgentIds: string[]
  // Tasks data passed from parent (already loaded at page level, avoids duplicate fetch)
  tasks: TaskWithDeps[]
  tasksByStatus: Record<string, TaskWithDeps[]>
  createTask: (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[]; priority?: number; status?: string; labels?: string[] }) => Promise<void>
  updateTask: (taskId: string, updates: { status?: TaskStatus; [key: string]: unknown }) => Promise<{ unblocked: TaskWithDeps[] }>
  deleteTask: (taskId: string) => Promise<void>
}

export default function TeamKanbanSection({
  teamId, teamName, agents, teamAgentIds,
  tasks, tasksByStatus, createTask, updateTask, deleteTask,
}: TeamKanbanSectionProps) {
  // Fetch kanban columns from team config (inherits GitHub Project columns when linked)
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumnConfig[] | undefined>(undefined)
  useEffect(() => {
    if (!teamId) return
    fetch(`/api/teams/${teamId}/kanban-config`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.columns?.length) setKanbanColumns(data.columns)
      })
      .catch(() => {})
  }, [teamId])

  // Filter agents to team members only
  const teamAgents = agents.filter(a => teamAgentIds.includes(a.id))

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TaskKanbanBoard
        agents={teamAgents}
        tasks={tasks}
        tasksByStatus={tasksByStatus}
        kanbanColumns={kanbanColumns}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTask}
        onCreateTask={createTask}
        teamName={teamName}
      />
    </div>
  )
}
