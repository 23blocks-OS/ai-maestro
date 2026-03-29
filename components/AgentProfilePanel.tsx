'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Shield,
  Puzzle,
  Sparkles,
  Users,
  Webhook,
  ScrollText,
  Terminal,
  Server,
  Palette,
  Loader2,
  AlertCircle,
  FolderOpen,
  XCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Undo2,
  Redo2,
  Lock,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useConfigUndoRedo } from '@/hooks/useConfigUndoRedo'
import { useAgentLocalConfig } from '@/hooks/useAgentLocalConfig'
import type { AgentLocalConfig } from '@/types/agent-local-config'
import { type TabId, type TabDef, type AgentInfo } from './agent-profile/shared'
import TabContent from './agent-profile/TabContent'
import FolderBrowser from './agent-profile/FolderBrowser'
import RolePluginModal from './agent-profile/RolePluginModal'
import { detectClientType, getClientCapabilities, isTabSupported, clientTypeLabel } from '@/lib/client-capabilities'

// Lazy-load AgentProfile — only mounted when Overview tab is active
const AgentProfile = dynamic(() => import('@/components/AgentProfile'), { ssr: false })

// ---------------------------------------------------------------------------
// Title → Role-Plugin map (mirrors services/role-plugin-service.ts TITLE_PLUGIN_MAP)
// Used to show the locked plugin name for non-MEMBER titles.
// ---------------------------------------------------------------------------

