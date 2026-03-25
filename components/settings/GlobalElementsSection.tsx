'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Puzzle, Loader2, ChevronDown, ChevronRight, Store, Search, ExternalLink, X, Copy, Trash2,
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
  path: string | null
  sourcePlugin: string
  sourceMarketplace: string
  description: string | null
  type: string
  // All frontmatter fields as-is (generic key-value pairs from YAML frontmatter)
  frontmatter?: Record<string, string | string[]>
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
 * Claude Plugins Section — manages user-level plugins, elements, and marketplaces.
 * Three tabs: Plugins (toggle + info), Elements (active elements), Marketplaces (full management).
 */
export default function GlobalElementsSection({ initialSubtab, initialMarketplace }: { initialSubtab?: 'plugins' | 'elements' | 'marketplaces' | null; initialMarketplace?: string | null } = {}) {
  const [activeTab, setActiveTab] = useState<'plugins' | 'elements' | 'marketplaces'>(initialSubtab || 'elements')
  // Scroll position per tab — restore when switching back
  const scrollPositions = useRef<Record<string, number>>({ plugins: 0, elements: 0, marketplaces: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  // Cross-tab navigation targets — seed from URL params if provided
  const [navigateToMkt, setNavigateToMkt] = useState<string | null>(initialMarketplace || null)
  const [navigateToPlugin, setNavigateToPlugin] = useState<string | null>(null) // plugin key to expand in Plugins tab
  const [navigateToElement, setNavigateToElement] = useState<string | null>(null) // element key to expand in Elements tab
  const pluginRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const elementRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [groups, setGroups] = useState<MarketplaceGroup[]>([])
  const [enabledCount, setEnabledCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [expandedMarketplaces, setExpandedMarketplaces] = useState<Set<string>>(new Set())

  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null) // accordion for plugin details

  // Search states
  const [pluginSearch, setPluginSearch] = useState('')
  const [enabledPluginsOnly, setEnabledPluginsOnly] = useState(false)
  const [elementSearch, setElementSearch] = useState('')
  const [elementTypeFilter, setElementTypeFilter] = useState<string>('all')
  const [activeOnly, setActiveOnly] = useState(false) // filter to only show elements from enabled plugins
  const [expandedElement, setExpandedElement] = useState<string | null>(null) // accordion for element cards
  const [elementContent, setElementContent] = useState<Record<string, string>>({}) // lazy-loaded file content cache
  const [loadingContent, setLoadingContent] = useState<string | null>(null)
  // Script viewer modal state
  const [scriptViewer, setScriptViewer] = useState<{ name: string; content: string } | null>(null)
  const [loadingScript, setLoadingScript] = useState(false)
  // MCP tools discovery cache
  const [mcpTools, setMcpTools] = useState<Record<string, { tools: { name: string; description: string }[]; serverInfo?: { name: string; version: string } }>>({})
  const [loadingMcpTools, setLoadingMcpTools] = useState<string | null>(null)

  // Confirm dialog for destructive actions
  const [confirmRemove, setConfirmRemove] = useState<{ name: string; type: string; path: string | null; onConfirm: () => void } | null>(null)

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
  // Navigate to an exact element in the Elements tab — clears filters, expands, scrolls
  const goToElement = useCallback((elementName: string, elementType: string, sourcePlugin?: string, sourceMarketplace?: string) => {
    // Map plural ELEMENT_SECTIONS keys to the singular type used in flatElements/API
    const pluralToSingular: Record<string, string> = {
      skills: 'skill', agents: 'agent', commands: 'command', hooks: 'hook',
      rules: 'rule', mcpServers: 'mcp', lspServers: 'lsp', outputStyles: 'outputStyle',
    }
    const singularType = pluralToSingular[elementType] || elementType
    // Build the element key matching the format used in the Elements tab: type:name@plugin@marketplace
    const elKey = `${singularType}:${elementName}@${sourcePlugin || ''}@${sourceMarketplace || ''}`
    setElementSearch('')
    setElementTypeFilter('all')
    setActiveOnly(false)
    setNavigateToElement(elKey)
    switchTab('elements')
  }, [switchTab])

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
      const targetKey = navigateToPlugin
      setExpandedPlugin(targetKey)
      setNavigateToPlugin(null)
      requestAnimationFrame(() => {
        const el = pluginRefs.current[targetKey]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [navigateToPlugin, activeTab])

  // Handle navigate-to-element after tab switch
  useEffect(() => {
    if (navigateToElement && activeTab === 'elements') {
      setExpandedElement(navigateToElement)
      const targetKey = navigateToElement
      setNavigateToElement(null)
      // Lazy-load content for the target element — key format: type:name@plugin@marketplace
      // Skip for hooks/mcp/lsp which render inline JSON, not fetched .md content
      const targetEl = flatElements.find(el => `${el.type}:${el.name}@${el.sourcePlugin}@${el.sourceMarketplace}` === targetKey)
      if (targetEl?.path && !elementContent[targetKey] && !['hook', 'mcp', 'lsp'].includes(targetEl.type)) {
        setLoadingContent(targetKey)
        fetch(`/api/settings/element-content?path=${encodeURIComponent(targetEl.path)}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data?.content) setElementContent(prev => ({ ...prev, [targetKey]: data.content })) })
          .catch(() => {})
          .finally(() => setLoadingContent(null))
      }
      // Double rAF: first lets React commit the render (expandedElement change), second scrolls to the now-visible element
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = elementRefs.current[targetKey]
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      })
    }
  }, [navigateToElement, activeTab, flatElements, elementContent])

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
      if ((g.plugins || []).some(p => p.enabled)) withEnabled.add(g.marketplace)
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
      const action = currentEnabled ? 'disable' : 'enable'
      const res = await fetch('/api/settings/marketplaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pluginKey: key }),
      })
      if (res.ok) {
        setGroups(prev => prev.map(g => ({
          ...g,
          plugins: (g.plugins || []).map(p => p.key === key ? { ...p, enabled: !currentEnabled } : p),
        })))
        setEnabledCount(prev => currentEnabled ? prev - 1 : prev + 1)
        fetchElements()
      } else {
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

  // Flat list of all plugins with their marketplace info attached
  const allPlugins = useMemo(() => {
    return groups.flatMap(g => (g.plugins || []).map(p => ({ ...p, marketplace: g.marketplace, marketplaceSourceUrl: g.sourceUrl })))
  }, [groups])

  // Filter plugins by search — flat list, no marketplace grouping
  const filteredPlugins = useMemo(() => {
    let items = allPlugins
    if (enabledPluginsOnly) items = items.filter(p => p.enabled)
    if (pluginSearch.trim()) {
      const q = pluginSearch.toLowerCase()
      items = items.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.marketplace.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      )
    }
    return items
  }, [allPlugins, pluginSearch, enabledPluginsOnly])

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
      mcp: 'mcpServers',
      mcpServer: 'mcpServers',
      lsp: 'lspServers',
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
    if (activeOnly) items = items.filter(e => e.pluginEnabled)
    // elementTypeFilter holds the plural ELEMENT_SECTIONS key (e.g. 'skills'), while e.type is singular
    // (e.g. 'skill'). Use typeInfo() to map the singular type to its section key for comparison.
    // 'ai-maestro' is a special source-plugin filter, not an element-type filter
    if (elementTypeFilter === 'ai-maestro') items = items.filter(e => e.sourcePlugin === 'ai-maestro')
    else if (elementTypeFilter !== 'all') items = items.filter(e => typeInfo(e.type).key === elementTypeFilter)
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
  }, [flatElements, elementTypeFilter, elementSearch, activeOnly])

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
      <h2 className="text-xl font-bold text-white mb-2">Claude Plugins</h2>
      <p className="text-sm text-gray-400 mb-4">
        This section is only relevant to agents using Claude Code as CLI client.
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
      {/* Marketplaces tab — ONLY lists marketplaces. No plugins or elements here. */}
      {/* ================================================================= */}
      {activeTab === 'marketplaces' && <MarketplaceManager expandMarketplace={navigateToMkt} onNavigateComplete={() => setNavigateToMkt(null)} onGoToPlugin={goToPlugin} />}

      {/* ================================================================= */}
      {/* Plugins tab — ONLY lists plugins (flat list). No marketplace grouping. Marketplace is metadata shown when expanded. */}
      {/* ================================================================= */}
      {activeTab === 'plugins' && (<>

      {/* Search + Enabled-only toggle */}
      <div className="flex items-center gap-3 mb-4">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
        <input
          type="text"
          placeholder="Filter plugins..."
          value={pluginSearch}
          onChange={e => setPluginSearch(e.target.value)}
          className="w-full pl-8 pr-8 py-1.5 text-xs bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        {pluginSearch && <button onClick={() => setPluginSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-700"><X className="w-3 h-3 text-gray-500" /></button>}
      </div>
      <button
        onClick={() => setEnabledPluginsOnly(!enabledPluginsOnly)}
        className={`flex items-center gap-1 text-[10px] whitespace-nowrap px-2 py-1.5 rounded-lg transition-all flex-shrink-0 ${
          enabledPluginsOnly
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'text-gray-500 bg-gray-800/50 hover:bg-gray-800/70 border border-transparent'
        }`}
        title="Show only enabled plugins"
      >
        {enabledPluginsOnly ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
        Enabled only
      </button>
      </div>

      {/* Flat plugin list */}
      <div className="space-y-1">
        {filteredPlugins.map(plugin => {
          const isToggling = toggling === plugin.key
          const isExpPl = expandedPlugin === plugin.key
          return (
            <div key={plugin.key} ref={el => { pluginRefs.current[plugin.key] = el }} className={`rounded-lg border overflow-hidden ${plugin.enabled ? 'border-gray-800/60' : 'border-gray-800/30'}`}>
              <div
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer hover:bg-gray-800/30 ${
                  plugin.enabled ? 'bg-emerald-500/5' : 'bg-gray-900/30'
                } ${isExpPl ? 'bg-gray-800/40' : ''}`}
                onClick={() => setExpandedPlugin(isExpPl ? null : plugin.key)}
              >
                {isExpPl ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                <Puzzle className={`w-3.5 h-3.5 flex-shrink-0 ${plugin.enabled ? 'text-emerald-400' : 'text-gray-600'}`} />
                <span className={`text-xs flex-1 min-w-0 truncate ${plugin.enabled ? 'text-gray-200' : 'text-gray-500'}`} title={plugin.name}>
                  {plugin.name}
                </span>
                <span className="text-[9px] text-gray-600 tabular-nums flex-shrink-0">{plugin.version ? `v${plugin.version}` : '-'}</span>
                {/* Toggle switch — ai-maestro is a core plugin and cannot be disabled */}
                {plugin.name !== 'ai-maestro' ? (
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
                ) : (
                  <span className="text-[9px] text-amber-400/70 px-1.5">core</span>
                )}
              </div>
              {/* Detail panel */}
              {isExpPl && (
                <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-800/30 text-[9px] text-gray-500 space-y-0.5">
                  <div>Description: <span className="text-gray-400">{plugin.description || '-'}</span></div>
                  <div>Author: <span className="text-gray-400">{plugin.author || '-'}</span></div>
                  <div>Email: <span className="text-gray-400">{plugin.authorEmail || '-'}</span></div>
                  <div>License: <span className="text-gray-400">{plugin.license || '-'}</span></div>
                  <div>Key: <span className="text-gray-400 font-mono break-all" title={plugin.key}>{plugin.key}</span></div>
                  <div>Version: <span className="text-gray-400">{plugin.version || '-'}</span></div>
                  <div>Marketplace: <span
                    className="text-gray-400 hover:text-amber-400 cursor-pointer transition-colors"
                    onClick={(e) => { e.stopPropagation(); goToMarketplace(plugin.marketplace) }}
                    title={`Go to ${plugin.marketplace}`}
                  >{plugin.marketplace}</span>
                    {plugin.marketplaceSourceUrl && (
                      <a href={plugin.marketplaceSourceUrl.startsWith('/') ? `file://${plugin.marketplaceSourceUrl}` : plugin.marketplaceSourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-block ml-0.5 align-middle">
                        <ExternalLink className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
                      </a>
                    )}
                  </div>
                  {plugin.homepage && <div>Homepage: <a href={plugin.homepage} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">{plugin.homepage}</a></div>}
                  {plugin.repository && <div>Repo: <a href={plugin.repository} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">{plugin.repository}</a></div>}
                  {plugin.keywords && plugin.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 text-[8px]">
                      {plugin.keywords.map((kw) => (
                        <span key={kw} className="px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-500 border border-gray-700/30">{kw}</span>
                      ))}
                    </div>
                  )}
                  {/* Element sections — ALL 8 types, shown even if empty */}
                  {(() => {
                    const pe = pluginElements.find(p => p.pluginKey === plugin.key || (p.pluginName === plugin.name && p.marketplace === plugin.marketplace))
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
                                    <span
                                      key={item.name}
                                      className="text-[11px] px-2 py-0.5 rounded-md bg-gray-800/60 text-gray-300 border border-gray-700/40 hover:bg-gray-700/60 hover:text-blue-300 cursor-pointer transition-colors"
                                      onClick={(e) => { e.stopPropagation(); goToElement(item.name, key, plugin.name, plugin.marketplace) }}
                                      title="View in Elements tab"
                                    >{item.name}</span>
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

        {filteredPlugins.length === 0 && (
          <p className="text-xs text-gray-500 italic py-4 text-center">
            {pluginSearch ? 'No plugins match your search' : 'No installed plugins found'}
          </p>
        )}
      </div>
      </>)}

      {/* ================================================================= */}
      {/* Elements tab — ONLY lists elements (all types). No plugins or marketplaces here. Plugin/marketplace shown as metadata. */}
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
        {/* AI Maestro source-plugin filter — separate from element-type badges */}
        {(() => {
          const aiMaestroCount = flatElements.filter(e => e.sourcePlugin === 'ai-maestro').length
          if (aiMaestroCount === 0) return null
          return (
            <button
              onClick={() => setElementTypeFilter(elementTypeFilter === 'ai-maestro' ? 'all' : 'ai-maestro')}
              className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 transition-all ${
                elementTypeFilter === 'ai-maestro'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-gray-400 bg-gray-800/50 hover:bg-gray-800/70 border border-transparent'
              }`}
            >
              <Puzzle className={`w-3.5 h-3.5 ${elementTypeFilter === 'ai-maestro' ? 'text-amber-400' : ''}`} />
              <span>{aiMaestroCount} AI Maestro</span>
            </button>
          )
        })()}
        {elementTypeFilter !== 'all' && (
          <button onClick={() => setElementTypeFilter('all')} className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-1">
            Show all
          </button>
        )}
      </div>

      {/* Install hint */}
      <p className="text-[10px] text-gray-600 italic mb-3">To install elements (MCP, LSP, skills, subagents, rules, etc.) just ask the agent. To manage hooks, use the /hooks menu in Claude Code.</p>

      {/* Search + Active-only toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Filter by name, description, plugin, or marketplace..."
            value={elementSearch}
            onChange={e => setElementSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
          {elementSearch && <button onClick={() => setElementSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-700"><X className="w-3 h-3 text-gray-500" /></button>}
        </div>
        <button
          onClick={() => setActiveOnly(!activeOnly)}
          className={`flex items-center gap-1 text-[10px] whitespace-nowrap px-2 py-1.5 rounded-lg transition-all flex-shrink-0 ${
            activeOnly
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-gray-500 bg-gray-800/50 hover:bg-gray-800/70 border border-transparent'
          }`}
          title="Show only elements from enabled plugins"
        >
          {activeOnly ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
          Active only
        </button>
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
            const elKey = `${el.type}:${el.name}@${el.sourcePlugin}@${el.sourceMarketplace}`
            const isExp = expandedElement === elKey
            const ti = typeInfo(el.type)
            const TypeIcon = ti.icon

            return (
              <div key={elKey} ref={ref => { elementRefs.current[elKey] = ref }} className={`rounded-lg border overflow-hidden ${
                el.sourcePlugin === '(standalone)'
                  ? 'border-gray-800/60 bg-[#FF0090]/10'
                  : el.sourcePlugin === 'ai-maestro'
                    ? 'border-amber-500/20 bg-amber-500/5'
                    : el.pluginEnabled ? 'border-gray-800/60' : 'border-gray-800/30 opacity-60'
              }`}>
                {/* Element card header — two-row layout: name on top, source info below on mobile */}
                <div
                  className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-3 py-2 transition-colors cursor-pointer hover:bg-gray-800/30 ${isExp ? 'bg-gray-800/40' : ''}`}
                  onClick={() => {
                    const nextKey = isExp ? null : elKey
                    setExpandedElement(nextKey)
                    // Lazy-load file content on first expand — only for .md-based types (not hooks/mcp/lsp which show JSON inline)
                    if (nextKey && !elementContent[elKey] && el.path && !['hook', 'mcp', 'lsp'].includes(el.type)) {
                      setLoadingContent(elKey)
                      fetch(`/api/settings/element-content?path=${encodeURIComponent(el.path)}`)
                        .then(r => r.ok ? r.json() : null)
                        .then(data => {
                          if (data?.content) setElementContent(prev => ({ ...prev, [elKey]: data.content }))
                        })
                        .catch(() => {})
                        .finally(() => setLoadingContent(null))
                    }
                  }}
                >
                  {/* Row 1: chevron + type icon + name + type label + disabled badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    {isExp ? <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                    <TypeIcon className={`w-3.5 h-3.5 flex-shrink-0 ${ti.color}`} />
                    <span className="text-[11px] font-medium text-gray-200 min-w-0 truncate" title={el.name}>{el.name}</span>
                    <span className="text-[9px] text-gray-700 flex-shrink-0">{ti.label.replace(/ Servers?$/, '').replace(/Output /, '')}</span>
                    {!el.pluginEnabled && <span className="text-[8px] text-amber-500/80 bg-amber-500/10 px-1 rounded flex-shrink-0" title="Enable the plugin to activate this element">disabled</span>}
                  </div>
                  {/* Row 2 (mobile) / right side (desktop): plugin + marketplace info */}
                  <div className="flex items-center gap-1.5 ml-[34px] sm:ml-auto flex-shrink-0">
                    {el.sourcePlugin === '(standalone)'
                      ? <span className="text-[10px] text-gray-600 flex-shrink-0" title="Standalone element">⛺︎</span>
                      : <Puzzle className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
                    }
                    {el.sourcePlugin === '(standalone)' ? (
                      <span className="text-[9px] text-gray-600 min-w-0 truncate">{el.sourcePlugin}</span>
                    ) : (
                      <span
                        className="text-[9px] text-gray-600 min-w-0 truncate hover:text-blue-400 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); goToPlugin(el.pluginKey) }}
                        title={`${el.sourcePlugin} — View in Plugins tab`}
                      >{el.sourcePlugin}</span>
                    )}
                    <span className="text-[9px] text-gray-700 flex-shrink-0">{el.pluginVersion ? `v${el.pluginVersion}` : ''}</span>
                    <Store className="w-2.5 h-2.5 text-amber-400/40 flex-shrink-0" />
                    {el.sourceMarketplace === '(user config)' ? (
                      <span className="text-[9px] text-gray-700 min-w-0 truncate">{el.sourceMarketplace}</span>
                    ) : (
                      <span
                        className="text-[9px] text-gray-700 min-w-0 truncate hover:text-amber-400 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); goToMarketplace(el.sourceMarketplace) }}
                        title={`${el.sourceMarketplace} — Go to Marketplaces tab`}
                      >{el.sourceMarketplace}</span>
                    )}
                    {el.pluginSourceUrl && (
                      <a href={el.pluginSourceUrl.startsWith('/') ? `file://${el.pluginSourceUrl}` : el.pluginSourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-0.5 rounded hover:bg-gray-700 flex-shrink-0">
                        <ExternalLink className="w-2.5 h-2.5 text-gray-600 hover:text-gray-300" />
                      </a>
                    )}
                    {/* Remove button for standalone elements (not from plugins). Hooks excluded — too fragile. LSP excluded — only exists in plugins. */}
                    {el.sourcePlugin === '(standalone)' && el.type !== 'hook' && el.type !== 'lsp' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmRemove({
                            name: el.name,
                            type: el.type,
                            path: el.path,
                            onConfirm: async () => {
                              try {
                                const res = await fetch('/api/settings/marketplaces', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'remove-element', elementName: el.name, elementType: el.type, elementPath: el.path }),
                                })
                                if (res.ok) fetchElements()
                              } catch { /* ignore */ }
                              setConfirmRemove(null)
                            },
                          })
                        }}
                        className="p-0.5 rounded hover:bg-red-500/20 transition-colors flex-shrink-0"
                        title={`Remove ${el.name}`}
                      >
                        <Trash2 className="w-2.5 h-2.5 text-gray-600 hover:text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
                {/* Expanded: description + metadata */}
                {isExp && (
                  <div className="px-3 py-2 bg-gray-900/50 border-t border-gray-800/30 text-[9px] text-gray-600 space-y-0.5">
                    {/* For hooks/mcp/lsp: description IS the element-specific JSON. For others: plain text. */}
                    {['hook', 'mcp', 'lsp'].includes(el.type) ? (<>
                      {el.description && (
                        <div className="mt-1">
                          <div className="rounded-md bg-gray-950/50 overflow-hidden">
                            <pre className="text-[9px] text-gray-400 p-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono leading-relaxed">{el.description}</pre>
                            <div className="flex justify-end px-1.5 py-0.5 border-t border-gray-800/30">
                              <button onClick={() => navigator.clipboard.writeText(el.description || '')} className="flex items-center gap-1 text-[8px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors"><Copy className="w-2.5 h-2.5" />Copy</button>
                            </div>
                          </div>
                        </div>
                      )}
                      {/* View Script button for hooks that reference a script file */}
                      {el.type === 'hook' && el.description && (() => {
                        try {
                          const hookData = JSON.parse(el.description)
                          const cmd = hookData.command || ''
                          // Extract script path — check if it's an absolute path or resolvable
                          const scriptPath = cmd.startsWith('/') ? cmd.split(' ')[0] : null
                          if (!scriptPath) return null
                          return (
                            <button
                              onClick={() => {
                                setLoadingScript(true)
                                fetch(`/api/settings/element-content?path=${encodeURIComponent(scriptPath)}`)
                                  .then(r => r.ok ? r.json() : null)
                                  .then(data => { if (data?.content) setScriptViewer({ name: scriptPath.split('/').pop() || 'script', content: data.content }) })
                                  .catch(() => {})
                                  .finally(() => setLoadingScript(false))
                              }}
                              disabled={loadingScript}
                              className="mt-1 flex items-center gap-1.5 text-[9px] text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded transition-colors"
                            >
                              {loadingScript ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileCode className="w-3 h-3" />}
                              View Script Source
                            </button>
                          )
                        } catch { return null }
                      })()}
                      {/* MCP tools discovery button */}
                      {el.type === 'mcp' && el.path && (() => {
                        const toolsData = mcpTools[elKey]
                        return (<>
                          {!toolsData && (
                            <button
                              onClick={() => {
                                setLoadingMcpTools(elKey)
                                fetch('/api/settings/mcp-discover', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ configPath: el.path, serverName: el.name }),
                                })
                                  .then(r => r.ok ? r.json() : null)
                                  .then(data => { if (data?.tools) setMcpTools(prev => ({ ...prev, [elKey]: { tools: data.tools, serverInfo: data.serverInfo } })) })
                                  .catch(() => {})
                                  .finally(() => setLoadingMcpTools(null))
                              }}
                              disabled={loadingMcpTools === elKey}
                              className="mt-1 flex items-center gap-1.5 text-[9px] text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 px-2 py-1 rounded transition-colors"
                            >
                              {loadingMcpTools === elKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <Server className="w-3 h-3" />}
                              Discover Tools
                            </button>
                          )}
                          {toolsData && (
                            <div className="mt-2 pt-2 border-t border-gray-800/30">
                              {toolsData.serverInfo && (
                                <div className="text-[9px] text-gray-500 mb-1">Server: {toolsData.serverInfo.name} v{toolsData.serverInfo.version}</div>
                              )}
                              <div className="text-[9px] text-gray-500 mb-1">{toolsData.tools.length} tools</div>
                              <div className="rounded-md bg-gray-950/50 overflow-hidden">
                                <div className="max-h-60 overflow-auto p-2 space-y-1.5">
                                  {toolsData.tools.map(tool => (
                                    <div key={tool.name} className="text-[9px]">
                                      <span className="font-mono text-emerald-400">{tool.name}</span>
                                      {tool.description && <span className="text-gray-500 ml-1.5">— {tool.description.substring(0, 120)}</span>}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-end px-1.5 py-0.5 border-t border-gray-800/30">
                                  <button onClick={() => navigator.clipboard.writeText(toolsData.tools.map(t => `${t.name}: ${t.description || ''}`).join('\n'))} className="flex items-center gap-1 text-[8px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors"><Copy className="w-2.5 h-2.5" />Copy Tools List</button>
                                </div>
                              </div>
                            </div>
                          )}
                        </>)
                      })()}
                    </>) : (
                      <div>Description: <span className="text-gray-400">{el.description || '-'}</span></div>
                    )}
                    <div>Type: <span className={ti.color}>{ti.label}</span></div>
                    {/* All frontmatter fields — rendered generically */}
                    {el.frontmatter && Object.entries(el.frontmatter)
                      .filter(([k]) => k !== 'description') // already shown above
                      .map(([key, val]) => {
                        // Sanitize key: only allow alphanumeric, spaces, dashes, underscores
                        const safeKey = key.replace(/[^a-zA-Z0-9_ -]/g, '').substring(0, 50)
                        if (!safeKey) return null
                        // Sanitize values: strip control chars, limit length
                        const sanitize = (s: string) => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').substring(0, 500)
                        const label = safeKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                        return (
                          <div key={safeKey}>
                            {label}: {
                              Array.isArray(val)
                                ? <span className="text-gray-400">{val.map(v => sanitize(String(v))).join(', ')}</span>
                                : <span className="text-gray-400">{sanitize(String(val))}</span>
                            }
                          </div>
                        )
                      })
                    }
                    <div>Plugin: <span
                      className="text-gray-400 hover:text-blue-400 cursor-pointer"
                      onClick={() => goToPlugin(el.pluginKey)}
                      title={`View ${el.sourcePlugin} in Plugins tab`}
                    >{el.sourcePlugin}</span> {el.pluginVersion ? `v${el.pluginVersion}` : ''}</div>
                    <div>Marketplace: <span
                      className="text-gray-400 hover:text-amber-400 cursor-pointer"
                      onClick={() => goToMarketplace(el.sourceMarketplace)}
                      title={`Go to ${el.sourceMarketplace} in Marketplaces tab`}
                    >{el.sourceMarketplace}</span></div>
                    {el.path && <div>Path: <span className="text-gray-500 font-mono break-all text-[8px]" title={el.path}>{el.path}</span></div>}
                    {/* File content preview — only for .md-based types (skills/agents/commands/rules) */}
                    {!['hook', 'mcp', 'lsp'].includes(el.type) && (<>
                      {loadingContent === elKey && (
                        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-800/30">
                          <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />
                          <span className="text-[9px] text-gray-500">Loading content...</span>
                        </div>
                      )}
                      {elementContent[elKey] && (
                        <div className="mt-2 pt-2 border-t border-gray-800/30">
                          <div className="rounded-md bg-gray-950/50 overflow-hidden">
                            <pre className="text-[9px] text-gray-400 p-2 max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono leading-relaxed">{elementContent[elKey]}</pre>
                            <div className="flex justify-end px-1.5 py-0.5 border-t border-gray-800/30">
                              <button onClick={() => navigator.clipboard.writeText(elementContent[elKey] || '')} className="flex items-center gap-1 text-[8px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors"><Copy className="w-2.5 h-2.5" />Copy</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      </>)}

      {/* Script source viewer modal */}
      {scriptViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setScriptViewer(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[90vw] max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-gray-200">{scriptViewer.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(scriptViewer.content) }}
                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  Copy All
                </button>
                <button onClick={() => setScriptViewer(null)} className="p-1 rounded hover:bg-gray-800 transition-colors">
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-200" />
                </button>
              </div>
            </div>
            {/* Script content with syntax highlighting */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-[11px] text-gray-300 font-mono leading-relaxed whitespace-pre-wrap break-words select-text">{scriptViewer.content}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Confirm removal dialog */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmRemove(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[90vw] max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-3">Remove {confirmRemove.type}?</h3>
            <div className="text-[11px] text-gray-300 space-y-1.5 mb-2">
              <div>Name: <span className="font-mono text-gray-200">{confirmRemove.name}</span></div>
              {confirmRemove.path && <div>Path: <span className="font-mono text-gray-400 break-all text-[10px]">{confirmRemove.path}</span></div>}
            </div>
            <p className="text-[10px] text-red-400 mb-4">This operation is not reversible. The element will be permanently deleted.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemove(null)}
                autoFocus
                className="px-3 py-1.5 text-xs rounded-lg text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove.onConfirm}
                className="px-3 py-1.5 text-xs rounded-lg font-medium text-red-400 bg-red-500/20 hover:bg-red-500/30 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
