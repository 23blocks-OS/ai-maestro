'use client'

import TerminalView from '@/components/TerminalView'
import { agentToSession } from '@/lib/agent-utils'
import type { Agent } from '@/types/agent'

interface MeetingTerminalAreaProps {
  agents: Agent[]
  activeAgentId: string | null
}

export default function MeetingTerminalArea({ agents, activeAgentId }: MeetingTerminalAreaProps) {
  // Only render the active agent's terminal - matches main dashboard pattern.
  // Mounting all agents simultaneously creates N WebGL contexts which exhausts
  // the browser's GPU context limit (~8-16), breaking canvas-based text selection.
  const activeAgent = agents.find(a => a.id === activeAgentId)

  if (!activeAgent) {
    return (
      <div className="flex-1 relative">
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p className="text-sm">Select an agent from the sidebar</p>
        </div>
      </div>
    )
  }

  const hasTerminal = !!activeAgent.session?.tmuxSessionName

  if (!hasTerminal) {
    return (
      <div className="flex-1 relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-lg mb-1">{activeAgent.label || activeAgent.name || activeAgent.alias}</p>
            <p className="text-sm">No active terminal session</p>
          </div>
        </div>
      </div>
    )
  }

  const session = agentToSession(activeAgent)

  return (
    <div className="flex-1 relative">
      <div
        key={activeAgent.id}
        className="absolute inset-0 flex flex-col"
      >
        <TerminalView
          session={session}
          isVisible={true}
          hideFooter={true}
        />
      </div>
    </div>
  )
}
