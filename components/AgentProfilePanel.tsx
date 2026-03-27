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
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useAgentLocalConfig } from '@/hooks/useAgentLocalConfig'
import type { AgentLocalConfig } from '@/types/agent-local-config'
import { type TabId, type TabDef, type AgentInfo, type AvailableRolePlugin } from './agent-profile/shared'
import TabContent from './agent-profile/TabContent'
import FolderBrowser from './agent-profile/FolderBrowser'
import { detectClientType, getClientCapabilities, isTabSupported, clientTypeLabel } from '@/lib/client-capabilities'

// Lazy-load AgentProfile — only mounted when Overview tab is active
const AgentProfile = dynamic(() => import('@/components/AgentProfile'), { ssr: false })

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
  sessionStatus,
  onStartSession,
  onDeleteAgent,
  scrollToDangerZone,
  hostUrl,
}: AgentProfilePanelProps) {
  const { config, error, loading, refetch } = useAgentLocalConfig(agentId)
  const [topTab, setTopTab] = useState<TopTab>('overview')
  const [activeTab, setActiveTab] = useState<TabId>('role')
  const [browsePath, setBrowsePath] = useState<string | null>(null)
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Role Plugin selector state
  const [availablePlugins, setAvailablePlugins] = useState<AvailableRolePlugin[]>([])
  const [pluginDropdownOpen, setPluginDropdownOpen] = useState(false)
  const [switchingPlugin, setSwitchingPlugin] = useState(false)

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

  // Reset browse mode and close dropdown when agent changes
  useEffect(() => { setBrowsePath(null); setPluginDropdownOpen(false) }, [agentId])

  // Close dropdown on outside click
  const dropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pluginDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPluginDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pluginDropdownOpen])

  // Fetch available role plugins when dropdown opens
  useEffect(() => {
    if (!pluginDropdownOpen) return
    let cancelled = false
    fetch('/api/agents/role-plugins')
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.plugins) setAvailablePlugins(data.plugins)
      })
      .catch((err) => { console.error('[AgentProfilePanel] Failed to load role plugins:', err) })
    return () => { cancelled = true }
  }, [pluginDropdownOpen])

  // Switch role plugin: uninstall old → install new → restart agent session
  const handleSwitchPlugin = useCallback(async (newPluginName: string) => {
    if (!config?.workingDirectory || !agentId || switchingPlugin) return
    const currentPlugin = config.rolePlugin?.name
    if (currentPlugin === newPluginName) { setPluginDropdownOpen(false); return }

    setSwitchingPlugin(true)
    setPluginDropdownOpen(false)
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

      // 2. Install new plugin
      const installRes = await fetch('/api/agents/role-plugins/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginName: newPluginName, agentDir }),
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
    } catch (err) {
      console.error('[RolePluginSelector] Switch failed:', err)
    } finally {
      setSwitchingPlugin(false)
    }
  }, [config, agentId, agentName, switchingPlugin, sessionStatus])

  if (!agentId) {
    return (
      <div className="flex w-[420px] flex-shrink-0 items-center justify-center bg-gray-900 border-l border-gray-800" style={{ overscrollBehavior: 'contain' }}>
        <p className="text-sm text-gray-600 italic">Select an agent to inspect</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-[420px] flex-shrink-0 bg-gray-900 border-l border-gray-800 overflow-hidden" style={{ overscrollBehavior: 'contain' }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-800">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-200 truncate">
            {agentName || 'Profile'}
          </h2>
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
          {/* Role Plugin quick-selector */}
          <div className="px-4 pt-3 pb-2" ref={dropdownRef}>
            <div
              onClick={() => setPluginDropdownOpen(!pluginDropdownOpen)}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors
                border ${config?.rolePlugin ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-gray-700/40 bg-gray-800/30'}
                hover:bg-emerald-500/10
              `}
            >
              <Shield className={`w-4 h-4 flex-shrink-0 ${config?.rolePlugin ? 'text-emerald-400' : 'text-gray-600'}`} />
              <span className={`text-xs font-medium flex-1 truncate ${config?.rolePlugin ? 'text-emerald-300' : 'text-gray-500 italic'}`}>
                {switchingPlugin ? 'Switching…' : (config?.rolePlugin?.name || 'No Role Plugin')}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${pluginDropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {pluginDropdownOpen && (
              <div
                className="absolute z-30 left-4 right-4 mt-1 max-h-52 overflow-y-auto rounded-lg border shadow-xl"
                style={{
                  backgroundColor: '#0c1a14',
                  borderColor: 'rgba(16,185,129,0.3)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 12px rgba(16,185,129,0.15)',
                }}
              >
                {availablePlugins.length === 0 ? (
                  <div className="px-4 py-3 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-emerald-400/50 animate-spin" />
                    <span className="text-xs text-emerald-400/50">Loading plugins…</span>
                  </div>
                ) : (
                  availablePlugins.map(p => {
                    const isCurrent = config?.rolePlugin?.name === p.name
                    return (
                      <button
                        key={p.name}
                        onClick={() => handleSwitchPlugin(p.name)}
                        className={`w-full flex items-start gap-2.5 px-4 py-2.5 text-left transition-colors ${
                          isCurrent
                            ? 'bg-emerald-500/15 cursor-default'
                            : 'hover:bg-emerald-500/10 cursor-pointer'
                        }`}
                      >
                        <Puzzle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isCurrent ? 'text-emerald-300' : 'text-emerald-400/50'}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-medium truncate ${isCurrent ? 'text-emerald-200' : 'text-gray-300'}`}>
                            {p.name}
                            {isCurrent && <span className="ml-1.5 text-[9px] text-emerald-400/70">(current)</span>}
                          </div>
                          {p.description && (
                            <p className="text-[10px] text-gray-500 leading-snug mt-0.5 line-clamp-2">{p.description}</p>
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
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
          />
        </div>
      )}
    </div>
  )
}
