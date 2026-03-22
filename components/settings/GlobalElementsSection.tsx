'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Puzzle, Loader2, ChevronDown, ChevronRight, Store,
  ToggleLeft, ToggleRight,
  Wand2, Bot, Terminal, Webhook, Server, FileCode,
  ScrollText, Palette,
} from 'lucide-react'
import MarketplaceManager from './MarketplaceManager'

interface PluginInfo {
  name: string
  key: string
  enabled: boolean
}

interface MarketplaceGroup {
  marketplace: string
  plugins: PluginInfo[]
}

interface ElementInfo {
  name: string
  sourcePlugin: string
  sourceMarketplace: string
}

interface PluginElements {
  pluginName: string
  marketplace: string
  skills: ElementInfo[]
  agents: ElementInfo[]
  commands: ElementInfo[]
  hooks: ElementInfo[]
  rules: ElementInfo[]
  mcpServers: ElementInfo[]
  lspServers: ElementInfo[]
  outputStyles: ElementInfo[]
}

interface ElementTotals {
  skills: number
  agents: number
  commands: number
  hooks: number
  rules: number
  mcpServers: number
  lspServers: number
  outputStyles: number
}

const ELEMENT_SECTIONS: { key: keyof Omit<PluginElements, 'pluginName' | 'marketplace'>; label: string; icon: typeof Wand2 }[] = [
  { key: 'skills', label: 'Skills', icon: Wand2 },
  { key: 'agents', label: 'Agents', icon: Bot },
  { key: 'commands', label: 'Commands', icon: Terminal },
  { key: 'hooks', label: 'Hooks', icon: Webhook },
  { key: 'rules', label: 'Rules', icon: ScrollText },
  { key: 'mcpServers', label: 'MCP Servers', icon: Server },
  { key: 'lspServers', label: 'LSP Servers', icon: FileCode },
  { key: 'outputStyles', label: 'Output Styles', icon: Palette },
]

/**
 * Global Elements Section — manages user-level plugins grouped by marketplace.
 * Only elements from ENABLED plugins are active for all agents.
 * Toggling a plugin on/off writes to ~/.claude/settings.json enabledPlugins.
 * Shows elements (skills, agents, commands, hooks, MCP, LSP) from enabled plugins.
 */
