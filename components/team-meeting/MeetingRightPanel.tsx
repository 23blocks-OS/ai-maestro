'use client'

import { useEffect } from 'react'
import { X, ListTodo, MessageSquare } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import TaskPanel from './TaskPanel'
import MeetingChatPanel from './MeetingChatPanel'

export type RightPanelTab = 'tasks' | 'chat'

interface MeetingRightPanelProps {
  activeTab: RightPanelTab
  onTabChange: (tab: RightPanelTab) => void
  onClose: () => void
  // Task props
  agents: Agent[]
  tasks: TaskWithDeps[]
  pendingTasks: TaskWithDeps[]
  inProgressTasks: TaskWithDeps[]
  completedTasks: TaskWithDeps[]
  onCreateTask: (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[] }) => Promise<void>
  onUpdateTask: (taskId: string, updates: { subject?: string; description?: string; status?: TaskStatus; assigneeAgentId?: string | null; blockedBy?: string[] }) => Promise<{ unblocked: TaskWithDeps[] }>
  onDeleteTask: (taskId: string) => Promise<void>
  // Chat props
  chatMessages: Array<{ id: string; from: string; fromAlias?: string; fromLabel?: string; to: string; toAlias?: string; timestamp: string; subject: string; preview: string; isMine: boolean; displayFrom: string }>
  chatUnreadCount: number
  onSendToAgent: (agentId: string, message: string) => Promise<void>
  onBroadcastToAll: (message: string) => Promise<void>
  onMarkChatRead?: () => void
}

export default function MeetingRightPanel({
  activeTab,
  onTabChange,
  onClose,
  agents,
  tasks,
  pendingTasks,
  inProgressTasks,
  completedTasks,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  chatMessages,
  chatUnreadCount,
  onSendToAgent,
  onBroadcastToAll,
  onMarkChatRead,
}: MeetingRightPanelProps) {
  const taskCount = tasks.filter(t => t.status !== 'completed').length

  // Mark chat as read when viewing the chat tab
  useEffect(() => {
    if (activeTab === 'chat' && onMarkChatRead) {
      onMarkChatRead()
    }
  }, [activeTab, onMarkChatRead])

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-800" style={{ width: 360 }}>
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-800 flex-shrink-0">
        <button
          onClick={() => onTabChange('tasks')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'tasks'
              ? 'text-emerald-400 border-emerald-400'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          <ListTodo className="w-3.5 h-3.5" />
          Tasks
          {taskCount > 0 && (
            <span className="text-[10px] bg-gray-800 text-gray-400 rounded-full px-1.5 min-w-[18px] text-center">
              {taskCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange('chat')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'chat'
              ? 'text-emerald-400 border-emerald-400'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
          {chatUnreadCount > 0 && (
            <span className="text-[10px] bg-emerald-600 text-white rounded-full px-1.5 min-w-[18px] text-center">
              {chatUnreadCount}
            </span>
          )}
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="p-1.5 mr-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'tasks' ? (
          <TaskPanel
            agents={agents}
            tasks={tasks}
            pendingTasks={pendingTasks}
            inProgressTasks={inProgressTasks}
            completedTasks={completedTasks}
            onCreateTask={onCreateTask}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
          />
        ) : (
          <MeetingChatPanel
            agents={agents}
            messages={chatMessages}
            onSendToAgent={onSendToAgent}
            onBroadcastToAll={onBroadcastToAll}
          />
        )}
      </div>
    </div>
  )
}
