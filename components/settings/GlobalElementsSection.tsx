'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Puzzle, Loader2, ChevronDown, ChevronRight, Store, Search, ExternalLink,
  ToggleLeft, ToggleRight,
  Wand2, Bot, Terminal, Webhook, Server, FileCode,
  ScrollText, Palette,
} from 'lucide-react'
import MarketplaceManager from './MarketplaceManager'

interface PluginInfo {
  name: string
  key: string
  enabled: boolean
  version: string | null
  description: string | null
  author: string | null
  authorEmail: string | null
  license: string | null
  homepage: string | null
  repository: string | null
  keywords: string[] | null
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
  version: string | null
  sourceUrl: string | null
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

const ELEMENT_SECTIONS: { key: keyof ElementTotals; label: string; icon: typeof Wand2 }[] = [
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
 * Three tabs: Plugins (toggle + info), Elements (active elements), Marketplaces (full management).
 */
export default function GlobalElementsSection() {
  const [activeTab, setActiveTab] = useState<'plugins' | 'elements' | 'marketplaces'>('plugins')
  const [groups, setGroups] = useState<MarketplaceGroup[]>([])
  const [enabledCount, setEnabledCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [expandedMarketplaces, setExpandedMarketplaces] = useState<Set<string>>(new Set())

  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null) // accordion for plugin details

  // Search states
  const [pluginSearch, setPluginSearch] = useState('')
  const [elementSearch, setElementSearch] = useState('')

  // Element listing state
  const [pluginElements, setPluginElements] = useState<PluginElements[]>([])
  const [elementTotals, setElementTotals] = useState<ElementTotals>({ skills: 0, agents: 0, commands: 0, hooks: 0, rules: 0, mcpServers: 0, lspServers: 0, outputStyles: 0 })
  const [loadingElements, setLoadingElements] = useState(false)
  const [expandedElementPlugins, setExpandedElementPlugins] = useState<Set<string>>(new Set())

  const fetchPlugins = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/global-plugins')
      if (!res.ok) return
      const data = await res.json()
      setGroups(data.groups || [])
      setEnabledCount(data.enabledCount || 0)
      setTotalCount(data.totalCount || 0)
    } catch (err) { console.error('Error fetching plugins:', err) }
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
    } catch (err) { console.error('Error fetching elements:', err) }
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
        setGroups(prev => prev.map(g => ({
          ...g,
          plugins: g.plugins.map(p => p.key === key ? { ...p, enabled: !currentEnabled } : p),
        })))
        setEnabledCount(prev => currentEnabled ? prev - 1 : prev + 1)
        fetchElements()
      }
    } catch (err) {
      console.error('Error toggling plugin:', err)
      fetchPlugins()
    }
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

  // Filter plugins by search
  const filteredGroups = useMemo(() => {
    if (!pluginSearch.trim()) return groups
    const q = pluginSearch.toLowerCase()
    return groups
      .map(g => ({
        ...g,
        plugins: g.plugins.filter(p =>
          p.name.toLowerCase().includes(q) ||
          g.marketplace.toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.plugins.length > 0)
  }, [groups, pluginSearch])

  // Filter elements by search
  const filteredElements = useMemo(() => {
    if (!elementSearch.trim()) return pluginElements
    const q = elementSearch.toLowerCase()
    return pluginElements
      .map(plugin => {
        const filterItems = (items: ElementInfo[]) => items.filter(i => i.name.toLowerCase().includes(q))
        return {
          ...plugin,
          skills: filterItems(plugin.skills),
          agents: filterItems(plugin.agents),
          commands: filterItems(plugin.commands),
          hooks: filterItems(plugin.hooks),
          rules: filterItems(plugin.rules),
          mcpServers: filterItems(plugin.mcpServers),
          lspServers: filterItems(plugin.lspServers),
          outputStyles: filterItems(plugin.outputStyles),
        }
      })
      .filter(plugin => {
        const total = plugin.skills.length + plugin.agents.length + plugin.commands.length +
          plugin.hooks.length + plugin.rules.length + plugin.mcpServers.length +
          plugin.lspServers.length + plugin.outputStyles.length
        // Also match plugin name itself
        return total > 0 || plugin.pluginName.toLowerCase().includes(q) || plugin.marketplace.toLowerCase().includes(q)
      })
  }, [pluginElements, elementSearch])

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

      {/* Tab bar: Plugins | Elements | Marketplaces */}
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
          onClick={() => setActiveTab('elements')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'elements'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 border border-transparent'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />
          Elements
          {totalElements > 0 && <span className="opacity-60">{totalElements}</span>}
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
        </button>
      </div>

      {/* ================================================================= */}
      {/* Marketplaces tab */}
      {/* ================================================================= */}
      {activeTab === 'marketplaces' && <MarketplaceManager />}

      {/* ================================================================= */}
      {/* Plugins tab */}
      {/* ================================================================= */}
      {activeTab === 'plugins' && (<>

      {/* Search plugins */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
        <input
          type="text"
          placeholder="Filter plugins..."
          value={pluginSearch}
          onChange={e => setPluginSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Plugin list grouped by marketplace */}
      <div className="space-y-3">
        {filteredGroups.map(group => {
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
                <span className="text-xs text-gray-500 tabular-nums">
                  {enabledInGroup > 0 && <span className="text-emerald-400">{enabledInGroup}</span>}
                  {enabledInGroup > 0 && '/'}
                  {group.plugins.length}
                </span>
              </button>

              {/* Plugin list */}
              {expanded && (
                <div className="divide-y divide-gray-800/50">
                  {group.plugins.map(plugin => {
                    const isToggling = toggling === plugin.key
                    const isExpPl = expandedPlugin === plugin.key
                    return (
                      <div key={plugin.key}>
                        <div
                          className={`flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer hover:bg-gray-800/30 ${
                            plugin.enabled ? 'bg-emerald-500/5' : 'bg-gray-900/30'
                          } ${isExpPl ? 'bg-gray-800/40' : ''}`}
                          onClick={() => setExpandedPlugin(isExpPl ? null : plugin.key)}
                        >
                          <Puzzle className={`w-3.5 h-3.5 flex-shrink-0 ${plugin.enabled ? 'text-emerald-400' : 'text-gray-600'}`} />
                          <span className={`text-xs flex-1 truncate ${plugin.enabled ? 'text-gray-200' : 'text-gray-500'}`}>
                            {plugin.name}
                          </span>
                          <span className="text-[9px] text-gray-600 tabular-nums flex-shrink-0">{plugin.version ? `v${plugin.version}` : '-'}</span>
                          {/* Toggle switch */}
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePlugin(plugin.key, plugin.enabled) }}
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
                        {/* Detail panel */}
                        {isExpPl && (
                          <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-800/30 space-y-1">
                            <div className="text-[10px] text-gray-400">{plugin.description || '-'}</div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-gray-500">
                              <span>Author: <span className="text-gray-400">{plugin.author || '-'}</span></span>
                              <span>Email: <span className="text-gray-400">{plugin.authorEmail || '-'}</span></span>
                              <span>License: <span className="text-gray-400">{plugin.license || '-'}</span></span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-gray-500">
                              <span>Key: <span className="text-gray-400 font-mono">{plugin.key}</span></span>
                              <span>Marketplace: <span className="text-gray-400">{group.marketplace}</span></span>
                              <span>Version: <span className="text-gray-400">{plugin.version || '-'}</span></span>
                            </div>
                            {(plugin.homepage || plugin.repository) && (
                              <div className="flex flex-wrap gap-x-3 text-[9px] text-gray-500">
                                {plugin.homepage && (
                                  <span>Homepage: <a href={plugin.homepage} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{plugin.homepage}</a></span>
                                )}
                                {plugin.repository && !plugin.homepage && (
                                  <span>Repo: <a href={plugin.repository} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{plugin.repository}</a></span>
                                )}
                              </div>
                            )}
                            {plugin.keywords && plugin.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 text-[8px]">
                                {plugin.keywords.map((kw, i) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-500 border border-gray-700/30">{kw}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {filteredGroups.length === 0 && (
          <p className="text-xs text-gray-500 italic py-4 text-center">
            {pluginSearch ? 'No plugins match your search' : 'No installed plugins found'}
          </p>
        )}
      </div>
      </>)}

      {/* ================================================================= */}
      {/* Elements tab */}
      {/* ================================================================= */}
      {activeTab === 'elements' && (<>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        {ELEMENT_SECTIONS.map(({ key, label, icon: Icon }) => {
          const count = elementTotals[key] || 0
          if (count === 0) return null
          return (
            <div key={key} className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-800/50 rounded-lg px-2.5 py-1.5">
              <Icon className="w-3.5 h-3.5" />
              <span>{count} {label}</span>
            </div>
          )
        })}
      </div>

      {/* Search elements */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
        <input
          type="text"
          placeholder="Filter elements by name, plugin, or marketplace..."
          value={elementSearch}
          onChange={e => setElementSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
      </div>

      {loadingElements ? (
        <div className="flex items-center gap-3 py-6">
          <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
          <span className="text-sm text-gray-500">Loading elements...</span>
        </div>
      ) : filteredElements.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-4 text-center">
          {elementSearch ? 'No elements match your search' : 'No enabled plugins with elements found.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredElements.map(plugin => {
            const pluginKey = `${plugin.pluginName}@${plugin.marketplace}`
            const isExpanded = expandedElementPlugins.has(pluginKey)
            const elemCount = plugin.skills.length + plugin.agents.length + plugin.commands.length +
              plugin.hooks.length + plugin.rules.length + plugin.mcpServers.length +
              plugin.lspServers.length + plugin.outputStyles.length

            return (
              <div key={pluginKey} className="rounded-lg border border-gray-800/60 overflow-hidden">
                {/* Plugin header — name, version, marketplace, element count, source link */}
                <div className="flex items-center gap-2.5 px-3 py-2 bg-gray-800/30 hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => toggleElementPlugin(pluginKey)}>
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                  <Puzzle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-gray-200 flex-1 truncate">{plugin.pluginName}</span>
                  <span className="text-[9px] text-gray-600 tabular-nums flex-shrink-0">{plugin.version ? `v${plugin.version}` : '-'}</span>
                  <Store className="w-3 h-3 text-amber-400/50 flex-shrink-0" />
                  <span className="text-[10px] text-gray-600 truncate max-w-[100px]">{plugin.marketplace}</span>
                  <span className="text-[10px] text-gray-500 tabular-nums flex-shrink-0">{elemCount}el</span>
                  {plugin.sourceUrl && (
                    <a href={plugin.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-0.5 rounded hover:bg-gray-700 transition-colors flex-shrink-0" title={plugin.sourceUrl}>
                      <ExternalLink className="w-3 h-3 text-gray-600 hover:text-gray-300" />
                    </a>
                  )}
                </div>

                {/* Element sections */}
                {isExpanded && (
                  <div className="px-3 py-2 space-y-2 bg-gray-900/20">
                    {ELEMENT_SECTIONS.map(({ key, label, icon: Icon }) => {
                      const items = plugin[key]
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
                                key={`${plugin.pluginName}-${plugin.marketplace}-${key}-${item.name}-${idx}`}
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
      )}
      </>)}
    </div>
  )
}
