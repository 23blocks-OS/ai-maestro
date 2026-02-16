'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Team } from '@/types/team'
import type { TransferRequest } from '@/types/governance'

export type GovernanceRole = 'manager' | 'chief-of-staff' | 'normal'

export interface GovernanceState {
  loading: boolean
  hasPassword: boolean
  hasManager: boolean
  managerId: string | null
  managerName: string | null
  agentRole: GovernanceRole
  cosTeams: Team[]
  memberTeams: Team[]
  allTeams: Team[]
  refresh: () => void
  setPassword: (pw: string, currentPw?: string) => Promise<{ success: boolean; error?: string }>
  assignManager: (agentId: string | null, pw: string) => Promise<{ success: boolean; error?: string }>
  assignCOS: (teamId: string, agentId: string | null, pw: string) => Promise<{ success: boolean; error?: string }>
  addAgentToTeam: (teamId: string, agentId: string) => Promise<{ success: boolean; error?: string }>
  removeAgentFromTeam: (teamId: string, agentId: string) => Promise<{ success: boolean; error?: string }>
  pendingTransfers: TransferRequest[]
  requestTransfer: (agentId: string, fromTeamId: string, toTeamId: string, note?: string) => Promise<{ success: boolean; error?: string; transferRequest?: TransferRequest }>
  resolveTransfer: (transferId: string, action: 'approve' | 'reject', rejectReason?: string) => Promise<{ success: boolean; error?: string }>
}

export function useGovernance(agentId: string | null): GovernanceState {
  const [loading, setLoading] = useState(true)
  const [hasPassword, setHasPassword] = useState(false)
  const [hasManager, setHasManager] = useState(false)
  const [managerId, setManagerId] = useState<string | null>(null)
  const [managerName, setManagerName] = useState<string | null>(null)
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [pendingTransfers, setPendingTransfers] = useState<TransferRequest[]>([])

  // Derive governance role from current state
  const agentRole: GovernanceRole = (() => {
    if (!agentId) return 'normal'
    if (managerId === agentId) return 'manager'
    const isCOS = allTeams.some(
      (t) => t.type === 'closed' && t.chiefOfStaffId === agentId
    )
    if (isCOS) return 'chief-of-staff'
    return 'normal'
  })()

  // Derive cosTeams: closed teams where this agent is chief-of-staff
  const cosTeams = agentId
    ? allTeams.filter((t) => t.type === 'closed' && t.chiefOfStaffId === agentId)
    : []

  // Derive memberTeams: teams where agentIds includes this agent
  const memberTeams = agentId
    ? allTeams.filter((t) => t.agentIds.includes(agentId))
    : []

  const refresh = useCallback(() => {
    // Fetch governance state and teams in parallel
    setLoading(true)
    Promise.all([
      fetch('/api/governance').then((r) => r.json()),
      fetch('/api/teams').then((r) => r.json()),
      fetch('/api/governance/transfers?status=pending').then((r) => r.json()).catch(() => ({ requests: [] })),
    ])
      .then(([govData, teamsData, transfersData]) => {
        setHasPassword(govData.hasPassword ?? false)
        setHasManager(govData.hasManager ?? false)
        setManagerId(govData.managerId ?? null)
        setManagerName(govData.managerName ?? null)
        setAllTeams(teamsData.teams ?? [])
        setPendingTransfers(transfersData.requests ?? [])
      })
      .catch(() => {
        // On fetch failure, reset to safe defaults
        setHasPassword(false)
        setHasManager(false)
        setManagerId(null)
        setManagerName(null)
        setAllTeams([])
        setPendingTransfers([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  // Fetch on mount and when agentId changes
  useEffect(() => {
    refresh()
  }, [agentId, refresh])

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
        refresh()
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
        refresh()
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
        refresh()
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to assign chief-of-staff' }
      }
    },
    [refresh]
  )

  const addAgentToTeam = useCallback(
    async (teamId: string, targetAgentId: string): Promise<{ success: boolean; error?: string }> => {
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

        const res = await fetch(`/api/teams/${teamId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentIds: updatedAgentIds }),
        })
        const data = await res.json()
        if (!res.ok) return { success: false, error: data.error || 'Failed to add agent to team' }
        refresh()
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to add agent to team' }
      }
    },
    [refresh]
  )

  const removeAgentFromTeam = useCallback(
    async (teamId: string, targetAgentId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        // Fetch current team to get existing agentIds
        const teamRes = await fetch(`/api/teams/${teamId}`)
        if (!teamRes.ok) return { success: false, error: 'Failed to fetch team' }
        const teamData = await teamRes.json()
        const team: Team = teamData.team

        const updatedAgentIds = team.agentIds.filter((id: string) => id !== targetAgentId)

        const res = await fetch(`/api/teams/${teamId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentIds: updatedAgentIds }),
        })
        const data = await res.json()
        if (!res.ok) return { success: false, error: data.error || 'Failed to remove agent from team' }
        refresh()
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to remove agent from team' }
      }
    },
    [refresh]
  )

  const requestTransfer = useCallback(
    async (targetAgentId: string, fromTeamId: string, toTeamId: string, note?: string) => {
      try {
        const res = await fetch('/api/governance/transfers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: targetAgentId, fromTeamId, toTeamId, requestedBy: agentId, note }),
        })
        const data = await res.json()
        if (!res.ok) return { success: false, error: data.error || 'Failed to create transfer request' }
        refresh()
        return { success: true, transferRequest: data.request }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to create transfer request' }
      }
    },
    [agentId, refresh]
  )

  const resolveTransfer = useCallback(
    async (transferId: string, action: 'approve' | 'reject', rejectReason?: string) => {
      try {
        const res = await fetch(`/api/governance/transfers/${transferId}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, resolvedBy: agentId, rejectReason }),
        })
        const data = await res.json()
        if (!res.ok) return { success: false, error: data.error || 'Failed to resolve transfer' }
        refresh()
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
    agentRole,
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
  }
}
