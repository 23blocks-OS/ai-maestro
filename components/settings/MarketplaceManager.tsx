'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Store, Loader2, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight,
  ExternalLink, Wand2, Bot, Terminal, Webhook,
  Server, FileCode, ScrollText, Palette,
  Trash2, RefreshCw, Search, Download,
  AlertTriangle, Shield, Plus, Copy, X,
} from 'lucide-react'

interface PluginStatus {
  name: string
  key: string
  installed: boolean
  enabled: boolean
  version: string | null
  availableVersion: string | null
  outdated: boolean
  description: string | null
  sourceUrl: string | null
  errors: string[]
  elementCounts: {
    skills: number; agents: number; commands: number; hooks: number
    rules: number; mcp: number; lsp: number; outputStyles: number
  } | null
}

interface MarketplaceInfo {
  name: string
  version: string | null
  description: string | null
  owner: string | null
  sourceType: 'github' | 'directory' | 'unknown'
  sourceUrl: string | null
  sourceRepo: string | null
  pluginCount: number
  enabledCount: number
  installedCount: number
  plugins: PluginStatus[]
}

interface Totals {
  marketplaces: number
  withPlugins: number
  totalPlugins: number
  installedPlugins: number
  enabledPlugins: number
}

export default function MarketplaceManager() {
  const [marketplaces, setMarketplaces] = useState<MarketplaceInfo[]>([])
  const [totals, setTotals] = useState<Totals>({ marketplaces: 0, withPlugins: 0, totalPlugins: 0, installedPlugins: 0, enabledPlugins: 0 })
  const [loading, setLoading] = useState(true)
  const [expandedMkt, setExpandedMkt] = useState<string | null>(null)
  const [loadingExpand, setLoadingExpand] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [pluginSearch, setPluginSearch] = useState('')
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ action: string; target: string; label: string } | null>(null)
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null)
  const [errorPopup, setErrorPopup] = useState<{ name: string; errors: string[] } | null>(null)
  const [securityReport, setSecurityReport] = useState<{ name: string; summary: string; report: string } | null>(null)
  const [addUrl, setAddUrl] = useState('')
  const [addingMkt, setAddingMkt] = useState(false)
  // Lazy version check state: marketplaceName -> { checking, remoteVersion, marketplaceOutdated, pluginUpdates }
  const [updateChecks, setUpdateChecks] = useState<Record<string, {
    checking: boolean
    remoteVersion: string | null
    marketplaceOutdated: boolean
    pluginUpdates: Record<string, { remote: string; outdated: boolean }>
  }>>({})

  const [orphanPlugins, setOrphanPlugins] = useState<{ name: string; key: string; errors: string[] }[]>([])

  const fetchMarketplaces = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/marketplaces')
      if (!res.ok) return
      const data = await res.json()
      setMarketplaces(data.marketplaces || [])
      setOrphanPlugins(data.orphanPlugins || [])
      setTotals(data.totals || { marketplaces: 0, withPlugins: 0, totalPlugins: 0, installedPlugins: 0, enabledPlugins: 0 })
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchMarketplaces() }, [fetchMarketplaces])

  const executeAction = async (action: string, payload: Record<string, string>) => {
    const key = payload.pluginKey || payload.marketplaceName || ''
    setActionInProgress(key)
    setConfirmAction(null)
    try {
      const res = await fetch('/api/settings/marketplaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      if (res.ok) {
        // Invalidate version check cache for updated marketplace
        if (action === 'update-marketplace' && payload.marketplaceName) {
          setUpdateChecks(prev => { const next = { ...prev }; delete next[payload.marketplaceName]; return next })
        }
        await fetchMarketplaces()
      }
    } catch { /* ignore */ }
    finally { setActionInProgress(null) }
  }

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    setActionInProgress(key)
    try {
      await fetch('/api/settings/marketplaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: currentEnabled ? 'disable' : 'enable', pluginKey: key }),
      })
      // Optimistic update
      setMarketplaces(prev => prev.map(m => ({
        ...m,
        plugins: m.plugins.map(p => p.key === key ? { ...p, enabled: !currentEnabled } : p),
        enabledCount: m.enabledCount + (m.plugins.some(p => p.key === key) ? (currentEnabled ? -1 : 1) : 0),
      })))
    } catch { /* ignore */ }
    finally { setActionInProgress(null) }
  }

  // Lazy-check updates from GitHub for a marketplace
  // force=true bypasses the 5min server cache (used when user explicitly expands)
  const checkUpdates = async (mktName: string, force = false) => {
    if (!force && updateChecks[mktName]) return // already checked or checking (unless forced)
    setUpdateChecks(prev => ({ ...prev, [mktName]: { checking: true, remoteVersion: null, marketplaceOutdated: false, pluginUpdates: {} } }))
    try {
      const res = await fetch('/api/settings/marketplaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-updates', marketplaceName: mktName, force }),
      })
      if (res.ok) {
        const data = await res.json()
        const plugUpdates: Record<string, { remote: string; outdated: boolean }> = {}
        for (const p of data.pluginUpdates || []) {
          plugUpdates[p.name] = { remote: p.remote, outdated: p.outdated }
        }
        setUpdateChecks(prev => ({ ...prev, [mktName]: {
          checking: false, remoteVersion: data.remoteVersion,
          marketplaceOutdated: data.marketplaceOutdated, pluginUpdates: plugUpdates,
        }}))
      } else {
        setUpdateChecks(prev => ({ ...prev, [mktName]: { checking: false, remoteVersion: null, marketplaceOutdated: false, pluginUpdates: {} } }))
      }
    } catch {
      setUpdateChecks(prev => ({ ...prev, [mktName]: { checking: false, remoteVersion: null, marketplaceOutdated: false, pluginUpdates: {} } }))
    }
  }

  const handleExpandMkt = (name: string) => {
    if (expandedMkt === name) {
      setExpandedMkt(null)
      setPluginSearch('')
    } else {
      setLoadingExpand(true)
      setExpandedMkt(name)
      setPluginSearch('')
      setTimeout(() => setLoadingExpand(false), 100)
      // Trigger fresh update check for expanded marketplace (force bypasses cache)
      checkUpdates(name, true)
    }
  }

  const handleAddMarketplace = async () => {
    if (!addUrl.trim()) return
    setAddingMkt(true)
    try {
      const res = await fetch('/api/settings/marketplaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-marketplace', url: addUrl.trim() }),
      })
      if (res.ok) {
        setAddUrl('')
        await fetchMarketplaces()
      }
    } catch { /* ignore */ }
    finally { setAddingMkt(false) }
  }

  const totalElements = (counts: PluginStatus['elementCounts']) => {
    if (!counts) return 0
    return counts.skills + counts.agents + counts.commands + counts.hooks + counts.rules + counts.mcp + counts.lsp + counts.outputStyles
  }

  // Filter marketplaces by search
  const filtered = marketplaces.filter(m => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return m.name.toLowerCase().includes(q) ||
      (m.description || '').toLowerCase().includes(q) ||
      m.plugins.some(p => p.name.toLowerCase().includes(q))
  })

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
      <p className="text-xs text-gray-500 mb-3">
        {totals.marketplaces} marketplaces, {totals.totalPlugins} plugins ({totals.installedPlugins} installed, {totals.enabledPlugins} enabled)
        {orphanPlugins.length > 0 && <span className="text-red-400 ml-2">{orphanPlugins.length} error{orphanPlugins.length > 1 ? 's' : ''}</span>}
      </p>

      {/* Orphan plugins — enabled but not found in any marketplace */}
      {orphanPlugins.length > 0 && (
        <div className="mb-3 rounded-xl border border-red-800/50 overflow-hidden">
          <div className="px-3 py-2 bg-red-900/20 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-medium text-red-400">Plugin Errors</span>
            <span className="text-[10px] text-red-400/60">{orphanPlugins.length}</span>
          </div>
          <div className="divide-y divide-red-800/20">
            {orphanPlugins.map(p => (
              <div key={p.key} className="px-3 py-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-gray-300">{p.name}</span>
                  <span className="text-[9px] text-gray-600 ml-1.5">{p.key}</span>
                </div>
                <button
                  onClick={() => setErrorPopup({ name: p.name, errors: p.errors })}
                  className="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded hover:bg-red-500/20 flex-shrink-0"
                >
                  {p.errors[0]}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add marketplace */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Add marketplace from GitHub URL..."
            value={addUrl}
            onChange={e => setAddUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddMarketplace()}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        {addUrl.trim() && (
          <button
            onClick={handleAddMarketplace}
            disabled={addingMkt}
            className="px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/20 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
          >
            {addingMkt ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
          </button>
        )}
      </div>

      {/* Search marketplaces */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
        <input
          type="text"
          placeholder="Filter marketplaces..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Marketplace list */}
      <div className="space-y-1.5">
        {filtered.map(mkt => {
          const isExpanded = expandedMkt === mkt.name
          const isActioning = actionInProgress === mkt.name
          const uc = updateChecks[mkt.name]

          // Filter plugins by plugin search
          const filteredPlugins = isExpanded && pluginSearch.trim()
            ? mkt.plugins.filter(p => p.name.toLowerCase().includes(pluginSearch.toLowerCase()) || (p.description || '').toLowerCase().includes(pluginSearch.toLowerCase()))
            : mkt.plugins

          return (
            <div key={mkt.name} className="rounded-xl border border-gray-800 overflow-hidden">
              {/* Marketplace header — darker bg than plugin rows */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-800/70 hover:bg-gray-800/90 transition-colors">
                <button onClick={() => handleExpandMkt(mkt.name)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                  <Store className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-gray-200 truncate">{mkt.name}</span>
                  <span className="text-[9px] text-gray-600 flex-shrink-0">{mkt.version ? `v${mkt.version}` : '-'}</span>
                  {/* Remote version check indicator */}
                  {uc?.checking && <Loader2 className="w-2.5 h-2.5 text-gray-500 animate-spin flex-shrink-0" />}
                  {uc && !uc.checking && uc.marketplaceOutdated && (
                    <span className="text-[9px] text-red-400 bg-red-500/10 px-1 py-0.5 rounded flex-shrink-0" title={`Remote: v${uc.remoteVersion}`}>
                      v{uc.remoteVersion} available
                    </span>
                  )}
                </button>

                {/* Counts */}
                <span className="text-[10px] text-gray-500 flex-shrink-0 tabular-nums">
                  {mkt.enabledCount > 0 && <span className="text-emerald-400">{mkt.enabledCount}</span>}
                  {mkt.enabledCount > 0 && '/'}
                  {mkt.installedCount}/{mkt.pluginCount}
                </span>

                {/* Open source URL */}
                {mkt.sourceUrl && mkt.sourceType === 'github' && (
                  <a href={mkt.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1 rounded hover:bg-gray-700 transition-colors" title={mkt.sourceUrl}>
                    <ExternalLink className="w-3 h-3 text-gray-500 hover:text-gray-300" />
                  </a>
                )}

                {/* Update marketplace (git pull) */}
                <button
                  onClick={(e) => { e.stopPropagation(); executeAction('update-marketplace', { marketplaceName: mkt.name }) }}
                  disabled={isActioning}
                  className="p-0.5 rounded hover:bg-blue-500/20 transition-colors" title="Update marketplace (git pull)"
                >
                  {actionInProgress === mkt.name ? <Loader2 className="w-3 h-3 text-blue-400 animate-spin" /> : <RefreshCw className="w-3 h-3 text-gray-500 hover:text-blue-400" />}
                </button>

                {/* Delete marketplace */}
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmAction({ action: 'delete-marketplace', target: mkt.name, label: `Delete marketplace "${mkt.name}"? This will uninstall all its plugins and remove the marketplace.` }) }}
                  disabled={isActioning}
                  className="p-0.5 rounded hover:bg-red-500/20 transition-colors" title="Delete marketplace"
                >
                  <Trash2 className="w-3 h-3 text-gray-600 hover:text-red-400" />
                </button>
              </div>

              {/* Marketplace metadata */}
              {isExpanded && (mkt.sourceUrl || mkt.description || mkt.owner) && (
                <div className="px-3 py-1.5 bg-gray-900/40 text-[9px] text-gray-600 border-b border-gray-800/50 space-y-0.5">
                  {mkt.description && <div className="text-gray-500">{mkt.description}</div>}
                  <div className="flex flex-wrap gap-x-3">
                    {mkt.owner && <span>by <span className="text-gray-500">{mkt.owner}</span></span>}
                    {mkt.sourceUrl && <span className="truncate">{mkt.sourceUrl}</span>}
                  </div>
                </div>
              )}

              {/* Plugin search (inside expanded marketplace) */}
              {isExpanded && mkt.plugins.length > 0 && (
                <div className="px-3 py-1.5 bg-gray-900/30 border-b border-gray-800/50">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
                    <input
                      type="text"
                      placeholder="Filter plugins..."
                      value={pluginSearch}
                      onChange={e => setPluginSearch(e.target.value)}
                      className="w-full pl-7 pr-3 py-1 text-[10px] bg-gray-800/50 border border-gray-700/50 rounded text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Loading spinner */}
              {isExpanded && loadingExpand && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                </div>
              )}

              {/* Plugin list */}
              {isExpanded && !loadingExpand && filteredPlugins.length > 0 && (
                <div className="divide-y divide-gray-800/30">
                  {filteredPlugins.map(plugin => {
                    const elCount = totalElements(plugin.elementCounts)
                    const isPluginActioning = actionInProgress === plugin.key
                    const isSelected = selectedPlugin === plugin.key
                    const hasErrors = plugin.errors.length > 0
                    // Remote version from lazy check
                    const plugUc = uc?.pluginUpdates?.[plugin.name]

                    return (
                      <div key={plugin.key}>
                        <div
                          className={`px-3 py-2 transition-colors cursor-pointer hover:bg-gray-800/30 ${isSelected ? 'bg-gray-800/40' : ''}`}
                          onClick={() => setSelectedPlugin(isSelected ? null : plugin.key)}
                        >
                          <div className="flex items-center gap-2">
                            {/* Status dot */}
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${plugin.installed ? (plugin.enabled ? 'bg-emerald-400' : 'bg-gray-500') : 'bg-gray-700'}`} />

                            {/* Name + version + elements */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[11px] font-medium truncate ${plugin.installed ? 'text-gray-200' : 'text-gray-500'}`}>
                                  {plugin.name}
                                </span>
                                <span className="text-[9px] text-gray-600 tabular-nums">{plugin.version ? `v${plugin.version}` : plugin.availableVersion || plugUc?.remote ? `v${plugUc?.remote || plugin.availableVersion}` : '-'}</span>
                                {/* Outdated from local comparison */}
                                {plugin.outdated && (
                                  <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded" title={`Update available: v${plugin.availableVersion}`}>
                                    v{plugin.availableVersion}
                                  </span>
                                )}
                                {/* Outdated from remote GitHub check */}
                                {!plugin.outdated && plugUc?.outdated && (
                                  <span className="text-[9px] text-red-400 bg-red-500/10 px-1 py-0.5 rounded" title={`Remote: v${plugUc.remote}`}>
                                    v{plugUc.remote}
                                  </span>
                                )}
                                {/* Checking spinner */}
                                {uc?.checking && !plugUc && plugin.installed && <Loader2 className="w-2.5 h-2.5 text-gray-500 animate-spin" />}
                                {elCount > 0 && <span className="text-[9px] text-gray-600">{elCount}el</span>}
                                {hasErrors && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setErrorPopup({ name: plugin.name, errors: plugin.errors }) }}
                                    className="flex items-center gap-0.5 text-[9px] text-red-400 bg-red-500/10 px-1 py-0.5 rounded hover:bg-red-500/20"
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    {plugin.errors.length}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Action buttons — mini style */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {plugin.installed ? (
                                <>
                                  {/* Enable/disable toggle */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleToggle(plugin.key, plugin.enabled) }}
                                    disabled={isPluginActioning}
                                    className="flex-shrink-0" title={plugin.enabled ? 'Disable' : 'Enable'}
                                  >
                                    {isPluginActioning ? <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                                      : plugin.enabled ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                                      : <ToggleLeft className="w-5 h-5 text-gray-600" />}
                                  </button>
                                  {/* Update */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmAction({ action: 'update', target: plugin.key, label: `Update "${plugin.name}"? This will re-copy from the marketplace.` }) }}
                                    disabled={isPluginActioning}
                                    className="p-0.5 rounded hover:bg-blue-500/20 transition-colors" title="Update"
                                  >
                                    <RefreshCw className="w-3 h-3 text-gray-500 hover:text-blue-400" />
                                  </button>
                                  {/* Uninstall */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmAction({ action: 'uninstall', target: plugin.key, label: `Uninstall "${plugin.name}"?` }) }}
                                    disabled={isPluginActioning}
                                    className="p-0.5 rounded hover:bg-red-500/20 transition-colors" title="Uninstall"
                                  >
                                    <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-400" />
                                  </button>
                                </>
                              ) : (
                                /* Install button for uninstalled plugins */
                                <button
                                  onClick={(e) => { e.stopPropagation(); executeAction('install', { pluginKey: plugin.key }) }}
                                  disabled={isPluginActioning}
                                  className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                                >
                                  {isPluginActioning ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Download className="w-2.5 h-2.5" />}
                                  Install
                                </button>
                              )}

                              {/* Security check */}
                              {plugin.installed && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    setActionInProgress(plugin.key + ':sec')
                                    try {
                                      const res = await fetch('/api/settings/marketplaces', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'security-check', pluginKey: plugin.key }),
                                      })
                                      const data = await res.json()
                                      if (data.summary || data.report) {
                                        setSecurityReport({ name: plugin.name, summary: data.summary || '', report: data.report || '' })
                                      } else if (data.error) {
                                        setErrorPopup({ name: plugin.name, errors: [data.error] })
                                      }
                                    } catch { /* ignore */ }
                                    finally { setActionInProgress(null) }
                                  }}
                                  disabled={actionInProgress === plugin.key + ':sec'}
                                  className="p-0.5 rounded hover:bg-amber-500/20 transition-colors" title="Security check"
                                >
                                  {actionInProgress === plugin.key + ':sec'
                                    ? <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                                    : <Shield className="w-3 h-3 text-gray-600 hover:text-amber-400" />}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Detail panel */}
                        {isSelected && (
                          <div className="px-3 py-2 bg-gray-900/50 border-t border-gray-800/30 space-y-1.5">
                            {plugin.description && <p className="text-[10px] text-gray-400">{plugin.description}</p>}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-gray-500">
                              <span>Key: <span className="text-gray-400 font-mono">{plugin.key}</span></span>
                              {plugin.version && <span>Installed: <span className="text-gray-400">v{plugin.version}</span></span>}
                              {plugin.availableVersion && <span>Available: <span className={plugin.outdated ? 'text-amber-400' : 'text-gray-400'}>v{plugin.availableVersion}</span></span>}
                              {plugin.outdated && <span className="text-amber-400">Update available</span>}
                              <span>Status: <span className={plugin.installed ? (plugin.enabled ? 'text-emerald-400' : 'text-gray-400') : 'text-gray-600'}>{plugin.installed ? (plugin.enabled ? 'enabled' : 'disabled') : 'not installed'}</span></span>
                            </div>
                            {plugin.sourceUrl && (
                              <div className="flex items-center gap-1 text-[9px] text-gray-600">
                                <span className="truncate">{plugin.sourceUrl}</span>
                                {plugin.sourceUrl.startsWith('http') && (
                                  <a href={plugin.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                                    <ExternalLink className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
                                  </a>
                                )}
                              </div>
                            )}
                            {/* Element breakdown */}
                            {plugin.elementCounts && elCount > 0 && (
                              <div className="flex flex-wrap items-center gap-2 text-[9px]">
                                {plugin.elementCounts.skills > 0 && <span className="text-purple-400 flex items-center gap-0.5"><Wand2 className="w-2.5 h-2.5" />{plugin.elementCounts.skills}</span>}
                                {plugin.elementCounts.agents > 0 && <span className="text-blue-400 flex items-center gap-0.5"><Bot className="w-2.5 h-2.5" />{plugin.elementCounts.agents}</span>}
                                {plugin.elementCounts.commands > 0 && <span className="text-cyan-400 flex items-center gap-0.5"><Terminal className="w-2.5 h-2.5" />{plugin.elementCounts.commands}</span>}
                                {plugin.elementCounts.hooks > 0 && <span className="text-amber-400 flex items-center gap-0.5"><Webhook className="w-2.5 h-2.5" />{plugin.elementCounts.hooks}</span>}
                                {plugin.elementCounts.rules > 0 && <span className="text-orange-400 flex items-center gap-0.5"><ScrollText className="w-2.5 h-2.5" />{plugin.elementCounts.rules}</span>}
                                {plugin.elementCounts.mcp > 0 && <span className="text-green-400 flex items-center gap-0.5"><Server className="w-2.5 h-2.5" />{plugin.elementCounts.mcp}</span>}
                                {plugin.elementCounts.lsp > 0 && <span className="text-teal-400 flex items-center gap-0.5"><FileCode className="w-2.5 h-2.5" />{plugin.elementCounts.lsp}</span>}
                                {plugin.elementCounts.outputStyles > 0 && <span className="text-pink-400 flex items-center gap-0.5"><Palette className="w-2.5 h-2.5" />{plugin.elementCounts.outputStyles}</span>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Empty expanded state */}
              {isExpanded && !loadingExpand && filteredPlugins.length === 0 && (
                <div className="px-3 py-3 text-[10px] text-gray-600 italic">
                  {pluginSearch ? 'No plugins match filter' : 'No plugins found in this marketplace'}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <p className="text-xs text-gray-500 italic py-4 text-center">
            {searchQuery ? 'No marketplaces match your search' : 'No marketplaces installed'}
          </p>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmAction(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-200 mb-2">Confirm Action</h3>
            <p className="text-xs text-gray-400 mb-4">{confirmAction.label}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors">Cancel</button>
              <button
                onClick={() => {
                  if (confirmAction.action === 'delete-marketplace') {
                    executeAction('delete-marketplace', { marketplaceName: confirmAction.target })
                  } else {
                    executeAction(confirmAction.action, { pluginKey: confirmAction.target })
                  }
                }}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  confirmAction.action === 'uninstall' || confirmAction.action === 'delete-marketplace'
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                }`}
              >
                {confirmAction.action === 'delete-marketplace' ? 'Delete' : confirmAction.action === 'uninstall' ? 'Uninstall' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error popup */}
      {errorPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setErrorPopup(null)}>
          <div className="bg-gray-900 border border-red-800/50 rounded-xl p-5 max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Errors in {errorPopup.name}
              </h3>
              <button onClick={() => setErrorPopup(null)} className="p-1 rounded hover:bg-gray-800"><X className="w-3.5 h-3.5 text-gray-500" /></button>
            </div>
            <ul className="space-y-1.5 mb-3">
              {errorPopup.errors.map((err, i) => (
                <li key={i} className="text-xs text-gray-400 bg-red-900/10 px-2 py-1.5 rounded border border-red-800/20">{err}</li>
              ))}
            </ul>
            <button
              onClick={() => { navigator.clipboard.writeText(errorPopup.errors.join('\n')); setErrorPopup(null) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors"
            >
              <Copy className="w-3 h-3" /> Copy errors
            </button>
          </div>
        </div>
      )}

      {/* Security report modal */}
      {securityReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSecurityReport(null)}>
          <div className="bg-gray-900 border border-amber-800/50 rounded-xl p-5 max-w-lg mx-4 shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Security Report: {securityReport.name}
              </h3>
              <button onClick={() => setSecurityReport(null)} className="p-1 rounded hover:bg-gray-800"><X className="w-3.5 h-3.5 text-gray-500" /></button>
            </div>
            {securityReport.summary && (
              <div className="text-xs text-gray-300 bg-gray-800/50 px-3 py-2 rounded mb-3 font-mono whitespace-pre-wrap">
                {securityReport.summary}
              </div>
            )}
            {securityReport.report && (
              <div className="flex-1 overflow-y-auto text-[10px] text-gray-400 bg-gray-950/50 px-3 py-2 rounded border border-gray-800/50 font-mono whitespace-pre-wrap mb-3">
                {securityReport.report}
              </div>
            )}
            <button
              onClick={() => { navigator.clipboard.writeText(securityReport.report || securityReport.summary); setSecurityReport(null) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors self-start"
            >
              <Copy className="w-3 h-3" /> Copy report
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
