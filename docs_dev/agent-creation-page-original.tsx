'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import TerminalView from '@/components/TerminalView'
import TomlPreviewPanel from '@/components/TomlPreviewPanel'
import HaephestosLeftPanel from '@/components/HaephestosLeftPanel'
import { TerminalProvider } from '@/contexts/TerminalContext'
import { useDeviceType } from '@/hooks/useDeviceType'
import { agentToSession } from '@/lib/agent-utils'
import { Loader2, ArrowLeft, Hammer, FileText, Eye, ScrollText, Terminal, LogOut, Volume2, VolumeX } from 'lucide-react'
import type { Agent } from '@/types/agent'

const SESSION_NAME = '_aim-creation-helper'
const TOML_DRAFT_PATH = '~/agents/haephestos/toml/'

type PageState = 'creating' | 'ready' | 'error' | 'destroying'

interface SlottedFile {
  path: string
  filename: string
  slot?: 'codebase' | 'skills' | 'context'
}

// ---------------------------------------------------------------------------
// Color constants — Haephestos forge palette
// ---------------------------------------------------------------------------

const PAGE_BG = '#0c0808'
const BORDER_COLOR = '#2a1818'
// Thick outer frame — RED for Haephestos + terminal
// Brushed metallic gradient: subtle directional light from top-left
const FRAME_W = 8
const FRAME_RED_BASE = '#6a1a1a'
// Diagonal gradient with a slight midpoint highlight for brushed-metal feel
const FRAME_RED_GRAD = 'linear-gradient(135deg, #551212 0%, #6a1a1a 25%, #7a2222 50%, #6e1c1c 75%, #802828 100%)'
const FRAME_RED_GLOW = 'rgba(140,30,10,0.35)'
// Inner bevel: deeper shadow top-left, faint warm highlight bottom-right
const FRAME_RED_INSET = 'inset 3px 3px 8px rgba(0,0,0,0.4), inset -2px -2px 6px rgba(220,70,50,0.10)'
// Thick outer frame — YELLOW/AMBER for TOML preview
const FRAME_AMB_BASE = '#6a4a0a'
const FRAME_AMB_GRAD = 'linear-gradient(135deg, #543808 0%, #644809 25%, #745a12 50%, #684c0c 75%, #7e6018 100%)'
const FRAME_AMB_GLOW = 'rgba(160,100,10,0.3)'
const FRAME_AMB_INSET = 'inset 3px 3px 8px rgba(0,0,0,0.4), inset -2px -2px 6px rgba(220,160,40,0.10)'
// Tab label colors — Haephestos (gold on dark)
const TAB_GOLD_BG = '#1a1410'
const TAB_GOLD_TEXT = '#d4a530'
const TAB_GOLD_BORDER = '#5a3a10'
// Tab label colors — Agent Profile (amber on dark)
const TAB_AMBER_BG = '#1a1408'
const TAB_AMBER_TEXT = '#c89020'
const TAB_AMBER_BORDER = '#5a4010'
// Thick outer frame — STEEL/BLUE for Raw Materials
const FRAME_STEEL_BASE = '#1a2a3a'
const FRAME_STEEL_GRAD = 'linear-gradient(135deg, #142230 0%, #1a2a3a 25%, #223448 50%, #1e2e40 75%, #283a50 100%)'
const FRAME_STEEL_GLOW = 'rgba(30,80,140,0.25)'
const FRAME_STEEL_INSET = 'inset 3px 3px 8px rgba(0,0,0,0.4), inset -2px -2px 6px rgba(60,120,200,0.08)'
// Tab label colors — Raw Materials (mercury gold on dark steel)
const TAB_STEEL_BG = '#0e1218'
const TAB_STEEL_TEXT = '#a0906a'
const TAB_STEEL_BORDER = '#2a3848'
// Raw materials panel background — subtle electric blue undertone
const RAW_MAT_BG = '#0a0c12'

