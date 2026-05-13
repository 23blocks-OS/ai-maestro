'use client'

import { useMemo, memo } from 'react'
import TerminalView from '@/components/TerminalView'
import { agentToSession } from '@/lib/agent-utils'
import type { Agent } from '@/types/agent'

interface MeetingTerminalAreaProps {
  agents: Agent[]
  activeAgentId: string | null
}

function MeetingTerminalAreaInner({ agents, activeAgentId }: MeetingTerminalAreaProps) {
  // Only render the active agent's terminal - matches main dashboard pattern.
  // Mounting all agents simultaneously creates N WebGL contexts which exhausts
  // the browser's GPU context limit (~8-16), breaking canvas-based text selection.
  const activeAgent = agents.find(a => a.id === activeAgentId)
  const session = useMemo(
    () => activeAgent ? agentToSession(activeAgent) : null,
    [
      activeAgent?.id,
      activeAgent?.session?.tmuxSessionName,
      activeAgent?.hostId,
    ]
  )

  if (!activeAgent) {
    return (
      <div className="flex-1 relative">
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p className="text-sm">Select an agent from the sidebar</p>
        </div>
      </div>
    )
  }

  if (!session) {
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

// Freeze re-renders unless the meaningful identity (activeAgentId + active agent's
// session/host) actually changes. Prevents the terminal from thrashing on every
// useAgents/useHosts poll, which churns `agents` prop refs without meaningful change.
function propsEqual(prev: MeetingTerminalAreaProps, next: MeetingTerminalAreaProps): boolean {
  if (prev.activeAgentId !== next.activeAgentId) return false
  const prevAgent = prev.agents.find(a => a.id === prev.activeAgentId)
  const nextAgent = next.agents.find(a => a.id === next.activeAgentId)
  if (!prevAgent && !nextAgent) return true
  if (!prevAgent || !nextAgent) return false
  return (
    prevAgent.session?.tmuxSessionName === nextAgent.session?.tmuxSessionName &&
    prevAgent.hostId === nextAgent.hostId &&
    !!prevAgent.session === !!nextAgent.session
  )
}

const MeetingTerminalArea = memo(MeetingTerminalAreaInner, propsEqual)
export default MeetingTerminalArea
