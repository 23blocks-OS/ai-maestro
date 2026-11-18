'use client'

import { useMemo, memo } from 'react'
import TerminalView from '@/components/TerminalView'
import ChatView from '@/components/ChatView'
import ChatTerminalSwitch, { useChatOrTerminal } from '@/components/ChatTerminalSwitch'
import { agentToSession } from '@/lib/agent-utils'
import type { Agent } from '@/types/agent'

interface MeetingTerminalAreaProps {
  agents: Agent[]
  activeAgentId: string | null
}

function MeetingTerminalAreaInner({ agents, activeAgentId }: MeetingTerminalAreaProps) {
  const [mode, setMode] = useChatOrTerminal('meeting')
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

  const pane = (shown: boolean) => ({ visibility: shown ? 'visible' as const : 'hidden' as const, pointerEvents: shown ? 'auto' as const : 'none' as const, zIndex: shown ? 10 : 0 })
  const name = activeAgent.label || activeAgent.name || activeAgent.alias

  // Chat first (F111); both stay mounted, the hidden one with visibility (terminal rules), one chat socket at a time
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-end px-2 py-1 border-b border-gray-800 bg-gray-900/60">
        <ChatTerminalSwitch mode={mode} onChange={setMode} />
      </div>
      <div className="flex-1 relative min-h-0">
        <div key={`chat-${activeAgent.id}`} className="absolute inset-0 flex flex-col" style={pane(mode === 'chat')}>
          <ChatView agent={activeAgent} isActive={mode === 'chat'} />
        </div>
        <div key={activeAgent.id} className="absolute inset-0 flex flex-col" style={pane(mode === 'terminal')}>
          {session ? (
            <TerminalView session={session} isVisible={mode === 'terminal'} hideFooter={true} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <p className="text-lg mb-1">{name}</p>
                <p className="text-sm">No active terminal session</p>
              </div>
            </div>
          )}
        </div>
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
