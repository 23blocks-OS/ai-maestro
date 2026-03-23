'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  sourceUrl: string | null
  plugins: PluginInfo[]
}

interface ElementInfo {
  name: string
  sourcePlugin: string
  sourceMarketplace: string
  description: string | null
  type: string
}

interface FlatElement extends ElementInfo {
  pluginEnabled: boolean
  pluginVersion: string | null
  pluginSourceUrl: string | null
  // pluginKey is the plugin's unique key (plugin.key), used to navigate to the plugin in the Plugins tab.
  // It is distinct from sourcePlugin (which is plugin.name) and must match the key used in pluginRefs.
  pluginKey: string
}

interface PluginElements {
  // pluginKey is the unique identifier (plugin.key) used for all lookups — distinct from pluginName (plugin.name)
  pluginKey: string
  pluginName: string
  marketplace: string
  enabled: boolean
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

// Element type section descriptor used by typeInfo() — key is keyof ElementTotals for known sections,
// or a plain string for unrecognised fallback entries, preventing unsafe casts.
type ElementSection = { key: keyof ElementTotals | string; label: string; icon: typeof Wand2; color: string }

// Element type icons — used across all tabs for consistency; all keys are valid keyof ElementTotals.
const ELEMENT_SECTIONS: { key: keyof ElementTotals; label: string; icon: typeof Wand2; color: string }[] = [
  { key: 'skills', label: 'Skills', icon: Wand2, color: 'text-purple-400' },
  { key: 'agents', label: 'Agents', icon: Bot, color: 'text-blue-400' },
  { key: 'commands', label: 'Commands', icon: Terminal, color: 'text-cyan-400' },
  { key: 'hooks', label: 'Hooks', icon: Webhook, color: 'text-amber-400' },
  { key: 'rules', label: 'Rules', icon: ScrollText, color: 'text-orange-400' },
  { key: 'mcpServers', label: 'MCP Servers', icon: Server, color: 'text-green-400' },
  { key: 'lspServers', label: 'LSP Servers', icon: FileCode, color: 'text-teal-400' },
  { key: 'outputStyles', label: 'Output Styles', icon: Palette, color: 'text-pink-400' },
]

/**
 * Global Elements Section — manages user-level plugins grouped by marketplace.
 * Three tabs: Plugins (toggle + info), Elements (active elements), Marketplaces (full management).
 */
export default function GlobalElementsSection() {
  const [activeTab, setActiveTab] = useState<'plugins' | 'elements' | 'marketplaces'>('elements')
  // Scroll position per tab — restore when switching back
  const scrollPositions = useRef<Record<string, number>>({ plugins: 0, elements: 0, marketplaces: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  // Cross-tab navigation targets
  const [navigateToMkt, setNavigateToMkt] = useState<string | null>(null)
  const [navigateToPlugin, setNavigateToPlugin] = useState<string | null>(null) // plugin key to expand in Plugins tab
  const pluginRefs = useRef<Record<string, HTMLDivElement | null>>({})
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
  const [elementTypeFilter, setElementTypeFilter] = useState<string>('all')
  const [expandedElement, setExpandedElement] = useState<string | null>(null) // accordion for element cards

  // Flat elements list from API
  const [flatElements, setFlatElements] = useState<FlatElement[]>([])

  // Switch tab with scroll position save/restore
  const switchTab = useCallback((tab: 'plugins' | 'elements' | 'marketplaces') => {
    // Save current scroll position using a fresh DOM lookup (not a stale closure ref)
    const scrollParent = containerRef.current?.closest('.overflow-y-auto, .overflow-auto') as HTMLElement | null
    if (scrollParent) scrollPositions.current[activeTab] = scrollParent.scrollTop
    // Clear marketplace navigation target when switching away from marketplaces tab
    if (activeTab === 'marketplaces' && tab !== activeTab) setNavigateToMkt(null)
    setActiveTab(tab)
    // Scroll restoration is handled by the activeTab useEffect below
  }, [activeTab])

  // Restore saved scroll position after the tab switch renders
  useEffect(() => {
    requestAnimationFrame(() => {
      // Fresh DOM lookup so we never use a stale reference captured in the callback
      const scrollParent = containerRef.current?.closest('.overflow-y-auto, .overflow-auto') as HTMLElement | null
      if (scrollParent) scrollParent.scrollTop = scrollPositions.current[activeTab] || 0
    })
  }, [activeTab])

  // Navigate to a marketplace from Elements/Plugins tab
  const goToMarketplace = useCallback((mktName: string) => {
    setNavigateToMkt(mktName)
    switchTab('marketplaces')
  }, [switchTab])

  // Navigate to a plugin from Marketplace tab → Plugins tab
  const goToPlugin = useCallback((pluginKey: string) => {
    setNavigateToPlugin(pluginKey)
    // Expand the marketplace group containing this plugin — look it up in the groups registry
    // instead of parsing the key string, which is fragile if the format ever changes
    const pluginGroup = groups.find(g => g.plugins.some((p: PluginInfo) => p.key === pluginKey))
    const mkt = pluginGroup?.marketplace || ''
    if (mkt) setExpandedMarketplaces(prev => { const next = new Set(prev); next.add(mkt); return next })
    // Clear any active plugin search so the target plugin is not hidden when scrollIntoView runs
    setPluginSearch('')
    switchTab('plugins')
  }, [groups, switchTab])

  // Handle navigate-to-plugin after tab switch
  useEffect(() => {
    if (navigateToPlugin && activeTab === 'plugins') {
      setExpandedPlugin(navigateToPlugin)
      setNavigateToPlugin(null)
      requestAnimationFrame(() => {
        const el = pluginRefs.current[navigateToPlugin]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [navigateToPlugin, activeTab])

  // Element listing state
  const [pluginElements, setPluginElements] = useState<PluginElements[]>([])
  const [elementTotals, setElementTotals] = useState<ElementTotals>({ skills: 0, agents: 0, commands: 0, hooks: 0, rules: 0, mcpServers: 0, lspServers: 0, outputStyles: 0 })
  const [loadingElements, setLoadingElements] = useState(false)

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
      setFlatElements(data.elements || [])
      // Merge with default zeros so that any keys absent from a partial API response remain 0,
      // not undefined — prevents broken renders if the server omits an element type.
      setElementTotals({ skills: 0, agents: 0, commands: 0, hooks: 0, rules: 0, mcpServers: 0, lspServers: 0, outputStyles: 0, ...(data.totals || {}) })
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
      } else {
        // Revert optimistic state: server rejected the toggle
        fetchPlugins()
      }
    } catch (err) {
      console.error('Error toggling plugin:', err)
      fetchPlugins()
    }
    finally { setToggling(null) }
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

  // Type icon/color lookup — maps a singular element type string (e.g. 'skill') to its ELEMENT_SECTIONS
  // entry using an explicit map instead of fragile string-suffix guessing. Falls back to a neutral
  // generic entry for unrecognised types instead of misleadingly showing the Skills icon.
  // Returns ElementSection so the fallback key ('unknown') is a valid string, not a forced keyof ElementTotals cast.
  const typeInfo = (type: string): ElementSection => {
    // Explicit singular→plural map keeps the lookup correct regardless of irregular plurals or suffixes.
    const pluralTypeMap: Record<string, keyof ElementTotals> = {
      skill: 'skills',
      agent: 'agents',
      command: 'commands',
      hook: 'hooks',
      rule: 'rules',
      mcpServer: 'mcpServers',
      lspServer: 'lspServers',
      outputStyle: 'outputStyles',
    }
    const mappedKey = pluralTypeMap[type]
    const found = mappedKey ? ELEMENT_SECTIONS.find(s => s.key === mappedKey) : undefined
    if (found) return found
    console.warn(`Unknown element type: "${type}". Using generic fallback icon.`)
    return { key: 'unknown', label: type, icon: Puzzle, color: 'text-gray-500' }
  }

  // Filtered flat elements for card view
  const filteredFlatElements = useMemo(() => {
    let items = flatElements
    // elementTypeFilter holds the plural ELEMENT_SECTIONS key (e.g. 'skills'), while e.type is singular
    // (e.g. 'skill'). Use typeInfo() to map the singular type to its section key for comparison.
    if (elementTypeFilter !== 'all') items = items.filter(e => typeInfo(e.type).key === elementTypeFilter)
    if (elementSearch.trim()) {
      const q = elementSearch.trim().toLowerCase()
      items = items.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        e.sourcePlugin.toLowerCase().includes(q) ||
        e.sourceMarketplace.toLowerCase().includes(q)
      )
    }
    return items
  }, [flatElements, elementTypeFilter, elementSearch])

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
        <span className="text-sm text-gray-500">Loading plugins...</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="p-4 sm:p-6 max-w-4xl">
      <h2 className="text-xl font-bold text-white mb-2">Global Elements</h2>
      <p className="text-sm text-gray-400 mb-4">
        User-level plugins shared by <strong>all agents</strong> on this host.
      </p>

      {/* Tab bar: Elements | Plugins | Marketplaces */}
      <div className="flex items-center gap-1 mb-4 sm:mb-6 bg-gray-800/30 rounded-lg p-1">
        <button
          onClick={() => switchTab('elements')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'elements'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 border border-transparent'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Elements</span>
          {totalElements > 0 && <span className="opacity-60">{totalElements}</span>}
        </button>
        <button
          onClick={() => switchTab('plugins')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'plugins'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 border border-transparent'
          }`}
        >
          <Puzzle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Plugins</span>
          <span className="opacity-60">{enabledCount}/{totalCount}</span>
        </button>
        <button
          onClick={() => switchTab('marketplaces')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'marketplaces'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 border border-transparent'
          }`}
        >
          <Store className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Marketplaces</span>
        </button>
      </div>

      {/* ================================================================= */}
      {/* Marketplaces tab */}
      {/* ================================================================= */}
      {activeTab === 'marketplaces' && <MarketplaceManager expandMarketplace={navigateToMkt} onNavigateComplete={() => setNavigateToMkt(null)} onGoToPlugin={goToPlugin} />}

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
              <div
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800/50 hover:bg-gray-800/70 transition-colors cursor-pointer"
                onClick={() => toggleMarketplace(group.marketplace)}
              >
                {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <Store className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-200 flex-1 min-w-0 truncate" title={group.marketplace}>{group.marketplace}</span>
                <span className="text-xs text-gray-500 tabular-nums">
                  {enabledInGroup > 0 && <span className="text-emerald-400">{enabledInGroup}</span>}
                  {enabledInGroup > 0 && '/'}
                  {group.plugins.length}
                </span>
                {group.sourceUrl && (
                  <a href={group.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1 rounded hover:bg-gray-700 transition-colors flex-shrink-0" title={group.sourceUrl}>
                    <ExternalLink className="w-3 h-3 text-gray-500 hover:text-gray-300" />
                  </a>
                )}
              </div>

              {/* Plugin list */}
              {expanded && (
                <div className="divide-y divide-gray-800/50">
                  {group.plugins.map(plugin => {
                    const isToggling = toggling === plugin.key
                    const isExpPl = expandedPlugin === plugin.key
                    return (
                      <div key={plugin.key} ref={el => { pluginRefs.current[plugin.key] = el }}>
                        <div
                          className={`flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer hover:bg-gray-800/30 ${
                            plugin.enabled ? 'bg-emerald-500/5' : 'bg-gray-900/30'
                          } ${isExpPl ? 'bg-gray-800/40' : ''}`}
                          onClick={() => setExpandedPlugin(isExpPl ? null : plugin.key)}
                        >
                          <Puzzle className={`w-3.5 h-3.5 flex-shrink-0 ${plugin.enabled ? 'text-emerald-400' : 'text-gray-600'}`} />
                          <span className={`text-xs flex-1 min-w-0 truncate ${plugin.enabled ? 'text-gray-200' : 'text-gray-500'}`} title={plugin.name}>
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
                              <span>Marketplace: <span
                                className="text-gray-400 hover:text-amber-400 cursor-pointer transition-colors"
                                onClick={(e) => { e.stopPropagation(); goToMarketplace(group.marketplace) }}
                                title={`Go to ${group.marketplace}`}
                              >{group.marketplace}</span>
                                {group.sourceUrl && (
                                  <a href={group.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-block ml-0.5 align-middle">
                                    <ExternalLink className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
                                  </a>
                                )}
                              </span>
                              <span>Version: <span className="text-gray-400">{plugin.version || '-'}</span></span>
                            </div>
                            {(plugin.homepage || plugin.repository) && (
                              <div className="flex flex-wrap gap-x-3 text-[9px] text-gray-500">
                                {plugin.homepage && (
                                  <span>Homepage: <a href={plugin.homepage} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{plugin.homepage}</a></span>
                                )}
                                {plugin.repository && (
                                  <span>Repo: <a href={plugin.repository} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{plugin.repository}</a></span>
                                )}
                              </div>
                            )}
                            {plugin.keywords && plugin.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 text-[8px]">
                                {plugin.keywords.map((kw) => (
                                  <span key={kw} className="px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-500 border border-gray-700/30">{kw}</span>
                                ))}
                              </div>
                            )}
                            {/* Element sections — ALL 8 types, shown even if empty */}
                            {(() => {
                              // Use plugin.key (unique) not plugin.name (may collide across marketplaces)
                              const pe = pluginElements.find(p => p.pluginKey === plugin.key)
                              return (
                                <div className="mt-2 pt-2 border-t border-gray-800/30 space-y-2">
                                  {ELEMENT_SECTIONS.map(({ key, label, icon: Icon, color }) => {
                                    const items = pe?.[key] || []
                                    return (
                                      <div key={key}>
                                        <div className="flex items-center gap-1.5 mb-1">
                                          <Icon className={`w-3 h-3 ${items.length > 0 ? color : 'text-gray-700'}`} />
                                          <span className={`text-[10px] font-medium uppercase tracking-wider ${items.length > 0 ? 'text-gray-400' : 'text-gray-700'}`}>{label}</span>
                                          <span className={`text-[10px] ${items.length > 0 ? 'text-gray-500' : 'text-gray-700'}`}>{items.length}</span>
                                        </div>
                                        {items.length > 0 ? (
                                          <div className="flex flex-wrap gap-1.5 ml-4">
                                            {items.map((item) => (
                                              <span key={item.name} className="text-[11px] px-2 py-0.5 rounded-md bg-gray-800/60 text-gray-300 border border-gray-700/40">{item.name}</span>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-[10px] text-gray-700 ml-4">none</span>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })()}
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
      {/* Elements tab — flat alphabetical card list */}
      {/* ================================================================= */}
      {activeTab === 'elements' && (<>

      {/* Summary badges — horizontal scroll on mobile */}
      <div className="flex flex-nowrap sm:flex-wrap gap-2 mb-3 overflow-x-auto pb-1 scrollbar-thin">
        {ELEMENT_SECTIONS.map(({ key, label, icon: Icon, color }) => {
          const count = elementTotals[key] || 0
          if (count === 0) return null
          return (
            <button
              key={key}
              onClick={() => setElementTypeFilter(elementTypeFilter === key ? 'all' : key)}
              className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 transition-all ${
                elementTypeFilter === key
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-gray-400 bg-gray-800/50 hover:bg-gray-800/70 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${elementTypeFilter === key ? color : ''}`} />
              <span>{count} {label}</span>
            </button>
          )
        })}
        {elementTypeFilter !== 'all' && (
          <button onClick={() => setElementTypeFilter('all')} className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-1">
            Show all
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
        <input
          type="text"
          placeholder="Filter by name, description, plugin, or marketplace..."
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
      ) : filteredFlatElements.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-4 text-center">
          {elementSearch || elementTypeFilter !== 'all' ? 'No elements match your filter' : 'No installed plugins with elements found.'}
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-600 mb-2">{filteredFlatElements.length} elements</p>
          {filteredFlatElements.map((el) => {
            const elKey = `${el.type}:${el.name}@${el.sourcePlugin}`
            const isExp = expandedElement === elKey
            const ti = typeInfo(el.type)
            const TypeIcon = ti.icon

            return (
              <div key={elKey} className={`rounded-lg border overflow-hidden ${el.pluginEnabled ? 'border-gray-800/60' : 'border-gray-800/30 opacity-60'}`}>
                {/* Element card header — two-row layout: name on top, source info below on mobile */}
                <div
                  className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-3 py-2 transition-colors cursor-pointer hover:bg-gray-800/30 ${isExp ? 'bg-gray-800/40' : ''}`}
                  onClick={() => setExpandedElement(isExp ? null : elKey)}
                >
                  {/* Row 1: type icon + name + type label + disabled badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    <TypeIcon className={`w-3.5 h-3.5 flex-shrink-0 ${ti.color}`} />
                    <span className="text-[11px] font-medium text-gray-200 min-w-0 truncate" title={el.name}>{el.name}</span>
                    <span className="text-[9px] text-gray-700 flex-shrink-0">{ti.label.replace(/ Servers?$/, '').replace(/Output /, '')}</span>
                    {!el.pluginEnabled && <span className="text-[8px] text-amber-500/80 bg-amber-500/10 px-1 rounded flex-shrink-0" title="Enable the plugin to activate this element">disabled</span>}
                  </div>
                  {/* Row 2 (mobile) / right side (desktop): plugin + marketplace info */}
                  <div className="flex items-center gap-1.5 ml-[22px] sm:ml-auto flex-shrink-0">
                    <Puzzle className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
                    <span
                      className="text-[9px] text-gray-600 min-w-0 truncate hover:text-blue-400 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); goToPlugin(el.pluginKey) }}
                      title={`${el.sourcePlugin} — View in Plugins tab`}
                    >{el.sourcePlugin}</span>
                    <span className="text-[9px] text-gray-700 flex-shrink-0">{el.pluginVersion ? `v${el.pluginVersion}` : ''}</span>
                    <Store className="w-2.5 h-2.5 text-amber-400/40 flex-shrink-0" />
                    <span
                      className="text-[9px] text-gray-700 min-w-0 truncate hover:text-amber-400 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); goToMarketplace(el.sourceMarketplace) }}
                      title={`${el.sourceMarketplace} — Go to Marketplaces tab`}
                    >{el.sourceMarketplace}</span>
                    {el.pluginSourceUrl && (
                      <a href={el.pluginSourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-0.5 rounded hover:bg-gray-700 flex-shrink-0">
                        <ExternalLink className="w-2.5 h-2.5 text-gray-600 hover:text-gray-300" />
                      </a>
                    )}
                  </div>
                </div>
                {/* Expanded: description + metadata */}
                {isExp && (
                  <div className="px-3 py-2 bg-gray-900/50 border-t border-gray-800/30 space-y-1">
                    <div className="text-[10px] text-gray-400">{el.description || '-'}</div>
                    <div className="flex flex-wrap gap-x-3 text-[9px] text-gray-600">
                      <span>Type: <span className={ti.color}>{ti.label}</span></span>
                      <span>Plugin: <span
                        className="text-gray-400 hover:text-blue-400 cursor-pointer"
                        onClick={() => goToPlugin(el.pluginKey)}
                        title={`View ${el.sourcePlugin} in Plugins tab`}
                      >{el.sourcePlugin}</span> {el.pluginVersion ? `v${el.pluginVersion}` : ''}</span>
                      <span>Marketplace: <span
                        className="text-gray-400 hover:text-amber-400 cursor-pointer"
                        onClick={() => goToMarketplace(el.sourceMarketplace)}
                        title={`Go to ${el.sourceMarketplace} in Marketplaces tab`}
                      >{el.sourceMarketplace}</span></span>
                    </div>
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
