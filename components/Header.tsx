'use client'

import { Menu } from 'lucide-react'

interface HeaderProps {
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
}

export default function Header({ onToggleSidebar, sidebarCollapsed }: HeaderProps) {
  return (
    <header className="border-b border-gray-800 bg-gray-950 px-4 py-2">
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
    </header>
  )
}
