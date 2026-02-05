'use client'

import { useState, useEffect, useRef } from 'react'
import { useAgents } from '@/hooks/useAgents'
import type { UnifiedAgent } from '@/types/agent'

// Import xterm CSS
import '@xterm/xterm/css/xterm.css'

export default function ImmersivePage() {
  const terminalRef = useRef<HTMLDivElement>(null)
  const { agents, onlineAgents, loading } = useAgents()
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [showAgentDialog, setShowAgentDialog] = useState(false)
  const terminalInstanceRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Get the active agent
  const activeAgent = agents.find(a => a.id === activeAgentId)

  // Get the tmux session name for WebSocket connection
  const tmuxSessionName = activeAgent?.session?.tmuxSessionName

  // Read agent from URL parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const agentParam = params.get('agent') || params.get('session') // Support both for backward compatibility
    if (agentParam) {
      const decodedAgent = decodeURIComponent(agentParam)
      // Try to find by ID first, then by tmux session name
      const agent = agents.find(a => a.id === decodedAgent || a.session?.tmuxSessionName === decodedAgent)
      if (agent) {
        setActiveAgentId(agent.id)
      } else {
        // If not found yet, store the param and try again when agents load
        setActiveAgentId(decodedAgent)
      }
    }
  }, [agents])

  // Auto-select first online agent if none selected
  useEffect(() => {
    if (onlineAgents.length > 0 && !activeAgentId) {
      setActiveAgentId(onlineAgents[0].id)
    }
  }, [onlineAgents, activeAgentId])

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || !tmuxSessionName) return

    let term: any
    let fitAddon: any
    let webglAddon: any
    let resizeObserver: ResizeObserver | null = null
    let inputDisposable: any
    let mounted = true

    const initTerminal = async () => {
      // Dynamically import xterm modules (client-side only)
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')

      if (!mounted || !terminalRef.current) return

      // Create terminal instance
      term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: '"SF Mono", "Monaco", "Cascadia Code", "Roboto Mono", "Courier New", monospace',
        theme: {
          background: '#1a1b26',
          foreground: '#a9b1d6',
          cursor: '#c0caf5',
          selectionBackground: '#3a3d41',
          selectionForeground: '#ffffff',
          selectionInactiveBackground: '#3a3d41',
        },
        scrollback: 10000,
        convertEol: false,
        screenReaderMode: false,
        macOptionIsMeta: true,
        rightClickSelectsWord: true,
      })

      // Add addons
      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())

      // Load clipboard addon for OSC 52 support
      try {
        const { ClipboardAddon } = await import('@xterm/addon-clipboard')
        term.loadAddon(new ClipboardAddon())
      } catch (e) {
        console.warn('[Immersive] ClipboardAddon not available:', e)
      }

      // Open terminal
      term.open(terminalRef.current!)
      fitAddon.fit()

      // Load WebGL renderer inline (same pattern as useTerminal hook)
      try {
        const { WebglAddon } = await import('@xterm/addon-webgl')
        webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          console.warn('[Immersive] WebGL context lost, falling back to canvas')
          try { webglAddon.dispose() } catch { /* ignore */ }
          webglAddon = null
          if (term) term.refresh(0, term.rows - 1)
        })
        term.loadAddon(webglAddon)
      } catch (e) {
        console.log('[Immersive] Using canvas renderer')
      }

      terminalInstanceRef.current = term
      fitAddonRef.current = fitAddon

      // ResizeObserver instead of window resize event (handles container size changes too)
      const debouncedFit = (() => {
        let timer: ReturnType<typeof setTimeout> | null = null
        return () => {
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => {
            if (fitAddon && term) {
              try {
                fitAddon.fit()
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({
                    type: 'resize',
                    cols: term.cols,
                    rows: term.rows
                  }))
                }
              } catch (e) {
                console.warn('[Immersive] Fit failed during resize:', e)
              }
            }
          }, 150)
        }
      })()

      resizeObserver = new ResizeObserver(() => debouncedFit())
      resizeObserver.observe(terminalRef.current!)

      // Connect WebSocket using tmux session name
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      let wsUrl = `${protocol}//${window.location.host}/term?name=${encodeURIComponent(tmuxSessionName)}`
      if (activeAgent?.hostId && activeAgent.hostId !== 'local') {
        wsUrl += `&host=${encodeURIComponent(activeAgent.hostId)}`
      }
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        // Send initial resize
        ws.send(JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows
        }))
      }

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.type === 'history-complete') {
            // Wait for xterm.js to finish processing history, then scroll and focus
            setTimeout(() => {
              fitAddon.fit()
              const resizeMsg = JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })
              if (ws.readyState === WebSocket.OPEN) ws.send(resizeMsg)
              setTimeout(() => {
                term.scrollToBottom()
                term.focus()
              }, 50)
            }, 100)
            return
          }
          if (parsed.type === 'error' || parsed.type === 'status' || parsed.type === 'connected') {
            return
          }
        } catch {
          // Not JSON - raw terminal data
        }
        term.write(event.data)
      }

      ws.onerror = (error) => {
        console.error('[Immersive] WebSocket error:', error)
      }

      ws.onclose = () => {}

      // Handle terminal input
      inputDisposable = term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      })
    }

    initTerminal()

    // Cleanup on unmount or session change
    return () => {
      mounted = false
      if (resizeObserver) resizeObserver.disconnect()
      if (inputDisposable) inputDisposable.dispose()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (webglAddon) {
        try { webglAddon.dispose() } catch { /* ignore */ }
      }
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose()
        terminalInstanceRef.current = null
      }
      fitAddonRef.current = null
    }
  }, [tmuxSessionName])

  // Show agent dialog if no active agent
  useEffect(() => {
    if (onlineAgents.length > 0 && !activeAgentId) {
      setShowAgentDialog(true)
    }
  }, [onlineAgents, activeAgentId])

  // Get display name for an agent
  const getAgentDisplayName = (agent: UnifiedAgent) => {
    return agent.label || agent.name || agent.alias || agent.id
  }

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col">
      {/* Minimal Header */}
      <header className="bg-gray-950 border-b border-gray-800 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            ← Back to Dashboard
          </a>
          <span className="text-sm text-gray-500">|</span>
          <span className="text-sm text-white">
            {activeAgent ? `Agent: ${getAgentDisplayName(activeAgent)}` : 'No Agent'}
          </span>
          {activeAgent?.session?.status === 'online' && (
            <span className="w-2 h-2 rounded-full bg-green-500" title="Online" />
          )}
        </div>
        <button
          onClick={() => setShowAgentDialog(true)}
          className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Switch Agent
        </button>
      </header>

      {/* Terminal Container */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={terminalRef}
          className="absolute inset-0"
        />
        {!tmuxSessionName && activeAgentId && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
            <div className="text-center text-gray-400">
              <p className="text-lg mb-2">Agent is offline</p>
              <p className="text-sm">Start the agent&apos;s tmux session to connect</p>
            </div>
          </div>
        )}
      </div>

      {/* Agent Selection Dialog */}
      {showAgentDialog && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
          onClick={() => setShowAgentDialog(false)}
        >
          <div
            className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-white mb-4">Select Agent</h2>

            {loading ? (
              <div className="text-center py-8">
                <p className="text-gray-400">Loading agents...</p>
              </div>
            ) : onlineAgents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">No online agents found</p>
                <p className="text-sm text-gray-500">
                  Start an agent&apos;s tmux session to connect
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {onlineAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      setActiveAgentId(agent.id)
                      setShowAgentDialog(false)
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      agent.id === activeAgentId
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{getAgentDisplayName(agent)}</div>
                        {agent.taskDescription && (
                          <div className="text-sm opacity-70 truncate">{agent.taskDescription}</div>
                        )}
                      </div>
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowAgentDialog(false)}
              className="mt-4 w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