export default function GlobalElementsSection() {
  const [activeTab, setActiveTab] = useState<'plugins' | 'marketplaces'>('plugins')
  const [groups, setGroups] = useState<MarketplaceGroup[]>([])
  const [enabledCount, setEnabledCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [expandedMarketplaces, setExpandedMarketplaces] = useState<Set<string>>(new Set())

  // Element listing state
  const [pluginElements, setPluginElements] = useState<PluginElements[]>([])
  const [elementTotals, setElementTotals] = useState<ElementTotals>({ skills: 0, agents: 0, commands: 0, hooks: 0, rules: 0, mcpServers: 0, lspServers: 0, outputStyles: 0 })
  const [loadingElements, setLoadingElements] = useState(false)
  const [showElements, setShowElements] = useState(true)
  const [expandedElementPlugins, setExpandedElementPlugins] = useState<Set<string>>(new Set())

  const fetchPlugins = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/global-plugins')
      if (!res.ok) return
      const data = await res.json()
      setGroups(data.groups || [])
      setEnabledCount(data.enabledCount || 0)
      setTotalCount(data.totalCount || 0)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  const fetchElements = useCallback(async () => {
    setLoadingElements(true)
    try {
      const res = await fetch('/api/settings/global-elements')
      if (!res.ok) return
      const data = await res.json()
      setPluginElements(data.plugins || [])
      setElementTotals(data.totals || { skills: 0, agents: 0, commands: 0, hooks: 0, rules: 0, mcpServers: 0, lspServers: 0, outputStyles: 0 })
    } catch { /* ignore */ }
    finally { setLoadingElements(false) }
  }, [])

  useEffect(() => { fetchPlugins() }, [fetchPlugins])
  useEffect(() => { fetchElements() }, [fetchElements])

  // Auto-expand marketplaces that have enabled plugins
  useEffect(() => {
    const withEnabled = new Set<string>()
    for (const g of groups) {
      if (g.plugins.some(p => p.enabled)) withEnabled.add(g.marketplace)
    }
    setExpandedMarketplaces(prev => {
      const next = new Set(prev)
      for (const m of withEnabled) next.add(m)
      return next
    })
  }, [groups])

  const toggleMarketplace = (marketplace: string) => {
    setExpandedMarketplaces(prev => {
      const next = new Set(prev)
      if (next.has(marketplace)) next.delete(marketplace)
      else next.add(marketplace)
      return next
    })
  }

  const togglePlugin = async (key: string, currentEnabled: boolean) => {
    setToggling(key)
    try {
      const res = await fetch('/api/settings/global-plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, enabled: !currentEnabled }),
      })
      if (res.ok) {
        // Optimistic update
        setGroups(prev => prev.map(g => ({
          ...g,
          plugins: g.plugins.map(p => p.key === key ? { ...p, enabled: !currentEnabled } : p),
        })))
        setEnabledCount(prev => currentEnabled ? prev - 1 : prev + 1)
        // Re-fetch elements after toggle
        setTimeout(() => fetchElements(), 300)
      }
    } catch { /* ignore */ }
    finally { setToggling(null) }
  }

  const toggleElementPlugin = (pluginName: string) => {
    setExpandedElementPlugins(prev => {
      const next = new Set(prev)
      if (next.has(pluginName)) next.delete(pluginName)
      else next.add(pluginName)
      return next
    })
  }

  const totalElements = elementTotals.skills + elementTotals.agents + elementTotals.commands +
    elementTotals.hooks + elementTotals.rules + elementTotals.mcpServers + elementTotals.lspServers +
    elementTotals.outputStyles

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
        <span className="text-sm text-gray-500">Loading plugins...</span>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-xl font-bold text-white mb-2">Global Elements</h2>
      <p className="text-sm text-gray-400 mb-4">
        User-level plugins shared by <strong>all agents</strong> on this host.
      </p>

      {/* Tab bar: Plugins | Marketplaces */}
      <div className="flex items-center gap-1 mb-6 bg-gray-800/30 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('plugins')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'plugins'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 border border-transparent'
          }`}
        >
          <Puzzle className="w-3.5 h-3.5" />
          Plugins
          <span className="opacity-60">{enabledCount}/{totalCount}</span>
        </button>
        <button
          onClick={() => setActiveTab('marketplaces')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'marketplaces'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 border border-transparent'
          }`}
        >
          <Store className="w-3.5 h-3.5" />
          Marketplaces
          <span className="opacity-60">{groups.length}</span>
        </button>
      </div>

      {/* Marketplaces tab */}
      {activeTab === 'marketplaces' && <MarketplaceManager />}

      {/* Plugins tab */}
      {activeTab === 'plugins' && (<>

      {/* Plugin list grouped by marketplace */}
      <div className="space-y-3 mb-8">
        {groups.map(group => {
          const expanded = expandedMarketplaces.has(group.marketplace)
          const enabledInGroup = group.plugins.filter(p => p.enabled).length
          return (
            <div key={group.marketplace} className="rounded-xl border border-gray-800 overflow-hidden">
              {/* Marketplace header */}
              <button
                onClick={() => toggleMarketplace(group.marketplace)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800/50 hover:bg-gray-800/70 transition-colors text-left"
              >
                {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <Store className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-200 flex-1 truncate">{group.marketplace}</span>
                <span className="text-xs text-gray-500">
                  {enabledInGroup}/{group.plugins.length}
                </span>
              </button>

              {/* Plugin list */}
              {expanded && (
                <div className="divide-y divide-gray-800/50">
                  {group.plugins.map(plugin => {
                    const isToggling = toggling === plugin.key
                    return (
                      <div
                        key={plugin.key}
                        className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                          plugin.enabled ? 'bg-emerald-500/5' : 'bg-gray-900/30'
                        }`}
                      >
                        <Puzzle className={`w-3.5 h-3.5 flex-shrink-0 ${plugin.enabled ? 'text-emerald-400' : 'text-gray-600'}`} />
                        <span className={`text-xs flex-1 truncate ${plugin.enabled ? 'text-gray-200' : 'text-gray-500'}`}>
                          {plugin.name}
                        </span>
                        {/* Toggle switch */}
                        <button
                          onClick={() => togglePlugin(plugin.key, plugin.enabled)}
                          disabled={isToggling}
                          className="flex-shrink-0 transition-colors"
                          title={plugin.enabled ? 'Disable plugin' : 'Enable plugin'}
                        >
                          {isToggling ? (
                            <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                          ) : plugin.enabled ? (
                            <ToggleRight className="w-6 h-6 text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-gray-600" />
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Elements from enabled plugins */}
      <div className="border-t border-gray-800 pt-6">
        <button
          onClick={() => setShowElements(!showElements)}
          className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity"
        >
          {showElements ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <h3 className="text-lg font-semibold text-white">Active Elements</h3>
          {loadingElements ? (
            <Loader2 className="w-4 h-4 text-gray-500 animate-spin ml-2" />
          ) : (
            <span className="text-xs text-gray-500 ml-2">
              {totalElements} elements from {pluginElements.length} plugins
            </span>
          )}
        </button>

        {showElements && (
          <>
            {/* Summary row */}
            <div className="flex flex-wrap gap-3 mb-4">
              {ELEMENT_SECTIONS.map(({ key, label, icon: Icon }) => {
                const count = elementTotals[key as keyof ElementTotals] || 0
                if (count === 0) return null
                return (
                  <div key={key} className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-800/50 rounded-lg px-2.5 py-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{count} {label}</span>
                  </div>
                )
              })}
            </div>

            {/* Per-plugin element listing */}
            {pluginElements.length === 0 && !loadingElements && (
              <p className="text-sm text-gray-500 italic">No enabled plugins with elements found.</p>
            )}

            <div className="space-y-2">
              {pluginElements.map(plugin => {
                const pluginKey = `${plugin.pluginName}@${plugin.marketplace}`
                const isExpanded = expandedElementPlugins.has(pluginKey)
                const elemCount = plugin.skills.length + plugin.agents.length + plugin.commands.length +
                  plugin.hooks.length + plugin.rules.length + plugin.mcpServers.length +
                  plugin.lspServers.length + plugin.outputStyles.length

                return (
                  <div key={pluginKey} className="rounded-lg border border-gray-800/60 overflow-hidden">
                    {/* Plugin header */}
                    <button
                      onClick={() => toggleElementPlugin(pluginKey)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 bg-gray-800/30 hover:bg-gray-800/50 transition-colors text-left"
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                      <Puzzle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span className="text-xs font-medium text-gray-200 flex-1 truncate">{plugin.pluginName}</span>
                      <span className="text-[10px] text-gray-600 truncate max-w-[120px]">{plugin.marketplace}</span>
                      <span className="text-[10px] text-gray-500 tabular-nums">{elemCount}</span>
                    </button>

                    {/* Element sections */}
                    {isExpanded && (
                      <div className="px-3 py-2 space-y-2 bg-gray-900/20">
                        {ELEMENT_SECTIONS.map(({ key, label, icon: Icon }) => {
                          const items = plugin[key as keyof Omit<PluginElements, 'pluginName' | 'marketplace'>] as ElementInfo[]
                          if (!items || items.length === 0) return null
                          return (
                            <div key={key}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <Icon className="w-3 h-3 text-gray-500" />
                                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{label}</span>
                                <span className="text-[10px] text-gray-600">{items.length}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {items.map((item, idx) => (
                                  <span
                                    key={`${item.name}-${idx}`}
                                    className="text-[11px] px-2 py-0.5 rounded-md bg-gray-800/60 text-gray-300 border border-gray-700/40"
                                    title={item.name}
                                  >
                                    {item.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
      </>)}
    </div>
  )
}
