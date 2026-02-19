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
  const [loading, setLoading] = useState(!!teamId)  // Start true only when teamId is provided, preventing "Team not found" flash
  const [error, setError] = useState<string | null>(null)

  const fetchTeam = useCallback(async () => {
    if (!teamId) return
    setError(null) // CC-008: Clear stale error at start so UI doesn't show old error during fetch
    try {
      const res = await fetch(`/api/teams/${teamId}`)
      if (!res.ok) throw new Error('Failed to fetch team')
      const data = await res.json()
      setTeam(data.team || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch team')
    }
  }, [teamId])

  // Initial fetch
  useEffect(() => {
    if (!teamId) {
      setTeam(null)
      setLoading(false)
      return
    }
    setLoading(true)
    fetchTeam().finally(() => setLoading(false))
  }, [teamId, fetchTeam])

  // CC-010: updateTeam throws on error to allow callers to handle in try/catch.
  // This is a deliberate pattern — unlike useGovernance which returns { success, error } objects.
  const updateTeam = useCallback(async (updates: { name?: string; description?: string; agentIds?: string[]; instructions?: string }) => {
    if (!teamId) return
    // CC-007: Optimistic update — server validates via validateTeamMutation.
    // TypeScript's excess property checking on object literals limits `updates` to declared keys,
    // but structural typing could allow extra keys at runtime; server is the authority.
    setTeam(prev => prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : prev)
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, lastActivityAt: new Date().toISOString() }),
      })
      if (!res.ok) {
        // CC-004: Don't call fetchTeam() here — the throw propagates to the catch block
        // which already calls fetchTeam() to revert the optimistic update
        throw new Error('Failed to update team')
      }
      const data = await res.json()
      setTeam(data.team)
    } catch (err) {
      await fetchTeam()  // Revert optimistic update on network error too
      throw err
    }
  }, [teamId, fetchTeam])

  return {
    team,
    loading,
    error,
    updateTeam,
    // CC-005: refreshTeam wraps fetchTeam with loading state for consistent UX
    refreshTeam: async () => {
      setLoading(true)
      try {
        await fetchTeam()
      } finally {
        setLoading(false)
      }
    },
  }
}
