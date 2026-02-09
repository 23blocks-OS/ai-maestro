'use client'

import { useTasks } from '@/hooks/useTasks'
import TaskPanel from '@/components/team-meeting/TaskPanel'
import type { Agent } from '@/types/agent'

interface TeamTasksSectionProps {
  teamId: string
  agents: Agent[]
  teamAgentIds: string[]
}

export default function TeamTasksSection({ teamId, agents, teamAgentIds }: TeamTasksSectionProps) {
  const {
    tasks, pendingTasks, inProgressTasks, completedTasks,
    createTask, updateTask, deleteTask,
  } = useTasks(teamId)

  // Filter agents to team members only
  const teamAgents = agents.filter(a => teamAgentIds.includes(a.id))

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <h2 className="text-sm font-medium text-white">Tasks</h2>
        <p className="text-xs text-gray-500">{tasks.length} total tasks</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <TaskPanel
          agents={teamAgents}
          tasks={tasks}
          pendingTasks={pendingTasks}
          inProgressTasks={inProgressTasks}
          completedTasks={completedTasks}
          onCreateTask={createTask}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
        />
      </div>
    </div>
  )
}
