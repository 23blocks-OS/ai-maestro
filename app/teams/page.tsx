'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Users } from 'lucide-react'
import TeamListCard from '@/components/teams/TeamListCard'
import TeamCreationWizard from '@/components/teams/TeamCreationWizard'
import { VersionChecker } from '@/components/VersionChecker'
import type { Team } from '@/types/team'

interface TeamWithCounts extends Team {
  taskCount: number
  docCount: number
}

export default function TeamsPage() {
  const router = useRouter()
  const [teams, setTeams] = useState<TeamWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [reservedNames, setReservedNames] = useState<{ teamNames: string[]; agentNames: string[] }>({ teamNames: [], agentNames: [] })
  const [nameValidation, setNameValidation] = useState<{ error: string | null; warning: string | null }>({ error: null, warning: null })

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams')
      if (!res.ok) return
      const data = await res.json()
      const teamsData: Team[] = data.teams || []

      // SF-028: Single bulk stats fetch replaces N+1 per-team task/document fetches
      let statsMap: Record<string, { taskCount: number; docCount: number }> = {}
      try {
        const statsRes = await fetch('/api/teams/stats')
        if (statsRes.ok) {
          statsMap = await statsRes.json()
        }
      } catch { /* stats fetch failed -- fall back to zero counts */ }

      const enriched = teamsData.map((team) => ({
        ...team,
        taskCount: statsMap[team.id]?.taskCount ?? 0,
        docCount: statsMap[team.id]?.docCount ?? 0,
      }))

      setTeams(enriched)
    } catch (err) {
      console.error('Failed to fetch teams:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  // Pre-load all team and agent names when Create dialog opens (for real-time collision checking)
  useEffect(() => {
    if (creating) {
      fetch('/api/teams/names')
        .then(res => res.ok ? res.json() : { teamNames: [], agentNames: [] })
        .then(data => setReservedNames(data))
        .catch(() => setReservedNames({ teamNames: [], agentNames: [] }))
    }
  }, [creating])

  // Escape key closes wizard (wizard also handles this internally)
  useEffect(() => {
    if (!creating) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCreating(false)
        setCreateError(null)
        setNameValidation({ error: null, warning: null })
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [creating])

  const handleDelete = async (teamId: string) => {
    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete team')
      setTeams(prev => prev.filter(t => t.id !== teamId))
      setDeleteConfirm(null)
    } catch (err) {
      console.error('Failed to delete team:', err)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur flex-shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Link>
            <div className="w-px h-5 bg-gray-700" />
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-white">Teams</span>
            </div>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Team
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-600/10 flex items-center justify-center">
              <Users className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-lg font-medium text-white mb-2">No teams yet</h2>
            <p className="text-sm text-gray-500 mb-6">Create a team to organize agents and collaborate</p>
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 text-sm px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Your First Team
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
            {teams.map(team => (
              <TeamListCard
                key={team.id}
                team={team}
                taskCount={team.taskCount}
                docCount={team.docCount}
                onClick={() => router.push(`/teams/${team.id}`)}
                onStartMeeting={() => router.push(`/team-meeting?team=${team.id}`)}
                onDelete={() => setDeleteConfirm(team.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Team Creation Wizard */}
      <TeamCreationWizard
        isOpen={creating}
        onClose={() => { setCreating(false); setCreateError(null); setNameValidation({ error: null, warning: null }) }}
        onCreated={(teamId) => { setCreating(false); router.push(`/teams/${teamId}`) }}
        reservedNames={reservedNames}
      />

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          {/* SF-012: Add dialog role and aria attributes for screen readers */}
          <div role="dialog" aria-modal="true" aria-labelledby="delete-team-title" className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4">
            <h4 id="delete-team-title" className="text-sm font-medium text-white mb-2">Delete Team</h4>
            <p className="text-xs text-gray-400 mb-4">Are you sure you want to delete team &apos;{teams.find(t => t.id === deleteConfirm)?.name || 'this team'}&apos;? This will remove the team but not its agents.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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
