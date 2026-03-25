'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Users,
  Webhook,
  ScrollText,
  Terminal as TerminalIcon,
  Server,
  Palette,
  Puzzle,
} from 'lucide-react'
import type { AgentLocalConfig, LocalPlugin } from '@/types/agent-local-config'
import { EmptyState, type TabId } from './shared'

/** Element type counts for a plugin */
function pluginElementCounts(p: LocalPlugin) {
  if (!p.elements) return null
  const e = p.elements
  return {
    skills: e.skills?.length ?? 0,
    agents: e.agents?.length ?? 0,
    hooks: e.hooks?.length ?? 0,
    rules: e.rules?.length ?? 0,
    commands: e.commands?.length ?? 0,
    mcpServers: e.mcpServers?.length ?? 0,
    outputStyles: e.outputStyles?.length ?? 0,
  }
}

/** Small count chip for element types */
const ELEMENT_CHIPS: { key: string; label: string; icon: typeof Sparkles; tabId: TabId }[] = [
  { key: 'skills', label: 'Skills', icon: Sparkles, tabId: 'skills' },
  { key: 'agents', label: 'Agents', icon: Users, tabId: 'agents' },
  { key: 'hooks', label: 'Hooks', icon: Webhook, tabId: 'hooks' },
  { key: 'rules', label: 'Rules', icon: ScrollText, tabId: 'rules' },
  { key: 'commands', label: 'Cmds', icon: TerminalIcon, tabId: 'commands' },
  { key: 'mcpServers', label: 'MCP', icon: Server, tabId: 'mcps' },
  { key: 'outputStyles', label: 'Styles', icon: Palette, tabId: 'outputStyles' },
]

interface PluginsTabProps {
  config: AgentLocalConfig
  /** Callback to switch accordion section in parent (cross-section navigation) */
  onSwitchTab?: (tab: TabId) => void
}

