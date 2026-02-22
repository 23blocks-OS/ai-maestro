'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAgents } from '@/hooks/useAgents'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, UserCircle, Volume2, VolumeX, WifiOff,
  PhoneOff, Settings, ExternalLink, Send, RotateCcw,
} from 'lucide-react'
import Link from 'next/link'
import type { Agent } from '@/types/agent'
import { useTTS } from '@/hooks/useTTS'
import { useCompanionWebSocket } from '@/hooks/useCompanionWebSocket'
import type { TTSConfig, TTSVoice } from '@/types/tts'
import { matchVoiceCommand, type VoiceCommandMatch } from '@/lib/voice-commands'

import '@xterm/xterm/css/xterm.css'

// Activity states for the avatar
type ActivityState = 'idle' | 'active' | 'thinking' | 'offline'

// Border glow colors per state
const BORDER_GLOW: Record<ActivityState, string> = {
  idle: 'shadow-[0_0_30px_rgba(59,130,246,0.15)]',
  active: 'shadow-[0_0_60px_rgba(59,130,246,0.3)]',
  thinking: 'shadow-[0_0_40px_rgba(245,158,11,0.25)]',
  offline: '',
}

function CompanionContent() {
  const searchParams = useSearchParams()
  const agentParam = searchParams.get('agent')
  const { agents, onlineAgents, loading } = useAgents()

  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [showAgentDialog, setShowAgentDialog] = useState(false)
  const [activityState, setActivityState] = useState<ActivityState>('offline')
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)

  // Terminal refs
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstanceRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Popup detection
  const isPopup = searchParams.get('popup') === '1'

  // Activity tracking refs
  const lastOutputRef = useRef<number>(0)
  const lastInputRef = useRef<number>(0)
  const activityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // TTS voice system (pure speech player, server handles summarization)
  const tts = useTTS({
    agentId: activeAgentId || '',
  })

  // Companion WebSocket - receives speech events, sends user messages
  const { send: sendToCompanion } = useCompanionWebSocket({
    agentId: activeAgentId,
    onSpeech: (text) => tts.speak(text),
  })

  // Forward user messages to voice subsystem for conversation context
  const handleMessageSent = useCallback((text: string) => {
    sendToCompanion({ type: 'user_message', text })
  }, [sendToCompanion])

  // Repeat last spoken message
  const handleRepeat = useCallback(() => {
    sendToCompanion({ type: 'repeat' })
  }, [sendToCompanion])

  // Handle intercepted voice commands from CompanionInput
  const handleCommandMatched = useCallback((match: VoiceCommandMatch) => {
    switch (match.command.action) {
      case 'repeat':
        handleRepeat()
        break
      case 'stop':
        tts.stop()
        break
      case 'mute':
        if (!tts.isMuted) {
          tts.stop()
          tts.toggleMute()
        }
        break
      case 'unmute':
        if (tts.isMuted) {
          tts.toggleMute()
        }
        break
      case 'louder':
        tts.setConfig({ volume: Math.min(1.0, tts.config.volume + 0.2) })
        break
      case 'quieter':
        tts.setConfig({ volume: Math.max(0.1, tts.config.volume - 0.2) })
        break
      case 'faster':
        tts.setConfig({ rate: Math.min(2.0, tts.config.rate + 0.2) })
        break
      case 'slower':
        tts.setConfig({ rate: Math.max(0.5, tts.config.rate - 0.2) })
        break
    }
  }, [handleRepeat, tts])

  // Find agent from URL param or selection
  useEffect(() => {
    if (agentParam) {
      const decoded = decodeURIComponent(agentParam)
      const agent = agents.find(a => a.id === decoded || a.session?.tmuxSessionName === decoded)
      if (agent) {
        setActiveAgentId(agent.id)
      } else if (!activeAgentId) {
        setActiveAgentId(decoded)
      }
    }
  }, [agents, agentParam])

  // Show dialog if no agent selected
  useEffect(() => {
    if (!loading && agents.length > 0 && !activeAgentId && !agentParam) {
      setShowAgentDialog(true)
    }
  }, [loading, agents, activeAgentId, agentParam])

  const activeAgent = agents.find(a => a.id === activeAgentId)
  const tmuxSessionName = activeAgent?.session?.tmuxSessionName
  const isOnline = activeAgent?.session?.status === 'online'

  // Display name helpers
  const displayName = activeAgent
    ? activeAgent.label || activeAgent.name || activeAgent.alias || 'Agent'
    : 'Agent'

  const isAvatarUrl = activeAgent?.avatar &&
    (activeAgent.avatar.startsWith('http://') || activeAgent.avatar.startsWith('https://') || activeAgent.avatar.startsWith('/'))

  const initials = displayName
    .split(/[\s-_]+/)
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Activity state machine (200ms interval)
  useEffect(() => {
    if (!isOnline) {
      setActivityState('offline')
      return
    }

    activityIntervalRef.current = setInterval(() => {
      const now = Date.now()
      const sinceOutput = now - lastOutputRef.current
      const sinceInput = now - lastInputRef.current

      if (sinceOutput < 500) {
        setActivityState('active')
      } else if (sinceInput < 5000 && sinceOutput > 1000) {
        setActivityState('thinking')
      } else {
        setActivityState('idle')
      }
    }, 200)

    // Start as idle when online
    setActivityState('idle')

    return () => {
      if (activityIntervalRef.current) {
        clearInterval(activityIntervalRef.current)
        activityIntervalRef.current = null
      }
    }
  }, [isOnline])

  // Initialize terminal + WebSocket
  useEffect(() => {
    if (!terminalRef.current || !tmuxSessionName) return

    let term: any
    let fitAddon: any
    let webglAddon: any
    let resizeObserver: ResizeObserver | null = null
    let inputDisposable: any
    let mounted = true

    const initTerminal = async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')

      if (!mounted || !terminalRef.current) return

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

      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())

      try {
        const { ClipboardAddon } = await import('@xterm/addon-clipboard')
        term.loadAddon(new ClipboardAddon())
      } catch (e) {
        console.warn('[Companion] ClipboardAddon not available:', e)
      }

      term.open(terminalRef.current!)
      fitAddon.fit()

      try {
        const { WebglAddon } = await import('@xterm/addon-webgl')
        webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          console.warn('[Companion] WebGL context lost, falling back to canvas')
          try { webglAddon.dispose() } catch { /* ignore */ }
          webglAddon = null
          if (term) term.refresh(0, term.rows - 1)
        })
        term.loadAddon(webglAddon)
      } catch (e) {
        console.log('[Companion] Using canvas renderer')
      }

      terminalInstanceRef.current = term
      fitAddonRef.current = fitAddon

      // ResizeObserver for container size changes
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
                console.warn('[Companion] Fit failed during resize:', e)
              }
            }
          }, 150)
        }
      })()

      resizeObserver = new ResizeObserver(() => debouncedFit())
      resizeObserver.observe(terminalRef.current!)

      // WebSocket connection
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      let wsUrl = `${protocol}//${window.location.host}/term?name=${encodeURIComponent(tmuxSessionName)}`
      if (activeAgent?.hostId && activeAgent.hostId !== 'local') {
        wsUrl += `&host=${encodeURIComponent(activeAgent.hostId)}`
      }
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows
        }))
      }

      ws.onmessage = (event) => {
        // Track output for activity state
        lastOutputRef.current = Date.now()

        try {
          const parsed = JSON.parse(event.data)
          if (parsed.type === 'history-complete') {
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
          // Raw terminal data
        }
        term.write(event.data)
      }

      ws.onerror = (error) => {
        console.error('[Companion] WebSocket error:', error)
      }

      ws.onclose = () => {}

      // Handle terminal input
      inputDisposable = term.onData((data: string) => {
        // Track input for activity state
        lastInputRef.current = Date.now()
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      })
    }

    initTerminal()

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

  // Update window title
  useEffect(() => {
    if (activeAgent) {
      document.title = `${displayName} - Companion - AI Maestro`
    }
  }, [activeAgent, displayName])

  const getAgentDisplayName = (agent: Agent) => {
    return agent.label || agent.name || agent.alias || agent.id
  }

  // Call duration timer
  const [callDuration, setCallDuration] = useState(0)
  useEffect(() => {
    if (!isOnline) {
      setCallDuration(0)
      return
    }
    const timer = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(timer)
  }, [isOnline])

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Open companion as a standalone floating window
  const openPopout = () => {
    const agentQuery = activeAgentId ? `agent=${encodeURIComponent(activeAgentId)}` : ''
    const url = `/companion?${agentQuery}&popup=1`
    const w = 380
    const h = 580
    const left = window.screen.width - w - 40
    const top = 60
    window.open(
      url,
      `companion-${activeAgentId || 'none'}`,
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
    )
  }

  // Popup mode: full-screen FaceTime experience (no terminal)
  if (isPopup) {
    return (
      <div className="fixed inset-0 bg-black overflow-hidden">
        {/* Full-bleed avatar */}
        <div className={`absolute inset-0 ${BORDER_GLOW[activityState]}`}>
          {isAvatarUrl ? (
            <img
              src={activeAgent!.avatar}
              alt={displayName}
              className={`absolute inset-0 w-full h-full object-cover ${
                activityState === 'offline' ? 'grayscale brightness-50' : ''
              }`}
            />
          ) : (
            <div className={`absolute inset-0 ${
              activityState === 'offline' ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900'
            }`}>
              <div className="absolute inset-0 flex items-center justify-center">
                {activeAgent?.avatar ? (
                  <span className="text-[8rem] select-none opacity-80">{activeAgent.avatar}</span>
                ) : (
                  <span className={`text-[6rem] font-bold select-none ${
                    activityState === 'offline' ? 'text-gray-700' : 'text-gray-600'
                  }`}>{initials}</span>
                )}
              </div>
            </div>
          )}

          {/* Vignette */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none" />

          {/* Activity glow */}
          <AnimatePresence>
            {activityState === 'active' && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.15, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ background: 'radial-gradient(circle at center, rgba(59,130,246,0.3) 0%, transparent 70%)' }}
              />
            )}
            {activityState === 'thinking' && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                style={{ background: 'radial-gradient(circle at center, rgba(245,158,11,0.2) 0%, transparent 70%)' }}
              />
            )}
          </AnimatePresence>

          {/* Speaking waveform */}
          <AnimatePresence>
            {tts.isSpeaking && (
              <motion.div
                className="absolute bottom-28 left-0 right-0 flex items-center justify-center gap-1 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 rounded-full bg-teal-400/80"
                    animate={{ height: [8, 24 + Math.random() * 16, 8] }}
                    transition={{ duration: 0.6 + i * 0.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Top bar - compact */}
          <div className="absolute top-0 left-0 right-0 p-3 z-20">
            <div className="flex flex-col items-center">
              <span className="text-white font-semibold text-sm drop-shadow-lg">{displayName}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isOnline
                    ? activityState === 'active' ? 'bg-blue-400 animate-pulse'
                    : activityState === 'thinking' ? 'bg-amber-400 animate-pulse'
                    : 'bg-green-400'
                    : 'bg-gray-500'
                }`} />
                <span className={`text-xs drop-shadow-lg ${
                  tts.isSpeaking ? 'text-teal-300'
                  : isOnline ? 'text-white/70' : 'text-white/40'
                }`}>
                  {tts.isSpeaking ? 'Speaking...' : isOnline ? formatDuration(callDuration) : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom controls - compact */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
            {/* Voice input */}
            <div className="mb-3 mx-auto max-w-xs">
              <CompanionInput agentId={activeAgentId} disabled={!isOnline} onMessageSent={handleMessageSent} onCommandMatched={handleCommandMatched} />
            </div>

            <div className="flex items-center justify-center gap-3">
              {/* Mute */}
              <button
                onClick={() => { if (tts.isSpeaking) tts.stop(); tts.toggleMute() }}
                disabled={!isOnline}
                className={`w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${
                  !isOnline ? 'bg-white/5 text-white/20 cursor-not-allowed'
                  : tts.isMuted ? 'bg-white/20 text-white/60 hover:bg-white/30'
                  : tts.isSpeaking ? 'bg-teal-500/30 text-teal-300 hover:bg-teal-500/40'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
                title={tts.isMuted ? 'Unmute' : 'Mute'}
              >
                {tts.isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className={`w-5 h-5 ${tts.isSpeaking ? 'animate-pulse' : ''}`} />}
              </button>

              {/* Repeat */}
              <button
                onClick={handleRepeat}
                disabled={!isOnline}
                className={`w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${
                  !isOnline ? 'bg-white/5 text-white/20 cursor-not-allowed'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
                title="Say it again"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Settings */}
              <button
                onClick={() => isOnline && setShowVoiceSettings(!showVoiceSettings)}
                disabled={!isOnline}
                className={`w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${
                  !isOnline ? 'bg-white/5 text-white/20 cursor-not-allowed'
                  : showVoiceSettings ? 'bg-blue-500/30 text-blue-300'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
                title="Voice settings"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* End call / Close popup */}
              <button
                onClick={() => {
                  if (window.opener) {
                    window.close()
                  } else {
                    window.history.back()
                  }
                }}
                className="w-12 h-12 rounded-full bg-red-500/80 backdrop-blur-md text-white flex items-center justify-center hover:bg-red-500 transition-all"
                title="End call"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>

            {/* Voice Settings in popup */}
            <AnimatePresence>
              {showVoiceSettings && isOnline && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 mx-auto max-w-xs"
                >
                  <FloatingVoiceSettings
                    config={tts.config}
                    availableVoices={tts.availableVoices}
                    onConfigChange={tts.setConfig}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Agent selection for popup */}
        {showAgentDialog && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center"
            onClick={() => setShowAgentDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gray-900/95 backdrop-blur-md rounded-2xl p-4 max-w-sm w-full mx-3 border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-white mb-3">Switch Agent</h2>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {onlineAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => { setActiveAgentId(agent.id); setShowAgentDialog(false); setCallDuration(0) }}
                    className={`w-full text-left px-3 py-2 rounded-xl transition-all text-sm ${
                      agent.id === activeAgentId
                        ? 'bg-green-500/20 text-white ring-1 ring-green-500/40'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center flex-shrink-0">
                        {agent.avatar && (agent.avatar.startsWith('http') || agent.avatar.startsWith('/')) ? (
                          <img src={agent.avatar} alt="" className="w-full h-full object-cover" />
                        ) : agent.avatar ? (
                          <span className="text-sm">{agent.avatar}</span>
                        ) : (
                          <span className="text-xs font-medium">{getAgentDisplayName(agent).slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <span className="font-medium">{getAgentDisplayName(agent)}</span>
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 ml-auto" />
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowAgentDialog(false)}
                className="mt-3 w-full px-3 py-2 bg-white/5 hover:bg-white/10 text-white/60 rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black flex">
      {/* ===== LEFT: FaceTime-style Avatar Panel ===== */}
      <div className={`hidden md:block w-[40%] relative overflow-hidden ${BORDER_GLOW[activityState]}`}>
        {/* Full-bleed avatar background */}
        {isAvatarUrl ? (
          <img
            src={activeAgent!.avatar}
            alt={displayName}
            className={`absolute inset-0 w-full h-full object-cover ${
              activityState === 'offline' ? 'grayscale brightness-50' : ''
            }`}
          />
        ) : (
          <div className={`absolute inset-0 ${
            activityState === 'offline' ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900'
          }`}>
            {/* Large centered emoji or initials for non-image avatars */}
            <div className="absolute inset-0 flex items-center justify-center">
              {activeAgent?.avatar ? (
                <span className="text-[10rem] select-none opacity-80">{activeAgent.avatar}</span>
              ) : (
                <span className={`text-[8rem] font-bold select-none ${
                  activityState === 'offline' ? 'text-gray-700' : 'text-gray-600'
                }`}>{initials}</span>
              )}
            </div>
          </div>
        )}

        {/* Vignette gradient overlays for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20 pointer-events-none" />

        {/* Activity state ambient glow */}
        <AnimatePresence>
          {activityState === 'active' && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.15, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ background: 'radial-gradient(circle at center, rgba(59,130,246,0.3) 0%, transparent 70%)' }}
            />
          )}
          {activityState === 'thinking' && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={{ background: 'radial-gradient(circle at center, rgba(245,158,11,0.2) 0%, transparent 70%)' }}
            />
          )}
        </AnimatePresence>

        {/* Speaking waveform indicator */}
        <AnimatePresence>
          {tts.isSpeaking && (
            <motion.div
              className="absolute bottom-32 left-0 right-0 flex items-center justify-center gap-1 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 rounded-full bg-teal-400/80"
                  animate={{ height: [8, 24 + Math.random() * 16, 8] }}
                  transition={{ duration: 0.6 + i * 0.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---- Floating Top Bar (FaceTime style) ---- */}
        <div className="absolute top-0 left-0 right-0 p-4 z-20">
          <div className="flex items-center justify-between">
            {/* Back button */}
            <Link
              href="/"
              className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            {/* Center: Name + status */}
            <div className="flex flex-col items-center">
              <span className="text-white font-semibold text-sm drop-shadow-lg">{displayName}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isOnline
                    ? activityState === 'active' ? 'bg-blue-400 animate-pulse'
                    : activityState === 'thinking' ? 'bg-amber-400 animate-pulse'
                    : 'bg-green-400'
                    : 'bg-gray-500'
                }`} />
                <AnimatePresence mode="wait">
                  <motion.span
                    key={tts.isSpeaking ? 'speaking' : activityState}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`text-xs drop-shadow-lg ${
                      tts.isSpeaking ? 'text-teal-300'
                      : isOnline ? 'text-white/70' : 'text-white/40'
                    }`}
                  >
                    {tts.isSpeaking ? 'Speaking...' : isOnline ? formatDuration(callDuration) : 'Offline'}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>

            {/* Right buttons */}
            <div className="flex items-center gap-2">
              {/* Pop-out button */}
              {!isPopup && activeAgentId && (
                <button
                  onClick={openPopout}
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-all"
                  title="Open in floating window"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
              {/* Switch agent */}
              <button
                onClick={() => setShowAgentDialog(true)}
                className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-all"
                title="Switch agent"
              >
                <UserCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ---- Floating Bottom Controls (FaceTime style) ---- */}
        <div className="absolute bottom-0 left-0 right-0 p-6 z-20">
          {/* Voice input */}
          <div className="mb-4 mx-auto max-w-sm">
            <CompanionInput agentId={activeAgentId} disabled={!isOnline} onMessageSent={handleMessageSent} onCommandMatched={handleCommandMatched} />
          </div>

          <div className="flex items-center justify-center gap-4">
            {/* Mute/Unmute */}
            <button
              onClick={() => {
                if (tts.isSpeaking) tts.stop()
                tts.toggleMute()
              }}
              disabled={!isOnline}
              className={`w-14 h-14 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${
                !isOnline
                  ? 'bg-white/5 text-white/20 cursor-not-allowed'
                  : tts.isMuted
                    ? 'bg-white/20 text-white/60 hover:bg-white/30'
                    : tts.isSpeaking
                      ? 'bg-teal-500/30 text-teal-300 hover:bg-teal-500/40'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
              title={tts.isMuted ? 'Unmute' : 'Mute'}
            >
              {tts.isMuted ? (
                <VolumeX className="w-6 h-6" />
              ) : (
                <Volume2 className={`w-6 h-6 ${tts.isSpeaking ? 'animate-pulse' : ''}`} />
              )}
            </button>

            {/* Repeat */}
            <button
              onClick={handleRepeat}
              disabled={!isOnline}
              className={`w-14 h-14 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${
                !isOnline
                  ? 'bg-white/5 text-white/20 cursor-not-allowed'
                  : 'bg-white/10 text-white/80 hover:bg-white/20 active:bg-white/30'
              }`}
              title="Say it again"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            {/* Voice Settings */}
            <button
              onClick={() => isOnline && setShowVoiceSettings(!showVoiceSettings)}
              disabled={!isOnline}
              className={`w-14 h-14 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${
                !isOnline
                  ? 'bg-white/5 text-white/20 cursor-not-allowed'
                  : showVoiceSettings
                    ? 'bg-blue-500/30 text-blue-300'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
              title="Voice settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* End Call / Switch Agent */}
            <button
              onClick={() => setShowAgentDialog(true)}
              className="w-14 h-14 rounded-full bg-red-500/80 backdrop-blur-md text-white flex items-center justify-center hover:bg-red-500 transition-all"
              title="Switch agent"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>

          {/* Voice Settings Panel (slides up from bottom controls) */}
          <AnimatePresence>
            {showVoiceSettings && isOnline && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2 }}
                className="mt-4 mx-auto max-w-xs"
              >
                <FloatingVoiceSettings
                  config={tts.config}
                  availableVoices={tts.availableVoices}
                  onConfigChange={tts.setConfig}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* No agent selected state */}
        {!activeAgentId && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-30">
            <div className="text-center">
              <UserCircle className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <p className="text-lg text-white/60 mb-4">No agent selected</p>
              <button
                onClick={() => setShowAgentDialog(true)}
                className="px-6 py-2.5 bg-green-500 hover:bg-green-400 text-white rounded-full font-medium transition-colors"
              >
                Start a Call
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== RIGHT: Terminal Panel ===== */}
      <div className="flex-1 relative overflow-hidden min-w-0 bg-[#1a1b26]">
        {/* Mobile header (shown only on small screens) */}
        <div className="md:hidden bg-black/80 backdrop-blur-md px-4 py-2 flex items-center justify-between z-20 relative">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-white/60 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            {activeAgent && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-800 flex items-center justify-center">
                  {isAvatarUrl ? (
                    <img src={activeAgent.avatar} alt={displayName} className="w-full h-full object-cover" />
                  ) : activeAgent.avatar ? (
                    <span className="text-sm">{activeAgent.avatar}</span>
                  ) : (
                    <span className="text-xs text-gray-400 font-medium">{initials}</span>
                  )}
                </div>
                <span className="text-sm text-white font-medium">{displayName}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-gray-500'}`} />
              </div>
            )}
          </div>
          <button
            onClick={() => setShowAgentDialog(true)}
            className="text-xs px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
          >
            Switch
          </button>
        </div>

        <div
          ref={terminalRef}
          className="absolute inset-0 md:inset-0"
          style={{ top: 'var(--mobile-header-h, 0)' }}
        />
        {!tmuxSessionName && activeAgentId && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26]">
            <div className="text-center text-gray-400">
              <WifiOff className="w-12 h-12 mx-auto mb-4 text-gray-600" />
              <p className="text-lg mb-2">Agent is offline</p>
              <p className="text-sm">Start the agent&apos;s tmux session to connect</p>
            </div>
          </div>
        )}
        {!activeAgentId && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b26]">
            <div className="text-center text-gray-400">
              <UserCircle className="w-12 h-12 mx-auto mb-4 text-gray-600" />
              <p className="text-lg mb-2">No agent selected</p>
              <button
                onClick={() => setShowAgentDialog(true)}
                className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors mt-2"
              >
                Select Agent
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== Agent Selection Dialog ===== */}
      {showAgentDialog && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={() => setShowAgentDialog(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-gray-900/95 backdrop-blur-md rounded-2xl p-6 max-w-md w-full mx-4 border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-white mb-4">Start a Call</h2>

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
                      setCallDuration(0)
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                      agent.id === activeAgentId
                        ? 'bg-green-500/20 text-white ring-1 ring-green-500/40'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center flex-shrink-0">
                          {agent.avatar && (agent.avatar.startsWith('http') || agent.avatar.startsWith('/')) ? (
                            <img src={agent.avatar} alt="" className="w-full h-full object-cover" />
                          ) : agent.avatar ? (
                            <span className="text-xl">{agent.avatar}</span>
                          ) : (
                            <span className="text-sm font-medium">
                              {getAgentDisplayName(agent).slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{getAgentDisplayName(agent)}</div>
                          {agent.taskDescription && (
                            <div className="text-sm opacity-60 truncate max-w-[220px]">{agent.taskDescription}</div>
                          )}
                        </div>
                      </div>
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowAgentDialog(false)}
              className="mt-4 w-full px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 rounded-xl transition-colors"
            >
              Cancel
            </button>
          </motion.div>
        </div>
      )}
    </div>
  )
}

/**
 * CompanionInput - Text input for voice-to-text (WhisperFlow) capture & send
 * WhisperFlow types into the focused textarea like a virtual keyboard.
 * Enter sends, Shift+Enter inserts newline.
 */
function CompanionInput({
  agentId,
  disabled,
  onMessageSent,
  onCommandMatched,
}: {
  agentId: string | null
  disabled: boolean
  onMessageSent?: (text: string) => void
  onCommandMatched?: (match: VoiceCommandMatch) => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus on mount so WhisperFlow has a target
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [disabled])

  const sendMessage = async () => {
    const trimmed = text.trim()
    if (!trimmed || !agentId || disabled || sending) return

    // Intercept voice commands before sending to agent
    const match = matchVoiceCommand(trimmed)
    if (match) {
      onCommandMatched?.(match)
      setText('')
      // Show feedback toast
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
      setFeedback(match.command.feedbackMessage)
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1500)
      textareaRef.current?.focus()
      return
    }

    setSending(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })
      if (res.ok) {
        setText('')
        // Notify voice subsystem of the user's message
        onMessageSent?.(trimmed)
        // Re-focus for next WhisperFlow input
        textareaRef.current?.focus()
      } else {
        const data = await res.json().catch(() => ({}))
        console.error('[CompanionInput] Send failed:', data.error || res.statusText)
      }
    } catch (err) {
      console.error('[CompanionInput] Send error:', err)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const hasText = text.trim().length > 0
  const isDisabled = disabled || !agentId

  return (
    <div className="relative">
      {/* Feedback toast */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute -top-8 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-teal-500/80 backdrop-blur-md text-white text-xs font-medium whitespace-nowrap z-10"
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 flex items-end gap-2 p-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          placeholder={isDisabled ? 'Agent offline' : 'Speak or type a message...'}
          rows={1}
          className="flex-1 bg-transparent text-white text-sm resize-none outline-none placeholder-white/30 px-2 py-1.5 max-h-24 scrollbar-thin disabled:text-white/20 disabled:placeholder-white/15"
          style={{ minHeight: '36px' }}
        />
        <button
          onClick={sendMessage}
          disabled={isDisabled || !hasText || sending}
          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
            hasText && !isDisabled && !sending
              ? 'bg-teal-500/80 text-white hover:bg-teal-500'
              : 'bg-white/5 text-white/20 cursor-not-allowed'
          }`}
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/**
 * Floating Voice Settings - Glassmorphism panel for voice configuration
 */
function FloatingVoiceSettings({
  config,
  availableVoices,
  onConfigChange,
}: {
  config: TTSConfig
  availableVoices: TTSVoice[]
  onConfigChange: (update: Partial<TTSConfig>) => void
}) {
  return (
    <div className="bg-black/60 backdrop-blur-xl rounded-2xl p-4 space-y-3 border border-white/10">
      {/* Voice selection */}
      <div>
        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">Voice</label>
        <select
          value={config.voiceId || ''}
          onChange={(e) => onConfigChange({ voiceId: e.target.value || null })}
          className="w-full bg-white/10 text-white/80 text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-blue-500/50 focus:outline-none"
        >
          <option value="">System Default</option>
          {availableVoices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      </div>

      {/* Volume */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-white/40 uppercase tracking-wider">Volume</label>
          <span className="text-[10px] text-white/40">{Math.round(config.volume * 100)}%</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.05"
          value={config.volume}
          onChange={(e) => onConfigChange({ volume: parseFloat(e.target.value) })}
          className="w-full accent-blue-500 h-1"
        />
      </div>

      {/* Speed */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-white/40 uppercase tracking-wider">Speed</label>
          <span className="text-[10px] text-white/40">{config.rate.toFixed(1)}x</span>
        </div>
        <input
          type="range" min="0.5" max="2" step="0.1"
          value={config.rate}
          onChange={(e) => onConfigChange({ rate: parseFloat(e.target.value) })}
          className="w-full accent-blue-500 h-1"
        />
      </div>

      {/* Provider toggle */}
      <div>
        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">Provider</label>
        <div className="flex gap-2">
          <button
            onClick={() => onConfigChange({ provider: 'web-speech', voiceId: null })}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              config.provider === 'web-speech'
                ? 'bg-blue-500/30 text-blue-300'
                : 'bg-white/5 text-white/40 hover:text-white/60'
            }`}
          >
            Browser
          </button>
          <button
            onClick={() => onConfigChange({ provider: 'openai', voiceId: null })}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              config.provider === 'openai'
                ? 'bg-blue-500/30 text-blue-300'
                : 'bg-white/5 text-white/40 hover:text-white/60'
            }`}
          >
            OpenAI
          </button>
          <button
            onClick={() => onConfigChange({ provider: 'elevenlabs', voiceId: null })}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              config.provider === 'elevenlabs'
                ? 'bg-blue-500/30 text-blue-300'
                : 'bg-white/5 text-white/40 hover:text-white/60'
            }`}
          >
            ElevenLabs
          </button>
        </div>
      </div>

      {/* OpenAI API key */}
      {config.provider === 'openai' && (
        <div>
          <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">API Key</label>
          <input
            type="password"
            value={config.openaiApiKey || ''}
            onChange={(e) => onConfigChange({ openaiApiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full bg-white/10 text-white/80 text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-blue-500/50 focus:outline-none placeholder-white/20"
          />
        </div>
      )}

      {/* ElevenLabs API key */}
      {config.provider === 'elevenlabs' && (
        <div>
          <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">API Key</label>
          <input
            type="password"
            value={config.elevenLabsApiKey || ''}
            onChange={(e) => onConfigChange({ elevenLabsApiKey: e.target.value })}
            placeholder="xi-..."
            className="w-full bg-white/10 text-white/80 text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-blue-500/50 focus:outline-none placeholder-white/20"
          />
        </div>
      )}
    </div>
  )
}

export default function CompanionPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <CompanionContent />
    </Suspense>
  )
}
