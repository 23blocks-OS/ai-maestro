'use client'

import Link from 'next/link'
import { useExperiment } from '@/hooks/useExperiment'
import { Menu, HelpCircle, Grid3X3, Users, FolderKanban, UserCircle, Puzzle, Tablet, LayoutGrid, FolderGit2, Building2, BellRing, Globe, Contact } from 'lucide-react'

interface HeaderProps {
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
  activeAgentId?: string | null
  onOpenHelp?: () => void
  onSwitchLayout?: () => void
}

export default function Header({ onToggleSidebar, sidebarCollapsed, activeAgentId, onOpenHelp, onSwitchLayout }: HeaderProps) {
  const immersiveUrl = activeAgentId ? `/immersive?agent=${encodeURIComponent(activeAgentId)}` : '/immersive'
  const companionUrl = activeAgentId ? `/companion?agent=${encodeURIComponent(activeAgentId)}` : '/companion'
  const zoomUrl = '/zoom'
  // World view is a beta: its button shows only where Settings → Experiments turned it on
  const { enabled: worldEnabled } = useExperiment('world-view')

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
          <Link
            href="/teams"
            className="text-sm px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors flex items-center gap-1.5"
            title="Manage Teams"
          >
            <FolderKanban className="w-3.5 h-3.5" />
            Teams
          </Link>
          <a
            href="/projects"
            className="text-sm px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors flex items-center gap-1.5"
            title="Projects: work that crosses agents and teams"
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            Projects
          </a>
          <a
            href="/org"
            className="text-sm px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors flex items-center gap-1.5"
            title="Organization: a company's agents, work and relations"
          >
            <Building2 className="w-3.5 h-3.5" />
            Org
          </a>
          <a
            href="/people"
            className="text-sm px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded transition-colors flex items-center gap-1.5"
            title="People: the humans who work with your agents"
          >
            <Contact className="w-3.5 h-3.5" />
            People
          </a>
          <a
            href="/matrix"
            className="text-sm px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors flex items-center gap-1.5"
            title="Eisenhower matrix of every agent"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Matrix
          </a>
          <a
            href="/attention"
            className="text-sm px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors flex items-center gap-1.5"
            title="Attention: what needs you, across every agent and host"
          >
            <BellRing className="w-3.5 h-3.5" />
            Attention
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
          {worldEnabled && (
            <a
              href="/world"
              className="text-sm px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors flex items-center gap-1.5"
              title="World (beta): hosts and orgs as islands, agents as figures"
            >
              <Globe className="w-3.5 h-3.5" />
              World
            </a>
          )}
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
          {onSwitchLayout && (
            <button
              onClick={onSwitchLayout}
              className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-300"
              aria-label="Switch to tablet layout"
              title="Switch to tablet layout"
            >
              <Tablet className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
