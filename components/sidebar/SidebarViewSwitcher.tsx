'use client'

import { Users, UsersRound, Video } from 'lucide-react'

export type SidebarView = 'agents' | 'teams' | 'meetings'

interface SidebarViewSwitcherProps {
  activeView: SidebarView
  onViewChange: (view: SidebarView) => void
}

const views: { key: SidebarView; label: string; Icon: typeof Users }[] = [
  { key: 'agents', label: 'Agents', Icon: Users },
  { key: 'teams', label: 'Teams', Icon: UsersRound },
  { key: 'meetings', label: 'Meetings', Icon: Video },
]

export default function SidebarViewSwitcher({ activeView, onViewChange }: SidebarViewSwitcherProps) {
  return (
    <div className="flex items-center bg-gray-800/60 rounded-lg p-0.5 mx-2 mt-3">
      {views.map(({ key, label, Icon }) => {
        const isActive = activeView === key
        return (
          <button
            key={key}
            onClick={() => onViewChange(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
              isActive
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
