'use client'

import { useTasks } from '@/hooks/useTasks'
import TaskKanbanBoard from '@/components/team-meeting/TaskKanbanBoard'
import type { Agent } from '@/types/agent'

interface TeamKanbanSectionProps {
  teamId: string
  teamName: string
  agents: Agent[]
  teamAgentIds: string[]
}

export default function TeamKanbanSection({ teamId, teamName, agents, teamAgentIds }: TeamKanbanSectionProps) {
  const {
    tasks, tasksByStatus,
    createTask, updateTask, deleteTask, addComment, retryComment,
  } = useTasks(teamId)

  // Filter agents to team members only
  const teamAgents = agents.filter(a => teamAgentIds.includes(a.id))

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TaskKanbanBoard
        agents={teamAgents}
        tasks={tasks}
        tasksByStatus={tasksByStatus}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTask}
        onCreateTask={createTask}
        teamName={teamName}
        onAddComment={addComment}
        onRetryComment={retryComment}
      />
    </div>
  )
}
