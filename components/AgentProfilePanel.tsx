'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Settings,
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
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useAgentLocalConfig } from '@/hooks/useAgentLocalConfig'
import type { AgentLocalConfig } from '@/types/agent-local-config'
import { type TabId, type TabDef, type AgentInfo, type AvailableRolePlugin } from './agent-profile/shared'
import TabContent from './agent-profile/TabContent'
import FolderBrowser from './agent-profile/FolderBrowser'

// Lazy-load AgentProfile — only mounted when Overview tab is active
const AgentProfile = dynamic(() => import('@/components/AgentProfile'), { ssr: false })

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS: TabDef[] = [
  { id: 'settings', label: 'Settings', icon: Settings, colorClass: 'text-gray-400' },
  { id: 'role', label: 'Role', icon: Shield, colorClass: 'text-amber-400' },
  { id: 'plugins', label: 'Plugins', icon: Puzzle, colorClass: 'text-blue-400', countKey: 'plugins' },
  { id: 'skills', label: 'Skills', icon: Sparkles, colorClass: 'text-emerald-400', countKey: 'skills' },
  { id: 'agents', label: 'Agents', icon: Users, colorClass: 'text-cyan-400', countKey: 'agents' },
  { id: 'hooks', label: 'Hooks', icon: Webhook, colorClass: 'text-amber-400', countKey: 'hooks' },
  { id: 'rules', label: 'Rules', icon: ScrollText, colorClass: 'text-gray-400', countKey: 'rules' },
  { id: 'commands', label: 'Commands', icon: Terminal, colorClass: 'text-violet-400', countKey: 'commands' },
  { id: 'mcps', label: 'MCP', icon: Server, colorClass: 'text-purple-400', countKey: 'mcpServers' },
  { id: 'outputStyles', label: 'Styles', icon: Palette, colorClass: 'text-pink-400', countKey: 'outputStyles' },
]

// Tab grid layout: 3 rows of 3 + 1 bottom row
const TAB_ROWS: TabId[][] = [
  ['settings', 'role', 'plugins'],
  ['skills', 'agents', 'hooks'],
  ['rules', 'commands', 'mcps'],
  ['outputStyles'],    // single-item row, left-aligned
]

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

type TopTab = 'overview' | 'config'

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
  const [activeTab, setActiveTab] = useState<TabId>('settings')
  const [browsePath, setBrowsePath] = useState<string | null>(null)

  // Role Plugin selector state
  const [availablePlugins, setAvailablePlugins] = useState<AvailableRolePlugin[]>([])
  const [pluginDropdownOpen, setPluginDropdownOpen] = useState(false)
  const [switchingPlugin, setSwitchingPlugin] = useState(false)

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
        {(['overview', 'config'] as TopTab[]).map(t => (
          <div
            key={t}
            onClick={() => setTopTab(t)}
            className={`flex-1 text-center py-2 text-xs font-medium cursor-pointer transition-colors ${
              topTab === t
                ? 'text-gray-200 border-b-2 border-emerald-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'overview' ? 'Overview' : 'Config'}
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

          {/* Embedded AgentProfile */}
          <AgentProfile
            isOpen={true}
            onClose={() => {}}
            embedded={true}
            agentId={agentId}
            sessionStatus={sessionStatus}
            onStartSession={onStartSession}
            onDeleteAgent={onDeleteAgent}
            scrollToDangerZone={scrollToDangerZone}
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

          {/* Tab bar (3x3 grid) — hidden when browsing */}
          {!browsePath && <div className="px-3 py-2 border-b border-gray-800">
            {TAB_ROWS.map((row, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-3 gap-1 mb-1 last:mb-0">
                {row.map((tabId) => {
                  const tab = TABS.find(t => t.id === tabId)!
                  const Icon = tab.icon
                  const isActive = activeTab === tabId
                  const count = tab.countKey && config
                    ? (config[tab.countKey] as unknown[])?.length ?? 0
                    : null

                  return (
                    <div
                      key={tabId}
                      onClick={() => setActiveTab(tabId)}
                      className={`
                        flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-md cursor-pointer
                        text-[10px] font-medium transition-all duration-150
                        ${isActive
                          ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                          : 'bg-gray-800/40 border border-gray-700/30 text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                        }
                      `}
                    >
                      <Icon className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{tab.label}</span>
                      {count !== null && (
                        <span className={`
                          ml-auto text-[9px] px-1 py-0 rounded-full
                          ${isActive ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-700/60 text-gray-500'}
                        `}>
                          {count}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>}

          {/* Tab content — fills remaining space, scrollable — hidden when browsing */}
          {!browsePath && (
            <div className="flex-1 overflow-y-auto px-4 py-3" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
              {!config && !error && (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
                </div>
              )}
              {config && <TabContent tab={activeTab} config={config} agentId={agentId} agentInfo={agentInfo} onEditInHaephestos={onEditInHaephestos} onBrowse={setBrowsePath} onRefresh={refetch} />}
            </div>
          )}
        </>
      )}
    </div>
  )
}
