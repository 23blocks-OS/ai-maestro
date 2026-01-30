/**
 * Agent Skill Editor Component
 *
 * Manages the skills attached to an agent.
 * Shows current skills and allows adding/removing from marketplace.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Zap,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  Check,
  Package,
  Code,
  ChevronDown,
  ChevronRight,
  Brain,
  X
} from 'lucide-react'
import type { MarketplaceSkill, AgentSkillsConfig } from '@/types/marketplace'
import SkillBrowser from './SkillBrowser'
import SkillDetailModal from './SkillDetailModal'

interface AgentSkillEditorProps {
  agentId: string
  hostUrl?: string
  onSkillsChange?: () => void
}

// Default AI Maestro skills
const AI_MAESTRO_SKILLS = [
  { id: 'memory-search', name: 'Memory Search', description: 'Search conversation history for context' },
  { id: 'graph-query', name: 'Graph Query', description: 'Query code relationships and dependencies' },
  { id: 'planning', name: 'Planning', description: 'Create and manage task plans' },
  { id: 'agent-messaging', name: 'Agent Messaging', description: 'Send messages between agents' },
  { id: 'docs-search', name: 'Docs Search', description: 'Search auto-generated documentation' }
]

export default function AgentSkillEditor({
  agentId,
  hostUrl = '',
  onSkillsChange
}: AgentSkillEditorProps) {
  // State
  const [skills, setSkills] = useState<AgentSkillsConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // UI State
  const [showBrowser, setShowBrowser] = useState(false)
  const [selectedSkill, setSelectedSkill] = useState<MarketplaceSkill | null>(null)
  const [expandedSections, setExpandedSections] = useState({
    marketplace: true,
    aiMaestro: true,
    custom: true
  })

  // Load skills
  const loadSkills = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${hostUrl}/api/agents/${agentId}/skills`)
      if (!res.ok) {
        if (res.status === 404) {
          // No skills configured yet, use defaults
          setSkills({
            marketplace: [],
            aiMaestro: { enabled: true, skills: AI_MAESTRO_SKILLS.map(s => s.id) },
            custom: []
          })
          return
        }
        throw new Error('Failed to load skills')
      }
      const data = await res.json()
      // API returns skills config directly, or wrapped in { skills: ... }
      setSkills(data.skills || data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }, [agentId, hostUrl])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  // Add marketplace skill
  const handleAddSkill = async (skill: MarketplaceSkill) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${hostUrl}/api/agents/${agentId}/skills`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          add: [skill.id]
        })
      })
      if (!res.ok) throw new Error('Failed to add skill')

      await loadSkills()
      onSkillsChange?.()
      setSaveSuccess(true)
      setShowBrowser(false) // Close the modal after successful add
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add skill')
    } finally {
      setSaving(false)
    }
  }

  // Remove marketplace skill
  const handleRemoveSkill = async (skillId: string) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${hostUrl}/api/agents/${agentId}/skills?skill=${encodeURIComponent(skillId)}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to remove skill')

      await loadSkills()
      onSkillsChange?.()
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove skill')
    } finally {
      setSaving(false)
    }
  }

  // Toggle AI Maestro skill
  const handleToggleAiMaestroSkill = async (skillId: string, enabled: boolean) => {
    if (!skills) return

    const currentSkills = skills.aiMaestro.skills
    const newSkills = enabled
      ? [...currentSkills, skillId]
      : currentSkills.filter(s => s !== skillId)

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${hostUrl}/api/agents/${agentId}/skills`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiMaestro: {
            enabled: skills.aiMaestro.enabled,
            skills: newSkills
          }
        })
      })
      if (!res.ok) throw new Error('Failed to update AI Maestro skills')

      await loadSkills()
      onSkillsChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update skill')
    } finally {
      setSaving(false)
    }
  }

  // Toggle all AI Maestro skills
  const handleToggleAllAiMaestro = async (enabled: boolean) => {
    if (!skills) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${hostUrl}/api/agents/${agentId}/skills`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiMaestro: {
            enabled,
            skills: enabled ? AI_MAESTRO_SKILLS.map(s => s.id) : []
          }
        })
      })
      if (!res.ok) throw new Error('Failed to update AI Maestro skills')

      await loadSkills()
      onSkillsChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update skills')
    } finally {
      setSaving(false)
    }
  }

  // Toggle section
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  if (loading) {
    return (
      <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-6">
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading skills...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-gray-200">Agent Skills</span>
            {skills && (
              <span className="text-xs text-gray-500">
                {skills.marketplace.length + (skills.aiMaestro.enabled ? skills.aiMaestro.skills.length : 0) + skills.custom.length} skills
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Saved
              </span>
            )}
            {saving && (
              <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
            )}
            <button
              onClick={() => setShowBrowser(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Skill
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle className="w-3 h-3" />
              {error}
            </div>
          </div>
        )}

        {/* Skills Lists */}
        <div className="divide-y divide-gray-800">
          {/* Marketplace Skills */}
          <div>
            <button
              onClick={() => toggleSection('marketplace')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.marketplace ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                <Package className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-300">Marketplace Skills</span>
                <span className="text-xs text-gray-500">
                  ({skills?.marketplace.length || 0})
                </span>
              </div>
            </button>

            {expandedSections.marketplace && (
              <div className="px-4 pb-4">
                {skills?.marketplace.length === 0 ? (
                  <div className="text-xs text-gray-500 pl-6">
                    No marketplace skills installed.{' '}
                    <button
                      onClick={() => setShowBrowser(true)}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Browse skills
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 pl-6">
                    {skills?.marketplace.map(skill => (
                      <div
                        key={skill.id}
                        className="flex items-center justify-between p-2 bg-gray-800/50 rounded-md group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Zap className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="text-sm text-gray-200 truncate block">
                              {skill.name}
                            </span>
                            <span className="text-xs text-gray-500 truncate block">
                              {skill.plugin} • {skill.marketplace}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveSkill(skill.id)}
                          disabled={saving}
                          className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                          title="Remove skill"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Maestro Skills */}
          <div>
            <button
              onClick={() => toggleSection('aiMaestro')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.aiMaestro ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                <Brain className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-gray-300">AI Maestro Skills</span>
                <span className="text-xs text-gray-500">
                  ({skills?.aiMaestro.enabled ? skills.aiMaestro.skills.length : 0} of {AI_MAESTRO_SKILLS.length})
                </span>
              </div>
              <div
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-2"
              >
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skills?.aiMaestro.enabled}
                    onChange={e => handleToggleAllAiMaestro(e.target.checked)}
                    className="sr-only peer"
                    disabled={saving}
                  />
                  <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                </label>
              </div>
            </button>

            {expandedSections.aiMaestro && skills?.aiMaestro.enabled && (
              <div className="px-4 pb-4">
                <div className="space-y-2 pl-6">
                  {AI_MAESTRO_SKILLS.map(skill => {
                    const isEnabled = skills.aiMaestro.skills.includes(skill.id)
                    return (
                      <div
                        key={skill.id}
                        className="flex items-center justify-between p-2 bg-gray-800/50 rounded-md"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Zap className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="text-sm text-gray-200 truncate block">
                              {skill.name}
                            </span>
                            <span className="text-xs text-gray-500 truncate block">
                              {skill.description}
                            </span>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={e => handleToggleAiMaestroSkill(skill.id, e.target.checked)}
                            className="sr-only peer"
                            disabled={saving}
                          />
                          <div className="w-8 h-4 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-500"></div>
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Custom Skills */}
          <div>
            <button
              onClick={() => toggleSection('custom')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.custom ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                <Code className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-gray-300">Custom Skills</span>
                <span className="text-xs text-gray-500">
                  ({skills?.custom.length || 0})
                </span>
              </div>
            </button>

            {expandedSections.custom && (
              <div className="px-4 pb-4">
                {skills?.custom.length === 0 ? (
                  <div className="text-xs text-gray-500 pl-6">
                    No custom skills defined. Custom skills can be created by adding SKILL.md files to the agent&apos;s skills directory.
                  </div>
                ) : (
                  <div className="space-y-2 pl-6">
                    {skills?.custom.map(skill => (
                      <div
                        key={skill.name}
                        className="flex items-center justify-between p-2 bg-gray-800/50 rounded-md group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Code className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="text-sm text-gray-200 truncate block">
                              {skill.name}
                            </span>
                            <span className="text-xs text-gray-500 truncate block">
                              {skill.path}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveSkill(`custom:${skill.name}`)}
                          disabled={saving}
                          className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                          title="Remove skill"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Skill Browser Modal - Use portal to escape transform stacking context */}
      {showBrowser && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowBrowser(false)}
          />
          <div className="relative w-full max-w-5xl max-h-[85vh] bg-gray-900 rounded-xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-gray-100">Add Skills</h2>
              </div>
              <button
                onClick={() => setShowBrowser(false)}
                className="p-1.5 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <SkillBrowser
                agentId={agentId}
                installedSkills={skills?.marketplace || []}
                onSkillInstall={async (skill) => {
                  await handleAddSkill(skill)
                }}
                onSkillsChange={() => {
                  loadSkills()
                  onSkillsChange?.()
                }}
                hostUrl={hostUrl}
                mode="select"
              />
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-gray-800 bg-gray-900/50 flex justify-end flex-shrink-0">
              <button
                onClick={() => setShowBrowser(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Skill Detail Modal */}
      <SkillDetailModal
        skill={selectedSkill}
        isOpen={!!selectedSkill}
        onClose={() => setSelectedSkill(null)}
        onInstall={handleAddSkill}
        isInstalled={selectedSkill ? (skills?.marketplace.some(s => s.id === selectedSkill.id) ?? false) : false}
        hostUrl={hostUrl}
      />
    </div>
  )
}
