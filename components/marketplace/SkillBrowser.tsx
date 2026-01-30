/**
 * Skill Browser Component
 *
 * Browse and search skills from all Claude Code marketplaces.
 * Supports filtering by marketplace, search, and installation status.
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  Filter,
  Package,
  RefreshCw,
  AlertCircle,
  Zap,
  ChevronDown,
  ChevronRight,
  X,
  Grid3X3,
  List,
  Globe
} from 'lucide-react'
import type { MarketplaceSkill, MarketplaceSummary, InstalledMarketplaceSkill } from '@/types/marketplace'
import SkillCard from './SkillCard'
import SkillDetailModal from './SkillDetailModal'

interface SkillBrowserProps {
  agentId?: string
  installedSkills?: InstalledMarketplaceSkill[]
  onSkillInstall?: (skill: MarketplaceSkill) => Promise<void>
  onSkillsChange?: () => void
  hostUrl?: string
  mode?: 'browse' | 'select'
}

export default function SkillBrowser({
  agentId: _agentId,
  installedSkills = [],
  onSkillInstall,
  onSkillsChange,
  hostUrl = '',
  mode: _mode = 'browse'
}: SkillBrowserProps) {
  // State
  const [skills, setSkills] = useState<MarketplaceSkill[]>([])
  const [marketplaces, setMarketplaces] = useState<MarketplaceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('all')
  const [showInstalled, setShowInstalled] = useState<'all' | 'installed' | 'available'>('all')

  // UI State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedSkill, setSelectedSkill] = useState<MarketplaceSkill | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [collapsedMarketplaces, setCollapsedMarketplaces] = useState<Set<string>>(new Set())

  // Build installed skills lookup
  const installedSkillIds = useMemo(() => {
    return new Set(installedSkills.map(s => s.id))
  }, [installedSkills])

  // Load skills
  const loadSkills = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${hostUrl}/api/marketplace/skills`)
      if (!res.ok) throw new Error('Failed to load skills')
      const data = await res.json()
      setSkills(data.skills || [])
      setMarketplaces(data.marketplaces || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }, [hostUrl])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  // Filter skills
  const filteredSkills = useMemo(() => {
    let result = skills

    // Filter by marketplace
    if (selectedMarketplace !== 'all') {
      result = result.filter(s => s.marketplace === selectedMarketplace)
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query) ||
        s.plugin.toLowerCase().includes(query)
      )
    }

    // Filter by installation status
    if (showInstalled === 'installed') {
      result = result.filter(s => installedSkillIds.has(s.id))
    } else if (showInstalled === 'available') {
      result = result.filter(s => !installedSkillIds.has(s.id))
    }

    return result
  }, [skills, selectedMarketplace, searchQuery, showInstalled, installedSkillIds])

  // Group skills by marketplace
  const groupedSkills = useMemo(() => {
    const groups: Record<string, MarketplaceSkill[]> = {}
    for (const skill of filteredSkills) {
      const key = skill.marketplace
      if (!groups[key]) groups[key] = []
      groups[key].push(skill)
    }
    return groups
  }, [filteredSkills])

  // Handle install
  const handleInstall = async (skill: MarketplaceSkill) => {
    if (!onSkillInstall) return
    if (installedSkillIds.has(skill.id)) return

    setInstalling(skill.id)
    try {
      await onSkillInstall(skill)
      onSkillsChange?.()
    } catch (err) {
      console.error('Failed to install skill:', err)
    } finally {
      setInstalling(null)
    }
  }

  // Stats
  const stats = useMemo(() => ({
    total: skills.length,
    filtered: filteredSkills.length,
    installed: installedSkills.length,
    marketplaces: marketplaces.length
  }), [skills, filteredSkills, installedSkills, marketplaces])

  // Toggle marketplace collapse
  const toggleMarketplaceCollapse = (marketplaceId: string) => {
    setCollapsedMarketplaces(prev => {
      const next = new Set(prev)
      if (next.has(marketplaceId)) {
        next.delete(marketplaceId)
      } else {
        next.add(marketplaceId)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-8">
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          Loading marketplace skills...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-medium text-gray-200">Skill Marketplace</span>
            <span className="text-xs text-gray-500">
              {stats.filtered} of {stats.total} skills
            </span>
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-gray-700 text-gray-200'
                  : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-gray-700 text-gray-200'
                  : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search skills..."
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Marketplace Filter */}
          <div className="relative">
            <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <select
              value={selectedMarketplace}
              onChange={e => setSelectedMarketplace(e.target.value)}
              className="pl-10 pr-8 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer min-w-[180px]"
            >
              <option value="all">All Marketplaces</option>
              {marketplaces.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.skillCount})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>

          {/* Installation Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <select
              value={showInstalled}
              onChange={e => setShowInstalled(e.target.value as typeof showInstalled)}
              className="pl-10 pr-8 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer min-w-[140px]"
            >
              <option value="all">All Skills</option>
              <option value="installed">Installed ({stats.installed})</option>
              <option value="available">Available</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>

          {/* Refresh */}
          <button
            onClick={loadSkills}
            className="p-2 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-md transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="text-sm text-red-400">{error}</div>
          <button
            onClick={loadSkills}
            className="ml-auto px-3 py-1 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Skills Grid/List */}
      {filteredSkills.length === 0 ? (
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-8 text-center">
          <div className="text-gray-500 text-sm">
            {searchQuery || selectedMarketplace !== 'all' ? (
              <>No skills match your filters. Try adjusting your search.</>
            ) : (
              <>No skills available. Check your marketplace configuration.</>
            )}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        // Grid View - Grouped by Marketplace (Collapsible)
        <div className="space-y-4">
          {Object.entries(groupedSkills).map(([marketplaceId, marketplaceSkills]) => {
            const marketplace = marketplaces.find(m => m.id === marketplaceId)
            const isCollapsed = collapsedMarketplaces.has(marketplaceId)
            const isGlobal = marketplaceId !== 'ai-maestro-marketplace' && marketplaceId !== 'ai-maestro'
            const installedCount = marketplaceSkills.filter(s => installedSkillIds.has(s.id)).length

            return (
              <div key={marketplaceId} className="bg-gray-900/30 rounded-lg border border-gray-800 overflow-hidden">
                {/* Collapsible Header */}
                <button
                  onClick={() => toggleMarketplaceCollapse(marketplaceId)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                    <Package className="w-4 h-4 text-gray-400" />
                    <h3 className="text-sm font-medium text-gray-200">
                      {marketplace?.name || marketplaceId}
                    </h3>
                    <span className="text-xs text-gray-500">
                      {marketplaceSkills.length} skills
                    </span>
                    {installedCount > 0 && (
                      <span className="text-xs text-emerald-400">
                        ({installedCount} added)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isGlobal && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/10 text-purple-400 text-xs rounded">
                        <Globe className="w-3 h-3" />
                        Global
                      </span>
                    )}
                  </div>
                </button>

                {/* Skills Grid */}
                {!isCollapsed && (
                  <div className="p-4 pt-2 border-t border-gray-800/50">
                    {isGlobal && (
                      <p className="text-xs text-gray-500 mb-3">
                        These skills are globally available in Claude Code. Adding them to an agent records the preference for export/import.
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {marketplaceSkills.map(skill => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          isInstalled={installedSkillIds.has(skill.id)}
                          onInstall={handleInstall}
                          onViewDetails={setSelectedSkill}
                          disabled={installing === skill.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        // List View
        <div className="bg-gray-900/50 rounded-lg border border-gray-800 divide-y divide-gray-800">
          {filteredSkills.map(skill => (
            <div
              key={skill.id}
              onClick={() => setSelectedSkill(skill)}
              className="px-4 py-3 flex items-center gap-4 hover:bg-gray-800/50 cursor-pointer transition-colors"
            >
              <div className="p-1.5 bg-blue-500/10 rounded-md">
                <Zap className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200 truncate">
                    {skill.name}
                  </span>
                  <span className="text-xs text-gray-500 truncate">
                    {skill.plugin}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {skill.description}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {installedSkillIds.has(skill.id) ? (
                  <span className="text-xs text-emerald-400">Installed</span>
                ) : (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      handleInstall(skill)
                    }}
                    disabled={installing === skill.id}
                    className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs rounded transition-colors disabled:opacity-50"
                  >
                    {installing === skill.id ? 'Adding...' : 'Add'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <SkillDetailModal
        skill={selectedSkill}
        isOpen={!!selectedSkill}
        onClose={() => setSelectedSkill(null)}
        onInstall={handleInstall}
        isInstalled={selectedSkill ? installedSkillIds.has(selectedSkill.id) : false}
        hostUrl={hostUrl}
      />
    </div>
  )
}
