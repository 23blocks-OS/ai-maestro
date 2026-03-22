'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Team } from '@/types/team'
import type { TransferRequest, GovernanceTitle } from '@/types/governance'
import type { GovernanceRequest } from '@/types/governance-request'

// Re-export so downstream consumers still work
export type { GovernanceTitle } from '@/types/governance'
/** @deprecated Use GovernanceTitle */
export type { GovernanceRole } from '@/types/governance'

export interface GovernanceState {
  loading: boolean
  hasPassword: boolean
  hasManager: boolean
  managerId: string | null
  managerName: string | null
  agentTitle: GovernanceTitle
  cosTeams: Team[]
  memberTeams: Team[]
  allTeams: Team[]
  refresh: (signal?: AbortSignal) => void
  setPassword: (pw: string, currentPw?: string) => Promise<{ success: boolean; error?: string }>
  assignManager: (agentId: string | null, pw: string) => Promise<{ success: boolean; error?: string }>
  assignCOS: (teamId: string, agentId: string | null, pw: string) => Promise<{ success: boolean; error?: string }>
  addAgentToTeam: (teamId: string, agentId: string) => Promise<{ success: boolean; error?: string }>
  removeAgentFromTeam: (teamId: string, agentId: string) => Promise<{ success: boolean; error?: string }>
  pendingTransfers: TransferRequest[]
  requestTransfer: (agentId: string, fromTeamId: string, toTeamId: string, note?: string) => Promise<{ success: boolean; error?: string; transferRequest?: TransferRequest }>
  resolveTransfer: (transferId: string, action: 'approve' | 'reject', rejectReason?: string) => Promise<{ success: boolean; error?: string }>
  pendingConfigRequests: GovernanceRequest[]
  submitConfigRequest: (agentId: string, config: Record<string, unknown>, password: string, requestedBy: string, requestedByRole: string, targetHostId?: string) => Promise<{ success: boolean; error?: string; requestId?: string }>
  resolveConfigRequest: (requestId: string, approved: boolean, password: string, resolverAgentId: string, reason?: string) => Promise<{ success: boolean; error?: string }>
}

