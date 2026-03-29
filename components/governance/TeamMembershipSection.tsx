'use client'

import { useState, useRef, useEffect } from 'react'
import { Building2, Plus, X, ChevronDown, Clock, Check, XCircle } from 'lucide-react'
import type { Team } from '@/types/team'
import type { GovernanceTitle } from '@/types/governance'
import type { TransferRequest } from '@/types/governance'

interface TeamMembershipSectionProps {
  agentId: string
  agentTitle: GovernanceTitle
  memberTeam: Team | null   // the single team this agent belongs to (0 or 1)
  allTeams: Team[]           // all teams (for assign dropdown)
  onJoinTeam: (teamId: string) => Promise<{ success: boolean; error?: string }>
  onLeaveTeam: (teamId: string) => Promise<{ success: boolean; error?: string }>
  pendingTransfers?: TransferRequest[]
  onRequestTransfer?: (agentId: string, fromTeamId: string, toTeamId: string) => Promise<{ success: boolean; error?: string }>
  onResolveTransfer?: (transferId: string, action: 'approve' | 'reject') => Promise<{ success: boolean; error?: string }>
  onDataChanged?: () => void // Notify parent that team membership changed
}

export default function TeamMembershipSection({
  agentId,
  agentTitle,
  memberTeam,
  allTeams,
  onJoinTeam,
  onLeaveTeam,
  pendingTransfers,
  onRequestTransfer,
  onResolveTransfer,
  onDataChanged,
}: TeamMembershipSectionProps) {
  const [showAssignDropdown, setShowAssignDropdown] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null) // tracks teamId being acted on
  const [resolvingTransferId, setResolvingTransferId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showAssignDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAssignDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAssignDropdown])

  // Available teams to assign to (exclude the current team)
  const assignableTeams = allTeams.filter(t => {
    if (memberTeam && t.id === memberTeam.id) return false
    return true
  })

  // Filter pending transfers relevant to this agent
  const relevantTransfers = (pendingTransfers || []).filter(transfer => {
    if (transfer.agentId === agentId) return true
    const fromTeam = allTeams.find(t => t.id === transfer.fromTeamId)
    if (fromTeam?.chiefOfStaffId === agentId) return true
    const toTeam = allTeams.find(t => t.id === transfer.toTeamId)
    if (toTeam?.chiefOfStaffId === agentId) return true
    return false
  })

  // COS cannot leave their team (they ARE the team leader)
  const isCOS = agentTitle === 'chief-of-staff'
  const canLeaveTeam = memberTeam && !isCOS

  const handleAssign = async (teamId: string) => {
    setError(null)
    setInfoMessage(null)
    setLoading(teamId)
    try {
      // Managers bypass all transfer requirements
      if (agentTitle === 'manager') {
        // If already in a team, leave first then join new
        if (memberTeam) {
          const leaveResult = await onLeaveTeam(memberTeam.id)
          if (!leaveResult.success) {
            setError(leaveResult.error || 'Failed to leave current team')
            return
          }
        }
        const result = await onJoinTeam(teamId)
        if (result.success) {
          setShowAssignDropdown(false)
          onDataChanged?.()
        } else {
          setError(result.error || 'Failed to assign to team')
        }
        return
      }

      // For non-managers: if agent is already in a team, request a transfer
      if (memberTeam && onRequestTransfer) {
        const result = await onRequestTransfer(agentId, memberTeam.id, teamId)
        if (result.success) {
          setShowAssignDropdown(false)
          setError(null)
          const targetTeam = allTeams.find(t => t.id === teamId)
          setInfoMessage(`Transfer request sent. Awaiting approval from ${targetTeam?.name || 'target team'}'s Chief-of-Staff.`)
          onDataChanged?.()
        } else {
          setError(result.error || 'Failed to request transfer')
        }
      } else {
        // Direct join — agent is not in any team
        const result = await onJoinTeam(teamId)
        if (result.success) {
          setShowAssignDropdown(false)
          onDataChanged?.()
        } else {
          setError(result.error || 'Failed to assign to team')
        }
      }
    } catch {
      setError('Failed to assign to team')
    } finally {
      setLoading(null)
    }
  }

  const handleLeave = async (teamId: string) => {
    setError(null)
    setInfoMessage(null)
    setLoading(teamId)
    try {
      const result = await onLeaveTeam(teamId)
      if (!result.success) {
        setError(result.error || 'Failed to leave team')
      } else {
        setInfoMessage('Successfully left team')
        onDataChanged?.()
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
        <span className="text-sm text-gray-400 font-medium">Team</span>
        <div className="ml-auto relative" ref={dropdownRef}>
          <button
            onClick={() => setShowAssignDropdown(!showAssignDropdown)}
            className="text-xs px-2 py-1 rounded border border-dashed border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" />
            {memberTeam ? 'Reassign' : 'Assign to Team'}
            <ChevronDown className={`w-3 h-3 transition-transform ${showAssignDropdown ? 'rotate-180' : ''}`} />
          </button>

          {/* Assign Team dropdown */}
          {showAssignDropdown && (
            <div className="absolute right-0 z-20 bg-gray-800 border border-gray-700 rounded-lg p-1 max-h-48 overflow-y-auto mt-1 min-w-[180px]">
              {assignableTeams.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-gray-500">No teams available</div>
              ) : (
                assignableTeams.map(team => (
                  <button
                    key={team.id}
                    onClick={() => handleAssign(team.id)}
                    disabled={loading === team.id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    <span className="truncate">{team.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Current team display (single team or "No team") */}
      {!memberTeam ? (
        <div className="text-sm text-gray-500 italic px-1">No team</div>
      ) : (
        <div className="flex items-center gap-2 group px-1 py-1 rounded hover:bg-gray-800/50 transition-colors">
          <span className="text-sm text-gray-200 truncate">{memberTeam.name}</span>
          {/* Show COS badge if this agent is chief-of-staff of this team */}
          {memberTeam.chiefOfStaffId === agentId && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
              COS
            </span>
          )}
          {/* Leave button — disabled for COS (COS must have a team) */}
          {canLeaveTeam && (
            <button
              onClick={() => handleLeave(memberTeam.id)}
              disabled={loading === memberTeam.id}
              className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto disabled:opacity-50"
              title="Leave team"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isCOS && (
            <span className="ml-auto text-xs text-gray-600" title="COS cannot leave their team">
              locked
            </span>
          )}
        </div>
      )}

      {/* Pending transfer requests */}
      {relevantTransfers.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="text-xs text-gray-500 font-medium px-1">Pending Transfers</div>
          {relevantTransfers.map(transfer => {
            const fromTeam = allTeams.find(t => t.id === transfer.fromTeamId)
            const toTeam = allTeams.find(t => t.id === transfer.toTeamId)
            const canResolve = onResolveTransfer && (fromTeam?.chiefOfStaffId === agentId || toTeam?.chiefOfStaffId === agentId)

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
                          } else {
                            onDataChanged?.()
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
                          } else {
                            onDataChanged?.()
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