export default function AgentCreationPage() {
  const router = useRouter()
  const { deviceType } = useDeviceType()
  const isMobile = deviceType === 'phone'
  const isCompact = isMobile

  const [pageState, setPageState] = useState<PageState>('creating')
  const [error, setError] = useState<string | null>(null)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [tomlPath] = useState(TOML_DRAFT_PATH)
  const [files, setFiles] = useState<SlottedFile[]>([])
  const [mobilePanel, setMobilePanel] = useState<'none' | 'files' | 'toml'>('none')
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const destroyingRef = useRef(false)
  // Haephestos celebration animation — plays in-place of the avatar image
  const [playingAnimation, setPlayingAnimation] = useState(false)
  const [videoMuted, setVideoMuted] = useState(true)
  const animationVideoRef = useRef<HTMLVideoElement>(null)
  const pendingNavigateRef = useRef<string | null>(null)
  // Guard: once the creation signal is detected, stop polling
  const signalDetectedRef = useRef(false)
  // Wizard options — avatar and client
  const [avatarIndex, setAvatarIndex] = useState(() => Math.floor(Math.random() * 55))
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [personaName, setPersonaName] = useState('')
  const avatarUrl = `/avatars/robots_${avatarIndex.toString().padStart(2, '0')}.jpg`

  // Track window width for panel sizing
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Sync Raw Materials state to file so Haephestos can read it
  const rawMaterialsSyncRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (pageState !== 'ready') return
    clearTimeout(rawMaterialsSyncRef.current)
    rawMaterialsSyncRef.current = setTimeout(() => {
      fetch('/api/agents/creation-helper/raw-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaName,
          avatarUrl,
          avatarIndex,
          uploadedFiles: files.map(f => ({ path: f.path, filename: f.filename, slot: f.slot })),
        }),
      }).catch(() => {})
    }, 500)
    return () => clearTimeout(rawMaterialsSyncRef.current)
  }, [pageState, personaName, avatarUrl, avatarIndex, files])

  // Create the Haephestos session on mount
  useEffect(() => {
    let cancelled = false

    async function createSession() {
      try {
        // Kill any previous Haephestos session + remove from agent registry
        await fetch('/api/agents/creation-helper/session', { method: 'DELETE' }).catch(() => {})
        // Wipe the haephestos workspace folder
        await fetch('/api/agents/creation-helper/cleanup', { method: 'POST' })
        // Deploy the latest persona file — abort if it fails (Claude needs the persona)
        const personaRes = await fetch('/api/agents/creation-helper/ensure-persona', { method: 'POST' })
        if (!personaRes.ok) {
          const pData = await personaRes.json().catch(() => ({ reason: 'Unknown error' }))
          if (!cancelled) {
            setError(`Failed to deploy Haephestos persona: ${pData.reason || 'Unknown error'}`)
            setPageState('error')
          }
          return
        }

        const res = await fetch('/api/sessions/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: SESSION_NAME,
            program: 'claude-code',
            programArgs: '--agent haephestos-creation-helper',
            label: 'Haephestos',
            workingDirectory: '~/agents/haephestos',
          }),
        })

        if (cancelled) return

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Failed to create session' }))
          if (res.status === 409 || data.error?.includes('already exists')) {
            await fetchAgent()
            return
          }
          setError(data.error || 'Failed to create Haephestos session')
          setPageState('error')
          return
        }

        await fetchAgent()
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to create session')
        setPageState('error')
      }
    }

    async function fetchAgent() {
      for (let i = 0; i < 20; i++) {
        try {
          const res = await fetch('/api/agents')
          if (!res.ok) continue
          const data = await res.json()
          const agents: Agent[] = data.agents || []
          // Only match an agent with an ONLINE tmux session — skip stale offline duplicates
          const found = agents.find(
            (a: Agent) =>
              a.session?.status === 'online' &&
              (a.session?.tmuxSessionName === SESSION_NAME || a.name === SESSION_NAME)
          )
          if (found) {
            if (cancelled) return
            // Ensure tmuxSessionName is set for WebSocket connection
            if (found.session && !found.session.tmuxSessionName) {
              found.session.tmuxSessionName = SESSION_NAME
            }
            setAgent(found)
            setPageState('ready')
            return
          }
        } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 1000))
      }
      if (!cancelled) {
        setError('Haephestos session created but agent not found')
        setPageState('error')
      }
    }

    createSession()
    return () => { cancelled = true }
  }, [])

  // Destroy session + cleanup on unmount AND on tab close/navigation
  // React unmount cleanup is unreliable on tab close — use beforeunload + sendBeacon
  useEffect(() => {
    const killSession = () => {
      if (destroyingRef.current) return
      // sendBeacon is the ONLY reliable way to send requests during page unload
      // fetch() calls during beforeunload are cancelled by the browser
      // /kill is a dedicated POST endpoint that kills tmux + cleans up
      navigator.sendBeacon('/api/agents/creation-helper/kill')
    }

    // Fire on tab close, browser close, or navigation away
    window.addEventListener('beforeunload', killSession)
    // Also fire on page visibility change (tab switch on mobile can kill the page)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // On mobile, the page may be killed after this — send beacon as safety net
        killSession()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', killSession)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      // React unmount — also try fetch (works for in-app navigation)
      if (!destroyingRef.current) {
        fetch('/api/agents/creation-helper/session', { method: 'DELETE' }).catch(() => {})
        fetch('/api/agents/creation-helper/cleanup', { method: 'POST' }).catch(() => {})
      }
    }
  }, [])

  // Heartbeat: keep the server-side watchdog alive
  // If the browser stops sending heartbeats (tab close, crash, etc.),
  // the server kills the session after 2 minutes — preventing zombie sessions.
  useEffect(() => {
    const heartbeatInterval = setInterval(() => {
      fetch('/api/agents/creation-helper/heartbeat', { method: 'POST' }).catch(() => {})
    }, 30_000) // Every 30 seconds
    // Send first heartbeat immediately
    fetch('/api/agents/creation-helper/heartbeat', { method: 'POST' }).catch(() => {})
    return () => clearInterval(heartbeatInterval)
  }, [])

  // Poll for Haephestos creation-complete signal
  useEffect(() => {
    if (pageState !== 'ready') return
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const checkSignal = async () => {
      // Once detected, stop polling entirely
      if (signalDetectedRef.current) return
      try {
        const res = await fetch(
          `/api/agents/creation-helper/toml-preview?path=${encodeURIComponent('~/agents/haephestos/creation-signal.json')}`
        )
        if (!res.ok) return
        const data = await res.json()
        if (!data.exists || !data.content?.trim()) return

        const signal = JSON.parse(data.content)
        if (signal.status === 'complete' && signal.personaName) {
          if (cancelled) return
          // Guard: only trigger once
          signalDetectedRef.current = true
          if (intervalId) { clearInterval(intervalId); intervalId = null }
          destroyingRef.current = true

          // Store the navigation target for after the animation
          pendingNavigateRef.current = signal.agentId
            ? `/?agent=${encodeURIComponent(signal.agentId)}`
            : `/?session=${encodeURIComponent(signal.personaName)}`

          // Play the Haephestos celebration animation (single state — no spinner intermediate)
          setPlayingAnimation(true)

          // Delay cleanup until after animation
          setTimeout(() => {
            fetch('/api/agents/creation-helper/session', { method: 'DELETE' }).catch(() => {})
            fetch('/api/agents/creation-helper/cleanup', { method: 'POST' }).catch(() => {})
          }, 7000)
        }
      } catch {
        // Signal file doesn't exist yet or invalid JSON — that's fine
      }
    }

    intervalId = setInterval(checkSignal, 3000)
    return () => { cancelled = true; if (intervalId) clearInterval(intervalId) }
  }, [pageState, router])

  // Play celebration animation when agent creation completes, then navigate
  useEffect(() => {
    if (!playingAnimation) return
    const video = animationVideoRef.current
    if (!video) {
      // Fallback: if video element not mounted yet, navigate after a short delay
      const t = setTimeout(() => {
        if (pendingNavigateRef.current) router.push(pendingNavigateRef.current)
      }, 1000)
      return () => clearTimeout(t)
    }

    let navigated = false
    const navigate = () => {
      if (navigated) return
      navigated = true
      if (pendingNavigateRef.current) router.push(pendingNavigateRef.current)
    }
    video.addEventListener('ended', navigate)

    // Check if user previously unlocked audio on this origin
    const audioUnlocked = localStorage.getItem('haephestos-audio-unlocked') === '1'

    // Try unmuted first if previously unlocked, otherwise start muted
    video.muted = !audioUnlocked
    video.currentTime = 0
    video.play().then(() => {
      if (!video.muted) {
        // Unmuted play succeeded — remember for next time
        localStorage.setItem('haephestos-audio-unlocked', '1')
        setVideoMuted(false)
      } else {
        // Playing muted — try to unmute
        video.muted = false
        if (video.paused) {
          // Unmuting paused the video — fall back to muted
          video.muted = true
          video.play().catch(() => {})
        } else {
          // Unmute succeeded
          localStorage.setItem('haephestos-audio-unlocked', '1')
          setVideoMuted(false)
        }
      }
    }).catch(() => {
      // Unmuted autoplay blocked — retry muted
      video.muted = true
      video.play().catch(() => {
        // Even muted autoplay blocked (very rare) — navigate after a short visual pause
        setTimeout(navigate, 2000)
      })
    })

    // Safety: navigate after 10s even if video doesn't fire 'ended'
    const safety = setTimeout(navigate, 10000)
    return () => {
      video.removeEventListener('ended', navigate)
      clearTimeout(safety)
    }
  }, [playingAnimation, router])

  const handleCancel = useCallback(async () => {
    if (destroyingRef.current) return
    destroyingRef.current = true
    setPageState('destroying')
    try {
      await Promise.allSettled([
        fetch('/api/agents/creation-helper/session', { method: 'DELETE' }),
        fetch('/api/agents/creation-helper/cleanup', { method: 'POST' }),
      ])
    } catch { /* best-effort cleanup */ }
    router.push('/')
  }, [router])

  const handleRemoveFile = useCallback((path: string) => {
    setFiles(prev => prev.filter(f => f.path !== path))
  }, [])

  const handleFileUploaded = useCallback((path: string, filename: string) => {
    setFiles(prev => {
      if (prev.some(f => f.path === path)) return prev
      return [...prev, { path, filename }]
    })
  }, [])

  const handleSlotUpload = useCallback(async (slot: 'codebase' | 'skills' | 'context', file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/agents/creation-helper/file-picker', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) return
      const data = await res.json()
      setFiles(prev => {
        const filtered = prev.filter(f => f.slot !== slot)
        return [...filtered, { path: data.path, filename: data.filename, slot }]
      })
    } catch { /* ignore upload errors */ }
  }, [])

  const handleInjectFiles = useCallback(() => {
    const slotted = files.filter(f => f.slot)
    if (slotted.length === 0) return
    const lines = ['Here are the reference files for the agent I want to create:']
    const codebase = files.find(f => f.slot === 'codebase')
    const skills = files.find(f => f.slot === 'skills')
    const context = files.find(f => f.slot === 'context')
    if (codebase) lines.push(`- Codebase Reference: ${codebase.path}`)
    if (skills) lines.push(`- Skills Catalog: ${skills.path}`)
    if (context) lines.push(`- Additional Context: ${context.path}`)
    lines.push('', 'Please read these files and use them to help design the agent profile.')
    const message = lines.join('\n')
    window.dispatchEvent(new CustomEvent('haephestos-inject', { detail: { message } }))
  }, [files])

  // Loading state
  if (pageState === 'creating' || pageState === 'destroying') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: PAGE_BG }}>
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
        <p className="text-sm" style={{ color: '#9c8888' }}>
          {pageState === 'creating' ? 'Firing up the forge\u2026' : 'Exiting\u2026'}
        </p>
      </div>
    )
  }

  // Error state
  if (pageState === 'error') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-6" style={{ backgroundColor: PAGE_BG }}>
        <Hammer className="w-12 h-12 text-red-400" />
        <p className="text-sm text-red-400 text-center max-w-md">{error}</p>
        <div className="flex items-center gap-3">
          {agent && (
            <button
              onClick={() => { setError(null); setPageState('ready') }}
              className="px-6 py-2.5 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-500"
            >
              Back to Terminal
            </button>
          )}
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2.5 text-sm rounded-lg text-gray-200 hover:bg-white/5"
            style={{ border: `1px solid ${BORDER_COLOR}` }}
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  if (!agent) return null

  const session = agentToSession(agent)

  // Mobile layout
  if (isCompact) {
    return (
      <TerminalProvider>
      <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: PAGE_BG, height: '100dvh' }}>
        {/* Header */}
        <header
          className="flex-shrink-0 px-3 py-2 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${BORDER_COLOR}`, backgroundColor: '#120c0c' }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="p-2 -ml-1 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: '#9c8888' }}
              title="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Hammer className="w-5 h-5 text-amber-400" />
            <span className="text-base font-bold text-white">Haephestos</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMobilePanel(mobilePanel === 'files' ? 'none' : 'files')}
              className={`p-2.5 rounded-lg transition-colors ${
                mobilePanel === 'files' ? 'bg-amber-600 text-white' : 'hover:bg-white/5'
              }`}
              style={mobilePanel !== 'files' ? { color: '#9c8888' } : undefined}
              title="Attached files"
            >
              <FileText className="w-5 h-5" />
            </button>
            <button
              onClick={() => setMobilePanel(mobilePanel === 'toml' ? 'none' : 'toml')}
              className={`p-2.5 rounded-lg transition-colors ${
                mobilePanel === 'toml' ? 'bg-amber-600 text-white' : 'hover:bg-white/5'
              }`}
              style={mobilePanel !== 'toml' ? { color: '#9c8888' } : undefined}
              title="Profile preview"
            >
              <Eye className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Mobile panel slide-up */}
        {mobilePanel !== 'none' && (
          <div className="max-h-[45vh] overflow-y-auto" style={{ borderBottom: `1px solid ${BORDER_COLOR}`, backgroundColor: '#120c0c' }}>
            {mobilePanel === 'files' ? (
              <HaephestosLeftPanel
                files={files}
                onRemoveFile={handleRemoveFile}
                onFileUpload={handleSlotUpload}
                onInjectFiles={handleInjectFiles}
                onClose={() => setMobilePanel('none')}
                playingAnimation={playingAnimation}
                animationVideoRef={animationVideoRef}
                videoMuted={videoMuted}
                onToggleMute={() => {
                  const video = animationVideoRef.current
                  if (!video) return
                  if (videoMuted) {
                    video.muted = false
                    if (!video.paused) {
                      localStorage.setItem('haephestos-audio-unlocked', '1')
                      setVideoMuted(false)
                    }
                  } else {
                    video.muted = true
                    setVideoMuted(true)
                  }
                }}
              />
            ) : (
              <TomlPreviewPanel
                tomlPath={tomlPath}
                onClose={() => setMobilePanel('none')}
              />
            )}
          </div>
        )}

        {/* Terminal */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TerminalView
            session={session}
            isVisible={true}
            hideUploadButton={true}
            autoClearOnConnect={true}
            onFileUploaded={handleFileUploaded}
          />
        </main>

        {/* Action bar */}
        <footer
          className="flex-shrink-0 px-3 py-2.5 flex items-center justify-end gap-3"
          style={{ borderTop: `1px solid ${BORDER_COLOR}`, backgroundColor: '#120c0c' }}
        >
          <button
            onClick={handleCancel}
            className="px-5 py-2.5 text-sm rounded-lg text-gray-300 hover:bg-white/5 min-h-[44px] flex items-center gap-2"
            style={{ border: `1px solid ${BORDER_COLOR}` }}
          >
            <LogOut className="w-4 h-4" />
            Exit
          </button>
        </footer>
      </div>
      </TerminalProvider>
    )
  }

  // ==========================================================================
  // Desktop layout — TWO frames: yellow for TOML, red for Haephestos+terminal
  // ==========================================================================
  return (
    <TerminalProvider>
    <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: PAGE_BG }}>

      {/* ---- Top bar: back arrow ---- */}
      <div className="flex-shrink-0 flex items-center px-3 pt-2 pb-0" style={{ backgroundColor: PAGE_BG }}>
        <button
          onClick={handleCancel}
          className="p-2 rounded-lg hover:bg-white/5 transition-colors shrink-0"
          style={{ color: '#9c8888' }}
          title="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* ---- Two-frame content area ---- */}
      <div className="flex-1 flex gap-3 mx-3 mt-1 mb-0 min-h-0 overflow-hidden">

        {/* ============================================================ */}
        {/* LEFT: YELLOW/AMBER frame — Agent Profile (TOML preview)      */}
        {/* ============================================================ */}
        {rightPanelOpen && (
          <div className="flex flex-col" style={{ width: '30%', minWidth: 180, maxWidth: '30%' }}>
            {/* Tab label — amber, sits on top of frame border */}
            <div className="flex items-end">
              <div
                className="flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-extrabold uppercase tracking-widest"
                style={{
                  backgroundColor: TAB_AMBER_BG,
                  color: TAB_AMBER_TEXT,
                  border: `1px solid ${TAB_AMBER_BORDER}`,
                  borderBottom: 'none',
                  marginBottom: -1,
                  zIndex: 2,
                }}
              >
                <ScrollText className="w-4 h-4" style={{ color: TAB_AMBER_TEXT }} />
                <span>Agent Profile</span>
                <span className="font-medium text-[10px] tracking-normal" style={{ color: '#8a7030' }}>
                  *.agent.toml
                </span>
              </div>
            </div>

            {/* Amber frame body — subtle 3D gradient */}
            <div
              className="flex-1 overflow-hidden rounded-b-lg rounded-tr-lg"
              style={{
                border: `${FRAME_W}px solid ${FRAME_AMB_BASE}`,
                borderImageSlice: 1,
                borderImageSource: FRAME_AMB_GRAD,
                boxShadow: `0 0 20px ${FRAME_AMB_GLOW}, ${FRAME_AMB_INSET}`,
                backgroundColor: '#0e0a0a',
              }}
            >
              <TomlPreviewPanel
                tomlPath={tomlPath}
                onClose={() => setRightPanelOpen(false)}
              />
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* RIGHT: terminal (red) + avatar (red) + raw materials (steel) */}
        {/* ============================================================ */}
        <div className="flex-1 flex min-w-0 gap-0">
          {/* ── Column 2: Red-framed terminal ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tab label — gold, sits on top of frame border */}
            <div className="flex items-end">
              <div
                className="flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-extrabold uppercase tracking-widest"
                style={{
                  backgroundColor: TAB_GOLD_BG,
                  color: TAB_GOLD_TEXT,
                  border: `1px solid ${TAB_GOLD_BORDER}`,
                  borderBottom: 'none',
                  marginBottom: -1,
                  zIndex: 2,
                }}
              >
                <Hammer className="w-4 h-4" style={{ color: TAB_GOLD_TEXT }} />
                <span>Haephestos</span>
                <span className="font-medium text-[10px] tracking-normal" style={{ color: '#8a7040' }}>
                  Agent Creator
                </span>
              </div>
            </div>

            {/* Red frame #1 — terminal (flat solid red, no top-right rounding so
                the avatar frame's left border merges seamlessly with this frame) */}
            <div
              className="flex-1 overflow-hidden rounded-bl-lg"
              style={{
                border: `${FRAME_W}px solid ${FRAME_RED_BASE}`,
              }}
            >
              <div
                className="h-full flex flex-col min-h-0 min-w-0 overflow-hidden"
                style={{ backgroundColor: '#0a0808' }}
              >
                <TerminalView
                  session={session}
                  isVisible={true}
                  hideUploadButton={true}
                  autoClearOnConnect={true}
                  onFileUploaded={handleFileUploaded}
                />
              </div>
            </div>
          </div>

          {/* ── Column 3: Haephestos avatar (red) + Raw Materials (steel-framed) ── */}
          <aside
            className="shrink-0 flex flex-col overflow-hidden"
            style={{
              /* 43% of the sub-container ≈ 30% of total width
                 (sub-container is ~70% of total after left panel's 30%)
                 Terminal gets 57% of sub ≈ 40% of total → ratio is 30:40:30 */
              width: '43%',
              minWidth: 180,
              maxWidth: '43%',
              backgroundColor: PAGE_BG,
            }}
          >
            {/* Spacer — matches the tab label height in column 2 so red frames align */}
            <div className="flex items-end">
              <div className="px-4 py-1.5 text-xs" style={{ marginBottom: -1, visibility: 'hidden' }}>
                &nbsp;
              </div>
            </div>

            {/* Red frame — Haephestos avatar (flat solid red, merges with terminal frame) */}
            <div
              className="shrink-0 relative"
              style={{
                border: `${FRAME_W}px solid ${FRAME_RED_BASE}`,
                marginLeft: -FRAME_W,
                zIndex: 3,
              }}
            >
              {playingAnimation ? (
                <div className="relative">
                  <video
                    ref={animationVideoRef}
                    src="/avatars/haephestos-animation.mp4"
                    playsInline
                    muted
                    className="w-full h-auto"
                    style={{ display: 'block' }}
                  />
                  {/* Audio toggle — small icon overlaid on the video */}
                  <button
                    className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/80 hover:bg-black/70 transition-colors"
                    title={videoMuted ? 'Enable sound' : 'Mute'}
                    onClick={() => {
                      const video = animationVideoRef.current
                      if (!video) return
                      if (videoMuted) {
                        video.muted = false
                        if (!video.paused) {
                          localStorage.setItem('haephestos-audio-unlocked', '1')
                          setVideoMuted(false)
                        }
                      } else {
                        video.muted = true
                        setVideoMuted(true)
                      }
                    }}
                  >
                    {videoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/avatars/haephestos.jpg?v=20260318"
                    alt="Haephestos"
                    className="w-full h-auto"
                    style={{ display: 'block' }}
                  />
                </>
              )}
            </div>

            {/* Gap between Haephestos frame and Raw Materials */}
            <div style={{ height: 10 }} />

            {/* Raw Materials — steel-framed block with trapezium tab */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Trapezium tab — mercury/steel style */}
              <div className="flex items-end">
                <div
                  className="flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-extrabold uppercase tracking-widest"
                  style={{
                    backgroundColor: TAB_STEEL_BG,
                    color: TAB_STEEL_TEXT,
                    border: `1px solid ${TAB_STEEL_BORDER}`,
                    borderBottom: 'none',
                    marginBottom: -1,
                    zIndex: 2,
                  }}
                >
                  <span className="text-sm" style={{ color: '#c0a860' }}>☿</span>
                  <span>Raw Materials</span>
                </div>
              </div>

              {/* Steel frame body — subtle electric blue background, scrollable */}
              <div
                className="flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-b-lg rounded-tr-lg"
                style={{
                  border: `${FRAME_W}px solid ${FRAME_STEEL_BASE}`,
                  borderImageSlice: 1,
                  borderImageSource: FRAME_STEEL_GRAD,
                  boxShadow: `0 0 18px ${FRAME_STEEL_GLOW}, ${FRAME_STEEL_INSET}`,
                  backgroundColor: RAW_MAT_BG,
                }}
              >
                {/* Persona image field */}
                <div className="shrink-0 space-y-1.5 px-3 pt-3 pb-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#5c6878' }}>
                    Persona Image
                  </span>
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                      className="overflow-hidden transition-all hover:ring-2 hover:ring-amber-500/40"
                      title="Click to change avatar"
                      style={{ padding: 8, maxWidth: 196 }}
                    >
                      <div style={{
                        border: '1px solid rgba(255,255,255,0.25)',
                        lineHeight: 0,
                        padding: 4,
                        aspectRatio: '1 / 1',
                        overflow: 'hidden',
                      }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={avatarUrl}
                          alt="Agent avatar"
                          className="block"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    </button>
                    <span className="text-[10px] py-1" style={{ color: '#506070' }}>Click image to change</span>
                  </div>

                  {/* Avatar picker grid — shown inline when toggled */}
                  {showAvatarPicker && (
                    <div
                      className="grid grid-cols-5 gap-1 p-2 rounded-lg max-h-[160px] overflow-y-auto custom-scrollbar"
                      style={{ backgroundColor: '#080a10', border: `1px solid ${TAB_STEEL_BORDER}` }}
                    >
                      {Array.from({ length: 55 }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => { setAvatarIndex(i); setShowAvatarPicker(false) }}
                          className={`rounded-md overflow-hidden transition-all ${
                            i === avatarIndex ? 'ring-2 ring-amber-500 scale-105' : 'hover:ring-1 hover:ring-white/20'
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/avatars/robots_${i.toString().padStart(2, '0')}.jpg`}
                            alt={`Robot ${i}`}
                            className="w-full h-auto"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Persona Name field */}
                <div className="shrink-0 space-y-1.5 px-3 pt-2 pb-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#5c6878' }}>
                    Persona Name
                  </span>
                  <input
                    type="text"
                    value={personaName}
                    onChange={(e) => setPersonaName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="e.g. peter-bot"
                    className="w-full px-2 py-1.5 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                    style={{ backgroundColor: '#10141e', border: '1px solid #1e2a3e', color: '#c0d0e0' }}
                  />
                  <p className="text-[9px]" style={{ color: '#405060' }}>Lowercase, hyphens only. Becomes the agent folder name.</p>
                </div>

                {/* Divider */}
                <div style={{ borderBottom: `1px solid ${TAB_STEEL_BORDER}`, marginLeft: 12, marginRight: 12 }} />

                {/* Client (program) field */}
                <div className="shrink-0 flex items-center gap-2 px-3 py-2.5">
                  <span className="text-[10px] uppercase tracking-wider font-bold shrink-0" style={{ color: '#5c6878' }}>
                    Client
                  </span>
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px]"
                    style={{ backgroundColor: '#10141e', border: '1px solid #1e2a3e', color: '#8090b0' }}
                  >
                    <Terminal className="w-3 h-3" />
                    Claude Code
                  </div>
                </div>

                {/* Divider */}
                <div style={{ borderBottom: `1px solid ${TAB_STEEL_BORDER}`, marginLeft: 12, marginRight: 12 }} />

                {/* File upload section */}
                <div>
                  <HaephestosLeftPanel
                    files={files}
                    onRemoveFile={handleRemoveFile}
                    onFileUpload={handleSlotUpload}
                    onInjectFiles={handleInjectFiles}
                    panelWidth={280}
                    hideHeader={true}
                  />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ---- Bottom action bar — outside the frames ---- */}
      <footer
        className="flex-shrink-0 px-4 py-2.5 flex items-center justify-between mx-3"
        style={{ backgroundColor: PAGE_BG }}
      >
        <div className="flex items-center gap-2">
          {!rightPanelOpen && (
            <button
              onClick={() => setRightPanelOpen(true)}
              className="px-4 py-2 text-sm rounded-lg flex items-center gap-2 hover:bg-white/5"
              style={{ border: `1px solid ${BORDER_COLOR}`, color: '#9c8888' }}
            >
              <Eye className="w-4 h-4" />
              Show Preview
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCancel}
            className="px-6 py-2.5 text-sm rounded-lg text-gray-300 hover:bg-white/5 flex items-center gap-2"
            style={{ border: `1px solid ${BORDER_COLOR}` }}
          >
            <LogOut className="w-4 h-4" />
            Exit
          </button>
        </div>
      </footer>
    </div>
    </TerminalProvider>
  )
}
