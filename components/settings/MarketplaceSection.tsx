/**
 * Skills Explorer Section
 *
 * Settings section for browsing and installing skills into agents.
 * Supports direct skill installation with client-type awareness:
 * - Claude agents: standalone skill install (with plugin-duplicate detection)
 * - Codex/Gemini/Cursor agents: bulk ai-maestro skills install
 * - Aider agents: not supported (no skill system)
 */

'use client'

import { SkillBrowser } from '@/components/marketplace'
import type { MarketplaceSkill } from '@/types/marketplace'
import { useState, useEffect } from 'react'
import { Store, ExternalLink, Info, UserCircle } from 'lucide-react'
import Link from 'next/link'
import { detectClientType } from '@/lib/client-capabilities'
import type { ClientType } from '@/lib/client-capabilities'

/** Minimal agent shape needed for the agent selector */
interface AgentOption {
  id: string
  name: string
  program: string
}

export default function MarketplaceSection() {
  const [notification, setNotification] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null)

  // Agent selector state
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [agentsLoading, setAgentsLoading] = useState(true)

  // Fetch agents on mount for the selector dropdown
  useEffect(() => {
    setAgentsLoading(true)
    fetch('/api/agents')
      .then(r => r.json())
      .then(data => {
        const list = (data.agents || data || []).map((a: Record<string, unknown>) => ({
          id: a.id as string,
          name: (a.name || a.alias || a.id) as string,
          program: (a.program || 'claude') as string,
        }))
        setAgents(list)
      })
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false))
  }, [])

  /** Show a timed notification toast */
  const showNotification = (text: string, type: 'info' | 'error' | 'success' = 'info') => {
    setNotification({ text, type })
    setTimeout(() => setNotification(null), 5000)
  }

  /**
   * Handle skill installation with client-type awareness.
   * - Claude: check for plugin duplicates, then install standalone via PATCH
   * - Codex/Gemini/Cursor: bulk install all ai-maestro skills via POST
   * - Aider: unsupported
   */
  const handleInstall = async (skill: MarketplaceSkill) => {
    if (!selectedAgentId) {
      showNotification('Select an agent first to install skills.', 'info')
      return
    }

    const agent = agents.find(a => a.id === selectedAgentId)
    if (!agent) return

    const clientType: ClientType = detectClientType(agent.program)

    if (clientType === 'aider') {
      showNotification('Aider does not support skills.', 'error')
      return
    }

    if (clientType === 'claude') {
      // For Claude agents: check if this skill is already part of an installed plugin
      try {
        const configRes = await fetch(`/api/agents/${agent.id}/local-config`)
        if (configRes.ok) {
          const config = await configRes.json()
          // Collect all skill names from installed plugins
          const pluginSkills: Array<{ name: string; pluginName: string }> = []
          const plugins = config.plugins || []
          for (const p of plugins) {
            const pSkills = p.elements?.skills || p.skills || []
            for (const s of pSkills) {
              pluginSkills.push({ name: typeof s === 'string' ? s : s.name, pluginName: p.name || p.id })
            }
          }
          const duplicate = pluginSkills.find(s => s.name === skill.name)
          if (duplicate) {
            showNotification(
              `"${skill.name}" is already installed via plugin "${duplicate.pluginName}". Installing standalone would create a duplicate.`,
              'error'
            )
            return
          }
        }
      } catch {
        // If local-config fetch fails, proceed with install anyway
      }

      // Install as standalone skill for Claude
      try {
        const res = await fetch(`/api/agents/${agent.id}/skills`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ add: [{ id: skill.id, name: skill.name, source: skill.marketplace }] }),
        })
        if (!res.ok) throw new Error(await res.text())
        showNotification(`Installed "${skill.name}" on ${agent.name}.`, 'success')
      } catch (err) {
        showNotification(`Failed to install skill: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
      }
    } else {
      // Codex / Gemini / Cursor: bulk install all ai-maestro skills
      showNotification(`Installing all ai-maestro skills for ${clientType} agent "${agent.name}"...`, 'info')
      try {
        const res = await fetch(`/api/agents/${agent.id}/install-skills`, { method: 'POST' })
        if (!res.ok) throw new Error(await res.text())
        showNotification(`All ai-maestro skills installed on ${agent.name}.`, 'success')
      } catch (err) {
        showNotification(`Failed to install skills: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
      }
    }
  }

  /** Border color for notification toast based on type */
  const notifBorder = notification?.type === 'error'
    ? 'border-red-500/40'
    : notification?.type === 'success'
      ? 'border-emerald-500/40'
      : 'border-blue-500/40'

  /** Text color for notification toast based on type */
  const notifText = notification?.type === 'error'
    ? 'text-red-300'
    : notification?.type === 'success'
      ? 'text-emerald-300'
      : 'text-gray-300'

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Store className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Skills Explorer</h1>
            <p className="text-sm text-gray-400">Browse and install skills into any agent. All CLI clients are supported.</p>
          </div>
        </div>
        <Link
          href="/marketplace"
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Open Full Page
        </Link>
      </div>

      {/* Agent Selector — pick which agent receives skill installs */}
      <div className="mb-6 p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
        <div className="flex items-center gap-3 flex-wrap">
          <UserCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <label htmlFor="agent-selector" className="text-sm text-gray-300 flex-shrink-0">
            Install skills to:
          </label>
          <select
            id="agent-selector"
            value={selectedAgentId}
            onChange={e => setSelectedAgentId(e.target.value)}
            disabled={agentsLoading}
            className="bg-gray-800 text-gray-200 text-sm rounded px-3 py-1.5 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[220px]"
          >
            <option value="">
              {agentsLoading ? 'Loading agents...' : 'Select an agent...'}
            </option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({detectClientType(a.program)})
              </option>
            ))}
          </select>
          {selectedAgentId && (() => {
            const agent = agents.find(a => a.id === selectedAgentId)
            if (!agent) return null
            const ct = detectClientType(agent.program)
            if (ct !== 'claude') {
              return (
                <span className="text-xs text-amber-400">
                  {ct === 'aider'
                    ? 'Aider does not support skills'
                    : `${ct} agents receive all ai-maestro skills at once`}
                </span>
              )
            }
            return null
          })()}
        </div>
      </div>

      {/* Info Banner */}
      <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300">
          <p>Browse all available skills from your installed Claude Code marketplaces.</p>
          <p className="mt-1 text-blue-400/80">Select an agent above, then click &quot;Add&quot; on any skill to install it.</p>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm bg-gray-800 border ${notifBorder} rounded-lg shadow-lg p-4 animate-in slide-in-from-right duration-300`}>
          <p className={`text-sm ${notifText}`}>{notification.text}</p>
        </div>
      )}

      {/* Skill Browser */}
      <SkillBrowser
        onSkillInstall={handleInstall}
        mode="browse"
      />
    </div>
  )
}
