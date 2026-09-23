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
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  AlertCircle,
  Check
} from 'lucide-react'

/**
 * The long-term memory skill (lib/memory/skill.ts). Only these two switches are
 * read; the classifier (Jev) and summarizer are host-level, in Settings → Memory.
 */
interface MemorySkillSettings {
  enabled: boolean
  recall: boolean
}

interface SkillSettings {
  memory: MemorySkillSettings
  [other: string]: unknown
}

interface MemoryBacklog {
  moreRemaining: boolean
  at: number
  conversationsProcessed: number
  memoriesCreated: number
}

interface SkillsSectionProps {
  agentId: string
  hostUrl?: string
}

const DEFAULT_MEMORY_SETTINGS: MemorySkillSettings = { enabled: true, recall: true }

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
  const [backlog, setBacklog] = useState<MemoryBacklog | null>(null)

  // Load settings
  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${hostUrl}/api/agents/${agentId}/skills/settings`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          // Older files carry fields nothing reads (provider, retention); keep them, show the switches
          const loaded = data.settings || {}
          const memory = { enabled: loaded.memory?.enabled !== false, recall: loaded.memory?.recall !== false }
          const next = { ...loaded, memory }
          setSettings(next)
          setOriginalSettings(next)
          setBacklog(data.memory_backlog || null)
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
            backlog={backlog}
          />
        )}
      </div>
    </div>
  )
}

interface MemorySkillTabProps {
  settings: MemorySkillSettings
  updateSettings: (updates: Partial<MemorySkillSettings>) => void
  backlog: MemoryBacklog | null
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`p-1 rounded transition-colors ${on ? 'text-emerald-400' : 'text-gray-500'}`}>
      {on ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
    </button>
  )
}

function MemorySkillTab({ settings, updateSettings, backlog }: MemorySkillTabProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-200">Long-term memory</div>
          <div className="text-xs text-gray-500 mt-0.5 max-w-md">
            Every night (2 to 8 AM) this agent&apos;s conversations become memory: short statements with their evidence,
            and a graph of the entities it works with and how they relate. History Claude Code deleted after 30 days is
            rebuilt from the agent&apos;s own message index.
          </div>
        </div>
        <Toggle on={settings.enabled} onClick={() => updateSettings({ enabled: !settings.enabled })} />
      </div>

      {settings.enabled && (
        <div className="flex items-center justify-between pl-4 border-l border-gray-800">
          <div>
            <div className="text-sm font-medium text-gray-200">Recall into prompts</div>
            <div className="text-xs text-gray-500 mt-0.5 max-w-md">
              At session start the agent gets its standing decisions; on each prompt, the memories nearest to it and
              the relations of any entity it names. Off: memory is still built, and the agent can search it with memory-search.
            </div>
          </div>
          <Toggle on={settings.recall} onClick={() => updateSettings({ recall: !settings.recall })} />
        </div>
      )}

      {settings.enabled && backlog && (
        <div className="bg-gray-800/50 rounded-lg p-3 flex items-start gap-3">
          <Clock className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-gray-400">
            Last run {new Date(backlog.at).toLocaleString()}: {backlog.conversationsProcessed} conversations, {backlog.memoriesCreated} new memories.{' '}
            {backlog.moreRemaining
              ? 'Older history is still waiting; it is consolidated a few conversations at a time, newest first, each night.'
              : 'All history is consolidated.'}
          </div>
        </div>
      )}

      {!settings.enabled && (
        <div className="bg-gray-800/50 rounded-lg p-3 flex items-start gap-3">
          <ChevronRight className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-gray-400">
            Off: no memory is built and nothing is injected. What was already built is kept. Agents that work well
            within one session do not need this skill.
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500">
        The classifier and its key are set per host in Settings → Memory.
      </div>
    </div>
  )
}
