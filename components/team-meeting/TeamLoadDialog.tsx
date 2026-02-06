'use client'

import { useState, useEffect } from 'react'
import { X, Users, Trash2, Loader2 } from 'lucide-react'
import type { Team } from '@/types/team'

interface TeamLoadDialogProps {
  isOpen: boolean
  onClose: () => void
  onLoad: (team: Team) => void
}

export default function TeamLoadDialog({
  isOpen,
  onClose,
  onLoad,
}: TeamLoadDialogProps) {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen) return

    const fetchTeams = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/teams')
        const data = await res.json()
        setTeams(data.teams || [])
      } catch (error) {
        console.error('Failed to load teams:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTeams()
  }, [isOpen])

  const handleDelete = async (teamId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/teams/${teamId}`, { method: 'DELETE' })
      setTeams(prev => prev.filter(t => t.id !== teamId))
    } catch (error) {
      console.error('Failed to delete team:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-medium text-white">Load Team</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <p className="text-sm">No saved teams</p>
              <p className="text-xs mt-1">Save a team to reuse it later</p>
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map(team => (
                <div
                  key={team.id}
                  onClick={() => onLoad(team)}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/60 hover:bg-gray-800 cursor-pointer transition-colors group"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{team.name}</p>
                    <p className="text-xs text-gray-500">
                      {team.agentIds.length} agent{team.agentIds.length !== 1 ? 's' : ''}
                      {team.description ? ` \u2022 ${team.description}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(team.id, e)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete team"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
