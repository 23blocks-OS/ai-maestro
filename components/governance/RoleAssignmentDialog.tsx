'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { User, Shield, Crown, X, AlertTriangle } from 'lucide-react'
import GovernancePasswordDialog from './GovernancePasswordDialog'
import type { GovernanceState, GovernanceRole } from '@/hooks/useGovernance'

interface RoleAssignmentDialogProps {
  isOpen: boolean
  onClose: () => void
  agentId: string
  agentName: string
  currentRole: GovernanceRole
  governance: GovernanceState
  onRoleChanged: () => void
}

type Phase = 'select' | 'password' | 'submitting' | 'error' | 'done'

// Role option definitions for the radio-card selector
const ROLE_OPTIONS: {
  role: GovernanceRole
  label: string
  icon: typeof User
  description: string
  selectedBorder: string
  selectedBg: string
  selectedText: string
}[] = [
  {
    role: 'normal',
    label: 'Normal Agent',
    icon: User,
    description: 'Standard agent, no governance privileges',
    selectedBorder: 'border-gray-500',
    selectedBg: 'bg-gray-500/10',
    selectedText: 'text-gray-300',
  },
  {
    role: 'chief-of-staff',
    label: 'Chief-of-Staff',
    icon: Shield,
    description: 'Leads closed team(s), manages membership',
    selectedBorder: 'border-indigo-500',
    selectedBg: 'bg-indigo-500/10',
    selectedText: 'text-indigo-300',
  },
  {
    role: 'manager',
    label: 'MANAGER',
    icon: Crown,
    description: 'Global singleton, full authority over all teams',
    selectedBorder: 'border-amber-500',
    selectedBg: 'bg-amber-500/10',
    selectedText: 'text-amber-300',
  },
]

