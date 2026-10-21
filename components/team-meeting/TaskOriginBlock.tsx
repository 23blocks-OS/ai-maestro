'use client'

import type { Agent } from '@/types/agent'
import type { TaskKind, TaskOrigin } from '@/types/task'

const KIND_LABEL: Record<TaskKind, string> = { task: 'Task', idea: 'Idea', bug: 'Bug', research: 'Research' }

/** The word for a parked card's kind; nothing for an ordinary task */
export function kindLabel(kind?: TaskKind): string | null {
  return kind && kind !== 'task' ? KIND_LABEL[kind] : null
}

/**
 * Where a card came from: the agent, its repo and a note, with a link back to that agent's
 * conversation. The link is the dashboard's own deep link (`/?agent=<id>`), which works for an
 * agent on any host the dashboard lists; the host is shown beside the name for an agent that
 * lives somewhere other than here.
 */
export default function TaskOriginBlock({ origin, agents }: { origin?: TaskOrigin; agents: Agent[] }) {
  if (!origin || Object.keys(origin).length === 0) return null
  const agent = origin.agentId ? agents.find(a => a.id === origin.agentId) : undefined
  const name = agent ? (agent.label || agent.name || agent.alias || agent.id.slice(0, 8)) : origin.agentId ? origin.agentId.slice(0, 8) : null
  const where = [origin.repo, origin.hostId && !agent ? `host ${origin.hostId}` : null].filter(Boolean).join(' · ')

  return (
    <div className="rounded border border-gray-700/50 bg-gray-800/40 px-2.5 py-2 text-[11px] text-gray-400 space-y-0.5" data-testid="task-origin">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">Came from</p>
      {name && (
        <p>
          <span className="text-gray-200">{name}</span>
          {where ? <span className="text-gray-500"> · {where}</span> : null}
          {origin.agentId && (
            <a href={`/?agent=${encodeURIComponent(origin.agentId)}`} className="ml-2 text-blue-400 hover:text-blue-300" data-testid="task-origin-link">
              Open the conversation
            </a>
          )}
        </p>
      )}
      {!name && where && <p className="text-gray-500">{where}</p>}
      {origin.threadId && <p className="text-gray-500">Message {origin.threadId}</p>}
      {origin.note && <p className="text-gray-300 whitespace-pre-wrap">{origin.note}</p>}
    </div>
  )
}
