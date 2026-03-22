'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Store, Loader2, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight,
  ExternalLink, Wand2, Bot, Terminal, Webhook,
  Server, FileCode, ScrollText, Palette,
  Trash2, RefreshCw, Search, FolderOpen,
} from 'lucide-react'

interface PluginStatus {
  name: string
  key: string
  installed: boolean
  enabled: boolean
  version: string | null
  description: string | null
  elementCounts: {
    skills: number
    agents: number
    commands: number
    hooks: number
    rules: number
    mcp: number
    lsp: number
    outputStyles: number
  } | null
}

interface MarketplaceInfo {
  name: string
  sourceType: 'cache' | 'directory' | 'github' | 'unknown'
  sourcePath: string | null
  pluginCount: number
  enabledCount: number
  installedCount: number
  plugins: PluginStatus[]
}

interface Totals {
  marketplaces: number
  withPlugins: number
  totalPlugins: number
  enabledPlugins: number
}

const STATUS_COLORS = {
  enabled: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  disabled: { bg: 'bg-gray-800/30', border: 'border-gray-700/30', text: 'text-gray-500', dot: 'bg-gray-500' },
  notInstalled: { bg: 'bg-gray-900/20', border: 'border-gray-800/20', text: 'text-gray-600', dot: 'bg-gray-700' },
}

/**
 * Marketplace Manager — shows all registered marketplaces with their plugins.
 * Each marketplace is expandable to show its plugins with install/enable status.
 */
