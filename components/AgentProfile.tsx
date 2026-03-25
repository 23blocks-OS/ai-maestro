'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  X, User, Building2, Briefcase, Code2, Cpu, Tag,
  Activity, MessageSquare, CheckCircle, Clock, Zap,
  DollarSign, Database, BookOpen, Link2, Edit2, Save,
  ChevronDown, ChevronRight, Plus, Trash2, TrendingUp, TrendingDown,
  Cloud, Monitor, Server, Play, Wifi, WifiOff, Folder, Download, Send,
  GitBranch, FolderGit2, RefreshCw, ExternalLink, AlertTriangle, Brain,
  FolderTree, Terminal, Crown, Shield, Webhook, ScrollText, Users, Puzzle, Palette,
  ToggleLeft, ToggleRight, Loader2
} from 'lucide-react'
import type { Agent, AgentDocumentation, AgentSessionStatus, Repository } from '@/types/agent'
import TransferAgentDialog from './TransferAgentDialog'
import ExportAgentDialog from './ExportAgentDialog'
import DeleteAgentDialog from './DeleteAgentDialog'
import MemoryViewer from './MemoryViewer'
import SkillsSection from './SkillsSection'
// AgentSkillEditor (marketplace skills) moved to Settings → Global Elements
import AvatarPicker from './AvatarPicker'
import EmailAddressesSection from './EmailAddressesSection'
import { useGovernance } from '@/hooks/useGovernance'
import { useAgentLocalConfig } from '@/hooks/useAgentLocalConfig'
import TitleBadge from '@/components/governance/TitleBadge'
import TitleAssignmentDialog from '@/components/governance/TitleAssignmentDialog'
import TeamMembershipSection from '@/components/governance/TeamMembershipSection'

interface AgentProfileProps {
  isOpen: boolean
  onClose: () => void
  agentId: string
  sessionStatus?: AgentSessionStatus  // Session status from unified API
  onStartSession?: () => void         // Callback to start a session for offline agents
  onDeleteAgent?: (agentId: string) => Promise<void>  // Callback to delete agent
  scrollToDangerZone?: boolean        // Whether to auto-scroll to danger zone
  hostUrl?: string                    // Base URL for remote hosts
  embedded?: boolean                  // When true, renders inline (no fixed overlay/backdrop)
  renderMode?: 'full' | 'overview' | 'advanced'  // Which sections to render (default: 'full')
  renderAfterHeader?: () => React.ReactNode  // Content injected between header and body
  renderAfterGovernanceTitle?: () => React.ReactNode  // Content injected after the Governance Title row (used for Role Plugin selector)
}

/** Inline toggle for local plugin enable/disable */
function PluginToggle({ agentId, pluginKey, enabled, onToggled }: { agentId: string; pluginKey: string; enabled: boolean; onToggled: () => void }) {
  const [toggling, setToggling] = React.useState(false)
  const toggle = async () => {
    setToggling(true)
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/local-plugins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: pluginKey, enabled: !enabled }),
      })
      if (res.ok) onToggled()
    } catch { /* ignore */ }
    finally { setToggling(false) }
  }
  return (
    <button onClick={toggle} disabled={toggling} className="flex-shrink-0" title={enabled ? 'Disable plugin' : 'Enable plugin'}>
      {toggling ? <Loader2 className="w-5 h-5 text-gray-500 animate-spin" /> : enabled ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-gray-600" />}
    </button>
  )
}

