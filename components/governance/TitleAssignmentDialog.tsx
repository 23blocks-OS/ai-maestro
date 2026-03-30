'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Shield, Crown, Megaphone, X, AlertTriangle, Compass, GitMerge, Bot } from 'lucide-react'
import GovernancePasswordDialog from './GovernancePasswordDialog'
import type { GovernanceState, GovernanceTitle } from '@/hooks/useGovernance'
import { TITLE_PLUGIN_MAP as ECOSYSTEM_TITLE_MAP } from '@/lib/ecosystem-constants'

interface TitleAssignmentDialogProps {
  isOpen: boolean
  onClose: () => void
  agentId: string
  agentName: string
  currentTitle: GovernanceTitle
  governance: GovernanceState
  onTitleChanged: () => void
}

type Phase = 'select' | 'password' | 'submitting' | 'error' | 'done'

// Title option definitions for the radio-card selector
const TITLE_OPTIONS: {
  title: GovernanceTitle
  label: string
  icon: typeof User
  description: string
  selectedBorder: string
  selectedBg: string
  selectedText: string
}[] = [
  {
    title: 'autonomous',
    label: 'AUTONOMOUS',
    icon: Bot,
    description: 'Independent agent, not assigned to any team',
    selectedBorder: 'border-slate-500',
    selectedBg: 'bg-slate-500/10',
    selectedText: 'text-slate-300',
  },
  {
    title: 'member',
    label: 'MEMBER',
    icon: User,
    description: 'Standard agent, no governance privileges',
    selectedBorder: 'border-gray-500',
    selectedBg: 'bg-gray-500/10',
    selectedText: 'text-gray-300',
  },
  {
    title: 'chief-of-staff',
    label: 'CHIEF-OF-STAFF',
    icon: Shield,
    description: 'Leads a team, manages membership',
    selectedBorder: 'border-yellow-500',
    selectedBg: 'bg-yellow-500/10',
    selectedText: 'text-yellow-300',
  },
  {
    title: 'orchestrator',
    label: 'ORCHESTRATOR',
    icon: Megaphone,
    description: 'Primary kanban manager, direct MANAGER communication',
    selectedBorder: 'border-blue-500',
    selectedBg: 'bg-blue-500/10',
    selectedText: 'text-blue-300',
  },
  {
    title: 'architect',
    label: 'ARCHITECT',
    icon: Compass,
    description: 'Design documents, requirements, architecture',
    selectedBorder: 'border-purple-500',
    selectedBg: 'bg-purple-500/10',
    selectedText: 'text-purple-300',
  },
  {
    title: 'integrator',
    label: 'INTEGRATOR',
    icon: GitMerge,
    description: 'Quality gates, PR review, merging, releases',
    selectedBorder: 'border-cyan-500',
    selectedBg: 'bg-cyan-500/10',
    selectedText: 'text-cyan-300',
  },
  {
    title: 'manager',
    label: 'MANAGER',
    icon: Crown,
    description: 'Global singleton, full authority over all teams',
    selectedBorder: 'border-red-500',
    selectedBg: 'bg-red-500/10',
    selectedText: 'text-red-300',
  },
]

