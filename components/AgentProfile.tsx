'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  X, User, Building2, Briefcase, Code2, Cpu, Tag,
  Activity, MessageSquare, CheckCircle, Clock, Zap,
  DollarSign, Database, BookOpen, Link2, Edit2, Save,
  ChevronDown, ChevronRight, Plus, Trash2, TrendingUp, TrendingDown,
  Cloud, Monitor, Server, Play, Wifi, WifiOff, Folder, Download, Send,
  GitBranch, FolderGit2, RefreshCw, ExternalLink, AlertTriangle, Brain,
  FolderTree
} from 'lucide-react'
import type { Agent, AgentDocumentation, AgentSessionStatus, Repository } from '@/types/agent'
import TransferAgentDialog from './TransferAgentDialog'
import ExportAgentDialog from './ExportAgentDialog'
import DeleteAgentDialog from './DeleteAgentDialog'
import MemoryViewer from './MemoryViewer'
import SkillsSection from './SkillsSection'

interface AgentProfileProps {
  isOpen: boolean
  onClose: () => void
  agentId: string
  sessionStatus?: AgentSessionStatus  // Session status from unified API
  onStartSession?: () => void         // Callback to start a session for offline agents
  onDeleteAgent?: (agentId: string) => Promise<void>  // Callback to delete agent
  scrollToDangerZone?: boolean        // Whether to auto-scroll to danger zone
  hostUrl?: string                    // Base URL for remote hosts
}

