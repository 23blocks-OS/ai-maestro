'use client'

import { Users, ListTodo, LayoutGrid, FileText, BookOpen } from 'lucide-react'

export type TeamDashboardTab = 'overview' | 'tasks' | 'kanban' | 'documents' | 'instructions'

interface TeamDashboardSidebarProps {
  activeTab: TeamDashboardTab
  onTabChange: (tab: TeamDashboardTab) => void
  taskCount?: number
  docCount?: number
}

const tabs = [
  { id: 'overview' as const, label: 'Overview', icon: Users, description: 'Team info & agents' },
  { id: 'tasks' as const, label: 'Tasks', icon: ListTodo, description: 'Task list view' },
  { id: 'kanban' as const, label: 'Kanban', icon: LayoutGrid, description: 'Drag-and-drop board' },
  { id: 'documents' as const, label: 'Documents', icon: FileText, description: 'Team documents' },
  { id: 'instructions' as const, label: 'Instructions', icon: BookOpen, description: 'Team guidelines' },
]

export default function TeamDashboardSidebar({ activeTab, onTabChange, taskCount, docCount }: TeamDashboardSidebarProps) {
  return (
    <div className="w-64 border-r border-gray-800 bg-gray-900/50 p-4 flex flex-col">
      <h2 className="text-lg font-semibold text-white mb-1 px-2">Team Dashboard</h2>
      <p className="text-xs text-gray-400 mb-6 px-2">Manage your team</p>

      <nav className="space-y-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const count = tab.id === 'tasks' ? taskCount : tab.id === 'documents' ? docCount : undefined

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
              }`}
            >
              <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
              <div className="flex-1 text-left">
                <div className={`font-medium flex items-center gap-2 ${isActive ? 'text-white' : 'text-gray-200'}`}>
                  {tab.label}
                  {count !== undefined && count > 0 && (
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                      isActive ? 'bg-emerald-500 text-white' : 'bg-gray-700 text-gray-400'
                    }`}>
                      {count}
                    </span>
                  )}
                </div>
                <div className={`text-xs ${isActive ? 'text-emerald-100' : 'text-gray-500'}`}>
                  {tab.description}
                </div>
              </div>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