const TITLE_PLUGIN_MAP: Record<string, string> = {
  'manager': 'ai-maestro-assistant-manager-agent',
  'chief-of-staff': 'ai-maestro-chief-of-staff',
  'architect': 'ai-maestro-architect-agent',
  'orchestrator': 'ai-maestro-orchestrator-agent',
  'integrator': 'ai-maestro-integrator-agent',
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

// Sections that are always expanded (no accordion toggle)
const NON_COLLAPSIBLE = new Set<TabId>(['role'])

const TABS: TabDef[] = [
  { id: 'role', label: 'Role', icon: Shield, colorClass: 'text-amber-400' },
  { id: 'skills', label: 'Skills', icon: Sparkles, colorClass: 'text-emerald-400', countKey: 'skills' },
  { id: 'agents', label: 'Agents', icon: Users, colorClass: 'text-cyan-400', countKey: 'agents' },
  { id: 'hooks', label: 'Hooks', icon: Webhook, colorClass: 'text-amber-400', countKey: 'hooks' },
  { id: 'rules', label: 'Rules', icon: ScrollText, colorClass: 'text-gray-400', countKey: 'rules' },
  { id: 'commands', label: 'Commands', icon: Terminal, colorClass: 'text-violet-400', countKey: 'commands' },
  { id: 'mcps', label: 'MCP Servers', icon: Server, colorClass: 'text-purple-400', countKey: 'mcpServers' },
  { id: 'outputStyles', label: 'Output Styles', icon: Palette, colorClass: 'text-pink-400', countKey: 'outputStyles' },
  { id: 'plugins', label: 'Plugins', icon: Puzzle, colorClass: 'text-blue-400', countKey: 'plugins' },
]

// Accordion section order for Config tab (Plugins is always LAST)

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentProfilePanelProps {
  agentId: string | null
  agentName?: string
  agentInfo?: AgentInfo
  onEditInHaephestos?: (profilePath: string) => void
  onClose?: () => void
  onAgentDataChanged?: () => void // Notify parent to refresh sidebar agent list
  // Props forwarded to embedded AgentProfile (Overview tab)
  sessionStatus?: import('@/types/agent').AgentSessionStatus
  onStartSession?: () => void
  onDeleteAgent?: (agentId: string) => Promise<void>
  scrollToDangerZone?: boolean
  hostUrl?: string
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type TopTab = 'overview' | 'config' | 'advanced'

export default function AgentProfilePanel({
  agentId,
  agentName,
  agentInfo,
  onEditInHaephestos,
  onClose,
  onAgentDataChanged,
  sessionStatus,
  onStartSession,
  onDeleteAgent,
  scrollToDangerZone,
  hostUrl,
}: AgentProfilePanelProps) {
  const { config, error, loading, refetch: rawRefetch } = useAgentLocalConfig(agentId)
  // Shared undo/redo hook — visible in ALL tabs via panel header buttons
  const undoRedo = useConfigUndoRedo()
  // Stable ref so refetch callback doesn't depend on undoRedo object identity
  const undoRedoRef = useRef(undoRedo)
  undoRedoRef.current = undoRedo
  const onAgentDataChangedRef = useRef(onAgentDataChanged)
  onAgentDataChangedRef.current = onAgentDataChanged
  // Wrap refetch: await config reload FIRST, then undo status, then sidebar refresh
  const refetch = useCallback(async () => {
    await rawRefetch() // Wait for config to fully reload
    await undoRedoRef.current.refreshStatus() // Update undo/redo button counts
    onAgentDataChangedRef.current?.() // Sidebar refresh last
  }, [rawRefetch])
  const [topTab, setTopTab] = useState<TopTab>('overview')
  const [activeTab, setActiveTab] = useState<TabId>('role')
  const [browsePath, setBrowsePath] = useState<string | null>(null)
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Role Plugin modal state
  const [showRolePluginModal, setShowRolePluginModal] = useState(false)
  const [switchingPlugin, setSwitchingPlugin] = useState(false)

  // Auto-continue state
  const [autoContinue, setAutoContinue] = useState(false)
  const [autoContinueLoading, setAutoContinueLoading] = useState(false)

  // Client capability detection — filter config tabs based on AI client type
  const clientType = detectClientType(agentInfo?.program || '')
  const capabilities = getClientCapabilities(agentInfo?.program || '')
  const visibleTabs = TABS.filter(tab => isTabSupported(tab.id, capabilities))

  // Cross-section navigation: expand section + scroll to it
  const handleSwitchSection = useCallback((tab: TabId) => {
    setActiveTab(tab)
    // Scroll to the section header after React renders the expanded content
    requestAnimationFrame(() => {
      const el = sectionRefs.current.get(tab)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  // Reset browse mode when agent changes
  useEffect(() => { setBrowsePath(null); setShowRolePluginModal(false) }, [agentId])

  // Fetch agent's autoContinue preference
  useEffect(() => {
    if (!agentId) return
    fetch(`/api/agents/${agentId}`)
      .then(r => r.json())
      .then(data => { setAutoContinue(!!data.agent?.preferences?.autoContinue) })
      .catch(() => {})
  }, [agentId])

  // Toggle autoContinue via PATCH
  const toggleAutoContinue = useCallback(async () => {
    if (!agentId || autoContinueLoading) return
    setAutoContinueLoading(true)
    try {
      const newValue = !autoContinue
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: { autoContinue: newValue } })
      })
      if (res.ok) {
        setAutoContinue(newValue)
        await undoRedoRef.current.refreshStatus()
        onAgentDataChangedRef.current?.()
      }
    } catch (err) {
      console.error('[AgentProfilePanel] Failed to toggle autoContinue:', err)
    } finally {
      setAutoContinueLoading(false)
    }
  }, [agentId, autoContinue, autoContinueLoading])

  // Switch role plugin: uninstall old → install new → restart agent session
  const handleSwitchPlugin = useCallback(async (newPluginName: string) => {
    if (!config?.workingDirectory || !agentId || switchingPlugin) return
    const currentPlugin = config.rolePlugin?.name
    if (currentPlugin === newPluginName) return

    // Client-side title lock guard: all non-MEMBER titles have locked role-plugins
    const agentTitle = agentInfo?.title
    if (agentTitle && agentTitle !== 'member') {
      return // Title-locked — the server enforces this too via autoAssignRolePluginForTitle
    }

    setSwitchingPlugin(true)
    try {
      const agentDir = config.workingDirectory

      // 1. Uninstall old plugin if one exists
      if (currentPlugin) {
        await fetch('/api/agents/role-plugins/install', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pluginName: currentPlugin, agentDir }),
        })
      }

      // 2. Install new plugin (explicit scope: 'local' for defense-in-depth)
      const installRes = await fetch('/api/agents/role-plugins/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginName: newPluginName, agentDir, scope: 'local' }),
      })
      if (!installRes.ok) {
        const err = await installRes.json().catch(() => ({ error: 'Install failed' }))
        throw new Error(err.error || 'Failed to install role plugin')
      }

      // 3. Update agent registry with new programArgs
      const mainAgentName = `${newPluginName}-main-agent`
      const sessionName = sessionStatus?.tmuxSessionName
      const effectiveAgentName = agentName || agentId
      const newArgs = `--agent ${mainAgentName} --name ${effectiveAgentName}`
      const registryRes = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programArgs: newArgs }),
      })
      if (!registryRes.ok) {
        const err = await registryRes.json().catch(() => ({ error: 'Registry update failed' }))
        throw new Error(err.error || 'Failed to update agent registry')
      }

      // 4. Gracefully restart Claude Code inside the SAME tmux session
      if (sessionName) {
        await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: '/exit', requireIdle: false }),
        }).catch((err) => { console.error('[RolePluginSelector] Failed to send /exit command:', err) })

        await new Promise(r => setTimeout(r, 3000))

        const startCmd = `claude --agent ${mainAgentName} --name ${effectiveAgentName}`
        await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: startCmd, requireIdle: false }),
        }).catch((err) => { console.error('[RolePluginSelector] Failed to send start command:', err) })
      }
      // Role-plugin switch invalidates all prior undo entries (programArgs changed, plugin swapped)
      undoRedo.clearStacks()
      // Notify parent and refresh config — role plugin change should update sidebar + panel
      await refetch()
    } catch (err) {
      console.error('[RolePluginSelector] Switch failed:', err)
    } finally {
      setSwitchingPlugin(false)
    }
  }, [config, agentId, agentName, switchingPlugin, sessionStatus, undoRedo])

  if (!agentId) {
    return (
      <div className="flex w-[420px] flex-shrink-0 items-center justify-center bg-gray-900 border-l border-gray-800" style={{ overscrollBehavior: 'contain' }}>
        <p className="text-sm text-gray-600 italic">Select an agent to inspect</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-[420px] flex-shrink-0 bg-gray-900 border-l border-gray-800 overflow-hidden" style={{ overscrollBehavior: 'contain' }}>
      {/* Header — includes shared Undo/Redo so they are visible across ALL tabs */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-800">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-200 truncate">
            {agentName || 'Profile'}
          </h2>
        </div>
        {/* Undo Button — shared across all tabs */}
        <div
          onClick={undoRedo.canUndo ? async () => { await undoRedo.undo(); await refetch() } : undefined}
          className={`relative p-1 rounded-md flex-shrink-0 transition-colors ${
            undoRedo.canUndo
              ? 'cursor-pointer hover:bg-gray-700/60 text-gray-400 hover:text-blue-400'
              : 'text-gray-700 cursor-not-allowed'
          }`}
          title="Undo"
        >
          <Undo2 className="w-4 h-4" />
        </div>
        {/* Redo Button — shared across all tabs */}
        <div
          onClick={undoRedo.canRedo ? async () => { await undoRedo.redo(); await refetch() } : undefined}
          className={`relative p-1 rounded-md flex-shrink-0 transition-colors ${
            undoRedo.canRedo
              ? 'cursor-pointer hover:bg-gray-700/60 text-gray-400 hover:text-blue-400'
              : 'text-gray-700 cursor-not-allowed'
          }`}
          title="Redo"
        >
          <Redo2 className="w-4 h-4" />
        </div>
        {onClose && (
          <div
            onClick={onClose}
            className="p-1 rounded-md cursor-pointer hover:bg-gray-700/60 transition-colors flex-shrink-0"
            title="Close profile panel"
          >
            <XCircle className="w-4 h-4 text-gray-500 hover:text-gray-300" />
          </div>
        )}
      </div>

      {/* Top-level tabs */}
      <div className="flex border-b border-gray-800">
        {([['overview', 'Overview'], ['config', 'Config'], ['advanced', 'Advanced']] as [TopTab, string][]).map(([t, label]) => (
          <div
            key={t}
            onClick={() => setTopTab(t)}
            className={`flex-1 text-center py-2 text-xs font-medium cursor-pointer transition-colors ${
              topTab === t
                ? 'text-gray-200 border-b-2 border-emerald-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Overview tab — Agent Profile + Role Plugin selector */}
      {topTab === 'overview' && (
        <div className="flex-1 overflow-y-auto" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          {/* Role Plugin display — locked for titled agents, changeable for MEMBER */}
          <div className="px-4 pt-3 pb-2">
            {agentInfo?.title && agentInfo.title !== 'member' ? (
              // Non-MEMBER title: static locked display
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-xs font-medium text-emerald-300 flex-1 truncate">
                  {switchingPlugin ? 'Switching…' : (TITLE_PLUGIN_MAP[agentInfo.title] || config?.rolePlugin?.name || 'No Role Plugin')}
                </span>
                <Lock className="w-3 h-3 text-emerald-500/50 flex-shrink-0" />
              </div>
            ) : (
              // MEMBER (or no title): shows current plugin + "Change" button
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700/40 bg-gray-800/30">
                <Shield className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-400 flex-1 truncate">
                  {switchingPlugin ? 'Switching…' : (config?.rolePlugin?.name || 'Default (Programmer)')}
                  {!switchingPlugin && config?.rolePlugin?.name && config.rolePlugin.name !== 'ai-maestro-programmer-agent' && (
                    <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">custom</span>
                  )}
                </span>
                <button
                  onClick={() => setShowRolePluginModal(true)}
                  disabled={switchingPlugin}
                  className="text-[10px] px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Change
                </button>
              </div>
            )}
          </div>

          {/* Embedded AgentProfile — overview sections only (no elements, no metrics/danger) */}
          <AgentProfile
            isOpen={true}
            onClose={() => {}}
            embedded={true}
            renderMode="overview"
            agentId={agentId}
            sessionStatus={sessionStatus}
            onStartSession={onStartSession}
            onDeleteAgent={onDeleteAgent}
            hostUrl={hostUrl}
            undoRedo={undoRedo}
            onDataChanged={refetch}
          />
        </div>
      )}

      {/* Config tab — .claude/ inspector */}
      {topTab === 'config' && (
        <>
          {/* Config sub-header */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/50">
            <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
            <p className="text-[10px] text-gray-500 truncate flex-1">
              {config?.workingDirectory || 'Live .claude/ configuration'}
            </p>
            {/* Client type badge — shows which AI client this agent uses */}
            {clientType !== 'unknown' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 flex-shrink-0">
                {clientTypeLabel(clientType)}
              </span>
            )}
            {loading && <Loader2 className="w-3 h-3 text-gray-500 animate-spin flex-shrink-0" />}
            {config?.workingDirectory && (
              <div
                onClick={() => setBrowsePath(`${config.workingDirectory}/.claude`)}
                className="p-1 rounded-md cursor-pointer hover:bg-gray-700/60 transition-colors flex-shrink-0"
                title="Browse .claude/ folder"
              >
                <FolderOpen className="w-3.5 h-3.5 text-gray-500 hover:text-amber-400" />
              </div>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <span className="text-[11px] text-red-400 truncate">{error}</span>
            </div>
          )}

          {/* Folder browser mode — replaces tab grid + tab content */}
          {browsePath && (
            <FolderBrowser
              key={browsePath}
              initialPath={browsePath}
              onBack={() => setBrowsePath(null)}
            />
          )}

          {/* Collapsible accordion sections — hidden when browsing */}
          {!browsePath && (
            <div className="flex-1 overflow-y-auto" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>

              {/* Auto-Continue toggle — at top of Config tab */}
              {config && (
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/30 bg-gray-900/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <RefreshCw className={`w-3.5 h-3.5 flex-shrink-0 ${autoContinue ? 'text-emerald-400' : 'text-gray-600'}`} />
                    <div className="min-w-0">
                      <span className="text-[11px] font-medium text-gray-300">Auto-Continue</span>
                      <p className="text-[9px] text-gray-600 leading-tight">
                        Keep-alive: Esc + &quot;continue&quot; every 4 min idle.
                        {!(agentInfo?.programArgs || '').includes('--dangerously-skip-permissions') && (
                          <span className="text-amber-500"> Requires --dangerously-skip-permissions</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={toggleAutoContinue}
                    disabled={autoContinueLoading}
                    className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
                      autoContinue ? 'bg-emerald-500' : 'bg-gray-700'
                    } ${autoContinueLoading ? 'opacity-50' : ''}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                      autoContinue ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              )}

              {!config && !error && (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
                </div>
              )}
              {config && visibleTabs.map(tab => {
                const Icon = tab.icon
                const pinned = NON_COLLAPSIBLE.has(tab.id)
                const isActive = pinned || activeTab === tab.id
                const count = tab.countKey
                  ? (config[tab.countKey] as unknown[])?.length ?? 0
                  : null

                return (
                  <div key={tab.id} ref={(el) => { if (el) sectionRefs.current.set(tab.id, el) }}>
                    {/* Section header — non-collapsible sections have no toggle */}
                    <div
                      onClick={pinned ? undefined : () => setActiveTab(isActive ? (null as unknown as TabId) : tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 border-b border-gray-800/30 transition-colors ${
                        pinned ? 'bg-amber-500/10' : isActive ? 'bg-amber-500/10 cursor-pointer' : 'hover:bg-gray-800/30 cursor-pointer'
                      }`}
                    >
                      {!pinned && (isActive
                        ? <ChevronDown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      )}
                      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? tab.colorClass : 'text-gray-600'}`} />
                      <span className={`text-[11px] font-medium flex-1 ${isActive ? 'text-gray-200' : 'text-gray-500'}`}>
                        {tab.label}
                      </span>
                      {count !== null && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                          isActive ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-800/60 text-gray-600'
                        }`}>
                          {count}
                        </span>
                      )}
                    </div>
                    {/* Section content */}
                    {isActive && (
                      <div className="px-4 py-3 border-b border-gray-800/30">
                        <TabContent tab={tab.id} config={config} agentId={agentId} agentInfo={agentInfo} onEditInHaephestos={onEditInHaephestos} onBrowse={setBrowsePath} onRefresh={refetch} onSwitchTab={handleSwitchSection} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Advanced tab — Metrics, Documentation, Danger Zone */}
      {topTab === 'advanced' && (
        <div className="flex-1 overflow-y-auto" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          <AgentProfile
            isOpen={true}
            onClose={() => {}}
            embedded={true}
            renderMode="advanced"
            agentId={agentId}
            sessionStatus={sessionStatus}
            onStartSession={onStartSession}
            onDeleteAgent={onDeleteAgent}
            scrollToDangerZone={scrollToDangerZone}
            hostUrl={hostUrl}
            undoRedo={undoRedo}
            onDataChanged={refetch}
          />
        </div>
      )}

      {/* Role Plugin modal — only accessible for MEMBER (or no title) agents */}
      <RolePluginModal
        isOpen={showRolePluginModal}
        onClose={() => setShowRolePluginModal(false)}
        currentPluginName={config?.rolePlugin?.name}
        onSelectPlugin={async (pluginName) => {
          await handleSwitchPlugin(pluginName)
          setShowRolePluginModal(false)
        }}
      />
    </div>
  )
}