export default function AgentProfile({ isOpen, onClose, agentId, sessionStatus, onStartSession, onDeleteAgent, scrollToDangerZone, hostUrl }: AgentProfileProps) {
  // Base URL for API calls - empty for local, full URL for remote hosts
  const baseUrl = hostUrl || ''
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [showTagDialog, setShowTagDialog] = useState(false)
  const [newTagValue, setNewTagValue] = useState('')
  const [showTransferDialog, setShowTransferDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Repository state
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [detectingRepos, setDetectingRepos] = useState(false)

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    identity: true,
    work: true,
    deployment: true,
    repositories: true,
    memory: true,
    skills: true,
    metrics: true,
    documentation: false,
    customMetadata: false,
    dangerZone: false
  })

  // Ref for danger zone scrolling
  const dangerZoneRef = useRef<HTMLElement>(null)

  // Auto-scroll to danger zone when requested
  useEffect(() => {
    if (scrollToDangerZone && isOpen && !loading && dangerZoneRef.current) {
      // Expand the danger zone section
      setExpandedSections(prev => ({ ...prev, dangerZone: true }))
      // Scroll after a short delay to let the expansion happen
      setTimeout(() => {
        dangerZoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [scrollToDangerZone, isOpen, loading])

  // Fetch agent data
  useEffect(() => {
    if (!isOpen || !agentId) return

    const fetchAgent = async () => {
      setLoading(true)
      try {
        const response = await fetch(`${baseUrl}/api/agents/${agentId}`)
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

  // Fetch repositories when agent loads
  useEffect(() => {
    if (!isOpen || !agentId) return

    const fetchRepos = async () => {
      setLoadingRepos(true)
      try {
        const response = await fetch(`${baseUrl}/api/agents/${agentId}/repos`)
        if (response.ok) {
          const data = await response.json()
          setRepositories(data.repositories || [])
        }
      } catch (error) {
        console.error('Failed to fetch repos:', error)
      } finally {
        setLoadingRepos(false)
      }
    }

    fetchRepos()
  }, [isOpen, agentId])

  // Detect repositories from working directory
  const handleDetectRepos = async () => {
    setDetectingRepos(true)
    try {
      const response = await fetch(`${baseUrl}/api/agents/${agentId}/repos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detectFromWorkingDir: true })
      })
      if (response.ok) {
        const data = await response.json()
        if (data.repositories) {
          setRepositories(data.repositories)
        }
      }
    } catch (error) {
      console.error('Failed to detect repos:', error)
    } finally {
      setDetectingRepos(false)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const handleSave = async () => {
    if (!agent || !hasChanges) return

    setSaving(true)
    try {
      const response = await fetch(`${baseUrl}/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agent.name || agent.alias,
          label: agent.label,
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
    const normalizedTag = tag.trim().toLowerCase()
    if (!agent.tags?.includes(normalizedTag)) {
      updateField('tags', [...(agent.tags || []), normalizedTag])
    }
  }

  const handleAddTagSubmit = () => {
    if (newTagValue.trim()) {
      addTag(newTagValue)
      setNewTagValue('')
      setShowTagDialog(false)
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
              <div className="flex items-center gap-2">
                {/* Export Button */}
                <button
                  onClick={() => setShowExportDialog(true)}
                  className="p-2 rounded-lg hover:bg-gray-800 transition-all text-gray-400 hover:text-gray-200"
                  title="Export Agent"
                >
                  <Download className="w-5 h-5" />
                </button>
                {/* Transfer Button */}
                <button
                  onClick={() => setShowTransferDialog(true)}
                  className="p-2 rounded-lg hover:bg-gray-800 transition-all text-gray-400 hover:text-blue-400"
                  title="Transfer to Another Host"
                >
                  <Send className="w-5 h-5" />
                </button>
                {/* Divider */}
                <div className="w-px h-6 bg-gray-700 mx-1" />
                {/* Save Button */}
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
              {/* Session Status Section - Shows at top for quick access */}
              {sessionStatus && (
                <div className={`rounded-xl p-4 border ${
                  sessionStatus.status === 'online'
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-gray-800 border-gray-700'
                }`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {sessionStatus.status === 'online' ? (
                        <>
                          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                            <Wifi className="w-5 h-5 text-green-400" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-green-300">Online</div>
                            <div className="text-xs text-gray-400">
                              Session: {sessionStatus.tmuxSessionName}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center">
                            <WifiOff className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-300">Offline</div>
                            <div className="text-xs text-gray-500">
                              No active session
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Start Session Button - Only show when offline */}
                    {sessionStatus.status === 'offline' && onStartSession && (
                      <button
                        onClick={onStartSession}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm transition-all shadow-lg hover:shadow-green-500/25"
                      >
                        <Play className="w-4 h-4" />
                        Start Session
                      </button>
                    )}
                  </div>

                  {/* Session details when online */}
                  {sessionStatus.status === 'online' && sessionStatus.workingDirectory && (
                    <div className="mt-3 pt-3 border-t border-green-500/20">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Folder className="w-3 h-3" />
                        <span className="font-mono truncate">{sessionStatus.workingDirectory}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                        {agent.avatar ? (
                          <img
                            src={agent.avatar}
                            alt={agent.label || agent.name || 'Agent'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          '🤖'
                        )}
                      </div>
                      <div className="flex-1 space-y-3">
                        {/* Agent Name - Primary identifier */}
                        <div>
                          <EditableField
                            label="Agent Name"
                            value={agent.name || agent.alias || ''}
                            onChange={(value) => updateField('name', value)}
                            icon={<User className="w-4 h-4" />}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Used for tmux session. Changing this will require restarting the agent.
                          </p>
                        </div>
                        {/* Display Label - Optional override */}
                        <div>
                          <EditableField
                            label="Display Label"
                            value={agent.label || ''}
                            onChange={(value) => updateField('label', value)}
                            icon={<Tag className="w-4 h-4" />}
                            placeholder={agent.name || agent.alias || 'Same as agent name'}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Optional friendly name shown in the sidebar instead of agent name.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Host Information - Read only */}
                    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                      <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2">
                        <Server className="w-4 h-4" />
                        Host
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-200">
                          {/* If no hostUrl prop, agent is on this machine (local) */}
                          {!hostUrl
                            ? 'This Machine'
                            : agent.hostName || agent.hostId || 'Remote'}
                        </span>
                        {!hostUrl ? (
                          <Monitor className="w-4 h-4 text-green-400" />
                        ) : (
                          <Cloud className="w-4 h-4 text-blue-400" />
                        )}
                      </div>
                      {agent.hostUrl && agent.hostUrl !== '' && (
                        <p className="text-xs text-gray-500 mt-1">{agent.hostUrl}</p>
                      )}
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

                    {/* Tags - Control sidebar tree position */}
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                          <Tag className="w-4 h-4" />
                          Sidebar Organization (Tags)
                        </label>
                        <p className="text-xs text-gray-500 mb-3">
                          Tags determine where the agent appears in the sidebar tree. First tag = folder, second tag = subfolder.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {agent.tags?.map((tag, index) => (
                            <span
                              key={tag}
                              className={`px-3 py-1 border rounded-full text-sm flex items-center gap-2 transition-all group ${
                                index === 0
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 hover:bg-purple-500/30'
                                  : index === 1
                                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30'
                                  : 'bg-gray-500/20 text-gray-300 border-gray-500/30 hover:bg-gray-500/30'
                              }`}
                            >
                              <span className="text-[10px] opacity-60">{index === 0 ? 'folder' : index === 1 ? 'subfolder' : 'tag'}</span>
                              {tag}
                              <X
                                className="w-3 h-3 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => removeTag(tag)}
                              />
                            </span>
                          ))}
                          <button
                            onClick={() => setShowTagDialog(true)}
                            className="px-3 py-1 border border-dashed border-gray-600 rounded-full text-sm text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-all"
                          >
                            + Add Tag
                          </button>
                        </div>
                      </div>

                      {/* Tree Location Preview */}
                      <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
                        <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2">
                          <FolderTree className="w-4 h-4" />
                          Sidebar Location Preview
                        </div>
                        <div className="font-mono text-sm text-gray-300 space-y-1">
                          <div className="flex items-center gap-2">
                            <Folder className="w-4 h-4 text-purple-400" />
                            <span className="text-purple-300">{agent.tags?.[0] || 'ungrouped'}</span>
                          </div>
                          <div className="flex items-center gap-2 pl-4">
                            <Folder className="w-4 h-4 text-blue-400" />
                            <span className="text-blue-300">{agent.tags?.[1] || 'default'}</span>
                          </div>
                          <div className="flex items-center gap-2 pl-8">
                            <span className="text-green-400">{'>'}</span>
                            <span className="text-green-300 font-semibold">{agent.label || agent.name || agent.alias}</span>
                          </div>
                        </div>
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

              {/* Repositories Section */}
              <section>
                <button
                  onClick={() => toggleSection('repositories')}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 hover:text-gray-400 transition-all"
                >
                  {expandedSections.repositories ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <FolderGit2 className="w-4 h-4" />
                  Git Repositories
                  {repositories.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                      {repositories.length}
                    </span>
                  )}
                </button>

                {expandedSections.repositories && (
                  <div className="space-y-3">
                    {loadingRepos ? (
                      <div className="flex items-center gap-2 text-gray-400 text-sm p-4 bg-gray-800/50 rounded-lg">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Loading repositories...
                      </div>
                    ) : repositories.length === 0 ? (
                      <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                        <p className="text-sm text-gray-400 mb-3">
                          No repositories detected. Click below to scan the working directory.
                        </p>
                        <button
                          onClick={handleDetectRepos}
                          disabled={detectingRepos}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                        >
                          {detectingRepos ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              Detecting...
                            </>
                          ) : (
                            <>
                              <FolderGit2 className="w-4 h-4" />
                              Detect Repositories
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Repository list */}
                        {repositories.map((repo, idx) => (
                          <div
                            key={idx}
                            className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                                <GitBranch className="w-5 h-5 text-orange-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-gray-100">{repo.name}</span>
                                  {repo.isPrimary && (
                                    <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                                      primary
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 truncate mb-1" title={repo.remoteUrl}>
                                  {repo.remoteUrl}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-gray-400">
                                  {repo.currentBranch && (
                                    <span className="flex items-center gap-1">
                                      <GitBranch className="w-3 h-3" />
                                      {repo.currentBranch}
                                    </span>
                                  )}
                                  {repo.lastCommit && (
                                    <span className="font-mono">{repo.lastCommit}</span>
                                  )}
                                </div>
                                {repo.localPath && (
                                  <div className="text-xs text-gray-500 mt-2 flex items-center gap-1 truncate" title={repo.localPath}>
                                    <Folder className="w-3 h-3" />
                                    {repo.localPath}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Detect more button */}
                        <button
                          onClick={handleDetectRepos}
                          disabled={detectingRepos}
                          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-all disabled:opacity-50"
                        >
                          {detectingRepos ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          Refresh
                        </button>
                      </>
                    )}
                  </div>
                )}
              </section>

              {/* Long-Term Memory Section */}
              <section>
                <button
                  onClick={() => toggleSection('memory')}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 hover:text-gray-400 transition-all"
                >
                  {expandedSections.memory ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <Brain className="w-4 h-4" />
                  Long-Term Memory
                </button>

                {expandedSections.memory && (
                  <MemoryViewer agentId={agent.id} hostUrl={hostUrl} />
                )}
              </section>

              {/* Skills Settings Section */}
              <section>
                <button
                  onClick={() => toggleSection('skills')}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 hover:text-gray-400 transition-all"
                >
                  {expandedSections.skills ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <Cpu className="w-4 h-4" />
                  Skills
                </button>

                {expandedSections.skills && (
                  <SkillsSection agentId={agent.id} hostUrl={hostUrl} />
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

              {/* Danger Zone Section */}
              <section ref={dangerZoneRef as React.RefObject<HTMLElement>}>
                <button
                  onClick={() => toggleSection('dangerZone')}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-500 mb-4 hover:text-red-400 transition-all"
                >
                  {expandedSections.dangerZone ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <AlertTriangle className="w-4 h-4" />
                  Danger Zone
                </button>

                {expandedSections.dangerZone && (
                  <div className="p-4 bg-red-500/5 border border-red-500/30 rounded-xl space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                        <Trash2 className="w-5 h-5 text-red-400" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-red-300 mb-1">Delete this agent</h4>
                        <p className="text-sm text-gray-400 mb-3">
                          Permanently delete this agent and all associated data. This action cannot be undone.
                        </p>
                        <button
                          onClick={() => setShowDeleteDialog(true)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete Agent
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>

      {/* Add Tag Dialog */}
      {showTagDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Tag className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Add Tag</h3>
                <p className="text-sm text-gray-400">Tags help organize and group agents</p>
              </div>
            </div>

            <input
              type="text"
              value={newTagValue}
              onChange={(e) => setNewTagValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTagSubmit()
                if (e.key === 'Escape') {
                  setShowTagDialog(false)
                  setNewTagValue('')
                }
              }}
              placeholder="Enter tag name..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              autoFocus
            />

            <p className="text-xs text-gray-500 mt-2">
              Tags are automatically converted to lowercase
            </p>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowTagDialog(false)
                  setNewTagValue('')
                }}
                className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTagSubmit}
                disabled={!newTagValue.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Add Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Agent Dialog */}
      {showTransferDialog && agent && (
        <TransferAgentDialog
          agentId={agent.id}
          agentAlias={agent.name || agent.alias || ''}
          agentDisplayName={agent.label}
          currentHostId={agent.hostId}
          onClose={() => setShowTransferDialog(false)}
          onTransferComplete={(result) => {
            if (result.success && result.mode === 'move') {
              // Agent was moved, close the profile
              onClose()
            }
            setShowTransferDialog(false)
          }}
          hostUrl={hostUrl}
        />
      )}

      {/* Export Agent Dialog */}
      {agent && (
        <ExportAgentDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          agentId={agent.id}
          agentAlias={agent.name || agent.alias || ''}
          agentDisplayName={agent.label}
          hostUrl={hostUrl}
        />
      )}

      {/* Delete Agent Dialog */}
      {agent && (
        <DeleteAgentDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onConfirm={async () => {
            if (onDeleteAgent) {
              await onDeleteAgent(agent.id)
            }
          }}
          agentId={agent.id}
          agentAlias={agent.name || agent.alias || ''}
          agentDisplayName={agent.label}
        />
      )}
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
