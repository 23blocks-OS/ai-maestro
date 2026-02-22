'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Plus, Check, Package, Brain, BookOpen, GitBranch, Code, Loader2 } from 'lucide-react'
import RepoScanner from './RepoScanner'
import type { MarketplaceSkill } from '@/types/marketplace'
import type { PluginSkillSelection } from '@/types/plugin-builder'

// Core AI Maestro skills (from plugin/src/skills/)
const CORE_SKILLS = [
  { name: 'memory-search', description: 'Search conversation history and semantic memory', icon: Brain },
  { name: 'graph-query', description: 'Query code graph database for relationships', icon: GitBranch },
  { name: 'docs-search', description: 'Search auto-generated codebase documentation', icon: BookOpen },
  { name: 'planning', description: 'Persistent markdown files for complex task execution', icon: Code },
  { name: 'ai-maestro-agents-management', description: 'Create, manage, and orchestrate AI agents', icon: Package },
]

interface SkillPickerProps {
  selectedSkills: PluginSkillSelection[]
  onAddSkill: (skill: PluginSkillSelection) => void
  onRemoveSkill: (key: string) => void
}

export default function SkillPicker({ selectedSkills, onAddSkill, onRemoveSkill }: SkillPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [marketplaceSkills, setMarketplaceSkills] = useState<MarketplaceSkill[]>([])
  const [loadingMarketplace, setLoadingMarketplace] = useState(true)
  const [activeTab, setActiveTab] = useState<'core' | 'marketplace' | 'repo'>('core')

  // Build a set of selected skill keys for fast lookup
  const selectedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const skill of selectedSkills) {
      keys.add(getSkillKey(skill))
    }
    return keys
  }, [selectedSkills])

  // Load marketplace skills with abort support
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    async function load() {
      try {
        const res = await fetch('/api/marketplace/skills?includeContent=false', { signal })
        if (res.ok) {
          const data = await res.json()
          if (!signal.aborted) setMarketplaceSkills(data.skills || [])
        }
      } catch {
        // Marketplace may not be available or request aborted
      } finally {
        if (!signal.aborted) setLoadingMarketplace(false)
      }
    }
    load()
    return () => { abortRef.current?.abort() }
  }, [])

  // Filter skills by search query
  const filteredCoreSkills = useMemo(() => {
    if (!searchQuery) return CORE_SKILLS
    const q = searchQuery.toLowerCase()
    return CORE_SKILLS.filter(
      s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const filteredMarketplaceSkills = useMemo(() => {
    if (!searchQuery) return marketplaceSkills
    const q = searchQuery.toLowerCase()
    return marketplaceSkills.filter(
      s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    )
  }, [searchQuery, marketplaceSkills])

  const tabs = [
    { id: 'core' as const, label: 'Core', count: CORE_SKILLS.length },
    { id: 'marketplace' as const, label: 'Marketplace', count: marketplaceSkills.length },
    { id: 'repo' as const, label: 'GitHub Repo', count: null },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-3">Select Skills</h2>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span className="ml-1.5 text-gray-500">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Skill Lists */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'core' && (
          <div className="space-y-2">
            {filteredCoreSkills.map(skill => {
              const key = `core:${skill.name}`
              const isSelected = selectedKeys.has(key)
              const Icon = skill.icon
              return (
                <div
                  key={skill.name}
                  role="button"
                  tabIndex={0}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/10 border-cyan-500/30'
                      : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'
                  }`}
                  onClick={() => {
                    if (isSelected) {
                      onRemoveSkill(key)
                    } else {
                      onAddSkill({ type: 'core', name: skill.name })
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (isSelected) onRemoveSkill(key)
                      else onAddSkill({ type: 'core', name: skill.name })
                    }
                  }}
                  aria-pressed={isSelected}
                  aria-label={`${skill.name}: ${skill.description}`}
                >
                  <div className={`p-1.5 rounded-md ${
                    isSelected ? 'bg-cyan-500/20' : 'bg-gray-700/50'
                  }`}>
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-cyan-400' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{skill.name}</p>
                    <p className="text-xs text-gray-500 truncate">{skill.description}</p>
                  </div>
                  <div className="flex-shrink-0">
                    {isSelected ? (
                      <Check className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Plus className="w-4 h-4 text-gray-500" />
                    )}
                  </div>
                </div>
              )
            })}
            {filteredCoreSkills.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No matching core skills</p>
            )}
          </div>
        )}

        {activeTab === 'marketplace' && (
          <div className="space-y-2">
            {loadingMarketplace ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
              </div>
            ) : filteredMarketplaceSkills.length > 0 ? (
              filteredMarketplaceSkills.map(skill => {
                const key = `marketplace:${skill.id}`
                const isSelected = selectedKeys.has(key)
                return (
                  <div
                    key={skill.id}
                    role="button"
                    tabIndex={0}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/30'
                        : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'
                    }`}
                    onClick={() => {
                      if (isSelected) {
                        onRemoveSkill(key)
                      } else {
                        onAddSkill({
                          type: 'marketplace',
                          id: skill.id,
                          marketplace: skill.marketplace,
                          plugin: skill.plugin,
                        })
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (isSelected) onRemoveSkill(key)
                        else onAddSkill({ type: 'marketplace', id: skill.id, marketplace: skill.marketplace, plugin: skill.plugin })
                      }
                    }}
                    aria-pressed={isSelected}
                    aria-label={`${skill.name}: ${skill.description || `${skill.plugin} / ${skill.marketplace}`}`}
                  >
                    <div className={`p-1.5 rounded-md ${
                      isSelected ? 'bg-cyan-500/20' : 'bg-gray-700/50'
                    }`}>
                      <Package className={`w-4 h-4 ${isSelected ? 'text-cyan-400' : 'text-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-200">{skill.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {skill.description || `${skill.plugin} / ${skill.marketplace}`}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {isSelected ? (
                        <Check className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Plus className="w-4 h-4 text-gray-500" />
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                {searchQuery ? 'No matching marketplace skills' : 'No marketplace skills installed. Install a marketplace first.'}
              </p>
            )}
          </div>
        )}

        {activeTab === 'repo' && (
          <RepoScanner
            onSkillsFound={() => {}}
            onAddSkill={onAddSkill}
            selectedSkillKeys={selectedKeys}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Generate a unique key for a skill selection (used for deduplication).
 */
export function getSkillKey(skill: PluginSkillSelection): string {
  switch (skill.type) {
    case 'core':
      return `core:${skill.name}`
    case 'marketplace':
      return `marketplace:${skill.id}`
    case 'repo':
      return `repo:${skill.url}:${skill.skillPath}`
  }
}
