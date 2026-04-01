'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Team } from '@/types/team'
import type { TransferRequest, GovernanceTitle } from '@/types/governance'
import type { GovernanceRequest } from '@/types/governance-request'
import { ROLE_PLUGIN_PROGRAMMER } from '@/lib/ecosystem-constants'

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
  memberTeam: Team | null  // Agent can be in 0 or 1 team (governance simplification)
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
  // Explicit governance title stored on the agent (e.g. 'architect', 'integrator')
  const [agentStoredTitle, setAgentStoredTitle] = useState<string | null>(null)

  // SF-016: Guard against concurrent read-modify-write in addAgentToTeam / removeAgentFromTeam
  const isMutatingRef = useRef(false)

  // SF-023: Track mount state so stale refresh callbacks don't update unmounted component
  const isMountedRef = useRef(true)

  // SF-040: AbortController for mutation-triggered refresh() calls — aborted on unmount
  // so fire-and-forget refreshes don't update state after the component is gone
  const mutationAbortRef = useRef<AbortController | null>(null)

  // Derive governance title from current state
  // All teams are implicitly closed (governance simplification — open teams removed)
  // Priority: manager > chief-of-staff > architect > orchestrator > integrator > member > autonomous
  // 'autonomous' is the default for agents not assigned to any team
  const agentTitle: GovernanceTitle = useMemo(() => {
    if (!agentId) return 'autonomous'
    if (managerId === agentId) return 'manager'
    const isCOS = allTeams.some(
      (t) => t.chiefOfStaffId === agentId
    )
    if (isCOS) return 'chief-of-staff'
    // Orchestrator: assigned per-team via orchestratorId (primary kanban manager)
    const isOrchestrator = allTeams.some(
      (t) => t.orchestratorId === agentId
    )
    if (isOrchestrator) return 'orchestrator'
    // Check explicit title stored on the agent (architect, integrator, orchestrator)
    // Note: orchestrator is ALSO checked via team.orchestratorId above — this fallback
    // catches cases where governanceTitle was set but team.orchestratorId wasn't updated yet
    if (agentStoredTitle && ['architect', 'integrator', 'orchestrator'].includes(agentStoredTitle)) {
      return agentStoredTitle as GovernanceTitle
    }
    // 'member' applies to agents in a team without a specific elevated title
    const isInAnyTeam = allTeams.some(
      (t) => t.agentIds?.includes(agentId)
    )
    if (isInAnyTeam) return 'member'
    // Default: agent is not part of any team — operates autonomously
    return 'autonomous'
  }, [agentId, managerId, allTeams, agentStoredTitle])

  // Derive cosTeams: teams where this agent is chief-of-staff
  // All teams are implicitly closed (governance simplification — open teams removed)
  const cosTeams = useMemo(() => agentId
    ? allTeams.filter((t) => t.chiefOfStaffId === agentId)
    : [], [agentId, allTeams])

  // Derive memberTeam: the single team this agent belongs to (0 or 1 team per governance simplification)
  const memberTeam = useMemo(() => {
    if (!agentId) return null
    return allTeams.find((t) => t.agentIds.includes(agentId)) ?? null
  }, [agentId, allTeams])

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
      // Fetch agent's explicit governanceTitle (e.g. architect, integrator)
      agentId
        ? fetch(`/api/agents/${agentId}`, { signal }).then((r) => {
            if (!r.ok) throw new Error('Request failed')
            return r.json()
          }).catch((err) => {
            if (err?.name === 'AbortError') return // Component unmounted
            console.error('[governance] agent fetch error:', err)
            return null
          })
        : Promise.resolve(null),
    ])
      .then(([govData, teamsData, transfersData, configReqData, agentData]) => {
        if (signal?.aborted) return  // Stale response guard
        // CC-003: Guard against undefined data (AbortError catch returns undefined)
        if (!govData || !teamsData || !transfersData || !configReqData) return
        // SF-023: Don't update state after unmount
        if (!isMountedRef.current) return
        // React 18+ batches these setters into a single re-render automatically
        setHasPassword(govData.hasPassword ?? false)
        setHasManager(govData.hasManager ?? false)
        setManagerId(govData.managerId ?? null)
        setManagerName(govData.managerName ?? null)
        setAllTeams(teamsData.teams ?? [])
        setPendingTransfers(transfersData.requests ?? [])
        setPendingConfigRequests(configReqData.requests ?? [])
        // Store explicit governance title from agent record (may be null if not set)
        // BUG FIX: GET /api/agents/{id} returns { agent: { governanceTitle: ... } } — NOT { governanceTitle: ... }
        // The response is ALWAYS nested under .agent — forgetting this nesting causes the title to silently be null
        // and fall through to 'autonomous'/'member' default. ALWAYS use agentData.agent.field, never agentData.field.
        setAgentStoredTitle(agentData?.agent?.governanceTitle ?? null)
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
        setAgentStoredTitle(null)
      })
      .finally(() => {
        // CC-001: Prevent setting state on aborted/stale requests (e.g. unmount or rapid agentId change)
        // The abort() in the useEffect cleanup is called before isMountedRef.current = false,
        // so signal?.aborted already covers the unmount case — no redundant isMountedRef check needed.
        if (signal?.aborted) return
        setLoading(false)
      })
  // CC-009: agentId is needed to fetch the correct agent's governanceTitle.
  // Other deps (fetch, setState) are stable and don't need to be listed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  // Fetch on mount and when agentId changes; abort stale requests on re-render
  useEffect(() => {
    isMountedRef.current = true // SF-023: Re-arm on agentId change
    const controller = new AbortController()
    refresh(controller.signal)
    // SF-042: Track per-tick AbortControllers so cleanup aborts any in-flight poll fetch
    let pollController: AbortController | null = null
    // Poll every 10s to pick up external changes (team edits from sidebar, group subscriptions)
    // Each tick gets its own AbortController so aborting mount controller doesn't leak into polls
    const interval = setInterval(() => {
      if (isMountedRef.current) {
        pollController = new AbortController()
        refresh(pollController.signal)
      }
    }, 10_000)
    return () => {
      clearInterval(interval)
      controller.abort()
      pollController?.abort() // Abort any in-flight poll fetch
      // SF-040: Also abort any in-flight mutation-triggered refreshes
      mutationAbortRef.current?.abort()
      isMountedRef.current = false // SF-023: Prevent state updates after unmount
    }
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

        const res = await fetch(`/api/teams/${teamId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentIds: updatedAgentIds }),
        })
        if (!res.ok) {
          const errData = await res.json()
          return { success: false, error: errData.error || 'Failed to add agent to team' }
        }
        // Phase 3: Auto-assign MEMBER role + default programmer plugin when agent joins a team
        await fetch(`/api/agents/${targetAgentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'member', governanceTitle: null }),
        })
        // Auto-install default programmer plugin for MEMBER title
        const agentRes = await fetch(`/api/agents/${targetAgentId}`)
        if (agentRes.ok) {
          const agentData = await agentRes.json()
          const workDir = agentData.agent?.workingDirectory
          if (workDir) {
            await fetch('/api/agents/role-plugins/install', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pluginName: ROLE_PLUGIN_PROGRAMMER, agentDir: workDir }),
            }).catch(() => {}) // Best-effort — don't fail the join if plugin install fails
          }
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
        // Phase 3: Revert to AUTONOMOUS role + uninstall team plugin when agent leaves
        await fetch(`/api/agents/${targetAgentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'autonomous', governanceTitle: null }),
        })
        // Uninstall current role-plugin (MEMBER plugins are not valid for AUTONOMOUS)
        const agentRes = await fetch(`/api/agents/${targetAgentId}`)
        if (agentRes.ok) {
          const agentData = await agentRes.json()
          const workDir = agentData.agent?.workingDirectory
          const currentPlugin = agentData.agent?.programArgs?.match(/--agent\s+(\S+)/)?.[1]
          if (workDir && currentPlugin) {
            // Extract plugin name from main-agent name (e.g. "ai-maestro-programmer-agent-main-agent" → "ai-maestro-programmer-agent")
            const pluginName = currentPlugin.replace(/-main-agent$/, '')
            await fetch('/api/agents/role-plugins/install', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pluginName, agentDir: workDir }),
            }).catch(() => {}) // Best-effort uninstall
          }
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
            // Preserve the parse error so callers get a meaningful message instead of a bare HTTP status
            return { error: `Failed to parse server response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}` }
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
            // Preserve the parse error so callers get a meaningful message instead of a bare HTTP status
            return { error: `Failed to parse server response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}` }
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
    memberTeam,
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
