'use client'

import { Menu, Upload } from 'lucide-react'

interface HeaderProps {
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
  activeAgentId?: string | null
  onImportAgent?: () => void
}

export default function Header({ onToggleSidebar, sidebarCollapsed, activeAgentId, onImportAgent }: HeaderProps) {
  const immersiveUrl = activeAgentId ? `/immersive?agent=${encodeURIComponent(activeAgentId)}` : '/immersive'

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
          {onImportAgent && (
            <button
              onClick={onImportAgent}
              className="text-sm px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors flex items-center gap-1.5"
              title="Import Agent"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
          )}
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
