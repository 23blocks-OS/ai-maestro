'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Team } from '@/types/team'

interface UseTeamResult {
  team: Team | null
  loading: boolean
  error: string | null
  updateTeam: (updates: { name?: string; description?: string; agentIds?: string[]; instructions?: string }) => Promise<void>
  refreshTeam: () => Promise<void>
}

export function useTeam(teamId: string | null): UseTeamResult {
  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTeam = useCallback(async () => {
    if (!teamId) return
    try {
      const res = await fetch(`/api/teams/${teamId}`)
      if (!res.ok) throw new Error('Failed to fetch team')
      const data = await res.json()
      setTeam(data.team || null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch team')
    }
  }, [teamId])

  // Initial fetch
  useEffect(() => {
    if (!teamId) {
      setTeam(null)
      return
    }
    setLoading(true)
    fetchTeam().finally(() => setLoading(false))
  }, [teamId, fetchTeam])

  const updateTeam = useCallback(async (updates: { name?: string; description?: string; agentIds?: string[]; instructions?: string }) => {
    if (!teamId) return
    // Optimistic update
    setTeam(prev => prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : prev)
    const res = await fetch(`/api/teams/${teamId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, lastActivityAt: new Date().toISOString() }),
    })
    if (!res.ok) {
      await fetchTeam() // Revert optimistic update
      throw new Error('Failed to update team')
    }
    const data = await res.json()
    setTeam(data.team)
  }, [teamId, fetchTeam])

  return {
    team,
    loading,
    error,
    updateTeam,
    refreshTeam: fetchTeam,
  }
}
