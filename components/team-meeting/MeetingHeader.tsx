'use client'

import Link from 'next/link'
import { Users, Plus, PhoneOff, ArrowLeft, ListTodo, MessageSquare, LayoutGrid, PanelRightClose, PanelRightOpen } from 'lucide-react'

interface MeetingHeaderProps {
  teamName: string
  agentCount: number
  onSetTeamName: (name: string) => void
  onAddAgent: () => void
  onEndMeeting: () => void
  rightPanelOpen?: boolean
  onToggleRightPanel?: () => void
  onOpenTasks?: () => void
  onOpenChat?: () => void
  onOpenKanban?: () => void
  taskCount?: number
  chatUnreadCount?: number
}

export default function MeetingHeader({
  teamName,
  agentCount,
  onSetTeamName,
  onAddAgent,
  onEndMeeting,
  rightPanelOpen,
  onToggleRightPanel,
  onOpenTasks,
  onOpenChat,
  onOpenKanban,
  taskCount = 0,
  chatUnreadCount = 0,
}: MeetingHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-gray-950 flex-shrink-0">
      <Link
        href="/"
        className="p-1 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-300"
        title="Back to Dashboard"
      >
        <ArrowLeft className="w-4 h-4" />
      </Link>

      <div className="flex items-center gap-2 text-emerald-400">
        <Users className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wider">Meeting</span>
      </div>

      {/* Editable team name */}
      <input
        type="text"
        value={teamName}
        onChange={e => onSetTeamName(e.target.value)}
        className="text-sm text-white bg-transparent border-b border-transparent hover:border-gray-600 focus:border-emerald-500 focus:outline-none px-1 py-0.5 max-w-[200px]"
        placeholder="Team name..."
      />

      <span className="text-xs text-gray-500">
        {agentCount} agent{agentCount !== 1 ? 's' : ''}
      </span>

      <div className="flex-1" />

      {/* Kanban button */}
      {onOpenKanban && (
        <button
          onClick={onOpenKanban}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          title="Kanban Board"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Kanban
        </button>
      )}

      {/* Tasks button */}
      {onOpenTasks && (
        <button
          onClick={onOpenTasks}
          className="relative flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          title="Tasks"
        >
          <ListTodo className="w-3.5 h-3.5" />
          Tasks
          {taskCount > 0 && (
            <span className="text-[10px] bg-gray-700 text-gray-400 rounded-full px-1.5 min-w-[16px] text-center">
              {taskCount}
            </span>
          )}
        </button>
      )}

      {/* Chat button */}
      {onOpenChat && (
        <button
          onClick={onOpenChat}
          className="relative flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          title="Chat"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
          {chatUnreadCount > 0 && (
            <span className="text-[10px] bg-emerald-600 text-white rounded-full px-1.5 min-w-[16px] text-center">
              {chatUnreadCount}
            </span>
          )}
        </button>
      )}

      {/* Panel toggle */}
      {onToggleRightPanel && (
        <button
          onClick={onToggleRightPanel}
          className={`p-1.5 rounded transition-colors ${
            rightPanelOpen
              ? 'bg-gray-700 text-gray-200'
              : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
          }`}
          title={rightPanelOpen ? 'Close panel' : 'Open panel'}
        >
          {rightPanelOpen ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <PanelRightOpen className="w-4 h-4" />
          )}
        </button>
      )}

      <button
        onClick={onAddAgent}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
      >
        <Plus className="w-3 h-3" />
        Add Agent
      </button>

      <button
        onClick={onEndMeeting}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded transition-colors"
      >
        <PhoneOff className="w-3 h-3" />
        End Meeting
      </button>
    </div>
  )
}
