'use client'

import { useState, useEffect } from 'react'
import {
  X, User, Users, Building2, Briefcase, Code2, Cpu, Tag,
  Activity, MessageSquare, CheckCircle, Clock, Zap,
  DollarSign, Database, BookOpen, Link2, Edit2, Save,
  ChevronDown, ChevronRight, Plus, Trash2, TrendingUp, TrendingDown,
  Cloud, Monitor, Server
} from 'lucide-react'
import type { Agent, AgentDocumentation } from '@/types/agent'

interface AgentProfileProps {
  isOpen: boolean
  onClose: () => void
  agentId: string
}

export default function AgentProfile({ isOpen, onClose, agentId }: AgentProfileProps) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    identity: true,
    work: true,
    deployment: true,
    metrics: true,
    documentation: false,
    customMetadata: false
  })

  // Fetch agent data
  useEffect(() => {
    if (!isOpen || !agentId) return

    const fetchAgent = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/agents/${agentId}`)
        if (response.ok) {
          const data = await response.json()
          setAgent(data.agent)
        }
      } catch (error) {
        console.error('Failed to fetch agent:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAgent()
  }, [isOpen, agentId])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const handleSave = async () => {
    if (!agent || !hasChanges) return

    setSaving(true)
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: agent.alias,
          displayName: agent.displayName,
          avatar: agent.avatar,
          owner: agent.owner,
          team: agent.team,
          model: agent.model,
          taskDescription: agent.taskDescription,
          tags: agent.tags,
          documentation: agent.documentation,
          metadata: agent.metadata
        })
      })

      if (response.ok) {
        setHasChanges(false)
        setTimeout(() => setSaving(false), 500)
      }
    } catch (error) {
      console.error('Failed to save agent:', error)
      setSaving(false)
    }
  }

  const updateField = (field: string, value: any) => {
    if (!agent) return
    setAgent({ ...agent, [field]: value })
    setHasChanges(true)
  }

  const updateDocField = (field: keyof AgentDocumentation, value: string) => {
    if (!agent) return
    setAgent({
      ...agent,
      documentation: {
        ...agent.documentation,
        [field]: value
      }
    })
    setHasChanges(true)
  }

  const addTag = (tag: string) => {
    if (!agent || !tag.trim()) return
    if (!agent.tags?.includes(tag)) {
      updateField('tags', [...(agent.tags || []), tag])
    }
  }

  const removeTag = (tag: string) => {
    if (!agent) return
    updateField('tags', agent.tags?.filter(t => t !== tag) || [])
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 w-full md:w-[480px] bg-gray-900 border-l border-gray-800 shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">Loading agent profile...</div>
          </div>
        ) : !agent ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">Agent not found</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-100">Agent Profile</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    hasChanges
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-blue-500/25'
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving
                    </span>
                  ) : hasChanges ? (
                    <span className="flex items-center gap-2">
                      <Save className="w-4 h-4" />
                      Save
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Saved
                    </span>
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-800 transition-all text-gray-400 hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-8">
              {/* Identity Section */}
              <section>
                <button
                  onClick={() => toggleSection('identity')}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 hover:text-gray-400 transition-all"
                >
                  {expandedSections.identity ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  Identity
                </button>

                {expandedSections.identity && (
                  <div className="space-y-4">
                    {/* Avatar and basic info */}
                    <div className="flex gap-6">
                      <div className="w-24 h-24 rounded-xl border-2 border-gray-700 overflow-hidden hover:border-blue-500 transition-all flex-shrink-0 bg-gray-800 flex items-center justify-center text-4xl">
                        {agent.avatar || '🤖'}
                      </div>
                      <div className="flex-1 space-y-3">
                        <EditableField
                          label="Alias"
                          value={agent.alias}
                          onChange={(value) => updateField('alias', value)}
                          icon={<User className="w-4 h-4" />}
                        />
                        <EditableField
                          label="Display Name"
                          value={agent.displayName || ''}
                          onChange={(value) => updateField('displayName', value)}
                          icon={<Users className="w-4 h-4" />}
                          placeholder="Optional full name"
                        />
                      </div>
                    </div>

                    {/* Owner and Team */}
                    <div className="grid grid-cols-2 gap-4">
                      <EditableField
                        label="Owner"
                        value={agent.owner || ''}
                        onChange={(value) => updateField('owner', value)}
                        icon={<User className="w-4 h-4" />}
                        placeholder="Owner name"
                      />
                      <EditableField
                        label="Team"
                        value={agent.team || ''}
                        onChange={(value) => updateField('team', value)}
                        icon={<Building2 className="w-4 h-4" />}
                        placeholder="Team name"
                      />
                    </div>
                  </div>
                )}
              </section>

              {/* Work Configuration Section */}
              <section>
                <button
                  onClick={() => toggleSection('work')}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 hover:text-gray-400 transition-all"
                >
                  {expandedSections.work ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  Work Configuration
                </button>

                {expandedSections.work && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <EditableField
                        label="Program"
                        value={agent.program}
                        onChange={(value) => updateField('program', value)}
                        icon={<Briefcase className="w-4 h-4" />}
                      />
                      <EditableField
                        label="Model"
                        value={agent.model || ''}
                        onChange={(value) => updateField('model', value)}
                        icon={<Cpu className="w-4 h-4" />}
                        placeholder="Model version"
                      />
                    </div>

                    <EditableField
                      label="Task Description"
                      value={agent.taskDescription}
                      onChange={(value) => updateField('taskDescription', value)}
                      icon={<Code2 className="w-4 h-4" />}
                      multiline
                    />

                    {/* Tags */}
                    <div>
                      <label className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        Tags
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {agent.tags?.map(tag => (
                          <span
                            key={tag}
                            className="px-3 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-sm flex items-center gap-2 hover:bg-blue-500/30 transition-all group"
                          >
                            {tag}
                            <X
                              className="w-3 h-3 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeTag(tag)}
                            />
                          </span>
                        ))}
                        <button
                          onClick={() => {
                            const tag = prompt('Enter tag name:')
                            if (tag) addTag(tag)
                          }}
                          className="px-3 py-1 border border-dashed border-gray-600 rounded-full text-sm text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-all"
                        >
                          + Add Tag
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Deployment Section */}
              <section>
                <button
                  onClick={() => toggleSection('deployment')}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 hover:text-gray-400 transition-all"
                >
                  {expandedSections.deployment ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  Deployment
                </button>

                {expandedSections.deployment && agent.deployment && (
                  <div className="space-y-4">
                    {/* Deployment Type Badge */}
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-center gap-3">
                        {agent.deployment.type === 'cloud' ? (
                          <>
                            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                              <Cloud className="w-6 h-6 text-blue-400" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-100">Cloud Deployment</div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {agent.deployment.cloud?.provider ? `${agent.deployment.cloud.provider.toUpperCase()} • ${agent.deployment.cloud.region || 'N/A'}` : 'AWS deployment'}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-12 h-12 rounded-lg bg-gray-500/10 flex items-center justify-center">
                              <Monitor className="w-6 h-6 text-gray-400" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-100">Local Deployment</div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {agent.deployment.local?.hostname || 'localhost'} • {agent.deployment.local?.platform || 'unknown'}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Cloud deployment details (if applicable) */}
                    {agent.deployment.type === 'cloud' && agent.deployment.cloud && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/50">
                            <div className="text-xs text-gray-400 mb-1">Instance Type</div>
                            <div className="text-sm font-mono text-gray-200">{agent.deployment.cloud.instanceType || 'N/A'}</div>
                          </div>
                          <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/50">
                            <div className="text-xs text-gray-400 mb-1">Status</div>
                            <div className="text-sm font-mono text-gray-200 capitalize">{agent.deployment.cloud.status || 'running'}</div>
                          </div>
                        </div>
                        {agent.deployment.cloud.publicIp && (
                          <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/50">
                            <div className="text-xs text-gray-400 mb-1">Public IP</div>
                            <div className="text-sm font-mono text-gray-200">{agent.deployment.cloud.publicIp}</div>
                          </div>
                        )}
                        {agent.deployment.cloud.apiEndpoint && (
                          <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/50">
                            <div className="text-xs text-gray-400 mb-1">API Endpoint</div>
                            <div className="text-sm font-mono text-gray-200">{agent.deployment.cloud.apiEndpoint}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Local deployment details */}
                    {agent.deployment.type === 'local' && agent.deployment.local && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/50">
                          <div className="text-xs text-gray-400 mb-1">Hostname</div>
                          <div className="text-sm font-mono text-gray-200">{agent.deployment.local.hostname}</div>
                        </div>
                        <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/50">
                          <div className="text-xs text-gray-400 mb-1">Platform</div>
                          <div className="text-sm font-mono text-gray-200">{agent.deployment.local.platform}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Metrics Section */}
              <section>
                <button
                  onClick={() => toggleSection('metrics')}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 hover:text-gray-400 transition-all"
                >
                  {expandedSections.metrics ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  Metrics Overview
                </button>

                {expandedSections.metrics && agent.metrics && (
                  <div className="grid grid-cols-2 gap-4">
                    <MetricCard
                      icon={<MessageSquare className="w-5 h-5 text-blue-400" />}
                      value={agent.metrics.totalMessages || 0}
                      label="Messages"
                    />
                    <MetricCard
                      icon={<CheckCircle className="w-5 h-5 text-green-400" />}
                      value={agent.metrics.totalTasksCompleted || 0}
                      label="Tasks"
                    />
                    <MetricCard
                      icon={<Clock className="w-5 h-5 text-purple-400" />}
                      value={`${(agent.metrics.uptimeHours || 0).toFixed(1)}h`}
                      label="Uptime"
                    />
                    <MetricCard
                      icon={<Activity className="w-5 h-5 text-orange-400" />}
                      value={agent.metrics.totalSessions || 0}
                      label="Sessions"
                    />
                    <MetricCard
                      icon={<Zap className="w-5 h-5 text-yellow-400" />}
                      value={agent.metrics.averageResponseTime ? `${agent.metrics.averageResponseTime}ms` : 'N/A'}
                      label="Avg Response"
                    />
                    <MetricCard
                      icon={<DollarSign className="w-5 h-5 text-green-400" />}
                      value={agent.metrics.estimatedCost ? `$${agent.metrics.estimatedCost.toFixed(2)}` : '$0.00'}
                      label="API Cost"
                    />
                    <MetricCard
                      icon={<Database className="w-5 h-5 text-cyan-400" />}
                      value={formatNumber(agent.metrics.totalTokensUsed || 0)}
                      label="Tokens Used"
                    />
                    <MetricCard
                      icon={<Activity className="w-5 h-5 text-pink-400" />}
                      value={formatNumber(agent.metrics.totalApiCalls || 0)}
                      label="API Calls"
                    />
                  </div>
                )}
              </section>

              {/* Documentation Section */}
              <section>
                <button
                  onClick={() => toggleSection('documentation')}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 hover:text-gray-400 transition-all"
                >
                  {expandedSections.documentation ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  Documentation
                </button>

                {expandedSections.documentation && (
                  <div className="space-y-4">
                    <EditableField
                      label="Description"
                      value={agent.documentation?.description || ''}
                      onChange={(value) => updateDocField('description', value)}
                      icon={<BookOpen className="w-4 h-4" />}
                      multiline
                      placeholder="Detailed description of the agent's purpose"
                    />
                    <EditableField
                      label="Runbook URL"
                      value={agent.documentation?.runbook || ''}
                      onChange={(value) => updateDocField('runbook', value)}
                      icon={<Link2 className="w-4 h-4" />}
                      placeholder="https://..."
                    />
                    <EditableField
                      label="Wiki URL"
                      value={agent.documentation?.wiki || ''}
                      onChange={(value) => updateDocField('wiki', value)}
                      icon={<Link2 className="w-4 h-4" />}
                      placeholder="https://..."
                    />
                    <EditableField
                      label="Notes"
                      value={agent.documentation?.notes || ''}
                      onChange={(value) => updateDocField('notes', value)}
                      icon={<Edit2 className="w-4 h-4" />}
                      multiline
                      placeholder="Free-form notes about the agent"
                    />
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// Editable Field Component
interface EditableFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  icon?: React.ReactNode
  placeholder?: string
  multiline?: boolean
}

function EditableField({ label, value, onChange, icon, placeholder, multiline }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const fieldId = `editable-${label.toLowerCase().replace(/\s+/g, '-')}`

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleBlur = () => {
    setIsEditing(false)
    if (localValue !== value) {
      onChange(localValue)
    }
  }

  return (
    <div>
      <label htmlFor={fieldId} className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
        {icon}
        {label}
      </label>
      {isEditing ? (
        multiline ? (
          <textarea
            id={fieldId}
            name={fieldId}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            autoFocus
            rows={3}
            className="w-full px-3 py-2 bg-gray-700 border-2 border-blue-500 rounded-lg text-gray-100 placeholder-gray-400 focus:outline-none resize-none"
            placeholder={placeholder}
          />
        ) : (
          <input
            id={fieldId}
            name={fieldId}
            type="text"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            autoFocus
            className="w-full px-3 py-2 bg-gray-700 border-2 border-blue-500 rounded-lg text-gray-100 placeholder-gray-400 focus:outline-none"
            placeholder={placeholder}
          />
        )
      ) : (
        <div
          onClick={() => setIsEditing(true)}
          className="px-3 py-2 rounded-lg hover:bg-gray-700/50 cursor-text transition-all group hover:ring-2 hover:ring-gray-600 min-h-[40px]"
        >
          <span className="text-gray-200">{value || placeholder || 'Click to edit'}</span>
          <Edit2 className="w-3 h-3 ml-2 inline opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
        </div>
      )}
    </div>
  )
}

// Metric Card Component
interface MetricCardProps {
  icon: React.ReactNode
  value: string | number
  label: string
  trend?: string
}

function MetricCard({ icon, value, label, trend }: MetricCardProps) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-blue-500/50 transition-all">
      <div className="flex items-start justify-between mb-2">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
          {icon}
        </div>
        {trend && (
          <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded flex items-center gap-1">
            {trend.startsWith('+') ? (
              <TrendingUp className="w-3 h-3 text-green-400" />
            ) : (
              <TrendingDown className="w-3 h-3 text-red-400" />
            )}
            {trend}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-100 mb-1">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
    </div>
  )
}

// Format large numbers
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}
