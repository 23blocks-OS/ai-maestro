/**
 * Skills Section Component
 *
 * Tabbed interface for managing per-agent skill settings.
 * Each skill has its own configuration panel.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Brain,
  Settings,
  Save,
  RefreshCw,
  Clock,
  Server,
  Cpu,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  AlertCircle,
  Check
} from 'lucide-react'

interface MemorySkillSettings {
  enabled: boolean
  consolidation: {
    schedule: 'nightly' | 'weekly' | 'manual'
    nightlyHour: number // 0-23
    llmProvider: 'auto' | 'ollama' | 'claude'
    ollamaModel: string
    claudeModel: string
    minConfidence: number // 0.0-1.0
  }
  retention: {
    shortTermDays: number // 0 = keep forever
    pruneAfterConsolidation: boolean
  }
}

interface SkillSettings {
  memory: MemorySkillSettings
}

interface SkillsSectionProps {
  agentId: string
  hostUrl?: string
}

const DEFAULT_MEMORY_SETTINGS: MemorySkillSettings = {
  enabled: true,
  consolidation: {
    schedule: 'nightly',
    nightlyHour: 2, // 2 AM
    llmProvider: 'auto',
    ollamaModel: 'llama3.2',
    claudeModel: 'claude-3-haiku-20240307',
    minConfidence: 0.7
  },
  retention: {
    shortTermDays: 30,
    pruneAfterConsolidation: false
  }
}

type TabId = 'memory'

export default function SkillsSection({ agentId, hostUrl = '' }: SkillsSectionProps) {
  const [activeTab, setActiveTab] = useState<TabId>('memory')
  const [settings, setSettings] = useState<SkillSettings>({
    memory: DEFAULT_MEMORY_SETTINGS
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalSettings, setOriginalSettings] = useState<SkillSettings | null>(null)

  // Load settings
  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${hostUrl}/api/agents/${agentId}/skills/settings`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.settings) {
          setSettings(data.settings)
          setOriginalSettings(data.settings)
        }
      } else if (res.status !== 404) {
        throw new Error('Failed to load settings')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [agentId, hostUrl])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Check for changes
  useEffect(() => {
    if (originalSettings) {
      setHasChanges(JSON.stringify(settings) !== JSON.stringify(originalSettings))
    }
  }, [settings, originalSettings])

  // Save settings
  const saveSettings = async () => {
    setSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch(`${hostUrl}/api/agents/${agentId}/skills/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      })
      if (!res.ok) {
        throw new Error('Failed to save settings')
      }
      setOriginalSettings(settings)
      setHasChanges(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Update memory settings
  const updateMemorySettings = (updates: Partial<MemorySkillSettings>) => {
    setSettings(prev => ({
      ...prev,
      memory: { ...prev.memory, ...updates }
    }))
  }

  const updateConsolidation = (updates: Partial<MemorySkillSettings['consolidation']>) => {
    setSettings(prev => ({
      ...prev,
      memory: {
        ...prev.memory,
        consolidation: { ...prev.memory.consolidation, ...updates }
      }
    }))
  }

  const updateRetention = (updates: Partial<MemorySkillSettings['retention']>) => {
    setSettings(prev => ({
      ...prev,
      memory: {
        ...prev.memory,
        retention: { ...prev.memory.retention, ...updates }
      }
    }))
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'memory', label: 'Long-Term Memory', icon: <Brain className="w-4 h-4" /> }
  ]

  if (loading) {
    return (
      <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-6">
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading settings...
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-200">Skill Settings</span>
        </div>
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Saved
            </span>
          )}
          {hasChanges && (
            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors"
            >
              {saving ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Save Changes
            </button>
          )}
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

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-blue-400 border-blue-400 bg-blue-500/5'
                : 'text-gray-400 border-transparent hover:text-gray-300 hover:bg-gray-800/50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'memory' && (
          <MemorySkillTab
            settings={settings.memory}
            updateSettings={updateMemorySettings}
            updateConsolidation={updateConsolidation}
            updateRetention={updateRetention}
          />
        )}
      </div>
    </div>
  )
}

interface MemorySkillTabProps {
  settings: MemorySkillSettings
  updateSettings: (updates: Partial<MemorySkillSettings>) => void
  updateConsolidation: (updates: Partial<MemorySkillSettings['consolidation']>) => void
  updateRetention: (updates: Partial<MemorySkillSettings['retention']>) => void
}

function MemorySkillTab({
  settings,
  updateSettings,
  updateConsolidation,
  updateRetention
}: MemorySkillTabProps) {
  return (
    <div className="space-y-6">
      {/* Enable/Disable */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-200">Enable Long-Term Memory</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Consolidate conversations into lasting memories
          </div>
        </div>
        <button
          onClick={() => updateSettings({ enabled: !settings.enabled })}
          className={`p-1 rounded transition-colors ${
            settings.enabled ? 'text-emerald-400' : 'text-gray-500'
          }`}
        >
          {settings.enabled ? (
            <ToggleRight className="w-8 h-8" />
          ) : (
            <ToggleLeft className="w-8 h-8" />
          )}
        </button>
      </div>

      {settings.enabled && (
        <>
          {/* Consolidation Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <Clock className="w-4 h-4" />
              Consolidation Schedule
            </div>

            <div className="grid grid-cols-2 gap-4 pl-6">
              {/* Schedule Type */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Schedule</label>
                <select
                  value={settings.consolidation.schedule}
                  onChange={e => updateConsolidation({ schedule: e.target.value as 'nightly' | 'weekly' | 'manual' })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="nightly">Nightly</option>
                  <option value="weekly">Weekly</option>
                  <option value="manual">Manual Only</option>
                </select>
              </div>

              {/* Time */}
              {settings.consolidation.schedule !== 'manual' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Time (Hour)</label>
                  <select
                    value={settings.consolidation.nightlyHour}
                    onChange={e => updateConsolidation({ nightlyHour: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {i.toString().padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* LLM Provider Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <Server className="w-4 h-4" />
              LLM Provider
            </div>

            <div className="grid grid-cols-2 gap-4 pl-6">
              {/* Provider */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Provider</label>
                <select
                  value={settings.consolidation.llmProvider}
                  onChange={e => updateConsolidation({ llmProvider: e.target.value as 'auto' | 'ollama' | 'claude' })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="auto">Auto (Ollama first, then Claude)</option>
                  <option value="ollama">Ollama Only</option>
                  <option value="claude">Claude Only</option>
                </select>
              </div>

              {/* Min Confidence */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Min Confidence</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.consolidation.minConfidence}
                  onChange={e => updateConsolidation({ minConfidence: parseFloat(e.target.value) || 0.7 })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Model Names */}
            <div className="grid grid-cols-2 gap-4 pl-6">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Ollama Model</label>
                <input
                  type="text"
                  value={settings.consolidation.ollamaModel}
                  onChange={e => updateConsolidation({ ollamaModel: e.target.value })}
                  placeholder="llama3.2"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Claude Model</label>
                <input
                  type="text"
                  value={settings.consolidation.claudeModel}
                  onChange={e => updateConsolidation({ claudeModel: e.target.value })}
                  placeholder="claude-3-haiku-20240307"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Retention Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <Cpu className="w-4 h-4" />
              Memory Retention
            </div>

            <div className="grid grid-cols-2 gap-4 pl-6">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Short-Term Retention (days)</label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={settings.retention.shortTermDays}
                  onChange={e => updateRetention({ shortTermDays: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="text-xs text-gray-600 mt-1">0 = keep forever</div>
              </div>

              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.retention.pruneAfterConsolidation}
                    onChange={e => updateRetention({ pruneAfterConsolidation: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                  />
                  <span className="text-sm text-gray-300">Prune after consolidation</span>
                </label>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-gray-800/50 rounded-lg p-3 flex items-start gap-3">
            <ChevronRight className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-gray-400">
              <strong className="text-gray-300">How it works:</strong> The subconscious process runs in the background,
              consolidating short-term conversation memories into long-term insights. Use &quot;Auto&quot; provider to try
              Ollama first (free, local) and fall back to Claude API if unavailable.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