export default function AgentProfile({ isOpen, onClose, agentId, sessionStatus, onStartSession, onDeleteAgent, scrollToDangerZone, hostUrl, embedded, renderMode = 'full', renderAfterHeader, renderAfterGovernanceTitle }: AgentProfileProps) {
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
  const [showTitleDialog, setShowRoleDialog] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [usedAvatars, setUsedAvatars] = useState<string[]>([])

  const governance = useGovernance(agentId || null)
  const { config: localConfig, refetch: refetchLocalConfig } = useAgentLocalConfig(agentId || null)
  // Note: AgentSkillEditor also calls useGovernance. In Phase 2, consider a GovernanceContext
  // provider to avoid duplicate API calls. Acceptable for Phase 1 with localhost-only architecture.

  // Marketplace skills management moved to Settings → Global Elements

  // Repository state
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [detectingRepos, setDetectingRepos] = useState(false)
  const [reposLoaded, setReposLoaded] = useState(false)

  // Collapsible sections - skills and memory start collapsed for faster loading
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    identity: true,
    work: true,
    deployment: true,
    email: false,
    repositories: false,
    memory: false,
    installedSkills: false,
    localAgents: false,
    localRules: false,
    localCommands: false,
    localHooks: false,
    localMcp: false,
    localLsp: false,
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

    // Reset lazy-load flags when agent changes
    setReposLoaded(false)
    setRepositories([])

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
  }, [isOpen, agentId, baseUrl])

  // Fetch repositories lazily - only when section is expanded
  useEffect(() => {
    if (!isOpen || !agentId || !expandedSections.repositories || reposLoaded) return

    const fetchRepos = async () => {
      setLoadingRepos(true)
      try {
        const response = await fetch(`${baseUrl}/api/agents/${agentId}/repos`)
        if (response.ok) {
          const data = await response.json()
          setRepositories(data.repositories || [])
          setReposLoaded(true)
        }
      } catch (error) {
        console.error('Failed to fetch repos:', error)
      } finally {
        setLoadingRepos(false)
      }
    }

    fetchRepos()
  }, [isOpen, agentId, expandedSections.repositories, reposLoaded, baseUrl])

  // Fetch used avatars (all avatars from other agents on this host)
  useEffect(() => {
    if (!isOpen) return

    const fetchUsedAvatars = async () => {
      try {
        const response = await fetch(`${baseUrl}/api/agents`)
        if (response.ok) {
          const data = await response.json()
          const avatars = (data.agents || [])
            .filter((a: Agent) => a.id !== agentId && a.avatar)
            .map((a: Agent) => a.avatar as string)
          setUsedAvatars(avatars)
        }
      } catch (error) {
        console.error('Failed to fetch used avatars:', error)
      }
    }

    fetchUsedAvatars()
  }, [isOpen, agentId, baseUrl])

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
          programArgs: agent.programArgs,
          tags: agent.tags,
          documentation: agent.documentation,
          metadata: agent.metadata
        })
      })

      if (response.ok) {
        setHasChanges(false)
        setSaving(false)
      } else {
        // CC-P1-702: Handle non-OK responses so the save button does not remain stuck in spinner state
        const errData = await response.json().catch(() => ({ error: 'Save failed' }))
        console.error('Failed to save agent:', errData.error || response.statusText)
        setSaving(false)
      }
    } catch (error) {
      console.error('Failed to save agent:', error)
      setSaving(false)
    }
  }

  // CC-P1-701: Restrict value type to the actual union of types used by callers
  const updateField = (field: string, value: string | string[] | undefined) => {
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

  if (!embedded && !isOpen) return null

  return (
    <>
      {/* Backdrop — overlay mode only */}
      {!embedded && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel — fixed overlay vs. inline depending on embedded prop */}
      <div
        className={embedded
          ? 'flex-1 overflow-y-auto bg-gray-900'
          : `fixed inset-y-0 right-0 w-full md:w-[480px] bg-gray-900 border-l border-gray-800 shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out ${
              isOpen ? 'translate-x-0' : 'translate-x-full'
            }`
        }
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <div className="text-gray-400">Loading agent profile...</div>
          </div>
        ) : !agent ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">Agent not found</div>
          </div>
        ) : (
          <>
            {/* Header — hidden in advanced mode (parent provides its own header) */}
            {renderMode !== 'advanced' && <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-100">Agent Profile</h2>
                {/* Read-only title label — the clickable control is in the identity section below */}
                <TitleBadge title={governance.agentTitle} size="sm" />
              </div>
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
                {/* Close button — only in overlay mode, parent handles closing in embedded */}
                {!embedded && (
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-gray-800 transition-all text-gray-400 hover:text-gray-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>}

            {/* Injected content after header (e.g. Role Plugin selector) */}
            {renderMode !== 'advanced' && renderAfterHeader?.()}

            {/* Content */}
            <div className="p-6 space-y-8">
              {/* Session Status Section - Shows at top for quick access — hidden in advanced mode */}
              {renderMode !== 'advanced' && sessionStatus && (
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

              {/* Identity through Memory — hidden in advanced mode (shown in overview and full) */}
              {renderMode !== 'advanced' && (<>
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
                      <button
                        onClick={() => setShowAvatarPicker(true)}
                        className="w-24 h-24 rounded-xl border-2 border-gray-700 overflow-hidden hover:border-blue-500 hover:scale-105 transition-all flex-shrink-0 bg-gray-800 flex items-center justify-center text-4xl cursor-pointer group relative"
                        title="Click to change avatar"
                      >
                        {agent.avatar ? (
                          <img
                            src={agent.avatar}
                            alt={agent.label || agent.name || 'Agent'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          '🤖'
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Edit2 className="w-6 h-6 text-white" />
                        </div>
                      </button>
                      <div className="flex-1 space-y-3">
                        {/* Agent ID - Technical identifier */}
                        <div>
                          <EditableField
                            label="Agent ID"
                            value={agent.name || agent.alias || ''}
                            onChange={(value) => updateField('name', value)}
                            icon={<User className="w-4 h-4" />}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Technical identifier used for tmux session. Changing requires restart.
                          </p>
                        </div>
                        {/* Persona Name - The agent's display name */}
                        <div>
                          <EditableField
                            label="Persona Name"
                            value={agent.label || ''}
                            onChange={(value) => updateField('label', value)}
                            icon={<Tag className="w-4 h-4" />}
                            placeholder={agent.name || agent.alias || 'Same as agent ID'}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            The agent&apos;s personal name, shown capitalized in the UI.
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Owner */}
                    <EditableField
                      label="Owner"
                      value={agent.owner || ''}
                      onChange={(value) => updateField('owner', value)}
                      icon={<User className="w-4 h-4" />}
                      placeholder="Owner name"
                    />

                    {/* Governance Title */}
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Shield className="w-4 h-4" />
                        <span>Governance Title</span>
                      </div>
                      <TitleBadge
                        title={governance.agentTitle}
                        onClick={() => setShowRoleDialog(true)}
                      />
                    </div>

                    {/* Role Plugin selector (injected by AgentProfilePanel) */}
                    {renderAfterGovernanceTitle?.()}

                    {/* Team Membership (replaces free-text Team field) */}
                    <TeamMembershipSection
                      agentId={agent.id}
                      agentTitle={governance.agentTitle}
                      memberTeams={governance.memberTeams}
                      allTeams={governance.allTeams}
                      onJoinTeam={(teamId) => governance.addAgentToTeam(teamId, agent.id)}
                      onLeaveTeam={(teamId) => governance.removeAgentFromTeam(teamId, agent.id)}
                      pendingTransfers={governance.pendingTransfers}
                      onRequestTransfer={(aid, from, to) => governance.requestTransfer(aid, from, to)}
                      onResolveTransfer={(tid, action) => governance.resolveTransfer(tid, action)}
                    />
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

                    <EditableField
                      label="Program Arguments (e.g. --continue)"
                      value={agent.programArgs || ''}
                      onChange={(value) => updateField('programArgs', value)}
                      icon={<Terminal className="w-4 h-4" />}
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

                      {/* Sidebar Location Preview removed — tags are self-explanatory */}
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

              {/* Email Addresses Section */}
              <EmailAddressesSection
                agentId={agent.id}
                hostUrl={hostUrl}
                isExpanded={expandedSections.email}
                onToggle={() => toggleSection('email')}
              />

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
                        {/* SF-019: Use stable key from repo identity instead of array index */}
                        {repositories.map((repo, idx) => (
                          <div
                            key={repo.remoteUrl || repo.localPath || idx}
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

              {/* Long-Term Memory section removed — MemoryViewer in toolbar, SkillsSection in Advanced tab */}

              </>)}

              {/* User-level skills are managed in Settings → Global Elements */}

              {/* ── Local elements & plugins — hidden in overview/advanced mode (moved to Config tab) ── */}
              {renderMode === 'full' && localConfig && localConfig.plugins.length > 0 && (
                <section>
                  <button
                    onClick={() => toggleSection('localPlugins')}
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 hover:text-gray-400 transition-all"
                  >
                    {expandedSections.localPlugins ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Puzzle className="w-4 h-4" />
                    Plugins
                    <span className="ml-1 text-gray-600">
                      ({localConfig.plugins.filter(p => p.enabled).length}/{localConfig.plugins.length})
                    </span>
                  </button>
                  {expandedSections.localPlugins && (
                    <div className="space-y-1.5 mb-6">
                      {localConfig.plugins.map(plugin => (
                        <div
                          key={plugin.key || plugin.name}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                            plugin.enabled ? 'bg-emerald-500/5' : 'bg-gray-900/30'
                          }`}
                        >
                          <Puzzle className={`w-3.5 h-3.5 flex-shrink-0 ${plugin.enabled ? 'text-emerald-400' : 'text-gray-600'}`} />
                          <div className="flex-1 min-w-0">
                            <span className={`text-xs truncate block ${plugin.enabled ? 'text-gray-200' : 'text-gray-500'}`}>
                              {plugin.name}
                            </span>
                            {plugin.description && (
                              <span className="text-[10px] text-gray-600 truncate block">{plugin.description}</span>
                            )}
                          </div>
                          {plugin.isConflictingRolePlugin && (
                            <span className="text-[9px] text-amber-400/70 bg-amber-500/10 rounded px-1.5 py-0.5 flex-shrink-0">conflict</span>
                          )}
                          {plugin.key && (
                            <PluginToggle agentId={agent.id} pluginKey={plugin.key} enabled={plugin.enabled} onToggled={refetchLocalConfig} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── Local Elements Sections — hidden in overview/advanced mode (moved to Config tab) ── */}
              {renderMode === 'full' && (() => {
                const rpName = localConfig?.rolePlugin?.name
                const isFromRP = (sourcePlugin?: string) => !!rpName && sourcePlugin === rpName

                // Helper: render an element item with role-plugin vs extra styling
                const renderItem = (name: string, icon: React.ReactNode, sourcePlugin?: string, detail?: string) => {
                  const fromRP = isFromRP(sourcePlugin)
                  return (
                    <div
                      key={name}
                      className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${
                        fromRP
                          ? 'border-emerald-500/30'
                          : 'bg-gray-800/40 border-gray-700/30'
                      }`}
                      style={fromRP ? { backgroundColor: 'rgba(16,185,129,0.18)' } : undefined}
                    >
                      {icon}
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs truncate block ${fromRP ? 'text-emerald-200' : 'text-gray-200'}`}>{name}</span>
                        {detail && <span className="text-[10px] text-gray-500 truncate block mt-0.5">{detail}</span>}
                      </div>
                      {fromRP && (
                        <span className="text-[9px] text-emerald-400/70 bg-emerald-500/10 border border-emerald-500/15 rounded px-1.5 py-0.5 flex-shrink-0">role-plugin</span>
                      )}
                      {sourcePlugin && !fromRP && (
                        <span className="text-[9px] text-blue-400/70 bg-blue-500/10 rounded px-1.5 py-0.5 flex-shrink-0 truncate max-w-[120px]">plugin: {sourcePlugin}</span>
                      )}
                    </div>
                  )
                }

                const emptyState = <p className="text-[11px] text-gray-600 italic px-1">None</p>

                const sections: { key: string; label: string; icon: React.ReactNode; items: React.ReactNode }[] = [
                  {
                    key: 'localAgents', label: 'Sub-Agents', icon: <Users className="w-4 h-4" />,
                    items: localConfig && localConfig.agents.length > 0
                      ? <div className="space-y-2">{localConfig.agents.map(a => renderItem(a.name, <Users className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />, a.sourcePlugin, a.description !== '---' ? a.description : undefined))}</div>
                      : emptyState,
                  },
                  {
                    key: 'localRules', label: 'Rules', icon: <ScrollText className="w-4 h-4" />,
                    items: localConfig && localConfig.rules.length > 0
                      ? <div className="space-y-2">{localConfig.rules.map(r => renderItem(r.name, <ScrollText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />, r.sourcePlugin, r.preview))}</div>
                      : emptyState,
                  },
                  {
                    key: 'localCommands', label: 'Commands', icon: <Terminal className="w-4 h-4" />,
                    items: localConfig && localConfig.commands.length > 0
                      ? <div className="space-y-2">{localConfig.commands.map(c => renderItem(`/${c.name}`, <Terminal className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />, c.sourcePlugin))}</div>
                      : emptyState,
                  },
                  {
                    key: 'localHooks', label: 'Hooks', icon: <Webhook className="w-4 h-4" />,
                    items: localConfig && localConfig.hooks.length > 0
                      ? <div className="space-y-2">{localConfig.hooks.map(h => renderItem(h.name, <Webhook className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />, h.sourcePlugin, h.eventType))}</div>
                      : emptyState,
                  },
                  {
                    key: 'localMcp', label: 'MCP Servers', icon: <Server className="w-4 h-4" />,
                    items: localConfig && localConfig.mcpServers.length > 0
                      ? <div className="space-y-2">{localConfig.mcpServers.map(m => renderItem(m.name, <Server className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />, m.sourcePlugin, m.command ? `${m.command} ${m.args?.join(' ') || ''}` : undefined))}</div>
                      : emptyState,
                  },
                  {
                    key: 'localLsp', label: 'LSP Servers', icon: <Cpu className="w-4 h-4" />,
                    items: localConfig && localConfig.lspServers.length > 0
                      ? <div className="space-y-2">{localConfig.lspServers.map(l => renderItem(l.name, <Cpu className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />, l.sourcePlugin, l.languages.join(', ')))}</div>
                      : emptyState,
                  },
                  {
                    key: 'localOutputStyles', label: 'Output Styles', icon: <Palette className="w-4 h-4" />,
                    items: localConfig && localConfig.outputStyles && localConfig.outputStyles.length > 0
                      ? <div className="space-y-2">{localConfig.outputStyles.map(o => renderItem(o.name, <Palette className="w-3.5 h-3.5 text-pink-400 flex-shrink-0 mt-0.5" />, o.sourcePlugin))}</div>
                      : emptyState,
                  },
                ]

                return sections.map(s => (
                  <section key={s.key}>
                    <button
                      onClick={() => toggleSection(s.key)}
                      className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 hover:text-gray-400 transition-all"
                    >
                      {expandedSections[s.key] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {s.icon}
                      {s.label}
                      {localConfig && (
                        <span className="ml-1 text-gray-600">
                          ({
                            s.key === 'localAgents' ? localConfig.agents.length :
                            s.key === 'localRules' ? localConfig.rules.length :
                            s.key === 'localCommands' ? localConfig.commands.length :
                            s.key === 'localHooks' ? localConfig.hooks.length :
                            s.key === 'localMcp' ? localConfig.mcpServers.length :
                            s.key === 'localLsp' ? localConfig.lspServers.length :
                            (localConfig.outputStyles?.length || 0)
                          })
                        </span>
                      )}
                    </button>
                    {expandedSections[s.key] && s.items}
                  </section>
                ))
              })()}

              {/* Long-Term Memory Options + Metrics/Documentation/Danger — hidden in overview mode */}
              {renderMode !== 'overview' && (<>
              {/* Memory configuration (renamed from "Skill Settings") */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                  <Brain className="w-4 h-4" />
                  Long-Term Memory Options
                </div>
                <SkillsSection agentId={agent.id} hostUrl={hostUrl} />
              </section>

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
              </>)}
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

      {/* Role Assignment Dialog */}
      {agent && (
        <TitleAssignmentDialog
          isOpen={showTitleDialog}
          onClose={() => setShowRoleDialog(false)}
          agentId={agent.id}
          agentName={agent.label || agent.name || ''}
          currentTitle={governance.agentTitle}
          governance={governance}
          onTitleChanged={() => governance.refresh()}
        />
      )}

      {/* Avatar Picker */}
      <AvatarPicker
        isOpen={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        onSelect={(avatarUrl) => {
          updateField('avatar', avatarUrl)
        }}
        currentAvatar={agent?.avatar}
        usedAvatars={usedAvatars}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// EditableField
// ---------------------------------------------------------------------------

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
          <span className={value ? 'text-gray-200' : 'text-gray-500'}>{value || placeholder || 'Click to edit'}</span>
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
