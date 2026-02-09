'use client'

import { useState } from 'react'
import { LayoutGrid, List, Plus, ListTodo, Mail, Play, Moon, Loader2, X, ExternalLink, Circle } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { SidebarMode } from '@/types/team'
import type { TaskWithDeps } from '@/types/task'
import WakeAgentDialog from '@/components/WakeAgentDialog'

interface MeetingSidebarProps {
  agents: Agent[]
  activeAgentId: string | null
  sidebarMode: SidebarMode
  onSelectAgent: (agentId: string) => void
  onRemoveAgent?: (agentId: string) => void
  onToggleMode: () => void
  onAddAgent: () => void
  tasksByAgent?: Record<string, TaskWithDeps[]>
  messageCountsByAgent?: Record<string, number>
  canRemove?: boolean
}

export default function MeetingSidebar({
  agents,
  activeAgentId,
  sidebarMode,
  onSelectAgent,
  onRemoveAgent,
  onToggleMode,
  onAddAgent,
  tasksByAgent = {},
  messageCountsByAgent = {},
  canRemove = false,
}: MeetingSidebarProps) {
  const [wakingAgents, setWakingAgents] = useState<Set<string>>(new Set())
  const [hibernatingAgents, setHibernatingAgents] = useState<Set<string>>(new Set())
  const [wakeDialogAgent, setWakeDialogAgent] = useState<Agent | null>(null)

  const handleHibernate = async (agent: Agent, e: React.MouseEvent) => {
    e.stopPropagation()
    if (hibernatingAgents.has(agent.id)) return

    setHibernatingAgents(prev => new Set(prev).add(agent.id))

    try {
      const response = await fetch(`/api/agents/${agent.id}/hibernate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to hibernate agent')
      }
    } catch (error) {
      console.error('Failed to hibernate agent:', error)
      alert(error instanceof Error ? error.message : 'Failed to hibernate agent')
    } finally {
      setHibernatingAgents(prev => {
        const next = new Set(prev)
        next.delete(agent.id)
        return next
      })
    }
  }

  const handleWake = (agent: Agent, e: React.MouseEvent) => {
    e.stopPropagation()
    if (wakingAgents.has(agent.id)) return
    setWakeDialogAgent(agent)
  }

  const handleWakeConfirm = async (program: string) => {
    if (!wakeDialogAgent) return

    const agent = wakeDialogAgent
    setWakingAgents(prev => new Set(prev).add(agent.id))

    try {
      const response = await fetch(`/api/agents/${agent.id}/wake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to wake agent')
      }

      setWakeDialogAgent(null)
    } catch (error) {
      console.error('Failed to wake agent:', error)
      alert(error instanceof Error ? error.message : 'Failed to wake agent')
    } finally {
      setWakingAgents(prev => {
        const next = new Set(prev)
        next.delete(agent.id)
        return next
      })
    }
  }

  const handlePopOut = (agent: Agent, e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `/zoom/agent?id=${encodeURIComponent(agent.id)}`
    window.open(url, `agent-${agent.id}`, 'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no')
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-800" style={{ width: 300 }}>
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
          Agents ({agents.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleMode}
            className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
            title={sidebarMode === 'grid' ? 'Switch to list' : 'Switch to grid'}
          >
            {sidebarMode === 'grid' ? <List className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onAddAgent}
            className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-emerald-400 transition-colors"
            title="Add agent to meeting"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Agent list/grid */}
      <div className={`flex-1 overflow-y-auto p-2 ${
        sidebarMode === 'grid' ? 'grid grid-cols-2 gap-2 content-start' : 'flex flex-col gap-1'
      }`}>
        {agents.map(agent => {
          const isActive = agent.id === activeAgentId
          const displayName = agent.label || agent.name || agent.alias || agent.id.slice(0, 8)
          const isOnline = agent.session?.status === 'online'
          const agentTasks = tasksByAgent[agent.id] || []
          const activeTaskCount = agentTasks.filter(t => t.status !== 'completed').length
          const unreadMessages = messageCountsByAgent[agent.id] || 0
          const isWaking = wakingAgents.has(agent.id)
          const isHibernating = hibernatingAgents.has(agent.id)

          // Determine avatar type
          const isAvatarUrl = agent.avatar && (agent.avatar.startsWith('http://') || agent.avatar.startsWith('https://') || agent.avatar.startsWith('/'))
          const initials = displayName
            .split(/[\s-_]+/)
            .map((word: string) => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)

          if (sidebarMode === 'grid') {
            return (
              <div
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className={`
                  group relative rounded-lg cursor-pointer transition-all duration-200 overflow-hidden
                  aspect-square
                  ${isActive
                    ? 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-gray-900'
                    : 'hover:ring-1 hover:ring-gray-600'
                  }
                `}
              >
                {/* Full-bleed avatar background */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`w-full h-full flex items-center justify-center ${
                    !isOnline
                      ? 'bg-gradient-to-br from-yellow-900/40 to-amber-950/60'
                      : 'bg-gradient-to-br from-violet-900/40 to-purple-950/60'
                  }`}>
                    {isAvatarUrl ? (
                      <img src={agent.avatar} alt={displayName} className="w-full h-full object-cover" />
                    ) : agent.avatar ? (
                      <span className="text-5xl leading-none opacity-90">{agent.avatar}</span>
                    ) : (
                      <span className={`text-4xl font-bold opacity-30 ${
                        !isOnline ? 'text-yellow-400' : 'text-violet-300'
                      }`}>
                        {initials}
                      </span>
                    )}
                  </div>
                </div>

                {/* Gradient overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

                {/* Top bar - status & actions */}
                <div className="absolute top-0 left-0 right-0 p-1.5 flex justify-between items-start z-10">
                  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] backdrop-blur-sm ${
                    isOnline
                      ? 'bg-green-500/30 text-green-300'
                      : 'bg-yellow-500/30 text-yellow-300'
                  }`}>
                    <Circle className={`w-1.5 h-1.5 fill-current ${isOnline ? 'status-online' : ''}`} />
                    {isOnline ? 'Online' : 'Offline'}
                  </div>

                  <div className="flex items-center gap-0.5">
                    {/* Badges */}
                    {unreadMessages > 0 && (
                      <div className="min-w-[16px] h-4 bg-blue-500 rounded-full flex items-center justify-center px-1">
                        <span className="text-[9px] text-white font-bold">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                      </div>
                    )}
                    {activeTaskCount > 0 && (
                      <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-gray-300">
                        <ListTodo className="w-2.5 h-2.5" />
                        <span className="text-[9px]">{activeTaskCount}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hover actions overlay */}
                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all z-10">
                  {canRemove && onRemoveAgent && (
                    <div
                      onClick={(e) => { e.stopPropagation(); onRemoveAgent(agent.id) }}
                      className="p-1 rounded-full bg-black/50 backdrop-blur-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                      title="Remove from meeting"
                    >
                      <X className="w-3 h-3" />
                    </div>
                  )}
                  <div
                    onClick={(e) => handlePopOut(agent, e)}
                    className="p-1 rounded-full bg-black/50 backdrop-blur-sm text-gray-400 hover:text-blue-400 transition-colors cursor-pointer"
                    title="Pop out to separate window"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </div>
                  <div
                    onClick={(e) => isOnline ? handleHibernate(agent, e) : handleWake(agent, e)}
                    className={`p-1 rounded-full bg-black/50 backdrop-blur-sm transition-colors cursor-pointer ${
                      isWaking || isHibernating
                        ? 'text-yellow-400'
                        : isOnline
                          ? 'text-gray-400 hover:text-amber-400'
                          : 'text-gray-400 hover:text-emerald-400'
                    }`}
                    title={isOnline ? 'Hibernate agent' : 'Wake agent'}
                  >
                    {isWaking || isHibernating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isOnline ? (
                      <Moon className="w-3 h-3" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                  </div>
                </div>

                {/* Bottom bar - agent name */}
                <div className="absolute bottom-0 left-0 right-0 p-1.5 z-10">
                  <p className="text-xs font-semibold text-white truncate drop-shadow-lg leading-tight">
                    {displayName}
                  </p>
                  {agent.label && agent.name && agent.name !== agent.label && (
                    <p className="text-[9px] text-white/50 truncate font-mono leading-tight">
                      {agent.name}
                    </p>
                  )}
                </div>
              </div>
            )
          }

          // List mode
          return (
            <div
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              className={`
                group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200
                ${isActive
                  ? 'bg-emerald-500/20 border border-emerald-500/50'
                  : 'border border-transparent hover:bg-gray-800'
                }
              `}
            >
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700">
                  {agent.avatar ? (
                    <img src={agent.avatar} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
                  isOnline ? 'bg-green-500' : 'bg-gray-600'
                }`} />
                {unreadMessages > 0 && (
                  <div className="absolute -top-1 -right-1 min-w-[14px] h-3.5 bg-blue-500 rounded-full flex items-center justify-center px-0.5 border-2 border-gray-900">
                    <span className="text-[8px] text-white font-bold">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-sm truncate block ${
                  isActive ? 'text-emerald-300' : 'text-gray-300'
                }`}>
                  {displayName}
                </span>
                <span className="text-[10px] text-gray-500 truncate block">
                  {agent.name || agent.alias}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {activeTaskCount > 0 && (
                  <span className="flex items-center gap-0.5 text-[9px] text-gray-500">
                    <ListTodo className="w-2.5 h-2.5" />
                    {activeTaskCount}
                  </span>
                )}
                {unreadMessages > 0 && (
                  <span className="flex items-center gap-0.5 text-[9px] text-blue-400">
                    <Mail className="w-2.5 h-2.5" />
                    {unreadMessages}
                  </span>
                )}
                <div
                  onClick={(e) => handlePopOut(agent, e)}
                  className="p-1 rounded transition-all duration-200 cursor-pointer text-gray-600 opacity-0 group-hover:opacity-100 hover:text-blue-400 hover:bg-gray-700/50"
                  title="Pop out to separate window"
                >
                  <ExternalLink className="w-3 h-3" />
                </div>
                <div
                  onClick={(e) => isOnline ? handleHibernate(agent, e) : handleWake(agent, e)}
                  className={`
                    p-1 rounded transition-all duration-200 cursor-pointer
                    ${isWaking || isHibernating
                      ? 'text-yellow-400'
                      : isOnline
                        ? 'text-gray-600 opacity-0 group-hover:opacity-100 hover:text-amber-400 hover:bg-gray-700/50'
                        : 'text-gray-600 opacity-0 group-hover:opacity-100 hover:text-emerald-400 hover:bg-gray-700/50'
                    }
                  `}
                  title={isOnline ? 'Hibernate agent' : 'Wake agent'}
                >
                  {isWaking || isHibernating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isOnline ? (
                    <Moon className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                </div>
                {canRemove && onRemoveAgent && (
                  <div
                    onClick={(e) => { e.stopPropagation(); onRemoveAgent(agent.id) }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 hover:bg-gray-700/50 transition-all duration-200 cursor-pointer"
                    title="Remove from meeting"
                  >
                    <X className="w-3 h-3" />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Wake Agent Dialog */}
      <WakeAgentDialog
        isOpen={wakeDialogAgent !== null}
        onClose={() => setWakeDialogAgent(null)}
        onConfirm={handleWakeConfirm}
        agentName={wakeDialogAgent?.name || wakeDialogAgent?.id || ''}
        agentAlias={wakeDialogAgent?.label || wakeDialogAgent?.alias}
      />
    </div>
  )
}
