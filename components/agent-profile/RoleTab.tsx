'use client'

import { useState } from 'react'
import { Shield, FolderOpen, Sparkles, ExternalLink, Lock } from 'lucide-react'
import type { AgentLocalConfig } from '@/types/agent-local-config'
import type { GovernanceTitle } from '@/hooks/useGovernance'
import { SectionLabel } from './shared'
import RolePluginModal from './RolePluginModal'
import { TITLE_PLUGIN_MAP as ECOSYSTEM_TITLE_MAP, LOCAL_MARKETPLACE_NAME } from '@/lib/ecosystem-constants'

// Governance titles that force a specific role-plugin (no change allowed)
// Derived from ecosystem-constants — lower-cased keys for UI matching.
const TITLE_PLUGIN_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(ECOSYSTEM_TITLE_MAP).map(([k, v]) => [k.toLowerCase(), v])
)

export default function RoleTab({
  config,
  agentTitle,
  onEditInHaephestos,
  onBrowse,
  onRefresh,
}: {
  config: AgentLocalConfig
  agentTitle?: GovernanceTitle
  onEditInHaephestos?: (profilePath: string) => void
  onBrowse?: (path: string) => void
  onRefresh?: () => void
}) {
  const [showModal, setShowModal] = useState(false)
  const [switching, setSwitching] = useState(false)

  // Titles that lock the role-plugin (no Change button)
  const requiredPlugin = agentTitle ? TITLE_PLUGIN_MAP[agentTitle] || null : null
  const isLocked = requiredPlugin !== null
  // MEMBER and AUTONOMOUS can change their plugin
  const canChange = !isLocked

  const handleSwitchPlugin = async (pluginName: string) => {
    if (!config.workingDirectory || isLocked) return
    if (pluginName === config.rolePlugin?.name) return
    setSwitching(true)
    try {
      // Uninstall current
      if (config.rolePlugin) {
        const uninstallRes = await fetch('/api/agents/role-plugins/install', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pluginName: config.rolePlugin.name, agentDir: config.workingDirectory }),
        })
        if (!uninstallRes.ok) return
      }
      // Install new
      const installRes = await fetch('/api/agents/role-plugins/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginName, agentDir: config.workingDirectory, scope: 'local' }),
      })
      if (!installRes.ok) return
    } catch (err) {
      console.error('[RoleTab] Switch failed:', err)
      return
    } finally {
      setSwitching(false)
    }
    onRefresh?.()
  }

  // Role plugin display — locked for titled agents, changeable for MEMBER/AUTONOMOUS
  const selectorEl = (
    <div className="mb-3">
      <SectionLabel text="Role Plugin" />
      {isLocked ? (
        // Locked: show static label with lock icon
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
          <Lock className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-xs font-medium text-emerald-300 flex-1 truncate">
            {switching ? 'Switching…' : (requiredPlugin || config.rolePlugin?.name || 'None')}
          </span>
          <p className="text-[9px] text-emerald-400/60 flex-shrink-0">
            Locked by {agentTitle?.toUpperCase()}
          </p>
        </div>
      ) : (
        // Changeable: show current plugin + Change button
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700/40 bg-gray-800/30">
          <Shield className={`w-4 h-4 flex-shrink-0 ${config.rolePlugin ? 'text-amber-400' : 'text-gray-600'}`} />
          <span className="text-xs font-medium text-gray-400 flex-1 truncate">
            {switching ? 'Switching…' : (config.rolePlugin?.name || (agentTitle === 'member' ? 'Default (Programmer)' : 'No Role Plugin'))}
            {!switching && config.rolePlugin?.name && config.rolePlugin.marketplace === LOCAL_MARKETPLACE_NAME && (
              <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">custom</span>
            )}
          </span>
          <button
            onClick={() => setShowModal(true)}
            disabled={switching}
            className="text-[10px] px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium transition-colors disabled:opacity-50"
          >
            Change
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {selectorEl}

      {/* Current Role Plugin details (if installed) */}
      {config.rolePlugin && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-gray-500">Main Agent:</span>
            <span className="text-[10px] text-gray-400">{config.rolePlugin.mainAgentName}</span>
            {onBrowse && config.rolePlugin?.profilePath && (
              <span
                className="ml-auto"
                title="Browse Role-Plugin contents"
                onClick={() => {
                  const dir = config.rolePlugin!.profilePath.replace(/\/[^/]+$/, '')
                  onBrowse(dir)
                }}
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400/60 cursor-pointer hover:text-amber-300 transition-colors" />
              </span>
            )}
          </div>
          {config.rolePlugin.marketplace && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500">Source:</span>
              <span className="text-[10px] text-gray-400">{config.rolePlugin.marketplace}</span>
              <ExternalLink className="w-2.5 h-2.5 text-gray-600" />
            </div>
          )}
        </div>
      )}

      {/* No plugin — show Haephestos create option */}
      {!config.rolePlugin && !isLocked && (
        <div className="text-center py-4">
          <p className="text-[10px] text-gray-600 mb-4 px-4 leading-relaxed">
            A Role-Plugin defines the agent&apos;s specialization and bundles skills, hooks, and rules for that role.
          </p>
          {onEditInHaephestos && (
            <div
              onClick={() => onEditInHaephestos('')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400 font-medium cursor-pointer hover:bg-amber-500/20 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Create new with Haephestos
            </div>
          )}
        </div>
      )}

      {/* Role Plugin selection modal */}
      {canChange && (
        <RolePluginModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          currentPluginName={config.rolePlugin?.name}
          agentTitle={agentTitle || 'autonomous'}
          onSelectPlugin={async (pluginName) => {
            await handleSwitchPlugin(pluginName)
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}