export default function MarketplaceManager() {
  const [marketplaces, setMarketplaces] = useState<MarketplaceInfo[]>([])
  const [totals, setTotals] = useState<Totals>({ marketplaces: 0, withPlugins: 0, totalPlugins: 0, enabledPlugins: 0 })
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'installed' | 'empty'>('installed')
  const [toggling, setToggling] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ action: string; pluginKey: string; pluginName: string } | null>(null)

  const fetchMarketplaces = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/marketplaces')
      if (!res.ok) return
      const data = await res.json()
      setMarketplaces(data.marketplaces || [])
      setTotals(data.totals || { marketplaces: 0, withPlugins: 0, totalPlugins: 0, enabledPlugins: 0 })
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchMarketplaces() }, [fetchMarketplaces])

  // Auto-expand marketplaces with enabled plugins
  useEffect(() => {
    const withEnabled = new Set<string>()
    for (const m of marketplaces) {
      if (m.plugins.some(p => p.enabled)) withEnabled.add(m.name)
    }
    setExpanded(prev => {
      const next = new Set(prev)
      for (const name of withEnabled) next.add(name)
      return next
    })
  }, [marketplaces])

  const toggleExpand = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
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
        setMarketplaces(prev => prev.map(m => ({
          ...m,
          plugins: m.plugins.map(p => p.key === key ? { ...p, enabled: !currentEnabled } : p),
          enabledCount: m.enabledCount + (m.plugins.some(p => p.key === key) ? (currentEnabled ? -1 : 1) : 0),
        })))
        setTotals(prev => ({ ...prev, enabledPlugins: prev.enabledPlugins + (currentEnabled ? -1 : 1) }))
      }
    } catch { /* ignore */ }
    finally { setToggling(null) }
  }

  const executeAction = async (action: string, pluginKey: string) => {
    setActionInProgress(pluginKey)
    setConfirmAction(null)
    try {
      const res = await fetch('/api/settings/marketplaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pluginKey }),
      })
      if (res.ok) {
        // Refresh data after action
        await fetchMarketplaces()
        if (action === 'uninstall') setSelectedPlugin(null)
      }
    } catch { /* ignore */ }
    finally { setActionInProgress(null) }
  }

  // Filter marketplaces
  const filtered = marketplaces.filter(m => {
    if (filter === 'installed' && m.installedCount === 0) return false
    if (filter === 'empty' && m.installedCount > 0) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      if (!m.name.toLowerCase().includes(q) && !m.plugins.some(p => p.name.toLowerCase().includes(q))) return false
    }
    return true
  })

  const totalElements = (counts: PluginStatus['elementCounts']) => {
    if (!counts) return 0
    return counts.skills + counts.agents + counts.commands + counts.hooks + counts.rules + counts.mcp + counts.lsp + counts.outputStyles
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-6">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
        <span className="text-sm text-gray-500">Scanning marketplaces...</span>
      </div>
    )
  }

  return (
    <div>
      {/* Summary */}
      <p className="text-xs text-gray-500 mb-4">
        {totals.withPlugins} marketplaces with plugins, {totals.totalPlugins} plugins installed, {totals.enabledPlugins} enabled
      </p>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
        <input
          type="text"
          placeholder="Search marketplaces or plugins..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 bg-gray-800/30 rounded-lg p-1">
        {([
          { key: 'installed' as const, label: 'Installed', count: marketplaces.filter(m => m.installedCount > 0).length },
          { key: 'all' as const, label: 'All', count: marketplaces.length },
          { key: 'empty' as const, label: 'Empty', count: marketplaces.filter(m => m.installedCount === 0).length },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex-1 py-1 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
              filter === tab.key
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 border border-transparent'
            }`}
          >
            {tab.label} <span className="ml-1 opacity-60">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Marketplace list */}
      <div className="space-y-2">
        {filtered.map(mkt => {
          const isExpanded = expanded.has(mkt.name)
          return (
            <div key={mkt.name} className="rounded-xl border border-gray-800 overflow-hidden">
              {/* Marketplace header */}
              <button
                onClick={() => toggleExpand(mkt.name)}
                className="w-full flex items-center gap-2.5 px-4 py-3 bg-gray-800/50 hover:bg-gray-800/70 transition-colors text-left"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <Store className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-200 flex-1 truncate">{mkt.name}</span>
                {mkt.sourceType === 'github' && <ExternalLink className="w-3 h-3 text-gray-600 flex-shrink-0" />}
                <span className="text-[10px] text-gray-600 flex-shrink-0">
                  {mkt.sourceType}
                </span>
                <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">
                  {mkt.enabledCount > 0 && <span className="text-emerald-400">{mkt.enabledCount}</span>}
                  {mkt.enabledCount > 0 && '/'}
                  {mkt.installedCount}
                </span>
              </button>

              {/* Plugin list */}
              {isExpanded && mkt.plugins.length > 0 && (
                <div className="divide-y divide-gray-800/50">
                  {mkt.plugins.map(plugin => {
                    const status = plugin.enabled ? STATUS_COLORS.enabled : plugin.installed ? STATUS_COLORS.disabled : STATUS_COLORS.notInstalled
                    const isToggling = toggling === plugin.key
                    const elCount = totalElements(plugin.elementCounts)
                    const isSelected = selectedPlugin === plugin.key
                    const isActioning = actionInProgress === plugin.key

                    return (
                      <div key={plugin.key}>
                        <div
                          className={`px-4 py-2.5 transition-colors cursor-pointer ${status.bg} ${isSelected ? 'ring-1 ring-inset ring-blue-500/40' : ''} hover:bg-gray-800/40`}
                          onClick={() => setSelectedPlugin(isSelected ? null : plugin.key)}
                        >
                          <div className="flex items-center gap-2.5">
                            {/* Status dot */}
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dot}`} />

                            {/* Plugin info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-medium truncate ${plugin.enabled ? 'text-gray-200' : 'text-gray-400'}`}>
                                  {plugin.name}
                                </span>
                                {plugin.version && (
                                  <span className="text-[10px] text-gray-600 tabular-nums">v{plugin.version}</span>
                                )}
                                {elCount > 0 && (
                                  <span className="text-[10px] text-gray-600">{elCount} elem</span>
                                )}
                              </div>
                              {plugin.description && !isSelected && (
                                <p className="text-[10px] text-gray-600 truncate mt-0.5">{plugin.description}</p>
                              )}
                              {/* Element counts mini-row */}
                              {plugin.elementCounts && elCount > 0 && !isSelected && (
                                <div className="flex items-center gap-2 mt-1">
                                  {plugin.elementCounts.skills > 0 && <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><Wand2 className="w-2.5 h-2.5" />{plugin.elementCounts.skills}</span>}
                                  {plugin.elementCounts.agents > 0 && <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><Bot className="w-2.5 h-2.5" />{plugin.elementCounts.agents}</span>}
                                  {plugin.elementCounts.commands > 0 && <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><Terminal className="w-2.5 h-2.5" />{plugin.elementCounts.commands}</span>}
                                  {plugin.elementCounts.hooks > 0 && <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><Webhook className="w-2.5 h-2.5" />{plugin.elementCounts.hooks}</span>}
                                  {plugin.elementCounts.rules > 0 && <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><ScrollText className="w-2.5 h-2.5" />{plugin.elementCounts.rules}</span>}
                                  {plugin.elementCounts.mcp > 0 && <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><Server className="w-2.5 h-2.5" />{plugin.elementCounts.mcp}</span>}
                                  {plugin.elementCounts.lsp > 0 && <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><FileCode className="w-2.5 h-2.5" />{plugin.elementCounts.lsp}</span>}
                                  {plugin.elementCounts.outputStyles > 0 && <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><Palette className="w-2.5 h-2.5" />{plugin.elementCounts.outputStyles}</span>}
                                </div>
                              )}
                            </div>

                            {/* Toggle */}
                            {plugin.installed && (
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePlugin(plugin.key, plugin.enabled) }}
                                disabled={isToggling}
                                className="flex-shrink-0"
                                title={plugin.enabled ? 'Disable' : 'Enable'}
                              >
                                {isToggling ? (
                                  <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                                ) : plugin.enabled ? (
                                  <ToggleRight className="w-6 h-6 text-emerald-400" />
                                ) : (
                                  <ToggleLeft className="w-6 h-6 text-gray-600" />
                                )}
                              </button>
                            )}
                            {!plugin.installed && (
                              <span className="text-[10px] text-gray-600 italic flex-shrink-0">not installed</span>
                            )}
                          </div>
                        </div>

                        {/* Detail panel — shown when plugin is selected */}
                        {isSelected && (
                          <div className="px-4 py-3 bg-gray-900/60 border-t border-gray-800/50 space-y-3">
                            {/* Description */}
                            {plugin.description && (
                              <p className="text-xs text-gray-400">{plugin.description}</p>
                            )}

                            {/* Metadata */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
                              <span>Key: <span className="text-gray-400 font-mono">{plugin.key}</span></span>
                              {plugin.version && <span>Version: <span className="text-gray-400">{plugin.version}</span></span>}
                              <span>Status: <span className={plugin.enabled ? 'text-emerald-400' : 'text-gray-400'}>{plugin.enabled ? 'enabled' : 'disabled'}</span></span>
                            </div>

                            {/* Element breakdown */}
                            {plugin.elementCounts && elCount > 0 && (
                              <div className="flex flex-wrap items-center gap-3 text-[10px]">
                                {plugin.elementCounts.skills > 0 && <span className="text-purple-400 flex items-center gap-1"><Wand2 className="w-3 h-3" />{plugin.elementCounts.skills} skills</span>}
                                {plugin.elementCounts.agents > 0 && <span className="text-blue-400 flex items-center gap-1"><Bot className="w-3 h-3" />{plugin.elementCounts.agents} agents</span>}
                                {plugin.elementCounts.commands > 0 && <span className="text-cyan-400 flex items-center gap-1"><Terminal className="w-3 h-3" />{plugin.elementCounts.commands} commands</span>}
                                {plugin.elementCounts.hooks > 0 && <span className="text-amber-400 flex items-center gap-1"><Webhook className="w-3 h-3" />{plugin.elementCounts.hooks} hooks</span>}
                                {plugin.elementCounts.rules > 0 && <span className="text-orange-400 flex items-center gap-1"><ScrollText className="w-3 h-3" />{plugin.elementCounts.rules} rules</span>}
                                {plugin.elementCounts.mcp > 0 && <span className="text-green-400 flex items-center gap-1"><Server className="w-3 h-3" />{plugin.elementCounts.mcp} MCP</span>}
                                {plugin.elementCounts.lsp > 0 && <span className="text-teal-400 flex items-center gap-1"><FileCode className="w-3 h-3" />{plugin.elementCounts.lsp} LSP</span>}
                                {plugin.elementCounts.outputStyles > 0 && <span className="text-pink-400 flex items-center gap-1"><Palette className="w-3 h-3" />{plugin.elementCounts.outputStyles} styles</span>}
                              </div>
                            )}

                            {/* Cache path */}
                            {plugin.installed && (
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                                <FolderOpen className="w-3 h-3" />
                                <span className="font-mono truncate">~/.claude/plugins/cache/{mkt.name}/{plugin.name}/{plugin.version || '?'}/</span>
                              </div>
                            )}

                            {/* Action buttons */}
                            {plugin.installed && (
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmAction({ action: 'reinstall', pluginKey: plugin.key, pluginName: plugin.name })
                                  }}
                                  disabled={isActioning}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                                >
                                  {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                  Reinstall
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmAction({ action: 'uninstall', pluginKey: plugin.key, pluginName: plugin.name })
                                  }}
                                  disabled={isActioning}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Uninstall
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Empty marketplace */}
              {isExpanded && mkt.plugins.length === 0 && (
                <div className="px-4 py-3 text-xs text-gray-600 italic">
                  No plugins installed from this marketplace
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <p className="text-sm text-gray-500 italic py-4 text-center">
            {searchQuery ? 'No marketplaces match your search' : 'No marketplaces found'}
          </p>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmAction(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-200 mb-2">
              {confirmAction.action === 'uninstall' ? 'Uninstall Plugin' : 'Reinstall Plugin'}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              {confirmAction.action === 'uninstall'
                ? `Remove "${confirmAction.pluginName}" from cache and disable it? This will delete the cached plugin files.`
                : `Reinstall "${confirmAction.pluginName}" from the marketplace clone? This will replace the cached version.`
              }
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executeAction(confirmAction.action, confirmAction.pluginKey)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  confirmAction.action === 'uninstall'
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                }`}
              >
                {confirmAction.action === 'uninstall' ? 'Uninstall' : 'Reinstall'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