export default function PluginsTab({ config, onSwitchTab }: PluginsTabProps) {
  const router = useRouter()
  const [confirmUninstall, setConfirmUninstall] = useState<LocalPlugin | null>(null)
  const [uninstalling, setUninstalling] = useState(false)
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null)

  const handleUninstall = async (plugin: LocalPlugin) => {
    setUninstalling(true)
    try {
      // Extract marketplace from plugin key ("name@marketplace") for correct removal
      const marketplaceName = plugin.key?.includes('@') ? plugin.key.split('@').slice(1).join('@') : undefined
      const res = await fetch('/api/agents/role-plugins/install', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginName: plugin.name,
          agentDir: config.workingDirectory,
          ...(marketplaceName !== undefined && { marketplaceName }),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Uninstall failed' }))
        console.error('[PluginsTab] Uninstall failed:', err.error)
      }
    } catch (err) {
      console.error('[PluginsTab] Uninstall request failed:', err)
    }
    setUninstalling(false)
    setConfirmUninstall(null)
  }

  if (config.plugins.length === 0) {
    return <EmptyState text="No plugins installed" hint="No non-Role plugins detected in local config. Role Plugin shown in Role tab." />
  }

  return (
    <div className="space-y-1.5">
      {config.plugins.map((p) => {
        const isRole = p.name === config.rolePlugin?.name
        const isExpanded = expandedPlugin === p.name
        const counts = pluginElementCounts(p)
        const totalElements = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0
        const mkt = p.key?.includes('@') ? p.key.split('@').slice(1).join('@') : undefined

        return (
          <div
            key={p.name}
            className={`rounded-lg border overflow-hidden ${
              p.isConflictingRolePlugin
                ? 'border-red-500/40 bg-red-500/10'
                : isRole
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : 'border-gray-700/30 bg-gray-800/20'
            }`}
          >
            {/* Plugin header — clickable to expand/collapse */}
            <div
              onClick={() => setExpandedPlugin(isExpanded ? null : p.name)}
              className="flex items-center gap-2 px-2.5 py-2 cursor-pointer hover:bg-gray-800/20 transition-colors"
            >
              {isExpanded
                ? <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
                : <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
              }
              <Puzzle className={`w-3.5 h-3.5 flex-shrink-0 ${isRole ? 'text-emerald-400' : 'text-blue-400'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium truncate ${p.isConflictingRolePlugin ? 'text-red-300' : 'text-gray-200'}`}>
                  {p.name}
                </p>
              </div>
              {/* Version badge */}
              {p.version && (
                <span className="text-[8px] text-gray-600 px-1 flex-shrink-0">{p.version}</span>
              )}
              {/* Element count chip */}
              {totalElements > 0 && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-gray-800/60 text-gray-500 flex-shrink-0">
                  {totalElements}
                </span>
              )}
              {/* Role/Uninstall actions */}
              {isRole ? (
                <span className="text-[9px] text-emerald-400/70 px-1.5 flex-shrink-0">role</span>
              ) : p.isConflictingRolePlugin ? (
                <div
                  onClick={(e) => { e.stopPropagation(); setConfirmUninstall(p) }}
                  className="flex-shrink-0 p-1 rounded-md cursor-pointer hover:bg-red-500/20"
                  title="Uninstall this plugin"
                >
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                </div>
              ) : (
                <div
                  onClick={(e) => { e.stopPropagation(); setConfirmUninstall(p) }}
                  className="flex-shrink-0 p-1 rounded-md cursor-pointer hover:bg-gray-700/60"
                  title="Uninstall this plugin"
                >
                  <XCircle className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
                </div>
              )}
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-3 pb-2.5 border-t border-gray-800/30 space-y-2 pt-2">
                {/* Description */}
                {p.description && (
                  <p className="text-[10px] text-gray-500 leading-snug line-clamp-3">{p.description}</p>
                )}

                {/* Metadata rows */}
                <div className="space-y-0.5">
                  {p.author && (
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <span className="text-gray-600 w-14 flex-shrink-0">Author</span>
                      <span className="text-gray-400 truncate">{p.author}</span>
                    </div>
                  )}
                  {p.version && (
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <span className="text-gray-600 w-14 flex-shrink-0">Version</span>
                      <span className="text-gray-400">{p.version}</span>
                    </div>
                  )}
                  {p.license && (
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <span className="text-gray-600 w-14 flex-shrink-0">License</span>
                      <span className="text-gray-400">{p.license}</span>
                    </div>
                  )}
                  {p.isConflictingRolePlugin && (
                    <p className="text-[10px] text-red-400/80 mt-0.5">
                      Conflicting Role Plugin — only one is allowed per agent
                    </p>
                  )}
                </div>

                {/* Marketplace link */}
                {mkt && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      sessionStorage.setItem('profile-panel-return', JSON.stringify({ agentId: config.workingDirectory, tab: 'plugins' }))
                      router.push(`/settings?tab=global-elements&subtab=plugins&marketplace=${encodeURIComponent(mkt)}`)
                    }}
                    className="inline-flex items-center gap-1 text-[9px] text-emerald-400/70 hover:text-emerald-300 cursor-pointer"
                    title={`View in Settings → ${mkt}`}
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    {mkt}
                  </span>
                )}

                {/* Element sections — clickable chips that navigate to element accordion section */}
                {counts && totalElements > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {ELEMENT_CHIPS.map(({ key, label, icon: Icon, tabId }) => {
                      const count = counts[key as keyof typeof counts]
                      if (!count) return null
                      return (
                        <div
                          key={key}
                          onClick={(e) => {
                            e.stopPropagation()
                            // Cross-section navigation: switch to the element's accordion section
                            if (onSwitchTab) onSwitchTab(tabId)
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-800/40 hover:bg-gray-700/60 cursor-pointer transition-colors"
                          title={`View ${label} from this plugin`}
                        >
                          <Icon className="w-2.5 h-2.5 text-gray-500" />
                          <span className="text-[8px] text-gray-400">{label}</span>
                          <span className="text-[8px] text-gray-600">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Uninstall confirmation dialog */}
      {confirmUninstall && (
        <div className={`mt-3 px-3 py-3 rounded-lg border ${
          confirmUninstall.isConflictingRolePlugin
            ? 'border-red-500/30 bg-red-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}>
          <p className={`text-xs mb-3 ${confirmUninstall.isConflictingRolePlugin ? 'text-red-300' : 'text-amber-300'}`}>
            Do you want to uninstall <span className="font-semibold">{confirmUninstall.name}</span>?
            {!confirmUninstall.isConflictingRolePlugin && (
              <span className="block mt-1 text-[10px] opacity-80">
                All elements bundled in this plugin will also be removed.
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleUninstall(confirmUninstall)}
              disabled={uninstalling}
              className={`flex-1 px-3 py-1.5 rounded-md disabled:opacity-50 text-white text-xs font-medium transition-colors ${
                confirmUninstall.isConflictingRolePlugin
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-amber-600 hover:bg-amber-500'
              }`}
            >
              {uninstalling ? 'Uninstalling…' : 'Yes'}
            </button>
            <button
              onClick={() => setConfirmUninstall(null)}
              disabled={uninstalling}
              className="flex-1 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-xs font-medium transition-colors"
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
