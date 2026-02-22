'use client'

import { Menu, HelpCircle, Grid3X3, Users, FolderKanban, UserCircle, Puzzle } from 'lucide-react'

interface HeaderProps {
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
  activeAgentId?: string | null
  onOpenHelp?: () => void
}

export default function Header({ onToggleSidebar, sidebarCollapsed, activeAgentId, onOpenHelp }: HeaderProps) {
  const immersiveUrl = activeAgentId ? `/immersive?agent=${encodeURIComponent(activeAgentId)}` : '/immersive'
  const companionUrl = activeAgentId ? `/companion?agent=${encodeURIComponent(activeAgentId)}` : '/companion'
  const zoomUrl = '/zoom'

  return (
    <header className="border-b border-gray-800 bg-gray-950 px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-1 rounded-lg hover:bg-gray-800 transition-all duration-200 text-gray-400 hover:text-gray-300"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <h1 className="text-sm text-white">AI Maestro</h1>
        </div>
        <div className="flex items-center gap-2">
          {onOpenHelp && (
            <button
              onClick={onOpenHelp}
              className="text-sm px-3 py-1 bg-white hover:bg-gray-100 text-gray-900 rounded transition-colors flex items-center gap-1.5 font-medium"
              title="Open Help & Tutorials"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Help
            </button>
          )}
          <a
            href="/teams"
            className="text-sm px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors flex items-center gap-1.5"
            title="Manage Teams"
          >
            <FolderKanban className="w-3.5 h-3.5" />
            Teams
          </a>
          <a
            href="/team-meeting"
            className="text-sm px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors flex items-center gap-1.5"
            title="Team Meeting"
          >
            <Users className="w-3.5 h-3.5" />
            Meeting
          </a>
          <a
            href="/plugin-builder"
            className="text-sm px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded transition-colors flex items-center gap-1.5"
            title="Plugin Builder"
          >
            <Puzzle className="w-3.5 h-3.5" />
            Plugins
          </a>
          <a
            href={zoomUrl}
            className="text-sm px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded transition-colors flex items-center gap-1.5"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            Zoom
          </a>
          <a
            href={companionUrl}
            className="text-sm px-3 py-1 bg-pink-600 hover:bg-pink-700 text-white rounded transition-colors flex items-center gap-1.5"
            title="Companion Mode"
          >
            <UserCircle className="w-3.5 h-3.5" />
            Companion
          </a>
          <a
            href={immersiveUrl}
            className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Immersive Experience
          </a>
        </div>
      </div>
    </header>
  )
}
