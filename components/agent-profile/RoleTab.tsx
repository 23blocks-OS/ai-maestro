'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Shield, ChevronDown, FolderOpen, Sparkles, ExternalLink, Lock } from 'lucide-react'
import type { AgentLocalConfig } from '@/types/agent-local-config'
import { SectionLabel } from './shared'

// Governance titles that force a specific role-plugin (dropdown locked)
const TITLE_PLUGIN_MAP: Record<string, string> = {
  'manager': 'ai-maestro-assistant-manager-agent',
  'chief-of-staff': 'ai-maestro-chief-of-staff',
  'architect': 'ai-maestro-architect-agent',
  'orchestrator': 'ai-maestro-orchestrator-agent',
  'integrator': 'ai-maestro-integrator-agent',
  'programmer': 'ai-maestro-programmer-agent',
}

export default function RoleTab({
  config,
  agentTitle,
  onEditInHaephestos,
  onBrowse,
  onRefresh,
}: {
  config: AgentLocalConfig
  agentTitle?: 'manager' | 'chief-of-staff' | 'architect' | 'orchestrator' | 'integrator' | 'programmer' | 'member'
  onEditInHaephestos?: (profilePath: string) => void
  onBrowse?: (path: string) => void
  onRefresh?: () => void
}) {
  // If the agent's governance title requires a specific plugin, lock the selector
  const requiredPlugin = agentTitle ? TITLE_PLUGIN_MAP[agentTitle] || null : null
  const isLocked = requiredPlugin !== null
  const [availablePlugins, setAvailablePlugins] = useState<{
    name: string
    description: string
    source?: 'marketplace' | 'local'
    marketplace?: string
  }[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [switching, setSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch available Role Plugins from ~/agents/role-plugins/
  const loadPlugins = useCallback(() => {
    fetch('/api/agents/role-plugins')
      .then(r => r.ok ? r.json() : { plugins: [] })
      .then(d => setAvailablePlugins(d.plugins || []))
      .catch((err) => { console.error('[RoleTab] Failed to load plugins:', err) })
  }, [])

  // loadPlugins is memoized with useCallback([]) so its reference is stable;
  // including it in the dependency array satisfies the linter without causing re-runs.
  useEffect(() => { loadPlugins() }, [loadPlugins])

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!showDropdown) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showDropdown])

  const handleSwitch = async (pluginName: string) => {
    // Server-side enforcement: MANAGER and COS have locked role-plugins
    if (agentTitle === 'manager' || agentTitle === 'chief-of-staff') {
      return // Title-locked — the dropdown is disabled but this is a safety guard
    }
    if (pluginName === config.rolePlugin?.name) { setShowDropdown(false); return }
    setSwitching(true)
    try {
      // Uninstall current role plugin before installing the new one
      if (config.rolePlugin) {
        const uninstallRes = await fetch('/api/agents/role-plugins/install', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pluginName: config.rolePlugin.name,
            agentDir: config.workingDirectory,
            marketplaceName: config.rolePlugin.marketplace,
          }),
        })
        // MF-025: abort if uninstall failed to avoid dual conflicting role plugins
        if (!uninstallRes.ok) {
          console.error('[RoleTab] Uninstall failed, aborting switch to prevent conflicting role plugins')
          return
        }
      }
      // Install the selected role plugin, passing its marketplace origin (explicit scope: 'local' for defense-in-depth)
      const newPlugin = availablePlugins.find(p => p.name === pluginName)
      const installRes = await fetch('/api/agents/role-plugins/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginName,
          agentDir: config.workingDirectory,
          marketplaceName: newPlugin?.marketplace,
          scope: 'local',
        }),
      })
      // MF-026: only refresh on install success — avoids false "config refreshed" signal on failure
      if (!installRes.ok) {
        const err = await installRes.json().catch(() => ({ error: 'Install failed' }))
        console.error('[RoleTab] Install failed, aborting switch:', err.error)
        return
      }
    } catch (err) {
      console.error('[RoleTab] Failed to switch role plugin:', err)
      return
    } finally {
      setSwitching(false)
      setShowDropdown(false)
    }
    onRefresh?.()
  }

  // Role Plugin selector (always shown at top)
  const selectorEl = (
    <div className="mb-3">
      <SectionLabel text="Role Plugin" />
      <div className="relative" ref={dropdownRef}>
        <div
          onClick={() => { if (!isLocked) setShowDropdown(!showDropdown) }}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
            border ${config.rolePlugin ? 'border-amber-500/30 bg-amber-500/5' : 'border-gray-700/40 bg-gray-800/30'}
            ${isLocked ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:bg-amber-500/10'}
          `}
          title={isLocked ? `Locked: ${agentTitle?.toUpperCase()} title requires ${requiredPlugin}` : undefined}
        >
          {isLocked
            ? <Lock className="w-4 h-4 flex-shrink-0 text-amber-400" />
            : <Shield className={`w-4 h-4 flex-shrink-0 ${config.rolePlugin ? 'text-amber-400' : 'text-gray-600'}`} />
          }
          <span className={`text-xs font-medium flex-1 truncate ${config.rolePlugin ? 'text-amber-300' : 'text-gray-500 italic'}`}>
            {switching ? 'Switching…' : (config.rolePlugin?.name || 'None — select a Role Plugin')}
          </span>
          {!isLocked && (
            <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
          )}
        </div>

        {/* Locked notice when governance title forces a specific plugin */}
        {isLocked && (
          <p className="text-[10px] text-amber-400/70 mt-1 px-1">
            Locked by <span className="font-bold tracking-wider">{agentTitle?.toUpperCase()}</span> title — requires {requiredPlugin}
          </p>
        )}

        {showDropdown && !isLocked && availablePlugins.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
            {availablePlugins.map((rp) => (
              <div
                key={rp.name}
                onClick={() => handleSwitch(rp.name)}
                className={`
                  px-3 py-2 cursor-pointer transition-colors text-xs
                  ${rp.name === config.rolePlugin?.name
                    ? 'bg-amber-500/10 text-amber-300 font-medium'
                    : 'text-gray-300 hover:bg-gray-800'
                  }
                `}
              >
                <p className="truncate flex items-center gap-1.5">
                  {rp.name}
                  {/* Show "(custom)" badge for locally-created role plugins */}
                  {rp.source === 'local' && (
                    <span className="text-[9px] text-purple-400/80 bg-purple-500/10 border border-purple-500/20 rounded px-1 py-px leading-none flex-shrink-0">
                      custom
                    </span>
                  )}
                </p>
                {rp.description && (
                  <p className="text-[10px] text-gray-500 truncate mt-0.5">{rp.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (!config.rolePlugin) {
    return (
      <div className="space-y-4">
        {selectorEl}
        <div className="text-center py-4">
          <p className="text-[10px] text-gray-600 mb-4 px-4 leading-relaxed">
            A Role-Plugin defines the agent&apos;s specialization (Architect, Programmer, etc.)
            and bundles skills, hooks, and rules for that role.
          </p>
          {onEditInHaephestos && (
            <div
              onClick={() => onEditInHaephestos('')}
              className="
                inline-flex items-center gap-1.5 px-3 py-1.5
                rounded-md bg-amber-500/10 border border-amber-500/20
                text-[11px] text-amber-400 font-medium cursor-pointer
                hover:bg-amber-500/20 transition-colors duration-150
              "
            >
              <Sparkles className="w-3 h-3" />
              Create new with Haephestos
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {selectorEl}

      {/* Current Role Plugin details */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-gray-500">Main Agent:</span>
          <span className="text-[10px] text-gray-400">{config.rolePlugin.mainAgentName}</span>
          {onBrowse && config.rolePlugin?.profilePath && (
            <span
              className="ml-auto"
              title="Browse Role-Plugin contents"
              onClick={() => {
                // profilePath is the .agent.toml file — browse its parent directory
                const dir = config.rolePlugin!.profilePath.replace(/\/[^/]+$/, '')
                onBrowse(dir)
              }}
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400/60 cursor-pointer hover:text-amber-300 transition-colors" />
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-600 truncate">{config.rolePlugin.profilePath}</p>

        {onEditInHaephestos && (
          <div
            onClick={() => onEditInHaephestos(config.rolePlugin!.profilePath)}
            title="Opens Haephestos to edit this Persona's Role-Plugin."
            className="
              mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5
              rounded-md bg-amber-500/10 border border-amber-500/20
              text-[11px] text-amber-400 font-medium cursor-pointer
              hover:bg-amber-500/20 transition-colors duration-150
            "
          >
            <ExternalLink className="w-3 h-3" />
            Edit in Haephestos
          </div>
        )}
      </div>

      {/* Global dependencies from .agent.toml */}
      {config.globalDependencies && (
        <div>
          <SectionLabel text="Global Dependencies (read-only)" />
          <div className="space-y-2 opacity-60">
            {renderDepsArray('Plugins', config.globalDependencies.plugins)}
            {renderDepsArray('Skills', config.globalDependencies.skills)}
            {renderDepsArray('MCP Servers', config.globalDependencies.mcpServers)}
            {renderDepsArray('Scripts', config.globalDependencies.scripts)}
            {renderDepsArray('Hooks', config.globalDependencies.hooks)}
            {renderDepsArray('Tools', config.globalDependencies.tools)}
          </div>
        </div>
      )}
    </div>
  )
}

function renderDepsArray(label: string, items: string[]) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-[10px] text-gray-500 font-medium mb-0.5">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className="text-[10px] text-gray-400 bg-gray-800/60 border border-gray-700/40 rounded px-1.5 py-0.5"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
