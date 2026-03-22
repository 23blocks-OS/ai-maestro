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
  Loader2,
  AlertCircle,
  FolderOpen,
  ExternalLink,
  XCircle,
  ChevronDown,
  ArrowLeft,
  Folder,
  FileCode,
  FileText,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useAgentLocalConfig } from '@/hooks/useAgentLocalConfig'
import type { AgentLocalConfig, LocalPlugin, RolePlugin as RolePluginType } from '@/types/agent-local-config'

// Lazy-load AgentProfile — only mounted when Overview tab is active
const AgentProfile = dynamic(() => import('@/components/AgentProfile'), { ssr: false })

// Available role plugin from the marketplace API
interface AvailableRolePlugin {
  name: string
  version: string
  description: string
  model?: string
  program?: string
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = 'settings' | 'role' | 'plugins' | 'skills' | 'agents' | 'hooks' | 'rules' | 'commands' | 'mcps'

interface TabDef {
  id: TabId
  label: string
  icon: typeof Settings
  colorClass: string
  countKey?: keyof AgentLocalConfig
}

const TABS: TabDef[] = [
  { id: 'settings', label: 'Settings', icon: Settings, colorClass: 'text-gray-400' },
  { id: 'role', label: 'Role', icon: Shield, colorClass: 'text-amber-400' },
  { id: 'plugins', label: 'Plugins', icon: Puzzle, colorClass: 'text-blue-400', countKey: 'plugins' },
  { id: 'skills', label: 'Skills', icon: Sparkles, colorClass: 'text-emerald-400', countKey: 'skills' },
  { id: 'agents', label: 'Agents', icon: Users, colorClass: 'text-cyan-400', countKey: 'agents' },
  { id: 'hooks', label: 'Hooks', icon: Webhook, colorClass: 'text-amber-400', countKey: 'hooks' },
  { id: 'rules', label: 'Rules', icon: ScrollText, colorClass: 'text-gray-400', countKey: 'rules' },
  { id: 'commands', label: 'Commands', icon: Terminal, colorClass: 'text-violet-400', countKey: 'commands' },
  { id: 'mcps', label: 'MCP Servers', icon: Server, colorClass: 'text-purple-400', countKey: 'mcpServers' },
]

// Tab grid layout: 3 rows x 3 columns
const TAB_ROWS: TabId[][] = [
  ['settings', 'role', 'plugins'],
  ['skills', 'agents', 'hooks'],
  ['rules', 'commands', 'mcps'],
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentInfo {
  name?: string
  title?: 'manager' | 'chief-of-staff' | 'member'
  program?: string
  model?: string
  programArgs?: string
  tags?: string[]
}

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
  const { config, error, loading } = useAgentLocalConfig(agentId)
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
      // Use a single consistent name for both the registry update and the claude
      // process start command so both operations reference the same agent identity.
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
      //    This preserves the tmux session, scrollback, and chat history
      if (sessionName) {
        // Send /exit to Claude Code (graceful shutdown)
        await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: '/exit', requireIdle: false }),
        }).catch((err) => { console.error('[RolePluginSelector] Failed to send /exit command:', err) })

        // Wait for Claude Code to exit and shell prompt to appear
        await new Promise(r => setTimeout(r, 3000))

        // Start new Claude Code process in the same tmux session with new --agent
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

      {/* Top-level tabs: Overview | Config */}
      <div className="flex border-b border-gray-800 flex-shrink-0">
        <button
          onClick={() => setTopTab('overview')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${
            topTab === 'overview'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/40'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/20'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          Overview
        </button>
        <button
          onClick={() => setTopTab('config')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${
            topTab === 'config'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/40'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/20'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Config
        </button>
      </div>

      {/* Overview tab — embedded AgentProfile with Role Plugin selector after Governance Title */}
      {topTab === 'overview' && (
        <div className="flex-1 flex flex-col min-h-0" style={{ opacity: switchingPlugin ? 0.4 : 1, pointerEvents: switchingPlugin ? 'none' : 'auto' }}>
          <AgentProfile
            isOpen={true}
            embedded={true}
            onClose={onClose || (() => {})}
            agentId={agentId}
            sessionStatus={sessionStatus}
            onStartSession={onStartSession}
            onDeleteAgent={onDeleteAgent}
            scrollToDangerZone={scrollToDangerZone}
            hostUrl={hostUrl}
            renderAfterGovernanceTitle={() => (
              <div
                ref={dropdownRef}
                className="relative py-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Puzzle className="w-4 h-4 text-emerald-400" />
                    <span>Role Plugin</span>
                  </div>
                  <button
                    onClick={() => !switchingPlugin && setPluginDropdownOpen(!pluginDropdownOpen)}
                    disabled={switchingPlugin}
                    className="flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all text-left"
                    style={{
                      backgroundColor: 'rgba(16,185,129,0.06)',
                      borderColor: switchingPlugin ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.3)',
                    }}
                  >
                    <span className="text-xs font-medium text-emerald-200 truncate max-w-[180px]">
                      {config?.rolePlugin?.name || '(none)'}
                    </span>
                    {switchingPlugin ? (
                      <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin flex-shrink-0" />
                    ) : (
                      <ChevronDown className={`w-3.5 h-3.5 text-emerald-400/60 flex-shrink-0 transition-transform ${pluginDropdownOpen ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </div>

                {/* Dropdown list of available role plugins */}
                {pluginDropdownOpen && !switchingPlugin && (
                  <div
                    className="absolute left-0 right-0 z-50 mt-1 rounded-lg border overflow-y-auto custom-scrollbar"
                    style={{
                      maxHeight: 240,
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
                                <div className="text-[10px] text-gray-500 truncate mt-0.5">{p.description}</div>
                              )}
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )}
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
              {config && <TabContent tab={activeTab} config={config} agentInfo={agentInfo} onEditInHaephestos={onEditInHaephestos} onBrowse={setBrowsePath} />}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab content renderer
// ---------------------------------------------------------------------------

function TabContent({
  tab,
  config,
  agentInfo,
  onEditInHaephestos,
  onBrowse,
}: {
  tab: TabId
  config: AgentLocalConfig
  agentInfo?: AgentInfo
  onEditInHaephestos?: (profilePath: string) => void
  onBrowse?: (path: string) => void
}) {
  switch (tab) {
    case 'settings': return <SettingsTab config={config} agentInfo={agentInfo} />
    case 'role': return <RoleTab config={config} onEditInHaephestos={onEditInHaephestos} onBrowse={onBrowse} />
    case 'plugins': return <PluginsTab config={config} />
    case 'skills': return <ListTab items={config.skills} emptyText="No skills installed" emptyHint="No skills detected from installed plugins or local config." renderItem={(s) => <ItemRow key={s.name} name={s.name} detail={s.description} sourcePlugin={s.sourcePlugin} />} />
    case 'agents': return <ListTab items={config.agents} emptyText="No subagents defined" emptyHint="No subagents detected from installed plugins or local config." renderItem={(a) => <ItemRow key={a.name} name={a.name} detail={a.description} sourcePlugin={a.sourcePlugin} />} />
    case 'hooks': return <ListTab items={config.hooks} emptyText="No hooks installed" emptyHint="No hooks detected from installed plugins or local config." renderItem={(h) => <ItemRow key={`${h.name}-${h.eventType}`} name={h.name} detail={h.eventType} sourcePlugin={h.sourcePlugin} />} />
    case 'rules': return <ListTab items={config.rules} emptyText="No rules installed" emptyHint="No rules detected from installed plugins or local config." renderItem={(r) => <ItemRow key={r.name} name={r.name} detail={r.preview} sourcePlugin={r.sourcePlugin} />} />
    case 'commands': return <ListTab items={config.commands} emptyText="No commands installed" emptyHint="No commands detected from installed plugins or local config." renderItem={(c) => <ItemRow key={c.name} name={c.name} detail={c.trigger} sourcePlugin={c.sourcePlugin} />} />
    case 'mcps': return <McpTab config={config} />
  }
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

const TITLE_LABELS: Record<string, string> = {
  manager: 'Manager',
  'chief-of-staff': 'Chief of Staff',
  member: 'Member',
}

function SettingsTab({ config, agentInfo }: { config: AgentLocalConfig; agentInfo?: AgentInfo }) {
  const settings = config.settings || {}
  const entries = Object.entries(settings).filter(([k]) =>
    k !== 'plugins' && k !== 'lspServers' && k !== 'agent'
  )

  return (
    <div className="space-y-4">
      {/* Identity section */}
      <div>
        <SectionLabel text="Identity" />
        <div className="rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2 space-y-0.5">
          <InfoRow label="Name" value={agentInfo?.name} />
          <InfoRow label="Title" value={agentInfo?.title ? TITLE_LABELS[agentInfo.title] : undefined} />
          <InfoRow label="Role" value={config.rolePlugin?.name} />
          <InfoRow label="Working Dir" value={config.workingDirectory} />
        </div>
      </div>

      {/* Runtime section */}
      <div>
        <SectionLabel text="Runtime" />
        <div className="rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2 space-y-0.5">
          <InfoRow label="Program" value={agentInfo?.program || 'claude'} />
          <InfoRow label="Model" value={agentInfo?.model} />
          {agentInfo?.programArgs && <InfoRow label="Args" value={agentInfo.programArgs} />}
        </div>
      </div>

      {/* Tags */}
      {agentInfo?.tags && agentInfo.tags.length > 0 && (
        <div>
          <SectionLabel text="Tags" />
          <div className="flex flex-wrap gap-1">
            {agentInfo.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-cyan-300/80 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* LSP Servers */}
      {config.lspServers.length > 0 && (
        <div>
          <SectionLabel text="LSP Servers" />
          <div className="space-y-1.5">
            {config.lspServers.map((lsp) => (
              <ItemRow key={lsp.name} name={lsp.name} detail={`${lsp.command} (${lsp.languages.join(', ')})`} sourcePlugin={lsp.sourcePlugin} />
            ))}
          </div>
        </div>
      )}

      {/* Advanced: raw settings (collapsed) */}
      {entries.length > 0 && (
        <details className="mt-2">
          <summary className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 cursor-pointer hover:text-gray-400 transition-colors">
            Advanced Settings
          </summary>
          <div className="mt-2 space-y-1">
            {entries.map(([key, value]) => (
              <InfoRow key={key} label={key} value={typeof value === 'string' ? value : JSON.stringify(value)} />
            ))}
          </div>
        </details>
      )}

      <div className="pt-2 border-t border-gray-800/50">
        <InfoRow label="Last Scan" value={new Date(config.lastScanned).toLocaleTimeString()} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Role tab
// ---------------------------------------------------------------------------

function RoleTab({
  config,
  onEditInHaephestos,
  onBrowse,
}: {
  config: AgentLocalConfig
  onEditInHaephestos?: (profilePath: string) => void
  onBrowse?: (path: string) => void
}) {
  const [availablePlugins, setAvailablePlugins] = useState<{ name: string; description: string }[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [switching, setSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch available Role Plugins from ~/agents/role-plugins/
  const loadPlugins = useCallback(() => {
    fetch('/api/agents/role-plugins')
      .then(r => r.ok ? r.json() : { plugins: [] })
      .then(d => setAvailablePlugins(d.plugins || []))
      .catch((err) => { console.error('[RoleTab] Failed to load plugins:', err) })
  }, [])

  // loadPlugins is memoized with useCallback([]) so its reference is stable;
  // including it in the dependency array satisfies the linter without causing re-runs.
  useEffect(() => { loadPlugins() }, [loadPlugins])

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!showDropdown) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showDropdown])

  const handleSwitch = async (pluginName: string) => {
    if (pluginName === config.rolePlugin?.name) { setShowDropdown(false); return }
    setSwitching(true)
    try {
      // Uninstall current, install new
      if (config.rolePlugin) {
        await fetch('/api/agents/role-plugins/install', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pluginName: config.rolePlugin.name, agentDir: config.workingDirectory }),
        })
      }
      await fetch('/api/agents/role-plugins/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginName, agentDir: config.workingDirectory }),
      })
    } catch (err) {
      console.error('[RoleTab] Failed to switch role plugin:', err)
    }
    setSwitching(false)
    setShowDropdown(false)
  }

  // Role Plugin selector (always shown at top)
  const selectorEl = (
    <div className="mb-3">
      <SectionLabel text="Role Plugin" />
      <div className="relative" ref={dropdownRef}>
        <div
          onClick={() => setShowDropdown(!showDropdown)}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors
            border ${config.rolePlugin ? 'border-amber-500/30 bg-amber-500/5' : 'border-gray-700/40 bg-gray-800/30'}
            hover:bg-amber-500/10
          `}
        >
          <Shield className={`w-4 h-4 flex-shrink-0 ${config.rolePlugin ? 'text-amber-400' : 'text-gray-600'}`} />
          <span className={`text-xs font-medium flex-1 truncate ${config.rolePlugin ? 'text-amber-300' : 'text-gray-500 italic'}`}>
            {switching ? 'Switching…' : (config.rolePlugin?.name || 'None — select a Role Plugin')}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
        </div>

        {showDropdown && availablePlugins.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
            {availablePlugins.map((rp) => (
              <div
                key={rp.name}
                onClick={() => handleSwitch(rp.name)}
                className={`
                  px-3 py-2 cursor-pointer transition-colors text-xs
                  ${rp.name === config.rolePlugin?.name
                    ? 'bg-amber-500/10 text-amber-300 font-medium'
                    : 'text-gray-300 hover:bg-gray-800'
                  }
                `}
              >
                <p className="truncate">{rp.name}</p>
                {rp.description && (
                  <p className="text-[10px] text-gray-500 truncate mt-0.5">{rp.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (!config.rolePlugin) {
    return (
      <div className="space-y-4">
        {selectorEl}
        <div className="text-center py-4">
          <p className="text-[10px] text-gray-600 mb-4 px-4 leading-relaxed">
            A Role-Plugin defines the agent&apos;s specialization (Architect, Programmer, etc.)
            and bundles skills, hooks, and rules for that role.
          </p>
          {onEditInHaephestos && (
            <div
              onClick={() => onEditInHaephestos('')}
              className="
                inline-flex items-center gap-1.5 px-3 py-1.5
                rounded-md bg-amber-500/10 border border-amber-500/20
                text-[11px] text-amber-400 font-medium cursor-pointer
                hover:bg-amber-500/20 transition-colors duration-150
              "
            >
              <Sparkles className="w-3 h-3" />
              Create new with Haephestos
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {selectorEl}

      {/* Current Role Plugin details */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-gray-500">Main Agent:</span>
          <span className="text-[10px] text-gray-400">{config.rolePlugin.mainAgentName}</span>
          {onBrowse && config.rolePlugin?.profilePath && (
            <span
              className="ml-auto"
              title="Browse Role-Plugin contents"
              onClick={() => {
                // profilePath is the .agent.toml file — browse its parent directory
                const dir = config.rolePlugin!.profilePath.replace(/\/[^/]+$/, '')
                onBrowse(dir)
              }}
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400/60 cursor-pointer hover:text-amber-300 transition-colors" />
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-600 truncate">{config.rolePlugin.profilePath}</p>

        {onEditInHaephestos && (
          <div
            onClick={() => onEditInHaephestos(config.rolePlugin!.profilePath)}
            title="Opens Haephestos to edit this Persona's Role-Plugin."
            className="
              mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5
              rounded-md bg-amber-500/10 border border-amber-500/20
              text-[11px] text-amber-400 font-medium cursor-pointer
              hover:bg-amber-500/20 transition-colors duration-150
            "
          >
            <ExternalLink className="w-3 h-3" />
            Edit in Haephestos
          </div>
        )}
      </div>

      {/* Global dependencies from .agent.toml */}
      {config.globalDependencies && (
        <div>
          <SectionLabel text="Global Dependencies (read-only)" />
          <div className="space-y-2 opacity-60">
            {renderDepsArray('Plugins', config.globalDependencies.plugins)}
            {renderDepsArray('Skills', config.globalDependencies.skills)}
            {renderDepsArray('MCP Servers', config.globalDependencies.mcpServers)}
            {renderDepsArray('Scripts', config.globalDependencies.scripts)}
            {renderDepsArray('Hooks', config.globalDependencies.hooks)}
            {renderDepsArray('Tools', config.globalDependencies.tools)}
          </div>
        </div>
      )}
    </div>
  )
}

function renderDepsArray(label: string, items: string[]) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-[10px] text-gray-500 font-medium mb-0.5">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className="text-[10px] text-gray-400 bg-gray-800/60 border border-gray-700/40 rounded px-1.5 py-0.5"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Folder browser (internal page — replaces tabs when active)
// ---------------------------------------------------------------------------

interface DirEntry {
  name: string
  type: 'file' | 'dir'
  size: number
}

function FolderBrowser({ initialPath, onBack }: { initialPath: string; onBack: () => void }) {
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<{ name: string; content: string } | null>(null)

  const loadDir = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    setFileContent(null)
    try {
      const res = await fetch(`/api/agents/browse-dir?path=${encodeURIComponent(path)}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to load directory' }))
        setError(data.error || `HTTP ${res.status}`)
        setEntries([])
      } else {
        const data = await res.json()
        setEntries(data.entries || [])
        setCurrentPath(data.path || path)
      }
    } catch {
      setError('Network error')
      setEntries([])
    }
    setLoading(false)
  }, [])

  // Load directory on mount (key={browsePath} forces remount on path change)
  useEffect(() => {
    loadDir(initialPath)
  }, [initialPath, loadDir])

  const navigateTo = (dirName: string) => {
    loadDir(`${currentPath}/${dirName}`)
  }

  const navigateUp = () => {
    // Don't navigate above the initial browse root
    if (currentPath === initialPath) return
    const parent = currentPath.replace(/\/[^/]+$/, '')
    if (parent && parent !== currentPath) {
      loadDir(parent)
    }
  }

  const viewFile = async (fileName: string) => {
    const filePath = `${currentPath}/${fileName}`
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/agents/browse-dir?path=${encodeURIComponent(filePath)}&mode=file`)
      const data = await res.json()
      if (data.content !== undefined) {
        setFileContent({ name: fileName, content: data.content })
      } else {
        setFileContent({ name: fileName, content: data.error || '(Unable to read file)' })
      }
    } catch {
      setFileContent({ name: fileName, content: '(Failed to load file)' })
    }
    setLoading(false)
  }

  // Shorten path for display
  const displayPath = currentPath.replace(/^\/Users\/[^/]+/, '~')
  // Show ".." entry only when we've navigated deeper than the root
  const canGoUp = currentPath !== initialPath

  // File content view
  if (fileContent) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 bg-gray-900/80">
          <div
            onClick={() => setFileContent(null)}
            className="p-1 rounded-md cursor-pointer hover:bg-gray-700/60 transition-colors"
            title="Back to folder"
          >
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </div>
          <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-xs text-gray-300 truncate font-medium">{fileContent.name}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ overscrollBehavior: 'contain' }}>
          <pre className="text-[11px] text-gray-400 whitespace-pre-wrap break-all font-mono leading-relaxed">{fileContent.content}</pre>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Browser header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 bg-gray-900/80">
        <div
          onClick={onBack}
          className="p-1 rounded-md cursor-pointer hover:bg-gray-700/60 transition-colors"
          title="Back to profile tabs"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </div>
        <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="text-[11px] text-gray-400 truncate flex-1" title={currentPath}>
          {displayPath}
        </span>
        {loading && <Loader2 className="w-3 h-3 text-gray-500 animate-spin flex-shrink-0" />}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-[11px] text-red-400 truncate">{error}</span>
        </div>
      )}

      {/* Directory listing */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
        {/* Parent directory entry */}
        {canGoUp && (
          <div
            onClick={navigateUp}
            className="flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-gray-800/50 transition-colors border-b border-gray-800/50"
          >
            <Folder className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span className="text-xs text-gray-400">..</span>
          </div>
        )}

        {!loading && entries.length === 0 && !error && (
          <div className="flex items-center justify-center h-20">
            <span className="text-[11px] text-gray-600 italic">Empty directory</span>
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.name}
            onClick={() => entry.type === 'dir' ? navigateTo(entry.name) : viewFile(entry.name)}
            className="flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-gray-800/50 transition-colors border-b border-gray-800/50"
          >
            {entry.type === 'dir' ? (
              <Folder className="w-3.5 h-3.5 text-amber-400/70 flex-shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            )}
            <span className={`text-xs truncate flex-1 ${entry.type === 'dir' ? 'text-amber-300/80' : 'text-gray-300'}`}>
              {entry.name}
            </span>
            {entry.type === 'file' && entry.size > 0 && (
              <span className="text-[10px] text-gray-600 flex-shrink-0">
                {entry.size < 1024 ? `${entry.size}B` : `${(entry.size / 1024).toFixed(1)}K`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MCP tab (shows servers + args)
// ---------------------------------------------------------------------------

function McpTab({ config }: { config: AgentLocalConfig }) {
  if (config.mcpServers.length === 0) {
    return <EmptyState text="No MCP servers configured" hint="No MCP servers detected from installed plugins or local config." />
  }

  return (
    <div className="space-y-2">
      {config.mcpServers.map((mcp) => (
        <div
          key={mcp.name}
          className="px-2.5 py-2 rounded-lg border border-purple-500/20 bg-purple-500/5"
        >
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-purple-300 truncate flex-1">{mcp.name}</p>
            {mcp.sourcePlugin && (
              <span className="text-[9px] text-blue-400/70 bg-blue-500/10 border border-blue-500/15 rounded px-1.5 py-0.5 flex-shrink-0 truncate max-w-[120px]">
                plugin: {mcp.sourcePlugin}
              </span>
            )}
          </div>
          {mcp.command && (
            <p className="text-[10px] text-gray-500 truncate mt-0.5">
              {mcp.command} {mcp.args?.join(' ')}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plugins tab (shows non-Role plugins, flags conflicting Role Plugins)
// ---------------------------------------------------------------------------

function PluginsTab({ config }: { config: AgentLocalConfig }) {
  const [confirmUninstall, setConfirmUninstall] = useState<LocalPlugin | null>(null)
  const [uninstalling, setUninstalling] = useState(false)

  const handleUninstall = async (plugin: LocalPlugin) => {
    setUninstalling(true)
    try {
      // Extract the marketplace name from the plugin key ("name@marketplace") so that
      // the correct pluginKey is removed from settings — without this, plugins installed
      // from a non-default marketplace would not be uninstalled correctly.
      const marketplaceName = plugin.key?.includes('@') ? plugin.key.split('@').slice(1).join('@') : undefined
      const res = await fetch('/api/agents/role-plugins/install', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginName: plugin.name,
          agentDir: config.workingDirectory,
          ...(marketplaceName !== undefined && { marketplaceName }),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Uninstall failed' }))
        console.error('[PluginsTab] Uninstall failed:', err.error)
      }
    } catch (err) {
      console.error('[PluginsTab] Uninstall request failed:', err)
    }
    setUninstalling(false)
    setConfirmUninstall(null)
  }

  if (config.plugins.length === 0) {
    return <EmptyState text="No plugins installed" hint="No non-Role plugins detected in local config. Role Plugin shown in Role tab." />
  }

  return (
    <div className="space-y-1.5">
      {config.plugins.map((p) => (
        <div
          key={p.name}
          className={`px-2.5 py-2 rounded-lg border ${
            p.isConflictingRolePlugin
              ? 'border-red-500/40 bg-red-500/10'
              : 'border-gray-700/30 bg-gray-800/20'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${p.isConflictingRolePlugin ? 'text-red-300' : 'text-gray-200'}`}>
                {p.name}
              </p>
              {p.isConflictingRolePlugin && (
                <p className="text-[10px] text-red-400/80 mt-0.5">
                  Conflicting Role Plugin — only one is allowed per agent
                </p>
              )}
              {!p.isConflictingRolePlugin && p.description && (
                <p className="text-[10px] text-gray-500 leading-snug mt-0.5 line-clamp-2">{p.description}</p>
              )}
            </div>
            <div
              onClick={() => setConfirmUninstall(p)}
              className={`flex-shrink-0 p-1 rounded-md cursor-pointer transition-colors ${
                p.isConflictingRolePlugin
                  ? 'hover:bg-red-500/20'
                  : 'hover:bg-gray-700/60'
              }`}
              title="Uninstall this plugin"
            >
              <XCircle className={`w-4 h-4 ${p.isConflictingRolePlugin ? 'text-red-400' : 'text-gray-500 hover:text-gray-300'}`} />
            </div>
          </div>
        </div>
      ))}

      {/* Uninstall confirmation dialog */}
      {confirmUninstall && (
        <div className={`mt-3 px-3 py-3 rounded-lg border ${
          confirmUninstall.isConflictingRolePlugin
            ? 'border-red-500/30 bg-red-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}>
          <p className={`text-xs mb-3 ${confirmUninstall.isConflictingRolePlugin ? 'text-red-300' : 'text-amber-300'}`}>
            Do you want to uninstall <span className="font-semibold">{confirmUninstall.name}</span>?
            {!confirmUninstall.isConflictingRolePlugin && (
              <span className="block mt-1 text-[10px] opacity-80">
                All elements bundled in this plugin will also be removed.
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleUninstall(confirmUninstall)}
              disabled={uninstalling}
              className={`flex-1 px-3 py-1.5 rounded-md disabled:opacity-50 text-white text-xs font-medium transition-colors ${
                confirmUninstall.isConflictingRolePlugin
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-amber-600 hover:bg-amber-500'
              }`}
            >
              {uninstalling ? 'Uninstalling…' : 'Yes'}
            </button>
            <button
              onClick={() => setConfirmUninstall(null)}
              disabled={uninstalling}
              className="flex-1 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-xs font-medium transition-colors"
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generic list tab
// ---------------------------------------------------------------------------

function ListTab<T>({
  items,
  emptyText,
  emptyHint,
  renderItem,
}: {
  items: T[]
  emptyText: string
  emptyHint?: string
  renderItem: (item: T) => React.ReactNode
}) {
  if (items.length === 0) {
    return <EmptyState text={emptyText} hint={emptyHint} />
  }
  return <div className="space-y-1.5">{items.map(renderItem)}</div>
}

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------

function ItemRow({ name, detail, sourcePlugin }: { name: string; detail?: string; sourcePlugin?: string }) {
  return (
    <div className="px-2.5 py-2 rounded-lg border border-gray-700/30 bg-gray-800/20">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium text-gray-200 truncate flex-1">{name}</p>
        {sourcePlugin && (
          <span className="text-[9px] text-blue-400/70 bg-blue-500/10 border border-blue-500/15 rounded px-1.5 py-0.5 flex-shrink-0 truncate max-w-[120px]">
            plugin: {sourcePlugin}
          </span>
        )}
      </div>
      {detail && (
        <p className="text-[10px] text-gray-500 leading-snug mt-0.5 line-clamp-2">{detail}</p>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[11px] text-gray-500 w-20 flex-shrink-0">{label}</span>
      {value ? (
        <span className="text-xs text-gray-200 truncate">{value}</span>
      ) : (
        <span className="text-xs text-gray-600 italic">(none)</span>
      )}
    </div>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{text}</p>
  )
}

function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-24 gap-1">
      <p className="text-[11px] text-gray-600 italic">{text}</p>
      {hint && (
        <p className="text-[10px] text-gray-700 text-center px-4 leading-relaxed">{hint}</p>
      )}
    </div>
  )
}