export function useGovernance(agentId: string | null): GovernanceState {
  const [loading, setLoading] = useState(true)
  const [hasPassword, setHasPassword] = useState(false)
  const [hasManager, setHasManager] = useState(false)
  const [managerId, setManagerId] = useState<string | null>(null)
  const [managerName, setManagerName] = useState<string | null>(null)
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [pendingTransfers, setPendingTransfers] = useState<TransferRequest[]>([])
  const [pendingConfigRequests, setPendingConfigRequests] = useState<GovernanceRequest[]>([])

  // SF-016: Guard against concurrent read-modify-write in addAgentToTeam / removeAgentFromTeam
  const isMutatingRef = useRef(false)

  // SF-023: Track mount state so stale refresh callbacks don't update unmounted component
  const isMountedRef = useRef(true)

  // SF-040: AbortController for mutation-triggered refresh() calls — aborted on unmount
  // so fire-and-forget refreshes don't update state after the component is gone
  const mutationAbortRef = useRef<AbortController | null>(null)

  // Derive governance title from current state
  const agentTitle: GovernanceTitle = useMemo(() => {
    if (!agentId) return 'member'
    if (managerId === agentId) return 'manager'
    // team.type is now required per types/team.ts
    const isCOS = allTeams.some(
      (t) => t.type === 'closed' && t.chiefOfStaffId === agentId
    )
    if (isCOS) return 'chief-of-staff'
    return 'member'
  }, [agentId, managerId, allTeams])

  // Derive cosTeams: closed teams where this agent is chief-of-staff
  // team.type is now required per types/team.ts
  const cosTeams = useMemo(() => agentId
    ? allTeams.filter((t) => t.type === 'closed' && t.chiefOfStaffId === agentId)
    : [], [agentId, allTeams])

  // Derive memberTeams: teams where agentIds includes this agent
  const memberTeams = useMemo(() => agentId
    ? allTeams.filter((t) => t.agentIds.includes(agentId))
    : [], [agentId, allTeams])

  const refresh = useCallback((signal?: AbortSignal) => {
    // Fetch governance state and teams in parallel
    setLoading(true)
    Promise.all([
      fetch('/api/governance', { signal }).then((r) => {
        if (!r.ok) throw new Error('Request failed')
        return r.json()
      }).catch((err) => {
        if (err?.name === 'AbortError') return // Component unmounted
        console.error('[governance] fetch error:', err)
        return { hasPassword: false, hasManager: false, managerId: null, managerName: null }
      }),
      fetch('/api/teams', { signal }).then((r) => {
        if (!r.ok) throw new Error('Request failed')
        return r.json()
      }).catch((err) => {
        if (err?.name === 'AbortError') return // Component unmounted
        console.error('[governance] fetch error:', err)
        return { teams: [] }
      }),
      fetch('/api/governance/transfers?status=pending', { signal }).then((r) => {
        if (!r.ok) throw new Error('Request failed')
        return r.json()
      }).catch((err) => {
        if (err?.name === 'AbortError') return // Component unmounted
        console.error('[governance] fetch error:', err)
        return { requests: [] }
      }),
      fetch('/api/v1/governance/requests?type=configure-agent&status=pending', { signal }).then((r) => {
        if (!r.ok) throw new Error('Request failed')
        return r.json()
      }).catch((err) => {
        if (err?.name === 'AbortError') return // Component unmounted
        console.error('[governance] config requests fetch error:', err)
        return { requests: [] }
      }),
    ])
      .then(([govData, teamsData, transfersData, configReqData]) => {
        if (signal?.aborted) return  // Stale response guard
        // CC-003: Guard against undefined data (AbortError catch returns undefined)
        if (!govData || !teamsData || !transfersData || !configReqData) return
        // SF-023: Don't update state after unmount
        if (!isMountedRef.current) return
        // React 18+ batches these 6 setters into a single re-render automatically
        setHasPassword(govData.hasPassword ?? false)
        setHasManager(govData.hasManager ?? false)
        setManagerId(govData.managerId ?? null)
        setManagerName(govData.managerName ?? null)
        setAllTeams(teamsData.teams ?? [])
        setPendingTransfers(transfersData.requests ?? [])
        setPendingConfigRequests(configReqData.requests ?? [])
      })
      .catch(() => {
        if (!isMountedRef.current) return // SF-023: Don't update state after unmount
        // On fetch failure, reset to safe defaults
        setHasPassword(false)
        setHasManager(false)
        setManagerId(null)
        setManagerName(null)
        setAllTeams([])
        setPendingTransfers([])
        setPendingConfigRequests([])
      })
      .finally(() => {
        // CC-001: Prevent setting state on aborted/stale requests (e.g. unmount or rapid agentId change)
        if (signal?.aborted) return
        if (!isMountedRef.current) return // SF-023: Don't update state after unmount
        setLoading(false)
      })
  // CC-009: Empty deps is intentional — refresh only uses fetch (global) + setState (stable),
  // signal is passed as a parameter. refresh never changes identity, which is the desired behavior.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch on mount and when agentId changes; abort stale requests on re-render
  useEffect(() => {
    isMountedRef.current = true // SF-023: Re-arm on agentId change
    const controller = new AbortController()
    refresh(controller.signal)
    return () => {
      controller.abort()
      // SF-040: Also abort any in-flight mutation-triggered refreshes
      mutationAbortRef.current?.abort()
      isMountedRef.current = false // SF-023: Prevent state updates after unmount
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable (empty deps), only agentId triggers re-fetch
  }, [agentId])

  const setPassword = useCallback(
    async (pw: string, currentPw?: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/governance/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw, currentPassword: currentPw }),
        })
        const data = await res.json()
        if (!res.ok) return { success: false, error: data.error || 'Failed to set password' }
        // CC-002 + SF-040: Fire-and-forget refresh with abort signal so unmount cancels in-flight fetch
        mutationAbortRef.current?.abort()
        mutationAbortRef.current = new AbortController()
        refresh(mutationAbortRef.current.signal)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to set password' }
      }
    },
    [refresh]
  )

  const assignManager = useCallback(
    async (targetAgentId: string | null, pw: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/governance/manager', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: targetAgentId, password: pw }),
        })
        const data = await res.json()
        if (!res.ok) return { success: false, error: data.error || 'Failed to assign manager' }
        // CC-002 + SF-040: Fire-and-forget refresh with abort signal so unmount cancels in-flight fetch
        mutationAbortRef.current?.abort()
        mutationAbortRef.current = new AbortController()
        refresh(mutationAbortRef.current.signal)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to assign manager' }
      }
    },
    [refresh]
  )

  const assignCOS = useCallback(
    async (teamId: string, targetAgentId: string | null, pw: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/teams/${teamId}/chief-of-staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: targetAgentId, password: pw }),
        })
        const data = await res.json()
        if (!res.ok) return { success: false, error: data.error || 'Failed to assign chief-of-staff' }
        // CC-002 + SF-040: Fire-and-forget refresh with abort signal so unmount cancels in-flight fetch
        mutationAbortRef.current?.abort()
        mutationAbortRef.current = new AbortController()
        refresh(mutationAbortRef.current.signal)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to assign chief-of-staff' }
      }
    },
    [refresh]
  )

  // KNOWN LIMITATION (Phase 1): Client-side read-modify-write pattern.
  // Two concurrent browser tabs modifying the same team's agentIds can cause lost updates.
  // CC-006: TOCTOU race — Server validates via validateTeamMutation, so client-side
  // optimistic update may be reverted if the server rejects the mutation.
  // TODO Phase 2: Replace with atomic server-side POST /api/teams/{id}/members endpoint
  // that accepts { action: 'add'|'remove', agentId: string } and performs the operation
  // under withLock, eliminating the race condition entirely.
  const addAgentToTeam = useCallback(
    async (teamId: string, targetAgentId: string): Promise<{ success: boolean; error?: string }> => {
      // SF-016: Prevent concurrent read-modify-write mutations
      if (isMutatingRef.current) return { success: false, error: 'Another team mutation is in progress' }
      isMutatingRef.current = true
      try {
        // Fetch current team to get existing agentIds
        const teamRes = await fetch(`/api/teams/${teamId}`)
        if (!teamRes.ok) return { success: false, error: 'Failed to fetch team' }
        const teamData = await teamRes.json()
        const team: Team = teamData.team

        // Add agent if not already present
        const updatedAgentIds = team.agentIds.includes(targetAgentId)
          ? team.agentIds
          : [...team.agentIds, targetAgentId]

        // Server enforces team membership rules; no client-side allTeams check needed
        // team.type is now required per types/team.ts

        const res = await fetch(`/api/teams/${teamId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentIds: updatedAgentIds }),
        })
        if (!res.ok) {
          const errData = await res.json()
          return { success: false, error: errData.error || 'Failed to add agent to team' }
        }
        // MF-014 + SF-040: Use mutationAbortRef so unmount cancels in-flight refresh
        mutationAbortRef.current?.abort()
        mutationAbortRef.current = new AbortController()
        refresh(mutationAbortRef.current.signal)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to add agent to team' }
      } finally {
        isMutatingRef.current = false // SF-016: Release mutation lock
      }
    },
    [refresh]
  )

  // KNOWN LIMITATION (Phase 1): Client-side read-modify-write pattern.
  // Two concurrent browser tabs modifying the same team's agentIds can cause lost updates.
  // CC-006: TOCTOU race — Server validates via validateTeamMutation, so client-side
  // optimistic update may be reverted if the server rejects the mutation.
  // TODO Phase 2: Replace with atomic server-side POST /api/teams/{id}/members endpoint
  // that accepts { action: 'add'|'remove', agentId: string } and performs the operation
  // under withLock, eliminating the race condition entirely.
  const removeAgentFromTeam = useCallback(
    async (teamId: string, targetAgentId: string): Promise<{ success: boolean; error?: string }> => {
      // SF-016: Prevent concurrent read-modify-write mutations
      if (isMutatingRef.current) return { success: false, error: 'Another team mutation is in progress' }
      isMutatingRef.current = true
      try {
        // Fetch current team to get existing agentIds
        const teamRes = await fetch(`/api/teams/${teamId}`)
        if (!teamRes.ok) return { success: false, error: 'Failed to fetch team' }
        const teamData = await teamRes.json()
        const team: Team = teamData.team

        // Client-side COS removal guard (R4.7) — cannot remove COS from agentIds, server enforces too
        if (team.chiefOfStaffId === targetAgentId) {
          return { success: false, error: 'Cannot remove the Chief-of-Staff from team members — remove the COS role first' }
        }

        const updatedAgentIds = team.agentIds.filter((id: string) => id !== targetAgentId)

        const res = await fetch(`/api/teams/${teamId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentIds: updatedAgentIds }),
        })
        if (!res.ok) {
          const errData = await res.json()
          return { success: false, error: errData.error || 'Failed to remove agent from team' }
        }
        // MF-014 + SF-040: Use mutationAbortRef so unmount cancels in-flight refresh
        mutationAbortRef.current?.abort()
        mutationAbortRef.current = new AbortController()
        refresh(mutationAbortRef.current.signal)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to remove agent from team' }
      } finally {
        isMutatingRef.current = false // SF-016: Release mutation lock
      }
    },
    [refresh]
  )

  const submitConfigRequest = useCallback(
    async (targetAgentId: string, config: Record<string, unknown>, password: string, requestedBy: string, requestedByRole: string, targetHostId?: string): Promise<{ success: boolean; error?: string; requestId?: string }> => {
      try {
        const res = await fetch('/api/v1/governance/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'configure-agent',
            targetHostId: targetHostId || 'localhost',
            requestedBy,
            requestedByRole,
            password,
            payload: { agentId: targetAgentId, configuration: config },
          })
        })
        if (!res.ok) {
          const data = await res.json().catch((parseErr: unknown) => {
            console.warn('[useGovernance] Failed to parse response JSON:', parseErr)
            return {}
          })
          return { success: false, error: data.error || `HTTP ${res.status}` }
        }
        const data = await res.json()
        // MF-014 + SF-040: Use mutationAbortRef so unmount cancels in-flight refresh
        mutationAbortRef.current?.abort()
        mutationAbortRef.current = new AbortController()
        refresh(mutationAbortRef.current.signal)
        return { success: true, requestId: data.id }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
      }
    },
    [refresh]
  )

  const resolveConfigRequest = useCallback(
    async (requestId: string, approved: boolean, password: string, resolverAgentId: string, reason?: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const endpoint = approved ? 'approve' : 'reject'
        // Approve requires approverAgentId + password; reject requires rejectorAgentId + password + reason
        const body = approved
          ? { approverAgentId: resolverAgentId, password }
          : { rejectorAgentId: resolverAgentId, password, reason }
        const res = await fetch(`/api/v1/governance/requests/${requestId}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        if (!res.ok) {
          const data = await res.json().catch((parseErr: unknown) => {
            console.warn('[useGovernance] Failed to parse response JSON:', parseErr)
            return {}
          })
          return { success: false, error: data.error || `HTTP ${res.status}` }
        }
        // MF-014 + SF-040: Use mutationAbortRef so unmount cancels in-flight refresh
        mutationAbortRef.current?.abort()
        mutationAbortRef.current = new AbortController()
        refresh(mutationAbortRef.current.signal)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
      }
    },
    [refresh]
  )

  const requestTransfer = useCallback(
    async (targetAgentId: string, fromTeamId: string, toTeamId: string, note?: string): Promise<{ success: boolean; error?: string; transferRequest?: TransferRequest }> => {
      if (!agentId) return { success: false, error: 'No agent selected' } // Guard against null agentId
      try {
        const res = await fetch('/api/governance/transfers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: targetAgentId, fromTeamId, toTeamId, requestedBy: agentId, note }),
        })
        const data = await res.json()
        if (!res.ok) return { success: false, error: data.error || 'Failed to create transfer request' }
        // MF-014 + SF-040: Use mutationAbortRef so unmount cancels in-flight refresh
        mutationAbortRef.current?.abort()
        mutationAbortRef.current = new AbortController()
        refresh(mutationAbortRef.current.signal)
        return { success: true, transferRequest: data.request }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to create transfer request' }
      }
    },
    [agentId, refresh]
  )

  const resolveTransfer = useCallback(
    async (transferId: string, action: 'approve' | 'reject', rejectReason?: string): Promise<{ success: boolean; error?: string }> => {
      if (!agentId) return { success: false, error: 'No agent selected' } // Guard against null agentId
      try {
        const res = await fetch(`/api/governance/transfers/${transferId}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, resolvedBy: agentId, rejectReason }),
        })
        const data = await res.json()
        if (!res.ok) return { success: false, error: data.error || 'Failed to resolve transfer' }
        // MF-014 + SF-040: Use mutationAbortRef so unmount cancels in-flight refresh
        mutationAbortRef.current?.abort()
        mutationAbortRef.current = new AbortController()
        refresh(mutationAbortRef.current.signal)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to resolve transfer' }
      }
    },
    [agentId, refresh]
  )

  return {
    loading,
    hasPassword,
    hasManager,
    managerId,
    managerName,
    agentTitle,
    cosTeams,
    memberTeams,
    allTeams,
    refresh,
    setPassword,
    assignManager,
    assignCOS,
    addAgentToTeam,
    removeAgentFromTeam,
    pendingTransfers,
    requestTransfer,
    resolveTransfer,
    pendingConfigRequests,
    submitConfigRequest,
    resolveConfigRequest,
  }
}
