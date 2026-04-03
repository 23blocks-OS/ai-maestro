'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Wrench, CheckCircle, AlertTriangle, XCircle, Clock,
  Play, RefreshCw, ChevronDown, ChevronUp, X,
} from 'lucide-react'

type ToolStatus = 'installed' | 'outdated' | 'missing' | 'partial' | 'error'

interface ToolInfo {
  id: string
  name: string
  description: string
  status: ToolStatus
  scriptExists: boolean
}

interface RunResult {
  success: boolean
  toolId: string
  output?: string
  newStatus?: ToolStatus
  error?: string
}

const STATUS_CONFIG: Record<ToolStatus, { label: string; color: string; icon: typeof CheckCircle; pulse: boolean }> = {
  installed: { label: 'Installed', color: 'text-green-400', icon: CheckCircle, pulse: false },
  outdated:  { label: 'Outdated',  color: 'text-amber-400', icon: AlertTriangle, pulse: true },
  partial:   { label: 'Partial',   color: 'text-amber-400', icon: AlertTriangle, pulse: false },
  missing:   { label: 'Not installed', color: 'text-gray-500', icon: XCircle, pulse: false },
  error:     { label: 'Error',     color: 'text-red-400', icon: XCircle, pulse: false },
}

export default function HostToolsSection() {
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [resultId, setResultId] = useState<string | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [expandedOutput, setExpandedOutput] = useState(false)

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/host-tools')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setTools(data.tools)
    } catch {
      setTools([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTools() }, [fetchTools])

  const runTool = async (toolId: string) => {
    setConfirmId(null)
    setRunningId(toolId)
    setResultId(null)
    setResult(null)
    try {
      const res = await fetch('/api/settings/host-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId }),
      })
      const data: RunResult = await res.json()
      setResult(data)
      setResultId(toolId)
      // Update status in-place
      if (data.newStatus) {
        setTools(prev => prev.map(t => t.id === toolId ? { ...t, status: data.newStatus! } : t))
      }
    } catch (err) {
      setResult({ success: false, toolId, error: err instanceof Error ? err.message : 'Network error' })
      setResultId(toolId)
    } finally {
      setRunningId(null)
    }
  }

  const installedCount = tools.filter(t => t.status === 'installed').length
  const totalCount = tools.length

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-gray-400 py-8 justify-center">
        <RefreshCw className="w-5 h-5 animate-spin" />
        Checking tool status...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-700/50 rounded-lg">
            <Wrench className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Host Tools</h3>
            <p className="text-xs text-gray-500">
              {installedCount}/{totalCount} installed on this machine
            </p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchTools() }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Re-check
        </button>
      </div>

      {/* Tool cards */}
      <div className="grid gap-3">
        {tools.map(tool => {
          const cfg = STATUS_CONFIG[tool.status]
          const StatusIcon = cfg.icon
          const isRunning = runningId === tool.id
          const isConfirming = confirmId === tool.id
          const showResult = resultId === tool.id && result

          return (
            <div
              key={tool.id}
              className="p-4 bg-gray-800/50 border border-gray-700/50 rounded-xl hover:border-gray-600/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <h4 className="font-medium text-white text-sm">{tool.name}</h4>
                    <span className={`flex items-center gap-1 text-xs ${cfg.color}`}>
                      <StatusIcon className={`w-3.5 h-3.5 ${cfg.pulse ? 'animate-pulse' : ''}`} />
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{tool.description}</p>
                </div>

                {/* Right: action button */}
                <div className="flex-shrink-0">
                  {isRunning ? (
                    <span className="flex items-center gap-2 px-3 py-1.5 text-xs text-blue-300 bg-blue-900/30 border border-blue-500/30 rounded-lg">
                      <Clock className="w-3.5 h-3.5 animate-spin" />
                      Running...
                    </span>
                  ) : !tool.scriptExists ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 bg-red-900/20 border border-red-500/20 rounded-lg cursor-default" title="Install script not found in project directory">
                      <XCircle className="w-3.5 h-3.5" />
                      Script missing
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmId(tool.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors min-h-[32px]"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {tool.status === 'installed' ? 'Reinstall' : tool.status === 'outdated' ? 'Update' : 'Install'}
                    </button>
                  )}
                </div>
              </div>

              {/* Confirmation dialog (inline) */}
              {isConfirming && (
                <div className="mt-3 p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-200 mb-3">
                    {tools.find(t => t.id === tool.id)?.name}: Are you sure?
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    {getConfirmMessage(tool.id)}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => runTool(tool.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Result display */}
              {showResult && (
                <div className={`mt-3 p-3 rounded-lg border ${
                  result.success
                    ? 'bg-green-900/20 border-green-500/30'
                    : 'bg-red-900/20 border-red-500/30'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${result.success ? 'text-green-300' : 'text-red-300'}`}>
                      {result.success ? 'Completed successfully' : 'Failed'}
                    </span>
                    <div className="flex items-center gap-2">
                      {result.output && (
                        <button
                          onClick={() => setExpandedOutput(!expandedOutput)}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
                        >
                          {expandedOutput ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          Output
                        </button>
                      )}
                      <button
                        onClick={() => { setResultId(null); setResult(null) }}
                        className="text-gray-600 hover:text-gray-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {result.error && (
                    <pre className="text-xs text-red-400 mt-2 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                      {result.error}
                    </pre>
                  )}
                  {result.output && expandedOutput && (
                    <pre className="text-xs text-gray-400 mt-2 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto bg-gray-900/50 p-2 rounded">
                      {result.output}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Confirmation messages — kept here to avoid fetching from API */
const CONFIRM_MESSAGES: Record<string, string> = {
  hooks: 'This will install/update AI Maestro hooks in ~/.claude/settings.json. Existing AI Maestro hooks will be replaced. Other hooks are preserved.',
  tmux: 'This will append AI Maestro settings to ~/.tmux.conf. If the section already exists, nothing will change.',
  statusline: 'This will set the Claude Code status line to the AMP status line. If a status line is already configured, it will be replaced.',
  messaging: 'This will install/update AMP scripts and the AI Maestro plugin. Scripts in ~/.local/bin/ will be overwritten with the latest versions.',
  'agent-cli': 'This will install/update the aimaestro-agent CLI tool and its modules to ~/.local/bin/.',
  'doc-tools': 'This will install/update documentation tools to ~/.local/bin/.',
  'graph-tools': 'This will install/update code graph tools to ~/.local/bin/.',
  'memory-tools': 'This will install/update memory search tools to ~/.local/bin/.',
}

function getConfirmMessage(toolId: string): string {
  return CONFIRM_MESSAGES[toolId] || 'This will run the install script for this tool.'
}
