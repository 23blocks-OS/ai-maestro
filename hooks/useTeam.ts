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

  // MF-005: Accept optional AbortSignal to cancel stale fetches on unmount/teamId change
  const fetchTeam = useCallback(async (signal?: AbortSignal) => {
    if (!teamId) return
    setError(null) // CC-008: Clear stale error at start so UI doesn't show old error during fetch
    try {
      const res = await fetch(`/api/teams/${teamId}`, { signal })
      if (!res.ok) throw new Error('Failed to fetch team')
      const data = await res.json()
      // MF-005: Guard against setting state after abort
      if (signal?.aborted) return
      setTeam(data.team || null)
    } catch (err) {
      // MF-005: Silently ignore AbortError — expected when component unmounts or teamId changes
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to fetch team')
    }
  }, [teamId])

  // Initial fetch with AbortController for cleanup on unmount/teamId change
  useEffect(() => {
    if (!teamId) {
      setTeam(null)
      setLoading(false)
      return
    }
    // MF-005: AbortController cancels in-flight fetch when teamId changes or component unmounts
    const controller = new AbortController()
    setLoading(true)
    fetchTeam(controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [teamId, fetchTeam])

  // CC-010: updateTeam throws on error to allow callers to handle in try/catch.
  // This is a deliberate pattern — unlike useGovernance which returns { success, error } objects.
  const updateTeam = useCallback(async (updates: { name?: string; description?: string; agentIds?: string[]; instructions?: string }) => {
    if (!teamId) return
    // CC-007: Optimistic update — pick only valid team-update keys before spreading.
    // Structural typing could allow extra keys at runtime; explicit key filtering prevents
    // unexpected properties from polluting the team object. Server is the authority.
    // CC-P1-709: Include 'instructions' so optimistic update applies it immediately in the UI
    const validKeys = ['name', 'description', 'type', 'agentIds', 'chiefOfStaffId', 'managerId', 'instructions'] as const
    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([k]) => (validKeys as readonly string[]).includes(k))
    )
    setTeam(prev => prev ? { ...prev, ...safeUpdates, updatedAt: new Date().toISOString() } : prev)
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
