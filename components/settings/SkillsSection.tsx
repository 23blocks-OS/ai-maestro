/**
 * Skills Section — browse and install skills per AI client.
 * Replaces the old MarketplaceSection (Claude-only).
 *
 * Features:
 * - ClientTabBar for switching between clients
 * - Skill cards with Convert button
 * - Install confirmation + conflict detection
 * - Auto-switch to target tab after conversion
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Zap, Info, RefreshCw } from 'lucide-react'
import ClientTabBar from './ClientTabBar'
import ConvertButton from './ConvertButton'
import { InstallConfirmDialog, ConflictErrorDialog, ConversionErrorDialog } from './ConversionDialogs'
import type { ProviderId } from '@/lib/converter/types'

interface SkillInfo {
  name: string
  description?: string
  path?: string
}

interface SkillsSectionProps {
  /** Initial client from URL param */
  initialClient?: ProviderId
  /** Called when active client changes (for URL sync) */
  onClientChange?: (client: ProviderId) => void
  /** Called after successful conversion — parent updates URL with highlight */
  onConverted?: (client: ProviderId, elementName: string) => void
  /** Element to highlight (from URL param after conversion) */
  highlight?: string
}

export default function SkillsSection({
  initialClient = 'claude-code',
  onClientChange,
  onConverted,
  highlight,
}: SkillsSectionProps) {
  const [activeClient, setActiveClient] = useState<ProviderId>(initialClient)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [counts, setCounts] = useState<Partial<Record<ProviderId, number>>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Install dialog state
  const [installDialog, setInstallDialog] = useState<{ skill: SkillInfo; destPath: string } | null>(null)
  const [conflictDialog, setConflictDialog] = useState<{ name: string; existingPath: string; sourcePath: string } | null>(null)
  const [errorDialog, setErrorDialog] = useState<{ name: string; error: string; sourcePath: string } | null>(null)
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const showNotification = (text: string, type: 'success' | 'error') => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current)
    setNotification({ text, type })
    notificationTimeoutRef.current = setTimeout(() => setNotification(null), 5000)
  }

  // Cleanup notification timeout on unmount
  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current)
    }
  }, [])

  // Auto-clear highlight after 2 seconds
  useEffect(() => {
    if (!highlight) return
    const timer = setTimeout(() => {
      const url = new URL(window.location.href)
      url.searchParams.delete('highlight')
      window.history.replaceState({}, '', url.toString())
    }, 2000)
    return () => clearTimeout(timer)
  }, [highlight])

  // Fetch skills for active client
  const fetchSkills = useCallback(async (client: ProviderId) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/settings/global-elements/client-skills?client=${client}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const skillList: SkillInfo[] = (data.skills || []).map((name: string) => ({ name }))
      setSkills(skillList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
      setSkills([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch counts for all clients (for tab badges)
  const fetchCounts = useCallback(async () => {
    const clients: ProviderId[] = ['claude-code', 'codex', 'gemini', 'opencode', 'kiro']
    const newCounts: Partial<Record<ProviderId, number>> = {}
    await Promise.all(clients.map(async client => {
      try {
        const res = await fetch(`/api/settings/global-elements/client-skills?client=${client}`)
        if (res.ok) {
          const data = await res.json()
          newCounts[client] = data.skills?.length || 0
        }
      } catch { /* */ }
    }))
    setCounts(newCounts)
  }, [])

  useEffect(() => { fetchSkills(activeClient) }, [activeClient, fetchSkills])
  useEffect(() => { fetchCounts() }, [fetchCounts])

  const handleClientChange = (client: ProviderId) => {
    setActiveClient(client)
    onClientChange?.(client)
    // Update URL without navigation
    const url = new URL(window.location.href)
    url.searchParams.set('client', client)
    window.history.replaceState({}, '', url.toString())
  }

  const handleConvert = (targetClient: ProviderId, elementName: string) => {
    showNotification(`Converted "${elementName}" to ${targetClient}`, 'success')
    // Refresh counts and switch to target tab
    fetchCounts()
    setActiveClient(targetClient)
    onConverted?.(targetClient, elementName)
  }

  const handleInstallClick = (skill: SkillInfo) => {
    // TODO: resolve actual paths from API
    setInstallDialog({
      skill,
      destPath: `~/.claude/skills/${skill.name}/SKILL.md`,
    })
  }

  const handleInstallConfirm = async () => {
    if (!installDialog) return
    const { skill } = installDialog
    setInstallDialog(null)

    try {
      const res = await fetch('/api/settings/global-elements/install-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skill.name, targetClient: activeClient }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error?.includes('conflict') || data.error?.includes('already exists')) {
          setConflictDialog({ name: skill.name, existingPath: data.error, sourcePath: skill.path || 'unknown' })
        } else {
          setErrorDialog({ name: skill.name, error: data.error, sourcePath: skill.path || 'unknown' })
        }
        return
      }
      showNotification(`Installed "${skill.name}" for ${activeClient}`, 'success')
      fetchSkills(activeClient)
      fetchCounts()
    } catch (err) {
      setErrorDialog({ name: skill.name, error: err instanceof Error ? err.message : 'Unknown', sourcePath: skill.path || '' })
    }
  }

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Skills</h1>
            <p className="text-sm text-gray-400">Browse and manage skills per AI client.</p>
          </div>
        </div>
        <button
          onClick={() => { fetchSkills(activeClient); fetchCounts() }}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Client Tabs */}
      <ClientTabBar
        activeClient={activeClient}
        onClientChange={handleClientChange}
        counts={counts}
      />

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm bg-gray-800 border rounded-lg shadow-lg p-4 animate-in slide-in-from-right duration-300 ${notification.type === 'success' ? 'border-emerald-500/40' : 'border-red-500/40'}`}>
          <p className={`text-sm ${notification.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>{notification.text}</p>
        </div>
      )}

      {/* Loading / Error / Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-gray-500 animate-spin" />
          <span className="ml-3 text-gray-400">Loading skills...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">{error}</div>
      ) : skills.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <Zap className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>No skills installed for this client.</p>
          {activeClient !== 'claude-code' && (
            <p className="mt-1 text-xs">Convert skills from Claude using the Convert button on Claude skills.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map(skill => (
            <div
              key={skill.name}
              className={`
                bg-gray-900/50 rounded-lg border border-gray-800 p-4
                hover:border-gray-700 transition-all duration-200
                ${highlight === skill.name ? 'ring-2 ring-blue-500 animate-pulse' : ''}
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-200 truncate">{skill.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{skill.description || 'No description'}</p>
                </div>
                <ConvertButton
                  elementName={skill.name}
                  elementType="skills"
                  sourceClient={activeClient}
                  sourcePath={skill.path || `~/.${activeClient === 'claude-code' ? 'claude' : activeClient}/skills/${skill.name}/`}
                  onConverted={handleConvert}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      {installDialog && (
        <InstallConfirmDialog
          name={installDialog.skill.name}
          sourcePath={installDialog.skill.path || 'plugin cache'}
          destPath={installDialog.destPath}
          client={activeClient}
          scope="user"
          onConfirm={handleInstallConfirm}
          onCancel={() => setInstallDialog(null)}
        />
      )}
      {conflictDialog && (
        <ConflictErrorDialog
          name={conflictDialog.name}
          existingPath={conflictDialog.existingPath}
          sourcePath={conflictDialog.sourcePath}
          onClose={() => setConflictDialog(null)}
        />
      )}
      {errorDialog && (
        <ConversionErrorDialog
          name={errorDialog.name}
          error={errorDialog.error}
          sourcePath={errorDialog.sourcePath}
          onClose={() => setErrorDialog(null)}
        />
      )}
    </div>
  )
}
