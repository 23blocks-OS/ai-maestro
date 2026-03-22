'use client'

import { useState, useRef, useEffect } from 'react'
import { Building2, Lock, Unlock, Plus, X, ChevronDown, Clock, Check, XCircle } from 'lucide-react'
import type { Team } from '@/types/team'
import type { GovernanceTitle } from '@/types/governance'
import type { TransferRequest } from '@/types/governance'

interface TeamMembershipSectionProps {
  agentId: string
  agentTitle: GovernanceTitle
  memberTeams: Team[]   // teams this agent belongs to
  allTeams: Team[]      // all teams (for join dropdown)
  onJoinTeam: (teamId: string) => Promise<{ success: boolean; error?: string }>
  onLeaveTeam: (teamId: string) => Promise<{ success: boolean; error?: string }>
  pendingTransfers?: TransferRequest[]
  onRequestTransfer?: (agentId: string, fromTeamId: string, toTeamId: string) => Promise<{ success: boolean; error?: string }>
  onResolveTransfer?: (transferId: string, action: 'approve' | 'reject') => Promise<{ success: boolean; error?: string }>
}

export default function TeamMembershipSection({
  agentId,
  agentTitle,
  memberTeams,
  allTeams,
  onJoinTeam,
  onLeaveTeam,
  pendingTransfers,
  onRequestTransfer,
  onResolveTransfer,
}: TeamMembershipSectionProps) {
  const [showJoinDropdown, setShowJoinDropdown] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null) // tracks teamId being acted on
  const [resolvingTransferId, setResolvingTransferId] = useState<string | null>(null) // tracks transferId being resolved
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showJoinDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowJoinDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showJoinDropdown])

  // Determine which teams this agent can join.
  // Managers and COS can SEE closed teams in the dropdown, but joining a closed team
  // requires a transfer request — the Join button opens a transfer request flow rather
  // than directly adding the agent. Direct joining is only allowed for open teams.
  // Managers bypass the transfer requirement entirely (they have full authority).
  const memberTeamIds = new Set(memberTeams.map(t => t.id))
  const canSeeClosedTeams = agentTitle === 'manager' || agentTitle === 'chief-of-staff'
  const joinableTeams = allTeams.filter(t => {
    if (memberTeamIds.has(t.id)) return false
    if (canSeeClosedTeams) return true
    // Normal agents can only join non-closed teams
    return t.type !== 'closed'
  })

  // Filter pending transfers to only those relevant to this agent:
  // - transfers where this agent is being transferred
  // - transfers where this agent is the source team's COS (can approve/reject)
  const relevantTransfers = (pendingTransfers || []).filter(transfer => {
    if (transfer.agentId === agentId) return true
    const fromTeam = allTeams.find(t => t.id === transfer.fromTeamId)
    if (fromTeam?.chiefOfStaffId === agentId) return true
    return false
  })

  const handleJoin = async (teamId: string) => {
    setError(null)
    setInfoMessage(null) // Clear stale info messages before new action
    setLoading(teamId)
    try {
      const targetTeam = allTeams.find(t => t.id === teamId)

      // Managers bypass all transfer requirements — they have full authority
      if (agentTitle === 'manager') {
        const result = await onJoinTeam(teamId)
        if (result.success) {
          setShowJoinDropdown(false)
        } else {
          setError(result.error || 'Failed to join team')
        }
        return
      }

      // Check if a transfer request is needed. Two scenarios require transfers:
      // 1. The agent is currently in a closed team led by someone else (source COS must approve departure)
      // 2. The target team is closed (target COS must approve entry)
      // Direct joining is only allowed for open teams when the agent is not locked in a closed team.
      const closedSourceTeams = memberTeams.filter(t =>
        t.type === 'closed' && t.chiefOfStaffId && t.chiefOfStaffId !== agentId
      )
      const targetIsClosed = targetTeam?.type === 'closed'

      // Transfer request needed if source team is closed (departure approval)
      // or target team is closed (entry approval) — either case requires COS oversight
      const needsTransfer = closedSourceTeams.length > 0 || targetIsClosed

      if (needsTransfer && onRequestTransfer) {
        // Determine the source team for the transfer request.
        // If the agent is in a closed team, use that as the source (departure + arrival approval).
        // If the agent is NOT in a closed team but the target is closed, use the agent's
        // first team as source context (the target COS still needs to approve entry).
        const sourceTeam = closedSourceTeams.length > 0
          ? closedSourceTeams[0]  // Business rule R3: agent can only be in one closed team at a time
          : memberTeams[0]        // Fallback: use first team as transfer source context

        if (!sourceTeam) {
          // Agent has no teams yet — cannot create a transfer request, server must enforce
          setError('Cannot join a closed team without an existing team membership. Contact the team\'s Chief-of-Staff.')
          return
        }

        const result = await onRequestTransfer(agentId, sourceTeam.id, teamId)
        if (result.success) {
          setShowJoinDropdown(false)
          setError(null)
          // Show info message that transfer is pending
          const approverDesc = targetIsClosed && closedSourceTeams.length === 0
            ? `${targetTeam?.name || 'target team'}'s`
            : `${sourceTeam.name}'s`
          setInfoMessage(`Transfer request sent. Awaiting approval from ${approverDesc} Chief-of-Staff.`)
        } else {
          setError(result.error || 'Failed to request transfer')
        }
      } else {
        // Direct join — only reaches here for open target teams when agent is not in a closed team
        const result = await onJoinTeam(teamId)
        if (result.success) {
          setShowJoinDropdown(false)
        } else {
          setError(result.error || 'Failed to join team')
        }
      }
    } catch {
      setError('Failed to join team')
    } finally {
      setLoading(null)
    }
  }

  const handleLeave = async (teamId: string) => {
    setError(null)
    setInfoMessage(null) // Clear stale info messages before new action
    setLoading(teamId)
    try {
      const result = await onLeaveTeam(teamId)
      if (!result.success) {
        setError(result.error || 'Failed to leave team')
      } else {
        // NT-032: Brief success feedback so the user knows the leave action completed
        setInfoMessage('Successfully left team')
      }
    } catch {
      setError('Failed to leave team')
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      {/* Section header row */}
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-400 font-medium">Teams</span>
        {memberTeams.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400">
            {memberTeams.length}
          </span>
        )}
        <div className="ml-auto relative" ref={dropdownRef}>
          <button
            onClick={() => setShowJoinDropdown(!showJoinDropdown)}
            className="text-xs px-2 py-1 rounded border border-dashed border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Join Team
            <ChevronDown className={`w-3 h-3 transition-transform ${showJoinDropdown ? 'rotate-180' : ''}`} />
          </button>

          {/* Join Team dropdown */}
          {showJoinDropdown && (
            <div className="absolute right-0 z-20 bg-gray-800 border border-gray-700 rounded-lg p-1 max-h-48 overflow-y-auto mt-1 min-w-[180px]">
              {joinableTeams.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-gray-500">No teams available to join</div>
              ) : (
                joinableTeams.map(team => (
                  <button
                    key={team.id}
                    onClick={() => handleJoin(team.id)}
                    disabled={loading === team.id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    <span className="truncate">{team.name}</span>
                    {team.type === 'closed' ? (
                      <Lock className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    ) : (
                      <Unlock className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Team list */}
      {memberTeams.length === 0 ? (
        <div className="text-sm text-gray-500 italic px-1">Not a member of any team</div>
      ) : (
        <div className="space-y-0.5">
          {memberTeams.map(team => (
            <div
              key={team.id}
              className="flex items-center gap-2 group px-1 py-1 rounded hover:bg-gray-800/50 transition-colors"
            >
              <span className="text-sm text-gray-200 truncate">{team.name}</span>
              {team.type === 'closed' ? (
                <Lock className="w-3 h-3 text-gray-500 flex-shrink-0" />
              ) : (
                <Unlock className="w-3 h-3 text-gray-500 flex-shrink-0" />
              )}
              {/* Show COS badge for closed teams where this agent is chief-of-staff */}
              {team.type === 'closed' && team.chiefOfStaffId === agentId && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                  COS
                </span>
              )}
              <button
                onClick={() => handleLeave(team.id)}
                disabled={loading === team.id}
                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto disabled:opacity-50"
                title="Leave team"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pending transfer requests */}
      {relevantTransfers.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="text-xs text-gray-500 font-medium px-1">Pending Transfers</div>
          {relevantTransfers.map(transfer => {
            const fromTeam = allTeams.find(t => t.id === transfer.fromTeamId)
            const toTeam = allTeams.find(t => t.id === transfer.toTeamId)
            const canResolve = onResolveTransfer && fromTeam?.chiefOfStaffId === agentId

            return (
              <div key={transfer.id} className="flex items-center gap-2 px-1 py-1.5 rounded bg-amber-500/5 border border-amber-500/20">
                <Clock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span className="text-xs text-amber-300 truncate">
                  {fromTeam?.name || 'Unknown'} → {toTeam?.name || 'Unknown'}
                </span>
                {canResolve && (
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={async () => {
                        setError(null)
                        setResolvingTransferId(transfer.id)
                        try {
                          const result = await onResolveTransfer(transfer.id, 'approve')
                          if (!result.success) {
                            setError(result.error || 'Failed to approve transfer')
                          }
                        } catch {
                          setError('Failed to approve transfer')
                        } finally {
                          setResolvingTransferId(null)
                        }
                      }}
                      disabled={resolvingTransferId === transfer.id}
                      className="p-0.5 rounded text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      title="Approve transfer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        setError(null)
                        setResolvingTransferId(transfer.id)
                        try {
                          const result = await onResolveTransfer(transfer.id, 'reject')
                          if (!result.success) {
                            setError(result.error || 'Failed to reject transfer')
                          }
                        } catch {
                          setError('Failed to reject transfer')
                        } finally {
                          setResolvingTransferId(null)
                        }
                      }}
                      disabled={resolvingTransferId === transfer.id}
                      className="p-0.5 rounded text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      title="Reject transfer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {!canResolve && (
                  <span className="ml-auto text-xs text-gray-500">Pending</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Info message for pending transfer */}
      {infoMessage && (
        <div className="text-xs text-blue-400 px-1 mt-1 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {infoMessage}
          <button onClick={() => setInfoMessage(null)} className="ml-auto text-blue-400 hover:text-blue-300">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Inline error message */}
      {error && (
        <div className="text-xs text-red-400 px-1 mt-1">{error}</div>
      )}
    </>
  )
}