export default function TitleAssignmentDialog({
  isOpen,
  onClose,
  agentId,
  agentName,
  currentTitle,
  governance,
  onTitleChanged,
}: TitleAssignmentDialogProps) {
  const [selectedTitle, setSelectedTitle] = useState<GovernanceTitle>(currentTitle)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('select')
  const [error, setError] = useState<string | null>(null)

  // Reset all state when dialog opens; pre-select current COS teams so the checkbox state
  // reflects the agent's existing team assignments and the confirm button correctly detects changes
  useEffect(() => {
    if (isOpen) {
      setSelectedTitle(currentTitle)
      // Pre-select the teams where this agent is currently COS
      setSelectedTeamIds(
        currentTitle === 'chief-of-staff'
          ? governance.cosTeams.map((t) => t.id)
          : []
      )
      setPhase('select')
      setError(null)
    }
  }, [isOpen, currentTitle, governance.cosTeams])

  // CC-009: Defensive close handler — resets internal state before calling parent onClose,
  // so stale state never persists even if parent does not toggle isOpen immediately.
  const handleClose = useCallback(() => {
    setSelectedTeamIds([])
    setError(null)
    setPhase('select')
    onClose()
  }, [onClose])

  // Close dialog on Escape key press
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, handleClose])

  // Agent name lookup map for resolving COS UUIDs to human-readable names (R7.8)
  const [agentNameMap, setAgentNameMap] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!isOpen) return
    // SF-021: Abort fetch on cleanup (dialog close or unmount) to prevent stale state updates
    const controller = new AbortController()
    fetch('/api/sessions', { signal: controller.signal })
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then(data => {
        const map = new Map<string, string>()
        for (const s of (data.sessions || [])) {
          if (s.agentId && (s.label || s.name || s.alias)) {
            map.set(s.agentId, s.label || s.name || s.alias)
          }
        }
        setAgentNameMap(map)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [isOpen])

  const resolveAgentName = useCallback((id: string) => agentNameMap.get(id) || id.slice(0, 8), [agentNameMap])

  // All teams available for COS assignment (all teams are implicitly closed now)
  const availableTeams = governance.allTeams

  // Whether the MANAGER role is held by a different agent
  const managerHeldByOther = governance.managerId && governance.managerId !== agentId

  // Whether this agent is currently a member of any team
  const isInTeam = governance.memberTeam !== null

  // Filter title options by team membership. Unavailable titles shown as disabled with explanation.
  const teamTitles: GovernanceTitle[] = ['member', 'chief-of-staff', 'orchestrator', 'architect', 'integrator']
  const standaloneTitles: GovernanceTitle[] = ['autonomous', 'manager']

  // Compute which titles are disabled and why
  const titleDisabledReason: Record<string, string | null> = {}
  for (const opt of TITLE_OPTIONS) {
    titleDisabledReason[opt.title] = null // enabled by default
    if (!isInTeam && !standaloneTitles.includes(opt.title)) {
      titleDisabledReason[opt.title] = 'hidden' // wrong context — fully hidden
    } else if (isInTeam && !teamTitles.includes(opt.title)) {
      titleDisabledReason[opt.title] = 'hidden' // wrong context — fully hidden
    } else if (opt.title === 'manager' && managerHeldByOther) {
      const managerName = resolveAgentName(governance.managerId!)
      titleDisabledReason[opt.title] = `Only one Manager is allowed. "${managerName}" already holds this title.`
    } else if (opt.title === 'chief-of-staff' && governance.memberTeam?.chiefOfStaffId && governance.memberTeam.chiefOfStaffId !== agentId) {
      const cosName = resolveAgentName(governance.memberTeam.chiefOfStaffId)
      titleDisabledReason[opt.title] = `Only one Chief-of-Staff is allowed per team. "${cosName}" already holds this title. Remove them first or select another title.`
    } else if (opt.title === 'orchestrator' && governance.memberTeam?.orchestratorId && governance.memberTeam.orchestratorId !== agentId) {
      const orchName = resolveAgentName(governance.memberTeam.orchestratorId)
      titleDisabledReason[opt.title] = `Only one Orchestrator is allowed per team. "${orchName}" already holds this title. Remove them first or select another title.`
    }
  }

  const visibleTitleOptions = TITLE_OPTIONS.filter((opt) => titleDisabledReason[opt.title] !== 'hidden')

  // Determine if confirm button should be disabled
  const isConfirmDisabled = (() => {
    // No change from current role and no team selection difference
    if (selectedTitle === currentTitle) {
      if (selectedTitle !== 'chief-of-staff') return true
      // For COS, check if team selection changed
      const currentCosTeamIds = governance.cosTeams.map((t) => t.id).sort()
      const selected = [...selectedTeamIds].sort()
      // JSON.stringify for shallow array comparison — acceptable for small team ID arrays
      if (JSON.stringify(currentCosTeamIds) === JSON.stringify(selected)) return true
    }
    // COS requires at least one team selected
    if (selectedTitle === 'chief-of-staff' && selectedTeamIds.length === 0) return true
    return false
  })()

  // Toggle a team ID in the selectedTeamIds array
  const toggleTeamId = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    )
  }

  // Title → role-plugin mapping for auto-install after title change.
  // Derived from ecosystem-constants — lower-cased keys for API matching.
  const TITLE_PLUGIN_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(ECOSYSTEM_TITLE_MAP).map(([k, v]) => [k.toLowerCase(), v])
  )

  // Auto-install the role-plugin for the given title — uninstalls the OLD plugin first to avoid conflicts
  const autoInstallPluginForTitle = async (title: string) => {
    const pluginName = TITLE_PLUGIN_MAP[title]
    if (!pluginName) return // MEMBER/AUTONOMOUS — no auto-install
    try {
      const agentRes = await fetch(`/api/agents/${agentId}`)
      if (!agentRes.ok) return
      const agentData = await agentRes.json()
      const workDir = agentData.agent?.workingDirectory
      if (!workDir) return
      // Uninstall ALL other title-locked plugins first (only one should be active at a time)
      for (const [, otherPlugin] of Object.entries(TITLE_PLUGIN_MAP)) {
        if (otherPlugin !== pluginName) {
          await fetch('/api/agents/role-plugins/install', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pluginName: otherPlugin, agentDir: workDir }),
          }).catch(() => {}) // Ignore errors — plugin may not be installed
        }
      }
      // Install the new plugin
      await fetch('/api/agents/role-plugins/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginName, agentDir: workDir, scope: 'local' }),
      })
    } catch { /* best-effort */ }
  }

  // Execute the role change after password confirmation
  const handleRoleChange = async (password: string) => {
    // Don't change phase here — let the password dialog stay mounted during the request.
    // On success, handleRoleChange calls handleClose() which dismisses everything.
    // On failure, the error propagates back to the password dialog for retry.
    setError(null)

    try {
      // Helper: clear a simple governanceTitle (architect/integrator) via PATCH
      const clearGovernanceTitle = async () => {
        const res = await fetch(`/api/agents/${agentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ governanceTitle: null }),
        })
        if (!res.ok) throw new Error('Failed to clear governance title')
      }

      // Helper: set a simple governanceTitle (architect/integrator) via PATCH
      const setGovernanceTitle = async (t: GovernanceTitle) => {
        const res = await fetch(`/api/agents/${agentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ governanceTitle: t }),
        })
        if (!res.ok) throw new Error(`Failed to assign ${t} title`)
      }

      // Helper: clear or set orchestratorId on the team
      const updateTeamOrchestratorId = async (value: string | null) => {
        if (!governance.memberTeam) return
        const res = await fetch(`/api/teams/${governance.memberTeam.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orchestratorId: value }),
        })
        if (!res.ok) throw new Error(`Failed to ${value ? 'set' : 'clear'} orchestratorId on team`)
      }

      // Transition logic based on currentTitle -> selectedTitle
      if (selectedTitle === 'autonomous') {
        // Transitioning TO autonomous: clear any existing governance state via PATCH
        if (currentTitle === 'manager') {
          const result = await governance.assignManager(null, password)
          if (!result.success) throw new Error(result.error || 'Failed to remove manager role')
        } else if (currentTitle === 'chief-of-staff') {
          const removalResults = await Promise.allSettled(
            governance.cosTeams.map(async (team) => {
              const result = await governance.assignCOS(team.id, null, password)
              if (!result.success) throw new Error(result.error || `Failed for ${team.name}`)
            })
          )
          const failures = removalResults
            .map((r, i) => r.status === 'rejected' ? governance.cosTeams[i].name : null)
            .filter(Boolean)
          if (failures.length > 0) {
            throw new Error(`Failed to remove COS from: ${failures.join(', ')}`)
          }
        } else if (currentTitle !== 'member') {
          // Clear simple governanceTitle (architect/integrator/orchestrator) if set
          await clearGovernanceTitle()
          // Clear orchestratorId on team if leaving orchestrator role
          if (currentTitle === 'orchestrator') {
            await updateTeamOrchestratorId(null)
          }
        }
        // Set autonomous title explicitly via PATCH
        const res = await fetch(`/api/agents/${agentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ governanceTitle: null, role: 'autonomous' }),
        })
        if (!res.ok) throw new Error('Failed to set autonomous title')
      } else if (selectedTitle === 'member') {
        // Demote to member: remove current governance role
        if (currentTitle === 'manager') {
          const result = await governance.assignManager(null, password)
          if (!result.success) throw new Error(result.error || 'Failed to remove manager role')
        } else if (currentTitle === 'chief-of-staff') {
          // CC-003: Use Promise.allSettled for parallel COS removal — reports partial failures clearly
          const removalResults = await Promise.allSettled(
            governance.cosTeams.map(async (team) => {
              const result = await governance.assignCOS(team.id, null, password)
              if (!result.success) throw new Error(result.error || `Failed for ${team.name}`)
            })
          )
          const failures = removalResults
            .map((r, i) => r.status === 'rejected' ? governance.cosTeams[i].name : null)
            .filter(Boolean)
          if (failures.length > 0) {
            throw new Error(`Failed to remove COS from: ${failures.join(', ')}`)
          }
        } else if (currentTitle === 'architect' || currentTitle === 'integrator' || currentTitle === 'orchestrator') {
          // Clear simple governanceTitle field when demoting to member
          await clearGovernanceTitle()
          // Clear orchestratorId on team if leaving orchestrator role
          if (currentTitle === 'orchestrator') {
            await updateTeamOrchestratorId(null)
          }
        }
      } else if (selectedTitle === 'architect' || selectedTitle === 'integrator' || selectedTitle === 'orchestrator') {
        // Transitioning TO a simple governance title (including orchestrator)
        if (currentTitle === 'manager') {
          // Remove manager first, then set new title
          const result = await governance.assignManager(null, password)
          if (!result.success) throw new Error(result.error || 'Failed to remove manager role')
        } else if (currentTitle === 'chief-of-staff') {
          // Remove all COS assignments first, then set new title
          const removalResults = await Promise.allSettled(
            governance.cosTeams.map(async (team) => {
              const result = await governance.assignCOS(team.id, null, password)
              if (!result.success) throw new Error(result.error || `Failed for ${team.name}`)
            })
          )
          const failures = removalResults
            .map((r, i) => r.status === 'rejected' ? governance.cosTeams[i].name : null)
            .filter(Boolean)
          if (failures.length > 0) {
            throw new Error(`Failed to remove COS from: ${failures.join(', ')}`)
          }
        }
        // If previous title was orchestrator, clear orchestratorId on the team
        if (currentTitle === 'orchestrator' && governance.memberTeam) {
          await fetch(`/api/teams/${governance.memberTeam.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orchestratorId: null }),
          })
        }
        // Set the new simple governance title + auto-install its role-plugin
        await setGovernanceTitle(selectedTitle)
        await autoInstallPluginForTitle(selectedTitle)
        // If new title is orchestrator, set orchestratorId on the team
        if (selectedTitle === 'orchestrator') {
          await updateTeamOrchestratorId(agentId)
        }
      } else if (selectedTitle === 'manager') {
        // Promote to manager: first remove COS or simple title if needed, then assign manager
        if (currentTitle === 'chief-of-staff') {
          // CC-003: Use Promise.allSettled for parallel COS removal — reports partial failures clearly
          const removalResults = await Promise.allSettled(
            governance.cosTeams.map(async (team) => {
              const result = await governance.assignCOS(team.id, null, password)
              if (!result.success) throw new Error(result.error || `Failed for ${team.name}`)
            })
          )
          const failures = removalResults
            .map((r, i) => r.status === 'rejected' ? governance.cosTeams[i].name : null)
            .filter(Boolean)
          if (failures.length > 0) {
            throw new Error(`Failed to remove COS from: ${failures.join(', ')}`)
          }
        } else if (currentTitle === 'architect' || currentTitle === 'integrator' || currentTitle === 'orchestrator') {
          // Clear old simple governance title before assigning manager
          await clearGovernanceTitle()
        }
        const result = await governance.assignManager(agentId, password)
        if (!result.success) throw new Error(result.error || 'Failed to assign manager role')
        await autoInstallPluginForTitle('manager')
      } else if (selectedTitle === 'chief-of-staff') {
        // Assign COS: first remove manager or simple title if needed, then remove old COS assignments, then assign COS to selected teams
        if (currentTitle === 'manager') {
          const result = await governance.assignManager(null, password)
          if (!result.success) throw new Error(result.error || 'Failed to remove manager role')
        } else if (currentTitle === 'architect' || currentTitle === 'integrator' || currentTitle === 'orchestrator') {
          // Clear old simple governance title before assigning COS
          await clearGovernanceTitle()
        }
        // CC-003: Remove COS from teams no longer selected — parallel with partial failure reporting
        if (currentTitle === 'chief-of-staff') {
          const teamsToRemove = governance.cosTeams.filter(team => !selectedTeamIds.includes(team.id))
          if (teamsToRemove.length > 0) {
            const removalResults = await Promise.allSettled(
              teamsToRemove.map(async (team) => {
                const result = await governance.assignCOS(team.id, null, password)
                if (!result.success) throw new Error(result.error || `Failed for ${team.name}`)
              })
            )
            const failures = removalResults
              .map((r, i) => r.status === 'rejected' ? teamsToRemove[i].name : null)
              .filter(Boolean)
            if (failures.length > 0) {
              throw new Error(`Failed to remove COS from: ${failures.join(', ')}`)
            }
          }
        }
        // CC-001: Only assign COS to teams where this agent is not already COS — avoids redundant API calls
        // SF-045: Run assignments in parallel with partial failure reporting (same pattern as COS removal above)
        const existingCosTeamIds = governance.cosTeams.map(t => t.id)
        const newTeamIds = selectedTeamIds.filter(id => !existingCosTeamIds.includes(id))
        if (newTeamIds.length > 0) {
          const assignResults = await Promise.allSettled(
            newTeamIds.map(async (teamId) => {
              const result = await governance.assignCOS(teamId, agentId, password)
              if (!result.success) throw new Error(result.error || 'Failed to assign chief-of-staff')
            })
          )
          const failures = assignResults
            .map((r, i) => r.status === 'rejected' ? newTeamIds[i] : null)
            .filter(Boolean)
          if (failures.length > 0) {
            throw new Error(`Failed to assign COS to ${failures.length} team(s)`)
          }
        }
        await autoInstallPluginForTitle('chief-of-staff')
      }

      // Success: notify parent and close
      onTitleChanged()
      handleClose()
    } catch (err: unknown) {
      governance.refresh()  // Reload actual state after partial failure
      // Re-throw with clear message — password dialog shows it inline so the user sees WHY it failed
      const msg = err instanceof Error ? err.message : 'Unknown error'
      throw new Error(`Title change failed: ${msg}`)
    }
  }

  // Password phase: render the password dialog directly (it has its own overlay)
  // Errors (wrong password OR operation failure) are re-thrown so the password dialog
  // displays them inline and stays open — the user sees exactly why it failed.
  if (isOpen && phase === 'password') {
    return (
      <GovernancePasswordDialog
        isOpen={true}
        mode={governance.hasPassword ? 'confirm' : 'setup'}
        onClose={() => setPhase('select')}
        onPasswordConfirmed={async (pw) => {
          // handleRoleChange throws on any failure — the password dialog catches it
          // and shows the error message inline, staying open for the user to read/retry
          await handleRoleChange(pw)
        }}
      />
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={handleClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Phase: select */}
        {phase === 'select' && (
          <>
            {/* Header */}
            <div className="bg-blue-500/10 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-blue-300">Assign Governance Title</h3>
                    <p className="text-sm text-gray-400">{agentName}</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-lg hover:bg-gray-800 transition-all text-gray-400 hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Role cards */}
            <div className="p-6 space-y-3">
              {visibleTitleOptions.map((option) => {
                const Icon = option.icon
                const isSelected = selectedTitle === option.title
                const disabledReason = titleDisabledReason[option.title]
                const isDisabled = disabledReason !== null && disabledReason !== 'hidden'

                return (
                  <div key={option.title}>
                    <button
                      onClick={() => { if (!isDisabled) setSelectedTitle(option.title) }}
                      disabled={isDisabled}
                      className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                        isDisabled
                          ? 'border-gray-800 bg-gray-900/40 text-gray-600 cursor-not-allowed opacity-60'
                          : isSelected
                            ? `${option.selectedBorder} ${option.selectedBg} ${option.selectedText}`
                            : 'border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg ${
                          isDisabled ? 'bg-gray-800' : isSelected ? `${option.selectedBg}` : 'bg-gray-700'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${isDisabled ? 'text-gray-600' : isSelected ? option.selectedText : 'text-gray-400'}`} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className={`font-medium ${isDisabled ? 'text-gray-600' : isSelected ? option.selectedText : 'text-gray-200'}`}>
                          {option.label}
                        </div>
                        <div className="text-xs text-gray-500">{option.description}</div>
                      </div>
                      {/* Radio indicator */}
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          isDisabled ? 'border-gray-700' : isSelected ? `${option.selectedBorder} ${option.selectedBg}` : 'border-gray-600'
                        }`}
                      >
                        {isSelected && !isDisabled && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                    {/* Validation message — shown for disabled options explaining WHY */}
                    {isDisabled && (
                      <p className="text-[11px] text-amber-400/80 mt-1 ml-14 leading-snug">{disabledReason}</p>
                    )}
                  </div>
                )
              })}

              {/* COS team checkboxes: shown when chief-of-staff is selected */}
              {selectedTitle === 'chief-of-staff' && (
                <div className="mt-3 ml-2 space-y-2">
                  {availableTeams.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No teams exist. Create a team first.
                    </p>
                  ) : (
                    availableTeams.map((team) => {
                      const isChecked = selectedTeamIds.includes(team.id)
                      // Show current COS if it exists and is not this agent
                      const existingCos = team.chiefOfStaffId && team.chiefOfStaffId !== agentId
                        ? `(current COS: ${resolveAgentName(team.chiefOfStaffId)})`
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
              {selectedTitle === 'manager' && managerHeldByOther && (
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
                onClick={handleClose}
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
            <p className="text-sm text-gray-400">Updating governance title...</p>
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
                onClick={handleClose}
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
      )}
    </AnimatePresence>
  )
}