export default function RoleAssignmentDialog({
  isOpen,
  onClose,
  agentId,
  agentName,
  currentRole,
  governance,
  onRoleChanged,
}: RoleAssignmentDialogProps) {
  const [selectedRole, setSelectedRole] = useState<GovernanceRole>(currentRole)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('select')
  const [error, setError] = useState<string | null>(null)

  // Reset all state when dialog opens or closes
  useEffect(() => {
    if (isOpen) {
      setSelectedRole(currentRole)
      setSelectedTeamIds([])
      setPhase('select')
      setError(null)
    }
  }, [isOpen, currentRole])

  // Closed teams available for COS assignment
  const closedTeams = governance.allTeams.filter((t) => t.type === 'closed')

  // Whether the MANAGER role is held by a different agent
  const managerHeldByOther = governance.managerId && governance.managerId !== agentId

  // Determine if confirm button should be disabled
  const isConfirmDisabled = (() => {
    // No change from current role and no team selection difference
    if (selectedRole === currentRole) {
      if (selectedRole !== 'chief-of-staff') return true
      // For COS, check if team selection changed
      const currentCosTeamIds = governance.cosTeams.map((t) => t.id).sort()
      const selected = [...selectedTeamIds].sort()
      if (JSON.stringify(currentCosTeamIds) === JSON.stringify(selected)) return true
    }
    // COS requires at least one team selected
    if (selectedRole === 'chief-of-staff' && selectedTeamIds.length === 0) return true
    return false
  })()

  // Toggle a team ID in the selectedTeamIds array
  const toggleTeamId = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    )
  }

  // Execute the role change after password confirmation
  const handleRoleChange = async (password: string) => {
    setPhase('submitting')
    setError(null)

    try {
      // Transition logic based on currentRole -> selectedRole
      if (selectedRole === 'normal') {
        // Demote to normal: remove current governance role
        if (currentRole === 'manager') {
          const result = await governance.assignManager(null, password)
          if (!result.success) throw new Error(result.error || 'Failed to remove manager role')
        } else if (currentRole === 'chief-of-staff') {
          // Remove COS from all teams where this agent is COS
          for (const team of governance.cosTeams) {
            const result = await governance.assignCOS(team.id, null, password)
            if (!result.success) throw new Error(result.error || `Failed to remove COS from team ${team.name}`)
          }
        }
      } else if (selectedRole === 'manager') {
        // Promote to manager: first remove COS if needed, then assign manager
        if (currentRole === 'chief-of-staff') {
          for (const team of governance.cosTeams) {
            const result = await governance.assignCOS(team.id, null, password)
            if (!result.success) throw new Error(result.error || `Failed to remove COS from team ${team.name}`)
          }
        }
        const result = await governance.assignManager(agentId, password)
        if (!result.success) throw new Error(result.error || 'Failed to assign manager role')
      } else if (selectedRole === 'chief-of-staff') {
        // Assign COS: first remove manager if needed, then remove old COS assignments, then assign COS to selected teams
        if (currentRole === 'manager') {
          const result = await governance.assignManager(null, password)
          if (!result.success) throw new Error(result.error || 'Failed to remove manager role')
        }
        // Remove COS from teams no longer selected
        if (currentRole === 'chief-of-staff') {
          for (const team of governance.cosTeams) {
            if (!selectedTeamIds.includes(team.id)) {
              const result = await governance.assignCOS(team.id, null, password)
              if (!result.success) throw new Error(result.error || `Failed to remove COS from team ${team.name}`)
            }
          }
        }
        for (const teamId of selectedTeamIds) {
          const result = await governance.assignCOS(teamId, agentId, password)
          if (!result.success) throw new Error(result.error || 'Failed to assign chief-of-staff')
        }
      }

      // Success: notify parent and close
      onRoleChanged()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update governance role')
      setPhase('error')
    }
  }

  if (!isOpen) return null

  // Password phase: render the password dialog directly (it has its own overlay)
  if (phase === 'password') {
    return (
      <GovernancePasswordDialog
        isOpen={true}
        mode={governance.hasPassword ? 'confirm' : 'setup'}
        onClose={() => setPhase('select')}
        onPasswordConfirmed={(pw) => handleRoleChange(pw)}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Phase: select */}
        {phase === 'select' && (
          <>
            {/* Header */}
            <div className="bg-blue-500/10 border-b border-blue-500/20 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-blue-300">Assign Governance Role</h3>
                    <p className="text-sm text-gray-400">{agentName}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-800 transition-all text-gray-400 hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Role cards */}
            <div className="p-6 space-y-3">
              {ROLE_OPTIONS.map((option) => {
                const Icon = option.icon
                const isSelected = selectedRole === option.role

                return (
                  <button
                    key={option.role}
                    onClick={() => setSelectedRole(option.role)}
                    className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? `${option.selectedBorder} ${option.selectedBg} ${option.selectedText}`
                        : 'border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg ${
                        isSelected ? `${option.selectedBg}` : 'bg-gray-700'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isSelected ? option.selectedText : 'text-gray-400'}`} />
                    </div>
                    <div className="flex-1 text-left">
                      <div className={`font-medium ${isSelected ? option.selectedText : 'text-gray-200'}`}>
                        {option.label}
                      </div>
                      <div className="text-xs text-gray-500">{option.description}</div>
                    </div>
                    {/* Radio indicator */}
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? `${option.selectedBorder} ${option.selectedBg}` : 'border-gray-600'
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                )
              })}

              {/* COS team checkboxes: shown when chief-of-staff is selected */}
              {selectedRole === 'chief-of-staff' && (
                <div className="mt-3 ml-2 space-y-2">
                  {closedTeams.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No closed teams exist. Create a closed team first.
                    </p>
                  ) : (
                    closedTeams.map((team) => {
                      const isChecked = selectedTeamIds.includes(team.id)
                      // Show current COS if it exists and is not this agent
                      const existingCos =
                        team.chiefOfStaffId && team.chiefOfStaffId !== agentId
                          ? governance.allTeams.length > 0
                            ? `(current COS: ${team.chiefOfStaffId})`
                            : null
                          : null

                      return (
                        <label
                          key={team.id}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800/60 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTeamId(team.id)}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500/50"
                          />
                          <span className="text-sm text-gray-300">{team.name}</span>
                          {existingCos && (
                            <span className="text-xs text-gray-500">{existingCos}</span>
                          )}
                        </label>
                      )
                    })
                  )}
                </div>
              )}

              {/* MANAGER warning: shown when manager is selected and already assigned to another agent */}
              {selectedRole === 'manager' && managerHeldByOther && (
                <div className="mt-3 flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-300">
                    The current manager is <strong>{governance.managerName}</strong>. Assigning MANAGER to{' '}
                    <strong>{agentName}</strong> will remove it from <strong>{governance.managerName}</strong>.
                    Only one manager can exist.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-800 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setPhase('password')}
                disabled={isConfirmDisabled}
                className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Confirm
              </button>
            </div>
          </>
        )}

        {/* Phase: submitting */}
        {phase === 'submitting' && (
          <div className="p-12 flex flex-col items-center justify-center gap-4">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Updating governance role...</p>
          </div>
        )}

        {/* Phase: error */}
        {phase === 'error' && (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Role assignment failed</p>
                <p className="text-sm text-red-400 mt-1">{error}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => setPhase('select')}
                className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
