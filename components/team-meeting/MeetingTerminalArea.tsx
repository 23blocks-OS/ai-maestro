'use client'

import TerminalView from '@/components/TerminalView'
import { agentToSession } from '@/lib/agent-utils'
import type { Agent } from '@/types/agent'

interface MeetingTerminalAreaProps {
  agents: Agent[]
  activeAgentId: string | null
}

export default function MeetingTerminalArea({ agents, activeAgentId }: MeetingTerminalAreaProps) {
  return (
    <div className="flex-1 relative">
      {agents.map(agent => {
        const isActive = agent.id === activeAgentId
        const session = agentToSession(agent)
        const hasTerminal = !!agent.session?.tmuxSessionName

        if (!hasTerminal) {
          return (
            <div
              key={agent.id}
              className="absolute inset-0 flex items-center justify-center"
              style={{
                visibility: isActive ? 'visible' : 'hidden',
                pointerEvents: isActive ? 'auto' : 'none',
                zIndex: isActive ? 10 : 0,
              }}
            >
              <div className="text-center text-gray-500">
                <p className="text-lg mb-1">{agent.label || agent.name || agent.alias}</p>
                <p className="text-sm">No active terminal session</p>
              </div>
            </div>
          )
        }

        return (
          <div
            key={agent.id}
            className="absolute inset-0 flex flex-col overflow-hidden"
            style={{
              visibility: isActive ? 'visible' : 'hidden',
              pointerEvents: isActive ? 'auto' : 'none',
              zIndex: isActive ? 10 : 0,
            }}
          >
            <TerminalView
              session={session}
              isVisible={isActive}
              hideFooter={true}
              hideHeader={true}
            />
          </div>
        )
      })}

      {!activeAgentId && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p className="text-sm">Select an agent from the sidebar</p>
        </div>
      )}
    </div>
  )
}
