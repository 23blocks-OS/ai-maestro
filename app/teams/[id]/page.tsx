'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users, Play } from 'lucide-react'
import { useTeam } from '@/hooks/useTeam'
import { useDocuments } from '@/hooks/useDocuments'
import { useTasks } from '@/hooks/useTasks'
import { useAgents } from '@/hooks/useAgents'
import TeamDashboardSidebar from '@/components/teams/TeamDashboardSidebar'
import TeamOverviewSection from '@/components/teams/TeamOverviewSection'
import TeamTasksSection from '@/components/teams/TeamTasksSection'
import TeamKanbanSection from '@/components/teams/TeamKanbanSection'
import TeamDocumentsSection from '@/components/teams/TeamDocumentsSection'
import TeamInstructionsSection from '@/components/teams/TeamInstructionsSection'
import { VersionChecker } from '@/components/VersionChecker'
import type { TeamDashboardTab } from '@/components/teams/TeamDashboardSidebar'

export default function TeamDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const teamId = params.id as string
  const [activeTab, setActiveTab] = useState<TeamDashboardTab>('overview')

  const { team, loading, updateTeam } = useTeam(teamId)
  const { documents } = useDocuments(teamId)
  const { tasks } = useTasks(teamId)
  const { agents } = useAgents()

  if (loading || !team) {
    return (
      <div className="flex flex-col h-screen bg-gray-950 text-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-3 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">{loading ? 'Loading team...' : 'Team not found'}</p>
          </div>
        </div>
      </div>
    )
  }

  const handleStartMeeting = () => {
    router.push(`/team-meeting?team=${teamId}`)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur flex-shrink-0">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/teams"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Teams
            </Link>
            <div className="w-px h-5 bg-gray-700" />
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-white">{team.name}</span>
              <span className="text-xs text-gray-500">{team.agentIds.length} agent{team.agentIds.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <button
            onClick={handleStartMeeting}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Start Meeting
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <TeamDashboardSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          taskCount={tasks.length}
          docCount={documents.length}
        />

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && (
            <TeamOverviewSection
              team={team}
              agents={agents}
              taskCount={tasks.length}
              docCount={documents.length}
              onUpdateTeam={updateTeam}
            />
          )}
          {activeTab === 'tasks' && (
            <TeamTasksSection
              teamId={teamId}
              agents={agents}
              teamAgentIds={team.agentIds}
            />
          )}
          {activeTab === 'kanban' && (
            <TeamKanbanSection
              teamId={teamId}
              teamName={team.name}
              agents={agents}
              teamAgentIds={team.agentIds}
            />
          )}
          {activeTab === 'documents' && (
            <TeamDocumentsSection teamId={teamId} />
          )}
          {activeTab === 'instructions' && (
            <TeamInstructionsSection
              instructions={team.instructions || ''}
              onSave={async (instructions) => { await updateTeam({ instructions }) }}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-950 px-4 py-2 flex-shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-center gap-1 md:gap-0 md:h-5">
          <p className="text-xs md:text-sm text-white leading-none">
            <VersionChecker /> • Made with <span className="text-red-500 text-lg inline-block scale-x-125">♥</span> in Boulder Colorado
          </p>
          <p className="text-xs md:text-sm text-white leading-none">
            Concept by{' '}
            <a href="https://x.com/jkpelaez" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">
              Juan Pelaez
            </a>{' '}
            @{' '}
            <a href="https://23blocks.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-red-500 hover:text-red-400 transition-colors">
              23blocks
            </a>
            . Coded by Claude
          </p>
        </div>
      </footer>
    </div>
  )
}
