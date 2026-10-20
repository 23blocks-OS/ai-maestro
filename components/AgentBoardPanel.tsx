'use client'

import { useAgentBoard } from '@/hooks/useAgentBoard'
import { useHosts } from '@/hooks/useHosts'
import TaskKanbanBoard from '@/components/team-meeting/TaskKanbanBoard'
import type { Agent } from '@/types/agent'

/**
 * The Board tab: what this agent is working on, where each card is, and what it waits for.
 * Shows the agent's own cards plus the cards of its teams that are assigned to it.
 * `hostUrl` is the agent's own host (see getAgentBaseUrl): the board is stored where the agent lives.
 */
export default function AgentBoardPanel({
  agent, agents, hostUrl,
}: {
  agent: Agent
  agents: Agent[]
  hostUrl: string
}) {
  const { hosts } = useHosts()
  const { tasks, tasksByStatus, loading, error, createTask, updateTask, deleteTask, addComment, retryComment } = useAgentBoard(agent.id, hostUrl, hosts)
  const name = agent.label || agent.name || agent.alias || agent.id.slice(0, 8)

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="agent-board">
      {error && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20">
          {error}. The cards below may be out of date.
        </div>
      )}
      {loading && tasks.length === 0 && !error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Loading the board…</div>
      ) : (
        <TaskKanbanBoard
          title="Board"
          teamName={name}
          agents={agents}
          tasks={tasks}
          tasksByStatus={tasksByStatus}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
          onCreateTask={createTask}
          onAddComment={addComment}
          onRetryComment={retryComment}
        />
      )}
    </div>
  )
}
